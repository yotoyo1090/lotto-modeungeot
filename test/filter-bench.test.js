// 필터 조합 검정 — les pièces du banc (`src/core/filter-bench.js`).
// Le banc complet prend vingt minutes : ici on vérifie ce sur quoi il
// repose, et surtout que la valeur de chaque filtre, telle que le banc la
// calcule, est exactement celle que le moteur filtre.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fromRows } from '../src/core/draws.js'
import {
  describe, formOf, GROUPS, rowsOf, selection, toFilters,
} from '../src/core/filter-bench.js'
import { matches } from '../src/core/generator.js'
import { mulberry32 } from '../src/core/generator.js'

const byKey = (k) => GROUPS.find((g) => g.key === k)

test('필터 조합 검정 : la valeur de chaque filtre est celle que le moteur filtre', () => {
  const rnd = mulberry32(7)
  const pick = () => {
    const bag = Array.from({ length: 45 }, (_, i) => i + 1)
    for (let k = 0; k < 7; k++) {
      const j = k + Math.floor(rnd() * (45 - k))
      ;[bag[k], bag[j]] = [bag[j], bag[k]]
    }
    return bag.slice(0, 7)
  }
  for (let t = 0; t < 150; t++) {
    const six = pick().slice(0, 6).sort((a, b) => a - b)
    const prev = pick()
    for (const group of GROUPS) {
      if (group.real) continue
      const v = group.val(six, prev)
      // Une sélection qui ne garde que cette valeur-là, puis une qui l'exclut.
      const keep = group.range ? { range: [v, v] } : { allow: [v] }
      const other = group.range ? { range: [v + 1, v + 1] } : { allow: [v + (group.bands ? 10 : 1)] }
      assert.equal(matches(six, toFilters([{ group, sel: keep }], prev)), null, `${group.key} ${six} → ${v}`)
      assert.notEqual(matches(six, toFilters([{ group, sel: other }], prev)), null, `${group.key} ${six} ≠ ${v}`)
    }
  }
})

test('필터 조합 검정 : sélection, filtres, formulaire', () => {
  const rows = [3, 3, 3, 3, 2, 2, 4, 4, 1, 5].map((odd) => ({
    six: Array.from({ length: 6 }, (_, k) => (k < odd ? 2 * k + 1 : 2 * k + 2)), prev: null,
  }))
  // Les plus fréquents d'abord, jusqu'au niveau : 3 (40 %), 2 et 4 (80 %).
  assert.deepEqual(selection(byKey('odd'), 0.7, rows), { allow: [2, 3, 4] })
  assert.deepEqual(selection(byKey('odd'), 0.4, rows), { allow: [3] })
  assert.deepEqual(selection(byKey('sharing'), 0.8, rows), { cut: 1.0 })
  assert.equal(selection(byKey('sharing'), 0.9, rows), null)

  const items = [
    { group: byKey('total'), sel: { range: [100, 170] } },
    { group: byKey('mult3'), sel: { allow: [1, 2] } },
    { group: byKey('mult3Sum'), sel: { allow: [30, 40] } },
    { group: byKey('carriedSum'), sel: { allow: [0] } },
    { group: byKey('match'), sel: { allow: [0, 1] } },
  ]
  const prev = [1, 2, 3, 4, 5, 6, 7]
  const f = toFilters(items, prev)
  assert.deepEqual(f.total, [100, 170])
  assert.deepEqual(f.multiples, { 3: { allow: [1, 2] } })
  assert.equal(f.multSums[3].allow.length, 20)       // deux tranches de 10
  assert.deepEqual(f.carriedSum.allow, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(f.match, { allow: [0, 1] })
  assert.equal(f.reference, prev)

  // Le formulaire du 자동조합 : les mêmes champs que « 검색 조건 저장 ».
  assert.deepEqual(formOf(items), {
    sumStart: 100, sumEnd: 170, mult3: [1, 2], mult3Sum: [30, 40], carrySum: [0], carry: [0, 1],
  })
  assert.equal(describe(items[2]), '30–39, 40–49')
  assert.equal(describe(items[0]), '100–170')
})

test('필터 조합 검정 : le 회차 précédent ne se prend que s\'il suit', () => {
  const draws = fromRows([
    { rang: 1, date: '2002-12-07', numbers: [10, 23, 29, 33, 37, 40], bonus: 16 },
    { rang: 2, date: '2002-12-14', numbers: [9, 13, 21, 25, 32, 42], bonus: 2 },
    { rang: 4, date: '2002-12-28', numbers: [14, 27, 30, 31, 40, 42], bonus: 2 },
  ])
  const rows = rowsOf(draws)
  assert.equal(rows[0].prev, null)
  assert.deepEqual(rows[1].prev, [10, 23, 29, 33, 37, 40, 16])
  assert.equal(rows[2].prev, null, '3회 manque : pas de précédent')
})
