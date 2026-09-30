// L'ajusteur de 분배 : retrouve des coefficients connus sur des données
// simulées, et redonne le modèle en place sur la base réelle.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

import { design, poissonFit } from '../tools/fit-sharing.js'
import { SHARING_MODEL } from '../src/core/sharing.js'

test('design : six indicatrices, dans l’ordre de SHARING_MODEL', () => {
  // 3-4-5 : deux paires → runs 1–2 ; trois numéros ≤ 9 → small 3+ ; étendue 40 → spread ≥ 21
  assert.deepEqual(design([3, 4, 5, 20, 30, 43]), [1, 1, 0, 0, 1, 1])
  assert.deepEqual(design([10, 12, 14, 16, 18, 20]), [1, 0, 0, 0, 0, 0])
})

test('poissonFit retrouve β sur un échantillon simulé', () => {
  let s = 11
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
  const poisson = (mu) => { let k = 0, p = Math.exp(-mu), f = p, u = rnd(); while (u > f) { k++; p *= mu / k; f += p }; return k }
  const truth = [0.1, -0.1, 0.3, 0.1, 0.2, -0.15]
  const rows = []
  for (let i = 0; i < 4000; i++) {
    const x = [1, rnd() < 0.4, rnd() < 0.1, rnd() < 0.5, rnd() < 0.2, rnd() < 0.7].map(Number)
    if (x[1] && x[2]) x[2] = 0
    if (x[3] && x[4]) x[4] = 0
    const offset = Math.log(8 + rnd() * 6)
    rows.push({ x, y: poisson(Math.exp(offset + x.reduce((a, v, j) => a + v * truth[j], 0))), offset })
  }
  const fit = poissonFit(rows)
  fit.beta.forEach((b, j) => assert.ok(Math.abs(b - truth[j]) < 3 * fit.se[j] + 0.02, `β${j} = ${b.toFixed(3)} vs ${truth[j]}`))
  assert.ok(fit.phi > 0.85 && fit.phi < 1.15, `φ = ${fit.phi}`)
})

test('sur la base : la cible « total » redonne SHARING_MODEL à 0,01 près', { skip: !existsSync('data/lotto.sqlite') && 'base absente' }, async () => {
  const { open } = await import('../src/node/db.js')
  const { EXPECTED_PER_FIFTH } = await import('../src/core/sharing.js')
  const db = open('data/lotto.sqlite', { readOnly: true })
  const rows = db.prepare(`SELECT d.n1,d.n2,d.n3,d.n4,d.n5,d.n6, p1.winners AS first, p5.winners AS fifth
    FROM draws d JOIN prizes p1 ON p1.rang=d.rang AND p1.rank=1 JOIN prizes p5 ON p5.rang=d.rang AND p5.rank=5`).all()
    .filter((d) => d.first != null && d.fifth)
    .map((d) => ({ x: design([d.n1, d.n2, d.n3, d.n4, d.n5, d.n6]), y: d.first, offset: Math.log(d.fifth / EXPECTED_PER_FIFTH) }))
  db.close()
  const fit = poissonFit(rows)
  const m = SHARING_MODEL
  const expected = [m.base, m.runs[1], m.runs[2], m.small[1], m.small[2], m.spread[1]]
  fit.beta.forEach((b, j) => assert.ok(Math.abs(b - expected[j]) < 0.01, `β${j} ${b.toFixed(4)} vs ${expected[j]}`))
})
