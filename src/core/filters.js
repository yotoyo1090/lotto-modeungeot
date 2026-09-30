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

import { HEAD, IS_COMPOSITE, IS_PRIME, LOW_MAX, NMAX, PICK, TAIL } from './draws.js'
import { choose, mulberry32 } from './generator.js'
import { acValue, MULTIPLES } from './metrics.js'

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
  // Ajoutés pour que chaque colonne du tableau 조합 ait sa page ici aussi.
  { key: 'headRepeat', label: '앞쌍', gloss: '앞자리가 같은 번호가 가장 많이 모인 수', kind: 'number' },
  { key: 'tailRepeat', label: '끝쌍', gloss: '끝자리가 같은 번호가 가장 많이 모인 수', kind: 'number' },
  { key: 'primes', label: '소수', gloss: '소수의 개수', kind: 'number' },
  { key: 'composites', label: '합성수', gloss: '합성수의 개수', kind: 'number' },
  ...MULTIPLES.map((m) => ({ key: `mult${m}`, label: `${m}배수`, gloss: `${m}의 배수 개수`, kind: 'number' })),
  { key: 'primeSum', label: '소수합', gloss: '소수의 합', kind: 'number' },
  { key: 'compositeSum', label: '합성수합', gloss: '합성수의 합', kind: 'number' },
  ...MULTIPLES.map((m) => ({ key: `mult${m}Sum`, label: `${m}배수합`, gloss: `${m}의 배수의 합`, kind: 'number' })),
  // Les deux 이월 regardent le 회차 précédent — ses sept numéros, 보너스
  // compris. Le 1회 n'en a pas : il n'entre pas dans leurs séries.
  { key: 'carried', label: '이월', gloss: '전회차 번호 7개(보너스 포함) 중 다시 나온 수', kind: 'number', previous: true },
  { key: 'carriedSum', label: '이월합', gloss: '전회차에서 다시 나온 번호의 합', kind: 'number', previous: true },
]

export const isIndicator = (key) => INDICATORS.some((i) => i.key === key)

// Les familles de numéros — 소수, 합성수, les multiples de 2 à 5 : la clé du
// compte, celle de la somme, et qui en fait partie.
const FAMILIES = [
  { count: 'primes', sum: 'primeSum', keep: (v) => IS_PRIME[v] === 1 },
  { count: 'composites', sum: 'compositeSum', keep: (v) => IS_COMPOSITE[v] === 1 },
  ...MULTIPLES.map((m) => ({ count: `mult${m}`, sum: `mult${m}Sum`, keep: (v) => v % m === 0 })),
]

/**
 * Les indicateurs d'une grille, quelle que soit sa taille.
 *
 * `describeRow` ne sait traiter que six numéros — la ligne 조합. Ici il en
 * faut sept pour le 보너스포함, d'où ce calcul séparé. Les définitions sont
 * les mêmes, y compris 저 = 1..22 : la colonne 저고 de l'ancienne base
 * comptait le 23 en 고, et c'est elle qui fait foi.
 *
 * `previous` : les sept numéros du 회차 précédent, pour les deux 이월.
 */
export function indicatorsOf(numbers, previous = null) {
  const row = [...numbers].sort((a, b) => a - b)
  const low = row.filter((v) => v <= LOW_MAX).length
  const odd = row.filter((v) => v % 2 === 1).length
  const out = {
    total: row.reduce((a, v) => a + v, 0),
    low,
    odd,
    head: row.reduce((a, v) => a + HEAD[v], 0),
    tail: row.reduce((a, v) => a + TAIL[v], 0),
    ac: acValue(row),
    size: row.length,
    headRepeat: mostSame(row, HEAD),
    tailRepeat: mostSame(row, TAIL),
  }
  for (const { count, sum, keep } of FAMILIES) {
    out[count] = row.filter(keep).length
    out[sum] = row.reduce((a, v) => a + (keep(v) ? v : 0), 0)
  }
  if (previous) {
    const prev = new Set(previous)
    out.carried = row.filter((v) => prev.has(v)).length
    out.carriedSum = row.reduce((a, v) => a + (prev.has(v) ? v : 0), 0)
  }
  return out
}

/** Combien de numéros partagent le chiffre le plus fréquent — 앞쌍 / 끝쌍. */
function mostSame(row, digit) {
  const seen = new Map()
  let best = 0
  for (const v of row) {
    const c = (seen.get(digit[v]) ?? 0) + 1
    seen.set(digit[v], c)
    if (c > best) best = c
  }
  return best
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
  const law = lawOf(indicator, size)
  LAWS.set(key, law)
  return law
}

function lawOf(indicator, size) {
  switch (indicator) {
    case 'ac': return acLaw(size)
    case 'low': return countLaw(LOW_MAX, size)
    case 'odd': return countLaw(23, size)
    case 'total': return sumLaw((v) => v, size)
    case 'head': return sumLaw((v) => HEAD[v], size)
    case 'tail': return sumLaw((v) => TAIL[v], size)
    case 'headRepeat': return repeatLaw(HEAD, size)
    case 'tailRepeat': return repeatLaw(TAIL, size)
    // Les sept numéros du 회차 précédent forment un groupe comme un autre.
    case 'carried': return countLaw(PICK + 1, size)
    // Sa loi dépend des numéros du 회차 précédent : voir `carriedSumLaw`.
    case 'carriedSum': throw new RangeError('이월합의 기대는 회차마다 다릅니다 — carriedSumLaw')
  }
  const family = FAMILIES.find((f) => f.count === indicator || f.sum === indicator)
  if (family.count === indicator) {
    let members = 0
    for (let v = 1; v <= NMAX; v++) if (family.keep(v)) members++
    return countLaw(members, size)
  }
  return sumLaw((v) => (family.keep(v) ? v : 0), size)
}

// 앞쌍 / 끝쌍 : les 45 numéros se rangent en groupes par chiffre. Le nombre
// de grilles qui n'ont pas plus de r numéros dans aucun groupe se lit comme
// un coefficient — le produit, groupe par groupe, de Σ C(g, k) xᵏ pour k ≤ r.
// La loi du maximum est la différence entre r et r − 1.
function repeatLaw(digit, size) {
  const groups = new Map()
  for (let v = 1; v <= NMAX; v++) groups.set(digit[v], (groups.get(digit[v]) ?? 0) + 1)
  const within = (r) => {
    let poly = [1]
    for (const g of groups.values()) {
      const top = Math.min(r, g)
      const next = new Array(poly.length + top).fill(0)
      for (let a = 0; a < poly.length; a++) {
        if (poly[a]) for (let k = 0; k <= top; k++) next[a + k] += poly[a] * choose(g, k)
      }
      poly = next
    }
    return poly[size] ?? 0
  }
  const total = choose(NMAX, size)
  const out = {}
  let below = 0
  for (let r = 1; r <= size; r++) {
    const upTo = within(r)
    if (upTo > below) out[r] = (upTo - below) / total
    below = upTo
  }
  return out
}

/**
 * 이월합 : la loi pour **un** 회차, connaissant son précédent. Les numéros
 * repris forment une partie T des sept numéros d'avant ; le reste de la
 * grille vient des 38 autres. Il n'y a que 2⁷ = 128 parties à parcourir.
 */
export function carriedSumLaw(previous, size = PICK) {
  const p = previous.length
  const others = NMAX - p
  const total = choose(NMAX, size)
  const out = {}
  for (let mask = 0; mask < 1 << p; mask++) {
    let j = 0
    let s = 0
    for (let k = 0; k < p; k++) if ((mask >> k) & 1) { j++; s += previous[k] }
    if (j > size) continue
    const ways = choose(others, size - j)
    if (ways) out[s] = (out[s] ?? 0) + ways / total
  }
  return out
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
export function filterSeries(draws, population, indicator, base = draws) {
  if (!isPopulation(population)) throw new RangeError(`알 수 없는 집단 : ${population}`)
  if (!isIndicator(indicator)) throw new RangeError(`알 수 없는 지표 : ${indicator}`)

  const { kind, previous: needsPrevious } = INDICATORS.find((i) => i.key === indicator)
  const counts = new Map()
  const series = []

  // Le 회차 précédent se cherche dans `base` (tout l'historique) : sur une
  // tranche, le premier 회차 a son précédent hors tranche.
  let previousOf = () => null
  if (needsPrevious) {
    const at = new Map()
    for (let k = 0; k < base.n; k++) at.set(base.rangs[k], k)
    previousOf = (rang) => {
      const k = at.get(rang - 1)
      return k === undefined ? null : [...base.numbersAt(k), base.bonus[k]]
    }
  }
  // 이월합 : son 기대 s'additionne 회차 par 회차.
  const perDraw = indicator === 'carriedSum' ? new Map() : null

  for (let i = draws.n - 1; i >= 0; i--) {
    const rang = draws.rangs[i]
    const previous = previousOf(rang)
    if (needsPrevious && !previous) continue
    const grids = gridsAt(draws, i, population)
    if (perDraw) {
      for (const [v, p] of Object.entries(carriedSumLaw(previous, grids[0].length))) {
        perDraw.set(v, (perDraw.get(v) ?? 0) + p * grids.length)
      }
    }
    for (const grid of grids) {
      const m = indicatorsOf(grid, previous)
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
  const expected = {}
  if (perDraw) {
    for (const [v, e] of perDraw) expected[v] = e
  } else {
    const law = indicatorLaw(indicator, size)
    for (const [v, p] of Object.entries(law)) {
      expected[kind === 'pair' ? pairLabel(Number(v), size) : v] = p * series.length
    }
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
