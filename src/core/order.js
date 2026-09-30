// 공나온 순서 — une boule sort-elle trop tôt, ou trop tard ?
//
// Tous les autres écrans regardent *si* un numéro sort. Celui-ci regarde
// *quand* dans la séquence : 1ʳᵉ boule, 2ᵉ, … 6ᵉ. Une boule physiquement
// différente — plus lourde, plus rugueuse — n'a aucune raison de sortir
// plus souvent, mais elle peut sortir à un autre moment du brassage. C'est
// la mesure la plus proche de la mécanique qu'on puisse faire sans être
// dans la salle.
//
// Sous hasard pur, un numéro qui sort occupe chacune des six positions
// avec la même probabilité 1/6, quel que soit le numéro. Deux questions :
//
//   each     pour chaque numéro, ses positions sont-elles uniformes ?
//            45 χ² à 5 degrés de liberté ; seuil corrigé 0,05 / 45.
//   all      les 45 χ² additionnés — un χ² à 45 × 5 = 225 dl.
//            C'est la question, en un seul chiffre.
//
// `order` est une Map 회차 → [six numéros dans l'ordre de sortie]. Les
// 회차 sans ordre sont ignorés ; le bonus n'entre pas (sorti après une
// pause, il n'est pas la même expérience).

import { NMAX, PICK } from './draws.js'
import { chiSquareP } from './stats.js'

/** Le tableau : positions[n][p] = combien de fois n est sorti en p-ième. */
export function orderTable(order) {
  const positions = Array.from({ length: NMAX + 1 }, () => new Int32Array(PICK + 1))
  let draws = 0
  for (const balls of order.values()) {
    if (balls.length !== PICK) continue
    draws++
    balls.forEach((n, i) => { positions[n][i + 1]++ })
  }
  return { positions, draws }
}

/** Question 1 — numéro par numéro. */
export function orderEach({ positions }) {
  const df = PICK - 1
  const out = []
  for (let n = 1; n <= NMAX; n++) {
    const row = positions[n]
    let total = 0
    for (let p = 1; p <= PICK; p++) total += row[p]
    // Les six comptages et leur attendu commun, pour le graphe.
    const counts = Array.from(row.subarray(1))
    if (!total) { out.push({ number: n, total, chi2: 0, df, p: 1, mean: 0, positions: counts, expected: 0 }); continue }
    const e = total / PICK
    let chi2 = 0
    let sum = 0
    for (let p = 1; p <= PICK; p++) { chi2 += (row[p] - e) ** 2 / e; sum += p * row[p] }
    out.push({ number: n, total, chi2, df, p: chiSquareP(chi2, df), mean: sum / total, positions: counts, expected: e })
  }
  return out
}

/**
 * Le même tableau lu en colonnes — pour chaque position de sortie, les 45
 * numéros. Sous hasard pur chaque position est un tirage uniforme sur 45,
 * donc l'attendu vaut draws / 45 partout ; χ² à 44 degrés de liberté.
 */
export function orderByPosition({ positions, draws }) {
  const df = NMAX - 1
  const e = draws / NMAX
  const out = []
  for (let p = 1; p <= PICK; p++) {
    const numbers = Array.from({ length: NMAX }, (_, k) => positions[k + 1][p])
    let chi2 = 0
    if (e) for (const c of numbers) chi2 += (c - e) ** 2 / e
    out.push({ position: p, numbers, expected: e, chi2, df, p: e ? chiSquareP(chi2, df) : 1 })
  }
  return out
}

/** Question 2 — le tableau entier. */
export function orderAll({ positions, draws }) {
  // La somme des 45 statistiques : chacune suit un χ²(5) sous H0, la
  // somme un χ²(225). C'est le test global le plus simple qui reste
  // sensible à un petit décalage sur beaucoup de numéros à la fois.
  let chi2 = 0
  for (let n = 1; n <= NMAX; n++) {
    let total = 0
    for (let p = 1; p <= PICK; p++) total += positions[n][p]
    const e = total / PICK
    if (!e) continue
    for (let p = 1; p <= PICK; p++) chi2 += (positions[n][p] - e) ** 2 / e
  }
  const df = NMAX * (PICK - 1)
  return { chi2, df, p: chiSquareP(chi2, df), draws }
}

export function order(orderMap) {
  const table = orderTable(orderMap)
  return {
    each: orderEach(table),
    byPosition: orderByPosition(table),
    all: orderAll(table),
    draws: table.draws,
  }
}
