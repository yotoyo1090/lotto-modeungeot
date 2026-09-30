// 테이블 — les sept pages 패턴, une par position du tirage.
//
// L'ancienne plateforme en faisait sept pages (1번 패턴 … 7번 패턴) bâties
// sur la même question, posée à la position 일, 이, 삼, 사, 오, 육 puis
// 보너스 :
//
//   « Prends le numéro que ce 회차 a mis à cette place. Retrouve tous les
//     tirages passés qui le contenaient. Pour chacun, compte combien de ses
//     sept numéros sont ressortis au 회차 **suivant**. »
//
// C'est un pari mesuré après coup : si un vieux tirage a donné quatre de ses
// sept numéros au tirage d'après, il valait la peine d'être regardé.
//
// Elles lisaient `customeruser_predictnumber` — 1 134 lignes × 7 colonnes,
// **699 313 entrées** stockées en texte. Rien n'est réimporté : tout se
// recalcule (voir test/board.test.js, qui rejoue les 699 313 comptes).

import { FULL, NMAX } from './draws.js'

/**
 * Les sept positions, dans l'ordre du menu d'origine.
 *
 * Le menu les appelait 1번 … 7번 ; l'en-tête du tableau, lui, nommait la
 * septième 보너스번호. On garde les deux : le chiffre sur le bouton, le mot
 * dans la colonne.
 */
export const PATTERN_POSITIONS = [
  { key: 0, label: '1번', column: '1번호' },
  { key: 1, label: '2번', column: '2번호' },
  { key: 2, label: '3번', column: '3번호' },
  { key: 3, label: '4번', column: '4번호' },
  { key: 4, label: '5번', column: '5번호' },
  { key: 5, label: '6번', column: '6번호' },
  { key: 6, label: '7번', column: '보너스번호' },
]

export const isPosition = (k) => Number.isInteger(k) && k >= 0 && k < FULL

/** 당첨여부 va de 0 à 7 — sept numéros peuvent tous ressortir. */
export const MAX_HITS = FULL

/**
 * Les lignes d'un 회차, pour une position.
 *
 * Rend, du plus ancien au plus récent, chaque 회차 **antérieur** dont les
 * sept numéros contiennent celui que ce 회차-ci a mis à la position donnée.
 * `numbers` garde l'ordre d'affichage — 일 … 보너스 — celui du tableau
 * d'origine. `hits` est le 당첨여부 : combien de ces sept numéros sont
 * ressortis au 회차 suivant.
 *
 * Le dernier 회차 de l'historique n'a pas de suivant : tous ses `hits`
 * valent 0. C'était déjà le cas dans l'ancienne base.
 */
export function patternLines(draws, i, position) {
  if (!isPosition(position)) throw new RangeError(`알 수 없는 위치 : ${position}`)

  const target = draws.sequenceAt(i)[position]
  const next = new Uint8Array(46)
  if (i + 1 < draws.n) for (const n of draws.fullAt(i + 1)) next[n] = 1

  const out = []
  for (let k = 0; k < i; k++) {
    const seven = draws.sequenceAt(k)
    let holds = false
    let hits = 0
    for (let p = 0; p < FULL; p++) {
      if (seven[p] === target) holds = true
      if (next[seven[p]]) hits++
    }
    if (holds) out.push({ rang: draws.rangs[k], numbers: [...seven], hits })
  }
  return out
}

/**
 * Le 당첨여부 de toutes les lignes de tous les 회차, pour une position.
 *
 * Une seule passe quadratique, dont tout le reste se déduit : la
 * distribution, le cumul par ligne, le suivi d'une ligne dans le temps.
 * Sur 1 134 회차 cela fait une centaine de milliers d'entrées et quelques
 * millisecondes ; les recalculer à chaque bloc en coûterait autant à chaque
 * clic.
 *
 * `rows[i]` porte les 당첨여부 du 회차 d'indice i, ligne par ligne.
 */
export function patternDigest(draws, position) {
  if (!isPosition(position)) throw new RangeError(`알 수 없는 위치 : ${position}`)

  const rows = []
  let widest = 0
  let entries = 0

  for (let i = 0; i < draws.n; i++) {
    const target = draws.sequenceAt(i)[position]
    const next = new Uint8Array(46)
    if (i + 1 < draws.n) for (const n of draws.fullAt(i + 1)) next[n] = 1

    const line = []
    for (let k = 0; k < i; k++) {
      const seven = draws.sequenceAt(k)
      let holds = false
      let hits = 0
      for (let p = 0; p < FULL; p++) {
        if (seven[p] === target) holds = true
        if (next[seven[p]]) hits++
      }
      if (holds) line.push(hits)
    }
    rows.push(Int8Array.from(line))
    widest = Math.max(widest, line.length)
    entries += line.length
  }
  return { position, rows, widest, entries }
}

/** 모든 리스트 통계 — le 당첨여부 de toutes les entrées, valeur par valeur. */
export function patternTally(digest) {
  const counts = new Array(MAX_HITS + 1).fill(0)
  for (const row of digest.rows) for (const h of row) counts[h]++
  // Une valeur jamais rencontrée ne fait pas une barre vide.
  return Object.fromEntries(
    counts.map((n, v) => [String(v), n]).filter(([, n]) => n > 0))
}

/**
 * 라인 통계 — le cumul par ligne, jusqu'au 회차 choisi **compris**.
 *
 * L'original remontait bien tout l'historique jusque-là, pas seulement le
 * 회차 affiché : c'est ce qui donne son sens à la colonne 합계.
 */
export function lineTally(digest, i) {
  const out = []
  for (let line = 0; line < digest.widest; line++) {
    const counts = new Array(MAX_HITS + 1).fill(0)
    let total = 0
    for (let k = 0; k <= i && k < digest.rows.length; k++) {
      const row = digest.rows[k]
      if (line < row.length) { counts[row[line]]++; total++ }
    }
    if (total) out.push({ line: line + 1, counts, total })
  }
  return out
}

/** 라인 흐름 — une ligne suivie d'un 회차 à l'autre. */
export function lineFlow(draws, digest, line) {
  const out = []
  for (let i = 0; i < digest.rows.length; i++) {
    const row = digest.rows[i]
    if (line < row.length) out.push({ rang: draws.rangs[i], value: row[line] })
  }
  return out
}

/**
 * Les cinq paniers du bas de page : « 0 », « 1 », « 2 », « 3 », « > 4 ».
 *
 * Les lignes d'un 회차 sont rangées par leur 당첨여부 — le dernier panier
 * ramasse tout ce qui vaut 4 et plus. Dans chaque panier, on compte combien
 * de fois chaque numéro apparaît, du plus fréquent au plus rare. Le total
 * annoncé est le nombre de numéros **distincts** du panier, comme dans
 * l'original.
 */
export const BUCKETS = ['0', '1', '2', '3', '> 4']

export function bucketNumbers(lines) {
  const bags = BUCKETS.map(() => new Map())
  for (const l of lines) {
    const bag = bags[Math.min(l.hits, 4)]
    for (const n of l.numbers) bag.set(n, (bag.get(n) ?? 0) + 1)
  }
  return bags.map((bag, k) => ({
    label: BUCKETS[k],
    distinct: bag.size,
    numbers: [...bag.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([number, count]) => ({ number, count })),
  }))
}

// ─────────────────────────────────────────────── 당첨이월 · 당첨이월정렬

/**
 * 제외번호 — la liste saisie à la main, telle que l'ancien champ
 * `#dellnumber` l'attendait : des nombres séparés par des virgules.
 *
 * Tout ce qui n'est pas un numéro de 1 à 45 est ignoré, et les doublons
 * ne comptent qu'une fois : « 3, 7, 3, abc, 99 » vaut [3, 7].
 */
export function parseExcluded(text) {
  const out = new Set()
  for (const piece of String(text ?? '').split(/[,\s]+/)) {
    const n = Number(piece)
    if (Number.isInteger(n) && n >= 1 && n <= 45) out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

/**
 * 당첨이월 — les sept positions d'un même 회차, côte à côte.
 *
 * La page 패턴 ne regarde qu'une position ; celle-ci les montre toutes les
 * sept pour le même 회차, chacune avec ses deux comptages :
 *
 *   당첨여부  combien des sept numéros sont ressortis au 회차 suivant
 *   제외여부  combien d'entre eux sont dans la liste 제외번호
 *
 * `sort` est la seule différence entre 당첨이월 et 당첨이월정렬 — les vues
 * Django des deux pages sont identiques au caractère près, le tri vivait
 * dans le gabarit. Il range les lignes de la plus propre à la plus sale,
 * remonte le numéro de la position en tête, et repousse les numéros exclus
 * en fin de ligne.
 */
export function familyLines(draws, i, excluded = [], { sort = false } = {}) {
  const out = new Uint8Array(46)
  for (const n of excluded) out[n] = 1

  return PATTERN_POSITIONS.map((p) => {
    const target = draws.sequenceAt(i)[p.key]
    const lines = patternLines(draws, i, p.key).map((l) => {
      const dropped = l.numbers.filter((n) => out[n])
      const kept = l.numbers.filter((n) => !out[n])
      // Le partage du **reste**, une fois le numéro de la position sorti :
      // c'est celui-là que le tri d'origine utilisait.
      const others = l.numbers.filter((n) => n !== target)
      const rest = {
        dropped: others.filter((n) => out[n]),
        kept: others.filter((n) => !out[n]),
      }
      return {
        ...l,
        dropped,
        kept,
        // 제외여부 : le nombre de numéros exclus dans la ligne. Sans liste
        // 제외번호, l'ancien affichait à la place « 7 − 당첨여부 » — ce qui
        // n'a pas ressorti. On garde les deux, chacun sous son nom.
        out: dropped.length,
        missed: FULL - l.hits,
        // L'ordre d'affichage : intact, ou le numéro de la position d'abord
        // puis les exclus rejetés à la fin. L'original sortait le numéro de
        // la position **avant** de partager le reste : s'il est lui-même
        // exclu, il reste quand même en tête, et ne se compte pas deux fois.
        shown: sort ? [target, ...rest.kept, ...rest.dropped] : l.numbers,
        // Combien de numéros rejetés en fin de ligne — 제외여부 moins le
        // numéro de la position, quand celui-ci est lui aussi exclu.
        tail: sort ? rest.dropped.length : 0,
      }
    })

    if (sort) {
      // Tri stable : à égalité de 제외여부, l'ordre des 회차 ne bouge pas.
      lines.forEach((l, k) => { l._k = k })
      lines.sort((a, b) => a.out - b.out || a._k - b._k)
      for (const l of lines) delete l._k
    }

    const hitTally = new Array(MAX_HITS + 1).fill(0)
    const outTally = new Array(FULL + 1).fill(0)
    for (const l of lines) { hitTally[l.hits]++; outTally[l.out]++ }

    return {
      ...p,
      target,
      lines,
      hitTally,
      outTally,
      // 당첨합계 : le total des 당첨여부 de la colonne — ce que ces vieilles
      // grilles ont donné, en tout, au 회차 suivant.
      hitSum: lines.reduce((a, l) => a + l.hits, 0),
      outSum: lines.reduce((a, l) => a + l.out, 0),
    }
  })
}

// ─────────────────────────────────────────── la référence du 당첨여부
//
// Tout cet écran tourne autour d'un seul chiffre : le 당첨여부. Une ligne,
// c'est sept numéros d'un 회차 passé ; son 당첨여부 compte combien d'entre
// eux ressortent au 회차 suivant.
//
// L'ancienne plateforme affichait ce chiffre nu. Nu, il ne veut rien dire :
// on ne sait pas si 2 est beaucoup. Sept numéros retirés parmi 45, si le
// tirage ne se souvient de rien, le nombre de numéros communs suit une loi
// hypergéométrique :
//
//     P(k) = C(7,k) · C(38,7−k) / C(45,7)
//
// De moyenne 7 × 7 / 45 = 1,0889. Voilà la barre. Une ligne, une position,
// un filtre ne valent quelque chose que s'ils la dépassent — et la
// dépassent assez pour que le hasard n'y suffise pas.

const choose = (n, k) => {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

/** P(k numéros communs) pour k de 0 à 7 — la loi hypergéométrique. */
export const HITS_LAW = Array.from({ length: MAX_HITS + 1 }, (_, k) =>
  (choose(FULL, k) * choose(NMAX - FULL, FULL - k)) / choose(NMAX, FULL))

/** La moyenne de cette loi : 7 × 7 / 45. */
export const HITS_MEAN = (FULL * FULL) / NMAX

/**
 * Confronte une distribution observée de 당첨여부 à la loi.
 *
 * `counts` est un tableau de huit entiers — le nombre de lignes ayant fait
 * 0, 1, … 7. Rend une ligne par valeur (실제 / 기대 / 차이), la moyenne des
 * deux côtés, et le χ² qui les sépare.
 */
export function hitsVerdict(counts) {
  const total = counts.reduce((a, c) => a + c, 0)
  if (!total) return null

  let mean = 0
  let chi2 = 0
  const rows = HITS_LAW.map((p, k) => {
    const expected = p * total
    mean += (k * counts[k]) / total
    if (expected >= 1) chi2 += ((counts[k] - expected) ** 2) / expected
    return { hits: k, count: counts[k], expected, share: counts[k] / total, p }
  })

  return { rows, total, mean, expected: HITS_MEAN, chi2, gap: mean - HITS_MEAN }
}

/** Le même verdict, à partir de l'objet que `patternTally` rend aux barres. */
export function tallyVerdict(tally) {
  const counts = new Array(MAX_HITS + 1).fill(0)
  for (const [k, n] of Object.entries(tally)) {
    const v = Number(k)
    if (Number.isInteger(v) && v >= 0 && v <= MAX_HITS) counts[v] = n
  }
  return hitsVerdict(counts)
}

/** La moyenne d'une ligne du 라인 통계, et son écart à la loi. */
export function lineMean(counts, total) {
  if (!total) return { mean: 0, gap: 0 }
  let sum = 0
  for (let k = 0; k <= MAX_HITS; k++) sum += k * counts[k]
  const mean = sum / total
  return { mean, gap: mean - HITS_MEAN }
}

/**
 * 거리 — de quelle distance vient une ligne qui touche, et une qui rate.
 *
 * Les sept colonnes de 당첨이월 ramènent des 회차 passés. Chacun est à une
 * distance du tirage gagnant : `당첨 회차 − 줄의 회차`. La question est
 * simple et se pose avant le tirage :
 *
 *   les lignes qui font trois justes ou plus viennent-elles d'une distance
 *   particulière — et celles qui n'en font aucune, d'une autre ?
 *
 * Un 회차 peut apparaître dans plusieurs des sept colonnes (il contient
 * deux des numéros du 회차 choisi). On ne le compte qu'une fois : c'est une
 * distance, pas une ligne de tableau.
 *
 * Mesuré sur 1 039 회차, le taux de « trois justes ou plus » est de 6.46 %
 * et ne bouge pas avec la distance — une seule fenêtre, 127~151, tient à
 * 6.99 % sur les deux moitiés de l'historique. C'est le repère qu'affiche
 * la vue ; ce bloc ne fait que donner les chiffres du 회차 courant.
 *
 * Sur le dernier 회차, le tirage cible n'a pas eu lieu : `upcoming` est vrai,
 * `target` vaut quand même 회차 + 1 et les distances se comptent depuis lui.
 * Les deux familles restent vides — on ne sait pas encore qui a touché — mais
 * le vivier et les fenêtres, eux, sont déjà connus. C'est ce qu'on veut voir
 * le samedi matin : où regarder, avant de savoir.
 */
export const DISTANCE_WINDOW = { lo: 127, hi: 151, rate: 0.0699, base: 0.0646 }

/**
 * La meilleure fenêtre du côté 꽝, celle où les lignes à zéro juste étaient
 * les plus nombreuses sur la première moitié de l'historique.
 *
 * Elle ne tient pas au test hors échantillon (z +2.07 puis +0.07) — on la
 * montre parce qu'il faut pouvoir la regarder, pas parce qu'elle dit
 * quelque chose. La vue la marque d'une autre couleur que DISTANCE_WINDOW,
 * et le texte dit qu'elle est tombée.
 */
export const DISTANCE_WINDOW_LOST = { lo: 202, hi: 226, rate: 0.2867, base: 0.2769 }

/**
 * Le test hors échantillon, mesuré une fois et figé.
 *
 * On coupe l'historique en deux (기준 200~719회 et 720~1239회), on choisit
 * les meilleures fenêtres **en ne regardant que la première moitié**, puis on
 * les remesure sur la seconde — qui n'a pas servi à choisir. Une fenêtre qui
 * n'était qu'un coup de chance retombe à zéro ; une vraie reste.
 *
 * `a` / `za` = première moitié (le choix), `b` / `zb` = seconde (la preuve).
 * Une seule ligne tient : 127~151, 6.98 % puis 6.99 %.
 *
 * Ces chiffres ne se recalculent pas à l'écran : ils datent du 2026-09-18 et
 * portent sur 539 740 lignes. Les rejouer se fait hors page.
 */
export const DISTANCE_SPLIT = {
  rounds: [200, 1239],
  mid: 720,
  won: {
    label: '3개 이상',
    base: [0.0654, 0.0642],
    rows: [
      { lo: 127, hi: 151, a: 0.0698, za: 1.73, b: 0.0699, zb: 2.24 },
      { lo: 177, hi: 201, a: 0.0695, za: 1.60, b: 0.0635, zb: -0.27 },
      { lo: 2, hi: 26, a: 0.0688, za: 1.35, b: 0.0626, zb: -0.65 },
      { lo: 52, hi: 76, a: 0.0676, za: 0.86, b: 0.0635, zb: -0.27 },
    ],
  },
  lost: {
    label: '0개 (꽝)',
    base: [0.2769, 0.2788],
    rows: [
      { lo: 202, hi: 226, a: 0.2867, za: 2.07, b: 0.2791, zb: 0.07 },
      { lo: 552, hi: 576, a: 0.2914, za: 1.71, b: 0.2839, zb: 1.10 },
      { lo: 177, hi: 201, a: 0.2831, za: 1.35, b: 0.2806, zb: 0.39 },
    ],
  },
}

export function familyDistance(draws, i, { bin = 25 } = {}) {
  const has = new Uint8Array(NMAX + 1)
  for (const n of draws.sequenceAt(i)) has[n] = 1

  const after = i + 1 < draws.n
  const next = new Uint8Array(NMAX + 1)
  if (after) for (const n of draws.fullAt(i + 1)) next[n] = 1
  // Le 회차 vers lequel on mesure : le suivant s'il existe, sinon celui qui
  // va être tiré. Son numéro se connaît d'avance, même si ses boules non.
  const from = after ? draws.rangs[i + 1] : draws.rangs[i] + 1

  const rows = []
  for (let k = 0; k < i; k++) {
    const seven = draws.sequenceAt(k)
    let holds = false
    let hits = 0
    for (let p = 0; p < FULL; p++) {
      if (has[seven[p]]) holds = true
      if (next[seven[p]]) hits++
    }
    if (holds) {
      rows.push({
        rang: draws.rangs[k],
        distance: from - draws.rangs[k],
        hits,
        numbers: [...seven],
      })
    }
  }

  const side = (keep) => {
    const d = rows.filter(keep).map((r) => r.distance).sort((a, b) => a - b)
    if (!d.length) return { lines: 0, near: null, far: null, median: null }
    return {
      lines: d.length,
      near: d[0],
      far: d[d.length - 1],
      median: d[(d.length - 1) >> 1],
    }
  }
  const won = side((r) => r.hits >= 3)
  const lost = side((r) => r.hits === 0)

  const bins = []
  const top = rows.length ? rows[0].distance : 0
  for (let lo = 1; lo <= top; lo += bin) {
    const hi = lo + bin - 1
    const inside = rows.filter((r) => r.distance >= lo && r.distance <= hi)
    if (!inside.length) continue
    bins.push({
      lo,
      hi,
      pool: inside.length,
      won: inside.filter((r) => r.hits >= 3).length,
      lost: inside.filter((r) => r.hits === 0).length,
      // Les lignes elles-mêmes, du 회차 le plus récent au plus ancien : la
      // vue les déplie quand on clique la barre, pour relier le graphe au
      // tableau sans chercher à la main.
      rows: [...inside].sort((a, b) => a.distance - b.distance),
    })
  }

  const w = rows.filter((r) => r.distance >= DISTANCE_WINDOW.lo && r.distance <= DISTANCE_WINDOW.hi)
  return {
    rang: draws.rangs[i],
    target: from,
    upcoming: !after,
    lines: rows.length,
    won,
    lost,
    bins,
    window: { pool: w.length, won: w.filter((r) => r.hits >= 3).length },
  }
}
