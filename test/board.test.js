// Parité des deux tableaux 조합 avec l'ancienne base.
//
// `customeruser_numberpattern` — 1 134 lignes × 45 colonnes — n'est pas
// réimportée : elle est recalculée. Ce fichier est ce qui autorise à la
// jeter. Il rejoue **les 51 030 cellules** et exige l'égalité stricte,
// drapeau par drapeau : 당첨, 이월, (1)이월, (2)이월, (3)이월.
//
// Les 42 colonnes de la ligne 조합 sont vérifiées contre
// `accountadmin_winnerpremiere`, qui portait les mêmes indicateurs sur les
// six numéros gagnants de chaque 회차.
//
// Les tests s'ignorent d'eux-mêmes si `db.sqlite3` n'est pas là.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { FULL, fromRows, NMAX, PICK, PRIMES } from '../src/core/draws.js'
import {
  BANDS, bandOf, cells, legacyValue, MIN_LINES, patternGrid, repeats, STACK,
  stack, temperatureRow,
} from '../src/core/board.js'
import {
  gaps as gapsOf, numberFlow, placeFlow, PLACES, positions as positionsOf,
  runFlag, runs as runsOf,
} from '../src/core/analysis.js'
import { carryover } from '../src/core/metrics.js'
import { COLUMNS, describeRow, toCells } from '../src/core/row.js'
import { filterSeries, gridsAt, indicatorLaw, rowCount } from '../src/core/filters.js'
import {
  multipleSeries, paritySeries, recentSeries, RECENT_FLOOR, RECENT_SPAN,
} from '../src/core/first.js'
import {
  ON, OFF, SECTION_FAMILIES, SECTION_LABELS, SECTION_LOW_MAX, sectionCells,
  sectionFlag, sectionLaw, sectionSeries,
} from '../src/core/sections.js'
import {
  BUCKETS, DISTANCE_WINDOW, MAX_HITS, bucketNumbers, familyDistance, familyLines,
  lineFlow, lineTally, parseExcluded, patternDigest, patternLines, patternTally,
} from '../src/core/table.js'
import {
  MIN_HEIGHT, REFERENCE_LISTS, allCells, boardColumns, nextCells, nextRang,
  repeatTally, sampleLists, tableListStats,
} from '../src/core/tablelist.js'
import {
  WINDOW, deletedRows, deletedTallies, peakCount,
} from '../src/core/deleted.js'
import {
  LIST_FAMILIES, familyMembers, listSeries,
} from '../src/core/lists.js'
import {
  BANDS as HC_BANDS, HOTCOLD_FAMILIES, HOTCOLD_LOW_MAX, MIN_HEIGHT as HC_MIN,
  familyNumbers, hotColdLineCarry, hotColdLineStats, hotColdRow, hotColdSameLine,
  hotColdSeries,
} from '../src/core/hotcold.js'
import {
  hlBoard, hlCells, hlDigits, hlHistory, hlLineStats, hlNextCells,
} from '../src/core/hl.js'

const LEGACY = process.env.LEGACY_DB ?? '/root/core/db.sqlite3'
const skip = !existsSync(LEGACY) && 'db.sqlite3 absent'

// Les 45 colonnes de `numberpattern`, en chiffres coréens.
const KOR = ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십',
  '십일', '십이', '십삼', '십사', '십오', '십육', '십칠', '십팔', '십구', '이십',
  '이십일', '이십이', '이십삼', '이십사', '이십오', '이십육', '이십칠', '이십팔',
  '이십구', '삼십', '삼십일', '삼십이', '삼십삼', '삼십사', '삼십오', '삼십육',
  '삼십칠', '삼십팔', '삼십구', '사십', '사십일', '사십이', '사십삼', '사십사',
  '사십오']

const legacyDb = () => new DatabaseSync(LEGACY, { readOnly: true })

function loadDraws(db) {
  return fromRows(db.prepare(
    'SELECT 회차, 일, 이, 삼, 사, 오, 육, 보너스 FROM accountadmin_lottobasedata'
  ).all().map((r) => ({
    rang: r['회차'],
    numbers: [r['일'], r['이'], r['삼'], r['사'], r['오'], r['육']],
    bonus: r['보너스'],
  })))
}

// ------------------------------------------------------ les 51 030 cellules

test('numberpattern — les 1 134 × 45 cellules, drapeaux compris', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  const rows = db.prepare('SELECT * FROM customeruser_numberpattern').all()
  assert.ok(rows.length > 1100, `${rows.length} lignes seulement`)
  assert.equal(KOR.length, NMAX)
  for (const name of KOR) assert.ok(name in rows[0], `colonne ${name} absente`)

  const flags = new Map()
  let checked = 0

  for (const stored of rows) {
    const rang = Number(stored['회차'])
    const mine = cells(draws, rang)
    assert.equal(mine.length, NMAX)

    for (let n = 1; n <= NMAX; n++) {
      const theirs = String(stored[KOR[n - 1]])
      const value = legacyValue(mine[n - 1])
      assert.equal(value, theirs, `회차 ${rang} · 번호 ${n}`)
      assert.equal(mine[n - 1].number, n)
      flags.set(theirs, (flags.get(theirs) ?? 0) + 1)
      checked++
    }
  }

  assert.equal(checked, rows.length * NMAX)
  assert.ok(checked >= 51_030, `${checked} cellules seulement`)

  // Les cinq drapeaux existent bien dans la base, et se partagent
  // exactement les sept numéros de chaque 회차.
  const flagged = ['당첨', '이월', '(1)이월', '(2)이월', '(3)이월']
    .reduce((a, k) => a + (flags.get(k) ?? 0), 0)
  assert.equal(flagged, rows.length * 7,
    'les drapeaux doivent couvrir les sept numéros de chaque 회차')
  for (const key of ['당첨', '이월', '(1)이월', '(2)이월', '(3)이월']) {
    assert.ok(flags.get(key) > 0, `aucun ${key} rencontré`)
  }
  db.close()
})

test('un écart se compte depuis la dernière sortie, bonus compris', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const rang = 1134
  const rows = cells(draws, rang)

  for (const cell of rows) {
    if (cell.flag) continue
    // Le numéro ne doit apparaître dans aucun des `gap − 1` tirages
    // précédents, et doit apparaître dans celui juste avant.
    for (let back = 1; back < cell.gap; back++) {
      const row = [...draws.fullAt(draws.indexOf(rang - back))]
      assert.ok(!row.includes(cell.number),
        `번호 ${cell.number} : écart ${cell.gap} mais présent au ${rang - back}`)
    }
    const at = rang - cell.gap
    if (at >= draws.rangs[0]) {
      assert.ok([...draws.fullAt(draws.indexOf(at))].includes(cell.number),
        `번호 ${cell.number} : absent du ${at}, son écart devrait être plus grand`)
    }
  }
  db.close()
})

test('les quatre bandes se suivent sans trou ni recouvrement', () => {
  assert.equal(BANDS.length, 4)
  for (let k = 1; k < BANDS.length; k++) {
    assert.equal(BANDS[k].min, BANDS[k - 1].max + 1, `bande ${BANDS[k].key}`)
  }
  assert.equal(bandOf(1), 'hot')
  assert.equal(bandOf(5), 'hot')
  assert.equal(bandOf(6), 'midle')
  assert.equal(bandOf(10), 'midle')
  assert.equal(bandOf(11), 'cold')
  assert.equal(bandOf(19), 'cold')
  assert.equal(bandOf(20), 'dead')
  assert.equal(bandOf(999), 'dead')
})

// ------------------------------------------------------------------ 패턴

test('패턴 — chaque numéro apparaît une fois, et une seule', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  for (const rang of [50, 700, 1134]) {
    const rows = cells(draws, rang)
    const { headers, grid, lines } = patternGrid(rows)
    assert.ok(lines >= MIN_LINES)

    const seen = []
    for (const line of grid) {
      if (line.won) seen.push(line.won.number)
      line.cells.forEach((cell, k) => {
        if (!cell) return
        seen.push(cell.number)
        // La colonne k porte l'écart headers[k] — c'est tout le sens de la
        // grille, et rien d'autre ne le vérifie.
        assert.equal(cell.gap, headers[k], `회차 ${rang}`)
      })
    }
    assert.deepEqual([...seen].sort((a, b) => a - b),
      Array.from({ length: NMAX }, (_, i) => i + 1), `회차 ${rang}`)

    // La colonne 당첨 porte les sept numéros du tirage.
    const won = grid.map((l) => l.won).filter(Boolean).map((c) => c.number)
    assert.deepEqual([...won].sort((a, b) => a - b),
      [...draws.fullAt(draws.indexOf(rang))].sort((a, b) => a - b))
  }
  db.close()
})

test('반복 수 compte les 38 non sortis et les 7 sortis', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = cells(draws, 1134)
  const count = repeats(rows)

  const numeric = count.gaps.reduce((a, [, n]) => a + n, 0)
  assert.equal(numeric, NMAX - 7, 'les sortis ne comptent pas dans les écarts')
  assert.equal(count.won + count.carried, 7)
  // Les écarts sont donnés dans l'ordre croissant, sans doublon.
  const keys = count.gaps.map(([g]) => g)
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b))
  assert.equal(new Set(keys).size, keys.length)
  db.close()
})

// ------------------------------------------------------------------ 차뜨

test('차뜨 — 45 numéros, triés, et des bandes qui totalisent 45', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  for (const rang of [30, 600, 1134]) {
    const { cells: sorted, spans } = temperatureRow(cells(draws, rang))
    assert.equal(sorted.length, NMAX)
    assert.deepEqual(sorted.map((c) => c.number).sort((a, b) => a - b),
      Array.from({ length: NMAX }, (_, i) => i + 1))

    for (let k = 1; k < sorted.length; k++) {
      assert.ok(sorted[k].gap >= sorted[k - 1].gap, `회차 ${rang} : tri`)
    }
    assert.equal(spans.reduce((a, s) => a + s.count, 0), NMAX,
      `회차 ${rang} : les bandes doivent couvrir les 45`)

    // Les bandes se suivent dans l'ordre du tri : aucun numéro d'une bande
    // plus froide ne peut précéder un numéro d'une bande plus chaude.
    let cursor = 0
    for (const span of spans) {
      for (let k = 0; k < span.count; k++) {
        assert.equal(sorted[cursor++].band, span.key, `회차 ${rang}`)
      }
    }
  }
  db.close()
})

// ---------------------------------------------------------- les 41 colonnes

test('la ligne 조합 a bien 42 colonnes, en-têtes et cellules', () => {
  assert.equal(COLUMNS.length, 42)
  const r = describeRow([3, 7, 9, 13, 19, 24], { rang: 1134 })
  assert.equal(toCells(r).length, COLUMNS.length)
})

test('les 42 colonnes = winnerpremiere, sur les 1 134 회차', { skip }, () => {
  const db = legacyDb()
  const rows = db.prepare(
    'SELECT * FROM accountadmin_winnerpremiere'
  ).all()
  assert.ok(rows.length > 1100, `${rows.length} lignes seulement`)

  const draws = loadDraws(db)
  const byRang = new Map()
  for (let i = 0; i < draws.n; i++) {
    byRang.set(draws.rangs[i], [...draws.sequenceAt(i)])
  }

  let checked = 0
  for (const stored of rows) {
    const rang = Number(stored['회차'])
    const grid = [stored['일'], stored['이'], stored['삼'],
      stored['사'], stored['오'], stored['육']].map(Number)
    const previous = byRang.get(rang - 1) ?? null
    const r = describeRow(grid, { rang, previous })

    assert.equal(r.total, Number(stored['총합']), `회차 ${rang} · 총합`)
    assert.equal(r.ac, Number(stored['ac값']), `회차 ${rang} · AC값`)
    assert.equal(r.headSum, Number(stored['앞자리수합']), `회차 ${rang} · 앞자리수합`)
    assert.equal(r.tailSum, Number(stored['끝자리수합']), `회차 ${rang} · 끝자리수합`)
    assert.equal(r.lowLabel, stored['저고'], `회차 ${rang} · 저고`)
    assert.equal(r.oddLabel, stored['홀짝'], `회차 ${rang} · 홀짝`)
    assert.equal(r.primes.count, Number(stored['소수숫자수']), `회차 ${rang} · 소수`)
    assert.equal(r.primes.sum, Number(stored['소수합']), `회차 ${rang} · 소수합`)
    assert.equal(r.composites.count, Number(stored['합성숫자수']), `회차 ${rang} · 합성수`)
    assert.equal(r.composites.sum, Number(stored['함성수합']), `회차 ${rang} · 합성수합`)

    for (const [m, key] of [[2, '이의배'], [3, '삼의배'], [4, '사의배'], [5, '오의배']]) {
      assert.equal(r.multiples[m].count, Number(stored[`${key}숫자수`]),
        `회차 ${rang} · ${key}수`)
      assert.equal(r.multiples[m].sum, Number(stored[`${key}수합`]),
        `회차 ${rang} · ${key}수합`)
    }

    if (previous) {
      assert.deepEqual(r.carried, JSON.parse(stored['전회차이월번호']),
        `회차 ${rang} · 전회차이월번호`)
      assert.equal(r.carriedSum, Number(stored['전회차이월번호합']),
        `회차 ${rang} · 전회차이월번호합`)
      assert.deepEqual(r.carriedPositions, JSON.parse(stored['전회차이월번호위치']),
        `회차 ${rang} · 전회차이월번호위치`)
    }
    checked++
  }
  assert.ok(checked >= 1100, `${checked} 회차 vérifiés`)
  db.close()
})

test('저고 range le 23 en 고, comme le fait le ratio', () => {
  // L'ancien code se contredisait : le ratio comptait 저 avec `< 23`, la
  // liste 저번호 avec `<= 23`. Le 23 était donc compté en 고 et affiché en
  // 저. On suit le ratio, qui est ce que porte la colonne 저고 de la base.
  const r = describeRow([1, 2, 3, 4, 5, 23])
  assert.equal(r.lowLabel, '5 : 1')
  assert.deepEqual(r.high, [23])
  assert.ok(!r.low.includes(23))
})

test('une grille malformée est refusée, pas décrite de travers', () => {
  assert.throws(() => describeRow([1, 2, 3, 4, 5]), RangeError)
  assert.throws(() => describeRow([1, 2, 3, 4, 5, 5]), RangeError)
  assert.throws(() => describeRow([1, 2, 3, 4, 5, 46]), RangeError)
  assert.throws(() => describeRow([1, 2, 3, 4, 5, 0]), RangeError)
})

test('앞쌍 et 끝쌍 comptent les chiffres qui reviennent', () => {
  // 3,7,9,13,19,24 → premiers chiffres 3,7,9,1,1,2 → 1 revient deux fois.
  const r = describeRow([3, 7, 9, 13, 19, 24])
  assert.deepEqual(r.heads, [3, 7, 9, 1, 1, 2])
  assert.equal(r.headSum, 23)
  assert.deepEqual(r.headPairs, ['3:1', '7:1', '9:1', '1:2', '2:1'])
  assert.deepEqual(r.tails, [3, 7, 9, 3, 9, 4])
  assert.equal(r.tailSum, 35)
  assert.equal(PICK, 6)
})

// ------------------------------------------------------- les trois 회차

test('la pile prend le 회차 et les deux d\'avant', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  const three = stack(draws, 1134)
  assert.equal(three.length, STACK)
  assert.deepEqual(three.map((b) => b.rang), [1134, 1133, 1132])
  for (const b of three) assert.equal(b.cells.length, NMAX)

  // Au tout début de l'historique, la pile est simplement plus courte —
  // elle ne lève pas et ne remonte pas plus haut que le premier tirage.
  assert.equal(stack(draws, draws.rangs[0]).length, 1)
  assert.equal(stack(draws, draws.rangs[1]).length, 2)
  assert.equal(stack(draws, 1134, 10).length, 10)
  db.close()
})

test('chaque 회차 de la pile est trié pour lui-même', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const boards = stack(draws, 1134)

  const tables = boards.map((b) => ({ rang: b.rang, ...temperatureRow(b.cells) }))
  assert.equal(tables.length, STACK)

  for (const table of tables) {
    assert.equal(table.cells.length, NMAX)
    // Chaque tableau a son propre ordre croissant — c'est ce qui fait que
    // les trois ne s'alignent pas, et c'est voulu.
    const gaps = table.cells.map((c) => c.gap)
    assert.deepEqual(gaps, [...gaps].sort((a, b) => a - b), `회차 ${table.rang}`)
    assert.equal(table.spans.reduce((a, s) => a + s.count, 0), NMAX)

    // Et les écarts sont bien ceux de son 회차, pas d'un autre.
    const own = new Map(cells(draws, table.rang).map((c) => [c.number, c.gap]))
    for (const cell of table.cells) assert.equal(cell.gap, own.get(cell.number))
  }

  // Les trois ordres diffèrent : sinon il n'y aurait rien à empiler.
  const orders = tables.map((t) => t.cells.map((c) => c.number).join())
  assert.equal(new Set(orders).size, STACK)
  db.close()
})

test('une pile vide ne casse rien', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  // Au tout premier 회차 la pile n'a qu'une entrée, et le tableau se dessine
  // quand même — un seul 회차 plutôt qu'une erreur.
  const one = stack(draws, draws.rangs[0])
  assert.equal(one.length, 1)
  assert.equal(temperatureRow(one[0].cells).cells.length, NMAX)
  db.close()
})

// -------------------------------------------------------------- 모든번호

test('모든번호 — les quatre comptages, rejoués depuis numberpattern', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  // On refait la transformation de l'ancienne vue à partir de la table
  // stockée : `당첨` vaut la cellule précédente + 1, `이월` la cellule
  // d'avant + 2, `(k)이월` + (k + 2). C'est un autre chemin que le mien —
  // eux partent des chaînes enregistrées, moi des tirages.
  const stored = db.prepare('SELECT * FROM customeruser_numberpattern').all()
  const byRang = new Map(stored.map((r) => [Number(r['회차']), r]))
  const rangs = [...byRang.keys()].sort((a, b) => a - b)

  const legacyFor = (n) => {
    const column = rangs.map((r) => String(byRang.get(r)[KOR[n - 1]]))
    const won = new Map()
    const carried = new Map()
    const lost = new Map()
    const bump = (m, v) => m.set(v, (m.get(v) ?? 0) + 1)

    column.forEach((value, i) => {
      const back = value === '당첨' ? 1
        : value === '이월' ? 2
          : /^\((\d)\)이월$/.test(value) ? Number(RegExp.$1) + 2
            : null
      if (back === null) { bump(lost, Number(value)); return }
      // Au tout début de l'historique le pas en arrière sort du tableau ;
      // l'ancienne vue plantait dessus. On saute ces cas plutôt que
      // d'inventer une valeur.
      if (i - back < 0) return
      const v = Number(column[i - back]) + back
      if (!Number.isFinite(v)) return
      bump(value === '당첨' ? won : carried, v)
    })
    return { won, carried, lost }
  }

  let compared = 0
  for (const n of [1, 7, 13, 22, 34, 45]) {
    const mine = numberFlow(draws, n)
    const theirs = legacyFor(n)

    for (const [key, map] of [['won', theirs.won], ['carried', theirs.carried],
      ['lost', theirs.lost]]) {
      for (const [value, count] of map) {
        assert.equal(mine[key][value], count,
          `번호 ${n} · ${key} · 간격 ${value}`)
        compared++
      }
      // Et dans l'autre sens : rien en trop de mon côté.
      assert.equal(Object.keys(mine[key]).length, map.size, `번호 ${n} · ${key}`)
    }
  }
  assert.ok(compared > 200, `${compared} valeurs comparées seulement`)
  db.close()
})

test('모든번호 — une sortie en série compte l\'attente d\'avant, pas 1', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  for (const n of [1, 13, 45]) {
    const { series, won, carried, all, lost } = numberFlow(draws, n)
    assert.equal(series.length, draws.n)

    // Chaque 회차 est là une fois, dans l'ordre.
    assert.deepEqual(series.map((s) => s.rang), [...draws.rangs])

    const runs = series.filter((s) => s.run > 1)
    for (const run of runs) {
      // Le point du test : une sortie en série ne vaut jamais 1 — elle
      // porte l'attente qui précédait le début de la série, plus le rang
      // dans la série. C'est ce que faisait l'original, et c'est ce que
      // j'avais failli remplacer par un simple « 1 ».
      assert.ok(run.value >= 2, `번호 ${n} · 회차 ${run.rang} : ${run.value}`)
    }

    // 전부 통계 = 당첨 + 이월, terme à terme.
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
    assert.equal(sum(all), sum(won) + sum(carried))
    // Et les sorties plus les non-sorties couvrent tout l'historique.
    assert.equal(sum(all) + sum(lost), draws.n)
  }

  assert.throws(() => numberFlow(draws, 0), RangeError)
  assert.throws(() => numberFlow(draws, 46), RangeError)
  db.close()
})

// ------------------------------------------- la série, vue depuis la matrice

// `runs()` est la même information que le drapeau de `cells()`, dans la forme
// de `gaps()`. Si les deux divergeaient, l'onglet 흐름 et l'onglet 패턴
// diraient deux choses différentes du même tirage — exactement ce qu'on
// reproche à l'ancienne plateforme.
test('runs() rend les mêmes drapeaux que cells(), sur tout l’historique',
  { skip }, () => {
    const db = legacyDb()
    const draws = loadDraws(db)

    const WIDTH = NMAX + 1
    const matrix = runsOf(draws, { withBonus: true })

    let checked = 0
    for (let i = 0; i < draws.n; i++) {
      const rang = draws.rangs[i]
      const board = cells(draws, rang)
      for (const cell of board) {
        const run = matrix[i * WIDTH + cell.number]
        assert.equal(runFlag(run), cell.flag,
          `회차 ${rang} · ${cell.number}번 : ${runFlag(run)} ≠ ${cell.flag}`)
        checked++
      }
    }
    assert.equal(checked, draws.n * NMAX)

    // Et sans le bonus, un drapeau ne peut que disparaître, jamais apparaître.
    const bare = runsOf(draws, { withBonus: false })
    for (let k = 0; k < matrix.length; k++) {
      if (bare[k]) assert.ok(matrix[k], `case ${k} : sortie sans bonus mais pas avec`)
    }
    db.close()
  })

// La série et l'écart se répondent : run > 0 ⟺ écart nul.
test('runs() et gaps() s’accordent case par case', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const g = gapsOf(draws, { withBonus: true })
  const r = runsOf(draws, { withBonus: true })
  assert.equal(g.length, r.length)
  for (let k = 0; k < g.length; k++) {
    if (k % (NMAX + 1) === 0) continue         // colonne 0, inutilisée
    assert.equal(r[k] > 0, g[k] === 0, `case ${k}`)
  }
  db.close()
})

// ------------------------------------------------------------ 당첨 위치

// Les sept pages 일 … 보너스 de l'ancien montraient le numéro qui occupe une
// position, 회차 par 회차. `placeFlow` doit rendre exactement la colonne de la
// base — et le comptage doit s'accorder avec `positions()`, qui alimente la
// grille 7 × 45 du même onglet.
test('당첨 위치 — la colonne d’une position est celle de la base', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  const KO = ['일', '이', '삼', '사', '오', '육']
  const rows = db.prepare(
    'SELECT 회차, 일, 이, 삼, 사, 오, 육, 보너스 FROM accountadmin_lottobasedata'
  ).all()
  const byRang = new Map(rows.map((r) => [r['회차'], r]))

  const grid = positionsOf(draws)

  for (let p = 0; p < PLACES; p++) {
    const flow = placeFlow(draws, p)
    assert.equal(flow.series.length, draws.n)

    // Du plus récent au plus ancien, comme le tableau de l'ancien.
    for (let k = 1; k < flow.series.length; k++) {
      assert.ok(flow.series[k].rang < flow.series[k - 1].rang, `위치 ${p} : ordre`)
    }

    const column = p === PICK ? '보너스' : KO[p]
    for (const { rang, value } of flow.series) {
      assert.equal(value, byRang.get(rang)[column], `회차 ${rang} · ${column}`)
    }

    // Le comptage est celui de la grille, terme à terme.
    assert.deepEqual(flow.counts, grid[p], `위치 ${p} : comptage`)

    // Les bornes proposées aux menus 시작패턴 / 종료패턴 sont exactement les
    // valeurs rencontrées — ni plus, ni moins.
    assert.deepEqual(flow.values, Object.keys(grid[p]).map(Number).sort((a, b) => a - b))
    assert.equal(flow.min, flow.values[0])
    assert.equal(flow.max, flow.values.at(-1))
  }

  // Les six positions sont triées : 일 ≤ 이 ≤ … ≤ 육 à chaque 회차. C'est ce
  // qui explique la diagonale de la grille, et rien d'autre.
  const columns = Array.from({ length: PICK }, (_, p) => placeFlow(draws, p).series)
  for (let k = 0; k < draws.n; k++) {
    for (let p = 1; p < PICK; p++) {
      assert.ok(columns[p][k].value > columns[p - 1][k].value,
        `회차 ${columns[p][k].rang} : ${KO[p - 1]} ≥ ${KO[p]}`)
    }
  }

  assert.throws(() => placeFlow(draws, -1), RangeError)
  assert.throws(() => placeFlow(draws, PLACES), RangeError)
  db.close()
})

// 필터 — les 21 pages de l'ancien menu, contre les trois tables qui les
// alimentaient.
//
//   보너스포함 → accountadmin_lottobasedata    (1 134 lignes, sept numéros)
//   1등        → accountadmin_winnerpremiere   (1 134 lignes, six numéros)
//   2등        → accountadmin_winnerseconde    (7 938 lignes = 1 134 × 7)
//
// Dix-huit colonnes stockées, comparées **texte contre texte** : « 5 : 1 »
// doit sortir « 5 : 1 », pas 5. Et dans le même ordre — 회차 décroissant,
// puis l'ordre d'insertion à l'intérieur d'un 회차, qui est celui des sept
// grilles 2등. C'est ce test qui autorise à ne pas réimporter les trois
// tables : elles se recalculent.
test('필터 · les six indicateurs sur les trois populations', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  const COLUMN = {
    total: '총합', low: '저고', odd: '홀짝',
    head: '앞자리수합', tail: '끝자리수합', ac: 'ac값',
  }
  const TABLE = {
    bonus: 'accountadmin_lottobasedata',
    first: 'accountadmin_winnerpremiere',
    second: 'accountadmin_winnerseconde',
  }

  for (const population of Object.keys(TABLE)) {
    const rows = db.prepare(
      `SELECT * FROM ${TABLE[population]} ORDER BY 회차 DESC, id ASC`).all()

    assert.equal(rows.length, rowCount(draws, population),
      `${population} : nombre de grilles`)

    for (const [indicator, column] of Object.entries(COLUMN)) {
      const { series, counts, values, labels, min, max } = filterSeries(draws, population, indicator)
      assert.equal(series.length, rows.length, `${population} · ${indicator} : longueur`)

      const tally = new Map()
      for (let k = 0; k < rows.length; k++) {
        assert.equal(series[k].rang, rows[k]['회차'],
          `${population} · ${indicator} : ordre à la ligne ${k}`)
        assert.equal(series[k].label, String(rows[k][column]).trim(),
          `${population} · ${indicator} · 회차 ${rows[k]['회차']}`)
        tally.set(series[k].label, (tally.get(series[k].label) ?? 0) + 1)
      }

      // Le comptage est bien celui de la suite, et les bornes proposées aux
      // menus 시작패턴 / 종료패턴 sont exactement les valeurs rencontrées —
      // ni plus, ni moins.
      assert.deepEqual(counts,
        Object.fromEntries(values.map((v) => [labels[v], tally.get(labels[v])])),
        `${population} · ${indicator} : comptage`)
      assert.equal(values.length, tally.size)
      assert.equal(min, values[0])
      assert.equal(max, values.at(-1))
    }
  }

  // Les sept grilles 2등 d'un 회차 : la gagnante, puis les six où le 보너스
  // prend la place d'un numéro. Aucune ne doit se répéter, et le 보너스 est
  // toujours le dernier des six.
  const rows = db.prepare(
    'SELECT * FROM accountadmin_winnerseconde ORDER BY 회차 DESC, id ASC').all()
  for (let i = 0, k = 0; i < draws.n; i++, k += 7) {
    const grids = gridsAt(draws, draws.n - 1 - i, 'second')
    assert.equal(grids.length, 7)
    for (let g = 0; g < 7; g++) {
      const stored = ['일', '이', '삼', '사', '오', '육'].map((c) => rows[k + g][c])
      assert.deepEqual(grids[g], stored,
        `2등 회차 ${rows[k + g]['회차']} · grille ${g}`)
    }
  }

  assert.throws(() => filterSeries(draws, 'inconnue', 'total'), RangeError)
  assert.throws(() => filterSeries(draws, 'first', 'inconnu'), RangeError)
  db.close()
})

// ------------------------------------------------- 필터 1등 · les trois pages
//
// Les six autres entrées du groupe 필터 1등 sont vérifiées par le test
// ci-dessus. Restent 배수분석, 10회차1등 et 홀짝저고AC, dont les règles
// viennent de trois vues Django distinctes.
test('배수분석 — les quatre comptes de multiples et leurs trois sommes', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = db.prepare(
    'SELECT * FROM accountadmin_winnerpremiere ORDER BY 회차 ASC').all()

  const { rows: mine, all, odd, pair } = multipleSeries(draws)
  assert.equal(mine.length, rows.length)

  // Les comptes sont stockés en texte — « 2 », pas 2.
  const COLUMN = { 2: '이의배숫자수', 3: '삼의배숫자수', 4: '사의배숫자수', 5: '오의배숫자수' }
  const LIST = { 2: '이의배수', 3: '삼의배수', 4: '사의배수', 5: '오의배수' }

  for (let k = 0; k < rows.length; k++) {
    const stored = rows[k]
    assert.equal(mine[k].rang, stored['회차'], `ordre à la ligne ${k}`)
    for (const m of [2, 3, 4, 5]) {
      assert.equal(mine[k].counts[m], Number(stored[COLUMN[m]]),
        `회차 ${stored['회차']} · multiples de ${m}`)
      // La liste elle-même, telle que Python l'écrivait : « [10, 40] ».
      assert.equal(
        '[' + mine[k].numbers.filter((n) => n % m === 0).join(', ') + ']',
        stored[LIST[m]], `회차 ${stored['회차']} · liste des multiples de ${m}`)
    }
    assert.equal(mine[k].ac, stored['ac값'], `회차 ${stored['회차']} · AC값`)

    // Les trois colonnes calculées de l'ancienne vue.
    const c = mine[k].counts
    assert.equal(mine[k].all, c[2] + c[3] + c[4] + c[5])
    assert.equal(mine[k].odd, c[3] + c[4] + c[5])
    assert.equal(mine[k].pair, c[3] + c[4])
  }

  // Tout multiple de 4 est multiple de 2 : la somme 2+3+4+5 ne peut pas
  // descendre sous le compte des pairs.
  for (const r of mine) assert.ok(r.all >= r.counts[2] + r.counts[4])

  for (const [chart, key] of [[all, 'all'], [odd, 'odd'], [pair, 'pair']]) {
    assert.equal(Object.values(chart).reduce((a, b) => a + b, 0), mine.length,
      `${key} : le comptage totalise les 회차`)
  }
  db.close()
})

test('10회차1등 — la liste des quatorze 회차 précédents', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const { rows, counts } = recentSeries(draws)

  // L'original écartait les 회차 jusqu'à 16 compris.
  assert.equal(rows.length, draws.n - RECENT_FLOOR)
  assert.equal(rows[0].rang, draws.rangs[draws.n - 1])
  assert.equal(rows.at(-1).rang, RECENT_FLOOR + 1)

  // Recalcul indépendant, depuis les lignes brutes plutôt que depuis
  // `Draws` : si les deux tombent d'accord, ce n'est pas la même erreur.
  const raw = new Map()
  for (const r of db.prepare(
    'SELECT * FROM accountadmin_lottobasedata').all()) {
    raw.set(r['회차'], ['일', '이', '삼', '사', '오', '육', '보너스'].map((c) => r[c]))
  }

  for (const row of rows) {
    const bag = []
    for (let vv = 1; vv <= RECENT_SPAN; vv++) bag.push(...raw.get(row.rang - vv))
    const list = [...new Set(bag)].sort((a, b) => a - b)
    assert.deepEqual(row.list, list, `회차 ${row.rang} · 리스트`)
    assert.equal(row.listCount, list.length)
    assert.deepEqual(row.won, row.numbers.filter((n) => list.includes(n)),
      `회차 ${row.rang} · 당첨번호`)
    assert.equal(row.wonCount, row.won.length)

    // Un numéro de 리스트 est premier, composé, ou vaut 1 — jamais autre chose.
    assert.equal(
      row.primeCount + row.compositeCount + (list.includes(1) ? 1 : 0),
      list.length, `회차 ${row.rang} · 소수 + 합성수 + 1`)
    assert.ok(row.wonPrimes.every((n) => row.won.includes(n)))
    assert.ok(row.wonComposites.every((n) => row.won.includes(n)))
  }

  // Le témoin : la ligne 1134 telle que l'ancienne page l'imprimait.
  const witness = rows.find((r) => r.rang === 1134)
  assert.equal(witness.listCount, 39)
  assert.deepEqual(
    Array.from({ length: NMAX }, (_, i) => i + 1).filter((n) => !witness.list.includes(n)),
    [12, 18, 36, 39, 42, 43])
  assert.deepEqual(witness.won, [3, 7, 9, 13, 19, 24])
  assert.equal(witness.primeCount, 13)
  assert.deepEqual(witness.wonPrimes, [3, 7, 13, 19])
  assert.deepEqual(witness.wonComposites, [9, 24])

  // Les quatre barres : aucun 회차 ne reprend moins de trois numéros.
  assert.deepEqual(Object.keys(counts).map(Number).sort((a, b) => a - b), [3, 4, 5, 6])
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), rows.length)

  // Sur une tranche, la liste reste celle de l'historique complet : les
  // quatorze voisins d'un 회차 ne sont pas ceux de la tranche.
  const slice = draws.last(50)
  const partial = recentSeries(draws, slice)
  assert.equal(partial.rows.length, 50)
  assert.deepEqual(partial.rows[0], rows[0])
  db.close()
})

test('홀짝저고AC — le couple, tel que la base le stockait', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = db.prepare(
    'SELECT * FROM accountadmin_winnerpremiere ORDER BY 회차 DESC').all()

  const { rows: mine, counts } = paritySeries(draws)
  assert.equal(mine.length, rows.length)

  for (let k = 0; k < rows.length; k++) {
    assert.equal(mine[k].rang, rows[k]['회차'], `ordre à la ligne ${k}`)
    assert.equal(mine[k].odd, String(rows[k]['홀짝']).trim(), `회차 ${rows[k]['회차']} · 홀짝`)
    assert.equal(mine[k].low, String(rows[k]['저고']).trim(), `회차 ${rows[k]['회차']} · 저고`)
    assert.equal(mine[k].ac, rows[k]['ac값'], `회차 ${rows[k]['회차']} · AC값`)
    assert.equal(mine[k].label, `${mine[k].odd}-${mine[k].low}`)
  }

  // Le comptage est rangé du couple le plus fréquent au plus rare — les
  // clés ne sont pas des entiers, l'ordre d'insertion tient.
  const seen = Object.values(counts)
  assert.deepEqual(seen, [...seen].sort((a, b) => b - a))
  assert.equal(seen.reduce((a, b) => a + b, 0), mine.length)
  db.close()
})

// --------------------------------------------------- 구간 · les douze familles
//
// `customeruser_sectionall` — 1 134 lignes × 60 colonnes de listes en texte —
// n'est pas réimportée. Ce test rejoue ses **68 040 cellules** depuis les
// sept numéros du tirage. Les listes stockées ne sont pas triées (elles
// sortaient d'un `set` Python), la comparaison porte donc sur le contenu.
test('구간 — les 60 colonnes de sectionall, recalculées', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const carry = carryover(draws)

  const SUFFIX = ['일', '십', '이십', '삼십', '사십']
  // Le nom de colonne diffère parfois du libellé du menu.
  const COLUMN = {
    winner: '당첨번호', double: '이의배수', triple: '삼의배수', quad: '사의배수',
    quint: '오의배수', prime: '소수', odd: '홀번호', even: '짝번호',
    low: '저번호', high: '고번호', composite: '합성수', carry: '이월번호',
  }

  const stored = new Map(db.prepare(
    'SELECT * FROM customeruser_sectionall').all().map((r) => [r['회차'], r]))
  assert.equal(stored.size, draws.n)

  const parse = (s) => (!s || s === '[]') ? []
    : s.slice(1, -1).split(', ').map(Number).sort((a, b) => a - b)

  let checked = 0
  for (const family of SECTION_FAMILIES) {
    const column = COLUMN[family.key]
    for (let i = 0; i < draws.n; i++) {
      const rang = draws.rangs[i]
      const cells = sectionCells(draws, i, family.key, carry)
      assert.equal(cells.length, 5)
      for (let s = 0; s < 5; s++) {
        assert.deepEqual(cells[s], parse(stored.get(rang)[column + SUFFIX[s]]),
          `${family.label} · 회차 ${rang} · ${SECTION_LABELS[s]}구간`)
        checked++
      }
    }
    // Les cinq 구간 se partagent la famille sans trou ni recouvrement.
    for (let i = 0; i < draws.n; i++) {
      const cells = sectionCells(draws, i, family.key, carry)
      const flat = cells.flat()
      assert.equal(new Set(flat).size, flat.length)
    }
  }
  assert.equal(checked, draws.n * 12 * 5)

  // 저수 et 고수 se partagent les sept numéros — la frontière de cette page
  // met le 23 en 저, contrairement au ratio 저고.
  for (let i = 0; i < draws.n; i++) {
    const low = sectionCells(draws, i, 'low', carry).flat()
    const high = sectionCells(draws, i, 'high', carry).flat()
    assert.equal(low.length + high.length, FULL)
    assert.ok(low.every((n) => n <= SECTION_LOW_MAX))
    assert.ok(high.every((n) => n > SECTION_LOW_MAX))
  }
  assert.ok(draws.rangs.some((_, i) =>
    sectionCells(draws, i, 'low', carry).flat().includes(23)),
    'le 23 doit tomber en 저 sur cette page')

  db.close()
})

test('구간 — 점멸, les trois comptages et la règle héritée', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  // La règle : vide, ou un seul numéro entre 10 et 19 — dans n'importe
  // quel 구간, pas seulement le 십.
  assert.equal(sectionFlag([]), OFF)
  assert.equal(sectionFlag([13]), OFF)
  assert.equal(sectionFlag([3]), ON)
  assert.equal(sectionFlag([24]), ON)
  assert.equal(sectionFlag([13, 19]), ON)
  assert.equal(sectionFlag([10]), OFF)
  assert.equal(sectionFlag([19]), OFF)

  const s = sectionSeries(draws, 'winner')
  assert.equal(s.rows.length, draws.n)
  assert.equal(s.rows[0].rang, draws.rangs[draws.n - 1])

  // Les trois comptages totalisent bien ce qu'ils doivent.
  assert.equal(Object.values(s.byCount).reduce((a, b) => a + b, 0), draws.n)
  assert.equal(s.patterns.reduce((a, p) => a + p.count, 0), draws.n)
  assert.equal(
    Object.values(s.blanks).reduce((a, b) => a + b, 0),
    s.rows.reduce((a, r) => a + r.cells.filter((c) => c.length === 0).length, 0))

  // Le deuxième comptage ne retient que les 구간 **vides**, le troisième
  // les 점멸 — le second total est donc le plus petit des deux. C'est
  // l'écart de l'original, pas une erreur ici.
  const off = s.rows.reduce((a, r) => a + r.off, 0)
  assert.ok(Object.values(s.blanks).reduce((a, b) => a + b, 0) < off)

  // Les barres vont du plus allumé au plus éteint.
  const lit = s.patterns.map((p) => p.flags.filter((f) => f === ON).length)
  assert.deepEqual(lit, [...lit].sort((a, b) => b - a))
  for (const p of s.patterns) assert.equal(p.flags.length, 5)

  // Sur 당첨번호, sept numéros ne peuvent pas laisser quatre 구간 vides.
  assert.ok(Math.max(...Object.keys(s.byCount).map(Number)) <= 3)

  // Les douze familles rendent toutes les trois comptages.
  for (const f of SECTION_FAMILIES) {
    const r = sectionSeries(draws, f.key)
    assert.equal(r.rows.length, draws.n, f.label)
    assert.equal(Object.keys(r.blanks).length, 5, f.label)
  }
  assert.throws(() => sectionCells(draws, 0, 'inconnue'), RangeError)
  db.close()
})

// ------------------------------------------------- 테이블 · les sept 패턴
//
// `customeruser_predictnumber` — 1 134 lignes × 7 colonnes — n'est pas
// réimportée. Ce test rejoue ses **699 313 entrées** : la liste des 회차
// retenus, leurs sept numéros dans l'ordre d'affichage, et le 당첨여부.
//
// Les listes stockées sortaient d'un `set` Python : 7 785 des 7 938 sont
// dans un ordre de table de hachage. La comparaison porte sur le contenu.
test('테이블 — les 699 313 entrées de predictnumber', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const KOR = ['일', '이', '삼', '사', '오', '육', '보너스']

  const stored = new Map(db.prepare(
    'SELECT * FROM customeruser_predictnumber').all().map((r) => [r['회차'], r]))
  assert.equal(stored.size, draws.n)

  // « [[(1, 5, 13, 34, 39, 40, 11), 2], …] » → [[[1,5,…], 2], …]
  const parse = (s) => {
    if (!s || s === '[]') return []
    return [...s.matchAll(/\((\d+(?:, \d+)*)\), (\d+)\]/g)]
      .map((m) => [m[1].split(', ').map(Number), Number(m[2])])
  }

  let entries = 0
  for (let position = 0; position < FULL; position++) {
    for (let i = 0; i < draws.n; i++) {
      const rang = draws.rangs[i]
      const mine = patternLines(draws, i, position)
      const old = parse(stored.get(rang)[KOR[position]])
      assert.equal(mine.length, old.length,
        `${KOR[position]} · 회차 ${rang} : nombre de lignes`)

      // Même contenu, à l'ordre près — et le 당첨여부 attaché au bon tirage.
      const byKey = new Map(old.map(([n, h]) => [n.join(','), h]))
      for (const line of mine) {
        const key = line.numbers.join(',')
        assert.ok(byKey.has(key),
          `${KOR[position]} · 회차 ${rang} : ${key} absent de l'ancienne liste`)
        assert.equal(line.hits, byKey.get(key),
          `${KOR[position]} · 회차 ${rang} · ${key} : 당첨여부`)
        entries++
      }
    }
  }
  assert.equal(entries, 699_313)
  db.close()
})

test('테이블 — la règle, et ce qui s\'en déduit', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  // Une ligne ne retient qu'un 회차 **antérieur** qui contient le numéro.
  const i = draws.n - 1
  const target = draws.sequenceAt(i)[0]
  const lines = patternLines(draws, i, 0)
  for (const l of lines) {
    assert.ok(l.rang < draws.rangs[i])
    assert.ok(l.numbers.includes(target), `${l.rang} doit contenir ${target}`)
    assert.equal(l.numbers.length, FULL)
  }
  // Le dernier 회차 n'a pas de suivant : rien à compter.
  assert.ok(lines.every((l) => l.hits === 0))
  // Le premier n'a pas de passé.
  assert.equal(patternLines(draws, 0, 0).length, 0)

  // Le 당첨여부 de l'avant-dernier se lit sur le dernier tirage.
  const last = new Set(draws.fullAt(draws.n - 1))
  for (const l of patternLines(draws, draws.n - 2, 3)) {
    assert.equal(l.hits, l.numbers.filter((n) => last.has(n)).length)
  }

  const digest = patternDigest(draws, 0)
  assert.equal(digest.rows.length, draws.n)
  assert.deepEqual([...digest.rows[i]], lines.map((l) => l.hits))

  // La distribution totalise bien toutes les entrées.
  const tally = patternTally(digest)
  assert.equal(Object.values(tally).reduce((a, b) => a + b, 0), digest.entries)

  // Le cumul par ligne s'arrête au 회차 choisi, et la dernière ligne
  // reprend tout l'historique.
  const upTo = lineTally(digest, i)
  assert.equal(upTo.reduce((a, r) => a + r.total, 0), digest.entries)
  assert.ok(lineTally(digest, 0).length <= upTo.length)
  for (const r of upTo) {
    assert.equal(r.counts.reduce((a, b) => a + b, 0), r.total)
    assert.equal(r.counts.length, MAX_HITS + 1)
  }

  // Une ligne suivie dans le temps n'apparaît que là où elle existe.
  const flow = lineFlow(draws, digest, 0)
  assert.equal(flow.length, digest.rows.filter((r) => r.length > 0).length)

  // Les cinq paniers se partagent les lignes, le dernier ramassant 4 et plus.
  const bags = bucketNumbers(lines)
  assert.equal(bags.length, BUCKETS.length)
  assert.deepEqual(bags.map((b) => b.label), BUCKETS)
  for (const b of bags) {
    assert.equal(b.distinct, b.numbers.length)
    const counts = b.numbers.map((x) => x.count)
    assert.deepEqual(counts, [...counts].sort((a, b2) => b2 - a))
  }
  assert.equal(
    bags.reduce((a, b) => a + b.numbers.reduce((s, x) => s + x.count, 0), 0),
    lines.length * FULL)

  assert.throws(() => patternLines(draws, 5, 7), RangeError)
  assert.throws(() => patternDigest(draws, -1), RangeError)
  db.close()
})

// ------------------------------------------- 테이블 · 당첨이월 et son tri
test('당첨이월 — les sept positions, et le partage 제외 / 유지', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const i = draws.n - 2

  // La liste 제외번호 se lit comme le champ d'origine.
  assert.deepEqual(parseExcluded('3, 7, 3, abc, 99, 45'), [3, 7, 45])
  assert.deepEqual(parseExcluded(''), [])
  assert.deepEqual(parseExcluded(null), [])
  assert.deepEqual(parseExcluded('12 5,  40'), [5, 12, 40])

  const excluded = [3, 13, 40]
  const plain = familyLines(draws, i, excluded)
  assert.equal(plain.length, FULL)

  for (const col of plain) {
    // Chaque colonne est bien celle de sa position.
    assert.equal(col.target, draws.sequenceAt(i)[col.key])
    assert.deepEqual(col.lines.map((l) => l.rang),
      patternLines(draws, i, col.key).map((l) => l.rang))

    for (const l of col.lines) {
      // 제외 et 유지 se partagent les sept numéros, sans perte.
      assert.equal(l.dropped.length + l.kept.length, FULL)
      assert.ok(l.dropped.every((n) => excluded.includes(n)))
      assert.ok(l.kept.every((n) => !excluded.includes(n)))
      assert.equal(l.out, l.dropped.length)
      assert.equal(l.missed, FULL - l.hits)
      // Sans tri, la ligne s'affiche telle quelle.
      assert.deepEqual(l.shown, l.numbers)
    }

    // Les deux comptages totalisent les lignes.
    assert.equal(col.hitTally.reduce((a, b) => a + b, 0), col.lines.length)
    assert.equal(col.outTally.reduce((a, b) => a + b, 0), col.lines.length)
    assert.equal(col.hitSum, col.lines.reduce((a, l) => a + l.hits, 0))
  }

  // Sans liste 제외번호, rien n'est exclu.
  for (const col of familyLines(draws, i, [])) {
    assert.equal(col.outSum, 0)
    assert.equal(col.outTally[0], col.lines.length)
  }

  // Le tri : des lignes les plus propres aux plus sales, le numéro de la
  // position en tête, les exclus rejetés à la fin.
  const sorted = familyLines(draws, i, excluded, { sort: true })
  for (const [c, col] of sorted.entries()) {
    const outs = col.lines.map((l) => l.out)
    assert.deepEqual(outs, [...outs].sort((a, b) => a - b), col.label)
    for (const l of col.lines) {
      assert.equal(l.shown.length, FULL)
      assert.deepEqual([...l.shown].sort((a, b) => a - b),
        [...l.numbers].sort((a, b) => a - b))
      assert.equal(l.shown[0], col.target)
      // Les exclus sont rejetés en fin de ligne — sauf le numéro de la
      // position, qui reste en tête même s'il est exclu.
      assert.deepEqual(l.shown.slice(FULL - l.tail), l.dropped.filter((n) => n !== col.target))
      assert.equal(l.tail, l.out - (excluded.includes(col.target) ? 1 : 0))
    }
    // Le tri ne change ni le nombre de lignes ni les comptages.
    assert.equal(col.lines.length, plain[c].lines.length)
    assert.deepEqual(col.hitTally, plain[c].hitTally)
    assert.deepEqual(col.outTally, plain[c].outTally)
  }
  db.close()
})

// -------------------------------------------------- 테이블 · 거리
test('거리 — d\'où viennent les lignes qui touchent, et celles qui ratent', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const i = draws.n - 2                 // l'avant-dernier : il a un 회차 suivant
  const d = familyDistance(draws, i)

  assert.equal(d.rang, draws.rangs[i])
  assert.equal(d.target, draws.rangs[i + 1])
  assert.ok(d.lines > 0)

  // Les deux familles sortent du même vivier et ne se recouvrent pas.
  assert.ok(d.won.lines + d.lost.lines <= d.lines)
  for (const s of [d.won, d.lost]) {
    if (!s.lines) continue
    assert.ok(s.near >= 1 && s.near <= s.median && s.median <= s.far)
  }

  // Les tranches couvrent exactement le vivier, une distance par tranche.
  assert.equal(d.bins.reduce((a, b) => a + b.pool, 0), d.lines)
  assert.equal(d.bins.reduce((a, b) => a + b.won, 0), d.won.lines)
  assert.equal(d.bins.reduce((a, b) => a + b.lost, 0), d.lost.lines)
  for (const b of d.bins) assert.ok(b.won + b.lost <= b.pool)

  // La fenêtre annoncée est bien un sous-ensemble.
  assert.ok(d.window.pool <= d.lines && d.window.won <= d.window.pool)
  assert.ok(DISTANCE_WINDOW.lo < DISTANCE_WINDOW.hi)

  // Le vivier est celui des sept colonnes, dédoublonné : un 회차 qui tient
  // deux des numéros du 회차 choisi n'y figure qu'une fois.
  const union = new Set()
  for (const col of familyLines(draws, i, [])) for (const l of col.lines) union.add(l.rang)
  assert.equal(d.lines, union.size)

  assert.equal(d.upcoming, false)

  // Le dernier 회차 : le tirage cible n'existe pas encore, mais son numéro si.
  // Les familles sont vides, le vivier et les distances sont bien là.
  const last = familyDistance(draws, draws.n - 1)
  assert.equal(last.upcoming, true)
  assert.equal(last.target, draws.rangs[draws.n - 1] + 1)
  assert.equal(last.won.lines, 0)
  assert.equal(last.lost.lines, last.lines)     // aucun numéro connu → tout à 0
  assert.ok(last.lines > 0)
  assert.equal(last.bins.reduce((a, b) => a + b.pool, 0), last.lines)
  db.close()
})

// -------------------------------------------------- 테이블 · 테이블리스트
test('테이블리스트 — les 45 cellules pivotées en colonnes', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  // `allCells` fait en une passe ce que `cells()` refait à chaque appel.
  const rows = allCells(draws)
  assert.equal(rows.length, draws.n)
  for (const rang of [draws.rangs[1], draws.rangs[7], draws.rangs[500],
                      draws.rangs[draws.n - 1]]) {
    const mine = rows[draws.indexOf(rang)]
    const ref = cells(draws, rang)
    assert.equal(mine.length, NMAX)
    for (let k = 0; k < NMAX; k++) {
      assert.equal(mine[k].number, ref[k].number)
      assert.equal(mine[k].gap, ref[k].gap, `회차 ${rang} · ${k + 1} · écart`)
      assert.equal(mine[k].flag, ref[k].flag, `회차 ${rang} · ${k + 1} · drapeau`)
    }
  }

  // Et contre l'ancienne table, texte pour texte.
  const stored = db.prepare(
    'SELECT * FROM customeruser_numberpattern ORDER BY 회차 ASC').all()
  assert.equal(stored.length, draws.n)
  for (let i = 0; i < draws.n; i++) {
    for (let k = 0; k < NMAX; k++) {
      assert.equal(legacyValue(rows[i][k]), String(stored[i][KOR[k]]).trim(),
        `회차 ${draws.rangs[i]} · ${k + 1}`)
    }
  }

  // Les colonnes : 당첨 d'abord, puis les écarts croissants, et les 45
  // numéros s'y retrouvent une fois et une seule.
  const i = draws.n - 2
  const board = boardColumns(rows[i], draws.fullAt(i + 1))
  assert.equal(board.columns[0].label, '당첨')
  assert.equal(board.columns[0].entries.length, FULL)
  const keys = board.columns.slice(1).map((c) => Number(c.label))
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b))
  const flat = board.columns.flatMap((c) => c.entries.map((e) => e.number))
  assert.equal(flat.length, NMAX)
  assert.equal(new Set(flat).size, NMAX)
  assert.ok(board.height >= MIN_HEIGHT)
  assert.equal(board.height,
    Math.max(MIN_HEIGHT, ...board.columns.map((c) => c.entries.length)))

  // Chaque pile est rangée par numéro croissant.
  for (const col of board.columns) {
    const ns = col.entries.map((e) => e.number)
    assert.deepEqual(ns, [...ns].sort((a, b) => a - b))
  }
  // `hit` marque les sept numéros du 회차 suivant, ni plus ni moins.
  const marked = board.columns.flatMap((c) => c.entries.filter((e) => e.hit))
  assert.deepEqual(marked.map((e) => e.number).sort((a, b) => a - b),
    [...draws.fullAt(i + 1)].sort((a, b) => a - b))
  // Sans 회차 suivant, rien n'est marqué.
  assert.equal(boardColumns(rows[i]).columns
    .flatMap((c) => c.entries).filter((e) => e.hit).length, 0)

  db.close()
})

test('테이블리스트 — les cinq comptages, sur le 회차 suivant', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = allCells(draws)
  const s = tableListStats(draws, rows)

  // Le 회차 le plus récent n'a pas de suivant : il est écarté.
  assert.equal(s.perRang.length, draws.n - 1)
  assert.equal(s.perRang[0].rang, draws.rangs[0])
  assert.equal(s.perRang.at(-1).rang, draws.rangs[draws.n - 2])

  for (const r of s.perRang) {
    // 위 + 아래 = les sept numéros ; 시작 + 중간 + 끝 aussi.
    assert.equal(r.up + r.down, FULL, `회차 ${r.rang} · 위/아래`)
    assert.equal(r.start + r.middle + r.end, FULL, `회차 ${r.rang} · 시작/중간/끝`)
  }

  for (const [name, tally] of Object.entries(s)) {
    if (name === 'perRang') continue
    assert.equal(Object.values(tally).reduce((a, b) => a + b, 0), draws.n - 1, name)
    const keys = Object.keys(tally).map(Number)
    assert.deepEqual(keys, [...keys].sort((a, b) => a - b), name)
    assert.ok(keys.every((k) => k >= 0 && k <= FULL), name)
  }

  // Recalcul indépendant d'un 회차, depuis `cells()` plutôt que `allCells`.
  const i = 800
  const row = cells(draws, draws.rangs[i])
  const next = [...draws.fullAt(i + 1)]
  let start = 0, middle = 0, end = 0, up = 0
  for (const n of next) {
    const cell = row[n - 1]
    if (cell.flag || cell.gap < 6) start++
    else if (cell.gap <= 10) middle++
    else end++
    const value = legacyValue(cell)
    const rank = 1 + row.slice(0, n - 1).filter((c) => legacyValue(c) === value).length
    if (rank < 4) up++
  }
  const r = s.perRang[i]
  assert.equal(r.start, start)
  assert.equal(r.middle, middle)
  assert.equal(r.end, end)
  assert.equal(r.up, up)
  assert.equal(r.down, FULL - up)
  db.close()
})

test('테이블리스트 — le bandeau de listes et les deux tirages', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  // Quinze listes, telles que l'ancienne carte les écrivait — 홀수 et 짝수
  // remises à l'endroit.
  assert.equal(REFERENCE_LISTS.length, 15)
  const byKey = Object.fromEntries(REFERENCE_LISTS.map((l) => [l.key, l]))
  assert.deepEqual(byKey.quad.numbers, [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44])
  assert.deepEqual(byKey.quint.numbers, [5, 10, 15, 20, 25, 30, 35, 40, 45])
  assert.deepEqual(byKey.low.numbers.at(-1), 22)
  assert.deepEqual(byKey.high.numbers[0], 23)
  assert.equal(byKey.odd.numbers[0], 1, '홀수 doit commencer par 1')
  assert.equal(byKey.even.numbers[0], 2, '짝수 doit commencer par 2')
  assert.deepEqual(byKey.s5.numbers, [40, 41, 42, 43, 44, 45])
  assert.deepEqual(byKey.prime.numbers, PRIMES)
  // 저수 + 고수 et 홀수 + 짝수 couvrent chacun les 45 numéros, sans recouvrement.
  for (const [a, b] of [['low', 'high'], ['odd', 'even'], ['prime', 'composite']]) {
    const all = [...byKey[a].numbers, ...byKey[b].numbers]
    assert.equal(new Set(all).size, all.length, `${a}/${b} : pas de recouvrement`)
  }

  // 반복 수 : le comptage couvre les 45 cellules.
  const rows = allCells(draws)
  for (const i of [3, 100, draws.n - 1]) {
    const tally = repeatTally(rows[i])
    assert.equal(tally.reduce((a, t) => a + t.count, 0), NMAX)
    assert.equal(tally.filter((t) => t.flag).reduce((a, t) => a + t.count, 0), FULL)
    // 당첨 en tête, puis les écarts croissants.
    const gaps = tally.filter((t) => !t.flag).map((t) => Number(t.label))
    assert.deepEqual(gaps, [...gaps].sort((a, b) => a - b))
  }

  // Les deux tirages : stables pour un 회차, et bien disjoints.
  for (const rang of [1, 500, 1134]) {
    const a = sampleLists(rang)
    const b = sampleLists(rang)
    assert.deepEqual(a, b, 'le même 회차 doit rendre le même tirage')
    assert.equal(a.five.length, 5)
    assert.equal(a.thirtyFive.length, 35)
    const all = [...a.five, ...a.thirtyFive]
    assert.equal(new Set(all).size, 40)
    assert.ok(all.every((n) => n >= 1 && n <= NMAX))
  }
  assert.notDeepEqual(sampleLists(1).five, sampleLists(2).five)
  db.close()
})

// --------------------------------------------------- 테이블 · 제외번호 통계
test('제외번호 — les 50 580 cases de deletenumber', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = deletedRows(draws)

  // L'ancienne table commençait au 회차 11 : dix prédécesseurs, pas moins.
  assert.equal(rows.length, draws.n - WINDOW)
  assert.equal(rows[0].rang, draws.rangs[WINDOW])

  // Les colonnes « n합 » sont rangées derrière la colonne « n » qui porte le
  // numéro — l'ordre des colonnes n'est pas celui des numéros.
  const info = db.prepare('PRAGMA table_info(customeruser_deletenumber)').all()
  const names = info.map((c) => c.name)
  const pairs = []
  for (let k = 1; k < names.length; k++) {
    if (names[k].endsWith('합') && !names[k - 1].endsWith('합')) {
      pairs.push([names[k - 1], names[k]])
    }
  }
  assert.equal(pairs.length, NMAX)

  const stored = new Map(db.prepare(
    'SELECT * FROM customeruser_deletenumber').all().map((r) => [r['회차'], r]))
  assert.equal(stored.size, rows.length)

  let cases = 0
  for (const row of rows) {
    const old = stored.get(row.rang)
    assert.ok(old, `회차 ${row.rang} absent de l'ancienne table`)
    for (const [numberCol, sumCol] of pairs) {
      const n = old[numberCol]
      assert.equal(row.counts[n], old[sumCol], `회차 ${row.rang} · 번호 ${n}`)
      cases++
    }
    // Dix tirages de sept numéros : les comptages totalisent soixante-dix.
    assert.equal([...row.counts].reduce((a, b) => a + b, 0), WINDOW * FULL)
  }
  assert.equal(cases, rows.length * NMAX)
  db.close()
})

test('제외번호 — les trois comptages, gagnants et perdants', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = deletedRows(draws)
  const t = deletedTallies(draws, rows)

  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0)
  assert.equal(total(t.all), rows.length * NMAX)
  assert.equal(total(t.won), rows.length * FULL)
  assert.equal(total(t.lost), rows.length * (NMAX - FULL))

  // 당첨 + 제외 = 전부, valeur par valeur.
  for (const v of Object.keys(t.all)) {
    assert.equal((t.won[v] ?? 0) + (t.lost[v] ?? 0), t.all[v], `valeur ${v}`)
  }

  // Les clés montent, et aucune ne dépasse dix sorties en dix tirages.
  const keys = Object.keys(t.all).map(Number)
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b))
  assert.ok(Math.max(...keys) <= WINDOW)
  assert.equal(peakCount(rows), Math.max(...keys))

  // Recalcul indépendant d'un 회차 : le comptage porte bien sur les dix
  // 회차 **précédents**, bonus compris, et pas sur celui-ci.
  const i = 500
  const row = rows.find((r) => r.index === i)
  const seen = new Map()
  for (let k = i - WINDOW; k < i; k++) {
    for (const n of draws.fullAt(k)) seen.set(n, (seen.get(n) ?? 0) + 1)
  }
  for (let n = 1; n <= NMAX; n++) assert.equal(row.counts[n], seen.get(n) ?? 0)

  // Le 45 est bien partagé comme les autres — l'original l'oubliait.
  let fortyFiveWon = 0
  for (const r of rows) {
    if ([...draws.fullAt(r.index)].includes(45)) fortyFiveWon++
  }
  assert.ok(fortyFiveWon > 0, 'le 45 sort bien de temps en temps')
  db.close()
})

// ------------------------------------------------ 리스트 · les onze familles
//
// Les colonnes de `lottobasedata` — la liste, le 숫자수 et le 숫자합 de
// chaque famille — sont comparées **texte contre texte** aux listes
// recalculées. C'est ce test qui autorise à ne pas les réimporter.
test('리스트 — les onze familles contre lottobasedata', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const carry = carryover(draws)

  // La colonne qui porte la liste, et celles du compte et de la somme quand
  // l'ancienne base les stockait.
  const COLUMN = {
    double: ['이의배수', '이의배숫자수', '이의배수합'],
    triple: ['삼의배수', '삼의배숫자수', '삼의배수합'],
    quad: ['사의배수', '사의배숫자수', '사의배수합'],
    quint: ['오의배수', '오의배숫자수', '오의배수합'],
    prime: ['소수', '소수숫자수', '소수합'],
    composite: ['합성수', '합성숫자수', '함성수합'],
    odd: ['홀번호', null, null],
    even: ['짝번호', null, null],
    low: ['저번호', null, null],
    high: ['고번호', null, null],
    carry: ['전회차이월번호', null, '전회차이월번호합'],
  }
  assert.equal(LIST_FAMILIES.length, 11)
  assert.deepEqual(LIST_FAMILIES.map((f) => f.key).sort(),
    Object.keys(COLUMN).sort())

  const stored = new Map(db.prepare(
    'SELECT * FROM accountadmin_lottobasedata').all().map((r) => [r['회차'], r]))

  let checked = 0
  for (const f of LIST_FAMILIES) {
    const [listCol, countCol, sumCol] = COLUMN[f.key]
    const s = listSeries(draws, f.key, carry)
    assert.equal(s.rows.length, draws.n, f.label)
    assert.equal(s.rows[0].rang, draws.rangs[draws.n - 1], `${f.label} : ordre`)

    // Les listes stockées sortaient d'un `set` Python : leur ordre est celui
    // d'une table de hachage, pas celui des numéros. On compare le contenu.
    const parse = (v) => {
      const t = String(v).trim()
      return t === '[]' ? [] : t.slice(1, -1).split(', ').map(Number).sort((a, b) => a - b)
    }
    for (const row of s.rows) {
      const old = stored.get(row.rang)
      assert.deepEqual(row.numbers, parse(old[listCol]),
        `${f.label} · 회차 ${row.rang} : la liste`)
      if (countCol) {
        assert.equal(row.count, Number(old[countCol]),
          `${f.label} · 회차 ${row.rang} : 숫자수`)
      }
      if (sumCol) {
        assert.equal(row.sum, Number(old[sumCol]),
          `${f.label} · 회차 ${row.rang} : 숫자합`)
      }
      // La somme est bien celle de la liste, et le compte sa longueur.
      assert.equal(row.sum, row.numbers.reduce((a, n) => a + n, 0))
      assert.equal(row.count, row.numbers.length)
      checked++
    }
  }
  assert.equal(checked, draws.n * 11)
  db.close()
})

test('리스트 — les quatre comptages d\'une famille', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const s = listSeries(draws, 'double')

  // Chaque membre de la famille a sa case, même s'il n'est jamais sorti.
  const members = familyMembers('double')
  assert.deepEqual(members, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26,
    28, 30, 32, 34, 36, 38, 40, 42, 44])
  assert.equal(Object.keys(s.members).length, members.length)
  assert.deepEqual(Object.keys(s.members).map((k) => Number(k.replace('번', ''))).sort((a, b) => a - b),
    members)
  // Rangés du plus sorti au moins sorti — l'étiquette « 24번 » n'est pas un
  // entier, l'ordre d'insertion tient.
  const counts = Object.values(s.members)
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a))
  // Le total des sorties = la somme des 숫자수.
  assert.equal(counts.reduce((a, b) => a + b, 0),
    s.rows.reduce((a, r) => a + r.count, 0))

  // Les combinaisons : chacune une fois, et le total retombe sur les 회차.
  assert.equal(s.combos.reduce((a, c) => a + c.count, 0), draws.n)
  assert.equal(new Set(s.combos.map((c) => c.label)).size, s.combos.length)
  const comboCounts = s.combos.map((c) => c.count)
  assert.deepEqual(comboCounts, [...comboCounts].sort((a, b) => b - a))

  // Les deux distributions totalisent les 회차, clés croissantes.
  for (const tallyName of ['counts', 'sums']) {
    const t = s[tallyName]
    assert.equal(Object.values(t).reduce((a, b) => a + b, 0), draws.n, tallyName)
    const keys = Object.keys(t).map(Number)
    assert.deepEqual(keys, [...keys].sort((a, b) => a - b), tallyName)
  }

  // Le flux va du plus ancien au plus récent, une valeur par 회차.
  assert.equal(s.flow.length, draws.n)
  assert.equal(s.flow[0].rang, draws.rangs[0])
  assert.equal(s.flow.at(-1).rang, draws.rangs[draws.n - 1])

  // 저수 et 고수 se partagent les sept numéros — le 23 tombe en 저.
  const low = listSeries(draws, 'low')
  const high = listSeries(draws, 'high')
  for (let k = 0; k < draws.n; k++) {
    assert.equal(low.rows[k].count + high.rows[k].count, FULL)
    assert.equal(low.rows[k].sum + high.rows[k].sum,
      [...draws.fullAt(draws.n - 1 - k)].reduce((a, n) => a + n, 0))
  }
  assert.ok(familyMembers('low').includes(23))
  assert.ok(!familyMembers('high').includes(23))

  // 이월차번호 : n'importe quel numéro peut être repris.
  assert.equal(familyMembers('carry').length, NMAX)
  assert.equal(listSeries(draws, 'carry').rows[draws.n - 1].count, 0,
    'le premier 회차 ne reprend rien')

  assert.throws(() => listSeries(draws, 'inconnue'), RangeError)
  assert.throws(() => familyMembers('winner'), RangeError)
  db.close()
})


// ------------------------------------------- 차가운번호/뜨거운번호, onze pages

test('la température d\'une case, c\'est son écart', { skip }, () => {
  // L'ancien code la calculait en quatre branches selon le drapeau : 당첨
  // prenait « la valeur du 회차 précédent plus un », 이월 prenait 1, une case
  // vide prenait son écart. On rejoue ces branches sur les cellules stockées
  // et on vérifie qu'elles retombent toutes sur `cell.gap`.
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = db.prepare(
    `SELECT 회차, ${KOR.join(', ')} FROM customeruser_numberpattern ORDER BY 회차`
  ).all()
  const cellRows = allCells(draws)

  let checked = 0
  let carryBug = 0
  for (let i = 0; i < rows.length; i++) {
    const idx = draws.indexOf(rows[i]['회차'])
    if (idx < 0) continue
    for (let k = 0; k < NMAX; k++) {
      const raw = String(rows[i][KOR[k]])
      let legacy
      if (raw === '당첨') legacy = i === 0 ? 1 : Number(rows[i - 1][KOR[k]]) + 1
      else if (raw === '(1)이월') { carryBug++; continue }   // le bug, écarté
      else if (raw.endsWith('이월')) legacy = 1
      else legacy = Number(raw)

      assert.equal(legacy, cellRows[idx][k].gap,
        `회차 ${rows[i]['회차']} · ${k + 1}번 · « ${raw} »`)
      checked++
    }
  }
  assert.ok(checked > 50000, `${checked} cellules seulement`)
  assert.ok(carryBug > 0, 'aucun (1)이월 dans la base ?')
  db.close()
})

test('les onze familles ont exactement les numéros des onze pages', () => {
  assert.equal(HOTCOLD_FAMILIES.length, 11)
  const by = (k) => familyNumbers(k)

  assert.equal(by('all').length, NMAX)
  assert.deepEqual(by('double'), [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26,
    28, 30, 32, 34, 36, 38, 40, 42, 44])
  assert.deepEqual(by('triple'), [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45])
  assert.deepEqual(by('quad'), [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44])
  assert.deepEqual(by('quint'), [5, 10, 15, 20, 25, 30, 35, 40, 45])
  assert.deepEqual(by('prime'), PRIMES)
  assert.equal(by('composite').length, 30)
  assert.equal(by('odd').length, 23)
  assert.equal(by('even').length, 22)

  // Ces pages-ci mettent le 23 en 고 — pas comme 구간 et 리스트.
  assert.equal(HOTCOLD_LOW_MAX, 22)
  assert.ok(!by('low').includes(23))
  assert.ok(by('high').includes(23))
  assert.equal(by('low').length + by('high').length, NMAX)

  assert.throws(() => familyNumbers('inconnue'), RangeError)
})

test('les quatre bandes se partagent la famille, sans trou ni doublon', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const cellRows = allCells(draws)

  for (const fam of HOTCOLD_FAMILIES) {
    const members = familyNumbers(fam.key)
    for (const i of [0, 1, 17, 500, draws.n - 2, draws.n - 1]) {
      const nxt = i + 1 < draws.n ? draws.fullAt(i + 1) : null
      const row = hotColdRow(cellRows[i], fam.key, nxt)

      const seen = row.groups.flatMap((g) => g.entries.map((e) => e.number))
      assert.equal(seen.length, members.length, `${fam.label} · ${i}`)
      assert.deepEqual([...seen].sort((a, b) => a - b), members, `${fam.label} · ${i}`)

      // Dans chaque bande : écart croissant, puis numéro croissant.
      for (const g of row.groups) {
        const keys = g.entries.map((e) => [e.gap, e.number])
        assert.deepEqual(keys, [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]))
        for (const e of g.entries) {
          assert.equal(bandOf(e.gap), g.key, `${fam.label} · ${e.number}번`)
        }
      }

      // La règle des positions couvre exactement les colonnes dessinées —
      // pas 1 à 45 en dur, comme le faisait l'ancien sur toutes les familles.
      const width = row.groups.reduce(
        (w, g) => w + Math.max(1, g.entries.length), 0)
      assert.deepEqual(row.slots, Array.from({ length: width }, (_, k) => k + 1),
        `${fam.label} · ${i}`)
      assert.ok(row.slots.length >= members.length, fam.label)

      // Les sortants de la famille se répartissent entre les quatre bandes.
      const drawn = row.groups.reduce((a, g) => a + g.drawn, 0)
      const here = new Set(draws.fullAt(i))
      assert.equal(drawn, members.filter((n) => here.has(n)).length,
        `${fam.label} · ${i}`)
      assert.ok(row.height >= HC_MIN)
    }
  }
  db.close()
})

test('라인통계 — 당첨 + 이월 + 꽝 fait le compte des 회차', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const cellRows = allCells(draws)

  const all = hotColdSeries(draws, 'all', cellRows)
  assert.equal(all.lines.length, NMAX)

  let won = 0
  let carried = 0
  for (const l of all.lines) {
    assert.equal(l.won + l.carried + l.blank, draws.n, `${l.number}번`)
    won += l.won
    carried += l.carried
  }
  // Chaque 회차 sort sept numéros, chacun 당첨 ou 이월.
  assert.equal(won + carried, draws.n * FULL)

  // Le 이월 se lit aussi dans les tirages : un numéro repris du 회차 d'avant.
  let expected = 0
  for (let i = 1; i < draws.n; i++) {
    if (draws.rangs[i - 1] !== draws.rangs[i] - 1) continue
    const prev = new Set(draws.fullAt(i - 1))
    for (const n of draws.fullAt(i)) if (prev.has(n)) expected++
  }
  assert.equal(carried, expected)

  // Les quatre distributions comptent chacune tous les 회차, clés croissantes.
  assert.equal(all.bands.length, 4)
  for (const b of all.bands) {
    assert.equal(Object.values(b.counts).reduce((a, c) => a + c, 0), draws.n, b.label)
    const keys = Object.keys(b.counts).map(Number)
    assert.deepEqual(keys, [...keys].sort((a, b2) => a - b2), b.label)
  }

  // À chaque 회차, les quatre bandes se partagent les 45 numéros.
  assert.equal(all.flow.length, draws.n)
  for (const f of all.flow) {
    assert.equal(HC_BANDS.reduce((a, b) => a + f[b.key], 0), NMAX, `회차 ${f.rang}`)
  }

  // 저수 et 고수 se partagent la famille 모든번호.
  const low = hotColdSeries(draws, 'low', cellRows)
  const high = hotColdSeries(draws, 'high', cellRows)
  assert.equal(low.lines.length + high.lines.length, NMAX)
  for (let i = 0; i < draws.n; i++) {
    for (const b of HC_BANDS) {
      assert.equal(low.flow[i][b.key] + high.flow[i][b.key], all.flow[i][b.key])
    }
  }
  db.close()
})


// ------------------------------------------ 테이블리스트 HL, les dix chiffres

test('la valeur d\'une case se compte depuis la sortie d\'avant la série', { skip }, () => {
  // L'ancien l'écrivait en sept branches : `+1` pour 당첨, `+2` pour 이월,
  // `+3` pour `(1)이월`… Toutes reviennent à la même soustraction.
  const db = legacyDb()
  const draws = loadDraws(db)
  const rows = db.prepare(
    `SELECT 회차, ${KOR.join(', ')} FROM customeruser_numberpattern ORDER BY 회차`
  ).all()
  const cells = hlCells(draws)

  let checked = 0
  for (let i = 1; i < rows.length; i++) {
    const idx = draws.indexOf(rows[i]['회차'])
    if (idx < 1) continue
    for (let k = 0; k < NMAX; k++) {
      const raw = String(rows[i][KOR[k]])
      const cell = cells[idx][k]
      // La règle de l'ancien : remonter de `run` 회차 et ajouter `run`.
      let legacy
      if (raw === '당첨') legacy = Number(rows[i - 1][KOR[k]]) + 1
      else if (raw.endsWith('이월')) {
        const run = raw === '이월' ? 2 : Number(raw.slice(1, raw.indexOf(')'))) + 2
        if (i - run < 0) continue
        const back = rows[i - run][KOR[k]]
        if (!/^\d+$/.test(String(back))) continue    // la série remonte plus loin
        legacy = Number(back) + run
      } else legacy = Number(raw)

      assert.equal(legacy, cell.value,
        `회차 ${rows[i]['회차']} · ${k + 1}번 · « ${raw} »`)
      checked++
    }
  }
  assert.ok(checked > 50000, `${checked} cellules seulement`)
  db.close()
})

test('les trois comptages d\'un numéro totalisent les 회차', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const cells = hlCells(draws)
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0)

  for (const count of [1, 17, 500, draws.n]) {
    const history = hlHistory(cells, count)
    for (let n = 1; n <= NMAX; n++) {
      const h = history[n]
      assert.equal(sum(h.won) + sum(h.carry) + sum(h.blank), count, `${n}번 · ${count}`)
      assert.equal(h.total, count, `${n}번 · ${count}`)
      // Un 이월 vaut au moins 3 : la sortie qui ouvre la série vaut au moins
      // 2, et le 이월 qui suit ajoute un.
      for (const v of h.carry.keys()) assert.ok(v >= 3, `${n}번 · 이월 ${v}`)
    }
  }

  // 당첨 + 이월 par numéro = ses sorties réelles, bonus compris.
  const history = hlHistory(cells, draws.n)
  const seen = new Int32Array(NMAX + 1)
  for (let i = 0; i < draws.n; i++) for (const n of draws.fullAt(i)) seen[n]++
  for (let n = 1; n <= NMAX; n++) {
    assert.equal(sum(history[n].won) + sum(history[n].carry), seen[n], `${n}번`)
  }
  db.close()
})

test('미래위치 vaut la valeur de la case, plus un', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const cells = hlCells(draws)
  const i = draws.n - 1
  const board = hlBoard(cells, i, hlHistory(cells, i + 1), null)

  const seen = new Set()
  for (const c of board.columns) {
    for (const e of c.entries) {
      seen.add(e.number)
      assert.equal(e.digits.future, e.value + 1, `${e.number}번`)
      // Les trois 위치합 se somment dans le 전부 위치합.
      assert.equal(e.digits.all, e.digits.won + e.digits.carry + e.digits.blank)
      // Et les trois 합계 dans le 전부 통계.
      assert.equal(e.digits.total,
        e.digits.wonTotal + e.digits.carryTotal + e.digits.blankTotal, `${e.number}번`)
      // La 이월 리스트 rend bien le 이월 합계.
      assert.equal(e.digits.carryList.reduce((a, [, c2]) => a + c2, 0),
        e.digits.carryTotal, `${e.number}번`)
    }
  }
  assert.equal(seen.size, NMAX, 'les 45 numéros sont sur le damier')

  // Une case sortie se lit sur le passé d'avant sa série ; une case vide sur
  // tout le passé, celui du 회차 courant compris.
  for (const c of board.columns) {
    for (const e of c.entries) {
      if (e.flag) assert.ok(e.digits.total < draws.n, `${e.number}번 sorti`)
      else assert.equal(e.digits.total, draws.n, `${e.number}번 vide`)
    }
  }
  assert.ok(board.height >= 7)
  db.close()
})

test('제외번호 marque le plus faible et le plus fort de chaque 미래위치', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const cells = hlCells(draws)
  const i = draws.n - 1
  const board = hlBoard(cells, i, hlHistory(cells, i + 1), null)

  const groups = new Map()
  for (const c of board.columns) {
    for (const e of c.entries) {
      if (!groups.has(e.digits.future)) groups.set(e.digits.future, [])
      groups.get(e.digits.future).push(e)
    }
  }
  for (const [future, group] of groups) {
    const lows = group.filter((e) => e.mark === 'low')
    const highs = group.filter((e) => e.mark === 'high')
    if (group.length === 1 || new Set(group.map((e) => e.digits.won)).size === 1) {
      // Rien à départager : aucun marquage.
      assert.equal(lows.length + highs.length, 0, `미래위치 ${future}`)
      continue
    }
    assert.equal(lows.length, 1, `미래위치 ${future}`)
    assert.equal(highs.length, 1, `미래위치 ${future}`)
    const values = group.map((e) => e.digits.won)
    assert.equal(lows[0].digits.won, Math.min(...values), `미래위치 ${future}`)
    assert.equal(highs[0].digits.won, Math.max(...values), `미래위치 ${future}`)
  }
  db.close()
})

test('라인 통계 — 당첨 et 꽝 se partagent les 45 numéros', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const s = hlLineStats(draws)
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0)
  const spans = draws.n - 1

  // Sept sortants et trente-huit absents, à chacun des 회차 mesurés.
  assert.equal(total(s.wonVertical), spans * FULL)
  assert.equal(total(s.wonHorizontal), spans * FULL)
  assert.equal(total(s.lostVertical), spans * (NMAX - FULL))
  assert.equal(total(s.lostHorizontal), spans * (NMAX - FULL))

  // Les cinq découpages comptent des 회차, pas des numéros.
  for (const key of ['up', 'down', 'start', 'middle', 'end']) {
    assert.equal(total(s[key]), spans, key)
    const keys = Object.keys(s[key]).map(Number)
    assert.deepEqual(keys, [...keys].sort((a, b) => a - b), key)
  }

  // up + down = sept, et start + middle + end = sept, à chaque 회차 :
  // les moyennes doivent donc se compléter.
  const mean = (o) => Object.entries(o)
    .reduce((a, [v, c]) => a + Number(v) * c, 0) / spans
  assert.ok(Math.abs(mean(s.up) + mean(s.down) - FULL) < 1e-9)
  assert.ok(Math.abs(mean(s.start) + mean(s.middle) + mean(s.end) - FULL) < 1e-9)

  // Un rang horizontal vaut au moins 1 ; une valeur verticale au moins 0.
  assert.ok(Math.min(...Object.keys(s.wonHorizontal).map(Number)) >= 1)
  assert.ok(Math.min(...Object.keys(s.wonVertical).map(Number)) >= 0)
  db.close()
})

// ──────────────────────────────────────────────────── le 회차 à venir

// C'est la carte qui sert à décider : toutes les autres disent ce qui *était*
// en attente, celle-ci dit ce qui l'est **maintenant**. Il faut donc qu'elle
// soit exacte, et surtout qu'elle ne porte aucune trace d'un tirage qui n'a
// pas eu lieu — un 당첨 sur un 회차 non tiré serait une invention.

test('le 회차 à venir suit le dernier connu', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)

  assert.equal(nextRang(draws), draws.rangs[draws.n - 1] + 1)

  const row = nextCells(draws)
  assert.equal(row.length, NMAX)
  // Rien n'est sorti : aucune case ne peut porter 당첨 ni 이월.
  assert.ok(row.every((c) => c.flag === null))
  assert.deepEqual(row.map((c) => c.number),
    Array.from({ length: NMAX }, (_, k) => k + 1))

  // Les sept numéros du dernier tirage attendent depuis un 회차, et eux seuls.
  const last = new Set([...draws.fullAt(draws.n - 1)])
  for (const cell of row) {
    assert.equal(cell.gap === 1, last.has(cell.number), `${cell.number}번`)
  }

  // Et chaque écart vaut bien la distance à la dernière sortie.
  const seen = new Map()
  for (let i = 0; i < draws.n; i++) {
    for (const n of draws.fullAt(i)) seen.set(n, draws.rangs[i])
  }
  for (const cell of row) {
    // Un numéro jamais sorti compte depuis le début, comme dans `allCells`.
    assert.equal(cell.gap, nextRang(draws) - (seen.get(cell.number) ?? 0),
      `${cell.number}번`)
  }

  db.close()
})

test('la carte à venir se dessine comme les autres, sans les drapeaux', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const row = nextCells(draws)

  // 반복 수 : que des écarts, aucun 당첨 ni 이월, et les 45 numéros comptés.
  const tally = repeatTally(row)
  assert.ok(tally.every((t) => !t.flag))
  assert.equal(tally.reduce((a, t) => a + t.count, 0), NMAX)

  // 회차별 번호 : la colonne 당첨 existe mais reste vide, et les 45 numéros
  // se retrouvent tous dans les colonnes d'écart.
  const board = boardColumns(row, null)
  assert.equal(board.columns[0].key, 'won')
  assert.equal(board.columns[0].entries.length, 0)
  assert.equal(board.columns.reduce((a, c) => a + c.entries.length, 0), NMAX)

  // 차가운번호/뜨거운번호 : les quatre bandes, aucune sortie.
  for (const family of HOTCOLD_FAMILIES) {
    const hot = hotColdRow(row, family.key, null)
    assert.equal(hot.groups.reduce((a, g) => a + g.drawn, 0), 0, family.key)
    assert.equal(hot.groups.reduce((a, g) => a + g.entries.length, 0),
      familyNumbers(family.key).length, family.key)
  }

  db.close()
})

test('la carte HL à venir lit son 미래위치 sur tout le passé', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const cells = hlCells(draws)
  const row = hlNextCells(draws)

  // Une case vide vaut son écart, et n'a pas de série à retrancher.
  assert.ok(row.every((c) => c.value === c.gap && c.run === 0 && !c.carried))
  assert.ok(row.every((c) => c.flag === null))

  const history = hlHistory(cells)
  const board = hlBoard([...cells, row], draws.n, history, null)

  assert.equal(board.columns[0].label, '당첨')
  assert.equal(board.columns[0].entries.length, 0)
  assert.equal(board.columns.reduce((a, c) => a + c.entries.length, 0), NMAX)

  // `run` valant zéro, rien n'est retranché : les trois comptages totalisent
  // l'historique entier, pour chaque case.
  for (const column of board.columns) {
    for (const e of column.entries) {
      assert.equal(e.digits.total, draws.n, `${e.number}번`)
      assert.equal(e.digits.wonTotal + e.digits.carryTotal + e.digits.blankTotal,
        draws.n, `${e.number}번`)
      assert.equal(e.digits.future, e.gap + 1, `${e.number}번`)
    }
  }

  db.close()
})

test('indicatorLaw : des lois qui somment à 1, aux moyennes connues, sous les étiquettes de counts', () => {
  const mean = (law) => Object.entries(law).reduce((a, [v, p]) => a + Number(v) * p, 0)
  for (const ind of ['total', 'low', 'odd', 'head', 'tail', 'ac']) {
    for (const size of [6, 7]) {
      const law = indicatorLaw(ind, size)
      const sum = Object.values(law).reduce((a, b) => a + b, 0)
      assert.ok(Math.abs(sum - 1) < 1e-9, `${ind}/${size} : somme ${sum}`)
    }
  }
  // 총합 : six numéros de moyenne 23 → 138 ; sept → 161. Exact.
  assert.ok(Math.abs(mean(indicatorLaw('total', 6)) - 138) < 1e-9)
  assert.ok(Math.abs(mean(indicatorLaw('total', 7)) - 161) < 1e-9)
  // 저고 : 22 저 sur 45 → 6 × 22/45 = 2,933. 홀짝 : 23 홀 → 3,067.
  assert.ok(Math.abs(mean(indicatorLaw('low', 6)) - 6 * 22 / 45) < 1e-9)
  assert.ok(Math.abs(mean(indicatorLaw('odd', 6)) - 6 * 23 / 45) < 1e-9)
  // AC : Monte-Carlo à graine fixe — le même objet à chaque appel, valeurs 0..10 pour six numéros.
  assert.equal(indicatorLaw('ac', 6), indicatorLaw('ac', 6))
  assert.ok(Object.keys(indicatorLaw('ac', 6)).every((k) => Number(k) <= 10))
  assert.throws(() => indicatorLaw('inconnu'), RangeError)

  // filterSeries porte le 기대 à l'échelle des grilles, sous les mêmes clés.
  const draws = fromRows([
    { rang: 1, date: '2002-12-07', numbers: [10, 23, 29, 33, 37, 40], bonus: 16 },
    { rang: 2, date: '2002-12-14', numbers: [9, 13, 21, 25, 32, 42], bonus: 2 },
    { rang: 3, date: '2002-12-21', numbers: [11, 16, 19, 21, 27, 31], bonus: 30 },
  ])
  const pair = filterSeries(draws, 'bonus', 'odd')
  const expectedTotal = Object.values(pair.expected).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(expectedTotal - pair.series.length) < 1e-9)
  assert.ok('3 : 4' in pair.expected, 'les clés de paire sont des étiquettes')
  const second = filterSeries(draws, 'second', 'total')
  assert.ok(Math.abs(Object.values(second.expected).reduce((a, b) => a + b, 0) - second.series.length) < 1e-9)
})

test('sectionLaw : des parts qui somment à 1, la même règle que sectionSeries, mémorisées', () => {
  const law = sectionLaw('winner', { samples: 2000 })
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum(law.byCount) - 1) < 1e-9)
  assert.ok(Math.abs([...law.patterns.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9)
  // Cinq 구간, chacun une part entre 0 et 1 ; 사십 (six numéros) est le plus souvent vide.
  assert.equal(Object.keys(law.blanks).length, 5)
  const blanks = Object.values(law.blanks)
  assert.ok(blanks.every((p) => p >= 0 && p <= 1))
  assert.equal(Math.max(...blanks), law.blanks['사십점멸구간'])
  // Les clés de patterns sont celles de sectionSeries — cinq mots 있음/점멸.
  for (const k of law.patterns.keys()) assert.equal(k.split(' ').length, 5)
  assert.equal(sectionLaw('winner', { samples: 2000 }), law, 'mémorisé')
  assert.throws(() => sectionLaw('inventée'), RangeError)
  // 이월차번호 se simule aussi : la loi existe et n'est pas vide.
  assert.ok(sum(sectionLaw('carry', { samples: 2000 }).byCount) > 0.99)
})

test('hotColdLineCarry : la série d\'une 라인 retrouve les comptes de hotColdLineStats', () => {
  const draws = fromRows([
    { rang: 1, date: '2002-12-07', numbers: [10, 23, 29, 33, 37, 40], bonus: 16 },
    { rang: 2, date: '2002-12-14', numbers: [9, 13, 21, 25, 32, 42], bonus: 2 },
    { rang: 3, date: '2002-12-21', numbers: [11, 16, 19, 21, 27, 31], bonus: 30 },
    { rang: 4, date: '2002-12-28', numbers: [14, 27, 30, 31, 40, 42], bonus: 2 },
  ])
  const stats = hotColdLineStats(draws, 'all')
  let total = 0
  for (const s of stats) {
    const c = hotColdLineCarry(draws, 'all', s.line)
    // `seen` compte aussi les colonnes vides (bande sans numéro) ; la série ne
    // garde que les 회차 où un numéro occupe la 라인.
    assert.ok(c.rounds <= s.seen, `라인 ${s.line} : pas plus de 회차 que vus`)
    assert.equal(c.hits, s.won, `라인 ${s.line} : autant de sorties`)
    assert.equal(c.series.length, c.rounds)
    assert.ok(Math.abs(c.expected - c.rounds * 7 / 45) < 1e-9)
    total += c.hits
  }
  // Sept sortants par 회차, chacun sur une 라인 et une seule.
  assert.equal(total, draws.n * 7)
  // Une 라인 hors du tableau n'a pas de 회차.
  assert.equal(hotColdLineCarry(draws, 'all', 99).rounds, 0)

  // 같은 라인 : sept positions, n − 1 회차 chacune, un candidat pour la
  // carte à venir quand on la fournit.
  const same = hotColdSameLine(draws, 'all')
  assert.equal(same.length, 7)
  for (const s of same) {
    assert.equal(s.rounds, draws.n - 1)
    assert.equal(s.series.length, s.rounds)
    assert.ok(s.hits <= s.rounds)
    assert.ok(s.line >= 1 && s.line <= 45, 'le gagnant du dernier 회차 a une 라인')
    assert.equal(s.candidate, null, 'pas de carte suivante, pas de candidat')
  }
  const withNext = hotColdSameLine(draws, 'all', allCells(draws), nextCells(draws))
  for (const s of withNext) assert.ok(s.candidate >= 1 && s.candidate <= 45)
})
