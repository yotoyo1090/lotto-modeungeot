// 패밀리 — le classement des 회차 en familles.
//
// Ce que ces tests protègent, dans l'ordre d'importance :
//
//   1. les familles d'une dimension forment une PARTITION — un 회차 tombe
//      dans exactement une, et leur somme fait le total
//   2. l'espérance conditionnelle : dans une famille définie par les numéros,
//      les six places se répartissent entre les groupes que la famille impose
//   3. sur des tirages sans mémoire, aucune famille ne ressort — sans quoi la
//      page ferait voir des motifs partout, ce qui est exactement son danger

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

import {
  BASE_RATE, FAMILY_DIMENSIONS, LOW_MAX, ODD_COUNT, SMALL_MAX, choose,
  classifyDraws, familyDimension, familyList, familyMembers, familyNext,
  familyStats, groupLaw, numberChances,
} from '../src/core/family.js'
import { fromRows, NMAX, PICK } from '../src/core/draws.js'
import { allCells, boardColumns } from '../src/core/tablelist.js'
import { open, getDraws, DEFAULT_PATH } from '../src/node/db.js'

function synthetic(n = 500, seed = 11) {
  let a = seed
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rows = []
  for (let i = 1; i <= n; i++) {
    const bag = []
    for (let v = 1; v <= NMAX; v++) bag.push(v)
    for (let k = bag.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [bag[k], bag[j]] = [bag[j], bag[k]]
    }
    rows.push({
      rang: i,
      date: '2020-01-01',
      numbers: bag.slice(0, PICK).sort((x, y) => x - y),
      bonus: bag[PICK],
    })
  }
  return fromRows(rows)
}

function prepare(draws) {
  const cells = allCells(draws)
  const linesOf = (i) => {
    if (i < 1) return new Set()
    const { columns } = boardColumns(cells[i - 1], draws.fullAt(i))
    const out = new Set()
    for (const col of columns) {
      col.entries.forEach((e, line) => { if (e.hit) out.add(line) })
    }
    return out
  }
  return { cells, rows: classifyDraws(draws, cells, linesOf) }
}

test('C(n,k) et la loi d’un groupe', () => {
  assert.equal(choose(45, 6), 8145060)
  assert.equal(choose(6, 0), 1)
  assert.equal(choose(3, 5), 0)
  for (const m of [SMALL_MAX, LOW_MAX, ODD_COUNT, 14]) {
    const law = groupLaw(m)
    assert.equal(law.length, PICK + 1)
    assert.ok(Math.abs(law.reduce((a, b) => a + b, 0) - 1) < 1e-9, `m = ${m}`)
    const mean = law.reduce((a, v, k) => a + v * k, 0)
    assert.ok(Math.abs(mean - PICK * m / NMAX) < 1e-9, `m = ${m} : moyenne`)
  }
})

test('les familles d’une dimension forment une partition', () => {
  const draws = synthetic()
  const { rows } = prepare(draws)
  assert.equal(rows.length, draws.n - 2)

  for (const dim of FAMILY_DIMENSIONS) {
    const list = familyList(rows, dim.key)
    assert.equal(list.reduce((a, f) => a + f.n, 0), rows.length, dim.key)
    const seen = new Set()
    for (const f of list) {
      for (const m of familyMembers(rows, dim.key, f.value)) {
        assert.ok(!seen.has(m.rang), `${dim.key} : ${m.rang}회 dans deux familles`)
        seen.add(m.rang)
      }
    }
    assert.equal(seen.size, rows.length, dim.key)
    assert.ok(Math.abs(list.reduce((a, f) => a + f.share, 0) - 1) < 1e-9, dim.key)
  }
})

test('chaque 회차 porte des comptages cohérents', () => {
  const draws = synthetic(200)
  const { rows } = prepare(draws)
  for (const r of rows) {
    assert.equal(r.numbers.length, PICK)
    assert.equal(r.temp.hot + r.temp.midle + r.temp.cold + r.temp.dead, PICK,
      `${r.rang}회 : les températures ne font pas six`)
    assert.equal(r.small, r.numbers.filter((n) => n <= SMALL_MAX).length)
    assert.equal(r.low, r.numbers.filter((n) => n <= LOW_MAX).length)
    assert.equal(r.odd, r.numbers.filter((n) => n % 2 === 1).length)
    assert.ok(r.carry >= 0 && r.carry <= PICK)
  }
})

test('L’ESPERANCE CONDITIONNELLE distribue exactement six places', () => {
  const draws = synthetic(300)
  const { cells, rows } = prepare(draws)
  for (const key of [null, 'carry', 'pattern', 'odd', 'low', 'small', 'temp', 'dead']) {
    for (const r of rows.slice(0, 60)) {
      const p = numberChances(r, cells, key)
      let total = 0
      for (let v = 1; v <= NMAX; v++) {
        assert.ok(p[v] >= 0 && p[v] <= 1, `${key} · ${r.rang}회 · ${v}`)
        total += p[v]
      }
      assert.ok(Math.abs(total - PICK) < 1e-9,
        `${key} · ${r.rang}회 : ${total} places au lieu de ${PICK}`)
    }
  }
})

test('la contrainte 홀짝 se lit dans l’espérance', () => {
  const draws = synthetic(200)
  const { cells, rows } = prepare(draws)
  const r = rows.find((x) => x.odd === 3)
  const p = numberChances(r, cells, 'odd')
  // Trois places pour vingt-trois impairs, trois pour vingt-deux pairs.
  assert.ok(Math.abs(p[1] - 3 / ODD_COUNT) < 1e-12)
  assert.ok(Math.abs(p[2] - 3 / (NMAX - ODD_COUNT)) < 1e-12)
  // Et sans contrainte, tout le monde a la même part.
  const flat = numberChances(r, cells, 'carry')
  assert.ok(Math.abs(flat[1] - BASE_RATE) < 1e-12)
  assert.ok(Math.abs(flat[2] - BASE_RATE) < 1e-12)
})

test('une famille « 9 이하 0개 » n’attend rien des neuf premiers', () => {
  const draws = synthetic(400)
  const { cells, rows } = prepare(draws)
  const members = familyMembers(rows, 'small', '0개')
  assert.ok(members.length > 20)
  const s = familyStats(members, rows, cells, 'small')
  for (const row of s.numbers.rows) {
    if (row.number <= SMALL_MAX) {
      assert.equal(row.count, 0, `${row.number} ne peut pas sortir ici`)
      assert.equal(row.expected, 0, `${row.number} : attendu non nul`)
    }
  }
  // Les cases impossibles sont écartées du χ², pas comptées comme des écarts.
  assert.ok(s.numbers.chi.cells <= NMAX - SMALL_MAX)
})

test('les totaux tombent juste', () => {
  const draws = synthetic()
  const { cells, rows } = prepare(draws)
  const s = familyStats(rows, rows, cells, 'carry')

  assert.equal(s.numbers.rows.reduce((a, r) => a + r.count, 0), rows.length * PICK)
  const exp = s.numbers.rows.reduce((a, r) => a + r.expected, 0)
  assert.ok(Math.abs(exp - rows.length * PICK) < 1e-6, `attendu ${exp}`)
  assert.ok(Math.abs(s.numbers.flat - rows.length * BASE_RATE) < 1e-9)

  assert.equal(s.bands.reduce((a, b) => a + b.drawn, 0), rows.length * PICK)
  assert.ok(Math.abs(s.bands.reduce((a, b) => a + b.expected, 0) - rows.length * PICK) < 1e-6)

  for (const key of ['odd', 'low', 'small', 'primes']) {
    assert.equal(s.lists[key].reduce((a, x) => a + x.count, 0), rows.length, key)
    assert.ok(Math.abs(s.lists[key].reduce((a, x) => a + x.expected, 0) - rows.length) < 1e-6, key)
  }
})

test('une famille vide ne casse rien', () => {
  const draws = synthetic(120)
  const { cells, rows } = prepare(draws)
  assert.equal(familyStats([], rows, cells, 'carry'), null)
  assert.equal(familyNext([], rows, rows), null)
})

test('une dimension inconnue est refusée', () => {
  const draws = synthetic(120)
  const { rows } = prepare(draws)
  assert.equal(familyDimension('n’existe pas'), null)
  assert.throws(() => familyList(rows, 'n’existe pas'), RangeError)
  assert.throws(() => familyMembers(rows, 'n’existe pas', 'x'), RangeError)
})

test('LE CONTROLE — sur des tirages sans mémoire, aucune famille ne ressort', () => {
  let low = 0
  let total = 0
  for (let s = 0; s < 10; s++) {
    const draws = synthetic(500, 200 + s * 37)
    const { cells, rows } = prepare(draws)
    for (const dim of FAMILY_DIMENSIONS) {
      for (const f of familyList(rows, dim.key)) {
        if (f.n < 60) continue
        const st = familyStats(familyMembers(rows, dim.key, f.value), rows, cells, dim.key)
        total++
        if (st.numbers.chi.p < 0.05) low++
      }
    }
  }
  assert.ok(total >= 50, `${total} familles`)
  assert.ok(low / total <= 0.15, `${low}/${total} familles sous p < 0.05 — l’attendu est faux`)
})

test('sur les vrais tirages, les familles restent ordinaires',
  { skip: !existsSync(DEFAULT_PATH) }, () => {
    const db = open(DEFAULT_PATH, { readOnly: true })
    const draws = fromRows(getDraws(db))
    db.close()
    const { cells, rows } = prepare(draws)

    let flagged = 0
    let total = 0
    const worst = []
    for (const dim of FAMILY_DIMENSIONS) {
      const list = familyList(rows, dim.key)
      assert.equal(list.reduce((a, f) => a + f.n, 0), rows.length, dim.key)
      for (const f of list) {
        if (f.n < 100) continue
        const st = familyStats(familyMembers(rows, dim.key, f.value), rows, cells, dim.key)
        total++
        if (st.numbers.chi.p < 0.05) {
          flagged++
          worst.push(`${dim.label}/${f.value} p=${st.numbers.chi.p.toFixed(3)}`)
        }
      }
    }
    assert.ok(total >= 10, `${total} familles testées`)
    assert.ok(flagged / total <= 0.2,
      `${flagged}/${total} sous p < 0.05 — trop pour du hasard : ${worst.join(', ')}`)
  })
