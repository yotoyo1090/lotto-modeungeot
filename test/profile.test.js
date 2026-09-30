// Le 예고 d'un lot — ce qu'il annonce avant le tirage.
//
// Les valeurs de référence viennent du rapport 배치 (8 145 060 tirages,
// exact) : 90 grilles au hasard → 11,8 % de semaines vides ; 90 grilles
// avec un numéro fixé → environ 20 %. La simulation à 100 000 tirages doit
// retomber à moins d'un point de ces chiffres.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lotProfile, P3, P4 } from '../src/core/profile.js'
import { P5 } from '../src/core/sharing.js'

// mulberry32, la même graine à chaque exécution
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function randomGrids(count, r, pool = Array.from({ length: 45 }, (_, i) => i + 1), take = 6, forced = []) {
  return Array.from({ length: count }, () => {
    const a = pool.slice()
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
    return [...forced, ...a.slice(0, take)].sort((x, y) => x - y)
  })
}

test('les constantes sont les lois du 6/45', () => {
  assert.ok(Math.abs(P5 - 0.02244) < 1e-4)
  assert.ok(Math.abs(P4 - 0.0013646) < 1e-6)
  assert.ok(Math.abs(P3 - 0.00002799) < 1e-8)
})

test('un lot vide ne rend rien, une grille abîmée est ignorée', () => {
  assert.equal(lotProfile([]), null)
  assert.equal(lotProfile([[1, 2, 3]]), null)
  const p = lotProfile([[1, 2, 3, 4, 5, 6], [0, 2, 3, 4, 5, 6]])
  assert.equal(p.n, 1)
  // une grille seule n'a pas de 고정수 — ses six numéros sont juste elle
  assert.deepEqual(p.fixed.numbers, [])
})

test('la moyenne des 5등 est n × P5, quelle que soit la disposition', () => {
  const r = rng(1)
  const a = lotProfile(randomGrids(90, r), { draws: 1000 })
  const sans13 = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => n !== 13)
  const b = lotProfile(randomGrids(90, r, sans13, 5, [13]), { draws: 1000 })
  assert.equal(a.exp5, 90 * P5)
  assert.equal(b.exp5, 90 * P5)
  assert.equal(a.cost, 90_000)
})

test('90 grilles au hasard : la semaine vide tombe près de 11,8 %', () => {
  const p = lotProfile(randomGrids(90, rng(7)), { draws: 60_000 })
  assert.ok(p.zero > 0.095 && p.zero < 0.145, `zero = ${p.zero}`)
  assert.ok(p.breakEven > 0 && p.breakEven < 0.02, `breakEven = ${p.breakEven}`)
  assert.deepEqual(p.fixed.numbers, [])
  assert.equal(p.fixed.p, null)
})

test('un 고정수 se voit, et la semaine vide grimpe bien au-dessus de 11,8 %', () => {
  // cinq cases au hasard sur 44, sans étalement : 20 % étalé, ~26 % ici
  const pool = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => n !== 13)
  const p = lotProfile(randomGrids(90, rng(3), pool, 5, [13]), { draws: 60_000 })
  assert.deepEqual(p.fixed.numbers, [13])
  assert.ok(Math.abs(p.fixed.p - 6 / 45) < 1e-12)
  assert.ok(p.zero > 0.16 && p.zero < 0.32, `zero = ${p.zero}`)
  // le 본전 sans 3등 devient possible : nettement au-dessus du lot étalé
  assert.ok(p.breakEven > 0.02, `breakEven = ${p.breakEven}`)
})

test('le 예고 est le même à chaque calcul', () => {
  const grids = randomGrids(30, rng(11))
  const a = lotProfile(grids, { draws: 5000 })
  const b = lotProfile(grids, { draws: 5000 })
  assert.deepEqual(a, b)
})

test('분배 : la moyenne et les bandes portent sur toutes les grilles', () => {
  const p = lotProfile([[1, 2, 3, 4, 5, 6], [10, 17, 24, 31, 38, 45]], { draws: 100 })
  assert.equal(Object.values(p.sharing.bands).reduce((a, b) => a + b, 0), 2)
  assert.ok(p.sharing.mean > 0)
})
