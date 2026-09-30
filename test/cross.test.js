// 교차 검정 — les quatre tableaux croisés, et ce qu'ils ne doivent pas dire.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { open, getDraws, DEFAULT_PATH } from '../src/node/db.js'
import { fromRows, NMAX, FULL } from '../src/core/draws.js'
import { CROSS_LISTS, crossCombos, crossReport, noiseCeiling } from '../src/core/cross.js'

const db = open(DEFAULT_PATH, { readonly: true })
const draws = fromRows(getDraws(db))
const r = crossReport(draws, { from: 401 })
db.close()

test('neuf sacs, 129 croisements — 9 simples, 36 paires, 84 triples', () => {
  assert.equal(CROSS_LISTS.length, 9)
  const combos = crossCombos()
  assert.equal(combos.length, 129)
  assert.equal(combos.filter((c) => c.length === 1).length, 9)
  assert.equal(combos.filter((c) => c.length === 2).length, 36)
  assert.equal(combos.filter((c) => c.length === 3).length, 84)
})

test('la multiplicité couvre chaque case une fois', () => {
  const cells = r.overlap.reduce((a, o) => a + o.cells, 0)
  const hits = r.overlap.reduce((a, o) => a + o.hit, 0)
  assert.equal(cells, r.used * NMAX)
  assert.equal(hits, r.used * FULL)
})

test('les numéros gagnants ne se rassemblent pas', () => {
  // Si une signature attirait les gagnants, leur groupe serait plus petit
  // — c'est le test direct de l'idée « même caractère ».
  assert.ok(Math.abs(r.winnerGroupMean - r.groupMean) < 0.2,
    `${r.winnerGroupMean.toFixed(2)} vs ${r.groupMean.toFixed(2)}`)
})

test('croiser en double et en triple ne fait rien remonter', () => {
  const worst = Math.max(...r.cross.map((c) => Math.abs(c.z)))
  assert.ok(worst < r.crossCeiling,
    `|z| ${worst.toFixed(2)} contre un plafond de ${r.crossCeiling.toFixed(2)}`)
})

test('le plafond de bruit monte avec le nombre de mesures', () => {
  assert.ok(noiseCeiling(129) > noiseCeiling(52))
  assert.ok(noiseCeiling(52) > noiseCeiling(28))
  assert.ok(noiseCeiling(21304) > noiseCeiling(129))
})

test('la règle apprise s’effondre sur la moitié qu’elle n’a pas vue', () => {
  const [learned, blind] = r.eliminate
  assert.ok(learned.value > blind.value,
    `apprise ${learned.value.toFixed(2)} · aveugle ${blind.value.toFixed(2)}`)
  // Et la moitié aveugle retombe sur le tarif du hasard, 38/7.
  assert.ok(Math.abs(blind.value - 38 / 7) < 0.4, blind.value.toFixed(2))
})

test('exclure sans jeter de gagnant n’arrive presque jamais', () => {
  const blind = r.eliminate[1]
  assert.ok(blind.removed > 15, `${blind.removed} exclus`)
  assert.ok(blind.cleanRate < 0.05, `${(blind.cleanRate * 100).toFixed(1)} %`)
})

test('la liste du prochain 회차 partage les 45 en deux', () => {
  assert.equal(r.nextRang, draws.rangs[draws.n - 1] + 1)
  assert.equal(r.killed.length + r.kept.length, NMAX)
  assert.equal(new Set([...r.killed, ...r.kept]).size, NMAX)
})
