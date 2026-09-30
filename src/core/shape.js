// 모양 닮은꼴 — la ressemblance de deux tirages, vue comme deux dessins.
//
// Le bulletin range les 45 numéros sept par ligne : 1–7, 8–14, … 43–45. Six
// numéros y font donc six marques sur une grille 7 × 7, et cette figure est
// ce que 용지 마킹 appelle le motif.
//
// Deux tirages n'ont presque jamais les mêmes numéros — c'est ce que mesure
// 중복. Ici on mesure autre chose : est-ce qu'ils dessinent la **même
// forme** ? On pose une feuille sur l'autre et on la fait glisser ; le score
// est le nombre de marques qui se superposent au meilleur glissement, de 0
// à 6. Deux tirages décalés d'une ligne mais de figure identique marquent 6.
//
// Aucune API Node : ce fichier tourne dans le navigateur comme dans le MCP.

import { NMAX, PICK } from './draws.js'
import { mulberry32 } from './generator.js'

/** La largeur du bulletin : sept cases par ligne. */
export const COLS = 7
/** Sept lignes suffisent aux 45 numéros (la dernière n'en porte que trois). */
export const ROWS = Math.ceil(NMAX / COLS)

/** La case d'un numéro sur la feuille : [ligne, colonne], à partir de zéro. */
export const cellOf = (n) => [Math.floor((n - 1) / COLS), (n - 1) % COLS]

/**
 * Les six marques d'un tirage, rangées.
 *
 * On renvoie un Int8Array plat — ligne, colonne, ligne, colonne… — parce que
 * cette fonction est appelée des millions de fois par `similar` et qu'un
 * tableau d'objets y coûterait plus que le calcul lui-même.
 */
export function cells(numbers) {
  const out = new Int8Array(numbers.length * 2)
  for (let i = 0; i < numbers.length; i++) {
    const [r, c] = cellOf(numbers[i])
    out[i * 2] = r
    out[i * 2 + 1] = c
  }
  return out
}

/**
 * La signature d'une forme : les marques ramenées dans le coin haut-gauche.
 *
 * Deux tirages qui dessinent la même figure à un décalage près ont la même
 * signature — c'est l'égalité stricte que `similar` généralise en score.
 */
export function signature(numbers) {
  const cs = cells(numbers)
  let minR = 99
  let minC = 99
  for (let i = 0; i < cs.length; i += 2) {
    if (cs[i] < minR) minR = cs[i]
    if (cs[i + 1] < minC) minC = cs[i + 1]
  }
  const pairs = []
  for (let i = 0; i < cs.length; i += 2) {
    pairs.push(`${cs[i] - minR},${cs[i + 1] - minC}`)
  }
  return pairs.sort().join(' ')
}

/**
 * Le score de ressemblance de deux tirages : combien de marques coïncident
 * au meilleur glissement, de 0 à PICK.
 *
 * `b` est passé sous forme de grille (Uint8Array de ROWS × COLS) parce que
 * la boucle la relit pour chacun des 13 × 13 décalages ; la construire une
 * fois par comparaison, et non par décalage, est tout l'intérêt.
 */
export function match(cellsA, gridB) {
  let best = 0
  let bestR = 0
  let bestC = 0
  const full = cellsA.length / 2
  for (let dr = -(ROWS - 1); dr <= ROWS - 1; dr++) {
    for (let dc = -(COLS - 1); dc <= COLS - 1; dc++) {
      let hit = 0
      for (let i = 0; i < cellsA.length; i += 2) {
        const r = cellsA[i] + dr
        const c = cellsA[i + 1] + dc
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue
        if (gridB[r * COLS + c]) hit++
      }
      // À score égal on garde le décalage le plus petit : entre deux
      // lectures aussi bonnes, celle qui bouge le moins se voit mieux.
      if (hit > best || (hit === best && Math.abs(dr) + Math.abs(dc) < Math.abs(bestR) + Math.abs(bestC))) {
        best = hit
        bestR = dr
        bestC = dc
      }
      if (best === full && dr === 0 && dc === 0) return { score: best, dr, dc }
    }
  }
  return { score: best, dr: bestR, dc: bestC }
}

/** Le score seul — ce que `match` calcule, sans le décalage. */
export function similarity(cellsA, gridB) {
  return match(cellsA, gridB).score
}

/** La grille 7 × 7 d'un tirage — ce que `similarity` attend en second. */
export function grid(numbers) {
  const g = new Uint8Array(ROWS * COLS)
  for (const n of numbers) {
    const [r, c] = cellOf(n)
    g[r * COLS + c] = 1
  }
  return g
}

/**
 * Les 회차 qui ressemblent le plus à celui qu'on regarde.
 *
 * On compare le 회차 `rang` à tous les autres et on garde les `top`
 * meilleurs scores. `before` limite la comparaison au passé — c'est ce
 * qu'il faut pour juger honnêtement une règle, puisqu'un 회차 ne peut pas
 * s'inspirer de son futur.
 *
 * Rend aussi `spread` : combien de 회차 à chaque score, de 0 à PICK. C'est
 * la ligne à comparer au hasard (`similarityLaw`).
 */
export function similarTo(draws, rang, { top = 12, before = false } = {}) {
  const at = draws.indexOf(rang)
  if (at < 0) throw new RangeError(`${rang}회차가 기록에 없습니다`)
  const mine = cells(draws.numbersAt(at))

  const rows = []
  const spread = new Array(PICK + 1).fill(0)
  for (let i = 0; i < draws.n; i++) {
    if (i === at) continue
    if (before && i > at) continue
    const m = match(mine, grid(draws.numbersAt(i)))
    spread[m.score]++
    rows.push({
      rang: draws.rangs[i],
      score: m.score,
      dr: m.dr,
      dc: m.dc,
      numbers: [...draws.numbersAt(i)],
      ahead: i > at,
    })
  }
  rows.sort((a, b) => b.score - a.score || b.rang - a.rang)
  return { rang, compared: rows.length, spread, rows: rows.slice(0, top) }
}

/**
 * Le repère : la même mesure entre deux tirages tirés au sort.
 *
 * Il n'y a pas de formule courte — le meilleur glissement dépend de la
 * figure — donc on simule. Le résultat est mémorisé : la loi ne dépend
 * d'aucune donnée, seulement des règles du jeu.
 *
 * Rend { score: part }, de 0 à PICK, sommant à 1.
 */
let LAW = null
export function similarityLaw({ samples = 20000, seed = 0x5A1D } = {}) {
  if (LAW) return LAW
  const rnd = mulberry32(seed)
  const pick = () => {
    const pool = Array.from({ length: NMAX }, (_, k) => k + 1)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t
    }
    return pool.slice(0, PICK)
  }
  const tally = new Array(PICK + 1).fill(0)
  for (let s = 0; s < samples; s++) {
    tally[similarity(cells(pick()), grid(pick()))]++
  }
  LAW = tally.map((c) => c / samples)
  return LAW
}

/**
 * Les figures qui reviennent à l'identique : mêmes six marques, décalées.
 *
 * Un seul passage sur l'historique — on range les 회차 par signature et on
 * garde les groupes de deux ou plus. `expected` est ce que le hasard
 * donnerait : avec `n` tirages et `distinct` figures possibles observées,
 * la formule exacte n'a pas d'intérêt ici, on donne donc le nombre de
 * tirages concernés et le nombre de figures distinctes, qui se lisent seuls.
 */
export function shapeGroups(draws, { min = 2 } = {}) {
  const by = new Map()
  for (let i = 0; i < draws.n; i++) {
    const key = signature(draws.numbersAt(i))
    if (!by.has(key)) by.set(key, [])
    by.get(key).push(draws.rangs[i])
  }
  const groups = []
  for (const [key, rangs] of by) {
    if (rangs.length >= min) groups.push({ key, rangs, n: rangs.length })
  }
  groups.sort((a, b) => b.n - a.n || b.rangs[0] - a.rangs[0])
  return {
    distinct: by.size,
    draws: draws.n,
    groups,
    repeated: groups.reduce((a, g) => a + g.n, 0),
  }
}
