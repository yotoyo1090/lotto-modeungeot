// Parité du 자동조합 avec l'ancien générateur Django.
//
// La référence n'est pas une table de l'ancienne base : elle n'existe pas.
// L'ancien site n'enregistrait que le **nombre** de grilles, et sur 2 lignes
// des 248 — dont une qui annonce 120 001 grilles pour un vivier de quinze
// numéros, où C(15,6) = 5 005. Ce chiffre ne veut rien dire.
//
// La référence est donc `tools/oracle.py` : l'algorithme de
// `combinaison/views.py` L497–802, transcrit hors de Django et exécuté sur
// l'ancienne base. Il énumère les C(n, 6) combinaisons une par une, sans
// élagage. Le parcours JavaScript, lui, coupe des sous-arbres entiers sur
// des bornes. Deux algorithmes qui n'ont rien en commun et qui retiennent
// les mêmes centaines de milliers de grilles — voilà ce qui prouve le
// portage. La même méthode écrite deux fois ne prouverait rien.
//
// Le fichier de référence porte les DEUX câblages des filtres 배수 :
// `legacy`, le décalage d'un cran de l'ancien site, et `fixed`, ce que
// disent les étiquettes. C'est ce qui permet d'affirmer lequel on
// reproduit, au lieu de le supposer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { COMPOSITES, NMAX, PICK, PRIMES } from '../src/core/draws.js'
import {
  allows, buildPool, COUNT_FIELDS, criterion, EXCLUDABLE_SECTIONS,
  pairCount, pairLabel, PRESETS, preset, values, WIRINGS, wire,
} from '../src/core/criteria.js'
import { generate, matches, toArrays } from '../src/core/generator.js'

const FIXTURE = fileURLToPath(new URL('./fixtures/oracle.json', import.meta.url))
const skip = !existsSync(FIXTURE) && 'oracle.json absent — lancez tools/oracle.py'
const oracle = skip ? null : JSON.parse(readFileSync(FIXTURE, 'utf8'))

// --------------------------------------------------------------- les critères

test('un intervalle et son ensemble équivalent se comportent pareil', () => {
  const a = criterion('x', [2, 5])
  const b = criterion('x', { allow: [2, 3, 4, 5] })
  for (let v = -2; v <= 9; v++) assert.equal(allows(a, v), allows(b, v), `v = ${v}`)
  assert.equal(a.whole, true)
  assert.equal(b.whole, true)
})

test('un ensemble troué refuse ce qui est entre ses valeurs', () => {
  const c = criterion('ac', { allow: [6, 10] })
  assert.equal(c.min, 6)
  assert.equal(c.max, 10)
  assert.equal(c.whole, false)
  assert.deepEqual(values(c), [6, 10])
  for (const v of [6, 10]) assert.ok(allows(c, v), `${v} devrait passer`)
  for (const v of [5, 7, 8, 9, 11]) assert.ok(!allows(c, v), `${v} ne devrait pas`)
})

test('un critère absent laisse tout passer', () => {
  assert.equal(criterion('x', null), null)
  assert.equal(criterion('x', undefined), null)
  assert.ok(allows(null, 12345))
})

test('les valeurs négatives passent par le décalage, pas par un débordement', () => {
  const c = criterion('ac', { allow: [-3, 0, 2] })
  assert.equal(c.min, -3)
  assert.ok(allows(c, -3) && allows(c, 0) && allows(c, 2))
  assert.ok(!allows(c, -2) && !allows(c, 1))
})

test('les entrées absurdes sont refusées, pas absorbées', () => {
  assert.throws(() => criterion('x', { allow: [] }), RangeError)
  assert.throws(() => criterion('x', [5, 2]), RangeError)
  assert.throws(() => criterion('x', [1.5, 3]), TypeError)
  assert.throws(() => criterion('x', { allow: [1.5] }), TypeError)
  assert.throws(() => criterion('x', 7), TypeError)
  assert.throws(() => criterion('x', [1, 2, 3]), TypeError)
})

// ------------------------------------------------------------- 리스트추천

test('les sept viviers sont ceux du menu de l\'ancien formulaire', () => {
  assert.equal(PRESETS.length, 7)
  const byKey = Object.fromEntries(PRESETS.map((p) => [p.key, p.numbers]))

  assert.equal(byKey.all.length, NMAX)
  assert.deepEqual(byKey.mult2, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26,
    28, 30, 32, 34, 36, 38, 40, 42, 44])
  assert.deepEqual(byKey.mult3, [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45])
  assert.deepEqual(byKey.mult4, [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44])
  assert.deepEqual(byKey.mult5, [5, 10, 15, 20, 25, 30, 35, 40, 45])
  assert.deepEqual(byKey.primes, [...PRIMES])

  // L'ancien formulaire portait la liste des composés en dur dans son
  // libellé — orthographié 함성수. On la recalcule ; elle doit tomber juste.
  assert.deepEqual(byKey.composites, [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21,
    22, 24, 25, 26, 27, 28, 30, 32, 33, 34, 35, 36, 38, 39, 40, 42, 44, 45])
  assert.deepEqual(byKey.composites, [...COMPOSITES])
  assert.equal(preset('inconnu'), null)
})

test('le vivier se construit dans l\'ordre : liste, ajout, retrait, 구간', () => {
  // Ajouter un numéro puis retirer sa dizaine ne le laisse pas.
  assert.deepEqual(buildPool({ preset: 'primes', add: [1], sections: [1] }),
    [11, 13, 17, 19, 23, 29, 31, 37, 41, 43])
  // Le retrait vient après l'ajout, quel que soit l'ordre où on les donne.
  // Ce n'est pas un détail : un numéro à la fois 추가 et 제외 sort du vivier,
  // dans les deux sens. C'est le comportement de l'original, et c'est celui
  // qu'attend quelqu'un qui coche 제외 en dernier recours.
  assert.deepEqual(buildPool({ preset: 'mult5', add: [7], remove: [7] }),
    [5, 10, 15, 20, 25, 30, 35, 40, 45])
  assert.deepEqual(buildPool({ preset: 'mult5', remove: [5], add: [5] }),
    [10, 15, 20, 25, 30, 35, 40, 45])
  // Les cinq bandes couvrent 1..45 sans trou ni recouvrement.
  const covered = EXCLUDABLE_SECTIONS.flatMap((b) => b.numbers)
  assert.deepEqual([...covered].sort((a, b) => a - b),
    Array.from({ length: NMAX }, (_, i) => i + 1))
  assert.deepEqual(buildPool({ sections: [1, 10, 20, 30, 40] }), [])

  assert.throws(() => buildPool({ preset: 'nope' }), RangeError)
  assert.throws(() => buildPool({ add: [46] }), RangeError)
  assert.throws(() => buildPool({ sections: [5] }), RangeError)
})

test('les étiquettes 저고 et 홀짝 se lisent dans les deux sens', () => {
  assert.equal(pairLabel(5), '5 : 1')
  assert.equal(pairLabel(0), '0 : 6')
  assert.equal(pairCount('5 : 1'), 5)
  assert.equal(pairCount('3 : 3'), 3)
  assert.equal(pairCount(' 2:4 '), 2)
  assert.throws(() => pairCount('4 : 4'), RangeError)
  assert.throws(() => pairCount('rien'), RangeError)
})

// --------------------------------------------------------------- le câblage

test('le câblage legacy est une rotation, le fixed l\'identité', () => {
  assert.deepEqual(WIRINGS.fixed, {
    composites: 'composites', mult2: 'mult2', mult3: 'mult3',
    mult4: 'mult4', mult5: 'mult5',
  })
  // Décalage d'un cran, et 오의배수 retombe sur les composés : un cycle.
  assert.deepEqual(WIRINGS.legacy, {
    composites: 'mult2', mult2: 'mult3', mult3: 'mult4',
    mult4: 'mult5', mult5: 'composites',
  })
  const targets = Object.values(WIRINGS.legacy)
  assert.equal(new Set(targets).size, 5, 'une rotation ne perd aucun critère')

  // 소수 traverse les deux câblages sans bouger — il n'a jamais été décalé.
  assert.deepEqual(wire({ primes: [2] }, 'legacy'), { primes: [2] })
  assert.deepEqual(wire({ primes: [2] }, 'fixed'), { primes: [2] })

  assert.deepEqual(wire({ composites: [3] }, 'legacy'), { mult2: [3] })
  assert.deepEqual(wire({ composites: [3] }, 'fixed'), { composites: [3] })
  assert.throws(() => wire({}, 'autre'), RangeError)

  assert.equal(COUNT_FIELDS.length, 6)
})

// ------------------------------------------------------- parité avec l'oracle

/** Traduit un cas de l'oracle en filtres du générateur. */
function toFilters(kase, wiring) {
  const filters = {
    pool: buildPool(kase),
    include: (kase.fix ?? []).map(Number),
  }
  if (kase.total) filters.total = [kase.total[0], kase.total[1]]
  if (kase.ac) filters.ac = { allow: kase.ac }
  if (kase.low) filters.low = { allow: kase.low }
  if (kase.odd) filters.odd = { allow: kase.odd }
  if (kase.front) filters.headSum = { allow: kase.front }
  if (kase.back) filters.tailSum = { allow: kase.back }

  if (kase.carry) {
    // 이월 : le recouvrement avec les SEPT numéros du 회차 précédent.
    const previous = oracle.draws_used[String(Number(kase.rang) - 1)]
    assert.ok(previous, `회차 ${kase.rang - 1} absent du fichier de référence`)
    filters.reference = previous
    filters.match = { allow: kase.carry }
  }

  const wired = wire(kase.counts ?? {}, wiring)
  for (const [key, allow] of Object.entries(wired)) {
    if (key === 'primes' || key === 'composites') {
      filters[key] = { allow }
    } else {
      const divisor = Number(key.slice(4))     // mult3 → 3
      filters.multiples ??= {}
      filters.multiples[divisor] = { allow }
    }
  }
  return filters
}

const digest = (grids) => {
  const hash = createHash('sha256')
  for (const g of [...grids].sort(compare)) hash.update(Buffer.from(g))
  return hash.digest('hex')
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

test('les 23 cas de référence, dans les deux câblages', { skip }, () => {
  assert.ok(oracle.cases.length >= 20, `${oracle.cases.length} cas seulement`)

  let compared = 0
  let diverging = 0

  for (const kase of oracle.cases) {
    // Le vivier doit déjà coïncider — sinon tout le reste est vide de sens.
    assert.deepEqual(buildPool(kase), kase.pool, `vivier de « ${kase.name} »`)

    for (const wiring of ['legacy', 'fixed']) {
      const expected = kase.results[wiring]
      const result = generate(toFilters(kase, wiring), { limit: Infinity })

      assert.equal(result.kept, expected.count,
        `« ${kase.name} » · ${wiring} : ${result.kept} grilles contre ${expected.count}`)
      assert.equal(result.count, expected.count, 'toutes les grilles sont gardées')

      const grids = toArrays(result)
      assert.equal(digest(grids), expected.digest,
        `« ${kase.name} » · ${wiring} : ce ne sont pas les mêmes grilles`)

      if (expected.grids) {
        assert.deepEqual([...grids].sort(compare), [...expected.grids].sort(compare),
          `« ${kase.name} » · ${wiring} : grille par grille`)
      }
      compared += expected.count
    }

    if (kase.results.legacy.count !== kase.results.fixed.count) diverging++
  }

  assert.ok(compared > 500_000, `seulement ${compared} grilles comparées`)
  // Si les deux câblages ne divergeaient jamais, le test ne distinguerait
  // rien et le choix de correction ne voudrait rien dire.
  assert.ok(diverging >= 5, `seulement ${diverging} cas divergents`)
})

test('le décalage 배수 change vraiment le résultat', { skip }, () => {
  const kase = oracle.cases.find((c) => c.name.includes('오의배수숫자수'))
  assert.ok(kase, 'le cas 오의배수 est absent du fichier de référence')

  const legacy = generate(toFilters(kase, 'legacy'), { limit: Infinity })
  const fixed = generate(toFilters(kase, 'fixed'), { limit: Infinity })

  assert.notEqual(legacy.kept, fixed.kept)
  assert.ok(legacy.kept > 0 && fixed.kept > 0,
    'les deux câblages doivent produire quelque chose, sinon on ne compare rien')

  // Et le sens du décalage : cocher « 오의배수 = 1 » comptait les COMPOSÉS.
  const composites = new Set(COMPOSITES)
  const five = new Set([5, 10, 15, 20, 25, 30, 35, 40, 45])
  const wanted = kase.counts.mult5
  for (const grid of toArrays(legacy)) {
    assert.ok(wanted.includes(grid.filter((n) => composites.has(n)).length),
      `${grid} : le câblage legacy devrait compter les composés`)
  }
  for (const grid of toArrays(fixed)) {
    assert.ok(wanted.includes(grid.filter((n) => five.has(n)).length),
      `${grid} : le câblage fixed devrait compter les multiples de 5`)
  }
})

test('matches() est d\'accord avec generate() sur les ensembles', { skip }, () => {
  // La contre-épreuve lisible : on reprend un cas assez petit pour tout
  // énumérer, et on exige que la fonction écrite pour être lue retienne
  // exactement ce que le parcours rapide retient.
  const kase = oracle.cases.find((c) => c.name === 'AC en ensemble disjoint')
  const filters = toFilters(kase, 'fixed')
  const pool = filters.pool

  const kept = new Set(toArrays(generate(filters, { limit: Infinity })).map(String))
  let seen = 0
  const grid = new Array(PICK)
  const walk = (depth, start) => {
    if (depth === PICK) {
      seen++
      const ok = matches(grid, filters) === null
      assert.equal(ok, kept.has(String(grid)), `${grid}`)
      return
    }
    for (let i = start; i <= pool.length - (PICK - depth); i++) {
      grid[depth] = pool[i]
      walk(depth + 1, i + 1)
    }
  }
  walk(0, 0)
  assert.equal(seen, 5005, `${seen} grilles énumérées`)
  assert.equal(kept.size, kase.results.fixed.count)
})
