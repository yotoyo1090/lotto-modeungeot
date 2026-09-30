// 사(沙) — les « sacs » que chaque écran fabrique, et ce qu'ils attrapent.
//
// Le rapport du 2026-09-03 était un fichier HTML aux chiffres figés. Ici les
// mêmes vingt-huit sacs se recalculent depuis les tirages : un 회차 de plus,
// et toutes les colonnes bougent. C'est le point — rien n'est écrit en dur.
//
// Un sac est une liste de numéros construite **avant** le tirage, avec les
// seules données des 회차 précédents. On compte ensuite combien des sept
// numéros (six + 보너스) tombent dedans, et on compare à ce que la taille
// du sac impose : 7 × taille / 45.
//
// Le complément (여집합) d'un sac est le sac inverse — les numéros qu'il
// laisse dehors. Il ne dit rien de neuf sur l'attrape (attrape = 7 − attrape)
// mais son **ratio** est une vraie mesure, puisque sa taille change.

import { FULL, NMAX, PICK, SECTIONS } from './draws.js'

/** Les sept numéros valent autant : c'est la base de tout le fichier. */
export const HIT = FULL / NMAX

const upTo = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
const EVEN = upTo(1, NMAX).filter((n) => n % 2 === 0)

/**
 * L'état des 45 numéros **avant** le 회차 d'indice i.
 *
 * `gap` compte depuis la dernière sortie (bonus compris), `window10` les
 * sorties des dix 회차 précédents, `freq` toutes les sorties d'avant,
 * `place` la fréquence par position, `pair` les co-sorties.
 */
export function sandState(draws, i, rang = draws.rangs[i]) {
  const last = new Int32Array(NMAX + 1)
  const window10 = new Int32Array(NMAX + 1)
  const freq = new Int32Array(NMAX + 1)
  const place = Array.from({ length: FULL }, () => new Int32Array(NMAX + 1))
  const pair = Array.from({ length: NMAX + 1 }, () => new Int32Array(NMAX + 1))

  for (let k = 0; k < i; k++) {
    const row = draws.fullAt(k)
    for (let j = 0; j < FULL; j++) {
      last[row[j]] = draws.rangs[k]
      freq[row[j]]++
    }
    // Les « places » sont celles de l'affichage — 일..육 puis 보너스 — pas
    // l'ordre des sept triés ensemble. `sequenceAt` porte exactement ça.
    const seq = draws.sequenceAt(k)
    for (let j = 0; j < FULL; j++) place[j][seq[j]]++
    // Les « amis » se comptent sur les six tirés : le 보너스 n'est pas
    // compagnon, il est tiré à part.
    const six = draws.numbersAt(k)
    for (let a = 0; a < PICK; a++) {
      for (let b = a + 1; b < PICK; b++) {
        pair[six[a]][six[b]]++
        pair[six[b]][six[a]]++
      }
    }
    if (k >= i - 10) for (let j = 0; j < FULL; j++) window10[row[j]]++
  }

  const gap = new Int32Array(NMAX + 1)
  for (let n = 1; n <= NMAX; n++) gap[n] = last[n] ? rang - last[n] : rang

  return { gap, window10, freq, place, pair, previous: i > 0 ? draws.fullAt(i - 1) : [] }
}

const pick = (test) => {
  const out = []
  for (let n = 1; n <= NMAX; n++) if (test(n)) out.push(n)
  return out
}

/** Les trois plus fréquents à chacune des sept places — ex aequo exclus. */
const topPlaces = (s) => {
  const keep = new Set()
  for (let p = 0; p < FULL; p++) {
    const order = []
    for (let n = 1; n <= NMAX; n++) if (s.place[p][n]) order.push([n, s.place[p][n]])
    order.sort((a, b) => b[1] - a[1] || a[0] - b[0])
    for (let t = 0; t < 3 && t < order.length; t++) keep.add(order[t][0])
  }
  return keep
}

/** Les trois meilleurs compagnons de chacun des sept numéros précédents. */
const topFriends = (s) => {
  const keep = new Set()
  for (const n of s.previous) {
    const order = []
    for (let m = 1; m <= NMAX; m++) if (m !== n) order.push([m, s.pair[n][m]])
    order.sort((a, b) => b[1] - a[1] || a[0] - b[0])
    for (let t = 0; t < 3; t++) keep.add(order[t][0])
  }
  return keep
}

/** Les douze pairs les plus sortis, tout l'historique d'avant. */
const topEven = (s) => {
  const order = EVEN.map((n) => [n, s.freq[n]])
  order.sort((a, b) => b[1] - a[1] || a[0] - b[0])
  return new Set(order.slice(0, 12).map((x) => x[0]))
}

/**
 * Les 구간 allumés au 회차 précédent.
 *
 * La règle est celle de `sections.js`, reprise telle quelle : un 구간 vide
 * est éteint, et un 구간 qui ne porte qu'un seul numéro entre 10 et 19
 * l'est aussi — le test s'applique aux cinq, pas seulement au 십.
 */
const litSections = (s) => {
  const lit = new Uint8Array(NMAX + 1)
  for (const [lo, hi] of SECTIONS) {
    const cell = s.previous.filter((n) => n >= lo && n <= hi).sort((a, b) => a - b)
    const off = cell.length === 0 || (cell.length === 1 && cell[0] >= 10 && cell[0] <= 19)
    if (!off) for (let n = lo; n <= hi; n++) lit[n] = 1
  }
  return lit
}

/**
 * Le générateur pseudo-aléatoire du témoin.
 *
 * Il est **semé**, donc reproductible : le 대조군 du rapport et celui de
 * l'écran sont le même tirage, sinon les deux ne se compareraient pas.
 */
export function seeded(seed) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Les quatorze sacs de base, dans l'ordre du rapport.
 *
 * `make` reçoit l'état d'avant le 회차 et rend la liste des numéros. Deux
 * d'entre eux ont besoin d'un tirage au sort : ils reçoivent `rnd`.
 */
export const SAND_BAGS = [
  { key: 'hot', label: '차뜨 hot (gap ≤ 5)', screen: '흐름 · 차뜨',
    make: (s) => pick((n) => s.gap[n] <= 5) },
  { key: 'midle', label: '차뜨 midle (6~10)', screen: '흐름 · 차뜨',
    make: (s) => pick((n) => s.gap[n] >= 6 && s.gap[n] <= 10) },
  { key: 'cold', label: '차뜨 cold (gap 11~19)', screen: '흐름 · 차뜨',
    make: (s) => pick((n) => s.gap[n] >= 11 && s.gap[n] <= 19) },
  { key: 'dead', label: '차뜨 dead (20+)', screen: '흐름 · 차뜨',
    make: (s) => pick((n) => s.gap[n] >= 20) },
  { key: 'table', label: '테이블 gap 1~3열', screen: '테이블',
    make: (s) => pick((n) => s.gap[n] >= 1 && s.gap[n] <= 3) },
  // Ces quatre-là forment déjà deux paires complémentaires : 미출현 est le
  // complément de 출현, 꺼진 celui de 켜진. Leur « 여집합 » serait une copie
  // d'une ligne voisine, alors on ne le fabrique pas — d'où 28 lignes et non 32.
  { key: 'absent', label: '제외번호 직전10회 미출현', screen: '제외번호', paired: true,
    make: (s) => pick((n) => s.window10[n] === 0) },
  { key: 'present', label: '제외번호 직전10회 출현', screen: '제외번호', paired: true,
    make: (s) => pick((n) => s.window10[n] > 0) },
  { key: 'sectionOff', label: '구간 꺼진 구간', screen: '구간', paired: true,
    make: (s) => { const lit = litSections(s); return pick((n) => !lit[n]) } },
  { key: 'sectionOn', label: '구간 켜진 구간', screen: '구간', paired: true,
    make: (s) => { const lit = litSections(s); return pick((n) => lit[n] === 1) } },
  { key: 'even', label: '리스트 가족 전체 (짝수)', screen: '리스트',
    make: () => EVEN.slice() },
  { key: 'top12', label: '리스트 최다 출현 12 (짝수)', screen: '리스트',
    make: (s) => [...topEven(s)].sort((a, b) => a - b) },
  { key: 'places', label: '당첨위치 자리별 최다3', screen: '당첨 위치',
    make: (s) => [...topPlaces(s)].sort((a, b) => a - b) },
  { key: 'friends', label: '친구 직전7개의 친구3', screen: '친구 · 중복',
    make: (s) => [...topFriends(s)].sort((a, b) => a - b) },
  { key: 'witness', label: '대조군 — 무작위 20개', screen: '(대조군)', witness: true,
    make: (s, rnd) => {
      const out = new Set()
      while (out.size < 20) out.add(1 + Math.floor(rnd() * NMAX))
      return [...out].sort((a, b) => a - b)
    } },
  { key: 'oracle15', label: '당첨 2개 + 채움 15', screen: '(기준자)', oracle: true, fill: 15,
    make: (s, rnd, drawn) => oracleBag(drawn, 15, rnd) },
  { key: 'oracle20', label: '당첨 2개 + 채움 20', screen: '(기준자)', oracle: true, fill: 20,
    make: (s, rnd, drawn) => oracleBag(drawn, 20, rnd) },
]

/**
 * Le sac « informé » : deux numéros gagnants, puis du remplissage.
 *
 * Il ne se joue pas — on ne connaît pas les deux à l'avance. Il sert de
 * règle graduée : voilà jusqu'où monte un sac quand l'information y est.
 */
function oracleBag(drawn, size, rnd) {
  const a = drawn[Math.floor(rnd() * PICK)]
  let b = drawn[Math.floor(rnd() * PICK)]
  while (b === a) b = drawn[Math.floor(rnd() * PICK)]
  const bag = new Set([a, b])
  while (bag.size < size) bag.add(1 + Math.floor(rnd() * NMAX))
  return [...bag].sort((x, y) => x - y)
}

const blank = (bag, complement) => ({
  key: complement ? `not:${bag.key}` : bag.key,
  label: complement ? `여집합 ▸ ${bag.label}` : bag.label,
  screen: bag.screen,
  complement,
  oracle: bag.oracle === true,
  witness: bag.witness === true,
  used: 0,
  total: 0,
  expected: 0,
  variance: 0,
  sizeSum: 0,
  sizeMin: NMAX,
  sizeMax: 0,
  spread: new Array(FULL + 1).fill(0),
  series: [],
})

/**
 * Tout mesurer, en une passe.
 *
 * `from` est le premier 회차 pris en compte : les tout premiers n'ont pas
 * d'historique derrière eux, et le rapport commençait au 401. `series` garde
 * un point par 회차 — c'est lui que le graphe de la modale dessine, et c'est
 * pour ça que la courbe s'allonge d'elle-même à chaque tirage ajouté.
 */
export function sandSeries(draws, { from = 401, seed = 51, oracleSeed = 4242 } = {}) {
  const start = Math.max(1, draws.indexOf(from))
  const rows = SAND_BAGS.flatMap((bag) => (bag.paired
    ? [blank(bag, false), null]
    : [blank(bag, false), blank(bag, true)]))
  const rnd = seeded(seed)
  const orc = SAND_BAGS.filter((b) => b.oracle).map(() => seeded(oracleSeed))

  for (let i = start; i < draws.n; i++) {
    const state = sandState(draws, i)
    const row = draws.fullAt(i)
    const won = new Uint8Array(NMAX + 1)
    for (let j = 0; j < FULL; j++) won[row[j]] = 1
    const drawn = draws.numbersAt(i)

    let o = 0
    SAND_BAGS.forEach((bag, b) => {
      const source = bag.oracle ? orc[o++] : rnd
      const list = bag.make(state, source, drawn)
      const size = list.length
      if (size === 0 || size === NMAX) return
      let hit = 0
      for (const n of list) if (won[n]) hit++
      fold(rows[b * 2], draws.rangs[i], size, hit)
      if (rows[b * 2 + 1]) fold(rows[b * 2 + 1], draws.rangs[i], NMAX - size, FULL - hit)
    })
  }

  return rows.filter((r) => r && r.used > 0).map(finish).sort((a, b) => a.size - b.size)
}

function fold(row, rang, size, hit) {
  row.used++
  row.total += hit
  row.sizeSum += size
  if (size < row.sizeMin) row.sizeMin = size
  if (size > row.sizeMax) row.sizeMax = size
  row.spread[hit]++
  const expected = (FULL * size) / NMAX
  row.expected += expected
  row.variance += size * HIT * (1 - HIT) * ((NMAX - size) / (NMAX - 1))
  // Le point du graphe : le ratio **cumulé**, celui qui se stabilise.
  row.series.push({ rang, size, hit, ratio: row.total / row.expected })
}

function finish(row) {
  row.size = row.sizeSum / row.used
  row.mean = row.total / row.used
  row.expectedMean = row.expected / row.used
  row.ratio = row.expected ? row.total / row.expected : 0
  row.z = row.variance ? (row.total - row.expected) / Math.sqrt(row.variance) : 0
  row.hitMin = row.spread.findIndex((v) => v > 0)
  row.hitMax = row.spread.length - 1 - [...row.spread].reverse().findIndex((v) => v > 0)
  row.three = row.spread.slice(3).reduce((a, b) => a + b, 0)
  return row
}

/**
 * La loi exacte : combien de 회차 « auraient dû » attraper k numéros ou plus,
 * si le sac de cette taille-là n'était que du hasard.
 *
 * Hypergéométrique, taille par taille — un sac qui respire (6 numéros un
 * 회차, 29 le suivant) n'a pas une espérance unique.
 */
export function sandExpectedAtLeast(row, k = 3) {
  const c = (n, r) => {
    if (r < 0 || r > n) return 0
    let out = 1
    for (let j = 0; j < r; j++) out = (out * (n - j)) / (j + 1)
    return out
  }
  let sum = 0
  for (const point of row.series) {
    let p = 0
    for (let h = k; h <= FULL; h++) {
      p += (c(FULL, h) * c(NMAX - FULL, point.size - h)) / c(NMAX, point.size)
    }
    sum += p
  }
  return sum
}

/**
 * Ce que coûte une exclusion : combien de 꽝 on efface par 당첨 sacrifié.
 *
 * Exclure un sac, c'est garder son complément. Le repère est invariable —
 * 38 perdants pour 7 gagnants, soit 5.43 — et aucun écran ne l'a battu.
 */
export const KILL_BASE = (NMAX - FULL) / FULL

export function sandKillValue(row) {
  // On jette **ce sac-ci**. Il emporte ses numéros perdants — tant mieux — et
  // ses numéros gagnants — c'est le prix. Le rapport du 2026-09-03 portait ces
  // chiffres sous le nom du complément : les valeurs étaient bonnes, les
  // étiquettes inversées.
  const removed = row.size
  const lostWinners = row.mean
  return {
    removed,
    lostWinners,
    removedLosers: removed - lostWinners,
    value: lostWinners ? (removed - lostWinners) / lostWinners : Infinity,
  }
}

/**
 * Le même sac, mais sur les `count` derniers 회차 seulement.
 *
 * Sert la question « et si on ne regardait que le récent ? ». La réponse est
 * toujours la même : la fenêtre courte gonfle le chiffre et vide le sens.
 */
export function sandWindow(row, count = Infinity) {
  const points = row.series.slice(Math.max(0, row.series.length - count))
  let total = 0
  let expected = 0
  let variance = 0
  for (const p of points) {
    total += p.hit
    expected += (FULL * p.size) / NMAX
    variance += p.size * HIT * (1 - HIT) * ((NMAX - p.size) / (NMAX - 1))
  }
  return {
    used: points.length,
    total,
    ratio: expected ? total / expected : 0,
    z: variance ? (total - expected) / Math.sqrt(variance) : 0,
  }
}

/** Le bruit d'une fenêtre : ±% attendu, et le ratio qu'il faudrait pour z = 2. */
export function sandNoise(count, size = 20) {
  const expected = (FULL * size * count) / NMAX
  const variance = count * size * HIT * (1 - HIT) * ((NMAX - size) / (NMAX - 1))
  const sd = Math.sqrt(variance)
  return { count, noise: sd / expected, needed: 1 + (2 * sd) / expected }
}

/**
 * Les sacs du **prochain** 회차 — les numéros, pas les statistiques.
 *
 * L'état se construit après le dernier tirage connu : c'est ce que les écrans
 * afficheraient aujourd'hui. Les deux sacs informés sont exclus, faute des
 * deux numéros gagnants qu'ils demandent.
 */
export function sandNext(draws) {
  const rang = draws.rangs[draws.n - 1] + 1
  const state = sandState(draws, draws.n, rang)
  const rnd = seeded(51)
  return {
    rang,
    bags: SAND_BAGS.filter((b) => !b.oracle).map((bag) => ({
      key: bag.key,
      label: bag.label,
      screen: bag.screen,
      witness: bag.witness === true,
      numbers: bag.make(state, rnd, []),
    })),
  }
}

export { NMAX, FULL }
