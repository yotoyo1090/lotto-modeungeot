// 필터 조합 검정 — les cases du 자동조합, seules ou combinées, attrapent-elles
// les numéros gagnants mieux que le hasard ?
//
// Méthode, en deux moitiés :
//   · apprentissage (les anciens 회차) : pour chaque filtre on coche les
//     valeurs les plus fréquentes jusqu'à couvrir 70 / 80 / 90 / 95 % de ces
//     회차 — ce qu'on fait à l'écran en cochant les grosses cases ;
//   · test (les 회차 récents) : des tirages que le choix n'a jamais vus.
//
//   통과 (K) = part des 8 145 060 combinaisons qui passent, comptée par le
//              moteur. C'est aussi la chance qu'a un tirage au hasard de passer.
//   적중 (C) = part des 회차 dont les six numéros gagnants passent, vérifiée
//              par `matches()` — les mêmes règles que le moteur.
//   Gain = C / K. Le hasard donne 1.
//
// Le calcul complet demande quelques milliers de passages du moteur (une
// vingtaine de minutes) : il tourne dans `tools/bench-filters.js`, et l'écran
// lit le résultat figé.

import { HEAD, IS_COMPOSITE, IS_PRIME, LOW_MAX, TAIL } from './draws.js'
import { generate, matches, TOTAL_COMBINATIONS } from './generator.js'
import { acValue, MULTIPLES } from './metrics.js'
import { sharingIndex } from './sharing.js'

export const LEVELS = [0.7, 0.8, 0.9, 0.95]

const band = (s) => Math.floor(s / 10) * 10
const expand = (bands) => bands.flatMap((b) => Array.from({ length: 10 }, (_, k) => b + k))
const count = (six, keep) => six.filter(keep).length
const sumIf = (six, keep) => six.reduce((a, v) => a + (keep(v) ? v : 0), 0)
function mostSame(six, digit) {
  const seen = new Map()
  let best = 0
  for (const v of six) {
    const c = (seen.get(digit[v]) ?? 0) + 1
    seen.set(digit[v], c)
    if (c > best) best = c
  }
  return best
}

/**
 * Les filtres testés. `form` : le champ du formulaire 자동조합 qui porte la
 * même case (voir `formOf`). `put` : où le moteur range le critère quand ce
 * n'est pas sous `key`. `bands` : sommes cochées par tranches de 10.
 *
 * 이월 위치, 앞자리수 et 끝자리수 n'y sont pas : ils retirent des numéros
 * entiers, et « cocher les plus fréquents » n'a pas de sens pour eux.
 */
export const GROUPS = [
  { key: 'total', label: '총합', form: 'total', range: true, val: (s) => s.reduce((a, b) => a + b, 0) },
  { key: 'low', label: '저고', form: 'low', val: (s) => count(s, (v) => v <= LOW_MAX) },
  { key: 'odd', label: '홀짝', form: 'odd', val: (s) => count(s, (v) => v % 2 === 1) },
  { key: 'ac', label: 'AC값', form: 'ac', val: (s) => acValue(s) },
  { key: 'match', label: '이월 개수', form: 'carry', prev: true, val: (s, p) => count(s, (v) => p.includes(v)) },
  { key: 'headSum', label: '앞자리수합', form: 'headSum', val: (s) => s.reduce((a, v) => a + HEAD[v], 0) },
  { key: 'tailSum', label: '끝자리수합', form: 'tailSum', val: (s) => s.reduce((a, v) => a + TAIL[v], 0) },
  { key: 'primes', label: '소수 개수', form: 'primes', val: (s) => count(s, (v) => IS_PRIME[v] === 1) },
  { key: 'composites', label: '합성수 개수', form: 'composites', val: (s) => count(s, (v) => IS_COMPOSITE[v] === 1) },
  ...MULTIPLES.map((m) => ({
    key: `mult${m}`, label: `${m}배수 개수`, form: `mult${m}`, put: ['multiples', m],
    val: (s) => count(s, (v) => v % m === 0),
  })),
  { key: 'carriedSum', label: '이월합', form: 'carrySum', prev: true, bands: true, val: (s, p) => band(sumIf(s, (v) => p.includes(v))) },
  { key: 'primeSum', label: '소수합', form: 'primeSum', bands: true, val: (s) => band(sumIf(s, (v) => IS_PRIME[v] === 1)) },
  { key: 'compositeSum', label: '합성수합', form: 'compositeSum', bands: true, val: (s) => band(sumIf(s, (v) => IS_COMPOSITE[v] === 1)) },
  ...MULTIPLES.map((m) => ({
    key: `mult${m}Sum`, label: `${m}배수합`, form: `mult${m}Sum`, put: ['multSums', m], bands: true,
    val: (s) => band(sumIf(s, (v) => v % m === 0)),
  })),
  { key: 'headRepeat', label: '앞쌍', form: 'headRepeat', val: (s) => mostSame(s, HEAD) },
  { key: 'tailRepeat', label: '끝쌍', form: 'tailRepeat', val: (s) => mostSame(s, TAIL) },
  // 분배 : les deux seuils de l'écran, pas de valeurs à cocher.
  { key: 'sharing', label: '분배', form: 'sharing', real: true, val: (s) => sharingIndex(s) },
]

/** Les 회차 à plat : six numéros triés et les sept du 회차 précédent. */
export function rowsOf(draws) {
  const out = []
  for (let i = 0; i < draws.n; i++) {
    const six = [...draws.numbersAt(i)]
    const prev = i && draws.rangs[i - 1] === draws.rangs[i] - 1
      ? [...draws.numbersAt(i - 1), draws.bonus[i - 1]] : null
    out.push({ rang: draws.rangs[i], six, prev })
  }
  return out
}

/**
 * La sélection d'un filtre à un niveau, apprise sur `rows` :
 *   { range: [lo, hi] }  pour le 총합 (l'écran demande un début et une fin),
 *   { cut }              pour le 분배 (≤ 1.00 à 80 %, ≤ 0.90 à 70 %),
 *   { allow: [...] }     les valeurs les plus fréquentes jusqu'au niveau.
 * Rend null quand le filtre n'a pas de réglage à ce niveau.
 */
export function selection(group, level, rows) {
  if (group.real) {
    const cut = level >= 0.9 ? null : level >= 0.8 ? 1.0 : 0.9
    return cut === null ? null : { cut }
  }
  const vals = rows.map((r) => group.val(r.six, r.prev))
  if (group.range) {
    const s = [...vals].sort((a, b) => a - b)
    const lo = s[Math.floor(((1 - level) / 2) * (s.length - 1))]
    const hi = s[Math.ceil((1 - (1 - level) / 2) * (s.length - 1))]
    return { range: [lo, hi] }
  }
  const freq = new Map()
  for (const v of vals) freq.set(v, (freq.get(v) ?? 0) + 1)
  const order = [...freq].sort((a, b) => b[1] - a[1] || a[0] - b[0])
  const allow = []
  let got = 0
  for (const [v, c] of order) {
    allow.push(v)
    got += c
    if (got / vals.length >= level) break
  }
  return { allow: allow.sort((a, b) => a - b) }
}

/** [{ group, sel }] → les filtres du moteur, pour un 회차 précédent donné. */
export function toFilters(items, prev) {
  const f = {}
  for (const { group, sel } of items) {
    if (group.real) { f.sharing = [0, sel.cut]; continue }
    const value = sel.range ? [...sel.range] : { allow: group.bands ? expand(sel.allow) : [...sel.allow] }
    if (group.prev) f.reference = prev
    if (group.put) {
      f[group.put[0]] = { ...f[group.put[0]], [group.put[1]]: value }
    } else f[group.key] = value
  }
  return f
}

/**
 * Le formulaire du 자동조합 (le même que « 검색 조건 저장 ») qui coche ces
 * cases — pour le bouton 「검정 설정 불러오기」.
 */
export function formOf(items) {
  const form = {}
  for (const { group, sel } of items) {
    if (group.real) form.sharing = sel.cut <= 0.9 ? 'rare' : 'below'
    else if (group.range) { form.sumStart = sel.range[0]; form.sumEnd = sel.range[1] }
    else form[group.form] = [...sel.allow]
  }
  return form
}

/** « 총합 98–175 », « 이월합 0–9, 10–19 » — pour les tableaux. */
export function describe({ group, sel }) {
  if (group.real) return `≤ ${sel.cut.toFixed(2)}`
  if (group.range) return `${sel.range[0]}–${sel.range[1]}`
  return group.bands ? sel.allow.map((b) => `${b}–${b + 9}`).join(', ') : sel.allow.join(', ')
}

/**
 * Le banc complet.
 *
 *   singles   chaque filtre seul, à chaque niveau
 *   greedy    on ajoute un filtre à la fois — celui qui donne le plus grand
 *             gain sur l'APPRENTISSAGE — tant qu'il garde ≥ 5 % de ses 회차
 *   all       toutes les cases ensemble à ~80 % et ~90 % (+ leur formulaire)
 *   random    des combinaisons tirées au hasard (3 à 8 filtres)
 *
 * Pour 이월 개수 et 이월합, le 통과 dépend du 회차 précédent : on le moyenne
 * sur un 회차 tous les `prevEvery`.
 */
export function benchFilters(draws, {
  split = null, levels = LEVELS, steps = 10, random = 300, seed = 12345,
  prevEvery = 100, onProgress = () => {},
} = {}) {
  const rows = rowsOf(draws)
  const cut = split ?? rows[Math.floor(rows.length / 2) - 1].rang
  const train = rows.filter((r) => r.prev && r.rang <= cut)
  const test = rows.filter((r) => r.prev && r.rang > cut)
  const prevSample = rows.filter((r, i) => r.prev && i % prevEvery === 0).map((r) => r.prev)
  const N = TOTAL_COMBINATIONS

  const cache = new Map()
  const idOf = (items) => items.map((it) => it.group.key + JSON.stringify(it.sel)).sort().join('|')
  const kept = (items) => {
    const id = idOf(items)
    if (cache.has(id)) return cache.get(id)
    let k
    if (!items.some((it) => it.group.prev)) k = generate(toFilters(items, null), { limit: 0 }).kept / N
    else {
      let s = 0
      for (const p of prevSample) s += generate(toFilters(items, p), { limit: 0 }).kept
      k = s / prevSample.length / N
    }
    cache.set(id, k)
    return k
  }
  const cover = (items, set) => set.filter((r) => matches(r.six, toFilters(items, r.prev)) === null).length / set.length
  const measure = (items) => {
    const K = kept(items)
    const tr = cover(items, train)
    const te = cover(items, test)
    return { K, tr, te, z: (te - K) / Math.sqrt(K * (1 - K) / test.length) }
  }

  // 1. seuls
  const cands = []
  const singles = []
  for (const group of GROUPS) {
    for (const level of levels) {
      const sel = selection(group, level, train)
      if (!sel || cands.some((c) => c.group === group && JSON.stringify(c.sel) === JSON.stringify(sel))) continue
      cands.push({ group, sel, level })
      singles.push({ key: group.key, label: group.label, level, what: describe({ group, sel }), ...measure([{ group, sel }]) })
      onProgress('seul', group.label, level)
    }
  }

  // 2. glouton
  let chosen = []
  const greedy = []
  for (let step = 1; step <= steps; step++) {
    let best = null
    for (const c of cands) {
      if (chosen.some((x) => x.group === c.group)) continue
      const items = [...chosen, { group: c.group, sel: c.sel }]
      const tr = cover(items, train)
      if (tr < 0.05) continue
      const lift = tr / kept(items)
      if (!best || lift > best.lift) best = { items, lift }
    }
    if (!best) break
    chosen = best.items
    const last = chosen.at(-1)
    greedy.push({ step, label: last.group.label, what: describe(last), ...measure(chosen) })
    onProgress('glouton', step)
  }

  // 3. toutes les cases (sans 분배, qui n'a pas de « valeurs fréquentes »)
  const all = {}
  for (const level of [0.8, 0.9]) {
    const items = GROUPS.filter((g) => !g.real).map((group) => ({ group, sel: selection(group, level, train) }))
    all[level] = {
      level,
      rows: items.map((it) => ({ label: it.group.label, what: describe(it) })),
      form: formOf(items),
      kept: Math.round(kept(items) * N),
      ...measure(items),
    }
    onProgress('tous', level)
  }

  // 4. au hasard
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const randomRows = []
  for (let t = 0; t < random; t++) {
    const pool = [...cands]
    const size = 3 + Math.floor(rnd() * 6)
    const items = []
    while (items.length < size && pool.length) {
      const c = pool.splice(Math.floor(rnd() * pool.length), 1)[0]
      if (!items.some((x) => x.group === c.group)) items.push({ group: c.group, sel: c.sel })
    }
    const m = measure(items)
    randomRows.push([m.K, m.te, m.tr, m.z, items.length])
    if (t % 25 === 0) onProgress('hasard', t)
  }

  return {
    trainFrom: train[0].rang, trainTo: train.at(-1).rang,
    testFrom: test[0].rang, testTo: test.at(-1).rang,
    trainCount: train.length, testCount: test.length,
    combinations: N,
    singles, greedy, all, random: randomRows,
  }
}
