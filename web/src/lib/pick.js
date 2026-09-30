// Quelles grilles montrer, parmi celles que le moteur a trouvées.
//
// Le moteur parcourt toujours tout ; il ne garde que ce qu'on lui demande.
// Deux façons de le lui demander :
//   · 무작위 — un tirage au sort (réservoir), chaque grille a la même chance ;
//   · 번호 순 — les premières dans l'ordre 1-2-3-4-5-6, 1-2-3-4-5-7…
// Avant ce choix, les écrans ne faisaient que la seconde : sur 4 millions de
// grilles qui passaient, les 5 000 montrées commençaient toutes par 1.
//
// Pas de plafond d'écran : seulement celui du moteur (un million). Pour tenir
// à cette taille, rien ici ne décrit une grille entière — on travaille sur des
// **positions** dans `result.grids` : le filtre et le tri mesurent seulement la
// colonne demandée, et l'écran ne décrit que la page qu'il affiche.
import { HEAD, IS_COMPOSITE, IS_PRIME, LOW_MAX, TAIL } from '@core/draws.js'
import { acValue, MULTIPLES } from '@core/metrics.js'
import { sharing } from '@core/sharing.js'

export const MODES = [
  { key: 'random', label: '무작위' },
  { key: 'order', label: '번호 순' },
]

export const DEFAULT_COUNT = 100

/** Le plafond du moteur : il ne garde jamais plus d'un million de grilles. */
export const ENGINE_MAX = 1_000_000

/** Une page d'écran. */
export const PAGE = 500

/** Les options du moteur pour ce mode — `max` grilles gardées au plus. */
export function engineOptions(mode, max) {
  return mode === 'order'
    ? { limit: max }
    : { sample: max, seed: Math.floor(Math.random() * 0x7fffffff) }
}

/**
 * Mélange les grilles sur place (Fisher–Yates, par blocs de `pick`).
 *
 * Le réservoir ne mélange rien quand tout tient dedans : les grilles restent
 * alors dans l'ordre des numéros, et « les N premières » redeviendraient les
 * plus petites. Mélangées, les N premières sont un vrai tirage au sort.
 */
export function shuffleGrids(grids, pick = 6) {
  const n = Math.floor(grids.length / pick)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    if (j === i) continue
    for (let k = 0; k < pick; k++) {
      const t = grids[i * pick + k]
      grids[i * pick + k] = grids[j * pick + k]
      grids[j * pick + k] = t
    }
  }
  return grids
}

/** La grille numéro `i` de `result.grids` (six numéros à la suite). */
export const gridAt = (grids, i) => grids.slice(i * 6, i * 6 + 6)

// ── 정렬 · 결과 필터 ────────────────────────────────────────────────────

export const SORTS = [
  { key: 'none', label: '그대로' },
  // 일 … 육 : le k-ième plus petit numéro, les six premières colonnes du tableau.
  ...['일', '이', '삼', '사', '오', '육'].map((label, k) => ({ key: `pos${k + 1}`, label })),
  { key: 'total', label: '총합' },
  { key: 'ac', label: 'AC값' },
  { key: 'odd', label: '홀수 개수' },
  { key: 'low', label: '저번호 개수' },
  { key: 'carried', label: '이월 개수' },
  { key: 'carriedSum', label: '이월합' },
  { key: 'headSum', label: '앞자리수합' },
  { key: 'tailSum', label: '끝자리수합' },
  { key: 'headRepeat', label: '앞쌍' },
  { key: 'tailRepeat', label: '끝쌍' },
  { key: 'primes', label: '소수 개수' },
  { key: 'primeSum', label: '소수합' },
  { key: 'composites', label: '합성수 개수' },
  { key: 'compositeSum', label: '합성수합' },
  ...MULTIPLES.flatMap((m) => [
    { key: `mult${m}`, label: `${m}의배수 개수` },
    { key: `mult${m}Sum`, label: `${m}의배수합` },
  ]),
  { key: 'sharing', label: '분배 지표' },
  { key: 'popularity', label: '수동 인기' },
  // Seulement quand le 회차 visé est déjà tiré (l'écran le cache sinon) :
  // combien de numéros de la grille sont dans ses sept numéros.
  { key: 'won', label: '당첨 개수' },
]

export const FILTER_KEYS = SORTS.filter((s) => s.key !== 'none')

/**
 * Une colonne, mesurée sur les six numéros — la même définition que les
 * tableaux (`describe`, `describeRow`) : 총합, AC값, 홀수, 저번호 (≤ LOW_MAX),
 * 이월 = numéros repris du tirage précédent, 분배 et 수동 = `sharing()`.
 */
function measure(nums, key, previous, next = null) {
  switch (key) {
    case 'won': {
      if (!next) return 0
      let c = 0
      for (const v of nums) if (next.includes(v)) c++
      return c
    }
    case 'total': { let s = 0; for (const v of nums) s += v; return s }
    case 'ac': return acValue(nums)
    case 'odd': { let c = 0; for (const v of nums) if (v % 2 === 1) c++; return c }
    case 'low': { let c = 0; for (const v of nums) if (v <= LOW_MAX) c++; return c }
    case 'carried': {
      if (!previous) return 0
      let c = 0
      for (const v of nums) if (previous.includes(v)) c++
      return c
    }
    case 'carriedSum': {
      if (!previous) return 0
      let s = 0
      for (const v of nums) if (previous.includes(v)) s += v
      return s
    }
    case 'headSum': { let s = 0; for (const v of nums) s += HEAD[v]; return s }
    case 'tailSum': { let s = 0; for (const v of nums) s += TAIL[v]; return s }
    case 'headRepeat': return mostSame(nums, HEAD)
    case 'tailRepeat': return mostSame(nums, TAIL)
    case 'primes': { let c = 0; for (const v of nums) c += IS_PRIME[v]; return c }
    case 'composites': { let c = 0; for (const v of nums) c += IS_COMPOSITE[v]; return c }
    case 'primeSum': { let s = 0; for (const v of nums) if (IS_PRIME[v]) s += v; return s }
    case 'compositeSum': { let s = 0; for (const v of nums) if (IS_COMPOSITE[v]) s += v; return s }
    case 'sharing':
    case 'popularity': {
      try {
        const s = sharing([...nums])
        return key === 'sharing' ? s.index : s.popularity
      } catch {
        return Infinity
      }
    }
    default: {
      // 일 … 육 : les grilles du moteur sont déjà triées ; on retrie quand même,
      // une grille venue d'ailleurs ne l'est pas forcément.
      const p = POS_KEY.exec(key)
      if (p) return [...nums].sort((a, b) => a - b)[Number(p[1]) - 1]
      // 2~5의배수 : `mult3` = combien, `mult3Sum` = leur somme.
      const m = MULT_KEY.exec(key)
      if (!m) return 0
      const d = Number(m[1])
      let c = 0
      let s = 0
      for (const v of nums) if (v % d === 0) { c++; s += v }
      return m[2] ? s : c
    }
  }
}

const MULT_KEY = /^mult(\d)(Sum)?$/
const POS_KEY = /^pos([1-6])$/

/** Combien de numéros partagent le chiffre le plus fréquent — 앞쌍 / 끝쌍. */
function mostSame(nums, digit) {
  const seen = new Int8Array(10)
  let best = 0
  for (const v of nums) best = Math.max(best, ++seen[digit[v]])
  return best
}

const bound = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v))
  ? null : Number(v))

/** Les conditions qui bornent vraiment quelque chose. */
export function activeConds(conds) {
  return conds
    .map((c) => ({ key: c.key, min: bound(c.min), max: bound(c.max) }))
    .filter((c) => c.min !== null || c.max !== null)
}

// ── 결과 필터 → moteur ─────────────────────────────────────────────────
//
// Toutes les colonnes du 결과 필터 ont leur équivalent dans le moteur : elles
// lui sont envoyées, et filtrent alors les 8 145 060 grilles **avant** le
// tirage du 개수. 이월 a besoin du 회차 précédent, 당첨 개수 du 회차 visé
// déjà tiré : sans eux, la condition reste sur les grilles tirées.
// Où chaque colonne se range dans les filtres du moteur : un nom, ou un nom
// et un multiple (`multiples[3]`, `multSums[3]`).
const ENGINE_PATH = {
  total: ['total'], ac: ['ac'], odd: ['odd'], low: ['low'], carried: ['match'], won: ['hit'],
  carriedSum: ['carriedSum'], headSum: ['headSum'], tailSum: ['tailSum'],
  headRepeat: ['headRepeat'], tailRepeat: ['tailRepeat'],
  primes: ['primes'], composites: ['composites'],
  primeSum: ['primeSum'], compositeSum: ['compositeSum'],
  ...Object.fromEntries(MULTIPLES.flatMap((m) => [
    [`mult${m}`, ['multiples', m]], [`mult${m}Sum`, ['multSums', m]],
  ])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((k) => [`pos${k}`, ['positions', k]])),
}

export const ENGINE_KEYS = new Set([...Object.keys(ENGINE_PATH), 'sharing', 'popularity'])

// Les colonnes qui comparent au 회차 précédent : sans lui, elles restent
// sur les grilles tirées (« 뽑힌 것만 »).
export const NEEDS_PREVIOUS = ['carried', 'carriedSum']

// Les bornes naturelles de chaque compte, pour une case laissée vide. Les
// sommes n'ont pas besoin d'une borne serrée : [0, 255] les contient toutes.
const COUNTS = ['odd', 'low', 'carried', 'won', 'primes', 'composites']
function spanOf(key) {
  if (key === 'total') return [21, 255]
  if (key === 'ac') return [0, 10]
  if (key === 'headRepeat' || key === 'tailRepeat') return [1, 6]
  if (/^pos\d$/.test(key)) return [1, 45]
  if (COUNTS.includes(key) || /^mult\d$/.test(key)) return [0, 6]
  return [0, 255]
}

/**
 * Combine les conditions du 결과 필터 avec les filtres du moteur (les cases
 * du haut). Rend `{ filters, rest }` — `rest` : ce qui reste à faire sur les
 * grilles tirées — ou `{ impossible: key }` si une condition ne laisse rien
 * passer avec les cases du haut.
 */
export function mergeConds(filters, conds, previous = null, next = null) {
  const out = { ...filters }
  const rest = []
  for (const c of activeConds(conds)) {
    if (!ENGINE_KEYS.has(c.key)
      || (NEEDS_PREVIOUS.includes(c.key) && !previous)
      || (c.key === 'won' && !next)) { rest.push(c); continue }

    // Les deux réels (분배, 수동 인기) : deux bornes, pas de masque.
    if (c.key === 'sharing' || c.key === 'popularity') {
      const [a, b] = out[c.key] ?? [0, Infinity]
      const lo = Math.max(a, c.min ?? 0)
      const hi = Math.min(b, c.max ?? Infinity)
      if (lo > hi) return { impossible: c.key }
      out[c.key] = [lo, Number.isFinite(hi) ? hi : 1e9]
      continue
    }

    // Les autres sont des comptes entiers : bornes arrondies vers l'intérieur.
    const [name, m] = ENGINE_PATH[c.key]
    const [s0, s1] = spanOf(c.key)
    const lo = Math.max(s0, Math.ceil(c.min ?? s0))
    const hi = Math.min(s1, Math.floor(c.max ?? s1))
    if (lo > hi) return { impossible: c.key }

    // `multiples` / `multSums` sont copiés avant d'être touchés : les
    // filtres reçus appartiennent à l'écran.
    const cur = m === undefined ? out[name] : out[name]?.[m]
    let merged
    if (Array.isArray(cur)) {
      const a = Math.max(cur[0], lo)
      const b = Math.min(cur[1], hi)
      if (a > b) return { impossible: c.key }
      merged = [a, b]
    } else if (cur && Array.isArray(cur.allow)) {
      const allow = cur.allow.filter((v) => v >= lo && v <= hi)
      if (!allow.length) return { impossible: c.key }
      merged = { allow }
    } else {
      merged = [lo, hi]
    }
    if (m === undefined) out[name] = merged
    else out[name] = { ...out[name], [m]: merged }
    if (NEEDS_PREVIOUS.includes(c.key)) out.reference = previous
    if (c.key === 'won') out.hitReference = next
  }
  return { filters: out, rest }
}

/**
 * Les positions à montrer, dans l'ordre : les `n` premières grilles de
 * `grids`, filtrées (결과 필터), puis triées (정렬). Tri stable : à valeur
 * égale, l'ordre du 방식 est gardé. Chaque mesure n'est faite qu'une fois
 * par grille, et seulement pour les colonnes demandées.
 */
export function pickIndices(grids, n, {
  conds = [], sortKey = 'none', dir = 'asc', previous = null, next = null,
} = {}) {
  let idx = Array.from({ length: n }, (_, i) => i)

  const active = activeConds(conds)
  if (active.length) {
    idx = idx.filter((i) => {
      const nums = gridAt(grids, i)
      return active.every((c) => {
        const v = measure(nums, c.key, previous, next)
        return (c.min === null || v >= c.min) && (c.max === null || v <= c.max)
      })
    })
  }

  if (sortKey && sortKey !== 'none') {
    const sign = dir === 'desc' ? -1 : 1
    const v = new Float64Array(idx.length)
    for (let k = 0; k < idx.length; k++) v[k] = measure(gridAt(grids, idx[k]), sortKey, previous, next)
    const order = Array.from({ length: idx.length }, (_, k) => k)
    order.sort((a, b) => (v[a] === v[b] ? a - b : v[a] < v[b] ? -sign : sign))
    idx = order.map((k) => idx[k])
  }
  return idx
}

/**
 * Combien de grilles de la liste ont fait 0, 1, … 6 numéros du tirage
 * `next` (ses sept numéros). Rend null si le 회차 n'est pas tiré.
 */
export function wonCounts(grids, idx, next) {
  if (!next) return null
  const out = [0, 0, 0, 0, 0, 0, 0]
  for (const i of idx) out[measure(gridAt(grids, i), 'won', null, next)]++
  return out
}

/** Le nombre tapé, ramené entre 1 et `max` ; `DEFAULT_COUNT` s'il est illisible. */
export function clampCount(value, max) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return Math.min(DEFAULT_COUNT, max)
  return Math.min(n, max)
}
