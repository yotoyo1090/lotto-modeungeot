// 분배 — le modèle de partage, et le contrôle qui l'autorise.
//
// Ce n'est pas un test d'implémentation : c'est le test qui dit si le
// modèle a encore le droit d'exister. Il rejoue les 1 238 회차 et exige que
// l'indice réellement observé monte d'une bande à l'autre. Le jour où il ne
// monte plus, il faut réajuster `SHARING_MODEL` — pas assouplir le test.
//
// Le contrôle sur base s'ignore de lui-même si data/lotto.sqlite est absent.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { fromRows } from '../src/core/draws.js'
import { generate, matches, toArrays } from '../src/core/generator.js'
import {
  EXPECTED_PER_FIFTH, SHARING_BANDS, sharing, sharingBand, sharingCalibration,
  sharingFactors, sharingIndex, sharingRange,
} from '../src/core/sharing.js'

const DB = process.env.LOTTO_DB ?? 'data/lotto.sqlite'
const skip = !existsSync(DB) && 'data/lotto.sqlite absent'

test('le facteur de conversion 5등 → 1등 vaut 182 780', () => {
  assert.equal(Math.round(EXPECTED_PER_FIFTH), 182780)
})

test('les trois facteurs se lisent sur la grille', () => {
  // 1152회 — six numéros dans une seule dizaine, 35 gagnants.
  assert.deepEqual(sharingFactors([30, 31, 32, 35, 36, 37]),
    { runs: 4, small: 0, spread: 7 })
  // 1128회 — trois numéros sous 10, 63 gagnants.
  assert.deepEqual(sharingFactors([1, 5, 8, 16, 28, 33]),
    { runs: 0, small: 3, spread: 32 })
  // L'ordre d'entrée ne compte pas.
  assert.deepEqual(sharingFactors([37, 30, 36, 31, 35, 32]),
    sharingFactors([30, 31, 32, 35, 36, 37]))
})

test('une grille mal formée est refusée', () => {
  assert.throws(() => sharingFactors([1, 2, 3, 4, 5]))
  assert.throws(() => sharingFactors([1, 2, 3, 4, 5, 46]))
  assert.throws(() => sharingFactors([1, 1, 3, 4, 5, 6]))
})

test('les grilles géométriques sortent en tête', () => {
  const crowded = sharingIndex([30, 31, 32, 35, 36, 37])
  const rare = sharingIndex([13, 16, 32, 40, 41, 45])
  assert.ok(crowded > rare * 1.5, `${crowded} vs ${rare}`)
  assert.equal(sharingBand(crowded).key, 'crowded')
  assert.equal(sharingBand(rare).key, 'rare')
})

test('l’indice reste dans les bornes du modèle', () => {
  const { min, max } = sharingRange()
  assert.ok(min > 0.8 && max < 2)
  for (const g of [[1, 2, 3, 4, 5, 6], [40, 41, 42, 43, 44, 45], [7, 14, 21, 28, 35, 42]]) {
    const i = sharingIndex(g)
    assert.ok(i >= min - 1e-9 && i <= max + 1e-9, `${g} → ${i}`)
  }
})

test('sharing() rend la part inverse de l’indice', () => {
  const s = sharing([13, 16, 32, 40, 41, 45])
  assert.ok(Math.abs(s.share * s.index - 1) < 1e-12)
  assert.ok(SHARING_BANDS.some((b) => b.key === s.band))
})

test('l’indice observé monte de bande en bande', { skip }, () => {
  const db = new DatabaseSync(DB, { readOnly: true })
  const draws = fromRows(db.prepare(
    'SELECT rang, n1, n2, n3, n4, n5, n6, bonus FROM draws ORDER BY rang').all()
    .map((r) => ({
      rang: r.rang,
      numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6],
      bonus: r.bonus,
    })))

  const prizes = new Map()
  for (const r of db.prepare(
    'SELECT rang, rank, winners FROM prizes WHERE rank IN (1, 5)').all()) {
    const cell = prizes.get(r.rang) ?? { first: 0, fifth: 0 }
    if (r.rank === 1) cell.first = r.winners ?? 0
    else cell.fifth = r.winners ?? 0
    prizes.set(r.rang, cell)
  }
  db.close()

  const { rows, total } = sharingCalibration(draws, prizes)

  // Le proxy 5등 est calibré : sur l'ensemble, observé ≈ attendu.
  assert.ok(Math.abs(total.index - 1) < 0.01, `indice global ${total.index}`)

  // Et le classement sépare — c'est la seule chose qui justifie ce fichier.
  const seen = rows.filter((r) => r.draws > 0)
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i].index > seen[i - 1].index,
      `${seen[i - 1].key} ${seen[i - 1].index} → ${seen[i].key} ${seen[i].index}`)
  }
  assert.ok(seen[seen.length - 1].index / seen[0].index > 1.4,
    `écart extrême ${seen[seen.length - 1].index / seen[0].index}`)
})

// ------------------------------------------------- le branchement générateur

test('le filtre 분배 ne garde que les grilles sous le seuil', () => {
  const r = generate({ sharing: [0, 0.90] }, { limit: 20000 })
  assert.ok(r.kept > 0)
  for (const g of toArrays(r)) {
    assert.ok(sharingIndex(g) <= 0.90, `${g} → ${sharingIndex(g)}`)
  }
})

test('generate et matches disent la même chose', () => {
  const filters = { sharing: [0, 0.90], total: [150, 175] }
  for (const g of toArrays(generate(filters, { sample: 50, seed: 1239 }))) {
    assert.equal(matches(g, filters), null, `${g} devrait passer`)
  }
  // Et la réciproque : une grille très jouée est refusée, en nommant 분배.
  assert.equal(matches([30, 31, 32, 35, 36, 37], { sharing: [0, 0.90] }), 'sharing')
})

test('le filtre 분배 ne change pas le compte des autres critères', () => {
  const cell = (r) => r.rejected.find((x) => x.key === 'sharing')

  // Bornes larges : le 분배 n'écarte rien, donc il ne figure pas au rapport
  // — `report()` ne liste que les critères qui ont réellement coupé.
  const base = generate({ total: [150, 175] }, { limit: 1 })
  const wide = generate({ total: [150, 175], sharing: [0, 2] }, { limit: 1 })
  assert.equal(wide.kept, base.kept)
  assert.equal(cell(wide), undefined)

  // Bornes serrées : il coupe, et il le dit sous son nom.
  const tight = generate({ total: [150, 175], sharing: [0, 0.90] }, { limit: 1 })
  assert.ok(tight.kept < base.kept)
  assert.equal(cell(tight).label, '분배')
  assert.ok(cell(tight).rejected > 0)
})

test('des bornes 분배 mal formées sont refusées', () => {
  assert.throws(() => generate({ sharing: [1.2, 0.8] }))
  assert.throws(() => generate({ sharing: ['a', 1] }))
})

// ------------------------------------------------------------ l'outil MCP

test('l’outil generate expose 분배 et le garde à part', { skip }, async () => {
  const S = await import('../src/mcp/server.js')
  const { open } = await import('../src/node/db.js')

  const schema = S.TOOLS.find((t) => t.name === 'generate').inputSchema
  assert.equal(schema.properties.sharing.items.type, 'number')

  const db = open(DB, { readOnly: true })
  const out = JSON.parse(S.call(db, 'generate',
    { total: [150, 175], sharing: [0, 0.90], sample: 4, seed: 1239 }))
  db.close()

  // `조합` garde sa forme d'origine — six numéros par ligne, rien autour.
  assert.equal(out.조합.length, 4)
  for (const g of out.조합) assert.equal(g.length, 6)

  // Et l'indice arrive en parallèle, jamais à l'intérieur.
  assert.equal(out.분배.length, 4)
  for (let i = 0; i < 4; i++) {
    assert.ok(out.분배[i].지표 <= 0.90)
    assert.equal(out.분배[i].지표, Number(sharingIndex(out.조합[i]).toFixed(3)))
  }
  assert.ok(out.제외된_조건.some((r) => r.label === '분배'))
})

test('popularity : même classement des formes que sharingIndex, échelle plus large', async () => {
  const { popularity, sharingIndex } = await import('../src/core/sharing.js')
  const rare = [10, 20, 21, 30, 40, 45]        // 1 paire · 0 petit · large
  const crowded = [1, 2, 3, 4, 5, 6]           // 5 paires · 6 petits · serré
  assert.ok(popularity(rare) < 1 && popularity(crowded) > 1)
  assert.ok(sharingIndex(rare) < sharingIndex(crowded))
  assert.ok(popularity(crowded) / popularity(rare) > sharingIndex(crowded) / sharingIndex(rare))
  // La grille moyenne des tirages vaut ~1 : la constante de normalisation est celle des 1 240 tirages.
  assert.ok(Math.abs(popularity([3, 11, 20, 27, 35, 41]) - 0.81 / 0.4707 * 0.4707) < 2)
})
