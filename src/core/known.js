// 고정수 — ce que change la connaissance certaine de k numéros gagnants.
//
// Une question qui revient sans cesse : « si je connaissais deux numéros,
// est-ce que je gagnerais ? » Elle mérite une réponse chiffrée plutôt qu'une
// intuition, et cette réponse est exacte — c'est de la combinatoire, pas de
// la prédiction.
//
// Fixer k numéros ne touche pas au tirage. Cela réduit l'espace à couvrir :
//
//     complétions = C(45 − k, 6 − k)
//
// 8 145 060 sans rien, 1 086 008 avec un numéro, 123 410 avec deux. Le
// second numéro divise l'espace par près de neuf à lui seul, et c'est cette
// non-linéarité qui fait tout basculer entre un et deux.
//
// Ce fichier ne sait pas désigner un numéro et n'essaie pas. Il répond à
// une question conditionnelle, et `web/src/views/Tip.svelte` affiche à côté
// ce que coûte la condition : deux numéros choisis à l'avance sont tous deux
// dans le tirage 1,5152 % du temps.

import { NMAX, PICK } from './draws.js'
import { choose } from './generator.js'

/** Au-delà de quatre numéros fixés, il ne reste plus rien à choisir. */
export const KNOWN_MAX = 4

/** Les rangs, dans l'ordre, avec le nombre de numéros qu'ils demandent. */
const RANKS = [
  { rank: 1, matched: PICK, bonus: false },
  { rank: 2, matched: PICK - 1, bonus: true },
  { rank: 3, matched: PICK - 1, bonus: false },
  { rank: 4, matched: PICK - 2, bonus: false },
  { rank: 5, matched: PICK - 3, bonus: false },
]

function check(k) {
  if (!Number.isInteger(k) || k < 0 || k > KNOWN_MAX) {
    throw new RangeError(`고정수는 0–${KNOWN_MAX}`)
  }
}

/** Combien de grilles restent à couvrir quand k numéros sont fixés. */
export function knownSpace(k) {
  check(k)
  return choose(NMAX - k, PICK - k)
}

/**
 * Le nombre de complétions qui donnent chaque rang, k numéros garantis.
 *
 * On choisit `rest` numéros parmi `pool`, dont `win` sont gagnants et un est
 * le 보너스. Pour un rang qui demande `matched` numéros au total, il en faut
 * `matched − k` parmi les gagnants restants ; les autres viennent des
 * perdants, le 보너스 étant mis à part quand le rang le distingue.
 */
export function knownCounts(k) {
  check(k)
  const rest = PICK - k
  const pool = NMAX - k
  const win = PICK - k
  const lose = pool - win          // les perdants, 보너스 compris

  const out = {}
  for (const r of RANKS) {
    const hits = r.matched - k
    if (hits < 0 || hits > rest) { out[r.rank] = 0; continue }
    out[r.rank] = r.bonus
      // le 보너스 occupe une case, les autres viennent des perdants restants
      ? choose(win, hits) * choose(lose - 1, rest - hits - 1)
      : r.rank === 3
        // cinq numéros sans le 보너스 : il faut l'éviter explicitement
        ? choose(win, hits) * choose(lose - 1, rest - hits)
        : choose(win, hits) * choose(lose, rest - hits)
  }
  return out
}

/** La probabilité de chaque rang, par grille et par tirage. */
export function knownOdds(k) {
  const total = knownSpace(k)
  const counts = knownCounts(k)
  const out = {}
  for (const rank of Object.keys(counts)) out[rank] = counts[rank] / total
  return out
}

/**
 * L'espérance d'un billet, décomposée par rang.
 *
 * `prizes` est { 등수: 금액 } — les montants moyens réellement distribués,
 * pas des valeurs théoriques : le 1등 et le 2등 sont des cagnottes partagées
 * et n'ont pas de montant fixe.
 *
 * `withoutFirst` est la seule ligne qui compte en pratique. À k = 1
 * l'espérance affiche 336 %, dont 62 % viennent d'un 1등 à une chance sur
 * 1 086 008 — un terme qui ne se réalise jamais sur une vie de joueur. Sans
 * lui il reste 127 %, à peine au-dessus de la mise. À k = 2 le reste vaut
 * déjà 688 % : la rentabilité vient alors des 4등 et 5등, qui tombent
 * 3,6 % et 29,6 % du temps.
 */
export function knownExpectation(k, prizes, price = 1000) {
  const odds = knownOdds(k)
  const rows = []
  let total = 0
  for (const r of RANKS) {
    const p = odds[r.rank] ?? 0
    const amount = prizes?.[r.rank] ?? 0
    const value = p * amount
    total += value
    rows.push({ rank: r.rank, p, amount, value })
  }
  const first = rows[0].value
  return {
    rows,
    total,
    first,
    withoutFirst: total - first,
    ratio: price ? total / price : null,
    ratioWithoutFirst: price ? (total - first) / price : null,
  }
}

/**
 * La probabilité que k numéros choisis à l'avance soient TOUS dans le
 * tirage — le prix de l'hypothèse.
 *
 *     P = C(45 − k, 6 − k) / C(45, 6)
 *
 * 13,333 % pour un numéro, 1,5152 % pour deux. C'est ce facteur qui ramène
 * les espérances ci-dessus à 54,5 %, l'espérance du règlement, dès qu'on
 * n'a aucune information réelle.
 */
export function knownChance(k) {
  check(k)
  return knownSpace(k) / choose(NMAX, PICK)
}
