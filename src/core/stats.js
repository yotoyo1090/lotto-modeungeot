// Le seul outil de statistique du projet : « cet écart est-il du bruit ? »
//
// Toute la plateforme repose sur une comparaison — observé contre attendu.
// Sans un chiffre qui dise à partir de quand l'écart cesse d'être normal,
// chaque tableau invite à lire un signal dans du bruit : sur 45 nombres il y
// en a toujours un qui dépasse, et c'est justement ce que le hasard fait.
//
// `chiSquareP` rend la probabilité d'observer un χ² au moins aussi grand si
// rien ne se passe. Une valeur haute — 0,9 — veut dire « parfaitement
// ordinaire ». Une valeur basse — 0,01 — veut dire qu'il faudrait aller
// regarder.

// ln Γ(z) — approximation de Lanczos, g = 7, n = 9.
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
]

export function lnGamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  const w = z - 1
  let x = 0.99999999999980993
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (w + i + 1)
  const t = w + LANCZOS.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (w + 0.5) * Math.log(t) - t + Math.log(x)
}

/** P(s, x) — gamma incomplète régularisée basse, par la série. */
function lowerP(s, x) {
  let term = 1 / s
  let sum = term
  for (let k = 1; k < 1000; k++) {
    term *= x / (s + k)
    sum += term
    if (Math.abs(term) < Math.abs(sum) * 1e-15) break
  }
  return sum * Math.exp(-x + s * Math.log(x) - lnGamma(s))
}

/** Q(s, x) — gamma incomplète régularisée haute, fraction continue (Lentz). */
function upperQ(s, x) {
  const TINY = 1e-300
  let b = x + 1 - s
  let c = 1 / TINY
  let d = 1 / b
  let h = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - s)
    b += 2
    d = an * d + b
    if (Math.abs(d) < TINY) d = TINY
    c = b + an / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const step = d * c
    h *= step
    if (Math.abs(step - 1) < 1e-15) break
  }
  return Math.exp(-x + s * Math.log(x) - lnGamma(s)) * h
}

/**
 * P(χ² ≥ valeur) à `df` degrés de liberté.
 *
 * La série converge vite en dessous de s+1, la fraction continue au-dessus ;
 * on prend celle qui convient, comme le veut la recette classique.
 */
export function chiSquareP(chi2, df) {
  if (!Number.isFinite(chi2) || chi2 <= 0) return 1
  if (!Number.isFinite(df) || df <= 0) return 1
  const s = df / 2
  const x = chi2 / 2
  return x < s + 1 ? 1 - lowerP(s, x) : upperQ(s, x)
}

/**
 * Le χ² d'une liste de comptages contre une même espérance.
 *
 * C'est le cas de tous les tableaux d'ici : 45 numéros, 45 lignes, quatre
 * bandes — chacun devrait recevoir la même part, et la question est de
 * savoir si les écarts constatés tiennent dans le bruit.
 */
export function chiSquareUniform(counts, expected) {
  let chi2 = 0
  for (const c of counts) chi2 += ((c - expected) ** 2) / expected
  const df = counts.length - 1
  return { chi2, df, p: chiSquareP(chi2, df) }
}

/**
 * Le χ² contre une espérance **qui varie d'une case à l'autre**.
 *
 * L'uniforme ne suffit pas dès qu'on regarde une tranche définie par les
 * numéros eux-mêmes. Dans la famille « trois pairs et trois impairs », les
 * impairs ne peuvent pas recevoir la même part que les pairs — la famille
 * l'interdit. Comparer à l'uniforme y ferait crier l'anomalie à chaque fois,
 * et l'anomalie serait la définition de la tranche, pas le tirage.
 *
 * `bound` est le nombre de contraintes déjà imposées à la répartition — deux
 * groupes pour 홀짝, quatre bandes pour le 차뜨, un seul pour l'uniforme. On
 * les retire des degrés de liberté : ce sont des marges qu'on n'a pas
 * mesurées mais fixées.
 *
 * Les cases d'espérance nulle sont ignorées : dans la famille « aucun numéro
 * ≤ 9 », les neuf premiers ne peuvent pas sortir, et un écart de zéro à zéro
 * n'apprend rien.
 */
export function chiSquareFit(counts, expected, bound = 1) {
  let chi2 = 0
  let cells = 0
  for (let i = 0; i < counts.length; i++) {
    const e = expected[i]
    if (!(e > 0)) continue
    chi2 += ((counts[i] - e) ** 2) / e
    cells++
  }
  const df = Math.max(1, cells - bound)
  return { chi2, df, cells, p: chiSquareP(chi2, df) }
}
