import assert from 'node:assert/strict'
import test from 'node:test'

import { NMAX, PICK } from '../src/core/draws.js'
import {
  choose, GUARANTEES, LEGAL_GRIDS, poolHits, SPACE, TICKET,
  verifyWheel, wheelFor, wheelSize, WHEEL_MAX, WHEEL_MIN,
} from '../src/core/wheel.js'

// Le test qui compte : chaque table embarquée est reverifiee en enumerant
// TOUS les tirages possibles a l'interieur de l'ensemble. Une roue qui
// affirme garantir 4 sans le faire serait pire qu'inutile.
test('chaque roue embarquée tient sa garantie, exhaustivement', () => {
  for (const guarantee of GUARANTEES) {
    for (let size = WHEEL_MIN; size <= WHEEL_MAX; size++) {
      const pool = Array.from({ length: size }, (_, i) => i + 1)
      const w = wheelFor(pool, guarantee)
      assert.ok(w.ok, `${size}-${guarantee} : table manquante`)
      const v = verifyWheel(pool, w.grids, guarantee)
      assert.equal(v.targets, choose(size, PICK), `${size}-${guarantee} : cibles`)
      assert.equal(v.uncovered, 0,
        `${size}-${guarantee} : ${v.uncovered} tirages non couverts`)
      assert.ok(v.worst >= guarantee, `${size}-${guarantee} : pire cas ${v.worst}`)
    }
  }
})

test('chaque grille de chaque roue est une grille valide', () => {
  for (const guarantee of GUARANTEES) {
    for (let size = WHEEL_MIN; size <= WHEEL_MAX; size++) {
      const pool = Array.from({ length: size }, (_, i) => i + 1)
      const { grids } = wheelFor(pool, guarantee)
      for (const g of grids) {
        assert.equal(g.length, PICK, 'six numéros')
        assert.equal(new Set(g).size, PICK, 'sans doublon')
        for (const v of g) assert.ok(pool.includes(v), 'pris dans l\'ensemble')
      }
    }
  }
})

// La roue traduit des positions en numéros : si l'ensemble n'était pas trié,
// deux appels avec les mêmes numéros dans un autre ordre rendraient des
// grilles différentes.
test('l\'ordre de l\'ensemble ne change pas la roue', () => {
  const pool = [45, 3, 17, 8, 22, 31, 5, 40, 12, 29]
  const a = wheelFor(pool, 4)
  const b = wheelFor([...pool].reverse(), 4)
  assert.deepEqual(a.grids, b.grids)
  assert.deepEqual(a.pool, [...pool].sort((x, y) => x - y))
})

test('les doublons et les numéros hors bornes sont écartés', () => {
  const w = wheelFor([1, 1, 2, 3, 4, 5, 6, 7, 0, 46, -3, 8], 3)
  assert.deepEqual(w.pool, [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(w.size, 8)
})

test('un ensemble hors table est refusé, pas approximé', () => {
  assert.equal(wheelFor([1, 2, 3, 4, 5, 6], 4).ok, false)
  assert.equal(wheelFor(Array.from({ length: 19 }, (_, i) => i + 1), 4).ok, false)
  assert.equal(wheelSize(6, 4), null)
  assert.equal(wheelSize(19, 3), null)
})

// Garantir davantage ne peut pas coûter moins cher.
test('la garantie 4 demande au moins autant de grilles que la 3', () => {
  for (let size = WHEEL_MIN; size <= WHEEL_MAX; size++) {
    assert.ok(wheelSize(size, 4) >= wheelSize(size, 3), `taille ${size}`)
  }
})

test('la roue coûte toujours moins que tout acheter', () => {
  for (let size = WHEEL_MIN + 1; size <= WHEEL_MAX; size++) {
    const w = wheelFor(Array.from({ length: size }, (_, i) => i + 1), 4)
    assert.ok(w.count <= w.fullCount, `taille ${size}`)
    assert.equal(w.cost, w.count * TICKET)
    assert.equal(w.fullCost, w.fullCount * TICKET)
  }
})

// Le drapeau qui rappelle la règle du jeu : 100 000 won par personne.
test('la limite légale est signalée', () => {
  const small = wheelFor(Array.from({ length: 14 }, (_, i) => i + 1), 4)
  assert.equal(small.overLimit, false)
  assert.ok(small.count <= LEGAL_GRIDS)
  const big = wheelFor(Array.from({ length: 18 }, (_, i) => i + 1), 4)
  assert.equal(big.overLimit, big.count > LEGAL_GRIDS)
})

// L'honnêteté du module : la roue ne touche pas à la probabilité d'avoir
// les six dans l'ensemble, qui reste C(T,6)/C(45,6).
test('la fréquence annoncée est celle du hasard, pas mieux', () => {
  const w = wheelFor(Array.from({ length: 14 }, (_, i) => i + 1), 4)
  assert.ok(Math.abs(w.inPool - choose(14, PICK) / SPACE) < 1e-12)
  assert.equal(w.oncePer, 2712)
})

test('la loi des attrapés somme à un et vaut 6T/45 en moyenne', () => {
  for (const size of [10, 14, 20, 30]) {
    const law = poolHits(size)
    const total = law.reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(total - 1) < 1e-9, `taille ${size} : somme ${total}`)
    const mean = law.reduce((s, p, k) => s + p * k, 0)
    assert.ok(Math.abs(mean - (PICK * size) / NMAX) < 1e-9, `taille ${size}`)
  }
})
