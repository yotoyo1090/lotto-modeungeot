// Le vocabulaire 차뜨, partagé par tous les blocs de l'onglet 흐름.
//
// Les bornes viennent de `TEMPERATURE_BANDS` dans le noyau — elles ne sont
// pas redéfinies ici, seulement habillées. Si une borne change là-bas, les
// étiquettes et les couleurs suivent sans qu'on y touche.

import { TEMPERATURE_BANDS } from '@core/draws.js'

// `tone` peint un filet ou une pastille de légende ; `text` écrit un chiffre.
// Les deux diffèrent parce qu'une couleur assez claire pour servir de fond
// est trop claire pour se lire sur du blanc.
const SKIN = [
  { key: 'hot', ko: '핫', tone: 'var(--t-hot)', text: 'var(--t-hot-text)' },
  { key: 'midle', ko: '미들', tone: 'var(--t-mid)', text: 'var(--t-mid-text)' },
  { key: 'cold', ko: '콜드', tone: 'var(--t-cold)', text: 'var(--t-cold-text)' },
  { key: 'dead', ko: '데드', tone: 'var(--t-dead)', text: 'var(--t-dead-text)' },
]

export const BANDS = TEMPERATURE_BANDS.map((band, i) => ({
  ...SKIN[i],
  index: i,
  min: band.min,
  max: band.max,
  range: band.max === Infinity ? `${band.min}+` : `${band.min}–${band.max}`,
}))

/** La bande d'un écart — la même règle que `analysis.temperature`. */
export function bandOf(gap) {
  for (const band of BANDS) if (gap >= band.min && gap <= band.max) return band
  return BANDS.at(-1)
}
