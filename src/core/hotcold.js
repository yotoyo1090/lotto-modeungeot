// 차가운번호/뜨거운번호 — les 45 numéros rangés par température.
//
// L'ancienne plateforme en faisait **onze pages** bâties sur le même moule :
// 모든번호, les quatre 배수, 소수, 합성수, 홀수, 짝수, 저수, 고수. Les onze
// vues sont le même code copié onze fois (views.py:10197 → 13990) ; seule
// change la liste des colonnes lues dans `numberpattern`.
//
// Elles relisent **les mêmes cellules** que l'onglet 흐름 · 차뜨 — 당첨,
// 이월, ou l'écart depuis la dernière sortie — mais au lieu de les ranger
// écart par écart, elles les répartissent en **quatre bandes** :
//
//   뜨거운   1 – 5      sorti tout récemment
//   중간     6 – 10
//   차가운   11 – 19
//   사망     20 et plus
//
// Ce sont les bornes de `board.BANDS`, celles de l'onglet 흐름 ; elles ne
// sont pas redéfinies ici.
//
// La valeur de température d'une case, dans l'ancien code, se calculait en
// quatre branches selon le drapeau : 당첨 prenait « l'écart du 회차 précédent
// plus un », 이월 prenait 1, une case vide prenait son écart. Les trois
// reviennent au même nombre — `cell.gap`. Une seule branche s'en écartait,
// et par accident : `(1)이월` recevait **son numéro de colonne** au lieu de 1
// (views.py:10280), ce qui projetait ces numéros dans une bande au hasard.
// Ici la règle est unique : la température d'une case, c'est son écart.
//
// Rien n'est réimporté de `customeruser_numberpattern` : `tablelist.allCells`
// recalcule ces 51 030 cellules, et le test qui les rejoue est déjà en place.

import { COMPOSITES, FULL, NMAX, PRIMES } from './draws.js'
import { BANDS, bandOf } from './board.js'
import { choose } from './generator.js'
import { allCells } from './tablelist.js'

/**
 * La frontière 저/고 de **ces pages-ci** : le 23 est en 고수.
 *
 * Ce n'est pas la même que celle des pages 구간 et 리스트, qui mettent le 23
 * en 저 (`sections.SECTION_LOW_MAX` vaut 23). L'ancien site portait les deux
 * conventions ; chaque groupe garde la sienne.
 */
export const HOTCOLD_LOW_MAX = 22

const upTo = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
const every = (m) => upTo(1, NMAX).filter((n) => n % m === 0)

/** Les onze familles, dans l'ordre du menu. */
export const HOTCOLD_FAMILIES = [
  { key: 'all', label: '모든번호', gloss: '마흔다섯 번호 모두', numbers: upTo(1, NMAX) },
  { key: 'double', label: '이의배수', gloss: '2의 배수', numbers: every(2) },
  { key: 'triple', label: '삼의배수', gloss: '3의 배수', numbers: every(3) },
  { key: 'quad', label: '사의배수', gloss: '4의 배수', numbers: every(4) },
  { key: 'quint', label: '오의배수', gloss: '5의 배수', numbers: every(5) },
  { key: 'prime', label: '소수', gloss: '소수', numbers: PRIMES },
  { key: 'composite', label: '합성수', gloss: '합성수', numbers: COMPOSITES },
  { key: 'odd', label: '홀수', gloss: '홀수', numbers: upTo(1, NMAX).filter((n) => n % 2 === 1) },
  { key: 'even', label: '짝수', gloss: '짝수', numbers: upTo(1, NMAX).filter((n) => n % 2 === 0) },
  { key: 'low', label: '저수', gloss: `1–${HOTCOLD_LOW_MAX}`, numbers: upTo(1, HOTCOLD_LOW_MAX) },
  { key: 'high', label: '고수', gloss: `${HOTCOLD_LOW_MAX + 1}–${NMAX}`, numbers: upTo(HOTCOLD_LOW_MAX + 1, NMAX) },
]

/** Les numéros d'une famille. */
export function familyNumbers(family) {
  const f = HOTCOLD_FAMILIES.find((x) => x.key === family)
  if (!f) throw new RangeError(`알 수 없는 가족 : ${family}`)
  return f.numbers
}

/**
 * Un 회차, rangé en quatre bandes.
 *
 * `row` est une ligne de `allCells` ; `next` — les sept numéros du 회차
 * suivant — sert seulement à marquer, dans le tableau, ceux qui sont
 * effectivement sortis après. C'est ce que mesurent les quatre 라인통계.
 *
 * Dans chaque bande, les numéros vont de l'écart le plus court au plus long ;
 * à écart égal, du plus petit numéro au plus grand.
 */
export function hotColdRow(row, family, next = null) {
  const members = familyNumbers(family)
  const after = new Uint8Array(NMAX + 1)
  if (next) for (const n of next) after[n] = 1

  const bins = new Map(BANDS.map((b) => [b.key, []]))
  for (const n of members) {
    const cell = row[n - 1]
    bins.get(bandOf(cell.gap)).push({
      number: n,
      gap: cell.gap,
      flag: cell.flag,
      hit: after[n] === 1,
    })
  }

  const groups = BANDS.map((b) => {
    const entries = bins.get(b.key)
    entries.sort((x, y) => x.gap - y.gap || x.number - y.number)
    return {
      key: b.key,
      label: b.label,
      range: b.max === Infinity ? `${b.min}+` : `${b.min}–${b.max}`,
      entries,
      // Combien de numéros de cette bande sont sortis à ce 회차 — le chiffre
      // que les quatre histogrammes comptent.
      drawn: entries.reduce((a, e) => a + (e.flag ? 1 : 0), 0),
    }
  })

  // La règle des positions, au-dessus des numéros : 1, 2, 3… d'un bout à
  // l'autre du tableau. C'est elle qui dit « le 34 est le 4e plus chaud »
  // sans qu'on ait à compter les cases.
  //
  // L'ancien la déclarait de 1 à 45 en dur, quelle que soit la famille : sur
  // 이의배수, qui n'a que vingt-deux numéros, la règle dépassait le tableau de
  // vingt-trois colonnes. Ici elle vaut le nombre de colonnes réellement
  // dessinées — une bande vide en occupe une, comme dans le rendu.
  const width = groups.reduce((a, g) => a + Math.max(1, g.entries.length), 0)

  return {
    groups,
    // La suite des colonnes telle qu'elle est dessinée : les numéros d'une
    // bande, ou une case vide quand la bande n'en a aucun. C'est cette
    // suite-là que numérotent les 라인, et donc celle que comptent les
    // statistiques par ligne — les deux ne peuvent pas diverger.
    flat: groups.flatMap((g) => (g.entries.length
      ? g.entries.map((e) => ({ band: g.key, entry: e }))
      : [{ band: g.key, entry: null }])),
    slots: Array.from({ length: width }, (_, k) => k + 1),
    // L'ancien réservait sept lignes au tableau quoi qu'il arrive.
    height: Math.max(MIN_HEIGHT, ...groups.map((g) => g.entries.length)),
  }
}

export const MIN_HEIGHT = 7

/** Le comptage d'une liste d'entiers, valeur croissante. */
function tally(values) {
  const m = new Map()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return Object.fromEntries(
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => [String(v), c]))
}

/**
 * Tout ce que montrait une des onze pages, hors le tableau lui-même.
 *
 *   lines   par numéro de la famille : 당첨, 이월, 꽝
 *   bands   par bande : la distribution du nombre de sortants
 *   flow    par 회차 : combien de numéros peuplent chaque bande
 *
 * `lines` reprend les trois séries de l'histogramme 라인통계 — et ses noms.
 * Les `(n)이월` y sont comptés avec les 이월, comme dans l'original.
 */
export function hotColdSeries(draws, family, cellRows = allCells(draws)) {
  const members = familyNumbers(family)

  const won = new Int32Array(NMAX + 1)
  const carried = new Int32Array(NMAX + 1)
  const drawnPer = new Map(BANDS.map((b) => [b.key, []]))
  const flow = []

  // La loi des quatre 라인통계 : une bande de `pop` numéros parmi 45, sept
  // sortent, le nombre qui tombe dans la bande est hypergéométrique. La
  // taille de la bande change à chaque 회차 — une loi par 회차, additionnées.
  const law = new Map(BANDS.map((b) => [b.key, new Float64Array(FULL + 1)]))
  const totalDraws = choose(NMAX, FULL)

  for (let i = 0; i < draws.n; i++) {
    const row = cellRows[i]
    const pop = new Map(BANDS.map((b) => [b.key, 0]))
    const hit = new Map(BANDS.map((b) => [b.key, 0]))

    for (const n of members) {
      const cell = row[n - 1]
      const key = bandOf(cell.gap)
      pop.set(key, pop.get(key) + 1)
      if (cell.flag) {
        hit.set(key, hit.get(key) + 1)
        if (cell.flag === '당첨') won[n]++
        else carried[n]++
      }
    }

    for (const b of BANDS) {
      drawnPer.get(b.key).push(hit.get(b.key))
      const size = pop.get(b.key)
      const target = law.get(b.key)
      for (let k = 0; k <= FULL; k++) {
        target[k] += (choose(size, k) * choose(NMAX - size, FULL - k)) / totalDraws
      }
    }
    flow.push({
      rang: draws.rangs[i],
      ...Object.fromEntries(BANDS.map((b) => [b.key, pop.get(b.key)])),
    })
  }

  const lines = members.map((n) => ({
    number: n,
    won: won[n],
    carried: carried[n],
    // 꽝 — le mot de l'ancien histogramme pour « pas sorti ».
    blank: draws.n - won[n] - carried[n],
  }))

  const bands = BANDS.map((b) => ({
    key: b.key,
    label: b.label,
    range: b.max === Infinity ? `${b.min}+` : `${b.min}–${b.max}`,
    counts: tally(drawnPer.get(b.key)),
    // Sous les mêmes clés que `counts` : « k » → 회차 attendus avec k sortants.
    law: Object.fromEntries(
      Array.from(law.get(b.key), (v, k) => [String(k), v]).filter(([, v]) => v >= 0.05)),
  }))

  return { family, lines, bands, flow }
}

export { BANDS }

// ─────────────────────────────────── ce que valent les lignes et les bandes
//
// Le tableau 번호 패턴 range les numéros du plus chaud au plus froid. La
// question qu'on lui pose forcément — « la ligne 1 sort-elle plus souvent
// que la ligne 30 ? » — n'avait aucune réponse affichée. Les deux fonctions
// qui suivent la donnent, et donnent surtout la barre à laquelle comparer.

/**
 * 라인별 당첨률 — pour chaque colonne du tableau, sur tout l'historique.
 *
 *   won     combien de fois cette colonne portait un numéro sorti
 *   first   combien de fois elle portait le **premier** sorti du 회차,
 *           c'est-à-dire le plus à gauche
 *   seen    combien de 회차 avaient cette colonne (une famille étroite en a
 *           moins, et une bande vide en déplace le compte)
 *
 * Les colonnes sont celles de `hotColdRow().flat` — la même suite que le
 * rendu, bande après bande.
 */
export function hotColdLineStats(draws, family, cellRows = allCells(draws)) {
  const members = familyNumbers(family)
  const width = members.length + BANDS.length

  const seen = new Int32Array(width + 2)
  const won = new Int32Array(width + 2)
  const first = new Int32Array(width + 2)

  for (let i = 0; i < draws.n; i++) {
    const { flat } = hotColdRow(cellRows[i], family)
    let opened = false
    for (let k = 0; k < flat.length; k++) {
      seen[k + 1]++
      const e = flat[k].entry
      if (!e || !e.flag) continue
      won[k + 1]++
      if (!opened) { first[k + 1]++; opened = true }
    }
  }

  const out = []
  for (let k = 1; k <= width; k++) {
    if (!seen[k]) continue
    out.push({
      line: k,
      seen: seen[k],
      won: won[k],
      first: first[k],
      wonRate: won[k] / seen[k],
      firstRate: first[k] / seen[k],
    })
  }
  return out
}

/**
 * Une seule 라인, 회차 par 회차 : le numéro qui l'occupe sort-il ?
 *
 * La carte d'un 회차 est classée sur l'attente **avant** le tirage, donc
 * la 라인 est connue d'avance et la question regarde bien devant. Série 0/1
 * (1 = le numéro de cette 라인 est parmi les sept), taux, et le repère
 * 7 / 45 — la 라인 ne change rien à la chance d'un numéro. Les 회차 où la
 * 라인 n'existe pas (famille plus étroite que la ligne) sont sautés.
 */
export function hotColdLineCarry(draws, family, line, cellRows = allCells(draws)) {
  const series = []
  let hits = 0
  for (let i = 0; i < draws.n; i++) {
    const { flat } = hotColdRow(cellRows[i], family)
    const e = flat[line - 1]?.entry
    if (!e) continue
    const v = e.flag ? 1 : 0
    series.push(v)
    hits += v
  }
  const rounds = series.length
  const expectedRate = FULL / NMAX
  return {
    line,
    rounds,
    hits,
    rate: rounds ? hits / rounds : 0,
    expected: rounds * expectedRate,
    expectedRate,
    series: Int8Array.from(series),
  }
}

/**
 * La règle « 같은 라인 » : le gagnant d'une position (일 … 보너스) occupait
 * une 라인 de la carte du 회차 i ; dans la carte du 회차 i + 1, le numéro qui
 * occupe cette même 라인 sort-il ?
 *
 * Pour chaque position, une série 0/1 sur les 회차 1 … n − 1 (le dernier
 * n'a pas de suivant), le taux, et le repère 7 / 45 — la carte suivante
 * étant classée avant son tirage, son numéro à la 라인 L n'a pas plus de
 * chance qu'un autre. Rend un tableau de PLACES entrées, dans l'ordre
 * 일 · 이 · 삼 · 사 · 오 · 육 · 보너스 ; `line` est la 라인 du gagnant au
 * dernier 회차 et `candidate` le numéro à cette 라인 dans la carte à venir,
 * si `nextCard` (les 45 cellules du 회차 suivant) est fourni.
 */
export function hotColdSameLine(draws, family, cellRows = allCells(draws), nextCard = null) {
  const lineOfNumber = (i) => {
    const { flat } = hotColdRow(cellRows[i], family)
    const at = new Int16Array(NMAX + 1)
    flat.forEach((cell, k) => { if (cell.entry) at[cell.entry.number] = k + 1 })
    return { flat, at }
  }
  const cards = []
  for (let i = 0; i < draws.n; i++) cards.push(lineOfNumber(i))

  const expectedRate = FULL / NMAX
  const out = []
  for (let p = 0; p < FULL; p++) {
    const series = []
    let hits = 0
    for (let i = 0; i + 1 < draws.n; i++) {
      const winner = draws.sequenceAt(i)[p]
      const line = cards[i].at[winner]
      if (!line) continue
      const next = cards[i + 1].flat[line - 1]?.entry
      if (!next) continue
      const v = next.flag ? 1 : 0
      series.push(v)
      hits += v
    }
    const rounds = series.length
    const lastWinner = draws.sequenceAt(draws.n - 1)[p]
    const line = cards[draws.n - 1].at[lastWinner] || null
    let candidate = null
    if (line && nextCard) {
      const { flat } = hotColdRow(nextCard, family)
      candidate = flat[line - 1]?.entry?.number ?? null
    }
    out.push({
      place: p,
      rounds,
      hits,
      rate: rounds ? hits / rounds : 0,
      expected: rounds * expectedRate,
      expectedRate,
      series: Int8Array.from(series),
      line,
      candidate,
    })
  }
  return out
}

/**
 * 온도별 검증 — combien de sortants chaque bande a donnés, et combien elle
 * en devait.
 *
 * La bande 뜨거운 gagne plus souvent que 사망. Ce n'est pas une nouvelle :
 * elle est bien plus peuplée. La seule question qui vaille est de savoir si
 * elle gagne **plus que sa taille ne l'exige**. À chaque 회차, si le tirage
 * ignore la température, les sortants de la famille se répartissent au
 * prorata des effectifs :
 *
 *     attendu(bande) = sortants du 회차 × effectif(bande) / effectif(famille)
 */
export function hotColdShare(draws, family, cellRows = allCells(draws)) {
  const members = familyNumbers(family)
  const drawn = new Map(BANDS.map((b) => [b.key, 0]))
  const expected = new Map(BANDS.map((b) => [b.key, 0]))

  for (let i = 0; i < draws.n; i++) {
    const row = cellRows[i]
    const pop = new Map(BANDS.map((b) => [b.key, 0]))
    let out = 0

    for (const n of members) {
      const cell = row[n - 1]
      const key = bandOf(cell.gap)
      pop.set(key, pop.get(key) + 1)
      if (cell.flag) { drawn.set(key, drawn.get(key) + 1); out++ }
    }
    if (!out) continue
    for (const b of BANDS) {
      expected.set(b.key, expected.get(b.key) + (out * pop.get(b.key)) / members.length)
    }
  }

  const total = [...drawn.values()].reduce((a, c) => a + c, 0)
  return BANDS.map((b) => ({
    key: b.key,
    label: b.label,
    drawn: drawn.get(b.key),
    expected: expected.get(b.key),
    share: total ? drawn.get(b.key) / total : 0,
    expectedShare: total ? expected.get(b.key) / total : 0,
  }))
}
