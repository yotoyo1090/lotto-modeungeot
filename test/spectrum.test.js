// 주기도 — le périodogramme reconnaît un rythme fabriqué, et n'en invente
// pas dans du bruit. Le contrôle sur base s'ignore si data/lotto.sqlite est absent.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

import { fromRows, NMAX } from '../src/core/draws.js'
import { fisherP, fisherThreshold, periodogram, spectrum, spectrumAll } from '../src/core/spectrum.js'
import { getDraws, open } from '../src/node/db.js'

const DB = process.env.LOTTO_DB ?? 'data/lotto.sqlite'
const skip = !existsSync(DB) && 'data/lotto.sqlite absent'

function mulberry(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('un rythme fabriqué de période 7 est trouvé, avec une p minuscule', () => {
  const x = Array.from({ length: 1240 }, (_, t) => (t % 7 === 0 ? 1 : 0))
  const r = periodogram(x)
  assert.ok(Math.abs(r.peak.period - 7) < 0.05, `période ${r.peak.period}`)
  assert.ok(r.g > r.gStar)
  assert.ok(r.p < 1e-6, `p ${r.p}`)
})

test('du bruit blanc ne franchit presque jamais le seuil', () => {
  const rnd = mulberry(7)
  let over = 0
  const trials = 200
  for (let k = 0; k < trials; k++) {
    const x = Array.from({ length: 1240 }, () => (rnd() < 6 / 45 ? 1 : 0))
    if (periodogram(x).g > fisherThreshold(periodogram(x).m)) over++
  }
  // 5 % attendus : 10 sur 200. On tolère large — c'est une borne, pas une mesure.
  assert.ok(over <= 25, `${over} franchissements sur ${trials}`)
})

test('le seuil de Fisher et sa p-value se répondent', () => {
  const m = 619
  const gStar = fisherThreshold(m, 0.05)
  assert.ok(Math.abs(fisherP(gStar, m) - 0.05) < 0.01)
  assert.ok(fisherP(gStar * 2, m) < fisherP(gStar, m))
  assert.equal(fisherP(0, m), 1)
})

test('le périodogramme retire la moyenne et rend des parts qui somment à 1', () => {
  const r = periodogram([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0])
  const sum = r.share.reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
  assert.ok(Math.abs(r.peak.period - 3) < 1e-9)
})

test('sur la base, les 45 numéros se testent et le 13 n\'a pas de rythme', { skip }, () => {
  const db = open(DB, { readOnly: true })
  const draws = fromRows(getDraws(db))
  db.close()
  const all = spectrumAll(draws)
  assert.equal(all.rows.length, NMAX)
  assert.ok(all.over <= 8, `${all.over} numéros au-dessus du seuil`)
  const r13 = spectrum(draws, 13)
  assert.equal(r13.number, 13)
  assert.ok(r13.p > 0.05)
})
