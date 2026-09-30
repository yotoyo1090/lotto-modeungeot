// 테이블리스트 — le 차뜨 d'un 회차, rangé en colonnes.
//
// La page prend les 45 numéros tels que le 패턴 les voit à un 회차 donné —
// sortis (당첨 · 이월 · (n)이월) ou en attente depuis tant de tirages — et les
// empile en colonnes : une colonne 당첨 pour les sept sortis, puis une
// colonne par écart, 0, 1, 2… C'est le même tableau que l'onglet 흐름, pivoté
// d'un quart de tour : au lieu de lire numéro par numéro, on lit écart par
// écart, et on voit d'un coup combien de numéros attendent depuis autant de
// tirages.
//
// Les cinq comptages du haut de page mesurent autre chose : ils regardent où
// se trouvaient, sur ce tableau-ci, les sept numéros qui sont sortis **au
// 회차 suivant**. C'est un pari mesuré après coup, comme les pages 패턴.
//
// Elle lisait `customeruser_numberpattern` — 1 134 × 45 cellules. Rien n'est
// réimporté : `board.js` les recalcule, et le test qui rejoue les 51 030
// cellules est déjà en place.

import { COMPOSITES, FULL, NMAX, PRIMES } from './draws.js'
import { legacyValue } from './board.js'
import { choose } from './generator.js'
import { chiSquareUniform } from './stats.js'

/**
 * Les 45 cellules de chaque 회차, en une seule passe.
 *
 * `cells()` remonte tout l'historique à chaque appel ; l'appeler 1 134 fois
 * coûterait un million d'itérations pour rien. Ici on avance d'un 회차 à
 * l'autre en gardant la dernière sortie et la série en cours de chaque
 * numéro — le même résultat, en une passe.
 */
export function allCells(draws) {
  const last = new Int32Array(NMAX + 1)
  const streak = new Int32Array(NMAX + 1)
  const out = []

  for (let i = 0; i < draws.n; i++) {
    const rang = draws.rangs[i]
    const here = draws.fullAt(i)
    const drawn = new Uint8Array(NMAX + 1)
    for (let j = 0; j < FULL; j++) drawn[here[j]] = 1

    // Une série ne compte que sur des 회차 qui se suivent.
    const contiguous = i > 0 && draws.rangs[i - 1] === rang - 1

    const row = []
    for (let n = 1; n <= NMAX; n++) {
      const gap = rang - last[n]
      let flag = null
      if (drawn[n]) {
        const run = contiguous ? streak[n] : 0
        flag = run === 0 ? '당첨' : run === 1 ? '이월' : `(${run - 1})이월`
      }
      row.push({ number: n, gap, flag })
    }
    out.push(row)

    for (let n = 1; n <= NMAX; n++) {
      if (drawn[n]) { streak[n] = contiguous ? streak[n] + 1 : 1; last[n] = rang }
      else streak[n] = 0
    }
  }
  return out
}

/** Le 회차 qu'on prépare — celui qui suit le dernier connu. */
export const nextRang = (draws) => draws.rangs[draws.n - 1] + 1

/**
 * Les 45 cellules du 회차 **à venir**, celui qui n'est pas encore tiré.
 *
 * C'est la seule carte qui serve à décider quelque chose : les autres disent
 * ce qui *était* en attente, celle-ci dit ce qui l'est **maintenant**. Elle
 * n'a donc ni 당첨 ni 이월 — rien n'est sorti — et chaque numéro n'y porte
 * que son 대기.
 *
 * Un numéro jamais sorti compte depuis le début de l'historique, exactement
 * comme dans `allCells` : `last` vaut 0, l'écart vaut le 회차 lui-même.
 */
export function nextCells(draws) {
  const last = new Int32Array(NMAX + 1)
  for (let i = 0; i < draws.n; i++) {
    const row = draws.fullAt(i)
    for (let j = 0; j < FULL; j++) last[row[j]] = draws.rangs[i]
  }
  const rang = nextRang(draws)
  const out = []
  for (let n = 1; n <= NMAX; n++) out.push({ number: n, gap: rang - last[n], flag: null })
  return out
}

/** La colonne où tombe une cellule : `null` pour 당첨 et 이월, sinon l'écart. */
export const columnOf = (cell) => (cell.flag ? null : cell.gap)

/**
 * 회차별 번호 — les 45 numéros empilés par colonne.
 *
 * La première colonne, 당첨, ramasse les sept sortis avec leur drapeau ; les
 * suivantes vont de l'écart 0 au plus grand rencontré. Chaque colonne est une
 * pile : les numéros y arrivent dans l'ordre croissant, 1 d'abord, 45 en
 * dernier.
 *
 * `next` — les sept numéros du 회차 suivant — n'est pas nécessaire ; il sert
 * seulement à marquer, dans le tableau, ceux qui sont effectivement sortis
 * après. C'est ce que mesurent les cinq comptages du haut de page.
 */
export function boardColumns(row, next = null) {
  const after = new Uint8Array(NMAX + 1)
  if (next) for (const n of next) after[n] = 1

  const won = []
  const gaps = new Map()
  for (const cell of row) {
    const entry = { number: cell.number, label: legacyValue(cell), hit: after[cell.number] === 1 }
    const g = columnOf(cell)
    if (g === null) won.push(entry)
    else {
      if (!gaps.has(g)) gaps.set(g, [])
      gaps.get(g).push(entry)
    }
  }

  const keys = [...gaps.keys()].sort((a, b) => a - b)
  const columns = [{ key: 'won', label: '당첨', entries: won }]
  for (const g of keys) columns.push({ key: g, label: String(g), entries: gaps.get(g) })

  return {
    columns,
    // La hauteur du tableau : la colonne la plus haute, jamais moins de sept
    // — l'original réservait sept lignes même quand aucune ne les remplissait.
    height: Math.max(MIN_HEIGHT, ...columns.map((c) => c.entries.length)),
  }
}

/** L'original réservait sept lignes au tableau, quoi qu'il arrive. */
export const MIN_HEIGHT = 7

/**
 * Les cinq comptages du haut de page.
 *
 * Pour chaque 회차, on prend les sept numéros du **회차 suivant** et on
 * regarde où ils étaient sur le tableau de ce 회차-ci :
 *
 *   시작 (1–5)    sortis au 회차 courant, ou en attente depuis moins de 6
 *   중간 (5–10)   en attente depuis 6 à 10
 *   끝 (10–@)     en attente depuis plus de 10
 *
 *   위 (1–3)      parmi les trois premiers de leur colonne
 *   아래 (4–7)    plus bas dans la pile
 *
 * Le 회차 le plus récent n'a pas de suivant : l'original le sautait, on fait
 * pareil.
 */
export function tableListStats(draws, rows = allCells(draws)) {
  const up = new Map()
  const down = new Map()
  const start = new Map()
  const middle = new Map()
  const end = new Map()
  const bump = (m, v) => m.set(v, (m.get(v) ?? 0) + 1)

  const perRang = []

  // La référence des cinq comptages : les mêmes groupes, mais sur les 45
  // cases du tableau. Sept numéros tirés au hasard s'y répartiraient au
  // prorata — 7 × taille / 45. C'est à cette barre-là qu'il faut comparer
  // les cinq distributions, et non à zéro.
  const ref = { up: 0, down: 0, start: 0, middle: 0, end: 0 }

  // La loi de chaque comptage : un groupe de `size` cases sur 45, sept
  // numéros tirés, le nombre qui tombe dedans est hypergéométrique. La
  // taille du groupe change à chaque 회차, donc on additionne une loi par
  // 회차 — c'est la distribution attendue, à poser sous les barres.
  const law = { up: new Float64Array(FULL + 1), down: new Float64Array(FULL + 1),
                start: new Float64Array(FULL + 1), middle: new Float64Array(FULL + 1),
                end: new Float64Array(FULL + 1) }
  const totalDraws = choose(NMAX, FULL)
  const addLaw = (target, size) => {
    for (let k = 0; k <= FULL; k++) {
      target[k] += (choose(size, k) * choose(NMAX - size, FULL - k)) / totalDraws
    }
  }

  for (let i = 0; i < draws.n - 1; i++) {
    const row = rows[i]
    const next = draws.fullAt(i + 1)
    let u = 0, d = 0, s = 0, m = 0, e = 0

    // La taille des cinq groupes sur ce tableau. Le rang se compte dans
    // l'ordre des numéros — une seule passe suffit à le tenir à jour.
    {
      const seen = new Map()
      const size = { up: 0, down: 0, start: 0, middle: 0, end: 0 }
      for (let k = 0; k < NMAX; k++) {
        const cell = row[k]
        const value = legacyValue(cell)
        const rank = (seen.get(value) ?? 0) + 1
        seen.set(value, rank)
        if (rank < 4) size.up++
        else size.down++
        if (cell.flag || cell.gap < 6) size.start++
        else if (cell.gap <= 10) size.middle++
        else size.end++
      }
      for (const key of Object.keys(size)) {
        ref[key] += (FULL * size[key]) / NMAX
        addLaw(law[key], size[key])
      }
    }

    for (let j = 0; j < FULL; j++) {
      const n = next[j]
      const cell = row[n - 1]
      const value = legacyValue(cell)

      // Le rang du numéro dans sa colonne : combien de numéros **avant lui**
      // portent la même valeur, plus un.
      let rank = 1
      for (let k = 0; k < n - 1; k++) if (legacyValue(row[k]) === value) rank++
      if (rank < 4) u++
      else d++

      if (cell.flag) s++
      else if (cell.gap < 6) s++
      else if (cell.gap <= 10) m++
      else e++
    }

    bump(up, u); bump(down, d)
    bump(start, s); bump(middle, m); bump(end, e)
    perRang.push({ rang: draws.rangs[i], up: u, down: d, start: s, middle: m, end: e })
  }

  // L'ancien rangeait ses barres du plus fréquent au plus rare. Les clés sont
  // des entiers : l'objet les rendra de toute façon dans l'ordre croissant,
  // ce qui se lit mieux sur une distribution.
  const asObject = (m) => Object.fromEntries(
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => [String(v), c]))

  return {
    up: asObject(up),
    down: asObject(down),
    start: asObject(start),
    middle: asObject(middle),
    end: asObject(end),
    perRang,
    // Ce que chaque groupe a réellement ramassé, et ce que le hasard seul
    // lui aurait donné. `n` est le nombre de 회차 mesurés — le dernier n'a
    // pas de suivant, il ne compte pas.
    expected: ref,
    // La distribution attendue de chaque comptage — sous les mêmes clés que
    // `up`, `down`… : « k » → nombre de 회차 attendus avec k numéros là.
    law: Object.fromEntries(Object.entries(law).map(([key, arr]) => [
      key, Object.fromEntries(Array.from(arr, (v, k) => [String(k), v]).filter(([, v]) => v >= 0.05)),
    ])),
    observed: perRang.reduce((a, r) => ({
      up: a.up + r.up, down: a.down + r.down,
      start: a.start + r.start, middle: a.middle + r.middle, end: a.end + r.end,
    }), { up: 0, down: 0, start: 0, middle: 0, end: 0 }),
    n: perRang.length,
  }
}

// ─────────────────────────────────────── le bandeau de listes de référence

/**
 * Les listes que l'ancienne carte affichait en tête de chaque 회차.
 *
 * Elles ne dépendent pas du tirage — ce sont les familles de numéros, une
 * fois pour toutes. L'original les réécrivait dans **chaque** carte ; ici
 * elles sont posées une fois au-dessus, ce qui revient au même et laisse la
 * place aux chiffres qui, eux, changent.
 *
 * Une correction : l'ancien étiquetait 홀수 la liste des **pairs** et 짝수
 * celle des impairs — les deux étaient inversées. Elles sont remises à
 * l'endroit.
 */
const upTo = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
const every = (m) => upTo(1, NMAX).filter((n) => n % m === 0)

export const REFERENCE_LISTS = [
  { key: 'double', label: '이의배수', numbers: every(2) },
  { key: 'triple', label: '삼의배수', numbers: every(3) },
  { key: 'quad', label: '사의배수', numbers: every(4) },
  { key: 'quint', label: '오의배수', numbers: every(5) },
  { key: 'prime', label: '소수', numbers: PRIMES },
  { key: 'composite', label: '합성수', numbers: COMPOSITES },
  { key: 'low', label: '저수', numbers: upTo(1, 22) },
  { key: 'high', label: '고수', numbers: upTo(23, NMAX) },
  { key: 'odd', label: '홀수', numbers: upTo(1, NMAX).filter((n) => n % 2 === 1) },
  { key: 'even', label: '짝수', numbers: upTo(1, NMAX).filter((n) => n % 2 === 0) },
  { key: 's1', label: '일구간', numbers: upTo(1, 9) },
  { key: 's2', label: '십구간', numbers: upTo(10, 19) },
  { key: 's3', label: '이십구간', numbers: upTo(20, 29) },
  { key: 's4', label: '삼십구간', numbers: upTo(30, 39) },
  { key: 's5', label: '사십구간', numbers: upTo(40, NMAX) },
]

/**
 * 반복 수 — combien de numéros portent la même valeur, valeur par valeur.
 *
 * L'original affichait le dictionnaire Python brut, dans l'ordre où les
 * valeurs s'étaient présentées : « [('3', 5), ('4', 2), ('5', 3)… ». Ici,
 * 당첨 et les 이월 d'abord, puis les écarts croissants — le même comptage,
 * dans un ordre qui se lit.
 */
export function repeatTally(row) {
  const flags = new Map()
  const gaps = new Map()
  for (const cell of row) {
    if (cell.flag) flags.set(cell.flag, (flags.get(cell.flag) ?? 0) + 1)
    else gaps.set(cell.gap, (gaps.get(cell.gap) ?? 0) + 1)
  }
  const order = (a, b) => (a === '당첨' ? -1 : b === '당첨' ? 1 : a.localeCompare(b))
  return [
    ...[...flags.keys()].sort(order).map((k) => ({ label: k, count: flags.get(k), flag: true })),
    ...[...gaps.keys()].sort((a, b) => a - b).map((k) => ({ label: String(k), count: gaps.get(k), flag: false })),
  ]
}

/**
 * 리스트 I et 리스트 II — les deux tirages au sort de l'ancienne carte,
 * cinq numéros et trente-cinq.
 *
 * L'original les tirait avec `Math.random()` : ils changeaient à chaque
 * rechargement de la page, sans lien avec le 회차. Ici le tirage part du
 * numéro du 회차 — toujours imprévisible, mais stable : la même carte
 * montre toujours les mêmes deux listes.
 */
export function sampleLists(rang) {
  // Un générateur minuscule, déterministe : xorshift32 amorcé par le 회차.
  let s = (rang * 2654435761) >>> 0 || 1
  const next = () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
  const deck = upTo(1, NMAX)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return { five: deck.slice(0, 5), thirtyFive: deck.slice(5, 40) }
}

// ────────────────────────── ce que vaut chaque case du tableau, dans les
//                            deux sens
//
// La grille range les 45 numéros : en colonne le 미출현 간격 (당첨 d'abord,
// puis 0, 1, 2…), en ligne le rang dans cette colonne. Chaque numéro y
// occupe une case et une seule.
//
// Au 회차 suivant, sept numéros sortent — donc exactement **sept des
// quarante-cinq cases**. La conséquence est brutale et c'est tout l'intérêt
// de la mesure : pour n'importe quelle case, où qu'elle soit, la chance
// d'être l'une des sept vaut
//
//     7 / 45 = 15,56 %
//
// Ni la ligne ni la colonne ne peuvent changer ce nombre. Si une ligne du
// tableau valait mieux qu'une autre, son taux réel s'écarterait de 15,56 %
// nettement plus que le bruit ne le permet. Les cinq comptages du haut de
// page ne posaient jamais cette question-là : ils comptaient des effectifs.

/**
 * 라인별 · 간격별 당첨률 — les deux marges de la grille.
 *
 * Pour chaque 회차 sauf le dernier, on pose le tableau et on marque les
 * cases où se trouvaient les sept numéros du **회차 suivant**. On cumule
 * ensuite dans les deux sens :
 *
 *   lines[r]    la ligne r, toutes colonnes confondues
 *   columns[g]  la colonne g (`'won'` = 당첨, sinon l'écart), toutes lignes
 *
 * `seen` est le nombre de cases rencontrées, `hit` combien étaient l'un des
 * sept. `rate` = hit / seen, à comparer à `expected` — le même 7/45 pour
 * toutes, sans exception.
 */
export function tableListCellStats(draws, rows = allCells(draws)) {
  const lines = new Map()
  const cols = new Map()
  const slot = (m, k) => {
    if (!m.has(k)) m.set(k, { seen: 0, hit: 0 })
    return m.get(k)
  }

  for (let i = 0; i < draws.n - 1; i++) {
    const board = boardColumns(rows[i], draws.fullAt(i + 1))
    for (const col of board.columns) {
      const c = slot(cols, col.key)
      for (let r = 0; r < col.entries.length; r++) {
        const l = slot(lines, r + 1)
        c.seen++
        l.seen++
        if (col.entries[r].hit) { c.hit++; l.hit++ }
      }
    }
  }

  const expected = FULL / NMAX
  const dress = (key, label, v) => ({
    key,
    label,
    seen: v.seen,
    hit: v.hit,
    rate: v.seen ? v.hit / v.seen : 0,
    gap: (v.seen ? v.hit / v.seen : 0) - expected,
  })

  const lineRows = [...lines.keys()].sort((a, b) => a - b)
    .map((r) => dress(r, String(r), lines.get(r)))

  // 당첨 en tête, puis les écarts dans l'ordre — celui du tableau.
  const colKeys = [...cols.keys()].filter((k) => k !== 'won').sort((a, b) => a - b)
  const colRows = [
    ...(cols.has('won') ? [dress('won', '당첨', cols.get('won'))] : []),
    ...colKeys.map((g) => dress(g, String(g), cols.get(g))),
  ]

  const cells = lineRows.reduce((a, r) => a + r.seen, 0)
  const hits = lineRows.reduce((a, r) => a + r.hit, 0)

  return { lines: lineRows, columns: colRows, expected, cells, hits, n: draws.n - 1 }
}

/**
 * 번호별 당첨률 — la troisième marge, celle de la case elle-même.
 *
 * Les deux précédentes disent ce que valent une ligne et une colonne. Reste
 * la question que tout le monde se pose vraiment devant ce tableau : **ce
 * numéro-là**, sort-il plus que les autres ?
 *
 * Même cadre que `tableListCellStats` — on regarde, pour chaque 회차 sauf le
 * dernier, si le numéro est sorti au 회차 **suivant**. Et même barre : un
 * numéro parmi 45, sept sortent, donc 7/45 pour tous.
 *
 * Le χ² à 44 degrés de liberté tranche ce qu'aucun classement ne peut
 * trancher à l'œil. Un tableau de 45 fréquences a *toujours* un premier et
 * un dernier ; l'écart entre eux n'est une nouvelle que si le χ² le dit.
 */
export function numberStats(draws) {
  const hit = new Int32Array(NMAX + 1)
  for (let i = 0; i < draws.n - 1; i++) {
    for (const n of draws.fullAt(i + 1)) hit[n]++
  }

  const seen = Math.max(0, draws.n - 1)
  const rate = FULL / NMAX
  const expected = seen * rate

  const numbers = []
  for (let n = 1; n <= NMAX; n++) {
    const r = seen ? hit[n] / seen : 0
    numbers.push({ number: n, hit: hit[n], rate: r, gap: r - rate, expected })
  }

  const test = seen
    ? chiSquareUniform(numbers.map((x) => x.hit), expected)
    : { chi2: 0, df: NMAX - 1, p: 1 }

  // Le plus sorti et le moins sorti — pour que l'écart maximal soit dit en
  // toutes lettres plutôt que cherché dans le tableau.
  const ranked = [...numbers].sort((a, b) => b.hit - a.hit)

  return {
    numbers,
    seen,
    expected,
    expectedRate: rate,
    ...test,
    top: ranked[0] ?? null,
    bottom: ranked.at(-1) ?? null,
  }
}
