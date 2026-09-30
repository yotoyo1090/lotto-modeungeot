// La vue matricielle des tirages 6/45, et le vocabulaire du domaine.
//
// Aucune API Node ici : ce fichier tourne tel quel dans le navigateur,
// dans le pré-calcul et dans le MCP. C'est ce qui garantit qu'il n'existe
// qu'une seule implémentation de chaque calcul.
//
// Les données sont rangées en tableaux typés à pas fixe plutôt qu'en
// tableaux d'objets : c'est ce qui rend les analyses rapides sans avoir
// besoin d'une bibliothèque de calcul.

export const NMAX = 45          // numéros de 1 à 45
export const PICK = 6           // six numéros tirés
export const FULL = 7           // les six, plus le bonus
export const LOW_MAX = 22       // 저 = 1..22, 고 = 23..45

export const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]
// 1 n'est ni premier ni composé : il n'appartient à aucune des deux familles.
export const COMPOSITES = Array.from({ length: NMAX - 1 }, (_, i) => i + 2)
  .filter((n) => !PRIMES.includes(n))

// Bandes de température 차뜨, en nombre de tirages depuis la dernière sortie.
export const TEMPERATURE_BANDS = [
  { name: 'hot', min: 0, max: 5 },
  { name: 'midle', min: 6, max: 10 },
  { name: 'cold', min: 11, max: 19 },
  { name: 'dead', min: 20, max: Infinity },
]

// 구간 : les tranches de dizaines.
export const SECTIONS = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]

// Tables de correspondance, calculées une fois. 앞자리수 = premier chiffre
// décimal (13 → 1, 7 → 7), 끝자리수 = dernier.
export const HEAD = buildDigits((n) => Number(String(n)[0]))
export const TAIL = buildDigits((n) => Number(String(n).at(-1)))

function buildDigits(pick) {
  const table = new Int8Array(NMAX + 1)
  for (let n = 1; n <= NMAX; n++) table[n] = pick(n)
  return table
}

export const IS_PRIME = membership(PRIMES)
export const IS_COMPOSITE = membership(COMPOSITES)

function membership(values) {
  const table = new Uint8Array(NMAX + 1)
  for (const v of values) table[v] = 1
  return table
}

/**
 * L'historique 6/45.
 *
 * `numbers` et `full` sont des tableaux plats de pas 6 et 7 : la ligne i
 * occupe les indices [i * pas, (i + 1) * pas). Les accesseurs `numbersAt`
 * et `fullAt` rendent une vue sans copie.
 *
 *   full     les 7 numéros triés — la base de tous les indicateurs
 *   sequence 일..육 puis 보너스 — l'ordre d'affichage, celui des « positions »
 */
export class Draws {
  constructor({ rangs, dates, numbers, bonus }) {
    this.rangs = rangs
    this.dates = dates
    this.numbers = numbers          // Int8Array, pas 6, trié
    this.bonus = bonus              // Int8Array
    this.n = rangs.length

    this.full = new Int8Array(this.n * FULL)
    this.sequence = new Int8Array(this.n * FULL)
    for (let i = 0; i < this.n; i++) {
      const six = numbers.subarray(i * PICK, i * PICK + PICK)
      // sequence : les six triés, puis le bonus — c'est ainsi que la
      // plateforme d'origine numérotait les positions (일 = 1 … 보너스 = 7).
      this.sequence.set(six, i * FULL)
      this.sequence[i * FULL + PICK] = bonus[i]
      // full : les sept triés ensemble.
      const seven = [...six, bonus[i]].sort((a, b) => a - b)
      this.full.set(seven, i * FULL)
    }
  }

  numbersAt(i) { return this.numbers.subarray(i * PICK, i * PICK + PICK) }
  fullAt(i) { return this.full.subarray(i * FULL, i * FULL + FULL) }
  sequenceAt(i) { return this.sequence.subarray(i * FULL, i * FULL + FULL) }

  indexOf(rang) {
    const i = binarySearch(this.rangs, rang)
    if (i < 0) throw new RangeError(`${rang}회차가 기록에 없습니다`)
    return i
  }

  /** (N, 46) — mask[i * 46 + k] = le numéro k est sorti au tirage i. */
  mask({ withBonus = false } = {}) {
    const out = new Uint8Array(this.n * (NMAX + 1))
    const source = withBonus ? this.full : this.numbers
    const stride = withBonus ? FULL : PICK
    for (let i = 0; i < this.n; i++) {
      const base = i * (NMAX + 1)
      for (let k = 0; k < stride; k++) out[base + source[i * stride + k]] = 1
    }
    return out
  }

  /** Sous-ensemble par 회차, bornes incluses. */
  window(start = null, end = null) {
    let lo = 0
    let hi = this.n
    if (start !== null) while (lo < hi && this.rangs[lo] < start) lo++
    if (end !== null) while (hi > lo && this.rangs[hi - 1] > end) hi--
    return this.slice(lo, hi)
  }

  /** Les k tirages les plus récents. */
  last(k) { return this.slice(Math.max(0, this.n - k), this.n) }

  slice(lo, hi) {
    return new Draws({
      rangs: this.rangs.slice(lo, hi),
      dates: this.dates.slice(lo, hi),
      numbers: this.numbers.slice(lo * PICK, hi * PICK),
      bonus: this.bonus.slice(lo, hi),
    })
  }
}

/** Construit un `Draws` à partir de lignes ordinaires. */
export function fromRows(rows) {
  const sorted = [...rows].sort((a, b) => a.rang - b.rang)
  const n = sorted.length
  const numbers = new Int8Array(n * PICK)
  const bonus = new Int8Array(n)
  const rangs = new Int32Array(n)
  const dates = new Array(n)
  sorted.forEach((row, i) => {
    rangs[i] = row.rang
    dates[i] = row.date
    bonus[i] = row.bonus
    const six = [...row.numbers].sort((a, b) => a - b)
    numbers.set(six, i * PICK)
  })
  return new Draws({ rangs, dates, numbers, bonus })
}

function binarySearch(array, value) {
  let lo = 0
  let hi = array.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (array[mid] === value) return mid
    if (array[mid] < value) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}
