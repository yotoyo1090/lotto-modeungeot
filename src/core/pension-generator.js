// Le générateur de séquences 연금복권 720+.
//
// L'espace est ici de 10⁶ séquences de six chiffres, et non 8,1 millions de
// combinaisons : mille fois plus petit à parcourir, mais avec deux
// différences structurelles qui interdisent de réutiliser le générateur
// 6/45 tel quel.
//
//   * Les chiffres **se répètent**. `총합`, `AC값`, `이월` comptent donc les
//     répétitions, et deux critères propres au produit apparaissent :
//     combien de chiffres appartiennent à une valeur répétée (`repeats`), et
//     combien de valeurs distinctes la séquence contient (`distinct`).
//   * **La position porte du sens.** Le filtre le plus utile du produit est
//     « quels chiffres j'accepte à quelle position » — `positions`. C'est
//     aussi le plus efficace : n'autoriser que trois chiffres par position
//     ramène l'espace de 10⁶ à 729.
//
// Le 조 est une dimension indépendante : il ne contraint aucun chiffre et
// aucun chiffre ne le contraint. On ne le multiplie donc pas dans le
// parcours — on filtre la liste des 조 autorisés, et `tickets` dit combien
// de billets réels cela représente.
//
// Le seuil 저/고 est `LOW_MAX = 4`, celui de `pension.js` : l'ancien code
// comptait avec `<= 3` mais listait avec `<= 4`, et se contredisait dans 105
// tirages sur 225.

import {
  BASE, COMPOSITES, DIGITS, GROUPS, LOW_MAX, MULTIPLES, PRIMES,
} from './pension.js'
import { mulberry32 } from './generator.js'

/** 10⁶ — le nombre de séquences de six chiffres. */
export const TOTAL_SEQUENCES = BASE ** DIGITS

export const CRITERIA = [
  'total', 'low', 'odd', 'multiples', 'primes', 'composites',
  'distinct', 'repeats', 'match', 'ac',
]

export const LABELS = {
  positions: '자리별 숫자',
  exclude: '제외수',
  include: '고정수',
  groups: '조',
  total: '총합',
  low: '저고',
  odd: '홀짝',
  primes: '소수',
  composites: '합성수',
  distinct: '서로 다른 숫자',
  repeats: '중복 숫자',
  match: '대비',
  ac: 'AC값',
  count: '개수 조건',
}

const IS_PRIME = membership(PRIMES)
const IS_COMPOSITE = membership(COMPOSITES)

function membership(values) {
  const table = new Uint8Array(BASE)
  for (const v of values) table[v] = 1
  return table
}

const S_SUM = 0
const S_LOW = 1
const S_ODD = 2
const S_PRIME = 3
const S_COMP = 4
const S_MATCH = 5
const S_MULT = 6         // 4 emplacements
const S_SEEN = 10        // les chiffres déjà placés, en bits
const ACC = 11

/**
 * Cherche les séquences 연금복권 qui satisfont tous les critères.
 *
 * @returns {object} `{ grids, count, kept, tickets, candidates, groups,
 *                      rejected, elapsedMs }` — `grids` est de pas 7 :
 *                    le 조 puis les six chiffres.
 */
export function generate(filters = {}, options = {}) {
  const started = now()
  const { limit = 1000, sample = null, seed = 0x5EED } = options

  const spec = normalize(filters)
  const allowed = spec.positions          // 6 tableaux de chiffres permis
  const groups = spec.groups

  const rejected = new Map()
  for (const key of CRITERIA) rejected.set(key, 0)
  rejected.set('count', 0)
  rejected.set('include', 0)

  let candidates = 1
  for (const digits of allowed) candidates *= digits.length

  const random = mulberry32(seed >>> 0)
  const finish = (grids, count, kept) => ({
    grids, count, kept,
    tickets: kept * groups.length,
    candidates, groups,
    rejected: report(rejected),
    elapsedMs: now() - started,
  })
  if (candidates === 0 || groups.length === 0) {
    return finish(new Int8Array(0), 0, 0)
  }

  // Les chiffres encore plaçables à partir de la position p, en bits : c'est
  // ce qui permet d'abandonner une branche dès qu'un 고정수 n'a plus aucune
  // position où atterrir.
  const stillPlaceable = new Int32Array(DIGITS + 1)
  for (let p = DIGITS - 1; p >= 0; p--) {
    let bits = stillPlaceable[p + 1]
    for (const d of allowed[p]) bits |= 1 << d
    stillPlaceable[p] = bits
  }
  let requiredBits = 0
  for (let d = 0; d < BASE; d++) if (spec.required[d]) requiredBits |= 1 << d
  if ((requiredBits & ~stillPlaceable[0]) !== 0) {
    return finish(new Int8Array(0), 0, 0)   // un 고정수 n'est nulle part permis
  }

  const acc = new Int32Array((DIGITS + 1) * ACC)
  const chosen = new Int8Array(DIGITS)
  const tally = new Int8Array(BASE)

  const wanted = sample ?? limit
  const capacity = wanted === null || wanted === Infinity
    ? Math.min(candidates, TOTAL_SEQUENCES) : wanted
  const store = new Int8Array(Math.max(0, capacity) * (DIGITS + 1))
  let kept = 0

  const emit = () => {
    const write = (slot) => {
      const at = slot * (DIGITS + 1)
      // Le 조 est indépendant des chiffres : au hasard parmi ceux permis
      // quand on échantillonne, le premier sinon — pour rester reproductible.
      store[at] = sample === null ? groups[0]
        : groups[Math.floor(random() * groups.length)]
      store.set(chosen, at + 1)
    }
    if (kept < capacity) write(kept)
    else if (sample !== null) {
      const slot = Math.floor(random() * (kept + 1))
      if (slot < capacity) write(slot)
    }
    kept++
  }

  const { total, low, odd, primes, composites, distinct, repeats, match, ac } = spec

  const activeMult = []
  spec.multiples.forEach((b, m) => { if (b) activeMult.push([m, b[0], b[1]]) })

  const counters = []
  const counter = (offset, b) => { if (b) counters.push([offset, b[0], b[1]]) }
  counter(S_LOW, low)
  counter(S_ODD, odd)
  counter(S_PRIME, primes)
  counter(S_COMP, composites)
  counter(S_MATCH, match)
  for (const [m, lo, hi] of activeMult) counter(S_MULT + m, [lo, hi])
  const counted = counters.length > 0

  // Sommes minimale et maximale encore atteignables à partir de la position p.
  const minRest = new Int32Array(DIGITS + 1)
  const maxRest = new Int32Array(DIGITS + 1)
  for (let p = DIGITS - 1; p >= 0; p--) {
    minRest[p] = minRest[p + 1] + Math.min(...allowed[p])
    maxRest[p] = maxRest[p + 1] + Math.max(...allowed[p])
  }

  function walk(position) {
    const base = position * ACC
    const next = base + ACC
    const rest = DIGITS - position - 1
    const column = allowed[position]

    for (let k = 0; k < column.length; k++) {
      const value = column[k]

      const sum = acc[base + S_SUM] + value
      if (total !== null &&
          (sum + maxRest[position + 1] < total[0] ||
           sum + minRest[position + 1] > total[1])) {
        rejected.set('total', rejected.get('total') + countBelow(position + 1))
        continue
      }

      chosen[position] = value
      acc[next + S_SUM] = sum
      acc[next + S_LOW] = acc[base + S_LOW] + (value <= LOW_MAX ? 1 : 0)
      acc[next + S_ODD] = acc[base + S_ODD] + (value & 1)
      acc[next + S_PRIME] = acc[base + S_PRIME] + IS_PRIME[value]
      acc[next + S_COMP] = acc[base + S_COMP] + IS_COMPOSITE[value]
      acc[next + S_MATCH] = acc[base + S_MATCH] + spec.referenceCount[value]
      for (let m = 0; m < MULTIPLES.length; m++) {
        // 0 est multiple de tout : la plateforme d'origine l'écartait, et
        // `pension.compute` fait de même. Le générateur doit s'aligner.
        acc[next + S_MULT + m] = acc[base + S_MULT + m] +
          (value !== 0 && value % MULTIPLES[m] === 0 ? 1 : 0)
      }

      const seen = acc[base + S_SEEN] | (1 << value)
      acc[next + S_SEEN] = seen

      if (counted && !reachable(next, rest)) {
        rejected.set('count', rejected.get('count') + countBelow(position + 1))
        continue
      }
      // Un 고정수 absent des positions restantes ne sera jamais placé.
      if (requiredBits !== 0 &&
          (requiredBits & ~(seen | stillPlaceable[position + 1])) !== 0) {
        rejected.set('include', rejected.get('include') + countBelow(position + 1))
        continue
      }

      if (rest === 0) judge(next)
      else walk(position + 1)
    }
  }

  function reachable(slot, rest) {
    for (let k = 0; k < counters.length; k++) {
      const [offset, lo, hi] = counters[k]
      const v = acc[slot + offset]
      if (v > hi || v + rest < lo) return false
    }
    return true
  }

  function judge(slot) {
    if (total !== null) {
      const v = acc[slot + S_SUM]
      if (v < total[0] || v > total[1]) return miss('total')
    }
    if (low !== null) {
      const v = acc[slot + S_LOW]
      if (v < low[0] || v > low[1]) return miss('low')
    }
    if (odd !== null) {
      const v = acc[slot + S_ODD]
      if (v < odd[0] || v > odd[1]) return miss('odd')
    }
    for (let k = 0; k < activeMult.length; k++) {
      const [m, lo, hi] = activeMult[k]
      const v = acc[slot + S_MULT + m]
      if (v < lo || v > hi) return miss('multiples')
    }
    if (primes !== null) {
      const v = acc[slot + S_PRIME]
      if (v < primes[0] || v > primes[1]) return miss('primes')
    }
    if (composites !== null) {
      const v = acc[slot + S_COMP]
      if (v < composites[0] || v > composites[1]) return miss('composites')
    }
    if (distinct !== null || repeats !== null) {
      tally.fill(0)
      for (let p = 0; p < DIGITS; p++) tally[chosen[p]]++
      let kinds = 0
      let doubled = 0
      for (let d = 0; d < BASE; d++) {
        if (tally[d] > 0) kinds++
        if (tally[d] > 1) doubled += tally[d]
      }
      if (distinct !== null && (kinds < distinct[0] || kinds > distinct[1])) {
        return miss('distinct')
      }
      if (repeats !== null && (doubled < repeats[0] || doubled > repeats[1])) {
        return miss('repeats')
      }
    }
    if (match !== null) {
      const v = acc[slot + S_MATCH]
      if (v < match[0] || v > match[1]) return miss('match')
    }
    if (ac !== null) {
      const v = acValueOf(chosen)
      if (v < ac[0] || v > ac[1]) return miss('ac')
    }
    emit()
  }

  const miss = (key) => { rejected.set(key, (rejected.get(key) ?? 0) + 1) }
  const countBelow = (position) => {
    let out = 1
    for (let p = position; p < DIGITS; p++) out *= allowed[p].length
    return out
  }

  walk(0)

  const count = Math.min(kept, capacity)
  return finish(store.subarray(0, count * (DIGITS + 1)), count, kept)
}


/** AC값 d'une séquence : écarts deux-à-deux distincts − 5. Peut être négatif. */
function acValueOf(digits) {
  let bits = 0
  for (let i = 0; i < DIGITS; i++) {
    for (let j = i + 1; j < DIGITS; j++) {
      bits |= 1 << Math.abs(digits[i] - digits[j])
    }
  }
  return popcount(bits) - (DIGITS - 1)
}

/** Pourquoi une séquence ne passe pas — ou `null` si elle passe. */
export function matches(digits, filters = {}) {
  const spec = normalize(filters)
  const row = [...digits]
  if (row.length !== DIGITS) throw new RangeError(`숫자 ${DIGITS}개가 필요합니다`)
  for (const v of row) {
    if (!Number.isInteger(v) || v < 0 || v >= BASE) {
      throw new RangeError(`숫자 ${v}: 0..${BASE - 1} 범위 밖입니다`)
    }
  }

  for (let p = 0; p < DIGITS; p++) {
    if (!spec.positions[p].includes(row[p])) return 'positions'
  }
  for (let d = 0; d < BASE; d++) {
    if (spec.required[d] && !row.includes(d)) return 'include'
  }

  const count = (predicate) => row.filter(predicate).length
  const tally = {}
  for (const v of row) tally[v] = (tally[v] ?? 0) + 1
  const kinds = Object.keys(tally).length
  const doubled = Object.values(tally).filter((c) => c > 1).reduce((a, b) => a + b, 0)

  const tests = {
    total: () => row.reduce((a, b) => a + b, 0),
    low: () => count((v) => v <= LOW_MAX),
    odd: () => count((v) => v % 2 === 1),
    primes: () => count((v) => IS_PRIME[v] === 1),
    composites: () => count((v) => IS_COMPOSITE[v] === 1),
    distinct: () => kinds,
    repeats: () => doubled,
    match: () => row.reduce((a, v) => a + spec.referenceCount[v], 0),
    ac: () => acValueOf(row),
  }

  for (const key of CRITERIA) {
    if (key === 'multiples') {
      for (let m = 0; m < MULTIPLES.length; m++) {
        const b = spec.multiples[m]
        if (b === null) continue
        const v = count((x) => x !== 0 && x % MULTIPLES[m] === 0)
        if (v < b[0] || v > b[1]) return 'multiples'
      }
      continue
    }
    const b = spec[key]
    if (b === null) continue
    const v = tests[key]()
    if (v < b[0] || v > b[1]) return key
  }
  return null
}

/** Les billets d'un résultat : `{ group, digits }`. */
export function toTickets({ grids, count }) {
  const out = []
  const stride = DIGITS + 1
  for (let i = 0; i < count; i++) {
    out.push({
      group: grids[i * stride],
      digits: [...grids.subarray(i * stride + 1, (i + 1) * stride)],
    })
  }
  return out
}

// ------------------------------------------------------------- validation

function normalize(filters) {
  const spec = {}
  for (const key of CRITERIA) {
    if (key === 'multiples') continue
    spec[key] = bounds(key, filters[key])
  }
  spec.multiples = MULTIPLES.map((m) => bounds(`multiples.${m}`, filters.multiples?.[m]))

  const exclude = new Set(digitList('exclude', filters.exclude))
  const include = digitList('include', filters.include)
  if (include.length > DIGITS) {
    throw new RangeError(`고정수 ${include.length}개 — 숫자는 ${DIGITS}개뿐입니다`)
  }
  spec.required = new Uint8Array(BASE)
  for (const d of include) {
    if (exclude.has(d)) throw new RangeError(`고정수 ${d}이(가) 제외수에도 있습니다`)
    spec.required[d] = 1
  }
  spec.requiredTotal = include.length

  const declared = filters.positions ?? []
  if (declared.length && declared.length !== DIGITS) {
    throw new RangeError(`자리 조건 : ${DIGITS}개가 필요합니다`)
  }
  spec.positions = []
  for (let p = 0; p < DIGITS; p++) {
    const raw = declared[p]
    const source = raw === null || raw === undefined
      ? Array.from({ length: BASE }, (_, d) => d)
      : digitList(`positions[${p}]`, raw)
    const kept = source.filter((d) => !exclude.has(d))
    spec.positions.push(kept)
  }

  spec.referenceCount = new Uint8Array(BASE)
  if (filters.reference) {
    const ref = digitList('reference', filters.reference, { unique: false })
    // 이월 compte les répétitions : un chiffre présent deux fois dans la
    // référence vaut deux, comme dans `pension.carryover`.
    for (const d of ref) spec.referenceCount[d] = 1
  } else if (spec.match !== null) {
    throw new RangeError('`match`에는 기준 번호(`reference`)가 필요합니다')
  }

  const wanted = filters.groups
  spec.groups = wanted === null || wanted === undefined ? [...GROUPS]
    : [...new Set(wanted)].sort((a, b) => a - b)
  for (const g of spec.groups) {
    if (!GROUPS.includes(g)) throw new RangeError(`조 ${g}: ${GROUPS} 중 하나여야 합니다`)
  }
  return spec
}

function bounds(name, value) {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`${name} : [min, max] 범위가 필요합니다`)
  }
  const [lo, hi] = value
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
    throw new TypeError(`${name} : 정수 범위가 필요합니다 (받은 값 ${lo}, ${hi})`)
  }
  if (lo > hi) throw new RangeError(`${name} : 최소 ${lo}이(가) 최대 ${hi}보다 큽니다`)
  return [lo, hi]
}

function digitList(name, value, { unique = true } = {}) {
  if (value === null || value === undefined) return []
  const raw = unique ? [...new Set(value)].sort((a, b) => a - b) : [...value]
  for (const d of raw) {
    if (!Number.isInteger(d) || d < 0 || d >= BASE) {
      throw new RangeError(`${name} : ${d}은(는) 0..${BASE - 1} 범위 밖입니다`)
    }
  }
  return raw
}

function report(map) {
  return [...map].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .map(([key, n]) => ({ key, label: LABELS[key] ?? key, rejected: n }))
}

function popcount(x) {
  x = x - ((x >> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333)
  x = (x + (x >> 4)) & 0x0f0f0f0f
  return (x * 0x01010101) >> 24
}

const now = () => (typeof performance === 'undefined'
  ? Date.now() : performance.now())
