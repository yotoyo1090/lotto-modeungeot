// 풀 검정 — un ensemble de numéros vaut-il mieux que le hasard ?
//
// Onze écrans décrivent les tirages. Aucun ne répond à la seule question qui
// décide : « ce que je viens de composer, est-ce mieux que d'écrire quarante-
// cinq numéros sur des papiers et d'en tirer autant au sort ? »
//
// La mesure est simple et ne demande aucune théorie. Un ensemble de T numéros
// doit attraper T × 6/45 gagnants par 회차. Ni plus, ni moins. On construit
// donc l'ensemble à chaque 회차 **sans jamais regarder ce 회차-là**, on compte
// ce qu'il attrape, et on compare.
//
// Deux précautions font toute la valeur du résultat :
//
//   la variance      les T cases d'un même 회차 ne sont pas indépendantes —
//                    il y a exactement six gagnants à se partager. La loi est
//                    hypergéométrique, sa variance porte le facteur
//                    (45 − T)/44. Sans lui, un ensemble large paraît
//                    significatif alors qu'il ne l'est pas.
//
//   les deux moitiés un effet réel se répète. C'est ce contrôle, et lui seul,
//                    qui a démasqué 차가운 : 14,16 % sur la première moitié de
//                    l'historique, 13,36 % sur la seconde. La façade tenait
//                    1 040 회차 ; le découpage l'a fait tomber.
//
// Ce fichier ne recommande aucun ensemble. Il dit si celui qu'on lui donne se
// distingue du hasard, et la réponse est presque toujours non.

import { NMAX, PICK } from './draws.js'
import { chiSquareP } from './stats.js'
import { allCells, boardColumns } from './tablelist.js'

/** La probabilité qu'un numéro donné sorte à un 회차 donné. */
export const BASE_RATE = PICK / NMAX          // 6/45 = 13,333 %

/** En deçà, il n'y a pas assez d'historique derrière pour décider. */
export const MIN_HISTORY = 60

/** Les règles proposées. `size` = l'ensemble est dimensionnable. */
export const POOL_RULES = [
  { key: 'carry', label: '이월', gloss: '직전 회차의 일곱 번호' },
  { key: 'hot', label: '뜨거운', gloss: '미출현 간격이 짧은 순', size: true },
  { key: 'cold', label: '차가운', gloss: '미출현 간격이 긴 순', size: true },
  { key: 'freq', label: '최근 최다', gloss: '최근 N회 최다 출현', size: true, window: true },
  { key: 'rare', label: '최근 최소', gloss: '최근 N회 최소 출현', size: true, window: true },
  { key: 'total', label: '전체 최다', gloss: '전 기간 최다 출현', size: true },
  { key: 'pattern', label: '패턴 라인', gloss: '직전 회차에 표시된 라인', size: true },
  { key: 'mine', label: '내 번호', gloss: '직접 고른 고정 번호', manual: true },
  { key: 'random', label: '무작위', gloss: '대조군 — 아무 정보도 쓰지 않음', size: true },
]

export const poolRule = (key) => POOL_RULES.find((r) => r.key === key) ?? null

/** Générateur pseudo-aléatoire à graine — deux appels de même graine, même tirage. */
function mulberry(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Les N premiers numéros selon un score, du plus grand au plus petit.
 *
 * Les ex æquo sont départagés par le numéro croissant : sans cela le résultat
 * dépendrait de l'ordre d'itération, et deux exécutions ne donneraient pas le
 * même ensemble.
 */
function topBy(score, n, descending = true) {
  const all = []
  for (let v = 1; v <= NMAX; v++) all.push(v)
  all.sort((a, b) => (descending ? score[b] - score[a] : score[a] - score[b]) || a - b)
  return all.slice(0, Math.min(n, NMAX)).sort((a, b) => a - b)
}

/**
 * L'état à la veille d'un 회차 : ce qu'on a le droit de regarder.
 *
 * `upTo` est le nombre de 회차 déjà connus. Rien au-delà n'est lu — c'est ce
 * qui rend la mesure honnête, et c'est la seule règle qui compte ici.
 */
function stateAt(draws, upTo, window) {
  const gap = new Int32Array(NMAX + 1)
  const total = new Int32Array(NMAX + 1)
  const recent = new Int32Array(NMAX + 1)
  const last = new Int32Array(NMAX + 1)

  for (let i = 0; i < upTo; i++) {
    const row = draws.fullAt(i)
    for (let j = 0; j < row.length; j++) {
      total[row[j]]++
      last[row[j]] = draws.rangs[i]
    }
  }
  const here = draws.rangs[upTo - 1]
  for (let n = 1; n <= NMAX; n++) gap[n] = here - last[n]

  const from = Math.max(0, upTo - window)
  for (let i = from; i < upTo; i++) {
    const row = draws.fullAt(i)
    for (let j = 0; j < row.length; j++) recent[row[j]]++
  }
  return { gap, total, recent, upTo }
}

/**
 * L'ensemble proposé pour le 회차 qui suit les `upTo` premiers.
 *
 * `cells` — les 45 cases de chaque 회차, telles que 패턴 les voit — n'est
 * nécessaire qu'à la règle `pattern` ; on le passe déjà calculé pour ne pas
 * remonter l'historique à chaque 회차.
 */
export function buildPool(draws, upTo, opts = {}) {
  const {
    rule = 'cold', size = 14, window = 30, numbers = [], rnd = Math.random,
    cells = null,
  } = opts

  if (rule === 'mine') {
    return [...new Set(numbers)].filter((n) => n >= 1 && n <= NMAX).sort((a, b) => a - b)
  }
  if (rule === 'carry') {
    return [...draws.fullAt(upTo - 1)].sort((a, b) => a - b)
  }
  if (rule === 'random') {
    const bag = []
    for (let n = 1; n <= NMAX; n++) bag.push(n)
    for (let k = bag.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [bag[k], bag[j]] = [bag[j], bag[k]]
    }
    return bag.slice(0, Math.min(size, NMAX)).sort((a, b) => a - b)
  }
  if (rule === 'pattern') {
    // Sur le tableau du 회차 upTo−2 on marque les sortis du 회차 upTo−1. Les
    // lignes qui portent une marque sont relues sur le tableau le plus
    // récent — un numéro par ligne, pris parmi ceux **en attente**.
    //
    // La colonne 당첨 est sautée, et c'est le point important : elle contient
    // exactement les sept numéros du 회차 précédent, c'est-à-dire le 이월. La
    // lire donnait à cette règle les mêmes numéros que `carry`, si bien que
    // les deux sources n'en faisaient qu'une et qu'un ensemble « 이월 + 패턴 »
    // comptait sept numéros au lieu de quatorze. En partant des colonnes
    // d'attente, la règle rend enfin des numéros qui lui sont propres.
    //
    // `cells` remonte tout l'historique : `poolCapture` le calcule une fois
    // et le passe. Appelée seule, la fonction le refait — correct, mais lent
    // si on la met dans une boucle sans lui donner `cells`.
    if (upTo < 2) return []
    const grid = cells ?? allCells(draws)
    const { columns } = boardColumns(grid[upTo - 2], draws.fullAt(upTo - 1))
    const lines = new Set()
    for (const col of columns) {
      col.entries.forEach((e, line) => { if (e.hit) lines.add(line) })
    }
    const board = boardColumns(grid[upTo - 1])
    const waiting = board.columns.slice(1)          // tout sauf 당첨
    const out = []
    const seen = new Set()
    for (const line of [...lines].sort((a, b) => a - b)) {
      for (const col of waiting) {
        const e = col.entries[line]
        if (!e || seen.has(e.number)) continue
        seen.add(e.number); out.push(e.number)
        break
      }
      if (out.length >= size) break
    }
    return out.sort((a, b) => a - b)
  }

  const s = stateAt(draws, upTo, window)
  if (rule === 'hot') return topBy(s.gap, size, false)
  if (rule === 'cold') return topBy(s.gap, size, true)
  if (rule === 'freq') return topBy(s.recent, size, true)
  if (rule === 'rare') return topBy(s.recent, size, false)
  if (rule === 'total') return topBy(s.total, size, true)
  throw new RangeError(`알 수 없는 규칙 : ${rule}`)
}

/** Le bilan d'une série de 회차 : ce qui a été attrapé contre ce qui était dû. */
function tally() {
  return { draws: 0, slots: 0, caught: 0, expected: 0, variance: 0 }
}

function fold(t, size, caught) {
  const p = BASE_RATE
  t.draws++
  t.slots += size
  t.caught += caught
  t.expected += size * p
  // Loi hypergéométrique : les six gagnants sont en nombre fixe, donc les T
  // cases d'un 회차 se disputent un total connu. Le facteur (45−T)/(45−1) est
  // la correction de population finie — sans elle un grand ensemble paraît
  // significatif à tort.
  t.variance += size * p * (1 - p) * ((NMAX - size) / (NMAX - 1))
}

function finish(t) {
  if (!t.draws || !t.variance) {
    return { ...t, rate: null, perDraw: null, z: null, p: null, lift: null }
  }
  const z = (t.caught - t.expected) / Math.sqrt(t.variance)
  return {
    ...t,
    rate: t.slots ? t.caught / t.slots : null,
    perDraw: t.caught / t.draws,
    expectedPerDraw: t.expected / t.draws,
    z,
    // χ² à un degré de liberté : sa queue supérieure en z² est exactement la
    // p bilatérale de la loi normale. On réutilise la fonction déjà vérifiée
    // plutôt que d'en écrire une seconde.
    p: chiSquareP(z * z, 1),
    lift: t.expected ? t.caught / t.expected : null,
  }
}

/**
 * La mesure complète, en marche avant stricte.
 *
 * Pour chaque 회차 à partir de `from`, on compose l'ensemble avec les seuls
 * 회차 antérieurs, puis on compte combien des six gagnants s'y trouvaient.
 *
 * Le résultat porte trois bilans : l'ensemble de la période, sa première
 * moitié et sa seconde. C'est la comparaison des deux moitiés qui tranche —
 * un effet réel s'y répète, une coïncidence n'y survit pas.
 */
export function poolCapture(draws, opts = {}) {
  const { rule = 'cold', from = null, seed = 0x5EED } = opts
  const needsCells = rule === 'pattern'
  const cells = needsCells ? (opts.cells ?? allCells(draws)) : null
  const rnd = mulberry(seed)

  const startIndex = Math.max(
    MIN_HISTORY,
    from === null ? MIN_HISTORY : draws.rangs.findIndex((r) => r >= from),
  )
  if (startIndex < MIN_HISTORY || startIndex >= draws.n) {
    return { ok: false, why: '검정할 회차가 부족합니다' }
  }

  const mid = Math.floor((startIndex + draws.n) / 2)
  const whole = tally()
  const first = tally()
  const second = tally()
  const dist = new Map()
  const sizes = []
  const distinct = new Set()
  const per = []

  for (let i = startIndex; i < draws.n; i++) {
    const pool = buildPool(draws, i, { ...opts, rnd, cells })
    if (!pool.length) continue
    const win = draws.numbersAt(i)
    let caught = 0
    for (let j = 0; j < win.length; j++) if (pool.includes(win[j])) caught++

    fold(whole, pool.length, caught)
    fold(i < mid ? first : second, pool.length, caught)
    dist.set(caught, (dist.get(caught) ?? 0) + 1)
    sizes.push(pool.length)
    distinct.add(pool.join(','))
    per.push({ rang: draws.rangs[i], size: pool.length, caught })
  }

  if (!whole.draws) return { ok: false, why: '검정할 회차가 부족합니다' }

  const meanSize = sizes.reduce((a, b) => a + b, 0) / sizes.length
  return {
    ok: true,
    rule,
    span: [draws.rangs[startIndex], draws.rangs[draws.n - 1]],
    meanSize,
    // Combien de fois l'ensemble a réellement changé. Une règle qui ne change
    // presque jamais d'avis n'a pas mesuré 1 000 fois, elle a mesuré une fois
    // et attendu — c'est exactement ce qui rendait 차가운 trompeur.
    distinct: distinct.size,
    whole: finish(whole),
    first: finish(first),
    second: finish(second),
    dist,
    per,
    expectedDist: hyperDist(Math.round(meanSize), whole.draws),
  }
}

/** La répartition attendue du nombre de gagnants attrapés, pour un ensemble de T. */
export function hyperDist(size, draws = 1) {
  const c = (n, k) => {
    if (k < 0 || k > n) return 0
    let r = 1
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
    return r
  }
  const out = []
  const total = c(NMAX, PICK)
  for (let k = 0; k <= PICK; k++) {
    out.push((c(size, k) * c(NMAX - size, PICK - k) / total) * draws)
  }
  return out
}

/**
 * Le verdict, en clair.
 *
 * Trois issues seulement, et la première est de très loin la plus fréquente.
 * Le seuil est volontairement sévère : |z| ≥ 2 ne suffit pas si les deux
 * moitiés ne vont pas dans le même sens, parce que c'est précisément la forme
 * que prend une coïncidence sur cette base.
 */
export function poolVerdict(result) {
  if (!result?.ok) return { key: 'none', label: '검정 불가', gloss: result?.why ?? '' }
  const { whole, first, second } = result
  const strong = Math.abs(whole.z) >= 2
  const agree = first.z !== null && second.z !== null
    && Math.sign(first.z) === Math.sign(second.z)
    && Math.abs(first.z) >= 1 && Math.abs(second.z) >= 1

  if (strong && agree) {
    return {
      key: 'signal',
      label: whole.z > 0 ? '우연보다 낫습니다' : '우연보다 못합니다',
      gloss: '전반부와 후반부가 같은 방향 — 다시 확인할 가치가 있습니다',
    }
  }
  if (strong) {
    return {
      key: 'fragile',
      label: '전체로는 커 보이지만 반복되지 않습니다',
      gloss: '한쪽 절반에만 있습니다 — 우연의 전형적인 모습입니다',
    }
  }
  return {
    key: 'chance',
    label: '우연과 구별되지 않습니다',
    gloss: '이 정도 차이는 무작위 묶음에서도 늘 나옵니다',
  }
}
