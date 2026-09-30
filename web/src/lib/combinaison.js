// Les choix du formulaire 자동조합.
//
// L'ancien formulaire ne proposait pas « AC de 0 à 10 » : il proposait les
// valeurs **réellement observées** dans la colonne correspondante de
// `winnerpremiere`, une case par valeur distincte. C'est une bonne idée —
// personne n'a envie de cocher un AC qui n'est jamais sorti — et c'est ce
// qu'on refait ici, en le recalculant au lieu de le lire dans une table.
//
// Attention : ces indicateurs portent sur les **six** numéros tirés, pas
// sur les sept. L'ancienne table `winnerpremiere` n'a pas de colonne bonus,
// et le générateur produit des grilles de six. Les blocs d'analyse du site,
// eux, comptent le bonus — c'est la même différence que l'interrupteur
// « 보너스 포함 / 제외 » de l'onglet 흐름.

import { HEAD, IS_COMPOSITE, IS_PRIME, LOW_MAX, PICK, TAIL } from '@core/draws.js'
import { acValue, MULTIPLES } from '@core/metrics.js'
import { pairLabel } from '@core/criteria.js'

/**
 * Les valeurs observées de chaque critère, sur tout l'historique.
 *
 * Rend, pour chacun, la liste triée des valeurs distinctes et le nombre de
 * 회차 où elle est sortie — l'effectif s'affiche sous la case, ce que
 * l'ancien formulaire ne faisait pas et qui dit d'un coup d'œil si une
 * valeur est courante ou anecdotique.
 */
export function choices(draws) {
  const tally = {
    total: new Map(), low: new Map(), odd: new Map(), ac: new Map(),
    headSum: new Map(), tailSum: new Map(), carry: new Map(),
    primes: new Map(), composites: new Map(),
    mult2: new Map(), mult3: new Map(), mult4: new Map(), mult5: new Map(),
    // Les colonnes ajoutées : sommes par tranche de 10, répétitions exactes.
    carriedSum: new Map(), primeSum: new Map(), compositeSum: new Map(),
    mult2Sum: new Map(), mult3Sum: new Map(), mult4Sum: new Map(), mult5Sum: new Map(),
    headRepeat: new Map(), tailRepeat: new Map(),
    // Plusieurs valeurs par 회차 : chaque case compte les 회차 qui la portent,
    // et `rows` garde, 회차 par 회차, ce qu'il faut pour la couverture.
    carriedPos: new Map(), headDigit: new Map(), tailDigit: new Map(),
  }
  const rows = { carriedPos: [], headDigit: [], tailDigit: [] }
  const bump = (key, value) => tally[key].set(value, (tally[key].get(value) ?? 0) + 1)

  for (let i = 0; i < draws.n; i++) {
    const row = draws.numbersAt(i)
    let total = 0
    let low = 0
    let odd = 0
    let headSum = 0
    let tailSum = 0
    let primes = 0
    let composites = 0
    const mult = [0, 0, 0, 0]

    for (let k = 0; k < PICK; k++) {
      const v = row[k]
      total += v
      if (v <= LOW_MAX) low++
      if (v % 2 === 1) odd++
      headSum += HEAD[v]
      tailSum += TAIL[v]
      primes += IS_PRIME[v]
      composites += IS_COMPOSITE[v]
      for (let m = 0; m < MULTIPLES.length; m++) if (v % MULTIPLES[m] === 0) mult[m]++
    }

    bump('total', total)
    bump('low', low)
    bump('odd', odd)
    bump('ac', acValue(row))
    bump('headSum', headSum)
    bump('tailSum', tailSum)
    bump('primes', primes)
    bump('composites', composites)
    MULTIPLES.forEach((m, k) => bump(`mult${m}`, mult[k]))

    const familySum = (ok) => { let s = 0; for (let k = 0; k < PICK; k++) if (ok(row[k])) s += row[k]; return s }
    bump('primeSum', band(familySum((v) => IS_PRIME[v] === 1)))
    bump('compositeSum', band(familySum((v) => IS_COMPOSITE[v] === 1)))
    MULTIPLES.forEach((m) => bump(`mult${m}Sum`, band(familySum((v) => v % m === 0))))

    const heads = [...row].map((v) => HEAD[v])
    const tails = [...row].map((v) => TAIL[v])
    bump('headRepeat', longestRun(heads))
    bump('tailRepeat', longestRun(tails))
    const headSet = [...new Set(heads)]
    const tailSet = [...new Set(tails)]
    for (const d of headSet) bump('headDigit', d)
    for (const d of tailSet) bump('tailDigit', d)
    rows.headDigit.push(headSet)
    rows.tailDigit.push(tailSet)

    // 이월 : les six numéros retombés sur les SEPT du 회차 précédent, bonus
    // compris — c'est ainsi que l'ancien `oldwinner()` comptait.
    if (i > 0 && draws.rangs[i - 1] === draws.rangs[i] - 1) {
      const before = draws.sequenceAt(i - 1)
      let carried = 0
      let carriedSum = 0
      const positions = []
      for (let k = 0; k < PICK; k++) {
        for (let j = 0; j < before.length; j++) {
          if (row[k] === before[j]) { carried++; carriedSum += row[k]; positions.push(j + 1) }
        }
      }
      bump('carry', carried)
      bump('carriedSum', band(carriedSum))
      for (const p of new Set(positions)) bump('carriedPos', p)
      rows.carriedPos.push(positions)
    }
  }

  const sorted = (key) => [...tally[key].entries()]
    .map(([value, seen]) => ({ value, seen }))
    .sort((a, b) => a.value - b.value)

  const out = Object.fromEntries(Object.keys(tally).map((k) => [k, sorted(k)]))
  out.rows = rows
  return out
}

/** La tranche de 10 d'une somme : 0 (0–9), 10 (10–19)… */
export const band = (sum) => Math.floor(sum / 10) * 10

/** Les tranches cochées, dépliées en valeurs pour le moteur. */
export const bandValues = (bands) => bands.flatMap((b) => Array.from({ length: 10 }, (_, k) => b + k))

/** L'étiquette d'une tranche — « 20–29 ». */
export const bandLabel = (b) => `${b}–${b + 9}`

/** Combien de fois revient le chiffre le plus fréquent — 앞쌍 / 끝쌍. */
export function longestRun(digits) {
  const seen = new Map()
  for (const d of digits) seen.set(d, (seen.get(d) ?? 0) + 1)
  return Math.max(...seen.values())
}

/**
 * Pour les critères à plusieurs valeurs par 회차 (이월 위치, 앞자리, 끝자리) :
 * combien de 회차 passés auraient passé la sélection, c'est-à-dire n'ont
 * **que** des valeurs cochées.
 */
export function coveredRows(list, selected) {
  if (!selected.length) return list.length
  const ok = new Set(selected)
  return list.filter((values) => values.every((v) => ok.has(v))).length
}

/** Les bornes du menu 총합, comme dans l'ancien formulaire : 37 à 267. */
export const SUM_MIN = 37
export const SUM_MAX = 267

/** L'étiquette d'un compte de 저 ou de 홀 — « 4 : 2 ». */
export const pair = pairLabel

/**
 * Les seize colonnes du tableau de résultats de l'ancien site.
 *
 * `combinaisoncolum` (`combinaison/views.py` L798–819) portait, dans cet
 * ordre : 회차, 조합, 당첨여부, 총합, 전회차이월, AC, 저고, 홀짝, 앞자리수,
 * 끝자리수, 소수, puis les cinq comptages 배수 / 합성수 — ces derniers
 * étiquetés un cran à côté de ce qu'ils comptaient.
 */
export function describe(grid, { previous = null, next = null } = {}) {
  let total = 0
  let low = 0
  let odd = 0
  let headSum = 0
  let tailSum = 0
  const primes = []
  const composites = []
  const mult = MULTIPLES.map(() => [])

  for (const v of grid) {
    total += v
    if (v <= LOW_MAX) low++
    if (v % 2 === 1) odd++
    headSum += HEAD[v]
    tailSum += TAIL[v]
    if (IS_PRIME[v]) primes.push(v)
    if (IS_COMPOSITE[v]) composites.push(v)
    MULTIPLES.forEach((m, k) => { if (v % m === 0) mult[k].push(v) })
  }

  const hit = (row) => (row ? grid.filter((v) => row.includes(v)) : [])

  return {
    grid,
    total,
    low,
    odd,
    lowLabel: pairLabel(low),
    oddLabel: pairLabel(odd),
    ac: acValue(grid),
    headSum,
    tailSum,
    primes,
    composites,
    multiples: Object.fromEntries(MULTIPLES.map((m, k) => [m, mult[k]])),
    // 전회차이월 : ce que la grille reprend du tirage précédent.
    carried: hit(previous),
    // 당첨여부 : ce qu'elle aurait attrapé au tirage suivant, s'il existe.
    won: hit(next),
    hasNext: next !== null,
  }
}
