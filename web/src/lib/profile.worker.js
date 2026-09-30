// Le 예고 d'un lot (`lotProfile`), dans un fil séparé.
//
// Le calcul simule 100 000 tirages contre chaque grille : 0,1 s pour 200
// grilles, 8 s pour 20 000, plus d'une minute au-delà de 100 000. Sur le fil
// principal, la page resterait figée pendant tout ce temps ; ici elle vit,
// et le chiffre arrive quand il est prêt — complet, sans raccourci.
//
// Les grilles voyagent à plat (six numéros à la suite) : c'est une seule
// copie au lieu de centaines de milliers de petits tableaux.

import { lotProfile } from '@core/profile.js'

self.onmessage = ({ data }) => {
  const { key, flat } = data
  try {
    const grids = []
    for (let i = 0; i + 6 <= flat.length; i += 6) grids.push(Array.from(flat.subarray(i, i + 6)))
    self.postMessage({ key, profile: lotProfile(grids) })
  } catch (error) {
    self.postMessage({ key, error: error.message })
  }
}
