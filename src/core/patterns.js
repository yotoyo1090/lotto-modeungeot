// 제외번호 et les sept 패턴 — les deux tables que l'ancienne plateforme
// stockait au lieu de les calculer.
//
// `customeruser_deletenumber` (1 124 lignes) et `customeruser_predictnumber`
// (1 134 lignes × 7 colonnes de listes sérialisées) n'étaient pas des
// données : le batch `accountadmin/update.py` les fabriquait à partir des
// tirages, puis douze écrans les relisaient. Elles se refont ici en
// fonctions pures, sans table, sans import à refaire à chaque tirage.
//
//   제외번호   excluded        les 10 derniers tirages, numéro par numéro
//   패턴       pattern         les apparitions passées d'un numéro gagnant
//
// Aucune API Node : ce fichier tourne dans le navigateur, dans le Worker
// et dans le MCP, comme le reste de `src/core/`.

import { FULL, NMAX } from './draws.js'
import { choose } from './generator.js'
import { ORDERS, orderedIndices } from './legacy-order.js'

export { ORDERS }

/** La fenêtre du 제외번호 : les dix tirages précédents. */
export const EXCLUDED_WINDOW = 10

/**
 * 제외번호 — ce qui est sorti dans les dix tirages précédant un 회차.
 *
 * Pour chacun des 45 numéros : `count`, le nombre de fois qu'il apparaît
 * dans les dix tirages précédents (bonus compris, donc 70 numéros en
 * tout), et `won`, s'il est ensuite sorti au 회차 demandé.
 *
 * La fenêtre se compte **en lignes**, pas en 회차 : c'est ce que faisait
 * la tranche `[N-11:N-1]` de l'original, et c'est ce qu'il faut si
 * l'historique a des trous. Rend `null` quand il n'y a pas dix tirages
 * avant — l'ancienne table ne commençait qu'au 회차 11.
 */
export function excluded(draws, rang, { window = EXCLUDED_WINDOW } = {}) {
  const i = draws.indexOf(rang)
  if (i < window) return null

  const count = new Int16Array(NMAX + 1)
  for (let j = i - window; j < i; j++) {
    const row = draws.fullAt(j)
    for (let k = 0; k < FULL; k++) count[row[k]]++
  }

  const won = new Uint8Array(NMAX + 1)
  const winners = draws.fullAt(i)
  for (let k = 0; k < FULL; k++) won[winners[k]] = 1

  return Array.from({ length: NMAX }, (_, k) => ({
    number: k + 1,
    count: count[k + 1],
    won: won[k + 1] === 1,
  }))
}

/**
 * La question que pose le 제외번호, et à laquelle il ne répondait pas.
 *
 * « Écarter ce qui vient de sortir » suppose qu'un numéro vu dans les dix
 * derniers tirages sorte moins souvent. On le mesure : sur tout
 * l'historique, combien des sept numéros gagnants venaient du vivier des
 * dix tirages précédents, et combien il en aurait fallu si le tirage était
 * indifférent au vivier.
 *
 * L'attendu n'est pas 7/2 : le vivier n'a pas la même taille d'un 회차 à
 * l'autre. Pour chacun, l'attendu vaut `7 × taille du vivier / 45`, et on
 * additionne. C'est cette taille variable qui faisait passer le résultat
 * pour une découverte sur l'ancienne plateforme.
 */
export function excludedHitRate(draws, { window = EXCLUDED_WINDOW } = {}) {
  let hits = 0
  let expected = 0
  let rounds = 0

  // Au-delà de la moyenne : la loi entière. Pour un vivier de `pool`
  // numéros, le nombre de gagnants qui en viennent suit l'hypergéométrique
  // C(pool,k)·C(45−pool, 7−k)/C(45,7). Sommée 회차 par 회차, elle donne
  // combien de tirages devraient en retrouver 0, 1, … 7 — face au comptage.
  const counts = new Int32Array(FULL + 1)
  const law = new Float64Array(FULL + 1)
  const series = new Int8Array(Math.max(0, draws.n - window))
  const all = choose(NMAX, FULL)

  for (let i = window; i < draws.n; i++) {
    const seen = new Uint8Array(NMAX + 1)
    let pool = 0
    for (let j = i - window; j < i; j++) {
      const row = draws.fullAt(j)
      for (let k = 0; k < FULL; k++) if (!seen[row[k]]) { seen[row[k]] = 1; pool++ }
    }
    const winners = draws.fullAt(i)
    let got = 0
    for (let k = 0; k < FULL; k++) if (seen[winners[k]]) got++
    hits += got
    counts[got]++
    series[rounds] = got
    for (let k = 0; k <= FULL; k++) {
      law[k] += choose(pool, k) * choose(NMAX - pool, FULL - k) / all
    }
    expected += (FULL * pool) / NMAX
    rounds++
  }

  const total = rounds * FULL
  return {
    rounds,
    total,
    hits,
    expected,
    rate: total ? hits / total : 0,
    expectedRate: total ? expected / total : 0,
    counts,
    law,
    series,
  }
}

/**
 * 패턴 — les apparitions passées d'un des sept numéros gagnants.
 *
 * `position` va de 0 à 6 : 일, 이, 삼, 사, 오, 육, 보너스. On prend le
 * numéro qui occupe cette position au 회차 demandé, puis on liste **tous
 * les tirages antérieurs qui le contiennent** (bonus compris). Chacun est
 * accompagné de `common` : combien de ses sept numéros se retrouvent dans
 * le tirage **suivant** celui demandé.
 *
 * Ce « suivant » est la clef de l'affaire. Quand le 회차 demandé est le
 * dernier connu, il n'y a pas de suivant et tous les `common` valent 0 —
 * exactement comme dans l'ancienne base, où le batch rappelait la même
 * fonction sur le 회차 précédent une semaine plus tard, une fois son futur
 * connu. Ici la question ne se pose pas : le calcul se refait à chaque
 * lecture, donc il est toujours à jour.
 *
 * `order` choisit l'ordre de la liste — voir `legacy-order.js`.
 */
export function pattern(draws, rang, position, { order = 'legacy', indices } = {}) {
  if (!Number.isInteger(position) || position < 0 || position >= FULL) {
    throw new RangeError(`위치는 0..${FULL - 1} 사이여야 합니다`)
  }
  const walk = indices ?? orderedIndices(draws, order)
  const i = draws.indexOf(rang)
  const target = draws.sequenceAt(i)[position]

  let future = null
  const next = i + 1
  if (next < draws.n && draws.rangs[next] === rang + 1) {
    future = draws.sequenceAt(next)
  }

  const out = []
  for (const j of walk) {
    if (draws.rangs[j] >= rang) continue
    const row = draws.sequenceAt(j)
    if (!contains(row, target)) continue
    out.push({
      rang: draws.rangs[j],
      numbers: Array.from(row),
      common: future ? overlap(future, row) : 0,
    })
  }
  return { rang, position, number: target, hasFuture: future !== null, entries: out }
}

/**
 * Les sept listes d'un 회차 d'un coup — 일 … 보너스.
 *
 * L'ancienne table avait sept colonnes ; c'est la même chose, sans la
 * table. Ne recalcule l'ordre qu'une fois pour les sept.
 */
export function patterns(draws, rang, { order = 'legacy' } = {}) {
  const indices = orderedIndices(draws, order)
  return Array.from({ length: FULL }, (_, p) =>
    pattern(draws, rang, p, { order, indices }))
}

/**
 * Toutes les listes d'une position, pour tous les 회차 — en tableaux plats.
 *
 * C'est la forme dont les écrans ont besoin, et elle tient en un mégaoctet
 * là où la version en objets en prendrait cinquante. Les entrées du 회차
 * numéro i occupent `[offsets[i], offsets[i + 1])`.
 *
 *   rangs    les 회차, croissants
 *   offsets  n + 1 bornes
 *   index    l'indice du tirage cité, dans `draws`
 *   common   son recouvrement avec le tirage suivant
 *
 * Coût : un balayage quadratique de l'historique — ~1,3 million de tests
 * d'appartenance sur 1 134 tirages. Mesuré dans `tools/bench.js`.
 */
export function patternTable(draws, position, { order = 'legacy' } = {}) {
  const indices = orderedIndices(draws, order)
  const n = draws.n
  const rangs = new Int32Array(n)
  const offsets = new Int32Array(n + 1)
  const index = []
  const common = []

  for (let i = 0; i < n; i++) {
    rangs[i] = draws.rangs[i]
    const target = draws.sequenceAt(i)[position]
    const next = i + 1
    const future = next < n && draws.rangs[next] === draws.rangs[i] + 1
      ? draws.sequenceAt(next)
      : null

    for (const j of indices) {
      if (draws.rangs[j] >= draws.rangs[i]) continue
      const row = draws.sequenceAt(j)
      if (!contains(row, target)) continue
      index.push(j)
      common.push(future ? overlap(future, row) : 0)
    }
    offsets[i + 1] = index.length
  }

  return {
    rangs,
    offsets,
    index: Int32Array.from(index),
    common: Int8Array.from(common),
  }
}

/**
 * L'histogramme global des recouvrements — `alllist` de l'ancienne vue.
 *
 * Sept cases, de 0 à 6 numéros communs, sur toutes les entrées de toutes
 * les listes. C'est le seul chiffre de ces écrans qui dise quelque chose :
 * il répond à « un tirage passé qui partageait un numéro avec le tirage
 * courant en partage-t-il d'autres avec le suivant ? »
 */
export function commonHistogram(table) {
  // FULL + 1 cases : de 0 à 7 numéros communs. Sept est impossible en
  // pratique — il faudrait que deux tirages soient identiques — mais une
  // case manquante fait écrire hors du tableau, et un Int32Array avale
  // l'écriture sans rien dire. Mieux vaut la case en trop.
  const out = new Int32Array(FULL + 1)
  for (let k = 0; k < table.common.length; k++) out[table.common[k]]++
  return out
}

/**
 * Les colonnes cumulées d'un 회차 — `alllistcouter` de l'ancienne vue.
 *
 * Pour la k-ième entrée des listes, l'histogramme des recouvrements sur
 * **tous les 회차 jusqu'à celui demandé, inclus**. L'ancienne page en
 * affichait 1 134 jeux d'un coup ; ici on en calcule un, celui qu'on
 * regarde.
 *
 * Rend un tableau de colonnes : `[{ column, counts: Int32Array(7) }]`.
 */
export function patternColumns(table, rang) {
  let upTo = -1
  for (let i = 0; i < table.rangs.length; i++) {
    if (table.rangs[i] <= rang) upTo = i
    else break
  }
  if (upTo < 0) return []

  const columns = []
  for (let i = 0; i <= upTo; i++) {
    const from = table.offsets[i]
    const to = table.offsets[i + 1]
    for (let k = 0; k < to - from; k++) {
      columns[k] ??= new Int32Array(FULL + 1)
      columns[k][table.common[from + k]]++
    }
  }
  return columns.map((counts, k) => ({ column: k + 1, counts }))
}

/**
 * La distribution attendue des recouvrements, si les tirages étaient
 * indépendants.
 *
 * Loi hypergéométrique : sept numéros tirés parmi 45, combien retombent
 * sur sept numéros fixés. `P(k) = C(7,k)·C(38,7−k) / C(45,7)`.
 *
 * C'est le chiffre qui manquait à l'ancienne plateforme. Sans lui, un
 * histogramme dont le mode est à 1 a l'air de dire quelque chose ; avec
 * lui, on voit qu'il dit exactement ce que dirait un tirage au sort.
 */
export function expectedCommon() {
  const total = choose(NMAX, FULL)
  return Array.from({ length: FULL + 1 }, (_, k) =>
    (choose(FULL, k) * choose(NMAX - FULL, FULL - k)) / total)
}

function contains(row, value) {
  for (let k = 0; k < FULL; k++) if (row[k] === value) return true
  return false
}

function overlap(a, b) {
  let n = 0
  for (let k = 0; k < FULL; k++) if (contains(b, a[k])) n++
  return n
}
