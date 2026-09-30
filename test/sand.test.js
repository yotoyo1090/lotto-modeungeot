// 사(沙) — ce que l'écran promet doit rester vrai quand un 회차 s'ajoute.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { open, getDraws, DEFAULT_PATH } from '../src/node/db.js'
import { fromRows, NMAX, FULL } from '../src/core/draws.js'
import {
  SAND_BAGS, sandSeries, sandState, sandExpectedAtLeast, sandKillValue, KILL_BASE,
} from '../src/core/sand.js'

const db = open(DEFAULT_PATH, { readonly: true })
const draws = fromRows(getDraws(db))
const rows = sandSeries(draws, { from: 401 })
const by = (label) => rows.find((r) => r.label === label)

test('vingt-huit sacs, pas trente-deux', () => {
  // Quatre seraient des copies : 미출현/출현 et 꺼진/켜진 sont déjà des paires.
  assert.equal(rows.length, 28)
  assert.equal(SAND_BAGS.length, 16)
  assert.equal(SAND_BAGS.filter((b) => b.paired).length, 4)
})

test('un sac et son complément couvrent les 45 numéros', () => {
  for (const bag of SAND_BAGS.filter((b) => !b.paired && !b.oracle && !b.witness)) {
    const own = by(bag.label)
    const not = by(`여집합 ▸ ${bag.label}`)
    assert.ok(own && not, bag.label)
    // Taille : les deux se complètent exactement.
    assert.ok(Math.abs(own.size + not.size - NMAX) < 1e-9, `${bag.label} 크기`)
    // Attrape : sept numéros, dedans ou dehors.
    assert.equal(own.total + not.total, own.used * FULL)
    // z : le miroir exact, au signe près.
    assert.ok(Math.abs(own.z + not.z) < 1e-6, `${bag.label} z`)
  }
})

test('le sac vaut ce que sa taille impose', () => {
  for (const row of rows) {
    assert.ok(Math.abs(row.expectedMean - (FULL * row.size) / NMAX) < 1e-9, row.label)
  }
})

test('les deux paires déjà complémentaires se retrouvent', () => {
  const absent = by('제외번호 직전10회 미출현')
  const present = by('제외번호 직전10회 출현')
  assert.ok(Math.abs(absent.size + present.size - NMAX) < 1e-9)
  assert.equal(absent.total + present.total, absent.used * FULL)
})

test('la distribution somme aux 회차 mesurés', () => {
  for (const row of rows) {
    assert.equal(row.spread.reduce((a, b) => a + b, 0), row.used)
    assert.equal(row.spread.length, FULL + 1)
  }
})

test('sans information, aucun sac ne sort du bruit', () => {
  const honest = rows.filter((r) => !r.oracle)
  const worst = Math.max(...honest.map((r) => Math.abs(r.z)))
  // Le plafond pour 26 mesures ; le rapport mesurait 1.58 au maximum.
  assert.ok(worst < 2.5, `|z| max ${worst.toFixed(2)}`)
})

test('avec information, le sac sort du bruit — dans les deux sens', () => {
  const up = by('당첨 2개 + 채움 15')
  const down = by('여집합 ▸ 당첨 2개 + 채움 15')
  assert.ok(up.ratio > 1.3, `oracle ${up.ratio}`)
  assert.ok(down.ratio < 0.85, `complément ${down.ratio}`)
})

test('effacer un 꽝 coûte toujours le même prix', () => {
  assert.ok(Math.abs(KILL_BASE - 38 / 7) < 1e-12)
  for (const row of rows.filter((r) => !r.oracle)) {
    const { value } = sandKillValue(row)
    assert.ok(Math.abs(value - KILL_BASE) < 0.5, `${row.label} ${value.toFixed(2)}`)
  }
  // Le sac informé, lui, casse le tarif.
  assert.ok(sandKillValue(by('여집합 ▸ 당첨 2개 + 채움 15')).value > 7)
})

test('la loi exacte encadre le comptage observé', () => {
  for (const row of rows.filter((r) => !r.oracle)) {
    const expected = sandExpectedAtLeast(row, 3)
    const gap = Math.abs(row.three - expected) / Math.max(1, Math.sqrt(expected))
    assert.ok(gap < 4, `${row.label} ${row.three} vs ${expected.toFixed(0)}`)
  }
})

test('la série porte un point par 회차 et finit sur le ratio', () => {
  for (const row of rows) {
    assert.equal(row.series.length, row.used)
    assert.ok(Math.abs(row.series.at(-1).ratio - row.ratio) < 1e-9, row.label)
  }
})

test('l’état ne regarde jamais le tirage qu’il précède', () => {
  const i = draws.indexOf(1239)
  const state = sandState(draws, i)
  const drawn = new Set(draws.fullAt(i))
  // Un numéro sorti AU 1239 doit avoir un écart d'au moins 1 : s'il valait 0,
  // c'est que l'état aurait lu son propre tirage.
  for (const n of drawn) assert.ok(state.gap[n] >= 1, `${n} gap ${state.gap[n]}`)
})

db.close()
