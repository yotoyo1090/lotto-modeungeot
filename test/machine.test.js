// 추첨기 — le module et son parseur, sur les 50 étiquettes relevées à la
// main (1191회 → 1240회). Le contrôle sur base s'ignore si data/lotto.sqlite
// est absent.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { fromRows } from '../src/core/draws.js'
import { machine, machineCounts, machineSame, machineUniform } from '../src/core/machine.js'
import { hogiUrl, parseHogi, putMachines } from '../src/node/hogi.js'
import { open } from '../src/node/db.js'

const DB = process.env.LOTTO_DB ?? 'data/lotto.sqlite'
const skip = !existsSync(DB) && 'data/lotto.sqlite absent'

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/hogi-1191-1240.json', import.meta.url)))
const HOGI = new Map(Object.entries(FIXTURE).map(([r, m]) => [Number(r), m]))

test('le parseur lit « 1240회 로또 당첨번호 (3호기) » et ignore le reste', () => {
  const text = '1241회 로또 당첨번호\n- 7\n1240회 로또 당첨번호 (3호기)\n- 11\n1239회 로또 당첨번호 (2호기)'
  assert.deepEqual(parseHogi(text), [[1240, 3], [1239, 2]])
})

test('les machines tournent par blocs : 1191–1240 donne 17 · 19 · 14', () => {
  const tally = [0, 0, 0, 0]
  for (const m of HOGI.values()) tally[m]++
  assert.deepEqual(tally.slice(1), [17, 19, 14])
})

test('sur base : les trois tests tournent et rendent des p-values', { skip }, (t) => {
  const db = new DatabaseSync(DB, { readOnly: true })
  const rows = db.prepare('SELECT rang, date, n1, n2, n3, n4, n5, n6, bonus FROM draws').all()
    .map((r) => ({ rang: r.rang, date: r.date, numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6], bonus: r.bonus }))
  db.close()
  const draws = fromRows(rows)

  const counts = machineCounts(draws, HOGI)
  assert.equal([...counts.values()].reduce((s, c) => s + c.draws, 0), 50)

  for (const row of machineUniform(counts)) {
    assert.ok(row.p >= 0 && row.p <= 1, `${row.machine}호기 p=${row.p}`)
    // Les 45 comptages somment à six par tirage, et l'attendu est leur moyenne.
    assert.equal(row.numbers.length, 45)
    assert.equal(row.numbers.reduce((a, b) => a + b, 0), row.draws * 6)
    assert.ok(Math.abs(row.expected * 45 - row.draws * 6) < 1e-9)
  }
  const same = machineSame(counts)
  assert.equal(same.df, 88)
  assert.ok(same.p > 0 && same.p <= 1)
  // L'attendu d'homogénéité d'une machine somme à ses propres tirages × 6.
  for (const [m, row] of same.expected) {
    const sum = Array.from(row).reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(sum - counts.get(m).draws * 6) < 1e-9, `${m}호기`)
  }

  // 50 tirages : trop peu pour le classifieur — il doit le dire, pas planter.
  const all = machine(draws, HOGI)
  assert.equal(all.guess.tested, 0)
  t.diagnostic(`1호기 p=${all.uniform[0].p.toFixed(3)} · 2호기 p=${all.uniform[1].p.toFixed(3)} · 3호기 p=${all.uniform[2].p.toFixed(3)} · same p=${same.p.toFixed(3)}`)
})

test('putMachines : rejouer ne crée rien, changer compte comme changement', { skip }, () => {
  // Sur une copie en mémoire du schéma, avec deux tirages fictifs.
  const db = open(':memory:')
  db.exec(`INSERT INTO draws VALUES (1240,'2026-09-05',1,2,3,4,5,6,7),(1239,'2026-08-29',1,2,3,4,5,6,7)`)
  assert.deepEqual(putMachines(db, [[1240, 3], [1239, 2], [9999, 1]]),
    { added: 2, updated: 0, unchanged: 0, orphan: 1 })
  assert.deepEqual(putMachines(db, [[1240, 3], [1239, 1]]),
    { added: 0, updated: 1, unchanged: 1, orphan: 0 })
  assert.equal(db.prepare('SELECT machine FROM machines WHERE rang = 1239').get().machine, 1)
  db.close()
})

test("l'adresse demande tout depuis le 262회 jusqu'au 회차 voulu", () => {
  assert.equal(hogiUrl(1241), 'https://lottotapa.com/stat/result_hogi.php?sel_start=262&sel_end=1241&selHogi=')
})
