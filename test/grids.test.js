// Le carnet 내 조합 : ce qu'on a décidé de jouer, et ce que ça a donné.
//
// Le point à ne pas lâcher : les règles du 6/45 — quel rang pour combien de
// numéros — ne sont écrites qu'à un seul endroit, `core/combos.js`. La vue
// SQL compte, elle ne juge pas. Ces tests vérifient les deux : le compte,
// et le fait que le jugement vienne bien du noyau.

import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'

import {
  open, putDraws, putGrids, getGrids, gridSummary, validateGrid, ValidationError,
} from '../src/node/db.js'
import { scoreGrid } from '../src/core/combos.js'

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'lotto-grids-'))
  const db = open(join(dir, 'test.sqlite'))
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }) } }
}

// Le 1 239회 réel, celui qui a servi de contre-épreuve.
const DRAW = { rang: 1239, numbers: [11, 13, 22, 32, 33, 36], bonus: 8 }
const grid = (numbers, lot = 'test') => ({ lot, target: 1239, numbers })

test('une grille refusée ne fait pas tomber les autres', () => {
  const { db, cleanup } = scratch()
  const report = putGrids(db, [
    grid([1, 2, 3, 4, 5, 6]),
    grid([1, 2, 3, 4, 5]),          // cinq numéros
    grid([1, 1, 2, 3, 4, 5]),       // doublon
    grid([0, 2, 3, 4, 5, 6]),       // hors 1..45
    grid([7, 8, 9, 10, 11, 12]),
  ])
  assert.equal(report.added.length, 2)
  assert.equal(report.rejected.length, 3)
  assert.equal(getGrids(db).length, 2)
  cleanup()
})

test('les numéros sont rangés, et un second import n’ajoute rien', () => {
  const { db, cleanup } = scratch()
  putGrids(db, [grid([44, 2, 33, 11, 22, 6])])
  const [g] = getGrids(db)
  assert.deepEqual(g.numbers, [2, 6, 11, 22, 33, 44])

  // Rejouable : même lot, même 회차, mêmes numéros dans un autre ordre.
  const again = putGrids(db, [grid([2, 6, 11, 22, 33, 44])])
  assert.equal(again.added.length, 0)
  assert.equal(again.unchanged.length, 1)
  assert.equal(getGrids(db).length, 1)
  cleanup()
})

test('sans le tirage, les grilles sont en attente — pas perdantes', () => {
  const { db, cleanup } = scratch()
  putGrids(db, [grid([11, 13, 22, 32, 33, 36])])
  const [g] = getGrids(db)
  assert.equal(g.drawn, false)
  assert.equal(g.rank, null)
  assert.equal(g.matched, null)
  assert.equal(gridSummary(db).pending, 1)
  cleanup()
})

test('les cinq rangs, sur le vrai 1 239회', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [DRAW])

  // 11 13 22 32 33 36, bonus 8.
  const cases = [
    [[11, 13, 22, 32, 33, 36], 6, false, 1],   // les six
    [[11, 13, 22, 32, 33, 8], 5, true, 2],     // cinq + bonus
    [[11, 13, 22, 32, 33, 45], 5, false, 3],   // cinq sans bonus
    [[11, 13, 32, 33, 44, 45], 4, false, 4],
    [[11, 13, 32, 43, 44, 45], 3, false, 5],
    [[1, 2, 3, 43, 44, 45], 0, false, null],
    [[8, 1, 2, 3, 44, 45], 0, true, null],     // le bonus seul ne vaut rien
  ]
  putGrids(db, cases.map(([numbers], i) => grid(numbers, `r${i}`)))

  for (const [numbers, matched, bonus, rank] of cases) {
    const [g] = getGrids(db, { lot: `r${cases.findIndex((c) => c[0] === numbers)}` })
    assert.equal(g.drawn, true, numbers.join(','))
    assert.equal(g.matched, matched, `일치 ${numbers.join(',')}`)
    assert.equal(g.bonus, bonus, `보너스 ${numbers.join(',')}`)
    assert.equal(g.rank, rank, `등수 ${numbers.join(',')}`)
  }
  cleanup()
})

test('la vue SQL et le noyau tombent d’accord, grille par grille', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [DRAW])
  const sequence = [...DRAW.numbers, DRAW.bonus]

  // Cent grilles quelconques : la base et `scoreGrid` doivent dire pareil.
  const rows = []
  for (let k = 0; k < 100; k++) {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1)
    const pick = []
    let seed = k * 2654435761 % 2147483647
    while (pick.length < 6) {
      seed = (seed * 48271) % 2147483647
      pick.push(...pool.splice(seed % pool.length, 1))
    }
    rows.push(grid(pick.sort((a, b) => a - b), `g${k}`))
  }
  putGrids(db, rows)

  for (const g of getGrids(db)) {
    const core = scoreGrid(g.numbers, sequence)
    assert.equal(g.matched, core.matched, g.numbers.join(','))
    assert.equal(g.bonus, core.bonus, g.numbers.join(','))
    assert.equal(g.rank, core.rank, g.numbers.join(','))
  }
  cleanup()
})

test('le bilan compte les rangs et les gains fixes', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [DRAW])
  putGrids(db, [
    grid([11, 13, 32, 33, 44, 45]),   // 4등 · 50 000
    grid([11, 13, 32, 43, 44, 45]),   // 5등 ·  5 000
    grid([1, 2, 3, 43, 44, 45]),      // rien
  ])
  const s = gridSummary(db)
  assert.equal(s.grids, 3)
  assert.equal(s.drawn, 3)
  assert.equal(s.pending, 0)
  assert.deepEqual(s.byRank, { 4: 1, 5: 1 })
  assert.equal(s.fixedPrize, 55000)
  cleanup()
})

test('validateGrid refuse ce qui n’a pas de sens', () => {
  assert.throws(() => validateGrid({ target: 1, numbers: [1, 2, 3, 4, 5, 6] }),
    ValidationError)                                   // lot manquant
  assert.throws(() => validateGrid({ lot: 'x', target: 0, numbers: [1, 2, 3, 4, 5, 6] }),
    ValidationError)                                   // 회차 nul
  assert.throws(() => validateGrid({ lot: 'x', target: 1, numbers: [1, 2, 3, 4, 5, 46] }),
    ValidationError)                                   // hors bornes
  assert.throws(() => validateGrid({ lot: 'x', target: 1, numbers: [1, 2, 3, 4, 5, 6], sharing: 0 }),
    ValidationError)                                   // indice nul
  const ok = validateGrid({ lot: ' x ', target: 9, numbers: [6, 5, 4, 3, 2, 1] })
  assert.equal(ok.lot, 'x')
  assert.deepEqual(ok.numbers, [1, 2, 3, 4, 5, 6])
})
