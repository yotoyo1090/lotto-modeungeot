// lot — la recette du samedi, en cinq lignes.
//
//   1. un seul 고정수 : le numéro du dernier tirage qui se répète le plus
//      (série de sorties consécutives la plus longue ; égalité → le plus
//      fréquent sur 20 회차, puis le plus petit)
//   2. 분배 최저 : sharing < 0.90 (la forme la moins vendue, 0.857)
//   3. filtres de forme de _1241.mjs : 총합 100–175, 홀짝 1–5, AC ≥ 7,
//      au moins trois 구간
//   4. couverture égale : les cinq numéros libres répartis au plus juste,
//      deux grilles n'ont jamais plus de trois numéros en commun (고정수 compris)
//   5. N grilles (défaut 90), écrites dans data/<rang>/lot<N>-<rang>.json
//
// Ce que ça ne fait pas : prédire. L'espérance est la même que pour N
// grilles tirées au hasard ; la recette règle seulement *avec qui* on partage
// (2) et *comment* les 0,8 numéro gagnant par grille se répartissent (4).
//
//   node --experimental-sqlite tools/lot.mjs [--n 90] [--seed 1] [--db …] [--dry]

import { mkdirSync, writeFileSync } from 'node:fs'
import { fromRows, NMAX, PICK, SECTIONS } from '../src/core/draws.js'
import { generate, toArrays } from '../src/core/generator.js'
import { sharingIndex } from '../src/core/sharing.js'
import { acValue } from '../src/core/metrics.js'
import { DEFAULT_PATH, getDraws, open } from '../src/node/db.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const N = Number(arg('--n', 90))
const SEED = Number(arg('--seed', 1))
const DRY = process.argv.includes('--dry')
// --exclude 1,5,7 : numéros interdits partout — dans le 고정수 comme dans
// les libres. --sample : taille de l'échantillon de generate (plus le
// vivier est étroit, plus il en faut). --tag : suffixe du nom du lot.
const EXCLUDE = new Set(String(arg('--exclude', '')).split(/[,\s]+/).filter(Boolean).map(Number))
const SAMPLE = Number(arg('--sample', 60000))
const TAG = arg('--tag', '')
// --sharing 0.90 (적게 팔린, pas de numéro ≤ 9) · 1.00 (평균 이하, les petits
// numéros reviennent, 1등 reste possible chaque semaine).
const SHARING_MAX = Number(arg('--sharing', 0.90))
// --common : numéros communs tolérés entre deux grilles (3 par défaut ; un
// vivier étroit peut en exiger 4 pour atteindre N).
const MAX_COMMON = Number(arg('--common', 3))

const db = open(arg('--db', DEFAULT_PATH), { readOnly: true })
const draws = fromRows(getDraws(db))
db.close()
const rang = draws.rangs[draws.n - 1] + 1

// ── 1. le 고정수 ──────────────────────────────────────────────────────────
const has = (i, n) => draws.numbersAt(i).includes(n)
const streak = (n) => { let s = 0; for (let i = draws.n - 1; i >= 0 && has(i, n); i--) s++; return s }
const recent = (n) => { let c = 0; for (let i = Math.max(0, draws.n - 20); i < draws.n; i++) if (has(i, n)) c++; return c }
const last = [...draws.numbersAt(draws.n - 1)].filter((n) => !EXCLUDE.has(n))
if (!last.length) throw new Error('tous les numéros du dernier 회차 sont exclus — pas de 고정수 possible')
const ranked = last.map((n) => ({ n, streak: streak(n), recent: recent(n) }))
  .sort((a, b) => b.streak - a.streak || b.recent - a.recent || a.n - b.n)
const FIX = ranked[0].n

// ── 2 + 3. le vivier : generate fait 분배 et les bornes, on ajoute 구간 ──
const sectionOf = (n) => SECTIONS.findIndex(([a, b]) => n >= a && n <= b)
const passes = (g) => {
  const total = g.reduce((a, b) => a + b, 0)
  const odd = g.filter((n) => n % 2).length
  return sharingIndex(g) < SHARING_MAX && total >= 100 && total <= 175 &&
    odd >= 1 && odd <= 5 && acValue(g) >= 7 && new Set(g.map(sectionOf)).size >= 3
}
let vivier
const pool = []
for (let n = 1; n <= NMAX; n++) if (n !== FIX && !EXCLUDE.has(n)) pool.push(n)
if (pool.length <= 24) {
  // Vivier étroit : on énumère toutes les C(pool, 5) plutôt que d'échantillonner
  // 45 numéros en espérant tomber dedans — mêmes filtres que generate.
  vivier = []
  const g = new Array(PICK)
  const rec = (start, depth) => {
    if (depth === PICK - 1) {
      const full = [...g.slice(0, PICK - 1), FIX].sort((a, b) => a - b)
      if (passes(full)) vivier.push(full)
      return
    }
    for (let i = start; i < pool.length; i++) { g[depth] = pool[i]; rec(i + 1, depth + 1) }
  }
  rec(0, 0)
} else {
  const result = generate(
    { include: [FIX], sharing: [0, SHARING_MAX], total: [100, 175], odd: [1, 5], ac: [7, 99] },
    { sample: SAMPLE, seed: SEED })
  vivier = toArrays(result)
    .filter((g) => new Set(g.map(sectionOf)).size >= 3)
    .filter((g) => !g.some((n) => EXCLUDE.has(n)))
}

// ── 4. couverture égale, glouton ─────────────────────────────────────────
// À chaque tour, la grille qui ajoute le moins aux numéros déjà les plus
// servis (somme des comptes de ses cinq libres, puis des paires), sans
// dépasser MAX_COMMON avec une grille déjà prise.
const count = new Int32Array(NMAX + 1)
const pair = new Int32Array((NMAX + 1) * (NMAX + 1))
const chosen = []
const free = (g) => g.filter((n) => n !== FIX)
const common = (a, b) => a.filter((n) => b.includes(n)).length
for (let k = 0; k < N && vivier.length; k++) {
  let best = -1; let bestScore = Infinity
  for (let i = 0; i < vivier.length; i++) {
    const g = vivier[i]; if (!g) continue
    const f = free(g)
    let score = 0
    for (const n of f) score += count[n] * 10
    for (let a = 0; a < f.length; a++) for (let b = a + 1; b < f.length; b++) score += pair[f[a] * (NMAX + 1) + f[b]]
    if (score >= bestScore) continue
    if (chosen.some((h) => common(g, h) > MAX_COMMON)) { vivier[i] = null; continue }
    best = i; bestScore = score
  }
  if (best < 0) break
  const g = vivier[best]; vivier[best] = null; chosen.push(g)
  const f = free(g)
  for (const n of f) count[n]++
  for (let a = 0; a < f.length; a++) for (let b = a + 1; b < f.length; b++) pair[f[a] * (NMAX + 1) + f[b]]++
}

// ── 5. le compte rendu et le fichier ─────────────────────────────────────
const used = []
for (let n = 1; n <= NMAX; n++) if (n !== FIX && count[n]) used.push(count[n])
const note = `lot.mjs · 고정수 ${FIX} (직전 ${rang - 1}회 번호 중 연속 출현 ${ranked[0].streak}회, 최근 20회 ${ranked[0].recent}회)` +
  ` · 분배 < ${SHARING_MAX} · 총합 100–175 · 홀짝 1–5 · AC ≥ 7 · 구간 ≥ 3` +
  ` · 자유수 균등 배분 (${Math.min(...used)}–${Math.max(...used)}회) · 공통 ≤ ${MAX_COMMON} · seed ${SEED}` +
  (EXCLUDE.size ? ` · 제외 ${[...EXCLUDE].sort((a, b) => a - b).join(' ')}` : '')

console.log(`=== ${rang}회 · ${chosen.length}조합 ===`)
console.log(`고정수 ${FIX}  ←  ${ranked.map((r) => `${r.n}(연속${r.streak}·최근${r.recent})`).join('  ')}`)
console.log(`vivier ${vivier.filter(Boolean).length + chosen.length} · 분배 ${sharingIndex(chosen[0]).toFixed(3)} 모두 · 자유수 ${used.length}개, ${Math.min(...used)}–${Math.max(...used)}회`)
for (const g of chosen) console.log(g.map((n) => String(n).padStart(2)).join(' '))

if (!DRY) {
  const dir = `data/${rang}`
  mkdirSync(dir, { recursive: true })
  const savedAt = new Date().toISOString()
  const out = chosen.map((numbers) => ({ lot: `${rang}-LOT${N}${TAG}`, target: rang, source: 'lot', note, numbers, savedAt }))
  const path = `${dir}/lot${N}${TAG}-${rang}.json`
  writeFileSync(path, JSON.stringify(out, null, 1))
  console.log(`\n→ ${path}`)
}
