// 연금복권 720+ — le second produit.
//
// Rien à voir avec le 6/45 : un tirage est un 조 de 1 à 5 et un nombre de
// six chiffres, plus un second nombre de six chiffres pour le 2등. Les
// chiffres vont de 0 à 9 et **peuvent se répéter** — c'est la différence
// structurelle qui interdit de réutiliser le noyau du 6/45 tel quel. Et
// contrairement au 6/45, **la position d'un chiffre porte du sens**.
//
// Le vocabulaire d'analyse, lui, est le même : 총합, 저고, 홀짝, AC값,
// 소수, 합성수, 배수, 이월.
//
// Conventions vérifiées contre les 225 tirages de l'ancienne base :
//
//   * 홀짝 = 홀 : 짝 — 225/225 ;
//   * AC값 = écarts deux-à-deux distincts − 5 — 225/225 ;
//   * 이월 = les chiffres du tirage courant dont la valeur figure dans le
//     tirage précédent, **répétitions comprises** : si le tirage sort trois
//     5 et que le précédent contenait un 5, les trois comptent. 225/225,
//     somme incluse ;
//   * les multiples écartent 0, qui est multiple de tout.
//
// Deux écarts assumés avec les données stockées :
//
//   * **저고** — l'ancien code comptait avec `<= 3` mais construisait les
//     listes 저번호 / 고번호 avec `<= 4` : les deux se contredisaient dans
//     105 tirages sur 225. Ici un seul seuil, `LOW_MAX = 4`, la coupure
//     symétrique 0–4 / 5–9, celle des listes.
//   * **이월 위치** — les positions stockées ne suivent aucune règle
//     reconstituable : une même valeur reçoit toujours la même position,
//     quelle que soit la place réellement occupée. Ici, c'est l'index
//     1-based dans le tirage courant.

export const DIGITS = 6         // six chiffres par tirage
export const BASE = 10          // chiffres de 0 à 9
export const GROUPS = [1, 2, 3, 4, 5]
export const LOW_MAX = 4        // 저 = 0..4, 고 = 5..9

export const PRIMES = [2, 3, 5, 7]
// 0 et 1 n'appartiennent ni aux premiers ni aux composés.
export const COMPOSITES = [4, 6, 8, 9]

// Fenêtres glissantes : 당첨번호삼일…삼사 (3 chiffres), 이일…이오 (2), 일일…일육 (1).
export const WINDOW_SIZES = [3, 2, 1]

export const MULTIPLES = [2, 3, 4, 5]

const IS_PRIME = membership(PRIMES)
const IS_COMPOSITE = membership(COMPOSITES)

function membership(values) {
  const table = new Uint8Array(BASE)
  for (const v of values) table[v] = 1
  return table
}

export class Pension {
  constructor({ rangs, dates, groups, digits, bonus }) {
    this.rangs = rangs
    this.dates = dates
    this.groups = groups
    this.digits = digits        // Int8Array, pas 6
    this.bonus = bonus          // Int8Array, pas 6
    this.n = rangs.length
  }

  digitsAt(i) { return this.digits.subarray(i * DIGITS, i * DIGITS + DIGITS) }
  bonusAt(i) { return this.bonus.subarray(i * DIGITS, i * DIGITS + DIGITS) }
  sourceAt(i, source) {
    return source === 'bonus' ? this.bonusAt(i) : this.digitsAt(i)
  }

  indexOf(rang) {
    for (let i = 0; i < this.n; i++) if (this.rangs[i] === rang) return i
    throw new RangeError(`연금복권 ${rang}회차가 기록에 없습니다`)
  }

  window(start = null, end = null) {
    let lo = 0
    let hi = this.n
    if (start !== null) while (lo < hi && this.rangs[lo] < start) lo++
    if (end !== null) while (hi > lo && this.rangs[hi - 1] > end) hi--
    return this.slice(lo, hi)
  }

  last(k) { return this.slice(Math.max(0, this.n - k), this.n) }

  slice(lo, hi) {
    return new Pension({
      rangs: this.rangs.slice(lo, hi),
      dates: this.dates.slice(lo, hi),
      groups: this.groups.slice(lo, hi),
      digits: this.digits.slice(lo * DIGITS, hi * DIGITS),
      bonus: this.bonus.slice(lo * DIGITS, hi * DIGITS),
    })
  }
}

export function fromRows(rows) {
  const sorted = [...rows].sort((a, b) => a.rang - b.rang)
  const n = sorted.length
  const rangs = new Int32Array(n)
  const dates = new Array(n)
  const groups = new Int8Array(n)
  const digits = new Int8Array(n * DIGITS)
  const bonus = new Int8Array(n * DIGITS)
  sorted.forEach((row, i) => {
    rangs[i] = row.rang
    dates[i] = row.date ?? null
    groups[i] = row.group
    digits.set(row.digits, i * DIGITS)
    bonus.set(row.bonus, i * DIGITS)
  })
  return new Pension({ rangs, dates, groups, digits, bonus })
}

/** AC값 : écarts deux-à-deux distincts − (k − 1). Peut être négatif ici. */
export function acValue(values, k = values.length) {
  const seen = new Uint8Array(BASE)
  let distinct = 0
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const gap = Math.abs(values[i] - values[j])
      if (!seen[gap]) { seen[gap] = 1; distinct++ }
    }
  }
  return distinct - (k - 1)
}

/**
 * 이월 : les chiffres du tirage repris du précédent, répétitions comprises.
 *
 * La position est l'index 1-based dans le tirage **courant**.
 */
export function carryover(p) {
  const values = [[]]
  const positions = [[]]
  const count = new Int16Array(p.n)
  const sum = new Int32Array(p.n)

  for (let i = 1; i < p.n; i++) {
    const previous = new Set(p.digitsAt(i - 1))
    const current = p.digitsAt(i)
    const kept = []
    const where = []
    for (let k = 0; k < DIGITS; k++) {
      if (previous.has(current[k])) { kept.push(current[k]); where.push(k + 1) }
    }
    values.push(kept)
    positions.push(where)
    count[i] = kept.length
    sum[i] = kept.reduce((a, b) => a + b, 0)
  }
  return { values, positions, count, sum }
}

export function compute(p) {
  const n = p.n
  const total = new Int16Array(n)
  const lowCount = new Int8Array(n)
  const highCount = new Int8Array(n)
  const oddCount = new Int8Array(n)
  const evenCount = new Int8Array(n)
  const ac = new Int8Array(n)
  const primeCount = new Int8Array(n)
  const primeSum = new Int16Array(n)
  const compositeCount = new Int8Array(n)
  const compositeSum = new Int16Array(n)
  const repeats = new Int8Array(n)
  const distinct = new Int8Array(n)

  const multipleCount = {}
  const multipleSum = {}
  for (const m of MULTIPLES) {
    multipleCount[m] = new Int8Array(n)
    multipleSum[m] = new Int16Array(n)
  }

  const tally = new Int8Array(BASE)
  for (let i = 0; i < n; i++) {
    const row = p.digitsAt(i)
    tally.fill(0)
    let sum = 0
    let low = 0
    let odd = 0
    for (let k = 0; k < DIGITS; k++) {
      const v = row[k]
      sum += v
      if (v <= LOW_MAX) low++
      if (v % 2 === 1) odd++
      if (IS_PRIME[v]) { primeCount[i]++; primeSum[i] += v }
      if (IS_COMPOSITE[v]) { compositeCount[i]++; compositeSum[i] += v }
      // 0 est multiple de tout : on l'écarte, comme le faisait l'original.
      for (const m of MULTIPLES) {
        if (v !== 0 && v % m === 0) { multipleCount[m][i]++; multipleSum[m][i] += v }
      }
      tally[v]++
    }
    total[i] = sum
    lowCount[i] = low
    highCount[i] = DIGITS - low
    oddCount[i] = odd
    evenCount[i] = DIGITS - odd
    ac[i] = acValue(row, DIGITS)
    for (let d = 0; d < BASE; d++) {
      if (tally[d] > 1) repeats[i] += tally[d]
      if (tally[d] > 0) distinct[i]++
    }
  }

  const carry = carryover(p)
  return {
    total, lowCount, highCount, oddCount, evenCount, ac,
    primeCount, primeSum, compositeCount, compositeSum,
    multipleCount, multipleSum, repeats, distinct,
    carryCount: carry.count, carrySum: carry.sum, carry,
    lowHigh: (i) => `${lowCount[i]} : ${highCount[i]}`,
    oddEven: (i) => `${oddCount[i]} : ${evenCount[i]}`,
  }
}

/**
 * (N, 6, 10) à plat — l'écart de chaque chiffre, à chaque position.
 *
 * `gaps[(i * 6 + pos) * 10 + d]` = nombre de tirages depuis que le chiffre
 * `d` est sorti en position `pos`. Vaut 0 s'il sort au tirage i ; tant
 * qu'il n'est jamais sorti à cette position, l'écart se compte depuis le
 * début — `i + 1` — comme le faisaient les tables `bokchk*`.
 *
 * C'est le contenu des six tables `bokchkun` … `bokchksix`, reconstruit en
 * un passage, sans les étiquettes `'5-당첨'` collées dans du texte.
 */
export function gaps(p, { source = 'digits' } = {}) {
  const out = new Int16Array(p.n * DIGITS * BASE)
  const last = new Int32Array(DIGITS * BASE).fill(-1)
  for (let i = 0; i < p.n; i++) {
    const row = p.sourceAt(i, source)
    for (let pos = 0; pos < DIGITS; pos++) {
      const drawn = row[pos]
      for (let d = 0; d < BASE; d++) {
        const slot = pos * BASE + d
        out[(i * DIGITS + pos) * BASE + d] = d === drawn ? 0 : i - last[slot]
      }
      last[pos * BASE + drawn] = i
    }
  }
  return out
}

/** Fréquence de chaque chiffre 0-9, position par position. */
export function positionFrequency(p, { source = 'digits' } = {}) {
  const out = []
  for (let pos = 0; pos < DIGITS; pos++) {
    const counts = {}
    for (let d = 0; d < BASE; d++) counts[d] = 0
    for (let i = 0; i < p.n; i++) counts[p.sourceAt(i, source)[pos]]++
    out.push(counts)
  }
  return out
}

/** Fréquence de chaque 조. */
export function groupFrequency(p) {
  const out = {}
  for (const g of GROUPS) out[g] = 0
  for (let i = 0; i < p.n; i++) out[p.groups[i]]++
  return out
}

/**
 * Les fenêtres de `size` chiffres consécutifs, tirage par tirage.
 *
 * Des chaînes plutôt que des entiers : `'059'` et `'59'` ne sont pas le
 * même motif.
 */
export function windows(p, size, { source = 'digits' } = {}) {
  if (!WINDOW_SIZES.includes(size)) {
    throw new RangeError(`구간 크기 ${size} — ${WINDOW_SIZES} 중 하나여야 합니다`)
  }
  const out = []
  for (let i = 0; i < p.n; i++) {
    const row = p.sourceAt(i, source)
    const line = []
    for (let j = 0; j <= DIGITS - size; j++) {
      let text = ''
      for (let k = 0; k < size; k++) text += row[j + k]
      line.push(text)
    }
    out.push(line)
  }
  return out
}

/** Les motifs de `size` chiffres les plus fréquents, toutes positions. */
export function windowFrequency(p, size, { source = 'digits' } = {}) {
  const tally = new Map()
  for (const line of windows(p, size, { source })) {
    for (const pattern of line) tally.set(pattern, (tally.get(pattern) ?? 0) + 1)
  }
  return Object.fromEntries(
    [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

export function distribution(values) {
  const tally = {}
  for (const value of values) tally[value] = (tally[value] ?? 0) + 1
  return Object.fromEntries(
    Object.entries(tally).sort((a, b) => Number(a[0]) - Number(b[0])))
}

/**
 * La fiche d'un billet — ses indicateurs, sans le tirage.
 *
 * Le pendant de `row.describeRow` du 6/45, en plus court : il n'y a pas de
 * 앞자리/끝자리 sur des chiffres, et le 이월 se compte contre une référence
 * qu'on passe (le tirage précédent), pas contre un historique.
 */
export function describeTicket(digits, { group = null, reference = null } = {}) {
  const row = [...digits]
  if (row.length !== DIGITS) throw new RangeError(`숫자 ${DIGITS}개가 필요합니다`)
  for (const v of row) {
    if (!Number.isInteger(v) || v < 0 || v >= BASE) {
      throw new RangeError(`숫자 ${v}: 0..${BASE - 1} 범위 밖입니다`)
    }
  }

  const tally = new Int8Array(BASE)
  for (const v of row) tally[v]++
  const distinct = tally.reduce((a, c) => a + (c > 0 ? 1 : 0), 0)
  // 중복 : les chiffres qui reviennent, comptés avec leurs répétitions.
  const repeats = tally.reduce((a, c) => a + (c > 1 ? c : 0), 0)

  const low = row.filter((v) => v <= LOW_MAX)
  const odd = row.filter((v) => v % 2 === 1)
  const primes = row.filter((v) => IS_PRIME[v] === 1)
  const composites = row.filter((v) => IS_COMPOSITE[v] === 1)

  const ref = new Int8Array(BASE)
  if (reference) for (const v of reference) ref[v] = 1
  const carried = row.filter((v) => ref[v] === 1)

  return {
    group,
    digits: row,
    total: row.reduce((a, b) => a + b, 0),
    ac: acValue(row),
    low: low.length,
    high: DIGITS - low.length,
    odd: odd.length,
    even: DIGITS - odd.length,
    lowLabel: `${low.length} : ${DIGITS - low.length}`,
    oddLabel: `${odd.length} : ${DIGITS - odd.length}`,
    primes,
    composites,
    // 0 est écarté des 배수 — la convention du produit, voir pension-analysis.
    multiples: Object.fromEntries(
      MULTIPLES.map((m) => [m, row.filter((v) => v !== 0 && v % m === 0)])),
    distinct,
    repeats,
    carried,
  }
}
