// Walk-forward des prédicteurs « rythme » — et de leurs témoins.
//
// Pour chaque 회차 t des ROUNDS derniers, avec seulement l'historique avant
// t :
//
//   spectrum    cycle — pour chacun des 45 numéros, la série 0/1 de ses
//               sorties sur la fenêtre des N derniers tirages ; on garde les
//               TOP fréquences les plus énergiques, on prolonge leurs
//               sinusoïdes (amplitude + phase) d'un pas : score « dû
//               maintenant ». Les 7 meilleurs scores sont joués.
//   transition  après le numéro a, le numéro b suit-il ? T[a][b] compté sur
//               tout le passé ; score de b = Σ sur les 7 du dernier 회차 de
//               T[a][b] / sorties(a). Les 7 meilleurs.
//   sameline    la règle 같은 라인 : les 7 candidats de hotColdSameLine.
//   carry       répétition — les 7 numéros du 회차 précédent (이월).
//   random      7 numéros au sort (graine fixe).
//
// Puis on compte combien des 7 sortent vraiment à t (6 numéros + bonus).
// Le hasard donne 7 × 7 / 45 = 1.089 par 회차. Un prédicteur qui vaut
// quelque chose s'en écarte de plusieurs erreurs-types sur ROUNDS 회차.
//
//   node --experimental-sqlite tools/wf-spectrum.mjs [rounds=300] [window=512] [top=3]

import { DatabaseSync } from 'node:sqlite'
import { fromRows, NMAX, FULL } from '../src/core/draws.js'
import { allCells, nextCells } from '../src/core/tablelist.js'
import { hotColdSameLine } from '../src/core/hotcold.js'
import { mulberry32 } from '../src/core/generator.js'

const ROUNDS = Number(process.argv[2] ?? 300)
const N = Number(process.argv[3] ?? 512)
const TOP = Number(process.argv[4] ?? 3)

const db = new DatabaseSync('data/lotto.sqlite', { readOnly: true })
const rows = db.prepare('SELECT rang, date, n1, n2, n3, n4, n5, n6, bonus FROM draws ORDER BY rang').all()
  .map((r) => ({ rang: r.rang, date: r.date, numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6], bonus: r.bonus }))
db.close()
const all = fromRows(rows)
const mask = all.mask({ withBonus: true })
const W = NMAX + 1

// ────────────────────────────────────────────────────────────── spectrum

const M = Math.floor((N - 1) / 2)
const COS = Array.from({ length: M + 1 }, (_, k) => Float64Array.from({ length: N }, (_, i) => Math.cos(2 * Math.PI * k * i / N)))
const SIN = Array.from({ length: M + 1 }, (_, k) => Float64Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * k * i / N)))

// Score « dû maintenant » : la moyenne, plus les TOP sinusoïdes les plus
// énergiques prolongées au pas N (cos(2πk) = 1, sin(2πk) = 0 → 2·a_k / N).
function dueScore(x) {
  let mean = 0
  for (let i = 0; i < N; i++) mean += x[i]
  mean /= N
  const comps = []
  for (let k = 1; k <= M; k++) {
    let a = 0, b = 0
    const c = COS[k], s = SIN[k]
    for (let i = 0; i < N; i++) { const v = x[i] - mean; a += v * c[i]; b += v * s[i] }
    comps.push({ power: a * a + b * b, a })
  }
  comps.sort((p, q) => q.power - p.power)
  let score = mean
  for (let j = 0; j < TOP; j++) score += 2 * comps[j].a / N
  return score
}

function spectrumPick(t) {
  const scores = []
  const x = new Float64Array(N)
  for (let n = 1; n <= NMAX; n++) {
    for (let i = 0; i < N; i++) x[i] = mask[(t - N + i) * W + n]
    scores.push({ n, s: dueScore(x) })
  }
  scores.sort((p, q) => q.s - p.s)
  return scores.slice(0, FULL).map((o) => o.n)
}

// ──────────────────────────────────────────────────────────── transition

// T[a][b] = combien de fois b est sorti au 회차 suivant un 회차 où a est
// sorti, historique avant t seulement — cumulé au fil des 회차.
const T = new Int32Array(W * W)
const A = new Int32Array(W)
let tBuilt = 0
function transitionPick(t) {
  for (; tBuilt + 1 < t; tBuilt++) {
    const i = tBuilt
    for (let a = 1; a <= NMAX; a++) {
      if (!mask[i * W + a]) continue
      A[a]++
      for (let b = 1; b <= NMAX; b++) if (mask[(i + 1) * W + b]) T[a * W + b]++
    }
  }
  const last = all.fullAt(t - 1)
  const scores = []
  for (let b = 1; b <= NMAX; b++) {
    let s = 0
    for (const a of last) if (A[a]) s += T[a * W + b] / A[a]
    scores.push({ b, s })
  }
  scores.sort((p, q) => q.s - p.s)
  return scores.slice(0, FULL).map((o) => o.b)
}

// ───────────────────────────────────────────────────────────── témoins

function sameLinePick(t) {
  const prefix = all.slice(0, t)
  return hotColdSameLine(prefix, 'all', allCells(prefix), nextCells(prefix))
    .map((s) => s.candidate).filter(Boolean)
}

function carryPick(t) { return [...all.fullAt(t - 1)] }

const rng = mulberry32(0x5EED)
function randomPick() {
  const pool = Array.from({ length: NMAX }, (_, k) => k + 1)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  return pool.slice(0, FULL)
}

function hits(t, picks) {
  let h = 0
  for (const n of picks) if (mask[t * W + n]) h++
  return h
}

// ─────────────────────────────────────────────────────────────── boucle

const start = all.n - ROUNDS
if (start < N) throw new Error(`fenêtre ${N} + ${ROUNDS} 회차 > ${all.n} tirages`)

const tally = { spectrum: [], transition: [], sameline: [], carry: [], random: [] }
const t0 = Date.now()
for (let t = start; t < all.n; t++) {
  tally.spectrum.push(hits(t, spectrumPick(t)))
  tally.transition.push(hits(t, transitionPick(t)))
  tally.sameline.push(hits(t, sameLinePick(t)))
  tally.carry.push(hits(t, carryPick(t)))
  tally.random.push(hits(t, randomPick()))
}

// Le repère : 7 numéros fixés, 7 tirés sur 45 — hypergéométrique.
const EXP = FULL * FULL / NMAX
const VAR = FULL * (FULL / NMAX) * (1 - FULL / NMAX) * ((NMAX - FULL) / (NMAX - 1))
const SE = Math.sqrt(VAR / ROUNDS)

console.log(`walk-forward · ${ROUNDS}회차 (${all.rangs[start]}회 → ${all.rangs[all.n - 1]}회) · fenêtre ${N} · top ${TOP} · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`hasard : ${EXP.toFixed(3)} justes / 회차 · erreur-type sur ${ROUNDS} 회차 : ${SE.toFixed(3)}`)
console.log('')
console.log('stratégie    moyenne   lift    z      ≥3 justes')
for (const [name, list] of Object.entries(tally)) {
  const mean = list.reduce((a, b) => a + b, 0) / list.length
  const three = list.filter((v) => v >= 3).length
  console.log(`${name.padEnd(12)} ${mean.toFixed(3)}    ${(mean / EXP).toFixed(3)}  ${((mean - EXP) / SE).toFixed(2).padStart(5)}   ${three} (${(three / ROUNDS * 100).toFixed(1)}%)`)
}
