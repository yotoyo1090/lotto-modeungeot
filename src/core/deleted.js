// 제외번호 — combien de fois chaque numéro est sorti dans les dix 회차 d'avant.
//
// C'est le chiffre sur lequel on décide d'écarter un numéro : s'il est déjà
// sorti quatre fois en dix tirages, faut-il encore le jouer ? La page ne
// répond pas — elle montre ce que ce chiffre valait, chez les numéros qui
// sont ensuite sortis et chez les autres.
//
// Trois comptages :
//
//   제외번호 전부 통계          toutes les cases, les 45 numéros de tous les 회차
//   제외번호에서 당첨번호 통계   seulement les sept qui sont sortis
//   제외번호만 통계             seulement les trente-huit qui ne sont pas sortis
//
// Elle lisait `customeruser_deletenumber` — 1 124 lignes × 45 colonnes
// « 일합 … 사십오합 ». Rien n'est réimporté : tout se recalcule des tirages
// (voir test/board.test.js, qui rejoue les 50 580 cases).

import { FULL, NMAX } from './draws.js'

/** La fenêtre : les dix 회차 **précédents**, celui-ci non compris. */
export const WINDOW = 10

/**
 * Le tableau complet : une ligne par 회차, 45 comptages.
 *
 * Les dix premiers 회차 n'ont pas dix prédécesseurs — l'ancienne table ne
 * les portait pas non plus, elle commençait au 회차 11. On fait pareil.
 */
export function deletedRows(draws) {
  const out = []
  for (let i = WINDOW; i < draws.n; i++) {
    const counts = new Int8Array(NMAX + 1)
    for (let k = i - WINDOW; k < i; k++) {
      for (const n of draws.fullAt(k)) counts[n]++
    }
    out.push({ rang: draws.rangs[i], counts, index: i })
  }
  return out
}

/**
 * Les trois comptages de la page.
 *
 * `won` ne retient que les sept numéros sortis au 회차 de la ligne, `lost`
 * les trente-huit autres, `all` les quarante-cinq.
 *
 * Une correction : l'original écartait le numéro **45** du partage — son
 * test `if 0 <= pos < len(f)` refusait la position 45 sur une liste de 45.
 * Le 45 n'était donc jamais compté comme gagnant, et restait chez les
 * perdants. Ici il est à sa place.
 */
export function deletedTallies(draws, rows = deletedRows(draws)) {
  const all = new Map()
  const won = new Map()
  const lost = new Map()
  const bump = (m, v) => m.set(v, (m.get(v) ?? 0) + 1)

  for (const row of rows) {
    const drawn = new Uint8Array(NMAX + 1)
    for (const n of draws.fullAt(row.index)) drawn[n] = 1
    for (let n = 1; n <= NMAX; n++) {
      const v = row.counts[n]
      bump(all, v)
      bump(drawn[n] ? won : lost, v)
    }
  }

  const asObject = (m) => Object.fromEntries(
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => [String(v), c]))

  return { all: asObject(all), won: asObject(won), lost: asObject(lost) }
}

/** Le plus grand comptage rencontré — la borne des barres et des teintes. */
export const peakCount = (rows) =>
  rows.reduce((a, r) => Math.max(a, ...r.counts), 0)

export { FULL, NMAX }
