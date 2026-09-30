// 필터 — les trois familles d'indicateurs de l'ancien menu.
//
// L'ancienne plateforme en faisait **21 pages** de plusieurs centaines de
// lignes, réparties en trois groupes qui ne diffèrent que par les numéros
// qu'ils regardent :
//
//   필터 보너스포함   les six numéros **et** le 보너스   → `lottobasedata`
//   필터 1등          les six numéros seuls              → `winnerpremiere`
//   필터 2등          les sept grilles 2등               → `winnerseconde`
//
// Le 2등 mérite un mot. Une grille est gagnante au 2등 quand elle a cinq des
// six numéros **plus le 보너스**. Il y en a donc sept par 회차 : la grille
// gagnante elle-même, et les six où l'un des six numéros cède sa place au
// 보너스. C'est exactement ce que contenait `winnerseconde` — 7 938 lignes
// pour 1 134 회차, soit 1 134 × 7.
//
// Les trois groupes montraient les mêmes six indicateurs, et chaque page les
// montrait sous les mêmes trois formes : le comptage, la suite dans le temps,
// et le tableau filtrable par intervalle. Une fonction paramétrée remplace
// les 21.

import { HEAD, LOW_MAX, NMAX, PICK, TAIL } from './draws.js'
import { choose, mulberry32 } from './generator.js'
import { acValue } from './metrics.js'

/** Les trois populations, dans l'ordre du menu d'origine. */
export const POPULATIONS = [
  { key: 'bonus', label: '보너스포함', gloss: '여섯 번호 + 보너스', size: 7, perDraw: 1 },
  { key: 'first', label: '1등', gloss: '당첨 여섯 번호', size: 6, perDraw: 1 },
  { key: 'second', label: '2등', gloss: '보너스가 낀 일곱 조합', size: 6, perDraw: 7 },
]

export const isPopulation = (key) => POPULATIONS.some((p) => p.key === key)

/**
 * Les six indicateurs.
 *
 * `kind` dit comment se lit la valeur : un nombre se met en ordonnée d'un
 * graphique, une paire « 5 : 1 » ne le peut pas — on la trace alors par son
 * premier terme, qui suffit à la déterminer puisque la somme est fixe.
 */
export const INDICATORS = [
  { key: 'total', label: '총합', gloss: '번호의 합', kind: 'number' },
  { key: 'low', label: '저고', gloss: `저 = 1–${LOW_MAX}`, kind: 'pair' },
  { key: 'odd', label: '홀짝', gloss: '홀수의 개수', kind: 'pair' },
  { key: 'head', label: '앞자리수', gloss: '앞자리수합', kind: 'number' },
  { key: 'tail', label: '끝자리수', gloss: '끝자리수합', kind: 'number' },
  { key: 'ac', label: 'AC값', gloss: '서로 다른 차 − (번호 수 − 1)', kind: 'number' },
]

export const isIndicator = (key) => INDICATORS.some((i) => i.key === key)

/**
 * Les six indicateurs d'une grille, quelle que soit sa taille.
 *
 * `describeRow` ne sait traiter que six numéros — la ligne 조합. Ici il en
 * faut sept pour le 보너스포함, d'où ce calcul séparé. Les définitions sont
 * les mêmes, y compris 저 = 1..22 : la colonne 저고 de l'ancienne base
 * comptait le 23 en 고, et c'est elle qui fait foi.
 */
export function indicatorsOf(numbers) {
  const row = [...numbers].sort((a, b) => a - b)
  const low = row.filter((v) => v <= LOW_MAX).length
  const odd = row.filter((v) => v % 2 === 1).length
  return {
    total: row.reduce((a, v) => a + v, 0),
    low,
    odd,
    head: row.reduce((a, v) => a + HEAD[v], 0),
    tail: row.reduce((a, v) => a + TAIL[v], 0),
    ac: acValue(row),
    size: row.length,
  }
}

/**
 * Les grilles d'un 회차, selon la population.
 *
 * Rend un tableau : une seule grille pour 보너스포함 et 1등, sept pour le
 * 2등. La première des sept est la grille gagnante, puis viennent les six
 * où le 보너스 remplace un numéro — dans l'ordre des numéros remplacés,
 * celui de `winnerseconde`.
 */
export function gridsAt(draws, i, population) {
  const six = [...draws.numbersAt(i)]
  if (population === 'first') return [six]
  const bonus = draws.bonus[i]
  if (population === 'bonus') return [[...six, bonus]]

  // L'ancienne table retire le k-ième numéro et met le 보너스 en dernier —
  // « 3 7 9 13 24 23 » plutôt que « 3 7 9 13 23 24 ». L'ensemble est le même
  // et tous les indicateurs trient avant de calculer, mais on garde son
  // ordre : c'est ce que le tableau affiche, et le 보너스 se repère alors
  // d'un coup d'œil, toujours à la même place.
  // Elle les énumère du dernier numéro retiré au premier — 육, 오, … 일.
  const out = [six]
  for (let k = PICK - 1; k >= 0; k--) {
    out.push([...six.filter((_, j) => j !== k), bonus])
  }
  return out
}

/** L'étiquette « 5 : 1 » d'un indicateur de paire. */
export const pairLabel = (count, size) => `${count} : ${size - count}`

/**
 * Ce que le hasard donne à un indicateur : la loi de sa valeur sur une
 * grille de `size` numéros tirés parmi 45. C'est le « 기대 » à poser sous
 * l'histogramme des 회차 — sans lui, « 총합 130 est sorti 28 fois » n'a pas
 * de point de comparaison.
 *
 *   총합 · 앞자리수 · 끝자리수   exacts, par programmation dynamique sur les
 *                              45 numéros (combien de sous-ensembles de
 *                              taille j ont un poids s)
 *   저고 · 홀짝                 exacts, hypergéométriques (22 저 / 23 홀)
 *   AC값                        pas de forme fermée — Monte-Carlo, 200 000
 *                              grilles à graine fixe, donc le même résultat
 *                              à chaque appel
 *
 * Rend { valeur: probabilité }. Mémorisé par (indicateur, taille) : le calcul
 * ne dépend d'aucun 회차.
 */
const LAWS = new Map()
const AC_SAMPLES = 200000

export function indicatorLaw(indicator, size = PICK) {
  if (!isIndicator(indicator)) throw new RangeError(`알 수 없는 지표 : ${indicator}`)
  const key = `${indicator}/${size}`
  if (LAWS.has(key)) return LAWS.get(key)
  const law = indicator === 'ac' ? acLaw(size) : indicator === 'low' || indicator === 'odd'
    ? countLaw(indicator === 'low' ? LOW_MAX : 23, size)
    : sumLaw(indicator === 'total' ? (v) => v : indicator === 'head' ? (v) => HEAD[v] : (v) => TAIL[v], size)
  LAWS.set(key, law)
  return law
}

// j numéros parmi 45 dont exactement k sont dans un groupe de `group`.
function countLaw(group, size) {
  const total = choose(NMAX, size)
  const out = {}
  for (let k = 0; k <= size; k++) {
    const p = (choose(group, k) * choose(NMAX - group, size - k)) / total
    if (p > 0) out[k] = p
  }
  return out
}

// ways[j][s] = nombre de sous-ensembles de taille j dont la somme des poids vaut s.
function sumLaw(weight, size) {
  const maxSum = Array.from({ length: NMAX }, (_, i) => weight(i + 1)).sort((a, b) => b - a)
    .slice(0, size).reduce((a, b) => a + b, 0)
  const ways = Array.from({ length: size + 1 }, () => new Float64Array(maxSum + 1))
  ways[0][0] = 1
  for (let v = 1; v <= NMAX; v++) {
    const w = weight(v)
    for (let j = size; j >= 1; j--) {
      const from = ways[j - 1]
      const to = ways[j]
      for (let s = maxSum - w; s >= 0; s--) if (from[s]) to[s + w] += from[s]
    }
  }
  const total = choose(NMAX, size)
  const out = {}
  for (let s = 0; s <= maxSum; s++) if (ways[size][s]) out[s] = ways[size][s] / total
  return out
}

function acLaw(size) {
  const rnd = mulberry32(0xAC45)
  const tally = new Map()
  const bag = Array.from({ length: NMAX }, (_, i) => i + 1)
  for (let t = 0; t < AC_SAMPLES; t++) {
    // Les `size` premiers d'un mélange partiel de Fisher-Yates.
    for (let k = 0; k < size; k++) {
      const j = k + Math.floor(rnd() * (NMAX - k))
      ;[bag[k], bag[j]] = [bag[j], bag[k]]
    }
    const ac = acValue(bag.slice(0, size).sort((a, b) => a - b))
    tally.set(ac, (tally.get(ac) ?? 0) + 1)
  }
  const out = {}
  for (const k of [...tally.keys()].sort((a, b) => a - b)) out[k] = tally.get(k) / AC_SAMPLES
  return out
}

/**
 * 필터 — tout ce que montrait une des 21 pages.
 *
 *   counts   valeur → combien de fois
 *   values   les valeurs rencontrées, triées — ce que proposaient les menus
 *            시작패턴 / 종료패턴, et rien de plus
 *   series   [{ rang, value, label }], du plus récent au plus ancien
 *
 * Pour le 2등, `series` a sept entrées par 회차 : la page d'origine listait
 * bien ses 7 938 lignes.
 */
export function filterSeries(draws, population, indicator) {
  if (!isPopulation(population)) throw new RangeError(`알 수 없는 집단 : ${population}`)
  if (!isIndicator(indicator)) throw new RangeError(`알 수 없는 지표 : ${indicator}`)

  const kind = INDICATORS.find((i) => i.key === indicator).kind
  const counts = new Map()
  const series = []

  for (let i = draws.n - 1; i >= 0; i--) {
    const rang = draws.rangs[i]
    for (const grid of gridsAt(draws, i, population)) {
      const m = indicatorsOf(grid)
      const value = m[indicator]
      const label = kind === 'pair' ? pairLabel(value, m.size) : String(value)
      counts.set(value, (counts.get(value) ?? 0) + 1)
      series.push({ rang, value, label, numbers: grid })
    }
  }

  const values = [...counts.keys()].sort((a, b) => a - b)
  const size = series.length ? series[0].numbers.length : PICK

  // Le 기대 : la loi de l'indicateur, à l'échelle du nombre de grilles.
  // Sous les mêmes étiquettes que `counts`, pour se poser barre contre barre.
  const law = indicatorLaw(indicator, size)
  const expected = {}
  for (const [v, p] of Object.entries(law)) {
    expected[kind === 'pair' ? pairLabel(Number(v), size) : v] = p * series.length
  }

  return {
    population,
    indicator,
    kind,
    size,
    // Les clés du comptage portent l'étiquette lisible — « 5 : 1 » plutôt
    // que « 5 » — puisque c'est elle qu'on lit sous les barres.
    counts: Object.fromEntries(values.map((v) => [
      kind === 'pair' ? pairLabel(v, size) : String(v),
      counts.get(v),
    ])),
    expected,
    values,
    labels: Object.fromEntries(values.map((v) => [
      v, kind === 'pair' ? pairLabel(v, size) : String(v)])),
    series,
    min: values[0] ?? 0,
    max: values.at(-1) ?? 0,
  }
}

/** Le nombre de grilles que la population produit — 1 134 ou 7 938. */
export const rowCount = (draws, population) =>
  draws.n * (POPULATIONS.find((p) => p.key === population)?.perDraw ?? 1)

export { NMAX }
