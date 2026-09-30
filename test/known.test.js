// 고정수 — la combinatoire de k numéros garantis gagnants.
//
// Le contrôle qui compte : à k = 0 le fichier doit redonner exactement les
// cotes du 6/45 telles que `core/rules.js` les écrit. S'il s'en écarte d'une
// unité, tout le reste est faux.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  KNOWN_MAX, knownSpace, knownCounts, knownOdds, knownExpectation, knownChance,
} from '../src/core/known.js'
import { RULES } from '../src/core/rules.js'
import { choose } from '../src/core/generator.js'

const TOTAL = 8145060

test('à k = 0, les comptes sont ceux du 6/45', () => {
  assert.equal(knownSpace(0), TOTAL)
  assert.deepEqual(knownCounts(0), { 1: 1, 2: 6, 3: 228, 4: 11115, 5: 182780 })
})

test('à k = 0, les cotes redonnent celles de rules.js', () => {
  const odds = knownOdds(0)
  for (const r of RULES.lotto.ranks) {
    if (!odds[r.rank]) continue
    assert.equal(Math.round(1 / odds[r.rank]), r.odds,
      `${r.label} : 1/${Math.round(1 / odds[r.rank])} au lieu de 1/${r.odds}`)
  }
})

test('les comptes couvrent tout l’espace, à chaque k', () => {
  for (let k = 0; k <= KNOWN_MAX; k++) {
    const counts = knownCounts(k)
    const rest = 6 - k
    const pool = 45 - k
    const win = 6 - k
    // Somme de toutes les complétions, rang par rang, plus celles qui ne
    // gagnent rien : on doit retomber sur C(45−k, 6−k).
    let winning = 0
    for (const v of Object.values(counts)) winning += v
    let losing = 0
    for (let hits = 0; hits <= Math.min(rest, 2 - k); hits++) {
      losing += choose(win, hits) * choose(pool - win, rest - hits)
    }
    assert.equal(winning + losing, knownSpace(k), `k = ${k}`)
  }
})

test('l’espace se réduit comme annoncé', () => {
  assert.equal(knownSpace(1), 1086008)
  assert.equal(knownSpace(2), 123410)
  assert.equal(knownSpace(3), 11480)
  assert.equal(knownSpace(4), 820)
})

test('à k = 4, il n’y a plus de 5등 possible', () => {
  // Quatre numéros justes d’office : le minimum atteignable est déjà le 4등.
  assert.equal(knownCounts(4)[5], 0)
  assert.ok(knownCounts(4)[4] > 0)
})

test('le 3등 exclut le 보너스, le 2등 l’exige', () => {
  for (let k = 0; k <= 3; k++) {
    const c = knownCounts(k)
    // Les deux rangs à cinq numéros réunis valent « cinq bons, n’importe
    // quel sixième » — la partition doit être exacte.
    const win = 6 - k
    const pool = 45 - k
    const five = choose(win, 5 - k) * choose(pool - win, (6 - k) - (5 - k))
    assert.equal(c[2] + c[3], five, `k = ${k}`)
  }
})

test('l’espérance sépare le jackpot du reste', () => {
  const prizes = { 1: 2269204926, 2: 55970956, 3: 1444985, 4: 50000, 5: 5000 }

  const k0 = knownExpectation(0, prizes)
  // Sans information, l’espérance tourne autour de la moitié de la mise.
  assert.ok(k0.ratio > 0.5 && k0.ratio < 0.6, `k=0 : ${k0.ratio}`)

  const k1 = knownExpectation(1, prizes)
  const k2 = knownExpectation(2, prizes)
  assert.ok(k1.total > k0.total && k2.total > k1.total)

  // Le point du fichier : à k = 1 c’est le 1등 qui porte l’espérance, et
  // hors 1등 on est à peine au-dessus de la mise.
  assert.ok(k1.first / k1.total > 0.6, 'le 1등 pèse plus de 60 % à k = 1')
  assert.ok(k1.ratioWithoutFirst > 1 && k1.ratioWithoutFirst < 1.5)
  assert.ok(k2.ratioWithoutFirst > 6)
})

test('le prix de l’hypothèse', () => {
  assert.equal(Math.round(knownChance(1) * 1e6) / 1e4, 13.3333)
  assert.equal(Math.round(knownChance(2) * 1e6) / 1e4, 1.5152)
  assert.equal(knownChance(0), 1)
})

test('un k hors bornes est refusé', () => {
  for (const bad of [-1, 5, 1.5, '2', null]) {
    assert.throws(() => knownSpace(bad), RangeError, String(bad))
  }
})
