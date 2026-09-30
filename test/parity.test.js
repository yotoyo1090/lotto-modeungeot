// Parité du noyau JavaScript avec l'ancienne base Django.
//
// C'est le test qui décide si le portage est correct. L'ancienne plateforme
// stockait ses résultats dans 126 colonnes et huit tables auxiliaires ; on
// recalcule tout et on compare, cellule par cellule.
//
// Un écart ici veut dire que le portage se trompe — pas qu'il faut ajuster
// le test.
//
// Les tests s'ignorent d'eux-mêmes si `db.sqlite3` n'est pas là : le projet
// n'en dépend pas, seule la vérification en a besoin.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { fromRows, FULL, LOW_MAX } from '../src/core/draws.js'
import * as metrics from '../src/core/metrics.js'
import * as analysis from '../src/core/analysis.js'
import * as pension from '../src/core/pension.js'
import * as pages from '../src/core/pension-pages.js'
import * as pa from '../src/core/pension-analysis.js'

const LEGACY = process.env.LEGACY_DB ?? '/root/core/db.sqlite3'
const skip = !existsSync(LEGACY) && 'db.sqlite3 absent'

// --------------------------------------------------------------- utilitaires

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

function loadPension(db) {
  const digits = (raw) => [...String(raw).matchAll(/\d+/g)].map((m) => Number(m[0]))
  return pension.fromRows(db.prepare(
    'SELECT 회차, 조, 당첨번호, 보너스 FROM accountadmin_bokun'
  ).all().map((r) => ({
    rang: r['회차'], group: r['조'],
    digits: digits(r['당첨번호']), bonus: digits(r['보너스']),
  })))
}

/** 1 → 일, 10 → 십, 23 → 이십삼, 45 → 사십오. */
const UNITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
function koreanNumeral(n) {
  if (n < 10) return UNITS[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${tens === 1 ? '' : UNITS[tens]}십${UNITS[ones]}`
}

// ------------------------------------------------------------ 6/45 · scalaires

test('les indicateurs 6/45 correspondent à l\'ancienne base', { skip }, async (t) => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const m = metrics.compute(draws)
  const legacy = new Map(db.prepare(
    'SELECT * FROM accountadmin_lottobasedata').all().map((r) => [r['회차'], r]))

  const scalars = [
    ['총합', (i) => m.total[i]],
    ['ac값', (i) => m.ac[i]],
    ['앞자리수합', (i) => m.headSum[i]],
    ['끝자리수합', (i) => m.tailSum[i]],
    ['소수합', (i) => m.primeSum[i]],
    ['함성수합', (i) => m.compositeSum[i]],
    ['소수숫자수', (i) => m.primeCount[i]],
    ['합성숫자수', (i) => m.compositeCount[i]],
    ['전회차이월번호합', (i) => m.carrySum[i]],
    ['이의배수합', (i) => m.multipleSum[2][i]],
    ['삼의배수합', (i) => m.multipleSum[3][i]],
    ['사의배수합', (i) => m.multipleSum[4][i]],
    ['오의배수합', (i) => m.multipleSum[5][i]],
  ]

  for (const [column, read] of scalars) {
    await t.test(column, () => {
      let checked = 0
      for (let i = 0; i < draws.n; i++) {
        const stored = legacy.get(draws.rangs[i])[column]
        if (stored === null || stored === undefined) continue
        assert.equal(read(i), Number(stored), `회차 ${draws.rangs[i]} · ${column}`)
        checked++
      }
      assert.ok(checked > 1000, `couverture faible : ${checked}`)
    })
  }

  await t.test('저고 et 홀짝', () => {
    for (let i = 0; i < draws.n; i++) {
      const row = legacy.get(draws.rangs[i])
      assert.equal(m.lowHigh(i), row['저고'], `회차 ${draws.rangs[i]} · 저고`)
      assert.equal(m.oddEven(i), row['홀짝'], `회차 ${draws.rangs[i]} · 홀짝`)
    }
  })

  await t.test('이월 : numéros et positions', () => {
    const parse = (raw) => raw === null || raw === '0'
      ? null : [...String(raw).matchAll(/\d+/g)].map((x) => Number(x[0]))
    for (let i = 1; i < draws.n; i++) {
      const row = legacy.get(draws.rangs[i])
      const numbers = parse(row['전회차이월번호'])
      if (numbers === null) continue
      assert.deepEqual([...m.carry.numbers[i]].sort((a, b) => a - b),
        numbers.sort((a, b) => a - b), `회차 ${draws.rangs[i]} · 이월번호`)
      const where = parse(row['전회차이월번호위치'])
      if (where === null) continue
      assert.deepEqual([...m.carry.positions[i]].sort((a, b) => a - b),
        where.sort((a, b) => a - b), `회차 ${draws.rangs[i]} · 이월번호위치`)
    }
  })

  db.close()
})

// ------------------------------------------------- 6/45 · la matrice 흐름

test('la matrice 흐름 reproduit `numberpattern`', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  const stored = new Map(db.prepare(
    'SELECT * FROM customeruser_numberpattern').all().map((r) => [r['회차'], r]))
  db.close()

  if (stored.size === 0) return   // table absente : rien à comparer

  // Les colonnes portent les chiffres coréens et ne sont PAS dans l'ordre
  // numérique en base : on les résout par leur nom.
  const columns = new Map()
  for (let n = 1; n <= 45; n++) columns.set(n, koreanNumeral(n))

  // `numberpattern` marquait 당첨 pour le bonus aussi.
  const matrix = analysis.gaps(draws, { withBonus: true })
  const width = 46
  let numeric = 0
  let drawn = 0

  for (let i = 0; i < draws.n; i++) {
    const row = stored.get(draws.rangs[i])
    if (!row) continue
    for (const [number, column] of columns) {
      const raw = row[column]
      if (raw === null || raw === undefined || raw === '') continue
      const text = String(raw)
      const got = matrix[i * width + number]
      if (text.includes('당첨')) {
        assert.equal(got, 0, `회차 ${draws.rangs[i]} · 번호 ${number}`)
        drawn++
      } else if (/^\d+$/.test(text)) {
        assert.equal(got, Number(text), `회차 ${draws.rangs[i]} · 번호 ${number}`)
        numeric++
      }
      // '이월' et '(n)이월' sont des étiquettes, pas des écarts : ignorées.
    }
  }
  assert.ok(numeric > 40_000, `couverture trop faible : ${numeric} cellules`)
  assert.ok(drawn > 6_000, `sorties couvertes : ${drawn}`)
})

// ------------------------------------------------------ 연금복권 · scalaires

test('les indicateurs 연금복권 correspondent', { skip }, async (t) => {
  const db = legacyDb()
  const p = loadPension(db)
  const m = pension.compute(p)
  const legacy = new Map(db.prepare(
    'SELECT * FROM accountadmin_bokun').all().map((r) => [r['회차'], r]))
  db.close()

  const scalars = [
    ['당첨번호총합', (i) => m.total[i]],
    ['당첨번호ac값', (i) => m.ac[i]],
    ['당첨번호소수합', (i) => m.primeSum[i]],
    ['당첨번호함성수합', (i) => m.compositeSum[i]],
    ['당첨번호소수숫자수', (i) => m.primeCount[i]],
    ['당첨번호합성숫자수', (i) => m.compositeCount[i]],
    ['당첨번호전회차이월번호합', (i) => m.carrySum[i]],
    ['당첨번호이의배수합', (i) => m.multipleSum[2][i]],
    ['당첨번호삼의배수합', (i) => m.multipleSum[3][i]],
    ['당첨번호사의배수합', (i) => m.multipleSum[4][i]],
    ['당첨번호오의배수합', (i) => m.multipleSum[5][i]],
  ]

  for (const [column, read] of scalars) {
    await t.test(column, () => {
      for (let i = 0; i < p.n; i++) {
        const stored = legacy.get(p.rangs[i])[column]
        if (stored === null || stored === undefined) continue
        assert.equal(read(i), Number(stored), `회차 ${p.rangs[i]} · ${column}`)
      }
    })
  }

  await t.test('홀짝', () => {
    for (let i = 0; i < p.n; i++) {
      assert.equal(m.oddEven(i), legacy.get(p.rangs[i])['당첨번호홀짝'],
        `회차 ${p.rangs[i]}`)
    }
  })

  await t.test('이월 : les valeurs, répétitions comprises', () => {
    for (let i = 1; i < p.n; i++) {
      const raw = legacy.get(p.rangs[i])['당첨번호전회차이월번호']
      if (raw === null || raw === '0') continue
      const expected = [...String(raw).matchAll(/\d+/g)]
        .map((x) => Number(x[0])).sort((a, b) => a - b)
      assert.deepEqual([...m.carry.values[i]].sort((a, b) => a - b), expected,
        `회차 ${p.rangs[i]} · 이월`)
    }
  })
})

// ------------------------------------------- 연금복권 · les six tables bokchk

test('les 흐름 par position reproduisent les six tables `bokchk*`', { skip }, () => {
  const db = legacyDb()
  const p = loadPension(db)
  const tables = ['bokchkun', 'bokchkdeux', 'bokchktrois',
                  'bokchkquatre', 'bokchkcinq', 'bokchksix']
  const names = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq',
                 'six', 'sept', 'huit', 'neuf']
  const stored = tables.map((t) => new Map(
    db.prepare(`SELECT * FROM accountadmin_${t}`).all().map((r) => [r['회차'], r])))
  db.close()

  const matrix = pension.gaps(p)
  let checked = 0
  for (let i = 0; i < p.n; i++) {
    for (let pos = 0; pos < 6; pos++) {
      const row = stored[pos].get(p.rangs[i])
      if (!row) continue
      for (let d = 0; d < 10; d++) {
        const raw = row[names[d]]
        if (raw === null || raw === undefined || raw === '' || raw === '0') continue
        const text = String(raw)
        const expected = text.includes('당첨') ? 0 : Number(text.split('-')[0])
        assert.equal(matrix[(i * 6 + pos) * 10 + d], expected,
          `회차 ${p.rangs[i]} · ${tables[pos]} · chiffre ${d}`)
        checked++
      }
    }
  }
  assert.ok(checked > 10_000, `couverture trop faible : ${checked}`)
})

// ------------------------------------------------------------- cohérence

test('le seuil 저/고 est unique — le compte et la liste s\'accordent', { skip }, () => {
  const db = legacyDb()
  const draws = loadDraws(db)
  db.close()
  const m = metrics.compute(draws)
  for (let i = 0; i < draws.n; i++) {
    const listed = [...draws.fullAt(i)].filter((n) => n <= LOW_MAX).length
    assert.equal(listed, m.lowCount[i], `회차 ${draws.rangs[i]}`)
    assert.equal(m.lowCount[i] + m.highCount[i], FULL)
  }
})


// ------------------------------- 연금복권 · les vingt pages du menu

test('les fenêtres 일 · 이 · 삼 correspondent, 당첨번호 et 보너스', { skip }, () => {
  // 6 + 5 + 4 fenêtres par tirage, deux familles : 6 750 cellules stockées.
  const db = legacyDb()
  const p = loadPension(db)
  const legacy = new Map(db.prepare(
    'SELECT * FROM accountadmin_bokun').all().map((r) => [r['회차'], r]))
  db.close()

  const KO = ['일', '이', '삼', '사', '오', '육']
  const PREFIX = { digits: '당첨번호', bonus: '보너스' }
  const WIDTH = { 1: '일', 2: '이', 3: '삼' }

  let checked = 0
  for (const source of ['digits', 'bonus']) {
    for (const size of [1, 2, 3]) {
      const mine = pension.windows(p, size, { source })
      for (let i = 0; i < p.n; i++) {
        const row = legacy.get(p.rangs[i])
        mine[i].forEach((value, k) => {
          const column = `${PREFIX[source]}${WIDTH[size]}${KO[k]}`
          const stored = row[column]
          if (stored === null || stored === undefined) return
          assert.equal(value, String(stored),
            `회차 ${p.rangs[i]} · ${column}`)
          checked++
        })
      }
    }
  }
  assert.equal(checked, p.n * (6 + 5 + 4) * 2, `${checked} fenêtres`)
})

test('수평반복 — les jetons se relisent dans les tirages', { skip }, () => {
  const db = legacyDb()
  const p = loadPension(db)
  db.close()

  const rep = pages.repeatTokens(p)
  assert.equal(rep.perDraw.length, p.n)

  let clean = 0
  for (let i = 0; i < p.n; i++) {
    const row = [...p.digitsAt(i)]
    const seen = new Map()
    for (const d of row) seen.set(d, (seen.get(d) ?? 0) + 1)

    const expected = [...seen.entries()]
      .filter(([, c]) => c > 1).sort((a, b) => a[0] - b[0])
      .map(([d, c]) => `${d}:${c}`)
    assert.deepEqual(rep.perDraw[i].map((t) => t.token), expected, `회차 ${p.rangs[i]}`)
    if (expected.length === 0) clean++

    // Un jeton ne peut pas prétendre plus de six occurrences.
    for (const t of rep.perDraw[i]) assert.ok(t.count >= 2 && t.count <= 6)
  }
  assert.equal(rep.clean, clean)

  // Le comptage global totalise les jetons émis.
  const emitted = rep.perDraw.reduce((a, t) => a + t.length, 0)
  assert.equal(Object.values(rep.tally).reduce((a, b) => a + b, 0), emitted)
})

test('les six pages 라인 — chaque tirage tombe dans un seul chiffre', { skip }, () => {
  const db = legacyDb()
  const p = loadPension(db)
  db.close()

  for (let place = 0; place < 6; place++) {
    const line = pages.hitIntervals(p, place)
    assert.equal(line.length, 10)

    // Une place sort une fois par tirage : les dix chiffres se partagent les n.
    assert.equal(line.reduce((a, e) => a + e.hits, 0), p.n, `place ${place}`)

    for (const e of line) {
      const total = Object.values(e.counts).reduce((a, b) => a + b, 0)
      assert.equal(total, e.hits, `place ${place} · chiffre ${e.digit}`)
      // Les attentes s'additionnent jusqu'au dernier tirage où il est sorti.
      const span = Object.entries(e.counts)
        .reduce((a, [v, c]) => a + Number(v) * c, 0)
      assert.equal(span + e.since, p.n, `place ${place} · chiffre ${e.digit}`)
      for (const v of Object.keys(e.counts)) assert.ok(Number(v) >= 1)
    }

    // Et le chiffre effectivement tiré à cette place est bien compté.
    const hits = new Int32Array(10)
    for (let i = 0; i < p.n; i++) hits[p.digitsAt(i)[place]]++
    for (const e of line) assert.equal(e.hits, hits[e.digit], `place ${place}`)
  }
})

test('당첨번호+보너스 met les deux familles dans le même sac', { skip }, () => {
  const db = legacyDb()
  const p = loadPension(db)
  db.close()

  // Douze chiffres par tirage, sans appariement — ce que faisait l'ancien.
  for (const i of [0, 1, p.n - 1]) {
    assert.deepEqual(pages.sourceDigits(p, i, 'both'),
      [...p.digitsAt(i), ...p.bonusAt(i)])
  }
  const freq = pages.digitFrequency(p, 'both')
  assert.equal(Object.values(freq).reduce((a, b) => a + b, 0), p.n * 12)

  // Et le comptage `both` est la somme des deux comptages séparés.
  const a = pages.digitFrequency(p, 'digits')
  const b = pages.digitFrequency(p, 'bonus')
  for (let d = 0; d < 10; d++) assert.equal(freq[d], a[d] + b[d], `chiffre ${d}`)

  // Les fenêtres aussi : 5 + 5 puis 4 + 4.
  for (const [size, per] of [[2, 10], [3, 8]]) {
    const w = pages.pageWindows(p, size, 'both')
    assert.equal(w[0].length, per)
    const total = Object.values(pages.pageWindowFrequency(p, size, 'both'))
      .reduce((x, y) => x + y, 0)
    assert.equal(total, p.n * per, `fenêtres ${size}`)
  }

  // Les vingt pages du catalogue, sans doublon de clé.
  const keys = pages.PENSION_PAGES.map((x) => x.key)
  assert.equal(keys.length, 20)
  assert.equal(new Set(keys).size, 20)
  assert.throws(() => pages.pensionPage('inconnue'), RangeError)
})

test('저고 — l\'ancien se contredisait, un seul seuil ici', { skip }, () => {
  // La colonne 당첨번호저고 comptait avec `< 4`, la colonne 당첨번호저번호
  // listait avec `<= 4`. Les deux se contredisent sur tout tirage contenant
  // un 4. On le montre plutôt que de le supposer.
  const db = legacyDb()
  const p = loadPension(db)
  const legacy = new Map(db.prepare(
    'SELECT 회차, 당첨번호저고, 당첨번호저번호 FROM accountadmin_bokun')
    .all().map((r) => [r['회차'], r]))
  db.close()

  let disagree = 0
  let hasFour = 0
  for (let i = 0; i < p.n; i++) {
    const row = legacy.get(p.rangs[i])
    if (!row?.['당첨번호저고']) continue
    const ratio = Number(String(row['당첨번호저고']).split(':')[0].trim())
    const listed = [...String(row['당첨번호저번호']).matchAll(/\d+/g)].length
    if (ratio !== listed) disagree++
    if ([...p.digitsAt(i)].includes(4)) hasFour++
  }
  assert.ok(disagree > 0, 'aucune contradiction trouvée')
  assert.equal(disagree, hasFour, 'la contradiction ne suit pas les 4')

  // Chez nous, le compte et la liste disent la même chose, toujours.
  const m = pension.compute(p)
  for (let i = 0; i < p.n; i++) {
    const low = [...p.digitsAt(i)].filter((d) => d <= 4).length
    assert.equal(m.lowCount[i], low, `회차 ${p.rangs[i]}`)
    assert.equal(m.lowCount[i] + m.highCount[i], 6)
  }
})


// ------------------- 연금복권 · les analyses du 6/45, portées sur les chiffres

test('les bandes 차뜨 se suivent, et elles sont à l\'échelle du jeu', () => {
  // Elles doivent couvrir 1..∞ sans trou ni recouvrement.
  let edge = 1
  for (const b of pa.PENSION_BANDS) {
    assert.equal(b.min, edge, b.label)
    assert.ok(b.max >= b.min, b.label)
    edge = b.max + 1
  }
  assert.equal(pa.PENSION_BANDS.at(-1).max, Infinity)
  for (const gap of [1, 8, 9, 16, 17, 29, 30, 500]) {
    assert.ok(pa.PENSION_BANDS.some((b) => b.key === pa.pensionBandOf(gap)))
  }

  // À l'échelle : l'écart attendu vaut 10 ici et 45/7 au 6/45. Les bornes
  // doivent valoir à peu près les mêmes multiples de cette attente.
  const here = [8, 16, 29].map((v) => v / 10)
  const there = [5, 10, 19].map((v) => v / (45 / 7))
  here.forEach((v, k) => assert.ok(Math.abs(v - there[k]) < 0.12,
    `borne ${k} : ${v.toFixed(2)} contre ${there[k].toFixed(2)}`))
})

test('구간 — trois tranches qui couvrent les dix chiffres', () => {
  assert.equal(pa.PENSION_SECTIONS.length, 3)
  const seen = new Set()
  for (const [lo, hi] of pa.PENSION_SECTIONS) {
    for (let d = lo; d <= hi; d++) { assert.ok(!seen.has(d), `chiffre ${d} deux fois`); seen.add(d) }
  }
  assert.equal(seen.size, 10)
  assert.deepEqual([0, 3, 4, 6, 7, 9].map(pa.pensionSectionOf), [0, 0, 1, 1, 2, 2])
})

test('흐름 par position — une seule sortie par 회차, et les écarts se suivent',
     { skip }, () => {
  const db = legacyDb()
  const p = loadPension(db)
  db.close()

  for (let place = 0; place < 6; place++) {
    const cells = pa.pensionCells(p, place)
    assert.equal(cells.length, p.n)

    const seen = new Int32Array(10)
    for (let i = 0; i < p.n; i++) {
      const row = cells[i]
      assert.equal(row.length, 10)

      // Exactement un chiffre sorti, et c'est bien celui du tirage.
      const drawn = row.filter((c) => c.drawn)
      assert.equal(drawn.length, 1, `place ${place} · 회차 ${p.rangs[i]}`)
      assert.equal(drawn[0].digit, p.digitsAt(i)[place])
      seen[drawn[0].digit]++

      // L'écart d'une case vide grandit d'un 회차 au suivant ; celui d'une
      // case pleine repart de la dernière sortie.
      if (i > 0) {
        for (let d = 0; d < 10; d++) {
          const before = cells[i - 1][d]
          if (before.drawn) assert.equal(row[d].gap, 1, `place ${place} · ${d}`)
          else assert.equal(row[d].gap, before.gap + 1, `place ${place} · ${d}`)
        }
      }
    }

    // Les quatre bandes se partagent les dix chiffres, à chaque 회차.
    const bands = pa.pensionTemperature(cells[p.n - 1])
    assert.equal(bands.reduce((a, b) => a + b.entries.length, 0), 10, `place ${place}`)
    const digits = bands.flatMap((b) => b.entries.map((e) => e.digit))
    assert.deepEqual([...digits].sort((a, b) => a - b),
      Array.from({ length: 10 }, (_, d) => d))

    // Et le comptage des sorties retombe sur les tirages.
    for (let d = 0; d < 10; d++) {
      let n = 0
      for (let i = 0; i < p.n; i++) if (p.digitsAt(i)[place] === d) n++
      assert.equal(seen[d], n, `place ${place} · chiffre ${d}`)
    }
  }
})

test('리스트 — les onze familles, et ce qu\'elles doivent totaliser', { skip }, () => {
  const db = legacyDb()
  const p = loadPension(db)
  db.close()

  assert.equal(pa.PENSION_LIST_FAMILIES.length, 11)
  assert.throws(() => pa.pensionFamily('inconnue'), RangeError)

  for (const f of pa.PENSION_LIST_FAMILIES) {
    const s = pa.pensionListSeries(p, f.key)
    assert.equal(s.rows.length, p.n, f.label)

    // Les distributions comptent chacune tous les 회차.
    for (const key of ['counts', 'sums']) {
      assert.equal(Object.values(s[key]).reduce((a, b) => a + b, 0), p.n, `${f.label} · ${key}`)
    }
    // Les combinaisons aussi.
    assert.equal(s.combos.reduce((a, c) => a + c.count, 0), p.n, f.label)
    assert.equal(new Set(s.combos.map((c) => c.label)).size, s.combos.length, f.label)

    // Le total des membres = la somme des 숫자수, doublons compris.
    const drawn = s.rows.reduce((a, r) => a + r.count, 0)
    assert.equal(Object.values(s.members).reduce((a, b) => a + b, 0), drawn, f.label)

    // Le flux va du plus ancien au plus récent, les lignes l'inverse.
    assert.equal(s.flow.length, p.n)
    assert.equal(s.flow[0].rang, p.rangs[0])
    assert.equal(s.flow.at(-1).rang, p.rangs[p.n - 1])
    assert.equal(s.rows[0].rang, p.rangs[p.n - 1])

    // Un chiffre peut sortir plusieurs fois : le 숫자수 dépasse parfois le
    // nombre de membres. C'est la différence de fond avec le 6/45.
    const members = pa.pensionMembers(f.key).length
    assert.ok(s.rows.every((r) => r.count <= 6), f.label)
    if (f.key === 'even') assert.ok(s.rows.some((r) => r.count > members / 2))
  }

  // Les partages : 저 + 고 = 6 et 홀 + 짝 = 6, à chaque 회차.
  const lo = pa.pensionListSeries(p, 'low')
  const hi = pa.pensionListSeries(p, 'high')
  const od = pa.pensionListSeries(p, 'odd')
  const ev = pa.pensionListSeries(p, 'even')
  for (let k = 0; k < p.n; k++) {
    assert.equal(lo.rows[k].count + hi.rows[k].count, 6, `회차 ${lo.rows[k].rang}`)
    assert.equal(od.rows[k].count + ev.rows[k].count, 6, `회차 ${od.rows[k].rang}`)
    assert.equal(lo.rows[k].sum + hi.rows[k].sum, ev.rows[k].sum + od.rows[k].sum)
  }

  // 0 est écarté des 배수 mais compté dans 짝수 — l'asymétrie est voulue.
  assert.ok(!pa.pensionMembers('mult2').includes(0))
  assert.ok(pa.pensionMembers('even').includes(0))

  // 이월차번호 : rien au premier 회차, et les chiffres viennent bien du
  // tirage précédent.
  const carry = pa.pensionListSeries(p, 'carry')
  assert.equal(carry.rows.at(-1).count, 0)
  for (let k = 0; k < p.n - 1; k++) {
    const i = p.n - 1 - k
    const previous = new Set(p.digitsAt(i - 1))
    for (const d of carry.rows[k].digits) assert.ok(previous.has(d), `회차 ${p.rangs[i]}`)
  }
})
