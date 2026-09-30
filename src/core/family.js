// 패밀리 — ranger chaque 회차 dans sa famille, puis regarder la famille.
//
// Les onze écrans décrivent l'historique entier. Celui-ci le découpe : on
// choisit une situation — « le 회차 précédent n'avait aucun 이월 », « les six
// venaient tous du chaud », « trois pairs et trois impairs » — et tout est
// recalculé sur ces 회차-là seulement.
//
// Le piège de ce genre de page est connu et il est grave : sur une tranche,
// tout finit par paraître anormal. Un numéro sort deux fois plus souvent
// qu'ailleurs, une bande se vide, une somme se décale. Presque toujours c'est
// la taille de la tranche qui parle, pas le tirage.
//
// D'où deux précautions, et ce sont elles qui font la valeur du fichier.
//
//   l'attendu conditionnel   Une famille définie PAR les numéros impose sa
//                            propre répartition : dans « 홀 3 : 짝 3 » les
//                            impairs ne peuvent pas recevoir la même part que
//                            les pairs. Comparer à l'uniforme y ferait crier
//                            l'anomalie à chaque fois — et l'anomalie serait
//                            la définition de la tranche, pas le tirage.
//
//   les degrés de liberté    Ces marges sont fixées, pas mesurées. On les
//                            retire du χ², sinon le test devient permissif.
//
// Rien ici ne prédit. On classe, on compte, et on compare au dû.

import { COMPOSITES, NMAX, PICK, PRIMES, TEMPERATURE_BANDS } from './draws.js'
import { chiSquareFit } from './stats.js'

/** La probabilité qu'un numéro donné sorte à un 회차 donné. */
export const BASE_RATE = PICK / NMAX

/** La frontière 저/고 de cette page — celle des 리스트, pas celle du 차뜨. */
export const LOW_MAX = 22

/** Les numéros à un chiffre — ceux que le plancher du 분배 interdit. */
export const SMALL_MAX = 9

/** 1, 3, … 45 — vingt-trois impairs pour vingt-deux pairs. */
export const ODD_COUNT = 23

const isOdd = (n) => n % 2 === 1
const isLow = (n) => n <= LOW_MAX
const isSmall = (n) => n <= SMALL_MAX
const PRIME_SET = new Set(PRIMES)
const COMPOSITE_SET = new Set(COMPOSITES)
const count = (row, pick) => row.filter(pick).length

const bandOf = (gap) =>
  TEMPERATURE_BANDS.find((b) => gap >= b.min && gap <= b.max)?.name ?? 'dead'

/** C(n, k) — en flottant, suffisant pour des espérances. */
export function choose(n, k) {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

/**
 * La loi d'un comptage « combien des six appartiennent à un groupe de m ».
 * Hypergéométrique — c'est la référence de toutes les lignes 리스트.
 */
export function groupLaw(m) {
  const total = choose(NMAX, PICK)
  return Array.from({ length: PICK + 1 }, (_, k) =>
    (choose(m, k) * choose(NMAX - m, PICK - k)) / total)
}

// ────────────────────────────────────────────────────────── les dimensions
//
// `bound` dit combien de groupes la famille fixe. Il sert deux fois : à
// construire l'attendu conditionnel, et à corriger les degrés de liberté.

export const FAMILY_DIMENSIONS = [
  {
    key: 'carry',
    label: '이월',
    gloss: '직전 회차와 겹친 개수',
    bound: 1,
    order: ['0개', '1개', '2개', '3개 이상'],
    of: (r) => (r.carry === 0 ? '0개' : r.carry === 1 ? '1개' : r.carry === 2 ? '2개' : '3개 이상'),
  },
  {
    key: 'pattern',
    label: '패턴',
    gloss: '직전 회차와 겹친 라인 수',
    bound: 1,
    order: ['0줄', '1–2줄', '3–4줄', '5줄 이상'],
    of: (r) => (r.repeat === 0 ? '0줄' : r.repeat <= 2 ? '1–2줄' : r.repeat <= 4 ? '3–4줄' : '5줄 이상'),
  },
  {
    key: 'temp',
    label: '온도',
    gloss: '여섯 번호가 어느 바닥에서 왔나',
    bound: TEMPERATURE_BANDS.length,
    order: ['뜨거운 우세', '중간 우세', '차가운 우세', '사망 우세'],
    of: (r) => {
      const t = r.temp
      const top = ['hot', 'midle', 'cold', 'dead'].reduce((a, b) => (t[b] > t[a] ? b : a))
      return { hot: '뜨거운 우세', midle: '중간 우세', cold: '차가운 우세', dead: '사망 우세' }[top]
    },
  },
  {
    key: 'dead',
    label: '사망',
    gloss: '20회 이상 쉰 번호가 몇 개',
    bound: TEMPERATURE_BANDS.length,
    order: ['0개', '1개', '2개 이상'],
    of: (r) => (r.temp.dead === 0 ? '0개' : r.temp.dead === 1 ? '1개' : '2개 이상'),
  },
  {
    key: 'odd',
    label: '홀짝',
    gloss: '홀수와 짝수의 비율',
    bound: 2,
    order: ['홀 0 : 짝 6', '홀 1 : 짝 5', '홀 2 : 짝 4', '홀 3 : 짝 3',
      '홀 4 : 짝 2', '홀 5 : 짝 1', '홀 6 : 짝 0'],
    of: (r) => `홀 ${r.odd} : 짝 ${PICK - r.odd}`,
  },
  {
    key: 'low',
    label: '저고',
    gloss: `1–${LOW_MAX} 와 ${LOW_MAX + 1}–${NMAX}`,
    bound: 2,
    order: ['저 0 : 고 6', '저 1 : 고 5', '저 2 : 고 4', '저 3 : 고 3',
      '저 4 : 고 2', '저 5 : 고 1', '저 6 : 고 0'],
    of: (r) => `저 ${r.low} : 고 ${PICK - r.low}`,
  },
  {
    key: 'small',
    label: '9 이하',
    gloss: '한 자리 번호가 몇 개',
    bound: 2,
    order: ['0개', '1개', '2개 이상'],
    of: (r) => (r.small === 0 ? '0개' : r.small === 1 ? '1개' : '2개 이상'),
  },
]

export const familyDimension = (key) =>
  FAMILY_DIMENSIONS.find((d) => d.key === key) ?? null

// ──────────────────────────────────────────────────────────── le classement

/**
 * Décrit chaque 회차 par la situation dans laquelle il est arrivé.
 *
 * `cells` — les 45 cases de chaque 회차, telles que 패턴 les voit — sert à
 * lire la température : c'est le tableau du 회차 PRECEDENT qui dit depuis
 * combien de tirages chaque numéro attendait.
 *
 * `boardLines(i)` rend les lignes qu'occupaient, sur le tableau du 회차 i−1,
 * les numéros sortis au 회차 **i**. C'est une propriété du 회차 i lui-même —
 * où ses six numéros attendaient la semaine d'avant.
 *
 * Ce détail a coûté un faux résultat. La première version lisait le 회차 i+1
 * pour décrire le 회차 i : la dimension 패턴 encodait alors le tirage suivant,
 * et découper là-dessus faisait apparaître un z de 5,49 — un signal
 * spectaculaire qui n'était que le futur revenu par la fenêtre. Une famille
 * doit se lire au moment où l'on prépare le 회차 d'après, sans quoi tout ce
 * qu'on mesure ensuite est circulaire.
 *
 * Le premier 회차 utilisable est le troisième : il faut un précédent pour le
 * 이월, et un avant-précédent pour compter les lignes qui se répètent.
 */
export function classifyDraws(draws, cells, boardLines) {
  const out = []
  let previousLines = null

  for (let i = 0; i < draws.n; i++) {
    const lines = boardLines(i)
    if (i >= 2) {
      const row = Array.from(draws.numbersAt(i))
      const prev = new Set(draws.numbersAt(i - 1))
      const temp = { hot: 0, midle: 0, cold: 0, dead: 0 }
      const board = cells[i - 1]
      for (const n of row) temp[bandOf(board[n - 1].gap)]++

      out.push({
        i,
        rang: draws.rangs[i],
        numbers: row,
        bonus: draws.bonus[i],
        carry: count(row, (n) => prev.has(n)),
        repeat: previousLines ? [...lines].filter((l) => previousLines.has(l)).length : 0,
        lines: lines.size,
        temp,
        odd: count(row, isOdd),
        low: count(row, isLow),
        small: count(row, isSmall),
        primes: count(row, (n) => PRIME_SET.has(n)),
        composites: count(row, (n) => COMPOSITE_SET.has(n)),
        sum: row.reduce((a, b) => a + b, 0),
      })
    }
    previousLines = lines
  }
  return out
}

/** Les familles d'une dimension, avec leurs effectifs. */
export function familyList(rows, key) {
  const dim = familyDimension(key)
  if (!dim) throw new RangeError(`알 수 없는 분류 : ${key}`)
  const counts = new Map()
  for (const r of rows) {
    const v = dim.of(r)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const known = dim.order.filter((v) => counts.has(v))
  const extra = [...counts.keys()].filter((v) => !dim.order.includes(v)).sort()
  return [...known, ...extra].map((value) => ({
    value,
    n: counts.get(value),
    share: counts.get(value) / rows.length,
  }))
}

/** Les 회차 d'une famille. */
export function familyMembers(rows, key, value) {
  const dim = familyDimension(key)
  if (!dim) throw new RangeError(`알 수 없는 분류 : ${key}`)
  return rows.filter((r) => dim.of(r) === value)
}

// ─────────────────────────────────────────────── l'espérance sous contrainte

/**
 * La probabilité de chaque numéro à UN 회차, sachant ce que la famille fixe.
 *
 * Sans contrainte, c'est 6/45 pour tout le monde. Avec une contrainte, les six
 * places sont réparties entre les groupes que la famille impose, et à
 * l'intérieur d'un groupe tous les numéros restent équiprobables — c'est
 * exactement l'hypothèse qu'on met à l'épreuve.
 */
export function numberChances(row, cells, key) {
  const p = new Float64Array(NMAX + 1)
  const share = (pick, drawn, size) => {
    for (let v = 1; v <= NMAX; v++) if (pick(v)) p[v] = size ? drawn / size : 0
  }

  if (key === 'odd') {
    share(isOdd, row.odd, ODD_COUNT)
    share((v) => !isOdd(v), PICK - row.odd, NMAX - ODD_COUNT)
  } else if (key === 'low') {
    share(isLow, row.low, LOW_MAX)
    share((v) => !isLow(v), PICK - row.low, NMAX - LOW_MAX)
  } else if (key === 'small') {
    share(isSmall, row.small, SMALL_MAX)
    share((v) => !isSmall(v), PICK - row.small, NMAX - SMALL_MAX)
  } else if (key === 'temp' || key === 'dead') {
    const board = cells[row.i - 1]
    const band = new Array(NMAX + 1)
    const size = new Map(TEMPERATURE_BANDS.map((b) => [b.name, 0]))
    for (let v = 1; v <= NMAX; v++) {
      band[v] = bandOf(board[v - 1].gap)
      size.set(band[v], size.get(band[v]) + 1)
    }
    for (let v = 1; v <= NMAX; v++) {
      const s = size.get(band[v])
      p[v] = s ? row.temp[band[v]] / s : 0
    }
  } else {
    for (let v = 1; v <= NMAX; v++) p[v] = BASE_RATE
  }
  return p
}

// ──────────────────────────────────────────────────── ce que la famille dit

/**
 * Tout ce qu'on peut dire d'une famille, chaque chiffre avec son attendu.
 *
 * `key` est la dimension qui a servi à découper : elle décide de l'espérance
 * à laquelle on compare. `all` sert de repère — la famille contre
 * l'historique entier, sans quoi « 총합 moyen 138 » ne veut rien dire.
 */
export function familyStats(members, all, cells, key = null) {
  const n = members.length
  if (!n) return null
  const dim = key ? familyDimension(key) : null

  const counts = new Int32Array(NMAX + 1)
  const expected = new Float64Array(NMAX + 1)
  for (const r of members) {
    for (const v of r.numbers) counts[v]++
    const p = numberChances(r, cells, key)
    for (let v = 1; v <= NMAX; v++) expected[v] += p[v]
  }

  const obs = Array.from({ length: NMAX }, (_, k) => counts[k + 1])
  const exp = Array.from({ length: NMAX }, (_, k) => expected[k + 1])
  const chi = chiSquareFit(obs, exp, dim?.bound ?? 1)

  const ranked = obs
    .map((c, k) => ({
      number: k + 1,
      count: c,
      expected: exp[k],
      rate: c / n,
      lift: exp[k] > 0 ? c / exp[k] : null,
    }))
    .sort((a, b) => b.count - a.count || a.number - b.number)

  // Les quatre bandes. Leur attendu dépend de leur taille, qui change à
  // chaque 회차 — on l'accumule au lieu de le supposer fixe.
  const bands = new Map(TEMPERATURE_BANDS.map((b) => [b.name, { drawn: 0, expected: 0 }]))
  for (const r of members) {
    const board = cells[r.i - 1]
    const size = new Map(TEMPERATURE_BANDS.map((b) => [b.name, 0]))
    for (let v = 1; v <= NMAX; v++) {
      const b = bandOf(board[v - 1].gap)
      size.set(b, size.get(b) + 1)
    }
    for (const [name, cell] of bands) cell.expected += (PICK * size.get(name)) / NMAX
    for (const [name, v] of Object.entries(r.temp)) bands.get(name).drawn += v
  }

  const law = {
    odd: groupLaw(ODD_COUNT),
    low: groupLaw(LOW_MAX),
    small: groupLaw(SMALL_MAX),
    primes: groupLaw(PRIMES.length),
  }
  const spread = (field) => {
    const seen = new Array(PICK + 1).fill(0)
    for (const r of members) seen[r[field]]++
    return seen.map((c, k) => ({
      k, count: c, share: c / n, expected: law[field][k] * n,
    }))
  }
  const mean = (list, field) => list.reduce((a, r) => a + r[field], 0) / list.length

  return {
    n,
    share: n / all.length,
    numbers: { rows: ranked, chi, flat: n * BASE_RATE },
    bands: [...bands.entries()].map(([name, v]) => ({
      name,
      drawn: v.drawn,
      expected: v.expected,
      lift: v.expected ? v.drawn / v.expected : null,
    })),
    lists: {
      odd: spread('odd'), low: spread('low'),
      small: spread('small'), primes: spread('primes'),
    },
    sum: { here: mean(members, 'sum'), all: mean(all, 'sum') },
    carry: { here: mean(members, 'carry'), all: mean(all, 'carry') },
    repeat: { here: mean(members, 'repeat'), all: mean(all, 'repeat') },
  }
}

/**
 * Ce qui est arrivé au 회차 SUIVANT.
 *
 * C'est la seule question de cette page qui regarde vers l'avant, et donc la
 * seule qui puisse tromper. Elle est là parce que c'est celle qu'on se pose —
 * « après un 회차 sans 이월, que se passe-t-il ? » — et qu'il vaut mieux y
 * répondre avec son attendu à côté que la laisser à l'intuition.
 *
 * Ici l'espérance redevient l'uniforme : la famille décrit le 회차 d'avant,
 * elle n'impose rien au suivant. C'est précisément ce qu'on teste.
 */
export function familyNext(members, rows, all) {
  const byIndex = new Map(rows.map((r) => [r.i, r]))
  const nexts = members.map((r) => byIndex.get(r.i + 1)).filter(Boolean)
  if (!nexts.length) return null

  const counts = new Int32Array(NMAX + 1)
  for (const r of nexts) for (const v of r.numbers) counts[v]++
  const obs = Array.from({ length: NMAX }, (_, k) => counts[k + 1])
  const exp = new Array(NMAX).fill((nexts.length * PICK) / NMAX)
  const mean = (list, field) => list.reduce((a, r) => a + r[field], 0) / list.length

  return {
    n: nexts.length,
    chi: chiSquareFit(obs, exp, 1),
    // Le comptage lui-même, pour le graphe : 45 numéros contre l'uniforme.
    numbers: obs,
    flat: exp[0],
    carry: { here: mean(nexts, 'carry'), all: mean(all, 'carry') },
    repeat: { here: mean(nexts, 'repeat'), all: mean(all, 'repeat') },
    sum: { here: mean(nexts, 'sum'), all: mean(all, 'sum') },
    odd: { here: mean(nexts, 'odd'), all: mean(all, 'odd') },
    low: { here: mean(nexts, 'low'), all: mean(all, 'low') },
    small: { here: mean(nexts, 'small'), all: mean(all, 'small') },
  }
}
