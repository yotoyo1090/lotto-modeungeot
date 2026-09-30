// Le générateur, dans un fil séparé.
//
// Une recherche sur les 8 145 060 combinaisons prend de 2 à 400 ms selon les
// filtres. Sur le fil principal, ces 400 ms seraient 400 ms pendant
// lesquelles la page ne répond plus : un curseur qu'on déplace se figerait à
// chaque cran. Ici, l'interface reste vivante et la réponse arrive quand
// elle arrive.
//
// Le protocole est délibérément minimal : un identifiant, un produit, des
// filtres, des options. L'identifiant permet d'ignorer les réponses
// périmées — quand on fait glisser un curseur, seule la dernière compte.

import * as lotto from '@core/generator.js'
import * as pension from '@core/pension-generator.js'

const ENGINES = { lotto, pension }

self.onmessage = ({ data }) => {
  const { id, product = 'lotto', filters = {}, options = {} } = data
  const engine = ENGINES[product]
  if (!engine) {
    self.postMessage({ id, error: `produit inconnu : ${product}` })
    return
  }
  try {
    const result = engine.generate(filters, options)
    // Les tableaux typés voyagent par copie ; on ne transfère pas le tampon,
    // il appartient encore au générateur.
    self.postMessage({ id, result: { ...result, grids: Array.from(result.grids) } })
  } catch (error) {
    self.postMessage({ id, error: error.message })
  }
}
