// Les indicateurs d'un tirage.
//
// Remplace les 62 colonnes précalculées de `lottobasedata`. Aucune n'est
// stockée : sur 1 238 tirages, tout se recalcule en quelques millisecondes.
//
// Conventions reprises de la plateforme d'origine, vérifiées ligne à ligne
// contre l'ancienne base (voir test/parity.test.js) :
//
//   * tous les indicateurs portent sur les **7 numéros** — les six tirés
//     plus le bonus ;
//   * 저 = 1..22, 고 = 23..45 ;
//   * AC값 = nombre d'écarts deux-à-deux distincts − 6 ;
//   * 앞자리수 = premier chiffre décimal (13 → 1), 끝자리수 = dernier ;
//   * 이월 = numéros communs avec le tirage précédent, bonus inclus, et
//     leur position dans le tirage précédent (일 = 1 … 보너스 = 7).
//
// Une seule correction volontaire : l'original comptait 저고 avec `< 23`
// mais construisait la liste 저번호 avec `<= 23`, ce qui se contredisait.
// Ici les deux partagent `LOW_MAX`.

import { FULL, HEAD, IS_COMPOSITE, IS_PRIME, LOW_MAX, NMAX, SECTIONS, TAIL }
  from './draws.js'

export const MULTIPLES = [2, 3, 4, 5]

/**
 * AC값 : nombre d'écarts deux-à-deux distincts, moins (k − 1).
 *
 * Sur k valeurs comprises entre 1 et 45, les écarts tiennent dans 0..44 :
 * un petit tableau de marquage suffit, réutilisé d'une ligne à l'autre.
 */
export function acValue(values, k = values.length) {
  const seen = new Uint8Array(NMAX + 1)
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
 * 이월 : ce qu'un tirage reprend du précédent, bonus inclus.
 *
 * La position rendue est celle qu'occupait le numéro dans le tirage
 * **précédent**, en base 1.
 */
export function carryover(draws) {
  const numbers = [[]]
  const positions = [[]]
  const count = new Int16Array(draws.n)
  const sum = new Int32Array(draws.n)

  for (let i = 1; i < draws.n; i++) {
    const previous = draws.sequenceAt(i - 1)
    const current = draws.sequenceAt(i)
    const values = []
    const where = []
    for (let p = 0; p < FULL; p++) {
      const value = previous[p]
      // `sequence` porte les six triés puis le bonus : une valeur ne peut
      // apparaître qu'une fois, la recherche linéaire suffit.
      for (let q = 0; q < FULL; q++) {
        if (current[q] === value) { values.push(value); where.push(p + 1); break }
      }
    }
    numbers.push(values)
    positions.push(where)
    count[i] = values.length
    sum[i] = values.reduce((a, b) => a + b, 0)
  }
  return { numbers, positions, count, sum }
}

/** Tous les indicateurs, une entrée par tirage. */
export function compute(draws) {
  const n = draws.n
  const total = new Int16Array(n)
  const lowCount = new Int8Array(n)
  const highCount = new Int8Array(n)
  const oddCount = new Int8Array(n)
  const evenCount = new Int8Array(n)
  const ac = new Int8Array(n)
  const headSum = new Int16Array(n)
  const tailSum = new Int16Array(n)
  const primeCount = new Int8Array(n)
  const primeSum = new Int16Array(n)
  const compositeCount = new Int8Array(n)
  const compositeSum = new Int16Array(n)
  const sectionCount = new Int8Array(n * SECTIONS.length)

  const multipleCount = {}
  const multipleSum = {}
  for (const m of MULTIPLES) {
    multipleCount[m] = new Int8Array(n)
    multipleSum[m] = new Int16Array(n)
  }

  for (let i = 0; i < n; i++) {
    const row = draws.fullAt(i)
    let sum = 0
    let low = 0
    let odd = 0
    let heads = 0
    let tails = 0
    let primes = 0
    let primeTotal = 0
    let composites = 0
    let compositeTotal = 0

    for (let k = 0; k < FULL; k++) {
      const v = row[k]
      sum += v
      if (v <= LOW_MAX) low++
      if (v % 2 === 1) odd++
      heads += HEAD[v]
      tails += TAIL[v]
      if (IS_PRIME[v]) { primes++; primeTotal += v }
      if (IS_COMPOSITE[v]) { composites++; compositeTotal += v }
      for (const m of MULTIPLES) {
        if (v % m === 0) { multipleCount[m][i]++; multipleSum[m][i] += v }
      }
      for (let s = 0; s < SECTIONS.length; s++) {
        const [lo, hi] = SECTIONS[s]
        if (v >= lo && v <= hi) { sectionCount[i * SECTIONS.length + s]++; break }
      }
    }

    total[i] = sum
    lowCount[i] = low
    highCount[i] = FULL - low
    oddCount[i] = odd
    evenCount[i] = FULL - odd
    headSum[i] = heads
    tailSum[i] = tails
    primeCount[i] = primes
    primeSum[i] = primeTotal
    compositeCount[i] = composites
    compositeSum[i] = compositeTotal
    ac[i] = acValue(row, FULL)
  }

  const carry = carryover(draws)

  return {
    total, lowCount, highCount, oddCount, evenCount, ac,
    headSum, tailSum, primeCount, primeSum, compositeCount, compositeSum,
    multipleCount, multipleSum,
    carryCount: carry.count, carrySum: carry.sum, carry,
    sectionCount,
    lowHigh: (i) => `${lowCount[i]} : ${highCount[i]}`,
    oddEven: (i) => `${oddCount[i]} : ${evenCount[i]}`,
    sectionsAt: (i) => Array.from(
      sectionCount.subarray(i * SECTIONS.length, (i + 1) * SECTIONS.length)),
  }
}
