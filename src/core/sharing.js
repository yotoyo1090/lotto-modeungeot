// 분배 — combien de gens auront coché la même grille.
//
// Les onze autres écrans mesurent la machine : les boules, leurs écarts,
// leurs 구간. Aucun ne mesure les joueurs. Or c'est là qu'est le seul
// signal de toute la base, parce que le 1등 n'est pas un montant fixe :
// c'est une cagnotte divisée entre les gagnants. Ce qu'on gagne dépend
// donc de deux choses — sortir, et être peu nombreux à être sorti. La
// première est hors de portée. La seconde se mesure.
//
// La mesure tient dans une colonne que la base a déjà : `prizes.winners`
// du 1등, c'est le nombre de bulletins qui portaient exactement cette
// combinaison. Rapporté au volume vendu, il dit si la grille était très
// jouée ou peu jouée. Le volume vendu se lit sur le 5등, dont la
// probabilité est connue et fixe.
//
//     indice = gagnants 1등 / (gagnants 5등 × P(1등) / P(5등))
//
// Sur les 1 238 tirages : 10 601 gagnants observés pour 10 603,3 attendus.
// L'estimateur est calibré à 0,02 % près — le proxy tient.
//
// Ce fichier ne prédit aucun tirage. Il n'en est pas capable et ce n'est
// pas son objet : à probabilité de sortie identique, il classe les
// grilles par le nombre de gens avec qui il faudrait partager.
//
// Contre-épreuve (2026-09) : le site publie aussi les gagnants du 1등 par
// mode de choix — 자동 (la machine choisit) et 수동 (le joueur choisit).
// Les 자동 ne dépendent pas des numéros ; les 수동 portent toute la
// popularité. Un second modèle, `수동 ÷ 자동` sur 973 tirages, donne les
// mêmes facteurs, le même signe, le même classement des formes — avec des
// z deux fois plus grands, parce que les deux tiers de gagnants sans
// information en sont sortis. Il ne remplace pas SHARING_MODEL : ce qu'on
// partage, c'est le total, et SHARING_MODEL est déjà le total. Il
// l'explique — voir `POPULARITY_MODEL` et `popularity()`.

import { NMAX, PICK } from './draws.js'

/** P(3 bons numéros) — 5등. C(6,3)·C(39,3) / C(45,6). */
export const P5 = 182780 / 8145060

/** P(6 bons numéros) — 1등. */
export const P1 = 1 / 8145060

/**
 * Le facteur qui convertit un nombre de 5등 en nombre de 1등 attendus.
 *
 *     tirages vendus        = gagnants 5등 / P5
 *     gagnants 1등 attendus = tirages vendus × P1 = gagnants 5등 / 182 780
 */
export const EXPECTED_PER_FIFTH = P5 / P1   // 182 780

/** L'indice d'un 회차 : observé / attendu. 1 = grille de popularité moyenne. */
export function observedIndex(firstWinners, fifthWinners) {
  if (!fifthWinners) return null
  return (firstWinners * EXPECTED_PER_FIFTH) / fifthWinners
}

// --------------------------------------------------------------- Le modèle
//
// Régression de Poisson sur les 1 238 tirages, `gagnants 1등` expliqué par
// la forme de la grille, avec `log(attendu)` en offset. Les écarts-types
// sont corrigés de la surdispersion (φ = 2,05) : sans cette correction on
// déclarerait significatifs des facteurs qui ne le sont pas.
//
// Trois facteurs survivent. Un quatrième — la somme — paraissait fort en
// univarié (les petites sommes sur-jouées) et s'effondre ici : p = 0,19 à
// 0,71 selon la tranche. Il ne mesurait que l'étendue et les petits
// numéros, déjà présents. On ne le garde pas.
//
// Validation : le modèle ajusté sur les 회차 1–619 puis appliqué aux
// 620–1238 sépare toujours — indice réel 0,97 sur la moitié qu'il annonce
// basse, 1,36 sur celle qu'il annonce haute, corrélation pondérée 0,695.
// C'est ce qui distingue ce fichier des onze autres écrans.

export const SHARING_MODEL = {
  base: 0.1017,                  // 0 consécutif, 0 numéro ≤ 9, étendue ≤ 20
  runs: [0, -0.1086, 0.3206],    // 0 paire | 1–2 paires | 3 paires et plus
  small: [0, 0.1016, 0.1916],    // 0 numéro ≤ 9 | 1–2 | 3 et plus
  spread: [0, -0.1478],          // étendue ≤ 20 | étendue ≥ 21
}

/** La borne « petit numéro » — les jours du mois s'arrêtent avant. */
export const SMALL_MAX = 9

/** En deçà, la grille tient dans un mouchoir et se fait beaucoup jouer. */
export const TIGHT_SPREAD = 20

// Les trois niveaux de chaque facteur : aucun | un ou deux | trois et plus.
// Ce n'est pas un `clamp` : deux paires consécutives appartiennent au
// niveau du milieu, pas au dernier. La distinction pèse 43 % des 회차.
const level = (v) => (v === 0 ? 0 : v <= 2 ? 1 : 2)

/**
 * Les trois facteurs d'une grille, tels que le modèle les lit.
 *
 *   runs    combien de paires de numéros consécutifs (30-31-32 en fait deux)
 *   small   combien de numéros ≤ 9
 *   spread  le plus grand moins le plus petit
 */
export function sharingFactors(numbers) {
  const row = [...numbers].sort((a, b) => a - b)
  if (row.length !== PICK) throw new RangeError(`${PICK}개의 번호가 필요합니다`)
  if (row.some((n) => !Number.isInteger(n) || n < 1 || n > NMAX)) {
    throw new RangeError(`번호는 1–${NMAX}`)
  }
  if (row.some((n, i) => i > 0 && n === row[i - 1])) {
    throw new RangeError('번호가 중복되었습니다')
  }

  let runs = 0
  for (let i = 1; i < row.length; i++) if (row[i] - row[i - 1] === 1) runs++

  return {
    runs,
    small: row.filter((n) => n <= SMALL_MAX).length,
    spread: row[row.length - 1] - row[0],
  }
}

/**
 * L'indice prédit d'une grille. 1 = popularité moyenne.
 *
 * Au-dessus de 1 : plus de monde a coché ces numéros, donc un 1등 plus
 * divisé. En dessous : moins de monde, donc une part plus grosse. La
 * probabilité de sortir, elle, ne bouge pas d'un millionième — 1/8 145 060
 * pour cette grille comme pour les 8 145 059 autres.
 *
 * L'indice vaut pour une moyenne, pas pour un 회차. Le 1018회 n'a fait que
 * deux gagnants alors que le modèle l'annonçait légèrement au-dessus de la
 * moyenne : c'est du bruit de Poisson, et c'est normal. Ce qui doit tenir,
 * c'est le classement sur des centaines de tirages — voir le test.
 */
export function sharingIndex(numbers) {
  const f = sharingFactors(numbers)
  return sharingFrom(f.runs, f.small, f.spread)
}

/**
 * L'indice à partir des trois facteurs déjà comptés.
 *
 * `sharingIndex` trie et valide la grille — c'est ce qu'on veut sur une
 * saisie, pas dans une boucle qui voit huit millions de feuilles. Le
 * générateur compte ses facteurs au vol et entre ici : aucune allocation,
 * aucun tri, trois lectures de tableau.
 */
export function sharingFrom(runs, small, spread) {
  const m = SHARING_MODEL
  return Math.exp(m.base
    + m.runs[level(runs)]
    + m.small[level(small)]
    + m.spread[spread <= TIGHT_SPREAD ? 0 : 1])
}

// --------------------------------------------- Chez ceux qui choisissent
//
// Même régression de Poisson, mais gagnants 수동 expliqués par la forme,
// avec log(gagnants 자동) en offset — tools/fit-sharing.js --target manual,
// 973 tirages (les 267 premiers n'ont pas ces champs), φ = 4,09. Tous les
// facteurs significatifs (z 2,4 à 5,5). Normalisé pour que la grille
// moyenne des tirages vaille 1 : la constante 0,4707 est la moyenne de
// exp(xβ) sur les 1 240 tirages.
//
// Lecture : 2,4 = « chez les gens qui choisissent leurs numéros, cette
// forme est cochée 2,4 fois plus qu'une grille moyenne ». Sur ce que l'on
// touche, l'effet est dilué par la part 자동 — c'est ce que SHARING_MODEL
// mesure directement.

export const POPULARITY_MODEL = {
  base: -0.4014,
  runs: [0, -0.3824, 0.5341],
  small: [0, 0.3918, 0.8237],
  spread: [0, -0.5700],
  mean: 0.4707,
}

/** Popularité d'une grille chez ceux qui choisissent. 1 = grille moyenne. */
export function popularity(numbers) {
  const f = sharingFactors(numbers)
  return popularityFrom(f.runs, f.small, f.spread)
}

/**
 * La popularité à partir des trois facteurs déjà comptés — la même chose
 * que `sharingFrom` pour 분배 : le générateur les tient à jour pendant sa
 * descente et n'a pas à refaire le compte à chaque grille.
 */
export function popularityFrom(runs, small, spread) {
  const m = POPULARITY_MODEL
  return Math.exp(m.base
    + m.runs[level(runs)]
    + m.small[level(small)]
    + m.spread[spread <= TIGHT_SPREAD ? 0 : 1]) / m.mean
}

/**
 * Les bornes du classement.
 *
 * Le modèle ne rend que dix-huit valeurs distinctes — trois facteurs à 3, 3
 * et 2 niveaux. Les nommer vaut mieux que d'afficher un nombre à trois
 * décimales dont personne ne sait s'il est bon. Les seuils sont calés sur
 * l'indice réellement observé : 0,879 · 0,949 · 1,054 · 1,455.
 */
export const SHARING_BANDS = [
  { key: 'rare', label: '적게 팔린', max: 0.90 },
  { key: 'below', label: '평균 이하', max: 1.00 },
  { key: 'above', label: '평균 이상', max: 1.20 },
  { key: 'crowded', label: '많이 팔린', max: Infinity },
]

/** La bande d'un indice. */
export function sharingBand(index) {
  return SHARING_BANDS.find((b) => index < b.max)
    ?? SHARING_BANDS[SHARING_BANDS.length - 1]
}

/** Grille → { factors, index, band, label, share } — ce qu'un écran affiche. */
export function sharing(numbers) {
  const factors = sharingFactors(numbers)
  const index = sharingIndex(numbers)
  const band = sharingBand(index)
  return {
    factors,
    index,
    band: band.key,
    label: band.label,
    // Ce qu'on touche, rapporté à une grille de popularité moyenne.
    share: 1 / index,
    // Et pourquoi : combien de fois cette forme est cochée par ceux qui choisissent.
    popularity: popularity(numbers),
  }
}

/** Le meilleur et le pire indice atteignables — les bornes de l'écran. */
export function sharingRange() {
  const m = SHARING_MODEL
  const lo = m.base + Math.min(...m.runs) + Math.min(...m.small) + Math.min(...m.spread)
  const hi = m.base + Math.max(...m.runs) + Math.max(...m.small) + Math.max(...m.spread)
  return { min: Math.exp(lo), max: Math.exp(hi) }
}

/**
 * Le contrôle que ce fichier doit passer, sur l'historique réel.
 *
 * `prizes` est une Map 회차 → { first, fifth } — les gagnants du 1등 et du
 * 5등. Pour chaque 회차 on compare l'indice observé à l'indice prédit, et
 * on regroupe par bande. Si le modèle dit quelque chose, l'indice observé
 * doit monter d'une bande à l'autre. S'il ne monte plus — parce que les
 * joueurs auront changé d'habitudes — il faut réajuster `SHARING_MODEL`,
 * pas assouplir le contrôle.
 */
export function sharingCalibration(draws, prizes) {
  const bands = new Map(SHARING_BANDS.map((b) => [b.key, {
    key: b.key, label: b.label, draws: 0, observed: 0, expected: 0,
  }]))
  const total = { draws: 0, observed: 0, expected: 0 }

  for (let i = 0; i < draws.n; i++) {
    const p = prizes.get(draws.rangs[i])
    if (!p || !p.fifth) continue

    const cell = bands.get(sharingBand(sharingIndex(Array.from(draws.numbersAt(i)))).key)
    const expected = p.fifth / EXPECTED_PER_FIFTH

    cell.draws++; cell.observed += p.first; cell.expected += expected
    total.draws++; total.observed += p.first; total.expected += expected
  }

  const rows = [...bands.values()].map((b) => ({
    ...b, index: b.expected ? b.observed / b.expected : null,
  }))
  return {
    rows,
    total: { ...total, index: total.expected ? total.observed / total.expected : null },
  }
}
