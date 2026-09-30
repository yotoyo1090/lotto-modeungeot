// 교차 검정 — croiser les sacs au lieu de les mesurer un par un.
//
// Quatre questions, une seule passe sur l'historique :
//
//   중복도   un numéro présent dans plusieurs sacs gagne-t-il plus souvent ?
//   교차     les intersections — simples, paires, triples
//   성격     la signature 9 bits d'un numéro, et le taux de gain par signature
//   제외     apprendre les mauvaises signatures sur la 1re moitié, exclure
//            sur la 2e — le seul essai qui compte
//
// Tout se recalcule : un 회차 de plus et les quatre tableaux bougent.

import { FULL, NMAX, SECTIONS } from './draws.js'
import { sandState } from './sand.js'

export const CROSS_HIT = FULL / NMAX

/** Les neuf sacs croisés, dans l'ordre des bits de la signature. */
export const CROSS_LISTS = [
  { key: 'place', label: '여집합 당첨위치' },
  { key: 'table', label: '여집합 테이블' },
  { key: 'friend', label: '여집합 친구' },
  { key: 'section', label: '구간 켜진' },
  { key: 'list', label: '여집합 리스트12' },
  { key: 'midle', label: '여집합 midle' },
  { key: 'window', label: '제외 출현' },
  { key: 'cold', label: '여집합 cold' },
  { key: 'dead', label: '여집합 dead' },
]
const L = CROSS_LISTS.length

/** Les neuf masques d'un 회차, chacun en Uint8Array indexé par numéro. */
export function crossMasks(state) {
  const out = Array.from({ length: L }, () => new Uint8Array(NMAX + 1))
  const set = (k, test) => {
    for (let n = 1; n <= NMAX; n++) if (test(n)) out[k][n] = 1
  }

  const places = new Set()
  for (let p = 0; p < FULL; p++) {
    const order = []
    for (let n = 1; n <= NMAX; n++) if (state.place[p][n]) order.push([n, state.place[p][n]])
    order.sort((a, b) => b[1] - a[1] || a[0] - b[0])
    for (let t = 0; t < 3 && t < order.length; t++) places.add(order[t][0])
  }
  set(0, (n) => !places.has(n))
  set(1, (n) => !(state.gap[n] >= 1 && state.gap[n] <= 3))

  const friends = new Set()
  for (const n of state.previous) {
    const order = []
    for (let m = 1; m <= NMAX; m++) if (m !== n) order.push([m, state.pair[n][m]])
    order.sort((a, b) => b[1] - a[1] || a[0] - b[0])
    for (let t = 0; t < 3; t++) friends.add(order[t][0])
  }
  set(2, (n) => !friends.has(n))

  const lit = new Uint8Array(NMAX + 1)
  for (const [lo, hi] of SECTIONS) {
    const cell = state.previous.filter((n) => n >= lo && n <= hi).sort((a, b) => a - b)
    const off = cell.length === 0 || (cell.length === 1 && cell[0] >= 10 && cell[0] <= 19)
    if (!off) for (let n = lo; n <= hi; n++) lit[n] = 1
  }
  set(3, (n) => lit[n] === 1)

  const even = []
  for (let n = 2; n <= NMAX; n += 2) even.push([n, state.freq[n]])
  even.sort((a, b) => b[1] - a[1] || a[0] - b[0])
  const top12 = new Set(even.slice(0, 12).map((x) => x[0]))
  set(4, (n) => !top12.has(n))

  set(5, (n) => !(state.gap[n] >= 6 && state.gap[n] <= 10))
  set(6, (n) => state.window10[n] > 0)
  set(7, (n) => !(state.gap[n] >= 11 && state.gap[n] <= 19))
  set(8, (n) => state.gap[n] < 20)
  return out
}

/** La signature d'un numéro : neuf bits, un par sac. */
export const crossSignature = (masks, n) => {
  let v = 0
  for (let k = 0; k < L; k++) if (masks[k][n]) v |= 1 << k
  return v
}

export const signatureName = (v) =>
  CROSS_LISTS.filter((_, k) => (v >> k) & 1).map((c) => c.label.replace('여집합 ', '')).join('+') || '(없음)'

/** Les 129 combinaisons : 9 simples, 36 paires, 84 triples. */
export function crossCombos() {
  const out = []
  for (let a = 0; a < L; a++) out.push([a])
  for (let a = 0; a < L; a++) for (let b = a + 1; b < L; b++) out.push([a, b])
  for (let a = 0; a < L; a++) {
    for (let b = a + 1; b < L; b++) {
      for (let c = b + 1; c < L; c++) out.push([a, b, c])
    }
  }
  return out
}

/**
 * Le plafond du bruit : en mesurant K choses **sans qu'il se passe rien**,
 * le plus grand |z| vaut à peu près ceci. C'est la barre à franchir.
 */
export function noiseCeiling(k) {
  if (k < 2) return 2
  const l = Math.sqrt(2 * Math.log(k))
  return l - (Math.log(Math.log(k)) + Math.log(4 * Math.PI)) / (2 * l)
}

const zOf = (hit, cells) => {
  const expected = cells * CROSS_HIT
  const variance = cells * CROSS_HIT * (1 - CROSS_HIT)
  return variance ? (hit - expected) / Math.sqrt(variance) : 0
}

/**
 * Une passe, quatre tableaux.
 *
 * `learnUntil` coupe l'historique en deux : les signatures sont notées sur la
 * première moitié seulement, puis l'exclusion est jouée sur la seconde. C'est
 * ce qui distingue une règle d'une mémorisation.
 */
export function crossReport(draws, { from = 401 } = {}) {
  const start = Math.max(1, draws.indexOf(from))
  const mid = Math.floor((start + draws.n - 1) / 2)

  const overlap = Array.from({ length: L + 1 }, () => ({ cells: 0, hit: 0 }))
  const combos = crossCombos()
  const acc = combos.map(() => ({ size: 0, hit: 0, expected: 0, variance: 0, used: 0 }))
  const signs = new Map()
  const learn = new Map()
  const cache = []

  let groupSum = 0
  let groupCount = 0
  let winnerGroupSum = 0
  let winnerCount = 0

  for (let i = start; i < draws.n; i++) {
    const state = sandState(draws, i)
    const masks = crossMasks(state)
    const won = new Uint8Array(NMAX + 1)
    for (const n of draws.fullAt(i)) won[n] = 1

    const sig = new Int32Array(NMAX + 1)
    const groupSize = new Map()
    for (let n = 1; n <= NMAX; n++) {
      sig[n] = crossSignature(masks, n)
      groupSize.set(sig[n], (groupSize.get(sig[n]) ?? 0) + 1)
      let deg = 0
      for (let k = 0; k < L; k++) if (masks[k][n]) deg++
      overlap[deg].cells++
      if (won[n]) overlap[deg].hit++
    }
    for (let n = 1; n <= NMAX; n++) {
      const size = groupSize.get(sig[n])
      groupSum += size
      groupCount++
      if (won[n]) { winnerGroupSum += size; winnerCount++ }
      const bucket = signs.get(sig[n]) ?? { cells: 0, hit: 0 }
      bucket.cells++
      if (won[n]) bucket.hit++
      signs.set(sig[n], bucket)
      if (i <= mid) {
        const t = learn.get(sig[n]) ?? { cells: 0, hit: 0 }
        t.cells++
        if (won[n]) t.hit++
        learn.set(sig[n], t)
      }
    }
    cache.push({ rang: draws.rangs[i], sig, won, half: i <= mid ? 0 : 1 })

    combos.forEach((cb, c) => {
      let size = 0
      let hit = 0
      for (let n = 1; n <= NMAX; n++) {
        let all = true
        for (const k of cb) if (!masks[k][n]) { all = false; break }
        if (!all) continue
        size++
        if (won[n]) hit++
      }
      if (size === 0 || size === NMAX) return
      const a = acc[c]
      a.used++
      a.size += size
      a.hit += hit
      a.expected += FULL * size / NMAX
      a.variance += size * CROSS_HIT * (1 - CROSS_HIT) * ((NMAX - size) / (NMAX - 1))
    })
  }
  return assemble({ draws, start, mid, overlap, combos, acc, signs, learn, cache,
                    groupSum, groupCount, winnerGroupSum, winnerCount })
}

function assemble(d) {
  const { draws, mid, overlap, combos, acc, signs, learn, cache } = d

  const overlapRows = overlap
    .map((o, degree) => ({ degree, ...o }))
    .filter((o) => o.cells > 0)
    .map((o) => ({
      ...o,
      rate: o.hit / o.cells,
      ratio: o.hit / (o.cells * CROSS_HIT),
      z: zOf(o.hit, o.cells),
    }))

  const crossRows = combos.map((cb, c) => {
    const a = acc[c]
    return {
      key: cb.join('-'),
      label: cb.map((k) => CROSS_LISTS[k].label).join(' ∩ '),
      degree: cb.length,
      size: a.used ? a.size / a.used : 0,
      ratio: a.expected ? a.hit / a.expected : 0,
      z: a.variance ? (a.hit - a.expected) / Math.sqrt(a.variance) : 0,
    }
  }).filter((r) => Number.isFinite(r.z)).sort((a, b) => b.z - a.z)

  const signRows = [...signs.entries()]
    .map(([v, t]) => ({
      value: v,
      name: signatureName(v),
      cells: t.cells,
      hit: t.hit,
      rate: t.hit / t.cells,
      ratio: t.hit / (t.cells * CROSS_HIT),
      z: zOf(t.hit, t.cells),
    }))
    .filter((r) => r.cells >= 200)
    .sort((a, b) => b.z - a.z)

  // La signature la plus haute, rejouée moitié par moitié.
  const best = signRows[0]
  const halves = best ? splitCheck(cache, best.value) : null

  // Les « mauvaises » signatures apprises sur la première moitié.
  const bad = new Set()
  for (const [v, t] of learn) {
    if (t.cells >= 50 && t.hit / (t.cells * CROSS_HIT) < 1) bad.add(v)
  }
  const eliminate = ['전반 — 규칙을 고른 곳', '후반 — 처음 보는 곳']
    .map((label, half) => killRun(cache, bad, (p) => p.half === half, label))
  eliminate.push(killRun(cache, bad, (p, i, all) => i >= all.length - 10, '최근 10회차'))

  // Le 회차 **à venir** : l'état se calcule après le dernier tirage connu,
  // pas au dernier. Sinon la liste proposée serait celle d'hier.
  const lastPoint = cache.at(-1)
  const nextRang = draws.rangs[draws.n - 1] + 1
  const nextMasks = crossMasks(sandState(draws, draws.n, nextRang))
  const killed = []
  const kept = []
  for (let n = 1; n <= NMAX; n++) {
    (bad.has(crossSignature(nextMasks, n)) ? killed : kept).push(n)
  }

  return {
    from: cache[0]?.rang,
    to: lastPoint?.rang,
    used: cache.length,
    midRang: draws.rangs[mid],
    overlap: overlapRows,
    cross: crossRows,
    crossCeiling: noiseCeiling(crossRows.length),
    signatures: signRows,
    signCeiling: noiseCeiling(signRows.length),
    signCount: signs.size,
    best,
    halves,
    groupMean: d.groupSum / d.groupCount,
    winnerGroupMean: d.winnerGroupSum / d.winnerCount,
    badCount: bad.size,
    eliminate,
    nextRang,
    killed,
    kept,
  }
}

/** Une signature, mesurée séparément sur chaque moitié. */
function splitCheck(cache, value) {
  const part = (test, label) => {
    let cells = 0
    let hit = 0
    cache.forEach((p, i) => {
      if (!test(p, i)) return
      for (let n = 1; n <= NMAX; n++) {
        if (p.sig[n] !== value) continue
        cells++
        if (p.won[n]) hit++
      }
    })
    return { label, cells, hit, rate: hit / cells, ratio: hit / (cells * CROSS_HIT), z: zOf(hit, cells) }
  }
  return [
    part((p) => p.half === 0, '전반'),
    part((p) => p.half === 1, '후반'),
    part((p, i) => i >= cache.length - 200, '최근 200회차'),
  ]
}

/**
 * Exclure selon un jeu de signatures, et compter ce que ça coûte.
 *
 * Un témoin accompagne chaque ligne : **autant de numéros, tirés au sort**.
 * Sans lui, un 5.40 n'aurait aucun repère — c'est la colonne qui a montré,
 * dans le rapport, que la règle apprise ne battait pas le chapeau.
 */
function killRun(cache, bad, test, label, seed = 1234) {
  let removed = 0
  let lost = 0
  let clean = 0
  let used = 0
  let wRemoved = 0
  let wLost = 0
  const rnd = seeded(seed)
  const detail = []
  cache.forEach((p, i, all) => {
    if (!test(p, i, all)) return
    const list = []
    let hit = 0
    for (let n = 1; n <= NMAX; n++) {
      if (!bad.has(p.sig[n])) continue
      list.push(n)
      if (p.won[n]) hit++
    }
    used++
    removed += list.length
    lost += hit
    if (hit === 0) clean++
    detail.push({ rang: p.rang, size: list.length, hit,
                  lost: list.filter((n) => p.won[n]) })
    // Le témoin : même nombre de numéros, aucun écran lu.
    const pool = new Set()
    while (pool.size < list.length) pool.add(1 + Math.floor(rnd() * NMAX))
    let wHit = 0
    for (const n of pool) if (p.won[n]) wHit++
    wRemoved += pool.size
    wLost += wHit
  })
  return {
    label,
    used,
    removed: removed / used,
    lost: lost / used,
    losers: (removed - lost) / used,
    value: lost ? (removed - lost) / lost : Infinity,
    witnessValue: wLost ? (wRemoved - wLost) / wLost : Infinity,
    cleanRate: clean / used,
    detail,
  }
}

function seeded(seed) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
