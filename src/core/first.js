// 필터 1등 — les trois écrans qui ne sont pas un des six indicateurs.
//
// Le groupe « 필터 1등 » de l'ancien menu comptait neuf entrées : les six
// indicateurs (총합, 저고, 홀짝, 앞자리수, 끝자리수, AC값), que `filters.js`
// rend d'un seul calcul paramétré, puis ces trois-là, qui répondent chacune
// à une question différente et ne se rangeaient dans aucun moule commun :
//
//   배수분석    combien de multiples de 2, 3, 4, 5 parmi les six
//   10회차1등   ce que le tirage reprend des 회차 précédents
//   홀짝저고AC  le couple 홀짝 × 저고
//
// Les trois règles sont reprises telles quelles des vues Django
// `dbanalyst`, `lesdixwinner` et `lowhighcompociteac`, et vérifiées contre
// l'ancienne base (voir test/board.test.js).
//
// Toutes portent sur les **six numéros seuls** — le 보너스 n'y entre pas.
// Sauf une exception, et elle compte : la liste du 10회차1등 est bâtie sur
// les **sept** numéros des tirages passés, bonus compris.

import { COMPOSITES, PICK, PRIMES } from './draws.js'
import { indicatorsOf, pairLabel } from './filters.js'
import { MULTIPLES } from './metrics.js'

/**
 * Les trois écrans, dans l'ordre du menu d'origine.
 *
 * Les libellés sont ceux de la barre latérale — 배수분석, 10회차1등,
 * 홀짝저고AC — et non les titres des pages, qui étaient des copiés-collés
 * restés en place : `1등analystdata.html` s'annonçait « 1등 AC 당첨 통계 및
 * 패턴 » et `1등홀수저고ac.html` « 10회차 당첨 통계 및 패턴 ».
 */
export const FIRST_VIEWS = [
  { key: 'multiples', label: '배수분석', gloss: '2 · 3 · 4 · 5의 배수' },
  { key: 'recent', label: '10회차1등', gloss: '앞 회차에 나온 번호' },
  { key: 'parity', label: '홀짝저고AC', gloss: '홀짝과 저고의 짝' },
]

export const isFirstView = (key) => FIRST_VIEWS.some((v) => v.key === key)

/** Compte les valeurs, du plus fréquent au plus rare — le tri de l'ancien. */
function tally(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]))
}

// ───────────────────────────────────────────────────────────── 배수분석

/**
 * 배수분석 — les multiples, et trois sommes.
 *
 * L'ancienne page montrait trois histogrammes, et son tableau les mêmes
 * trois colonnes calculées :
 *
 *   2+3+4+5   la somme des quatre comptes
 *   3+4+5     sans les pairs — le 2 domine tout, l'ôter fait ressortir le reste
 *   3+4       les deux seuls qui se recoupent (tout multiple de 4 l'est de 2)
 *
 * Le tableau est rangé par 회차 **croissant** : c'est l'ordre de la vue
 * d'origine, et le seul des trois écrans à ne pas partir du plus récent.
 */
export function multipleSeries(draws) {
  const rows = []
  for (let i = 0; i < draws.n; i++) {
    const six = draws.numbersAt(i)
    const counts = {}
    for (const m of MULTIPLES) {
      let k = 0
      for (let j = 0; j < PICK; j++) if (six[j] % m === 0) k++
      counts[m] = k
    }
    const all = counts[2] + counts[3] + counts[4] + counts[5]
    const odd = counts[3] + counts[4] + counts[5]
    const pair = counts[3] + counts[4]
    rows.push({
      rang: draws.rangs[i],
      numbers: [...six],
      counts,
      ac: indicatorsOf(six).ac,
      all,
      odd,
      pair,
    })
  }
  return {
    rows,
    // Les clés sont des entiers : quoi qu'on fasse, l'objet les rendra dans
    // l'ordre croissant. Tant mieux — une distribution en cloche se lit sur
    // un axe qui monte, pas sur des barres rangées par hauteur.
    all: tally(rows.map((r) => r.all)),
    odd: tally(rows.map((r) => r.odd)),
    pair: tally(rows.map((r) => r.pair)),
  }
}

// ──────────────────────────────────────────────────────────── 10회차1등

/**
 * Le nombre de 회차 que remonte la liste.
 *
 * La page s'appelle 10회차1등 et son titre annonce dix tirages. Le code en
 * lisait **quatorze** — `for vv in range(1,15)`. On garde le nom, qui est
 * celui du menu, et le nombre, qui est celui des chiffres affichés : c'est
 * la seule façon de retrouver les mêmes lignes.
 */
export const RECENT_SPAN = 14

/**
 * Les 회차 écartés en tête d'historique.
 *
 * L'original passait son chemin tant que `회차 > 16` n'était pas vrai. Quatorze
 * auraient suffi ; on garde seize, sinon le compte des lignes et les hauteurs
 * des barres ne tombent plus sur celles de l'ancienne page.
 */
export const RECENT_FLOOR = 16

/**
 * 10회차1등 — ce qu'un tirage reprend des précédents.
 *
 *   리스트      l'union des **sept** numéros (six + 보너스) des 14 회차 d'avant
 *   당첨번호    ceux des six gagnants qui s'y trouvent
 *   소수 · 합성수  les premiers et les composés présents dans 리스트
 *
 * Le 1 n'est ni premier ni composé : il peut être dans 리스트 sans compter
 * dans aucune des deux familles. C'était déjà le cas dans l'original, dont
 * les deux listes en dur totalisaient 44 numéros sur 45.
 *
 * `base` porte l'historique complet — la liste d'un 회차 a besoin des
 * quatorze qui le précèdent, même quand on n'affiche qu'une tranche. `draws`
 * dit quels 회차 sortent, du plus récent au plus ancien.
 */
export function recentSeries(base, draws = base) {
  const rows = []

  for (let i = draws.n - 1; i >= 0; i--) {
    const rang = draws.rangs[i]
    if (rang <= RECENT_FLOOR) continue

    // On repart de `base` : sur une tranche, les voisins d'un 회차 ne sont
    // pas ceux de la tranche mais ceux de l'historique.
    const at = base.indexOf(rang)
    if (at < RECENT_SPAN) continue

    const seen = new Set()
    for (let vv = 1; vv <= RECENT_SPAN; vv++) {
      for (const n of base.fullAt(at - vv)) seen.add(n)
    }

    const six = [...draws.numbersAt(i)]
    const list = [...seen].sort((a, b) => a - b)
    const primes = PRIMES.filter((n) => seen.has(n))
    const composites = COMPOSITES.filter((n) => seen.has(n))

    const won = six.filter((n) => seen.has(n))
    rows.push({
      rang,
      numbers: six,
      list,
      listCount: list.length,
      won,
      wonCount: won.length,
      primes,
      primeCount: primes.length,
      wonPrimes: six.filter((n) => primes.includes(n)),
      composites,
      compositeCount: composites.length,
      wonComposites: six.filter((n) => composites.includes(n)),
    })
  }

  return { rows, counts: tally(rows.map((r) => r.wonCount)) }
}

// ─────────────────────────────────────────────────────────── 홀짝저고AC

/**
 * 홀짝저고AC — le couple 홀짝 × 저고.
 *
 * Deux indicateurs qu'on lit d'ordinaire séparément, croisés : « 4 : 2 » de
 * 홀짝 avec « 3 : 3 » de 저고 ne dit pas la même chose que le même 홀짝 avec
 * « 5 : 1 ». Quarante-deux couples se rencontrent sur l'historique.
 *
 * L'AC du nom manquait à la page d'origine — sa vue ne passait au gabarit
 * que 회차, 홀짝, 저고. La colonne est ici, puisque le nom la promet ; elle
 * n'entre pas dans le couple ni dans le comptage.
 */
export function paritySeries(draws) {
  const rows = []
  for (let i = draws.n - 1; i >= 0; i--) {
    const six = draws.numbersAt(i)
    const m = indicatorsOf(six)
    const odd = pairLabel(m.odd, PICK)
    const low = pairLabel(m.low, PICK)
    rows.push({
      rang: draws.rangs[i],
      numbers: [...six],
      odd,
      low,
      ac: m.ac,
      // Le couple tel que l'ancien l'écrivait : « 4 : 2-3 : 3 ».
      label: `${odd}-${low}`,
      // Le même, lisible : quatre chiffres et deux deux-points collés par un
      // trait, l'œil ne sait plus où l'un finit et l'autre commence.
      pretty: `${odd} · ${low}`,
    })
  }
  // Ici les clés ne sont pas des entiers : l'ordre d'insertion tient, et
  // c'est celui de l'ancien — du couple le plus fréquent au plus rare.
  return { rows, counts: tally(rows.map((r) => r.pretty)) }
}
