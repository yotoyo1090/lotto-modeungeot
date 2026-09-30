// Parité de 제외번호 et des sept 패턴 avec l'ancienne base.
//
// Ces deux tables — `customeruser_deletenumber` et
// `customeruser_predictnumber` — n'ont pas été réimportées : elles sont
// recalculées. Ce fichier est ce qui autorise à les jeter. Il rejoue les
// 1 124 lignes de la première et les 7 938 listes de la seconde, et exige
// l'égalité stricte.
//
// Un écart ici veut dire que le calcul se trompe — pas qu'il faut ajuster
// le test.
//
// Les tests s'ignorent d'eux-mêmes si `db.sqlite3` n'est pas là.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { fromRows, FULL, NMAX } from '../src/core/draws.js'
import { LEGACY_MAX, legacyOrder, orderedIndices } from '../src/core/legacy-order.js'
import {
  commonHistogram, excluded, expectedCommon, pattern, patternColumns, patternTable,
  patterns,
} from '../src/core/patterns.js'

const LEGACY = process.env.LEGACY_DB ?? '/root/core/db.sqlite3'
const skip = !existsSync(LEGACY) && 'db.sqlite3 absent'

const COLUMNS = ['일', '이', '삼', '사', '오', '육', '보너스']

function legacyDb() {
  return new DatabaseSync(LEGACY, { readOnly: true })
}

function loadDraws(db) {
  return fromRows(db.prepare(
    'SELECT 회차, 일, 이, 삼, 사, 오, 육, 보너스 FROM accountadmin_lottobasedata'
  ).all().map((r) => ({
    rang: r['회차'],
    numbers: [r['일'], r['이'], r['삼'], r['사'], r['오'], r['육']],
    bonus: r['보너스'],
  })))
}

// L'ancienne colonne est du Python sérialisé par `str()` :
//   [[(8, 17, 20, 35, 36, 44, 4), 1], [(16, 17, 22, 30, 37, 43, 36), 1], …]
// Pas du JSON — des tuples et des parenthèses. On n'en lit que les nombres,
// dans l'ordre, par paquets de huit : sept numéros puis le recouvrement.
function parseLegacyList(text) {
  if (!text) return []
  const numbers = text.match(/-?\d+/g)
  if (!numbers) return []
  assert.equal(numbers.length % (FULL + 1), 0,
    'la colonne ne contient pas un multiple de huit nombres')
  const out = []
  for (let i = 0; i < numbers.length; i += FULL + 1) {
    out.push({
      numbers: numbers.slice(i, i + FULL).map(Number),
      common: Number(numbers[i + FULL]),
    })
  }
  return out
}

// ------------------------------------------------------------- l'ordre légué

test('la permutation léguée couvre exactement les 회차 1 à 1134', () => {
  const order = legacyOrder()
  assert.equal(order.length, LEGACY_MAX)
  assert.deepEqual([...order].sort((a, b) => a - b),
    Array.from({ length: LEGACY_MAX }, (_, i) => i + 1))
})

test("l'ordre 'rang' est l'ordre de l'historique", { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const walk = orderedIndices(draws, 'rang')
  assert.deepEqual([...walk], [...Array(draws.n).keys()])
  db.close()
})

test("un 회차 hors permutation se range à la fin, pas à la poubelle", () => {
  // Un historique tronqué à trois tirages, plus un tirage futur.
  const draws = fromRows([
    { rang: 1, numbers: [1, 2, 3, 4, 5, 6], bonus: 7, date: null },
    { rang: 28, numbers: [1, 2, 3, 4, 5, 6], bonus: 8, date: null },
    { rang: 9999, numbers: [1, 2, 3, 4, 5, 6], bonus: 9, date: null },
  ])
  const walk = orderedIndices(draws, 'legacy')
  assert.equal(walk.length, 3)
  // 28 avant 1 (la permutation), puis 9999 qu'elle ne connaît pas.
  assert.deepEqual([...walk].map((i) => draws.rangs[i]), [28, 1, 9999])
})

// --------------------------------------------------------------- 제외번호

test('제외번호 — les 1 124 lignes de deletenumber', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  const rows = db.prepare('SELECT * FROM customeruser_deletenumber').all()
  assert.ok(rows.length > 1000, `${rows.length} lignes seulement`)

  // Les colonnes s'appellent 일 / 일합 / 일당첨 … en chiffres coréens.
  const NAMES = ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십',
    '십일', '십이', '십삼', '십사', '십오', '십육', '십칠', '십팔', '십구', '이십',
    '이십일', '이십이', '이십삼', '이십사', '이십오', '이십육', '이십칠', '이십팔',
    '이십구', '삼십', '삼십일', '삼십이', '삼십삼', '삼십사', '삼십오', '삼십육',
    '삼십칠', '삼십팔', '삼십구', '사십', '사십일', '사십이', '사십삼', '사십사',
    '사십오']
  assert.equal(NAMES.length, NMAX)
  // Si les noms de colonnes ne sont pas ceux-là, le test doit échouer
  // bruyamment plutôt que comparer `undefined` à `undefined`.
  for (const name of NAMES) {
    assert.ok(`${name}합` in rows[0], `colonne ${name}합 absente`)
    assert.ok(`${name}당첨` in rows[0], `colonne ${name}당첨 absente`)
  }

  let checked = 0
  for (const row of rows) {
    const rang = Number(row['회차'])
    const mine = excluded(draws, rang)
    assert.ok(mine, `회차 ${rang} : rien calculé`)
    for (let k = 0; k < NMAX; k++) {
      const name = NAMES[k]
      assert.equal(mine[k].number, Number(row[name]),
        `회차 ${rang} · colonne ${name} : le numéro lui-même`)
      assert.equal(mine[k].count, Number(row[`${name}합`]),
        `회차 ${rang} · ${name}합`)
      assert.equal(Number(mine[k].won), Number(row[`${name}당첨`]),
        `회차 ${rang} · ${name}당첨`)
    }
    checked++
  }
  assert.ok(checked >= 1124, `${checked} 회차 vérifiés`)
  db.close()
})

test('제외번호 — rien avant le onzième tirage', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  for (let rang = 1; rang <= 10; rang++) {
    assert.equal(excluded(draws, rang), null, `회차 ${rang}`)
  }
  assert.ok(excluded(draws, 11))
  db.close()
})

test('제외번호 — la fenêtre fait bien 70 numéros', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = excluded(draws, 1000)
  const total = rows.reduce((s, r) => s + r.count, 0)
  assert.equal(total, 10 * FULL)
  db.close()
})

// ------------------------------------------------------------------ 패턴

test('패턴 — les 7 938 listes de predictnumber, à l\'ordre près', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  const rows = db.prepare(
    `SELECT 회차, ${COLUMNS.join(', ')} FROM customeruser_predictnumber`
  ).all()
  assert.ok(rows.length > 1100, `${rows.length} lignes seulement`)

  let lists = 0
  let entries = 0
  for (const row of rows) {
    const rang = Number(row['회차'])
    const mine = patterns(draws, rang, { order: 'legacy' })
    for (let p = 0; p < FULL; p++) {
      const theirs = parseLegacyList(row[COLUMNS[p]])
      assert.equal(mine[p].entries.length, theirs.length,
        `회차 ${rang} · ${COLUMNS[p]} : ${mine[p].entries.length} entrées contre ${theirs.length}`)
      for (let k = 0; k < theirs.length; k++) {
        assert.deepEqual(mine[p].entries[k].numbers, theirs[k].numbers,
          `회차 ${rang} · ${COLUMNS[p]} · entrée ${k} : les numéros`)
        assert.equal(mine[p].entries[k].common, theirs[k].common,
          `회차 ${rang} · ${COLUMNS[p]} · entrée ${k} : le recouvrement`)
      }
      lists++
      entries += theirs.length
    }
  }
  assert.equal(lists, rows.length * FULL)
  assert.ok(entries > 100000, `${entries} entrées seulement`)
  db.close()
})

test("패턴 — l'ordre 회차 garde le même contenu, réordonné", { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  let moved = 0
  for (const rang of [11, 200, 700, 1087, 1134]) {
    for (let p = 0; p < FULL; p++) {
      const a = pattern(draws, rang, p, { order: 'legacy' })
      const b = pattern(draws, rang, p, { order: 'rang' })
      assert.equal(a.number, b.number)
      assert.equal(a.entries.length, b.entries.length)
      // Même ensemble de 회차, et chacun avec le même recouvrement.
      const key = (e) => `${e.rang}:${e.common}`
      assert.deepEqual(a.entries.map(key).sort(), b.entries.map(key).sort())
      // L'ordre 'rang' est croissant, par construction.
      const rangs = b.entries.map((e) => e.rang)
      assert.deepEqual(rangs, [...rangs].sort((x, y) => x - y))
      if (a.entries.map(key).join() !== b.entries.map(key).join()) moved++
    }
  }
  // C'est tout le sujet de l'interrupteur : les listes bougent vraiment.
  assert.ok(moved > 20, `seulement ${moved} listes réordonnées`)
  db.close()
})

test('패턴 — le dernier 회차 n\'a pas de futur, donc pas de recouvrement', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const last = draws.rangs[draws.n - 1]

  const tail = pattern(draws, last, 0)
  assert.equal(tail.hasFuture, false)
  assert.ok(tail.entries.length > 100)
  assert.ok(tail.entries.every((e) => e.common === 0))

  const before = pattern(draws, last - 1, 0)
  assert.equal(before.hasFuture, true)
  assert.ok(before.entries.some((e) => e.common > 0))
  db.close()
})

test('패턴 — le numéro cité est bien dans chaque tirage listé', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  for (const rang of [50, 600, 1130]) {
    for (let p = 0; p < FULL; p++) {
      const { number, entries } = pattern(draws, rang, p)
      for (const e of entries) {
        assert.ok(e.numbers.includes(number),
          `회차 ${rang} · position ${p} : ${e.rang} ne contient pas ${number}`)
        assert.ok(e.rang < rang, `${e.rang} n'est pas antérieur à ${rang}`)
      }
    }
  }
  db.close()
})

test('패턴 — position hors des sept', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  assert.throws(() => pattern(draws, 100, 7), RangeError)
  assert.throws(() => pattern(draws, 100, -1), RangeError)
  db.close()
})

// ------------------------------------------------------ la forme des écrans

test('patternTable rend exactement ce que pattern rend', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  const table = patternTable(draws, 0, { order: 'legacy' })
  assert.equal(table.rangs.length, draws.n)
  assert.equal(table.offsets.length, draws.n + 1)
  assert.equal(table.offsets[draws.n], table.index.length)

  for (const rang of [12, 400, 1134]) {
    const i = draws.indexOf(rang)
    const one = pattern(draws, rang, 0, { order: 'legacy' })
    const from = table.offsets[i]
    const to = table.offsets[i + 1]
    assert.equal(to - from, one.entries.length, `회차 ${rang}`)
    for (let k = 0; k < one.entries.length; k++) {
      assert.equal(draws.rangs[table.index[from + k]], one.entries[k].rang)
      assert.equal(table.common[from + k], one.entries[k].common)
    }
  }
  db.close()
})

test("commonHistogram compte toutes les entrées, une fois chacune", { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const table = patternTable(draws, 0)
  const hist = commonHistogram(table)
  assert.equal(hist.reduce((a, b) => a + b, 0), table.common.length)
  assert.equal(hist.length, FULL + 1)
  db.close()
})

test('patternColumns cumule sur les 회차 jusqu\'au demandé', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const table = patternTable(draws, 0)

  const rang = 300
  const columns = patternColumns(table, rang)
  assert.ok(columns.length > 0)
  assert.equal(columns[0].column, 1)

  // Colonne 1 : autant d'entrées que de 회차 ≤ 300 ayant une liste non vide.
  let expected = 0
  for (let i = 0; i < draws.n && draws.rangs[i] <= rang; i++) {
    if (table.offsets[i + 1] > table.offsets[i]) expected++
  }
  assert.equal(columns[0].counts.reduce((a, b) => a + b, 0), expected)

  // Chaque colonne est un sous-ensemble de la précédente : une liste qui a
  // une k-ième entrée en a forcément une (k-1)-ième.
  for (let k = 1; k < columns.length; k++) {
    const a = columns[k - 1].counts.reduce((x, y) => x + y, 0)
    const b = columns[k].counts.reduce((x, y) => x + y, 0)
    assert.ok(b <= a, `colonne ${k + 1} plus large que ${k}`)
  }

  assert.deepEqual(patternColumns(table, 0), [])
  db.close()
})

test("l'attendu hypergéométrique somme à 1 et colle à l'observé", { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const expected = expectedCommon()

  assert.equal(expected.length, FULL + 1)
  assert.ok(Math.abs(expected.reduce((a, b) => a + b, 0) - 1) < 1e-9)

  const table = patternTable(draws, 0)
  const hist = commonHistogram(table)
  const total = hist.reduce((a, b) => a + b, 0)

  // Le fond de l'affaire : ces listes ressemblent à un tirage au sort. On
  // ne l'affirme pas à la louche — chaque case observée est à moins d'un
  // point de pourcentage de son attendu.
  for (let k = 0; k <= FULL; k++) {
    const gap = Math.abs(hist[k] / total - expected[k])
    assert.ok(gap < 0.01, `${k} commun(s) : écart de ${(gap * 100).toFixed(2)} points`)
  }
  db.close()
})
