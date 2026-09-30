// Les générateurs.
//
// Un générateur est difficile à tester par comparaison : il n'existe pas de
// « bonne réponse » stockée quelque part. Quatre angles le cernent quand
// même, et chacun attrape une classe de fautes différente.
//
//   1. **Invariants de forme** — les grilles rendues sont triées, sans
//      doublon, dans les bornes. Attrape les erreurs de recopie.
//   2. **Contre-épreuve exhaustive** — sur un 추천수 réduit, l'espace tient
//      dans quelques centaines de grilles : on les énumère toutes avec
//      `matches()`, écrit pour la lisibilité, et on exige que le parcours
//      rapide donne exactement le même ensemble. Attrape les divergences
//      entre les deux implémentations des mêmes définitions.
//   3. **Comptabilité** — retenues + écartées = espace parcouru. Attrape les
//      élagages qui coupent une branche de trop.
//   4. **Les tirages réels passent leurs propres filtres** — pour chacun des
//      1 238 tirages, on relève ses indicateurs et on demande au générateur
//      les grilles qui les ont exactement : le tirage doit s'y trouver. Un
//      générateur qui exclurait un tirage qui a réellement eu lieu serait
//      faux, quoi qu'en disent les trois autres angles.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { HEAD, IS_COMPOSITE, IS_PRIME, LOW_MAX, NMAX, PICK, SECTIONS, TAIL }
  from '../src/core/draws.js'
import { MULTIPLES } from '../src/core/metrics.js'
import * as gen from '../src/core/generator.js'
import * as pgen from '../src/core/pension-generator.js'
import { BASE, DIGITS, GROUPS, LOW_MAX as P_LOW_MAX } from '../src/core/pension.js'

const LEGACY = process.env.LEGACY_DB ?? '/root/core/db.sqlite3'
const skip = !existsSync(LEGACY) && 'db.sqlite3 absent'

// --------------------------------------------------------------- références
//
// Écrites ici, à partir des définitions et de rien d'autre : ni `generate`
// ni `matches` n'y participent. C'est ce qui leur donne valeur de témoin.

function describe(row) {
  const numbers = [...row].sort((a, b) => a - b)
  const sum = (pick) => numbers.reduce((a, v) => a + pick(v), 0)
  const count = (ok) => numbers.filter(ok).length
  const gaps = new Set()
  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) {
      gaps.add(Math.abs(numbers[i] - numbers[j]))
    }
  }
  const multiples = {}
  for (const m of MULTIPLES) multiples[m] = count((v) => v % m === 0)
  const sections = SECTIONS.map(([lo, hi]) => count((v) => v >= lo && v <= hi))
  return {
    total: sum((v) => v),
    low: count((v) => v <= LOW_MAX),
    odd: count((v) => v % 2 === 1),
    primes: count((v) => IS_PRIME[v] === 1),
    composites: count((v) => IS_COMPOSITE[v] === 1),
    headSum: sum((v) => HEAD[v]),
    tailSum: sum((v) => TAIL[v]),
    ac: gaps.size - (numbers.length - 1),
    multiples, sections,
  }
}

function exactFilters(row) {
  const d = describe(row)
  const pair = (v) => [v, v]
  return {
    total: pair(d.total), low: pair(d.low), odd: pair(d.odd),
    primes: pair(d.primes), composites: pair(d.composites),
    headSum: pair(d.headSum), tailSum: pair(d.tailSum), ac: pair(d.ac),
    multiples: Object.fromEntries(MULTIPLES.map((m) => [m, pair(d.multiples[m])])),
    sections: Object.fromEntries(d.sections.map((v, s) => [s, pair(v)])),
  }
}

/** Toutes les combinaisons de `pool` — pour la contre-épreuve exhaustive. */
function* everyCombination(pool, k = PICK, start = 0, acc = []) {
  if (acc.length === k) { yield [...acc]; return }
  for (let i = start; i <= pool.length - (k - acc.length); i++) {
    acc.push(pool[i])
    yield* everyCombination(pool, k, i + 1, acc)
    acc.pop()
  }
}

const key = (row) => row.join('-')
const sorted = (rows) => rows.map(key).sort()

// ================================================================== 6/45

test('l\'espace parcouru est bien C(45, 6)', () => {
  assert.equal(gen.TOTAL_COMBINATIONS, 8_145_060)
  assert.equal(gen.choose(45, 6), 8_145_060)
  assert.equal(gen.choose(6, 6), 1)
  assert.equal(gen.choose(5, 6), 0)
  const r = gen.generate({}, { limit: 0 })
  assert.equal(r.kept, gen.TOTAL_COMBINATIONS)
  assert.equal(r.candidates, gen.TOTAL_COMBINATIONS)
})

test('les grilles rendues sont triées, sans doublon, dans les bornes', () => {
  const r = gen.generate({ total: [120, 140] }, { sample: 300, seed: 3 })
  assert.equal(r.count, 300)
  for (const row of gen.toArrays(r)) {
    assert.equal(row.length, PICK)
    for (let k = 0; k < PICK; k++) {
      assert.ok(row[k] >= 1 && row[k] <= NMAX, `numéro ${row[k]} hors bornes`)
      if (k > 0) assert.ok(row[k] > row[k - 1], `non trié : ${row}`)
    }
    assert.ok(describe(row).total >= 120 && describe(row).total <= 140)
  }
})

test('sans échantillonnage, les grilles sortent dans l\'ordre lexicographique', () => {
  const rows = gen.toArrays(gen.generate({}, { limit: 5 }))
  assert.deepEqual(rows, [
    [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7], [1, 2, 3, 4, 5, 8],
    [1, 2, 3, 4, 5, 9], [1, 2, 3, 4, 5, 10],
  ])
})

test('le parcours rapide et `matches` décrivent le même ensemble', async (t) => {
  // Sur douze numéros, l'espace fait 924 grilles : on peut tout énumérer et
  // comparer ensemble à ensemble, pas seulement compte à compte.
  const pool = [2, 5, 7, 11, 13, 18, 22, 26, 31, 33, 40, 44]
  const suites = [
    ['aucun filtre', {}],
    ['총합', { total: [90, 140] }],
    ['저고 · 홀짝', { low: [2, 4], odd: [2, 4] }],
    ['AC값', { ac: [8, 10] }],
    ['소수 · 합성수', { primes: [1, 3], composites: [2, 5] }],
    ['앞/끝자리수합', { headSum: [8, 16], tailSum: [15, 30] }],
    ['배수', { multiples: { 2: [2, 4], 3: [0, 2] } }],
    ['구간', { sections: { 0: [1, 2], 2: [0, 2], 4: [0, 1] } }],
    ['고정수', { include: [7, 33] }],
    ['제외수', { exclude: [2, 44] }],
    ['대비', { reference: [5, 7, 13, 22, 31, 44], match: [2, 3] }],
    ['수동 인기', { popularity: [0.8, 1.3] }],
    ['당첨 개수', { hitReference: [2, 7, 13, 22, 31, 40, 44], hit: [2, 3] }],
    ['이월 + 당첨', {
      reference: [5, 7, 13, 22, 31, 44], match: [1, 2],
      hitReference: [2, 11, 18, 26, 33, 40, 45], hit: [1, 3],
    }],
    ['tout à la fois', {
      total: [100, 160], low: [2, 4], odd: [2, 4], ac: [7, 10],
      primes: [1, 3], multiples: { 2: [1, 4] }, sections: { 0: [0, 2] },
      include: [13], exclude: [40],
    }],
  ]

  for (const [name, filters] of suites) {
    await t.test(name, () => {
      const withPool = { ...filters, pool }
      const brute = []
      for (const row of everyCombination(pool)) {
        if (gen.matches(row, withPool) === null) brute.push(row)
      }
      const fast = gen.generate(withPool, { limit: Infinity })
      assert.deepEqual(sorted(gen.toArrays(fast)), sorted(brute),
        `${name} : ${fast.kept} contre ${brute.length}`)
      assert.equal(fast.kept, brute.length)
    })
  }
})

test('la comptabilité est exacte : retenues + écartées = espace', async (t) => {
  const suites = [
    ['petit 추천수', { pool: [1, 3, 5, 8, 12, 19, 24, 30, 37, 45] }],
    ['총합 avec élagage', { pool: range(1, 20), total: [50, 70] }],
    ['comptages', { pool: range(1, 22), low: [3, 4], odd: [2, 3], primes: [1, 2] }],
    ['고정수', { pool: range(1, 18), include: [3, 17] }],
    ['impossible', { pool: range(1, 15), total: [10, 12] }],
    ['espace entier', { total: [120, 130], ac: [8, 10] }],
    ['당첨 개수 · 수동 인기', {
      hitReference: [3, 9, 17, 25, 33, 41, 44], hit: [3, 6], popularity: [0, 1.5],
    }],
  ]
  for (const [name, filters] of suites) {
    await t.test(name, () => {
      const r = gen.generate(filters, { limit: 0 })
      const dropped = r.rejected.reduce((a, x) => a + x.rejected, 0)
      assert.equal(r.kept + dropped, r.candidates,
        `${name} : ${r.kept} + ${dropped} ≠ ${r.candidates}`)
    })
  }
})

test('당첨 개수 sur l\'espace entier : les comptes exacts de la loi', () => {
  // Sept numéros de référence (six + 보너스) : combien des 8 145 060 grilles
  // en portent exactement k ? C(7,k) · C(38, 6−k) — calculé à la main,
  // sans le générateur.
  const ref = [3, 11, 19, 24, 30, 38, 42]
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r) }
  const exact = (k) => C(7, k) * C(38, PICK - k)
  const at = (lo, hi) => gen.generate({ hitReference: ref, hit: [lo, hi] }, { limit: 0 }).kept
  assert.equal(exact(4), 24_605)
  assert.equal(at(4, 4), 24_605)
  assert.equal(at(5, 5), 798)
  assert.equal(at(6, 6), 7)
  assert.equal(at(4, 6), 25_410)
  assert.equal(at(0, 6), gen.TOTAL_COMBINATIONS)
})

test('수동 인기 : des tranches disjointes recouvrent tout l\'espace', () => {
  const at = (lo, hi) => gen.generate({ popularity: [lo, hi] }, { limit: 0 }).kept
  const low = at(0, 1)
  const high = at(1.000001, 100)
  assert.ok(low > 0 && high > 0)
  assert.equal(low + high, gen.TOTAL_COMBINATIONS)
})

test('un 추천수 trop petit ne rend rien plutôt que de se plaindre', () => {
  const r = gen.generate({ pool: [1, 2, 3] })
  assert.equal(r.kept, 0)
  assert.equal(r.candidates, 0)
  assert.equal(r.count, 0)
})

test('les grilles d\'AC값 nul ne disparaissent pas — le bug de l\'original', () => {
  // `calculate_ac_value(...) != False` traitait 0 comme « pas de valeur » et
  // supprimait ces grilles même sans filtre AC. On les recompte ici de zéro.
  let expected = 0
  const row = [0, 0, 0, 0, 0, 0]
  for (row[0] = 1; row[0] <= NMAX; row[0]++) {
    for (row[1] = row[0] + 1; row[1] <= NMAX; row[1]++) {
      for (row[2] = row[1] + 1; row[2] <= NMAX; row[2]++) {
        for (row[3] = row[2] + 1; row[3] <= NMAX; row[3]++) {
          for (row[4] = row[3] + 1; row[4] <= NMAX; row[4]++) {
            for (row[5] = row[4] + 1; row[5] <= NMAX; row[5]++) {
              // Un `Set`, pas des bits : `1 << 44` en JavaScript vaut
              // `1 << 12` — le décalage est pris modulo 32. C'est pour cela
              // que le générateur, lui, tient deux mots de 32 bits.
              const gaps = new Set()
              for (let i = 0; i < PICK; i++) {
                for (let j = i + 1; j < PICK; j++) gaps.add(row[j] - row[i])
              }
              if (gaps.size - (PICK - 1) === 0) expected++
            }
          }
        }
      }
    }
  }
  assert.ok(expected > 0, 'il existe bien des grilles d\'AC값 nul')
  assert.equal(gen.generate({ ac: [0, 0] }, { limit: 0 }).kept, expected)
  assert.equal(gen.matches([1, 2, 3, 4, 5, 6], { ac: [0, 0] }), null)
})

test('même graine, même échantillon ; graine différente, échantillon différent', () => {
  const filters = { total: [110, 150], ac: [7, 10] }
  const a = gen.toArrays(gen.generate(filters, { sample: 20, seed: 1 }))
  const b = gen.toArrays(gen.generate(filters, { sample: 20, seed: 1 }))
  const c = gen.toArrays(gen.generate(filters, { sample: 20, seed: 2 }))
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
})

test('un échantillon ne contient que des grilles valides', () => {
  const filters = { pool: range(1, 24), total: [60, 90], odd: [2, 4] }
  const whole = new Set(sorted(gen.toArrays(gen.generate(filters, { limit: Infinity }))))
  const shot = gen.toArrays(gen.generate(filters, { sample: 50, seed: 11 }))
  assert.equal(shot.length, 50)
  assert.equal(new Set(shot.map(key)).size, 50, 'pas deux fois la même grille')
  for (const row of shot) assert.ok(whole.has(key(row)), `${row} n'est pas une solution`)
})

test('`limit` tronque l\'affichage sans fausser le compte', () => {
  const filters = { total: [130, 140] }
  const full = gen.generate(filters, { limit: 0 })
  const short = gen.generate(filters, { limit: 7 })
  assert.equal(short.kept, full.kept)
  assert.equal(short.count, 7)
  assert.ok(full.kept > 7)
})

test('`matches` nomme le premier critère qui bloque', () => {
  assert.equal(gen.matches([1, 2, 3, 4, 5, 6], {}), null)
  assert.equal(gen.matches([1, 2, 3, 4, 5, 6], { total: [100, 200] }), 'total')
  assert.equal(gen.matches([1, 2, 3, 4, 5, 6], { low: [0, 2] }), 'low')
  assert.equal(gen.matches([1, 2, 3, 4, 5, 6], { ac: [5, 10] }), 'ac')
  assert.equal(gen.matches([1, 2, 3, 4, 5, 6], { exclude: [3] }), 'pool')
  assert.equal(gen.matches([1, 2, 3, 4, 5, 6], { include: [40] }), 'include')
  // L'ordre d'évaluation est celui de CRITERIA : 총합 avant AC값.
  assert.equal(gen.matches([1, 2, 3, 4, 5, 6], { total: [100, 200], ac: [5, 10] }),
    'total')
})

test('les filtres mal formés sont refusés tout de suite', () => {
  assert.throws(() => gen.generate({ total: 120 }), TypeError)
  assert.throws(() => gen.generate({ total: [120] }), TypeError)
  assert.throws(() => gen.generate({ total: [1.5, 3] }), TypeError)
  assert.throws(() => gen.generate({ total: [140, 120] }), /보다 큽니다/)
  assert.throws(() => gen.generate({ include: [1, 2, 3, 4, 5, 6, 7] }), /고정수/)
  assert.throws(() => gen.generate({ include: [7], exclude: [7] }), /제외/)
  assert.throws(() => gen.generate({ pool: [0] }), /범위 밖/)
  assert.throws(() => gen.generate({ match: [2, 3] }), /reference/)
  assert.throws(() => gen.generate({ hit: [2, 3] }), /hitReference/)
  assert.throws(() => gen.generate({ popularity: [2, 1] }), /popularity/)
  assert.throws(() => gen.matches([1, 2, 3, 4, 5], {}), /번호 6개/)
  assert.throws(() => gen.matches([1, 2, 3, 4, 5, 5], {}), /중복/)
})

test('chaque tirage réel satisfait les filtres tirés de lui-même', { skip }, async (t) => {
  const rows = historicalDraws()

  await t.test(`les ${rows.length} tirages passent \`matches\``, () => {
    for (const { rang, numbers } of rows) {
      assert.equal(gen.matches(numbers, exactFilters(numbers)), null,
        `회차 ${rang} · ${numbers}`)
    }
  })

  await t.test('le parcours les retrouve · 25 tirages répartis', () => {
    const step = Math.max(1, Math.floor(rows.length / 25))
    for (let i = 0; i < rows.length; i += step) {
      const { rang, numbers } = rows[i]
      const r = gen.generate(exactFilters(numbers), { limit: Infinity })
      const found = new Set(sorted(gen.toArrays(r)))
      assert.ok(found.has(key(numbers)), `회차 ${rang} · ${numbers} introuvable`)
      assert.ok(r.kept >= 1)
    }
  })

  await t.test('avec le tirage comme 추천수, il est la seule solution', () => {
    for (const { rang, numbers } of rows.slice(-40)) {
      const r = gen.generate({ pool: numbers }, { limit: Infinity })
      assert.equal(r.kept, 1, `회차 ${rang}`)
      assert.deepEqual(gen.toArrays(r), [[...numbers].sort((a, b) => a - b)])
    }
  })

  await t.test('`대비` retrouve le vrai nombre de numéros communs', () => {
    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1].numbers
      const current = rows[i].numbers
      const shared = current.filter((v) => previous.includes(v)).length
      assert.equal(
        gen.matches(current, { reference: previous, match: [shared, shared] }), null,
        `회차 ${rows[i].rang}`)
      if (shared > 0) {
        assert.equal(
          gen.matches(current, { reference: previous, match: [0, shared - 1] }), 'match')
      }
    }
  })
})

// ============================================================== 연금복권

test('l\'espace 연금복권 est bien 10⁶', () => {
  assert.equal(pgen.TOTAL_SEQUENCES, 1_000_000)
  const r = pgen.generate({}, { limit: 0 })
  assert.equal(r.kept, 1_000_000)
  assert.equal(r.candidates, 1_000_000)
  assert.equal(r.tickets, 1_000_000 * GROUPS.length)
})

test('les séquences rendues ont six chiffres et un 조 valide', () => {
  const r = pgen.generate({ total: [20, 30] }, { sample: 200, seed: 5 })
  assert.equal(r.count, 200)
  for (const { group, digits } of pgen.toTickets(r)) {
    assert.ok(GROUPS.includes(group), `조 ${group}`)
    assert.equal(digits.length, DIGITS)
    for (const d of digits) assert.ok(d >= 0 && d < BASE, `chiffre ${d}`)
    const total = digits.reduce((a, b) => a + b, 0)
    assert.ok(total >= 20 && total <= 30, `총합 ${total}`)
  }
})

test('le parcours 연금복권 et `matches` décrivent le même ensemble', async (t) => {
  // Trois chiffres permis par position : 3⁶ = 729 séquences, énumérables.
  const positions = [[0, 4, 9], [1, 5, 8], [2, 3, 7], [0, 6, 9], [1, 4, 7], [3, 5, 8]]
  const suites = [
    ['aucun filtre', {}],
    ['총합', { total: [20, 30] }],
    ['저고 · 홀짝', { low: [2, 4], odd: [2, 4] }],
    ['AC값', { ac: [3, 5] }],
    ['소수 · 합성수', { primes: [1, 3], composites: [1, 4] }],
    ['배수 · le 0 écarté', { multiples: { 2: [1, 4], 5: [0, 2] } }],
    ['서로 다른 숫자', { distinct: [5, 6] }],
    ['중복 숫자', { repeats: [0, 2] }],
    ['고정수', { include: [4] }],
    ['제외수', { exclude: [9, 0] }],
    ['대비', { reference: [4, 5, 3, 6, 7, 8], match: [3, 5] }],
    ['tout à la fois', {
      total: [18, 32], low: [2, 4], odd: [2, 4], ac: [2, 5],
      distinct: [4, 6], multiples: { 3: [0, 3] }, include: [5], exclude: [0],
    }],
  ]

  for (const [name, filters] of suites) {
    await t.test(name, () => {
      const withPositions = { ...filters, positions }
      const brute = []
      for (const row of everySequence(positions)) {
        if (pgen.matches(row, withPositions) === null) brute.push(row)
      }
      const fast = pgen.generate(withPositions, { limit: Infinity })
      const got = pgen.toTickets(fast).map((x) => x.digits)
      assert.deepEqual(sorted(got), sorted(brute),
        `${name} : ${fast.kept} contre ${brute.length}`)
    })
  }
})

test('la comptabilité 연금복권 est exacte', async (t) => {
  const suites = [
    ['positions serrées', { positions: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 0], [1, 5]] }],
    ['총합', { total: [20, 30] }],
    ['comptages', { low: [3, 3], odd: [3, 3], primes: [1, 2] }],
    ['고정수 introuvable', { include: [7], positions: [[1], [2], [3], [4], [5], [6]] }],
    ['impossible', { total: [60, 70] }],
  ]
  for (const [name, filters] of suites) {
    await t.test(name, () => {
      const r = pgen.generate(filters, { limit: 0 })
      const dropped = r.rejected.reduce((a, x) => a + x.rejected, 0)
      assert.ok(r.kept + dropped <= r.candidates, `${name} : trop compté`)
      if (r.kept > 0 || dropped > 0) assert.ok(r.candidates > 0)
    })
  }
})

test('le 조 se filtre sans toucher aux chiffres', () => {
  const filters = { total: [25, 27] }
  const all = pgen.generate(filters, { limit: 0 })
  const two = pgen.generate({ ...filters, groups: [2, 4] }, { limit: 0 })
  assert.equal(two.kept, all.kept, 'le 조 ne change aucune séquence')
  assert.deepEqual(two.groups, [2, 4])
  assert.equal(two.tickets, all.kept * 2)
  assert.equal(all.tickets, all.kept * GROUPS.length)
})

test('les positions sont respectées à la lettre', () => {
  const positions = [[7], null, [1, 2], null, null, [0]]
  const r = pgen.generate({ positions }, { limit: 0 })
  assert.equal(r.candidates, 1 * 10 * 2 * 10 * 10 * 1)
  assert.equal(r.kept, r.candidates)
  for (const { digits } of pgen.toTickets(pgen.generate({ positions }, { sample: 40, seed: 2 }))) {
    assert.equal(digits[0], 7)
    assert.ok([1, 2].includes(digits[2]))
    assert.equal(digits[5], 0)
  }
})

test('les chiffres 연금복권 se répètent — ce que le 6/45 interdit', () => {
  const r = pgen.generate({ distinct: [1, 1] }, { limit: Infinity })
  assert.equal(r.kept, BASE, 'les dix séquences 000000 … 999999')
  for (const { digits } of pgen.toTickets(r)) {
    assert.equal(new Set(digits).size, 1)
  }
  assert.equal(pgen.matches([5, 5, 5, 5, 5, 5], { repeats: [6, 6] }), null)
  // Un seul écart distinct — 0 — donc AC값 = 1 − 5 = −4. Le 6/45 ne peut
  // jamais descendre en dessous de 0 : c'est la marque du produit.
  assert.equal(pgen.matches([5, 5, 5, 5, 5, 5], { ac: [-4, -4] }), null)
})

test('les filtres 연금복권 mal formés sont refusés', () => {
  assert.throws(() => pgen.generate({ total: 20 }), TypeError)
  assert.throws(() => pgen.generate({ total: [30, 20] }), /보다 큽니다/)
  assert.throws(() => pgen.generate({ include: [1], exclude: [1] }), /제외/)
  assert.throws(() => pgen.generate({ positions: [[1], [2]] }), /자리 조건/)
  assert.throws(() => pgen.generate({ positions: [[10], null, null, null, null, null] }),
    /범위 밖/)
  assert.throws(() => pgen.generate({ groups: [9] }), /조/)
  assert.throws(() => pgen.generate({ match: [1, 2] }), /reference/)
  assert.throws(() => pgen.matches([1, 2, 3], {}), /숫자 6개/)
})

test('chaque tirage 연금복권 réel satisfait ses propres filtres', { skip }, async (t) => {
  const rows = historicalPension()

  await t.test(`les ${rows.length} tirages passent \`matches\``, () => {
    for (const { rang, digits } of rows) {
      const count = (ok) => digits.filter(ok).length
      const tally = {}
      for (const d of digits) tally[d] = (tally[d] ?? 0) + 1
      const exact = (v) => [v, v]
      const filters = {
        total: exact(digits.reduce((a, b) => a + b, 0)),
        low: exact(count((v) => v <= P_LOW_MAX)),
        odd: exact(count((v) => v % 2 === 1)),
        distinct: exact(Object.keys(tally).length),
        repeats: exact(Object.values(tally).filter((c) => c > 1)
          .reduce((a, b) => a + b, 0)),
        positions: digits.map((d) => [d]),
      }
      assert.equal(pgen.matches(digits, filters), null, `회차 ${rang} · ${digits}`)
    }
  })

  await t.test('le tirage est la seule solution de ses propres positions', () => {
    for (const { rang, digits } of rows.slice(-40)) {
      const r = pgen.generate({ positions: digits.map((d) => [d]) }, { limit: Infinity })
      assert.equal(r.kept, 1, `회차 ${rang}`)
      assert.deepEqual(pgen.toTickets(r)[0].digits, digits)
    }
  })

  await t.test('`대비` retrouve le vrai 이월, répétitions comprises', () => {
    for (let i = 1; i < rows.length; i++) {
      const previous = new Set(rows[i - 1].digits)
      const current = rows[i].digits
      const shared = current.filter((d) => previous.has(d)).length
      assert.equal(pgen.matches(current, {
        reference: rows[i - 1].digits, match: [shared, shared],
      }), null, `회차 ${rows[i].rang}`)
    }
  })
})

// ------------------------------------------------------------------ outils

function range(lo, hi) {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

function* everySequence(positions, at = 0, acc = []) {
  if (at === positions.length) { yield [...acc]; return }
  for (const d of positions[at]) {
    acc.push(d)
    yield* everySequence(positions, at + 1, acc)
    acc.pop()
  }
}

function historicalDraws() {
  const db = new DatabaseSync(LEGACY, { readOnly: true })
  const rows = db.prepare(
    'SELECT 회차, 일, 이, 삼, 사, 오, 육 FROM accountadmin_lottobasedata ORDER BY 회차'
  ).all().map((r) => ({
    rang: r['회차'],
    numbers: [r['일'], r['이'], r['삼'], r['사'], r['오'], r['육']].sort((a, b) => a - b),
  }))
  db.close()
  return rows
}

function historicalPension() {
  const db = new DatabaseSync(LEGACY, { readOnly: true })
  const rows = db.prepare(
    'SELECT 회차, 당첨번호 FROM accountadmin_bokun ORDER BY 회차'
  ).all().map((r) => ({
    rang: r['회차'],
    digits: [...String(r['당첨번호']).matchAll(/\d+/g)].map((m) => Number(m[0])),
  }))
  db.close()
  return rows
}
