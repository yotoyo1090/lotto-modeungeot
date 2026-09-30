// Les critères du 자동조합, en ensembles de valeurs.
//
// L'ancien formulaire ne demandait pas des fourchettes : il demandait des
// **cases à cocher**. « AC값 6 ou 10 » n'est pas un intervalle, et aucun
// couple [min, max] ne l'écrit. C'est le seul vrai écart entre mon
// générateur et le sien, et c'est ce fichier qui le comble.
//
// Un critère prend donc trois formes :
//
//   null                  aucune contrainte
//   [min, max]            un intervalle — ce que le générateur acceptait déjà
//   { allow: [...] }      un ensemble de valeurs autorisées
//
// Les trois se compilent vers le même objet `{ min, max, mask }` : le
// parcours élague sur `min`/`max` comme avant — il ne perd rien — et la
// feuille consulte un octet au lieu de comparer deux fois. Un intervalle
// n'est qu'un ensemble dont toutes les cases sont à 1.

import { COMPOSITES, NMAX, PICK, PRIMES } from './draws.js'

/**
 * Compile une contrainte vers `{ min, max, mask }`.
 *
 * `mask[v - min]` vaut 1 si la valeur v est autorisée. On indexe par
 * décalage plutôt qu'en bits : les valeurs vont de −5 (un AC de six
 * numéros ne descend pas plus bas) à 267 (le 총합 maximum), et un
 * décalage traite les négatives sans cas particulier.
 */
export function criterion(name, value) {
  if (value === null || value === undefined) return null

  if (Array.isArray(value)) return fromBounds(name, value)
  if (value && Array.isArray(value.allow)) return fromAllow(name, value.allow)

  throw new TypeError(`${name} : [min, max] 또는 { allow: [...] } 형식이어야 합니다`)
}

function fromBounds(name, value) {
  if (value.length !== 2) {
    throw new TypeError(`${name} : [min, max] 범위가 필요합니다`)
  }
  const [min, max] = value
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new TypeError(`${name} : 정수 범위가 필요합니다 (받은 값 ${min}, ${max})`)
  }
  if (min > max) throw new RangeError(`${name} : 최소 ${min}이(가) 최대 ${max}보다 큽니다`)
  return { min, max, mask: new Uint8Array(max - min + 1).fill(1), whole: true }
}

function fromAllow(name, allow) {
  const values = [...new Set(allow)]
  if (values.length === 0) {
    throw new RangeError(`${name} : 허용된 값이 없습니다 — 어떤 조합도 통과할 수 없습니다`)
  }
  for (const v of values) {
    if (!Number.isInteger(v)) {
      throw new TypeError(`${name} : 정수 값이 필요합니다 (받은 값 ${v})`)
    }
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mask = new Uint8Array(max - min + 1)
  for (const v of values) mask[v - min] = 1
  // `whole` dit si l'ensemble remplit son intervalle. Ça ne change aucun
  // résultat — c'est ce qui permet de raconter, dans le compte rendu, si
  // un critère est une fourchette ou un choix.
  return { min, max, mask, whole: mask.every((b) => b === 1) }
}

/** La valeur v passe-t-elle le critère ? `null` laisse tout passer. */
export function allows(c, v) {
  if (c === null) return true
  return v >= c.min && v <= c.max && c.mask[v - c.min] === 1
}

/** Les valeurs autorisées, en clair — pour l'affichage et les tests. */
export function values(c) {
  if (c === null) return null
  const out = []
  for (let v = c.min; v <= c.max; v++) if (c.mask[v - c.min]) out.push(v)
  return out
}

// ------------------------------------------------------------ 리스트추천

const series = (step) => {
  const out = []
  for (let n = step; n <= NMAX; n += step) out.push(n)
  return out
}

/**
 * Les sept viviers du menu 리스트추천, dans l'ordre de l'ancien formulaire.
 *
 * Les listes de nombres sont recalculées, pas recopiées : l'ancien
 * formulaire les portait en dur dans le libellé de chaque option — étiquette
 * et valeur, séparées par « - » — et le libellé du 합성수 y est même
 * orthographié 함성수. Ici l'étiquette est une étiquette et les numéros
 * viennent du calcul ; un test vérifie qu'ils redonnent bien les mêmes.
 */
export const PRESETS = [
  { key: 'all', label: '모든수', numbers: series(1) },
  { key: 'mult2', label: '이의배수', numbers: series(2) },
  { key: 'mult3', label: '삼의배수', numbers: series(3) },
  { key: 'mult4', label: '사의배수', numbers: series(4) },
  { key: 'mult5', label: '오의배수', numbers: series(5) },
  { key: 'composites', label: '합성수', numbers: [...COMPOSITES] },
  { key: 'primes', label: '소수', numbers: [...PRIMES] },
]

export const preset = (key) => PRESETS.find((p) => p.key === key) ?? null

// ------------------------------------------------------------- 제외구간

/** Les cinq dizaines qu'on peut retirer du vivier d'un coup. */
export const EXCLUDABLE_SECTIONS = [
  { key: 1, label: '1–9', numbers: range(1, 9) },
  { key: 10, label: '10–19', numbers: range(10, 19) },
  { key: 20, label: '20–29', numbers: range(20, 29) },
  { key: 30, label: '30–39', numbers: range(30, 39) },
  { key: 40, label: '40–45', numbers: range(40, 45) },
]

function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

/**
 * Le vivier, construit comme l'ancien : liste choisie, puis 추가번호, puis
 * 제외번호, puis 제외구간. L'ordre compte — ajouter après avoir retiré ne
 * donne pas la même chose.
 */
export function buildPool({ preset: key = 'all', add = [], remove = [], sections = [] } = {}) {
  const base = preset(key)
  if (!base) throw new RangeError(`알 수 없는 리스트추천 : ${key}`)

  const keep = new Uint8Array(NMAX + 1)
  for (const n of base.numbers) keep[n] = 1
  for (const n of add) keep[check(n)] = 1
  for (const n of remove) keep[check(n)] = 0
  for (const s of sections) {
    const band = EXCLUDABLE_SECTIONS.find((b) => b.key === Number(s))
    if (!band) throw new RangeError(`알 수 없는 제외구간 : ${s}`)
    for (const n of band.numbers) keep[n] = 0
  }

  const out = []
  for (let n = 1; n <= NMAX; n++) if (keep[n]) out.push(n)
  return out
}

function check(n) {
  if (!Number.isInteger(n) || n < 1 || n > NMAX) {
    throw new RangeError(`번호 ${n}: 1..${NMAX} 범위 밖입니다`)
  }
  return n
}

// ---------------------------------------------------- 저고 · 홀짝, en texte

/**
 * L'ancien formulaire n'offrait pas « 저 = 4 » mais l'étiquette « 4 : 2 »,
 * prise telle quelle dans la colonne 저고 de la base. On traduit dans les
 * deux sens, pour que la case cochée reste celle que tes utilisateurs
 * connaissent et que le calcul, lui, travaille sur un entier.
 */
export const pairLabel = (count, of = PICK) => `${count} : ${of - count}`

export function pairCount(label) {
  const match = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(String(label))
  if (!match) throw new RangeError(`「${label}」은(는) 「n : m」 형식이 아닙니다`)
  const a = Number(match[1])
  const b = Number(match[2])
  if (a + b !== PICK) throw new RangeError(`「${label}」의 합이 ${PICK}이(가) 아닙니다`)
  return a
}

// --------------------------------------------------------- les deux câblages

/**
 * Les cinq filtres 배수 / 합성수, et le critère que chacun pilote.
 *
 * Dans l'ancien site ils sont **décalés d'un cran** : cocher « 합성수 2개 »
 * comptait en réalité les multiples de 2, et « 오의배수 » comptait les
 * composés. Une rotation propre — les listes ont glissé d'une position à
 * l'appel (`combinaison/views.py` L796–800), et le même décalage est répété
 * dans la ligne de résultat affichée (L815–819). Seul le 소수 était
 * correctement apparié.
 *
 * On garde les deux câblages : `fixed` fait ce que dit l'étiquette, `legacy`
 * refait l'erreur à l'identique. L'oracle Python produit les deux, ce qui
 * prouve lequel on reproduit au lieu de le supposer.
 */
export const WIRINGS = {
  fixed: {
    composites: 'composites',
    mult2: 'mult2',
    mult3: 'mult3',
    mult4: 'mult4',
    mult5: 'mult5',
  },
  legacy: {
    composites: 'mult2',
    mult2: 'mult3',
    mult3: 'mult4',
    mult4: 'mult5',
    mult5: 'composites',
  },
}

/** Les six cases de comptage de numéros, dans l'ordre du formulaire. */
export const COUNT_FIELDS = [
  { key: 'primes', label: '소수숫자수' },
  { key: 'composites', label: '합성수숫자수' },
  { key: 'mult2', label: '이의배수숫자수' },
  { key: 'mult3', label: '삼의배수숫자수' },
  { key: 'mult4', label: '사의배수숫자수' },
  { key: 'mult5', label: '오의배수숫자수' },
]

/**
 * Applique un câblage à ce que l'utilisateur a coché.
 *
 * Entrée : `{ composites: [2,3], mult2: [4] }` — ce que disent les cases.
 * Sortie : la même chose, rangée sous les critères réellement filtrés.
 */
export function wire(checked, wiring = 'fixed') {
  const map = WIRINGS[wiring]
  if (!map) throw new RangeError(`알 수 없는 연결 방식 : ${wiring}`)

  const out = {}
  // 소수 n'a jamais été décalé — il ne passe pas par la table.
  if (checked.primes) out.primes = checked.primes
  for (const [field, target] of Object.entries(map)) {
    if (checked[field]) out[target] = checked[field]
  }
  return out
}
