// 예고 — ce qu'un lot de grilles annonce **avant** le tirage.
//
// 조합결과 dit ce qu'un lot a fait. Mais « 3 × 5등 », c'était bien ? Sans le
// point de comparaison propre à ce lot, on ne peut pas le dire : quatre-vingt-
// dix grilles étalées et quatre-vingt-dix grilles empilées sur un numéro
// fixe font la même moyenne (2,02 × 5등) et pas du tout les mêmes semaines.
//
// Trois chiffres, tous calculables sur les grilles seules :
//
//   zero       la probabilité qu'aucune grille ne fasse 3개 — la semaine
//              vide. C'est ce que la disposition change (11,8 % au hasard,
//              4,1 % étalé, 20 % avec un 고정수).
//   breakEven  la probabilité que les 3·4·5등 rendent au moins la mise.
//   sharing    l'indice 분배 moyen — ce qu'on toucherait le jour du 1등.
//
// La moyenne des 5등 n'est pas simulée : elle ne dépend pas des grilles.
// Chaque grille a exactement P5 de faire trois numéros, et c'est prouvé sur
// les 8 145 060 tirages — la simulation ne sert qu'aux deux premières, qui
// dépendent de la façon dont les grilles se recouvrent.
//
// Les tirages simulés sont tirés d'une graine fixe : le même lot rend le
// même 예고, aujourd'hui et dans six mois.

import { FIXED_PRIZE } from './combos.js'
import { NMAX, PICK } from './draws.js'
import { P5, SHARING_BANDS, sharingBand, sharingIndex } from './sharing.js'

/** P(4개) — C(6,4)·C(39,2) / C(45,6). */
export const P4 = 11115 / 8145060

/** P(5개, 보너스 아님) — 3등. C(6,5)·C(38,1) / C(45,6). */
export const P3 = 228 / 8145060

/**
 * Ce que vaut un 3등 dans le calcul du 본전 — la médiane récente. Il n'est
 * pas fixe, mais il ne varie pas assez pour changer la réponse « la mise
 * est-elle rendue » ; les 4·5등 sont fixes.
 */
export const TYPICAL_THIRD = 1_440_000

/** Prix d'une grille. */
export const GRID_COST = 1000

/** Combien de tirages simulés — assez pour ±0,1 point sur `zero`. */
export const PROFILE_DRAWS = 100_000

// mulberry32 : une graine, une suite. Pas `Math.random` — un 예고 qui
// change d'un rafraîchissement à l'autre ne serait pas un 예고.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const popcount = (v) => {
  v = v - ((v >> 1) & 0x55555555)
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333)
  return (((v + (v >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24
}

/** Une grille → deux mots de 32 bits (les numéros 1..32, puis 33..45). */
function mask(numbers) {
  let lo = 0, hi = 0
  for (const n of numbers) {
    const b = n - 1
    if (b < 32) lo |= 1 << b
    else hi |= 1 << (b - 32)
  }
  return [lo | 0, hi | 0]
}

/**
 * Le 예고 d'un lot.
 *
 * `grids` : des tableaux de six numéros. Rend `null` pour un lot vide.
 *
 *   n, cost        le lot et sa mise
 *   exp5, exp4     les 5등 et 4등 attendus — n × P, exact
 *   zero           P(aucune grille ≥ 3개)                      simulé
 *   breakEven      P(3·4·5등 ≥ mise)                            simulé
 *   fixed          les numéros portés par toutes les grilles, et la
 *                  probabilité qu'ils sortent tous
 *   sharing        indice moyen, et le compte par bande
 */
export function lotProfile(grids, { draws = PROFILE_DRAWS, seed = 20260919 } = {}) {
  const clean = grids
    .map((g) => [...g].map(Number).sort((a, b) => a - b))
    .filter((g) => g.length === PICK
      && g.every((n, i) => Number.isInteger(n) && n >= 1 && n <= NMAX && (i === 0 || n !== g[i - 1])))
  const n = clean.length
  if (!n) return null

  // ── ce qui ne se simule pas ──
  const exp5 = n * P5
  const exp4 = n * P4

  // ── 고정수 : les numéros que toutes les grilles portent ──
  const carried = new Int32Array(NMAX + 1)
  for (const g of clean) for (const v of g) carried[v]++
  // Une seule grille « porte partout » ses six numéros : ce n'est pas un
  // 고정수, c'est une grille. Il faut au moins deux grilles pour en parler.
  const fixed = []
  if (n >= 2) for (let v = 1; v <= NMAX; v++) if (carried[v] === n) fixed.push(v)
  // P(tous sortent) = C(6,k) / C(45,k)
  let pFixed = 1
  for (let i = 0; i < fixed.length; i++) pFixed *= (PICK - i) / (NMAX - i)

  // ── 분배 ──
  const bands = Object.fromEntries(SHARING_BANDS.map((b) => [b.key, 0]))
  let sum = 0
  for (const g of clean) {
    const idx = sharingIndex(g)
    sum += idx
    bands[sharingBand(idx).key]++
  }
  const sharing = { mean: sum / n, bands }

  // ── la simulation : zero et breakEven ──
  const lo = new Int32Array(n), hi = new Int32Array(n)
  clean.forEach((g, i) => { const [a, b] = mask(g); lo[i] = a; hi[i] = b })
  const r = rng(seed)
  const cost = n * GRID_COST
  const pool = Array.from({ length: NMAX }, (_, i) => i + 1)
  let zero = 0, breakEven = 0
  for (let d = 0; d < draws; d++) {
    // six numéros distincts — Fisher-Yates partiel
    for (let i = 0; i < PICK; i++) {
      const j = i + Math.floor(r() * (NMAX - i))
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t
    }
    const [dl, dh] = mask(pool.slice(0, PICK))
    let any = 0, money = 0
    for (let i = 0; i < n; i++) {
      const h = popcount(lo[i] & dl) + popcount(hi[i] & dh)
      if (h < 3) continue
      any++
      money += h === 3 ? FIXED_PRIZE[5] : h === 4 ? FIXED_PRIZE[4] : TYPICAL_THIRD
    }
    if (!any) zero++
    if (money >= cost) breakEven++
  }

  return {
    n, cost, exp5, exp4,
    zero: zero / draws,
    breakEven: breakEven / draws,
    fixed: { numbers: fixed, p: fixed.length ? pFixed : null },
    sharing,
    draws,
  }
}
