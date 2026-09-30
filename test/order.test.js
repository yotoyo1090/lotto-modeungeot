// 공나온 순서 — le parseur, l'écriture avec contrôle contre `draws`, et
// les deux tests sur une page de 51 tirages (1190회 → 1240회).

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import { order, orderTable } from '../src/core/order.js'
import { open } from '../src/node/db.js'
import { orderUrl, parseOrder, putOrder } from '../src/node/order.js'

const PAGE = new URL('./fixtures/order-1190-1240.html', import.meta.url)
const skip = !existsSync(PAGE) && 'fixture absente'

const SAMPLE = `
<span>1240회 로또 당첨번호</span>
<div class="ball green_ball">44</div><div class="ball blue_ball">20</div>
<div class="ball blue_ball">11</div><div class="ball gray_ball">31</div>
<div class="ball blue_ball">13</div><div class="ball blue_ball">19</div>
<div class="plus">+</div><div class="ball red_ball">27</div>
<span>1239회 로또 당첨번호</span>
<div class="ball gray_ball">33</div><div class="plus">+</div>`

test("le parseur lit l'ordre et ignore le bonus et les blocs incomplets", () => {
  assert.deepEqual(parseOrder(SAMPLE), [[1240, [44, 20, 11, 31, 13, 19]]])
})

test("l'adresse demande tout depuis le 468회", () => {
  assert.equal(orderUrl(1241), 'https://lottotapa.com/stat/result_number.php?sel_start=468&sel_end=1241')
})

test("putOrder rejette un ordre qui n'est pas le tirage, accepte le vrai, ne réécrit pas l'identique", () => {
  const db = open(':memory:')
  db.exec(`INSERT INTO draws VALUES (1240,'2026-09-05',11,13,19,20,31,44,27)`)
  assert.deepEqual(putOrder(db, [[1240, [44, 20, 11, 31, 13, 19]], [1240, [1, 2, 3, 4, 5, 6]], [9, [1, 2, 3, 4, 5, 6]]]),
    { added: 1, updated: 0, unchanged: 0, orphan: 1, rejected: 1 })
  assert.deepEqual(putOrder(db, [[1240, [44, 20, 11, 31, 13, 19]]]),
    { added: 0, updated: 0, unchanged: 1, orphan: 0, rejected: 0 })
  db.close()
})

test('sur la page enregistrée : 51 tirages, tableau 45 × 6, deux p-values', { skip }, (t) => {
  const rows = parseOrder(readFileSync(PAGE, 'utf8'))
  assert.equal(rows.length, 51)
  const map = new Map(rows)
  const table = orderTable(map)
  assert.equal(table.draws, 51)
  let cells = 0
  for (let n = 1; n <= 45; n++) for (let p = 1; p <= 6; p++) cells += table.positions[n][p]
  assert.equal(cells, 51 * 6)
  const r = order(map)
  assert.equal(r.all.df, 225)
  assert.ok(r.all.p > 0 && r.all.p <= 1)
  // Les deux lectures du même tableau se recoupent : par numéro, les six
  // comptages somment à ses sorties ; par position, les 45 somment aux tirages.
  for (const row of r.each) {
    assert.equal(row.positions.reduce((a, b) => a + b, 0), row.total)
  }
  assert.equal(r.byPosition.length, 6)
  for (const col of r.byPosition) {
    assert.equal(col.numbers.reduce((a, b) => a + b, 0), 51)
    assert.ok(Math.abs(col.expected - 51 / 45) < 1e-9)
    assert.equal(col.df, 44)
    assert.ok(col.p > 0 && col.p <= 1)
  }
  t.diagnostic(`all χ²=${r.all.chi2.toFixed(1)} p=${r.all.p.toFixed(3)}`)
})
