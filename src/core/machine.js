// 추첨기 — les trois machines tirent-elles la même chose ?
//
// Tous les autres écrans supposent une seule source de hasard. Or il y a
// trois machines 비너스 (1호기 · 2호기 · 3호기), tournant par blocs de
// quelques semaines depuis le 262회. Si l'une d'elles avait un défaut —
// un ventilateur, une géométrie de drum — ce défaut serait dilué à 1/3 dans
// l'ensemble et invisible au χ² global. Isolé par machine, il triple.
//
// Ce fichier ne prédit rien. Il pose trois questions, du plus faible au
// plus fort :
//
//   uniform   chaque machine, seule, tire-t-elle les 45 numéros également ?
//   same      les trois machines tirent-elles la même distribution ?
//   guess     peut-on deviner la machine à partir des six numéros ?
//
// La troisième est la vraie. Un classifieur walk-forward qui devinerait la
// machine mieux que « toujours la plus fréquente » aurait prouvé que les
// machines diffèrent. Le résultat attendu est qu'il n'y arrive pas.
//
// L'étiquette de la machine n'existe dans aucune donnée officielle : elle
// se lit sur la retransmission MBC. Elle arrive ici par une Map 회차 →
// machine, importée une fois (tools/import-hogi.js).

import { NMAX, PICK } from './draws.js'
import { chiSquareP, chiSquareUniform } from './stats.js'

export const MACHINES = [1, 2, 3]

/**
 * Les comptages par machine : combien de fois chaque numéro est sorti,
 * et combien de tirages. Les six numéros seulement — le bonus sort de la
 * même machine mais après une pause, et on ne veut pas mélanger.
 *
 * `hogi` est une Map 회차 → 1 | 2 | 3. Les 회차 sans étiquette sont ignorés.
 */
export function machineCounts(draws, hogi) {
  const counts = new Map(MACHINES.map((m) => [m, { draws: 0, numbers: new Int32Array(NMAX + 1) }]))
  for (let i = 0; i < draws.n; i++) {
    const m = hogi.get(draws.rangs[i])
    const cell = counts.get(m)
    if (!cell) continue
    cell.draws++
    for (const n of draws.numbersAt(i)) cell.numbers[n]++
  }
  return counts
}

/**
 * Question 1 — chaque machine seule. χ² uniforme sur 45 cases, espérance
 * draws × 6 / 45. Trois p-values ; le seuil corrigé est 0,05 / 3.
 */
export function machineUniform(counts) {
  return MACHINES.map((m) => {
    const { draws, numbers } = counts.get(m)
    const expected = draws * PICK / NMAX
    const observed = Array.from(numbers.subarray(1))
    const test = chiSquareUniform(observed, expected)
    // Les 45 comptages et leur attendu, pour le graphe — les mêmes chiffres
    // que le χ² vient de résumer.
    return { machine: m, draws, expected, numbers: observed, ...test }
  })
}

/**
 * Question 2 — homogénéité. Tableau 3 × 45 ; sous H0 la part de chaque
 * numéro est la même pour les trois machines. df = (3 − 1)(45 − 1) = 88.
 */
export function machineSame(counts) {
  const total = new Int32Array(NMAX + 1)
  let draws = 0
  for (const m of MACHINES) {
    const cell = counts.get(m)
    draws += cell.draws
    for (let n = 1; n <= NMAX; n++) total[n] += cell.numbers[n]
  }
  let chi2 = 0
  // Par machine, les 45 attendus sous H0 — la part de chaque numéro dans
  // le total, à l'échelle de cette machine. C'est ce que le graphe compare.
  const expected = new Map()
  for (const m of MACHINES) {
    const cell = counts.get(m)
    const row = new Float64Array(NMAX)
    for (let n = 1; n <= NMAX; n++) {
      const e = draws ? total[n] * cell.draws / draws : 0
      row[n - 1] = e
      if (e > 0) chi2 += (cell.numbers[n] - e) ** 2 / e
    }
    expected.set(m, row)
  }
  const df = (MACHINES.length - 1) * (NMAX - 1)
  return { chi2, df, p: chiSquareP(chi2, df), draws, expected }
}

/**
 * Question 3 — deviner la machine.
 *
 * Walk-forward : pour le 회차 t, on ne connaît que les tirages avant t. On
 * calcule, pour chaque machine, la vraisemblance des six numéros sous sa
 * fréquence passée (lissage +1), fois sa part de tirages, et on prend le
 * maximum. Puis on regarde si c'était la bonne.
 *
 * Le témoin n'est pas 1/3 : c'est « toujours la machine la plus fréquente
 * jusqu'ici ». Un classifieur qui ne bat pas ce témoin n'a rien appris.
 * `z` mesure l'écart au témoin en écarts-types binomiaux.
 */
export function machineGuess(draws, hogi, { warmup = 100 } = {}) {
  const seen = new Map(MACHINES.map((m) => [m, { draws: 0, numbers: new Int32Array(NMAX + 1) }]))
  let tested = 0
  let hits = 0
  let baseline = 0

  for (let i = 0; i < draws.n; i++) {
    const truth = hogi.get(draws.rangs[i])
    if (!seen.has(truth)) continue
    const labelled = MACHINES.reduce((s, m) => s + seen.get(m).draws, 0)

    if (labelled >= warmup) {
      let best = null
      let bestScore = -Infinity
      let majority = MACHINES[0]
      for (const m of MACHINES) {
        const cell = seen.get(m)
        if (cell.draws > seen.get(majority).draws) majority = m
        // log P(machine) + Σ log P(numéro | machine), lissé.
        let score = Math.log((cell.draws + 1) / (labelled + MACHINES.length))
        for (const n of draws.numbersAt(i)) {
          score += Math.log((cell.numbers[n] + 1) / (cell.draws * PICK + NMAX))
        }
        if (score > bestScore) { bestScore = score; best = m }
      }
      tested++
      if (best === truth) hits++
      if (majority === truth) baseline++
    }

    const cell = seen.get(truth)
    cell.draws++
    for (const n of draws.numbersAt(i)) cell.numbers[n]++
  }

  const p0 = tested ? baseline / tested : 0
  const sd = tested ? Math.sqrt(p0 * (1 - p0) / tested) : 0
  const accuracy = tested ? hits / tested : 0
  return {
    tested, hits, accuracy,
    baseline: p0,
    z: sd ? (accuracy - p0) / sd : 0,
  }
}

/** Tout ce qu'un écran affiche, en un appel. */
export function machine(draws, hogi) {
  const counts = machineCounts(draws, hogi)
  return {
    uniform: machineUniform(counts),
    same: machineSame(counts),
    guess: machineGuess(draws, hogi),
  }
}
