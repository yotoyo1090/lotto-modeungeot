// 모양 닮은꼴 — la ressemblance des figures du bulletin.

import test from 'node:test'
import assert from 'node:assert/strict'

import { fromRows, PICK } from '../src/core/draws.js'
import {
  COLS, ROWS, cellOf, cells, grid, match, shapeGroups, signature, similarTo,
  similarity, similarityLaw,
} from '../src/core/shape.js'

test('la case d\'un numéro suit la disposition du bulletin', () => {
  assert.deepEqual(cellOf(1), [0, 0])
  assert.deepEqual(cellOf(7), [0, COLS - 1])
  assert.deepEqual(cellOf(8), [1, 0])
  assert.deepEqual(cellOf(45), [ROWS - 1, (45 - 1) % COLS])
})

test('une figure décalée garde sa signature et marque six', () => {
  // 1 2 3 8 9 10 — un bloc 2 × 3 dans le coin. Décalé d'une case à droite :
  // 2 3 4 9 10 11. Même dessin, donc même signature et six coïncidences.
  const a = [1, 2, 3, 8, 9, 10]
  const b = [2, 3, 4, 9, 10, 11]
  assert.equal(signature(a), signature(b))
  assert.equal(similarity(cells(a), grid(b)), PICK)
  // Décalé d'une ligne : pareil.
  const c = [8, 9, 10, 15, 16, 17]
  assert.equal(signature(a), signature(c))
  assert.equal(similarity(cells(a), grid(c)), PICK)
})

test('match rend le décalage qui superpose les deux feuilles', () => {
  const a = [1, 2, 3, 8, 9, 10]
  // Elle-même : six, sans bouger.
  assert.deepEqual(match(cells(a), grid(a)), { score: PICK, dr: 0, dc: 0 })
  // Une case à droite : six, en glissant d'une colonne.
  const right = match(cells(a), grid([2, 3, 4, 9, 10, 11]))
  assert.equal(right.score, PICK)
  assert.deepEqual([right.dr, right.dc], [0, 1])
  // Une ligne plus bas : six, en glissant d'une ligne.
  const down = match(cells(a), grid([8, 9, 10, 15, 16, 17]))
  assert.equal(down.score, PICK)
  assert.deepEqual([down.dr, down.dc], [1, 0])
})

test('une figure identique à elle-même marque six, une autre marque moins', () => {
  const a = [1, 2, 3, 8, 9, 10]
  assert.equal(similarity(cells(a), grid(a)), PICK)
  // Six numéros en diagonale ne se superposent pas à un bloc.
  const d = [1, 9, 17, 25, 33, 41]
  assert.ok(similarity(cells(a), grid(d)) < PICK)
})

const ROWS_FIXTURE = [
  { rang: 1, date: '2002-12-07', numbers: [1, 2, 3, 8, 9, 10], bonus: 16 },
  { rang: 2, date: '2002-12-14', numbers: [2, 3, 4, 9, 10, 11], bonus: 20 },
  { rang: 3, date: '2002-12-21', numbers: [1, 9, 17, 25, 33, 41], bonus: 5 },
]
const toy = () => fromRows(ROWS_FIXTURE)

test('similarTo classe les 회차 et compte tout le monde une fois', () => {
  const d = toy()
  const r = similarTo(d, 1)
  assert.equal(r.compared, d.n - 1, 'tous sauf lui-même')
  assert.equal(r.spread.reduce((a, b) => a + b, 0), r.compared)
  // Le 2회 est le même dessin décalé : il arrive en tête avec six.
  assert.equal(r.rows[0].rang, 2)
  assert.equal(r.rows[0].score, PICK)
  // `before` ne regarde que le passé — le 1회 n'en a pas.
  assert.equal(similarTo(d, 1, { before: true }).compared, 0)
  assert.equal(similarTo(d, 3, { before: true }).compared, 2)
  assert.throws(() => similarTo(d, 999), RangeError)
})

test('shapeGroups réunit les figures identiques', () => {
  const d = toy()
  const g = shapeGroups(d)
  assert.equal(g.draws, 3)
  assert.equal(g.distinct, 2, 'deux figures : le bloc et la diagonale')
  assert.equal(g.groups.length, 1)
  assert.deepEqual(g.groups[0].rangs, [1, 2])
  assert.equal(g.repeated, 2)
})

test('la loi du hasard somme à un et garde les scores possibles', () => {
  const law = similarityLaw({ samples: 2000 })
  assert.equal(law.length, PICK + 1)
  assert.ok(Math.abs(law.reduce((a, b) => a + b, 0) - 1) < 1e-9)
  assert.ok(law.every((p) => p >= 0 && p <= 1))
  // Deux tirages au sort se ressemblent un peu : le mode n'est ni 0 ni 6.
  const mode = law.indexOf(Math.max(...law))
  assert.ok(mode > 0 && mode < PICK, `mode inattendu : ${mode}`)
  assert.equal(similarityLaw({ samples: 2000 }), law, 'mémorisé')
})
