// La période d'un bloc.
//
// La barre du haut commande tout l'onglet. Chaque bloc peut ensuite prendre
// la sienne, sans toucher aux autres : on compare alors le 흐름 sur 50 회차
// et le 온도 sur tout l'historique, côte à côte, sur le même écran.
//
// C'est possible parce que rien n'est précalculé. Une analyse coûte 7
// millisecondes ; dix blocs sur dix périodes différentes ne se sentent pas.
// L'ancienne plateforme aurait eu besoin d'une table par bloc et par période.

/** Les choix, dans l'ordre où les boutons les montrent. */
export const SCOPES = [
  { key: 'follow', label: '따름' },
  { key: 'all', label: '전체' },
  { key: 200, label: '최근 200' },
  { key: 100, label: '최근 100' },
  { key: 50, label: '최근 50' },
]

/** Un bloc suit-il encore la barre du haut ? */
export const follows = (span) => span == null || span === 'follow'

/**
 * Les 회차 que voit un bloc.
 *
 * `base` est l'historique entier, `inherited` ce que la barre du haut a déjà
 * découpé. Un bloc qui suit rend `inherited` ; un bloc qui a choisi part de
 * `base` — sans quoi « 전체 » signifierait « tout ce que le haut a bien voulu
 * laisser », ce qui n'est pas ce que le mot dit.
 */
export function scoped(base, inherited, span) {
  if (follows(span)) return inherited
  if (span === 'all') return base
  if (Array.isArray(span)) return base.window(span[0], span[1])
  return base.last(span)
}
