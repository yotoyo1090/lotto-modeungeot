// Le filet de sécurité du portage.
//
// Certaines analyses n'ont pas d'équivalent stocké dans l'ancienne base :
// les co-occurrences, le recouvrement glissant, les signatures 구간, les
// températures des gagnants. La parité ne peut donc rien dire d'elles.
//
// `fixtures-python.json` contient la sortie de l'implémentation Python de
// référence sur les 1 134 premiers tirages. Si le JavaScript diverge d'une
// virgule, ce test le dit.
//
// Le fichier est figé : il ne change que si on décide sciemment de changer
// une définition — auquel cas il faut le regénérer, et l'expliquer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { fromRows } from '../src/core/draws.js'
import * as metrics from '../src/core/metrics.js'
import * as analysis from '../src/core/analysis.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, 'fixtures-python.json')
const LEGACY = process.env.LEGACY_DB ?? '/root/core/db.sqlite3'
const skip = (!existsSync(FIXTURE) && 'fixture absente') ||
             (!existsSync(LEGACY) && 'db.sqlite3 absent')

function load() {
  const db = new DatabaseSync(LEGACY, { readOnly: true })
  const rows = db.prepare(
    'SELECT 회차, 일, 이, 삼, 사, 오, 육, 보너스 FROM accountadmin_lottobasedata ' +
    'ORDER BY 회차'
  ).all().map((r) => ({
    rang: r['회차'],
    numbers: [r['일'], r['이'], r['삼'], r['사'], r['오'], r['육']],
    bonus: r['보너스'],
  }))
  db.close()
  const reference = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  // La référence porte sur les `n` premiers tirages : on aligne.
  return { draws: fromRows(rows.slice(0, reference.n)), reference }
}

/** Les clés JSON sont des chaînes : on compare sur la même base. */
const asStringKeys = (object) =>
  Object.fromEntries(Object.entries(object).map(([k, v]) => [String(k), v]))

test('le JavaScript donne les mêmes résultats que la référence Python',
  { skip }, async (t) => {
    const { draws, reference } = load()
    const m = metrics.compute(draws)

    await t.test('même nombre de tirages', () => {
      assert.equal(draws.n, reference.n)
    })

    await t.test('fréquences', () => {
      assert.deepEqual(asStringKeys(analysis.frequency(draws)),
        asStringKeys(reference.frequency))
      assert.deepEqual(asStringKeys(analysis.frequency(draws, { withBonus: true })),
        asStringKeys(reference.frequency_bonus))
    })

    await t.test('co-occurrences', () => {
      // Les deux implémentations comptent pareil ; elles ne départageaient
      // pas les ex æquo de la même façon. `np.argsort` de la référence les
      // laisse dans un ordre arbitraire, la version JS les range par numéro
      // croissant — déterministe, donc préférable. On compare après avoir
      // appliqué le même ordre aux deux côtés.
      const canonical = (pairs) => [...pairs]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      for (const [number, key] of [[7, 'companions_7'], [33, 'companions_33']]) {
        const got = analysis.companionsOf(draws, number, 12).pairs
          .map(({ number: n, together }) => [n, together])
        assert.deepEqual(canonical(got), canonical(reference[key]),
          `amis du ${number}`)
      }
    })

    await t.test('les ex æquo des co-occurrences sont ordonnés par numéro', () => {
      const { pairs } = analysis.companionsOf(draws, 7, 20)
      for (let i = 1; i < pairs.length; i++) {
        if (pairs[i].together !== pairs[i - 1].together) continue
        assert.ok(pairs[i].number > pairs[i - 1].number,
          `ex æquo à ${pairs[i].together} : ${pairs[i - 1].number} avant ${pairs[i].number}`)
      }
    })

    await t.test('recouvrement sur 14 tirages', () => {
      assert.deepEqual([...analysis.overlap(draws, 14)], reference.overlap_14)
      assert.deepEqual(asStringKeys(analysis.distribution(analysis.overlap(draws, 14))),
        asStringKeys(reference.overlap_dist))
    })

    await t.test('signatures 구간', () => {
      assert.deepEqual(analysis.sectionSignatures(draws), reference.signatures)
      assert.deepEqual(analysis.sectionSignatures(draws, { withBonus: false }),
        reference.signatures_nobonus)
    })

    await t.test('températures des gagnants', () => {
      const got = analysis.temperatureOfWinners(draws)
      const width = 4
      const rows = []
      for (let i = 0; i < draws.n; i++) {
        rows.push([...got.subarray(i * width, (i + 1) * width)])
      }
      assert.deepEqual(rows, reference.temp_winners)
    })

    await t.test('흐름 : résumés', () => {
      for (const [number, key] of [[7, 'flow_7'], [45, 'flow_45'], [1, 'flow_1']]) {
        const got = analysis.flowSummary(draws, number)
        const want = reference[key]
        assert.equal(got.hits, want.hits, `${number} · sorties`)
        assert.equal(got.currentGap, want.current_gap, `${number} · écart courant`)
        assert.equal(got.gapMean, want.gap_mean, `${number} · écart moyen`)
        assert.equal(got.gapMax, want.gap_max, `${number} · écart max`)
        assert.deepEqual(asStringKeys(got.gapHistogram),
          asStringKeys(want.gap_histogram), `${number} · histogramme`)
      }
    })

    await t.test('fréquence par position de boule', () => {
      const got = analysis.positions(draws).map(asStringKeys)
      assert.deepEqual(got, reference.positions.map(asStringKeys))
    })

    await t.test('distributions d\'indicateurs', () => {
      assert.deepEqual(asStringKeys(analysis.distribution(m.total)),
        asStringKeys(reference.dist_total))
      assert.deepEqual(asStringKeys(analysis.distribution(m.ac)),
        asStringKeys(reference.dist_ac))
      assert.deepEqual(asStringKeys(analysis.distribution(m.carryCount)),
        asStringKeys(reference.dist_carry))
    })

    await t.test('구간 : les 20 derniers tirages', () => {
      const counts = analysis.sections(draws)
      const width = 5
      const rows = []
      for (let i = draws.n - 20; i < draws.n; i++) {
        rows.push([...counts.subarray(i * width, (i + 1) * width)])
      }
      assert.deepEqual(rows, reference.sections_last20)
    })
  })
