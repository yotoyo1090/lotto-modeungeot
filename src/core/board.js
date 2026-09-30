// Les deux tableaux du 일반조합 et du 수동조합.
//
// L'ancienne plateforme les stockait dans `customeruser_numberpattern` :
// 1 134 lignes × 45 colonnes de texte, où chaque cellule est soit un
// nombre — depuis combien de tirages le numéro n'est pas sorti — soit un
// mot : 당첨, 이월, (1)이월, (2)이월, (3)이월.
//
// Tout se recalcule en un passage, et le calcul rend **51 030 / 51 030**
// cellules identiques à l'ancienne table (voir `test/board.test.js`).
//
//   패턴        patternGrid       라인 × 미출현간격
//   차뜨        temperatureRow    les 45, triés par écart, en quatre bandes
//   반복 수     repeats           combien de numéros par écart
//
// Aucune API Node : ce fichier tourne dans le navigateur comme le reste
// de `src/core/`.

import { FULL, NMAX } from './draws.js'

/** Les quatre bandes, dans l'ordre où les tableaux les montrent. */
export const BANDS = [
  { key: 'hot', label: '뜨거운', min: 1, max: 5 },
  { key: 'midle', label: '중간', min: 6, max: 10 },
  { key: 'cold', label: '차가운', min: 11, max: 19 },
  { key: 'dead', label: '사망', min: 20, max: Infinity },
]

/** La bande d'un écart. */
export function bandOf(gap) {
  for (const band of BANDS) if (gap >= band.min && gap <= band.max) return band.key
  return BANDS[0].key
}

/**
 * L'état des 45 numéros à un 회차 : écart, et drapeau s'il est sorti.
 *
 * `gap` = 회차 demandé − dernier 회차 où le numéro est sorti, bonus
 * compris. Un numéro jamais sorti compte depuis le début, comme le
 * faisait l'original.
 *
 * `flag` distingue les sept numéros du tirage selon leur **série** :
 *
 *   당첨       sorti, absent du 회차 précédent
 *   이월       sorti, présent au précédent           (série de 2)
 *   (1)이월    présent aux deux précédents           (série de 3)
 *   (2)이월    aux trois précédents, etc.
 *
 * Ce n'est pas une invention : c'est exactement ce que contient
 * l'ancienne table, drapeau par drapeau.
 */
export function cells(draws, rang) {
  const i = draws.indexOf(rang)

  // Dernière sortie de chaque numéro, avant ce 회차.
  const last = new Int32Array(NMAX + 1)
  for (let k = 0; k < i; k++) {
    const row = draws.fullAt(k)
    for (let j = 0; j < FULL; j++) last[row[j]] = draws.rangs[k]
  }

  const drawn = new Uint8Array(NMAX + 1)
  const here = draws.fullAt(i)
  for (let j = 0; j < FULL; j++) drawn[here[j]] = 1

  const out = []
  for (let n = 1; n <= NMAX; n++) {
    const gap = rang - last[n]
    let flag = null
    if (drawn[n]) {
      // La série : combien de 회차 consécutifs, juste avant, contiennent n.
      let streak = 0
      for (let k = i - 1; k >= 0; k--) {
        if (draws.rangs[k] !== rang - 1 - streak) break
        const row = draws.fullAt(k)
        let found = false
        for (let j = 0; j < FULL; j++) if (row[j] === n) { found = true; break }
        if (!found) break
        streak++
      }
      flag = streak === 0 ? '당첨' : streak === 1 ? '이월' : `(${streak - 1})이월`
    }
    out.push({ number: n, gap, flag, band: bandOf(gap) })
  }
  return out
}

/** Le libellé stocké par l'ancienne table pour une cellule. */
export const legacyValue = (cell) => cell.flag ?? String(cell.gap)

/**
 * 반복 수 / 복수 — combien de numéros par écart, plus 당첨 et 이월.
 *
 * L'ancien affichait ce comptage en deux endroits sous deux formes (une
 * liste de paires au-dessus du 패턴, un dictionnaire au-dessus du 차뜨).
 * C'est le même objet ; on le calcule une fois.
 *
 * Les sept numéros sortis sont comptés sous 당첨 et 이월 — pas sous leur
 * écart — donc les entrées numériques totalisent 38, pas 45.
 */
export function repeats(rows) {
  const gaps = new Map()
  let won = 0
  let carried = 0
  for (const cell of rows) {
    if (cell.flag === '당첨') won++
    else if (cell.flag) carried++
    else gaps.set(cell.gap, (gaps.get(cell.gap) ?? 0) + 1)
  }
  return {
    gaps: [...gaps.entries()].sort((a, b) => a[0] - b[0]),
    won,
    carried,
  }
}

/** Le plus petit nombre de lignes du 패턴 — l'ancien n'en montrait jamais moins. */
export const MIN_LINES = 7

/**
 * 패턴 — la grille 라인 × 미출현간격.
 *
 * Une colonne 당첨 en tête, puis une colonne par écart, de 1 au plus grand
 * observé. La case (ligne r, colonne g) porte le r-ième numéro dont
 * l'écart vaut g ; la colonne 당첨 porte les sept numéros sortis, avec
 * leur drapeau.
 *
 * Le nombre de lignes est la plus grosse colonne, jamais moins de sept.
 */
export function patternGrid(rows) {
  const columns = new Map()      // écart → numéros
  const won = []
  for (const cell of rows) {
    if (cell.flag) { won.push(cell); continue }
    if (!columns.has(cell.gap)) columns.set(cell.gap, [])
    columns.get(cell.gap).push(cell)
  }

  const gaps = [...columns.keys()].sort((a, b) => a - b)
  const maxGap = gaps.length ? gaps.at(-1) : 0
  const lines = Math.max(MIN_LINES, won.length,
    ...[...columns.values()].map((c) => c.length))

  // Toutes les colonnes de 1 à maxGap, y compris les vides : sans elles,
  // deux écarts voisins se toucheraient et la grille mentirait sur les
  // distances. C'est la même raison qui avait fait ajouter les trous aux
  // histogrammes de l'onglet 분석.
  const headers = Array.from({ length: maxGap }, (_, k) => k + 1)

  const grid = []
  for (let r = 0; r < lines; r++) {
    const row = { line: r + 1, won: won[r] ?? null, cells: [] }
    for (const g of headers) row.cells.push(columns.get(g)?.[r] ?? null)
    grid.push(row)
  }
  return { headers, lines, grid, maxGap }
}

/** Combien de 회차 les deux tableaux montrent : celui-ci et les deux d'avant. */
export const STACK = 3

/**
 * Les `count` derniers 회차 jusqu'à `rang`, du plus récent au plus ancien.
 *
 * Rend moins de `count` entrées si l'historique s'arrête avant — au tout
 * début, ou sur une base tronquée. Un tableau vide plutôt qu'une exception :
 * l'écran doit pouvoir dire « il n'y a qu'un tirage » sans se casser.
 */
export function stack(draws, rang, count = STACK) {
  const i = draws.indexOf(rang)
  const out = []
  for (let k = 0; k < count && i - k >= 0; k++) {
    out.push({ rang: draws.rangs[i - k], cells: cells(draws, draws.rangs[i - k]) })
  }
  return out
}

/** Le 회차 qui vient — le premier qui n'est pas encore tiré. */
export const nextRang = (draws) => draws.rangs[draws.n - 1] + 1

/**
 * Les 45 numéros tels qu'ils **attendent** le prochain tirage.
 *
 * C'est le seul tableau de l'écran qui serve à préparer quelque chose : les
 * trois autres sont des photos de tirages déjà connus. Ici rien n'est sorti,
 * donc aucune case ne porte de drapeau — les écarts, eux, sont ceux
 * d'aujourd'hui, un de plus que sur le dernier 회차.
 *
 * `tablelist.nextCells` fait le même calcul pour la disposition en colonnes
 * d'écart ; celui-ci rend en plus la bande de chaque case, dont le 차뜨 a
 * besoin. Les deux ne peuvent pas être fusionnés sans que `board.js` importe
 * `tablelist.js`, qui l'importe déjà.
 */
export function upcomingCells(draws) {
  const last = new Int32Array(NMAX + 1)
  for (let i = 0; i < draws.n; i++) {
    const row = draws.fullAt(i)
    for (let j = 0; j < FULL; j++) last[row[j]] = draws.rangs[i]
  }

  const rang = nextRang(draws)
  const out = []
  for (let n = 1; n <= NMAX; n++) {
    const gap = rang - last[n]
    out.push({ number: n, gap, flag: null, band: bandOf(gap) })
  }
  return out
}

/** La carte du 회차 à venir, au format de `stack()`. */
export function upcomingBoard(draws) {
  if (!draws.n) return null
  return { rang: nextRang(draws), cells: upcomingCells(draws), upcoming: true }
}

/**
 * 차뜨 — les 45 numéros triés par écart croissant, en quatre bandes.
 *
 * Rend les numéros dans l'ordre d'affichage et l'étendue de chaque bande,
 * pour que l'en-tête 뜨거운 / 중간 / 차가운 / 사망 tombe en face des bonnes
 * colonnes. Dans l'ancien, cet en-tête était décalé d'une colonne : son
 * `colspan` avalait la colonne de gauche.
 */
export function temperatureRow(rows) {
  // Tri stable par écart, puis par numéro — sans quoi deux numéros de même
  // écart changeraient de place d'un rendu à l'autre.
  const sorted = [...rows].sort((a, b) => a.gap - b.gap || a.number - b.number)

  // Chaque bande porte trois chiffres, et le troisième est le seul qui
  // dise quelque chose :
  //
  //   count     combien de numéros y sont rangés ce 회차
  //   drawn     combien en sont sortis
  //   expected  combien on en attendrait si la bande ne changeait rien —
  //             sept numéros tirés sur quarante-cinq, donc 7 × count / 45
  //
  // Sans `expected`, « 뜨거운 : 4 sortis » a l'air d'un signal. Avec, on voit
  // que la bande en attendait 3,9. C'est ce chiffre-là qui manquait à
  // l'ancienne plateforme, et son absence est ce qui faisait croire que les
  // numéros chauds sortent davantage : ils sortent plus **parce qu'ils sont
  // plus nombreux**, pas parce qu'ils sont chauds.
  const spans = BANDS.map((band) => {
    const inBand = sorted.filter((c) => c.band === band.key)
    return {
      ...band,
      count: inBand.length,
      drawn: inBand.filter((c) => c.flag).length,
      expected: (FULL * inBand.length) / NMAX,
    }
  })
  return { cells: sorted, spans }
}

/**
 * Ce que vaut chaque **position** du tableau 차뜨, sur tout l'historique.
 *
 * Le tableau range les 45 numéros par écart croissant. La 9e colonne n'est
 * donc pas « le numéro 9 » mais « le 9e moins attendu », et ce n'est pas le
 * même numéro d'un 회차 à l'autre. Deux chiffres par position :
 *
 *   won    combien de 회차 ont eu un 당첨 à cette place
 *   first  combien l'ont eu **en premier** — le 당첨 le plus à gauche
 *
 * `won` est plat : 7 numéros sortent sur 45, donc chaque colonne tourne
 * autour de 15,6 %, où qu'elle soit. Les écarts qu'on y lit sont du bruit —
 * χ² = 47,8 pour 44 degrés de liberté, p = 0,32 sur les 1 238 회차.
 *
 * `first` décroît de 18 % à moins de 1 %, et c'est mécanique : la colonne 1
 * n'a personne devant elle, la colonne 40 doit attendre que les trente-neuf
 * précédentes soient toutes vides. La pente ne dit rien du tirage, elle dit
 * ce que « le plus à gauche » veut dire.
 */
export function lineStats(draws) {
  const won = new Int32Array(NMAX + 2)
  const first = new Int32Array(NMAX + 2)

  for (let i = 0; i < draws.n; i++) {
    const sorted = [...cells(draws, draws.rangs[i])]
      .sort((a, b) => a.gap - b.gap || a.number - b.number)
    let seen = false
    for (let k = 0; k < sorted.length; k++) {
      if (!sorted[k].flag) continue
      won[k + 1]++
      if (!seen) { first[k + 1]++; seen = true }
    }
  }

  return Array.from({ length: NMAX }, (_, k) => ({
    line: k + 1,
    won: won[k + 1],
    first: first[k + 1],
    wonRate: draws.n ? won[k + 1] / draws.n : 0,
    firstRate: draws.n ? first[k + 1] / draws.n : 0,
  }))
}

/**
 * La question que pose le 차뜨, et à laquelle il ne répondait pas.
 *
 * Sur tout l'historique : quelle part des numéros sortants venait de chaque
 * bande, et quelle part on en attendrait si la température n'y était pour
 * rien. L'attendu se recalcule à chaque 회차, parce que la taille des bandes
 * change d'un tirage à l'autre.
 *
 * Si les deux colonnes sont égales, cet écran décrit la forme que produit un
 * tirage au sort — et rien de plus.
 */
export function temperatureShare(draws) {
  const drawn = new Map(BANDS.map((b) => [b.key, 0]))
  const expected = new Map(BANDS.map((b) => [b.key, 0]))
  let total = 0

  for (let i = 0; i < draws.n; i++) {
    const row = cells(draws, draws.rangs[i])
    const size = new Map(BANDS.map((b) => [b.key, 0]))
    for (const cell of row) size.set(cell.band, size.get(cell.band) + 1)
    for (const cell of row) {
      if (!cell.flag) continue
      drawn.set(cell.band, drawn.get(cell.band) + 1)
      total++
    }
    for (const b of BANDS) {
      expected.set(b.key, expected.get(b.key) + (FULL * size.get(b.key)) / NMAX)
    }
  }

  return BANDS.map((b) => ({
    ...b,
    drawn: drawn.get(b.key),
    expected: expected.get(b.key),
    share: total ? drawn.get(b.key) / total : 0,
    expectedShare: total ? expected.get(b.key) / total : 0,
  }))
}
