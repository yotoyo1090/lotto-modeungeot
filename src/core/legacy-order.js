// L'ordre d'insertion des tirages dans l'ancienne base Django.
//
// Ça n'a l'air de rien, et pourtant c'est visible à l'écran. Les sept
// pages 패턴 lisent leurs colonnes **par position dans une liste**, et
// cette liste était construite par un `values_list()` sans `order_by` —
// donc dans l'ordre des `id`, c'est-à-dire dans l'ordre où les lignes
// avaient été saisies il y a des années.
//
// Cet ordre est : 회차 28 → 1087, puis les 회차 1 à 27 en désordre, puis
// 1088 → 1134. Les vingt-sept premiers tirages ont manifestement été
// ajoutés après coup, à la main. On le voit dans les dix-neuf segments
// ci-dessous : deux longues plages, et au milieu le petit tas.
//
// On le garde parce que l'ancien site l'affichait ainsi et qu'il faut
// pouvoir retrouver ses écrans au pixel près. Mais il est faux : indexer
// « la k-ième apparition passée d'un numéro » n'a de sens que dans
// l'ordre chronologique. D'où l'interrupteur — voir `ORDERS`.

/** Segments [début, fin] de 회차 consécutifs, dans l'ordre des `id`. */
export const LEGACY_RUNS = [
  [28, 1087],
  [21, 21], [23, 23], [1, 4], [8, 8], [7, 7], [5, 5], [9, 9],
  [12, 16], [18, 18], [17, 17], [20, 20], [22, 22], [24, 25],
  [6, 6], [10, 11], [19, 19], [26, 27],
  [1088, 1134],
]

/** Le dernier 회차 couvert par la permutation. Au-delà : ordre naturel. */
export const LEGACY_MAX = 1134

/** Les 1134 회차, développés. */
export function legacyOrder() {
  const out = []
  for (const [a, b] of LEGACY_RUNS) for (let r = a; r <= b; r++) out.push(r)
  return out
}

export const ORDERS = ['legacy', 'rang']

/**
 * Les indices de `draws`, dans l'ordre demandé.
 *
 *   'rang'    l'ordre chronologique — `draws` est déjà trié ainsi
 *   'legacy'  l'ordre d'insertion de l'ancienne base
 *
 * Un 회차 absent de la permutation (un tirage postérieur au 1134, ou une
 * base tronquée) n'est pas perdu : il est rangé à la fin, par 회차. Si un
 * jour ce fichier disparaît, tout retombe donc sur l'ordre chronologique
 * plutôt que sur une erreur.
 */
export function orderedIndices(draws, order = 'legacy') {
  if (!ORDERS.includes(order)) throw new RangeError(`순서 : ${ORDERS.join(' | ')}`)
  const n = draws.n
  if (order === 'rang') return Int32Array.from({ length: n }, (_, i) => i)

  const byRang = new Map()
  for (let i = 0; i < n; i++) byRang.set(draws.rangs[i], i)

  const out = new Int32Array(n)
  const placed = new Uint8Array(n)
  let k = 0
  for (const rang of legacyOrder()) {
    const i = byRang.get(rang)
    if (i === undefined) continue
    out[k++] = i
    placed[i] = 1
  }
  for (let i = 0; i < n; i++) if (!placed[i]) out[k++] = i
  return out
}
