// Le socle données : contraintes, validation, idempotence, et parité
// avec l'ancienne base Django.
//
// Les tests de parité s'ignorent d'eux-mêmes si `db.sqlite3` n'est pas là :
// le projet n'en dépend pas, seule la vérification en a besoin.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import {
  open, putDraws, putPension, getDraws, getPension, getPrizes, getNotes,
  status, gaps, fingerprint, setMeta, getMeta, logCrawl, lastCrawls,
  transaction, validateDraw, validatePension, ValidationError, lottoDate,
  summarize,
} from '../src/node/db.js'
import {
  importLegacy, parseMoney, parseNotes, parseDigits,
} from '../tools/import-legacy.js'

const LEGACY = process.env.LEGACY_DB ?? '/root/core/db.sqlite3'
const hasLegacy = existsSync(LEGACY)

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'lotto-'))
  const db = open(join(dir, 'test.sqlite'))
  return { db, dir, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }) } }
}

const draw = (rang, first = 3) => ({
  rang, numbers: [first, 11, 19, 24, 31, 44], bonus: 7,
})

// ------------------------------------------------------- la base se défend

test('le schéma refuse un tirage mal formé, même sans passer par la validation', () => {
  const { db, cleanup } = scratch()
  const raw = (values) => () => db.prepare(
    'INSERT INTO draws (rang, date, n1, n2, n3, n4, n5, n6, bonus) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...values)

  assert.throws(raw([1, '2002-12-07', 10, 9, 20, 30, 40, 45, 5]),
    /CHECK/, 'numéros non croissants')
  assert.throws(raw([2, '2002-12-07', 10, 10, 20, 30, 40, 45, 5]),
    /CHECK/, 'numéro en double')
  assert.throws(raw([3, '2002-12-07', 0, 9, 20, 30, 40, 45, 5]),
    /CHECK/, 'numéro hors bornes')
  assert.throws(raw([4, '2002-12-07', 1, 9, 20, 30, 40, 46, 5]),
    /CHECK/, 'numéro au-dessus de 45')
  assert.throws(raw([5, '2002-12-07', 1, 9, 20, 30, 40, 45, 20]),
    /CHECK/, 'bonus déjà tiré')
  assert.throws(raw([6, 'pas-une-date', 1, 9, 20, 30, 40, 45, 5]),
    /CHECK/, 'date mal formée')
  cleanup()
})

test('le schéma refuse un 연금복권 mal formé', () => {
  const { db, cleanup } = scratch()
  const raw = (grp, d1) => () => db.prepare(
    'INSERT INTO pension (rang, date, grp, d1,d2,d3,d4,d5,d6, b1,b2,b3,b4,b5,b6) ' +
    'VALUES (1, NULL, ?, ?, 4,5,9,1,4, 2,5,6,3,4,7)').run(grp, d1)
  assert.throws(raw(6, 2), /CHECK/, '조 hors de 1..5')
  assert.throws(raw(3, 10), /CHECK/, 'chiffre au-dessus de 9')
  assert.throws(raw(3, -1), /CHECK/, 'chiffre négatif')
  // Les répétitions, elles, sont permises — c'est la règle du produit.
  assert.doesNotThrow(raw(3, 4))
  cleanup()
})

test('un 회차 ne peut pas exister deux fois', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [draw(10)])
  assert.throws(() => db.prepare(
    'INSERT INTO draws (rang, date, n1,n2,n3,n4,n5,n6, bonus) ' +
    'VALUES (10, \'2003-01-01\', 1,2,3,4,5,6, 7)').run(), /UNIQUE|PRIMARY/)
  cleanup()
})

// --------------------------------------------------------------- validation

test('la validation explique ce qui ne va pas', () => {
  const cases = [
    [{ rang: 0, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 }, /회차 invalide/],
    [{ rang: 9, numbers: [1, 2, 3, 4, 5], bonus: 7 }, /au lieu de 6/],
    [{ rang: 9, numbers: [1, 2, 3, 4, 5, 5], bonus: 7 }, /en double/],
    [{ rang: 9, numbers: [1, 2, 3, 4, 5, 46], bonus: 7 }, /hors de 1\.\.45/],
    [{ rang: 9, numbers: [1, 2, 3, 4, 5, 6], bonus: 6 }, /déjà tiré/],
    [{ rang: 9, numbers: [1, 2, 3, 4, 5, 6], bonus: 99 }, /bonus invalide/],
    [{ rang: 9, numbers: [1, 2, 3, 4, 5, 6], bonus: 7, date: 'hier' }, /date invalide/],
  ]
  for (const [row, pattern] of cases) {
    assert.throws(() => validateDraw(row), (e) =>
      e instanceof ValidationError && pattern.test(e.message),
      `attendu ${pattern} pour ${JSON.stringify(row)}`)
  }
})

test('la validation 연금복권 explique aussi', () => {
  assert.throws(() => validatePension({ rang: 1, group: 9, digits: [1, 2, 3, 4, 5, 6], bonus: [1, 2, 3, 4, 5, 6] }),
    /조 invalide/)
  assert.throws(() => validatePension({ rang: 1, group: 3, digits: [1, 2, 3], bonus: [1, 2, 3, 4, 5, 6] }),
    /6 chiffres/)
  assert.throws(() => validatePension({ rang: 1, group: 3, digits: [1, 2, 3, 4, 5, 10], bonus: [1, 2, 3, 4, 5, 6] }),
    /hors de 0\.\.9/)
})

test('les numéros sont triés et la date déduite du 회차', () => {
  const clean = validateDraw({ rang: 1, numbers: [40, 10, 33, 23, 37, 29], bonus: 16 })
  assert.deepEqual(clean.numbers, [10, 23, 29, 33, 37, 40])
  assert.equal(clean.date, '2002-12-07', 'le tirage n°1 est le 7 décembre 2002')
  assert.equal(lottoDate(1134), '2024-08-24')
})

// -------------------------------------------------------------- idempotence

test('réintégrer les mêmes tirages ne change rien', () => {
  const { db, cleanup } = scratch()
  const first = putDraws(db, [draw(1), draw(2)])
  assert.deepEqual(first.added, [1, 2])
  assert.equal(first.changed, true)

  const again = putDraws(db, [draw(1), draw(2)])
  assert.deepEqual(again.added, [])
  assert.deepEqual(again.unchanged, [1, 2])
  assert.equal(again.changed, false)
  cleanup()
})

test('rien n\'est écrasé sans le demander', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [draw(5, 3)])
  putDraws(db, [draw(5, 4)])
  assert.equal(getDraws(db)[0].numbers[0], 3, 'la valeur d\'origine tient')
  putDraws(db, [draw(5, 4)], { overwrite: true })
  assert.equal(getDraws(db)[0].numbers[0], 4)
  cleanup()
})

test('une ligne refusée n\'empêche pas les autres', () => {
  const { db, cleanup } = scratch()
  const report = putDraws(db, [draw(1), { rang: 2, numbers: [1], bonus: 3 }, draw(3)])
  assert.deepEqual(report.added, [1, 3])
  assert.equal(report.rejected.length, 1)
  assert.equal(report.rejected[0].rang, 2)
  assert.match(summarize(report), /2 ajoutés.*1 refusés/)
  cleanup()
})

test('une transaction qui échoue ne laisse rien derrière', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [draw(1)])
  assert.throws(() => transaction(db, () => {
    putDraws(db, [draw(2)])
    throw new Error('panne au milieu')
  }))
  assert.equal(getDraws(db).length, 1, 'le tirage 2 a été annulé')
  cleanup()
})

// ------------------------------------------------------- gains et 비고

test('les gains et le 비고 font l\'aller-retour', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [{
    ...draw(1),
    prizes: { 1: { winners: 14, amount: 1755689384 }, 5: { winners: 2807905, amount: 5000 } },
    notes: ['1등', '자동8', '수동4'],
  }])
  const prizes = getPrizes(db, 1)
  assert.equal(prizes[1].amount, 1755689384)
  assert.equal(prizes[5].winners, 2807905)
  assert.deepEqual(getNotes(db, 1), ['1등', '자동8', '수동4'])
  cleanup()
})

test('supprimer un tirage emporte ses gains et ses notes', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [{ ...draw(1), prizes: { 1: { winners: 1, amount: 100 } }, notes: ['x'] }])
  db.prepare('DELETE FROM draws WHERE rang = 1').run()
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM prizes').get().n, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM draw_notes').get().n, 0)
  cleanup()
})

// ------------------------------------------------------------------- état

test('les trous sont détectés par la base elle-même', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [draw(1), draw(2), draw(5)])
  assert.deepEqual(gaps(db, 'lotto'), [3, 4])
  assert.deepEqual(gaps(db, 'lotto', 7), [3, 4, 6, 7])
  cleanup()
})

test('le retard est calculé en semaines', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [{ rang: 1, numbers: [10, 23, 29, 33, 37, 40], bonus: 16 }])
  const [lotto] = status(db, new Date('2002-12-21'))
  assert.equal(lotto.lastRang, 1)
  assert.equal(lotto.staleWeeks, 2)
  cleanup()
})

test('l\'empreinte change quand les données changent, pas autrement', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [draw(1)])
  const before = fingerprint(db)
  assert.equal(fingerprint(db), before, 'stable à données égales')
  putDraws(db, [draw(2)])
  assert.notEqual(fingerprint(db), before)
  cleanup()
})

test('le journal de crawl garde une trace', () => {
  const { db, cleanup } = scratch()
  logCrawl(db, { product: 'lotto', mode: 'latest', added: 3 })
  logCrawl(db, { product: 'pension', mode: 'verify', failed: 1, detail: 'écart' })
  const rows = lastCrawls(db)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].product, 'pension')
  assert.equal(rows[0].detail, 'écart')
  cleanup()
})

test('meta fait l\'aller-retour', () => {
  const { db, cleanup } = scratch()
  assert.equal(getMeta(db, 'absent'), null)
  setMeta(db, 'k', 'v1'); setMeta(db, 'k', 'v2')
  assert.equal(getMeta(db, 'k'), 'v2')
  cleanup()
})

// -------------------------------------------------------------------- vues

test('les vues déplient les numéros pour le SQL', () => {
  const { db, cleanup } = scratch()
  putDraws(db, [draw(1), draw(2)])
  putPension(db, [{ rang: 1, group: 3, digits: [2, 4, 5, 9, 1, 4], bonus: [2, 5, 6, 3, 4, 7] }])

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM draw_numbers').get().n, 14,
    '2 tirages × 7 positions')
  // Compter les sorties d'un numéro devient une ligne de SQL.
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM draw_numbers WHERE number = 11').get().n, 2)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pension_digits').get().n, 12)
  assert.equal(
    db.prepare("SELECT digit FROM pension_digits WHERE source='digits' AND position=1")
      .get().digit, 2)
  cleanup()
})

// -------------------------------------------------- parsers de l'ancien format

test('les montants coréens deviennent des entiers', () => {
  assert.equal(parseMoney('1,755,689,384원'), 1755689384)
  assert.equal(parseMoney('5,000원'), 5000)
  assert.equal(parseMoney('0'), null)
  assert.equal(parseMoney(''), null)
  assert.equal(parseMoney(null), null)
})

test('le 비고 est relu depuis la repr() Python', () => {
  assert.deepEqual(parseNotes("['1등', '자동8', '수동4', '반자동2']"),
    ['1등', '자동8', '수동4', '반자동2'])
  assert.deepEqual(parseNotes('0'), [])
  assert.deepEqual(parseNotes(null), [])
  // 143 tirages portent la liste vide écrite littéralement.
  assert.deepEqual(parseNotes('[]'), [])
  assert.deepEqual(parseNotes('[ ]'), [])
})

test('les chiffres du 연금복권 sont relus', () => {
  assert.deepEqual(parseDigits('[2, 4, 5, 9, 1, 4]'), [2, 4, 5, 9, 1, 4])
  assert.deepEqual(parseDigits('[0, 0, 0, 0, 0, 0]'), [0, 0, 0, 0, 0, 0])
})

// ------------------------------------------------------------------ parité

test('parité avec l\'ancienne base Django', { skip: !hasLegacy && 'db.sqlite3 absent' }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lotto-parity-'))
  const target = join(dir, 'lotto.sqlite')
  const { draws, pension, db } = importLegacy(LEGACY, target)
  const legacy = new DatabaseSync(LEGACY, { readOnly: true })

  await t.test('rien n\'a été refusé', () => {
    assert.deepEqual(draws.rejected, [])
    assert.deepEqual(pension.rejected, [])
  })

  await t.test('les comptes correspondent', () => {
    const n = legacy.prepare('SELECT COUNT(*) AS n FROM accountadmin_lottobasedata').get().n
    const p = legacy.prepare('SELECT COUNT(*) AS n FROM accountadmin_bokun').get().n
    assert.equal(getDraws(db).length, n)
    assert.equal(getPension(db).length, p)
  })

  await t.test('chaque tirage 6/45 est identique, gains et 비고 compris', () => {
    const rows = legacy.prepare(
      'SELECT * FROM accountadmin_lottobasedata ORDER BY 회차').all()
    const mine = new Map(getDraws(db).map((d) => [d.rang, d]))
    for (const r of rows) {
      const got = mine.get(r['회차'])
      assert.ok(got, `회차 ${r['회차']} manquant`)
      assert.deepEqual(got.numbers,
        [r['일'], r['이'], r['삼'], r['사'], r['오'], r['육']].sort((a, b) => a - b),
        `회차 ${r['회차']} · numéros`)
      assert.equal(got.bonus, r['보너스'], `회차 ${r['회차']} · bonus`)
      const prizes = getPrizes(db, r['회차'])
      assert.equal(prizes[1]?.amount ?? null, parseMoney(r['일등당첨금액']),
        `회차 ${r['회차']} · 1등 당첨금액`)
      assert.deepEqual(getNotes(db, r['회차']), parseNotes(r['비고']),
        `회차 ${r['회차']} · 비고`)
    }
  })

  await t.test('chaque tirage 연금복권 est identique', () => {
    const rows = legacy.prepare('SELECT * FROM accountadmin_bokun ORDER BY 회차').all()
    const mine = new Map(getPension(db).map((d) => [d.rang, d]))
    for (const r of rows) {
      const got = mine.get(r['회차'])
      assert.ok(got, `회차 ${r['회차']} manquant`)
      assert.equal(got.group, r['조'], `회차 ${r['회차']} · 조`)
      assert.deepEqual(got.digits, parseDigits(r['당첨번호']), `회차 ${r['회차']} · 당첨번호`)
      assert.deepEqual(got.bonus, parseDigits(r['보너스']), `회차 ${r['회차']} · 보너스`)
    }
  })

  await t.test('aucun trou dans l\'historique', () => {
    assert.deepEqual(gaps(db, 'lotto'), [])
    assert.deepEqual(gaps(db, 'pension'), [])
  })

  await t.test('réimporter ne change rien', () => {
    const second = importLegacy(LEGACY, target)
    assert.deepEqual(second.draws.added, [])
    assert.deepEqual(second.draws.updated, [])
    assert.deepEqual(second.pension.added, [])
    second.db.close()
  })

  legacy.close(); db.close()
  rmSync(dir, { recursive: true, force: true })
})

// ------------------------------------------------------- portabilité Windows

test('le point d\'entrée se détecte aussi sous Windows', async () => {
  // `import.meta.url` vaut file:///C:/Users/... alors que process.argv[1]
  // vaut C:\Users\... — les comparer directement ne marche que sous Linux.
  const { fileURLToPath, pathToFileURL } = await import('node:url')

  // Le seul aller-retour qui ait un sens partout : le chemin de ce fichier,
  // écrit selon les règles de la plateforme qui exécute le test.
  //
  // La version précédente de ce test attendait `file:///a/b.js` pour l'entrée
  // `/a/b.js`. C'est vrai sous Linux et faux sous Windows, où un chemin
  // enraciné sans lettre de lecteur reçoit celle du lecteur courant et
  // devient `file:///C:/a/b.js`. Le test échouait donc exactement là où il
  // prétendait garantir quelque chose — trouvé en le lançant sous Windows.
  const here = fileURLToPath(import.meta.url)
  assert.equal(pathToFileURL(here).href, import.meta.url)

  // Et le motif employé dans les outils, sur un chemin Windows littéral :
  // la conversion produit toujours une URL à trois barres obliques…
  const windowsPath = 'C:\\Users\\x\\tools\\import-legacy.js'
  const url = pathToFileURL(windowsPath).href
  assert.ok(url.startsWith('file:///'), url)
  assert.ok(!url.includes('\\'), 'les barres inverses doivent disparaître')

  // …tandis que la comparaison naïve, elle, ne peut pas correspondre.
  // C'est précisément le bug que la garde des outils évite.
  assert.notEqual(url, `file://${windowsPath}`)
})
