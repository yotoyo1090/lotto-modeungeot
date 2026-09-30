// La ligne de 42 colonnes, partagée par les trois écrans 조합.
//
// C'est le tableau de résultat du 일반조합, celui du 자동조합 et la grille
// de saisie du 수동조합 : trois écrans, un seul en-tête, écrit une fois.
//
//   회차 · 일 이 삼 사 오 육
//   당첨번호 총합
//   전회차이월번호 · 전회차이월번합 · 전회차이월번위치
//   AC값
//   저고 · 저번호 · 고번호
//   홀짝 · 짝번호 · 홀번호
//   앞자리수 · 앞쌍 · 앞자리수합
//   끝자리수 · 끝쌍 · 끝자리수합
//   소수 · 합성수 · 이의배수 · 삼의배수 · 사의배수 · 오의배수  (개수, 번호, 합)
//
// Une note sur le 저고. L'ancien code comptait 저 avec `num < 23` pour
// fabriquer le ratio, mais rangeait les numéros avec `low <= 23` pour la
// liste — si bien que le 23 était compté en 고 et affiché en 저. On tranche
// dans le sens du ratio, qui est celui de la colonne 저고 de l'ancienne
// base : **저 = 1..22**.

import { HEAD, IS_COMPOSITE, IS_PRIME, LOW_MAX, NMAX, PICK, TAIL } from './draws.js'
import { acValue, MULTIPLES } from './metrics.js'

/** Les 42 en-têtes, dans l'ordre exact de l'ancien tableau. */
export const COLUMNS = [
  '회차', '일', '이', '삼', '사', '오', '육',
  '당첨번호 총합',
  '전회차이월번호', '전회차이월번합', '전회차이월번위치',
  'AC값',
  '저고', '저번호', '고번호',
  '홀짝', '짝번호', '홀번호',
  '앞자리수', '앞쌍', '앞자리수합',
  '끝자리수', '끝쌍', '끝자리수합',
  '소수', '소수번호', '소수합',
  '합성수', '합성수번호', '합성수합',
  '이의배수', '이의배수번호', '이의배수합',
  '삼의배수', '삼의배수번호', '삼의배수합',
  '사의배수', '사의배수번호', '사의배수합',
  '오의배수', '오의배수번호', '오의배수합',
]

/** 앞쌍 / 끝쌍 : les chiffres qui reviennent, en « chiffre:occurrences ». */
function pairs(digits) {
  const seen = new Map()
  for (const d of digits) seen.set(d, (seen.get(d) ?? 0) + 1)
  return [...seen.entries()].map(([d, n]) => `${d}:${n}`)
}

/** Le triplet (개수, 번호, 합) d'une famille de numéros. */
function family(grid, member) {
  const numbers = grid.filter(member)
  return { count: numbers.length, numbers, sum: numbers.reduce((a, v) => a + v, 0) }
}

/**
 * Décrit une grille de six numéros.
 *
 * `previous` est le tirage de référence pour le 이월 : les **sept** numéros
 * du 회차 précédent, bonus compris. `전회차이월번위치` donne les positions
 * (1 à 7) qu'ils y occupaient — c'est ce que faisait `oldwinner()`.
 */
export function describeRow(grid, { rang = null, previous = null } = {}) {
  const row = [...grid].sort((a, b) => a - b)
  if (row.length !== PICK) throw new RangeError(`번호 ${PICK}개가 필요합니다`)
  for (let k = 1; k < PICK; k++) {
    if (row[k] === row[k - 1]) throw new RangeError('번호가 중복되었습니다')
  }
  for (const v of row) {
    if (!Number.isInteger(v) || v < 1 || v > NMAX) {
      throw new RangeError(`번호 ${v}: 1..${NMAX} 범위 밖입니다`)
    }
  }

  const low = row.filter((v) => v <= LOW_MAX)
  const high = row.filter((v) => v > LOW_MAX)
  const odd = row.filter((v) => v % 2 === 1)
  const even = row.filter((v) => v % 2 === 0)

  const heads = row.map((v) => HEAD[v])
  const tails = row.map((v) => TAIL[v])

  // 이월 : les numéros repris du tirage précédent, rangés **dans l'ordre où
  // ils y figuraient** — pas par valeur croissante. C'est ce que porte la
  // colonne 전회차이월번호 de l'ancienne base, et c'est ce qui rend la
  // colonne 전회차이월번위치 lisible en face : les deux listes se
  // correspondent terme à terme.
  const carried = previous ? previous.filter((v) => row.includes(v)) : []
  const positions = carried.map((v) => previous.indexOf(v) + 1)

  return {
    rang,
    numbers: row,
    total: row.reduce((a, v) => a + v, 0),

    carried,
    carriedSum: carried.reduce((a, v) => a + v, 0),
    carriedPositions: positions,

    ac: acValue(row),

    lowLabel: `${low.length} : ${high.length}`,
    low,
    high,

    oddLabel: `${odd.length} : ${even.length}`,
    even,
    odd,

    heads,
    headPairs: pairs(heads),
    headSum: heads.reduce((a, v) => a + v, 0),

    tails,
    tailPairs: pairs(tails),
    tailSum: tails.reduce((a, v) => a + v, 0),

    primes: family(row, (v) => IS_PRIME[v] === 1),
    composites: family(row, (v) => IS_COMPOSITE[v] === 1),
    multiples: Object.fromEntries(
      MULTIPLES.map((m) => [m, family(row, (v) => v % m === 0)])),
  }
}

const list = (values) => values.join(', ')

/** La ligne en 42 cellules de texte, dans l'ordre de `COLUMNS`. */
export function toCells(r) {
  const fam = (f) => [String(f.count), list(f.numbers), String(f.sum)]
  return [
    r.rang === null ? '' : String(r.rang),
    ...r.numbers.map(String),
    String(r.total),
    list(r.carried), String(r.carriedSum), list(r.carriedPositions),
    String(r.ac),
    r.lowLabel, list(r.low), list(r.high),
    r.oddLabel, list(r.even), list(r.odd),
    list(r.heads), list(r.headPairs), String(r.headSum),
    list(r.tails), list(r.tailPairs), String(r.tailSum),
    ...fam(r.primes),
    ...fam(r.composites),
    ...MULTIPLES.flatMap((m) => fam(r.multiples[m])),
  ]
}
