// 리스트 — les onze familles de numéros, comptées et sommées.
//
// L'ancienne plateforme en faisait **onze pages** bâties sur le même moule,
// une par famille : les quatre 배수, 소수, 합성수, 홀수, 짝수, 저수, 고수,
// 이월차번호. Chacune posait trois questions sur les **sept** numéros du
// tirage — bonus compris :
//
//   quels membres de la famille sont sortis      → la liste
//   combien                                       → 숫자수
//   pour quelle somme                             → 숫자합
//
// Ce sont les mêmes onze familles que l'onglet 구간 ; les deux ne demandent
// pas la même chose. Le 구간 demande *dans quelle tranche de dizaines* elles
// tombent, le 리스트 *combien il y en a et lesquelles*. Les définitions sont
// partagées — `sections.js` les porte, y compris la frontière 저/고 de ces
// pages, qui met le 23 en 저.
//
// Les trois colonnes de `lottobasedata` — « 이의배수 », « 이의배숫자수 »,
// « 이의배수합 » et leurs équivalents — ne sont pas réimportées : tout se
// recalcule (voir test/board.test.js).

import { NMAX } from './draws.js'
import { carryover } from './metrics.js'
import { SECTION_FAMILIES } from './sections.js'

/**
 * Les onze familles, sans 당첨번호 — qui n'en est pas une.
 *
 * L'ordre est celui du menu de ces pages-ci : 소수 et 합성수 côte à côte,
 * comme les quatre 배수 le sont. Le menu du 구간 les rangeait autrement ;
 * les définitions, elles, sont les mêmes.
 */
const LIST_ORDER = ['double', 'triple', 'quad', 'quint', 'prime', 'composite',
                    'odd', 'even', 'low', 'high', 'carry']

export const LIST_FAMILIES = LIST_ORDER.map(
  (k) => SECTION_FAMILIES.find((f) => f.key === k))

export const isListFamily = (key) => LIST_FAMILIES.some((f) => f.key === key)

/**
 * Les membres d'une famille — les numéros qu'elle peut contenir.
 *
 * 이월차번호 n'en a pas : n'importe quel numéro peut être repris du tirage
 * précédent. On prend alors les quarante-cinq.
 */
export function familyMembers(family) {
  const f = LIST_FAMILIES.find((x) => x.key === family)
  if (!f) throw new RangeError(`알 수 없는 가족 : ${family}`)
  const all = Array.from({ length: NMAX }, (_, k) => k + 1)
  return f.carry ? all : all.filter(f.pick)
}

/** Le comptage d'une liste de valeurs, valeur croissante. */
function tally(values) {
  const m = new Map()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return Object.fromEntries(
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => [String(v), c]))
}

/**
 * 리스트 — tout ce que montrait une des onze pages.
 *
 *   rows      un 회차 par ligne, du plus récent au plus ancien
 *   members   chaque membre de la famille et combien de fois il est sorti
 *   combos    les combinaisons rencontrées, de la plus fréquente à la plus rare
 *   counts    la distribution du 숫자수
 *   sums      la distribution du 숫자합
 *   flow      le 숫자수 suivi d'un 회차 à l'autre, du plus ancien au plus récent
 */
export function listSeries(draws, family, carry = null) {
  const f = LIST_FAMILIES.find((x) => x.key === family)
  if (!f) throw new RangeError(`알 수 없는 가족 : ${family}`)
  const bag = f.carry ? (carry ?? carryover(draws)) : null

  const rows = []
  const flow = []
  const seen = new Map()          // combinaison → { numbers, count }
  const hits = new Map()          // numéro → sorties

  for (let i = draws.n - 1; i >= 0; i--) {
    const numbers = f.carry
      ? [...(bag.numbers[i] ?? [])].sort((a, b) => a - b)
      : [...draws.fullAt(i)].filter(f.pick)

    const sum = numbers.reduce((a, n) => a + n, 0)
    const label = `[${numbers.join(', ')}]`

    for (const n of numbers) hits.set(n, (hits.get(n) ?? 0) + 1)
    const combo = seen.get(label)
    if (combo) combo.count++
    else seen.set(label, { label, numbers, count: 1 })

    rows.push({ rang: draws.rangs[i], numbers, count: numbers.length, sum, label })
  }

  // Le flux se lit dans le temps, donc du plus ancien au plus récent.
  for (let k = rows.length - 1; k >= 0; k--) {
    flow.push({ rang: rows[k].rang, value: rows[k].count })
  }

  return {
    family,
    rows,
    // L'ancien rangeait ce comptage du numéro le plus sorti au moins sorti, et
    // étiquetait ses barres « 24번 ». On garde les deux — et il le faut : une
    // clé qui ressemble à un entier serait remise en ordre croissant par
    // l'objet lui-même, et le classement serait perdu.
    members: Object.fromEntries(
      familyMembers(family)
        .map((n) => [n, hits.get(n) ?? 0])
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .map(([n, c]) => [`${n}번`, c])),
    combos: [...seen.values()].sort(
      (a, b) => b.count - a.count || a.numbers.length - b.numbers.length
        || a.label.localeCompare(b.label)),
    counts: tally(rows.map((r) => r.count)),
    sums: tally(rows.map((r) => r.sum)),
    flow,
  }
}
