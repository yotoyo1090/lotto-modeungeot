// 감시 — le CUSUM ne crie pas sur du hasard et voit un doublement.

import test from 'node:test'
import assert from 'node:assert/strict'

import { fromRows } from '../src/core/draws.js'
import { ACCUMULATORS, SPECS, cusum, state, threshold, watch } from '../src/core/watch.js'

test('226 accumulateurs, seuils calés pour une fausse alerte par décennie', () => {
  assert.equal(ACCUMULATORS, 226)
  assert.ok(SPECS.freq.h > 20 && SPECS.freq.h < 30)
  assert.ok(SPECS.freq.delay / 52 > 1.5 && SPECS.freq.delay / 52 < 4)
  assert.ok(threshold(0.5, 1000) > 4 && threshold(0.5, 1000) < 8)
})

test('un accumulateur retombe sur du bruit et monte sur une dérive', () => {
  const c = cusum(0.5)
  for (let i = 0; i < 100; i++) c.step(i % 2 ? 0.3 : -0.3, i)
  assert.ok(c.a.hi < 1 && c.a.lo < 1)
  for (let i = 0; i < 20; i++) c.step(1.5, 100 + i)
  assert.ok(c.a.hi > 15)
  assert.equal(state(0.2), 'ok'); assert.equal(state(0.7), 'watch'); assert.equal(state(1.1), 'alarm')
})

function simulate(defectFrom, seed) {
  let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
  const rows = []
  for (let i = 0; i < 1500; i++) {
    const w = Array.from({ length: 45 }, (_, k) => (i >= defectFrom && k === 6 ? 2 : 1))
    const picked = new Set()
    while (picked.size < 6) {
      let r = rnd() * w.reduce((a, b) => a + b, 0)
      for (let k = 0; k < 45; k++) { r -= w[k]; if (r < 0) { picked.add(k + 1); break } }
    }
    let bonus; do { bonus = 1 + Math.floor(rnd() * 45) } while (picked.has(bonus))
    rows.push({ rang: i + 1, date: '2000-01-01', numbers: [...picked].sort((a, b) => a - b), bonus })
  }
  return watch(fromRows(rows))
}

test('sain : jamais d’alerte sur 1 500 tirages ; doublement du 7 : alerte, et c’est le 7', () => {
  const clean = simulate(9999, 5)
  assert.equal(clean.freq.state, 'ok')
  assert.ok(clean.freq.worst.peak < SPECS.freq.h)
  const bad = simulate(800, 5)
  assert.equal(bad.freq.state, 'alarm')
  assert.equal(bad.freq.worst.label, '7')
  const at = bad.freq.trail.findIndex((v, i) => i >= 800 && v >= SPECS.freq.h)
  assert.ok(at > 800 && at < 1300, `alerte au tirage ${at + 1}`)
})
