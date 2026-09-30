// Ce que le site retient d'une visite à l'autre.
//
// L'ancien site enregistrait deux choses côté serveur :
//
//   `combinaison_combinasionmanuelle`   les grilles saisies à la main
//   `combinaison_combinasion`           le **formulaire** du 자동조합 —
//                                       le vivier et les quatorze filtres,
//                                       pas les combinaisons trouvées
//
// Il n'y a plus de serveur : ce qui est enregistré vit dans le navigateur,
// sur cette machine et dans ce navigateur seulement.
//
// C'est une limite réelle et il faut la dire plutôt que la cacher : un
// autre ordinateur ne verra rien, et vider les données du navigateur efface
// tout. D'où le couple export / import en fichier, qui est la seule copie
// que l'on peut ranger où l'on veut.
//
// Ce fichier ne fait qu'une chose : brancher `localStorage` sur les carnets
// du noyau. Toute la logique — les identifiants, l'import qui ajoute au lieu
// d'écraser, le refus d'un fichier du mauvais genre — est dans
// `core/combos.js`, où elle tourne sans navigateur et se teste.
import {
  AUTO_KIND, BUNDLE, MANUAL_KIND, PENSION_AUTO_KIND, PENSION_GRIDS_KIND, carnet,
} from '@core/combos.js'

export { BUNDLE }

// Lu à l'appel, jamais au chargement : en navigation privée ou quand le
// stockage est bloqué, y toucher lève, et un carnet qui fait planter la page
// serait pire que pas de carnet du tout.
const storage = () => localStorage

/**
 * Le carnet des grilles — 일반, 자동 et 수동 mêlés, chacune portant sa
 * provenance dans `source`.
 *
 * La clé et le genre de fichier ne changent pas (`lotto.manual.*`) : c'était
 * le carnet du 수동조합, seul écran qui savait enregistrer, et ses
 * enregistrements doivent rester lisibles. Une entrée sans `source` est du
 * 수동 — voir `sourceOf` dans le noyau.
 */
export const grids = carnet({
  key: 'lotto.manual.v1', kind: MANUAL_KIND, slot: 'manual', storage,
})

/** 자동조합 — le formulaire, pas les résultats. Une recherche se rejoue. */
export const auto = carnet({
  key: 'lotto.auto.v1', kind: AUTO_KIND, slot: 'auto', storage,
})

/** 연금복권 — les billets notés, et les recherches enregistrées. */
export const pensionGrids = carnet({
  key: 'pension.grids.v1', kind: PENSION_GRIDS_KIND, slot: 'pensionGrids', storage,
})
export const pensionAuto = carnet({
  key: 'pension.auto.v1', kind: PENSION_AUTO_KIND, slot: 'pensionAuto', storage,
})

/** L'ancien nom du carnet des grilles. */
export const manual = grids

/**
 * La reprise de l'ancienne base, faite une fois et jamais redemandée.
 *
 * Le fichier est posé dans `data/` par la construction ; le site le charge
 * au premier lancement et le range dans les deux carnets. Le témoin est ce
 * qui compte : sans lui, effacer un enregistrement le verrait revenir au
 * rechargement suivant, ce qui est la pire façon de perdre confiance en un
 * carnet.
 */
const SEED = 'lotto.seed.v1'

export function seeded() {
  try {
    return storage().getItem(SEED) !== null
  } catch {
    // Stockage refusé : on ne peut pas garder de témoin, donc on ne sème
    // pas. Le carnet ne survivrait pas au rechargement de toute façon.
    return true
  }
}

/** Range le fichier de reprise dans les deux carnets. Rend ce qui a été pris. */
export function seed(bundle) {
  if (seeded()) return null
  const text = typeof bundle === 'string' ? bundle : JSON.stringify(bundle)
  const out = { grids: 0, auto: 0 }
  try {
    out.grids = grids.fromFile(text)
  } catch { /* le fichier n'a pas de part pour ce carnet */ }
  try {
    out.auto = auto.fromFile(text)
  } catch { /* idem */ }
  try {
    storage().setItem(SEED, new Date().toISOString())
  } catch {
    return out
  }
  return out
}

// Les exports historiques restent ceux du 수동 : `Manual.svelte` les importe
// en bloc et n'a pas à savoir qu'il existe maintenant un second carnet.
export const load = manual.load
export const save = manual.save
export const remove = manual.remove
export const toFile = manual.toFile
export const fromFile = manual.fromFile
export const available = manual.available
