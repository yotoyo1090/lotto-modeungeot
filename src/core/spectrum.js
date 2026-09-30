// 주기도 — un numéro a-t-il un rythme ?
//
// Les écrans 흐름 montrent *quand* un numéro est sorti ; celui-ci demande si
// ces sorties reviennent à intervalle régulier. On prend la suite 0/1 du
// numéro sur tout l'historique (1 = sorti ce 회차), on la décompose en
// fréquences (périodogramme), et on regarde si une fréquence domine.
//
// Sous hasard pur la suite est un bruit blanc : toutes les fréquences ont la
// même énergie en moyenne, et la plus haute n'est haute que par accident. Le
// test de Fisher dit exactement à quelle hauteur l'accident s'arrête : g est
// la part d'énergie du pic maximal, et p la probabilité qu'un bruit blanc
// produise un pic au moins aussi haut.
//
// Ce que ce fichier ne fait pas : dater la prochaine sortie. Même un pic
// significatif ne donnerait qu'une période moyenne, pas une semaine. Et sur
// 45 numéros testés à 5 %, deux ou trois franchissent le seuil par hasard —
// c'est le compte attendu, pas une découverte.

import { NMAX } from './draws.js'
import { lnGamma } from './stats.js'

/** Le seuil de Fisher à `alpha` pour `m` fréquences : au-delà, le pic compte. */
export function fisherThreshold(m, alpha = 0.05) {
  if (m < 2) return 1
  return 1 - (alpha / m) ** (1 / (m - 1))
}

/**
 * La p-value exacte de Fisher pour un pic de part `g` parmi `m` fréquences :
 * Σ (−1)^(j−1) C(m, j) (1 − j g)^(m−1), j = 1 … ⌊1/g⌋. Les termes sont
 * énormes et alternés ; on les calcule en logarithme pour ne pas déborder.
 */
export function fisherP(g, m) {
  if (!(g > 0) || m < 2) return 1
  const jMax = Math.min(m, Math.floor(1 / g))
  let p = 0
  for (let j = 1; j <= jMax; j++) {
    const base = 1 - j * g
    if (base <= 0) break
    const ln = lnGamma(m + 1) - lnGamma(j + 1) - lnGamma(m - j + 1) + (m - 1) * Math.log(base)
    p += (j % 2 ? 1 : -1) * Math.exp(ln)
  }
  return Math.min(1, Math.max(0, p))
}

/**
 * Le périodogramme d'une suite : pour chaque fréquence de Fourier k / N
 * (k = 1 … ⌊(N−1)/2⌋), l'énergie |Σ x_t e^(−2πikt/N)|², rendue en part du
 * total. La moyenne est retirée d'abord : la fréquence 0 ne dit rien du rythme.
 *
 * Transformée directe, pas FFT : N vaut quelques milliers au plus, et les
 * tables cos/sin ramènent le coût à N × m multiplications sans rien importer.
 */
export function periodogram(x, alpha = 0.05) {
  const N = x.length
  const m = Math.floor((N - 1) / 2)
  if (m < 2) return { n: N, m, freqs: [], periods: [], share: [], total: 0, g: 0, gStar: 1, p: 1, peak: null }

  const mean = x.reduce((a, v) => a + v, 0) / N
  const c = new Float64Array(N)
  const s = new Float64Array(N)
  for (let i = 0; i < N; i++) { const a = (2 * Math.PI * i) / N; c[i] = Math.cos(a); s[i] = Math.sin(a) }

  const power = new Float64Array(m)
  let total = 0
  for (let k = 1; k <= m; k++) {
    let re = 0; let im = 0; let idx = 0
    for (let t = 0; t < N; t++) {
      const v = x[t] - mean
      re += v * c[idx]; im -= v * s[idx]
      idx += k; if (idx >= N) idx -= N
    }
    power[k - 1] = re * re + im * im
    total += power[k - 1]
  }

  let peakIndex = 0
  for (let k = 1; k < m; k++) if (power[k] > power[peakIndex]) peakIndex = k
  const share = Array.from(power, (v) => (total ? v / total : 0))
  const freqs = Array.from({ length: m }, (_, k) => (k + 1) / N)
  const periods = freqs.map((f) => 1 / f)
  const g = share[peakIndex]
  const gStar = fisherThreshold(m, alpha)
  return {
    n: N, m, freqs, periods, share, total,
    g, gStar, p: fisherP(g, m),
    peak: { index: peakIndex, period: periods[peakIndex], share: g },
  }
}

/** La suite 0/1 d'un numéro, sur la tranche `draws` — les six numéros, sans bonus. */
export function series(draws, number) {
  const out = new Array(draws.n)
  for (let i = 0; i < draws.n; i++) out[i] = draws.numbersAt(i).includes(number) ? 1 : 0
  return out
}

/** Le périodogramme d'un numéro, avec ses sorties comptées. */
export function spectrum(draws, number, alpha = 0.05) {
  const x = series(draws, number)
  const result = periodogram(x, alpha)
  return { number, drawn: x.reduce((a, v) => a + v, 0), ...result }
}

/**
 * Les 45 numéros d'un coup : pour chacun le pic, g, p, et si le seuil est
 * franchi. `expected` est le nombre de franchissements qu'un tirage au sort
 * produirait — 45 × alpha — et c'est à lui qu'il faut comparer `over`.
 */
export function spectrumAll(draws, alpha = 0.05) {
  const rows = []
  for (let n = 1; n <= NMAX; n++) {
    const r = spectrum(draws, n, alpha)
    rows.push({ number: n, drawn: r.drawn, period: r.peak?.period ?? null, g: r.g, gStar: r.gStar, p: r.p, over: r.g > r.gStar })
  }
  return { n: draws.n, alpha, rows, over: rows.filter((r) => r.over).length, expected: NMAX * alpha }
}
