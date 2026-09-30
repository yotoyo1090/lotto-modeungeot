// Le pré-calcul — ou plutôt son absence.
//
// Le plan initial prévoyait de figer chaque semaine les résultats des huit
// analyses dans des fichiers statiques. La mesure a tranché autrement :
// toutes les analyses réunies prennent **7 millisecondes** sur 1 238
// tirages, et les données brutes tiennent en 41 Ko. Précalculer aurait
// produit des mégaoctets de fichiers pour économiser sept millisecondes.
//
// Donc on n'exporte que les tirages. Le navigateur importe `src/core/` —
// exactement le même code que celui vérifié par les 168 tests — et refait
// tout à l'affichage. Trois conséquences, toutes bonnes :
//
//   * les analyses deviennent **vivantes** : changer la période recalcule,
//     au lieu de demander un fichier par période imaginable ;
//   * il n'y a **rien à invalider**, donc rien qui puisse être périmé sans
//     qu'on s'en aperçoive ;
//   * il n'existe toujours qu'**une seule** implémentation de chaque calcul.
//
// Les gains et les 비고 sont à part : volumineux, et utiles seulement quand
// on ouvre un tirage précis. Le site les charge à la demande.
//
//   node --experimental-sqlite tools/build.js [chemin/lotto.sqlite]

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { DEFAULT_PATH, fingerprint, getDraws, getPension, open } from '../src/node/db.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const OUT = join(HERE, '..', 'web', 'public', 'data')

/** Colonnes plutôt que lignes : trois fois plus petit, et prêt pour `fromRows`. */
function columns(rows, pick) {
  const out = {}
  for (const [name, read] of Object.entries(pick)) out[name] = rows.map(read)
  return out
}

export function build(dbPath = DEFAULT_PATH, out = OUT) {
  const db = open(dbPath)
  const draws = getDraws(db)
  const pension = getPension(db)

  const lotto = {
    n: draws.length,
    ...columns(draws, {
      rangs: (r) => r.rang,
      dates: (r) => r.date,
      bonus: (r) => r.bonus,
    }),
    // À plat, pas de tableaux imbriqués : `[1,2,3,...]` au lieu de
    // `[[1,2,3],...]` économise deux caractères par numéro, soit 15 Ko.
    numbers: draws.flatMap((r) => r.numbers),
  }

  const annuity = {
    n: pension.length,
    ...columns(pension, {
      rangs: (r) => r.rang,
      dates: (r) => r.date,
      groups: (r) => r.group,
    }),
    digits: pension.flatMap((r) => r.digits),
    bonus: pension.flatMap((r) => r.bonus),
  }

  // Gains et 비고, indexés par 회차 — chargés seulement quand on ouvre un
  // tirage. Un objet plat plutôt qu'une liste : le site y accède par clé.
  const prizes = {}
  for (const row of db.prepare(
    'SELECT rang, rank, winners, amount FROM prizes ORDER BY rang, rank').all()) {
    ;(prizes[row.rang] ??= {})[row.rank] = [row.winners, row.amount]
  }
  // Les étiquettes 추첨기, si la table a été remplie. Un objet plat
  // 회차 → machine ; vide tant que `tools/import-hogi.js` n'a pas tourné.
  const hogi = {}
  for (const row of db.prepare('SELECT rang, machine FROM machines ORDER BY rang').all()) {
    hogi[row.rang] = row.machine
  }
  // L'ordre de sortie, 회차 → [o1…o6], vide tant que `crawl.js order` n'a
  // pas tourné.
  const order = {}
  for (const row of db.prepare('SELECT * FROM ball_order ORDER BY rang').all()) {
    order[row.rang] = [row.o1, row.o2, row.o3, row.o4, row.o5, row.o6]
  }
  // Les modes de choix des gagnants du 1등, sous la clé « t » du même
  // objet : [자동, 수동, 반자동]. Absent tant que la page n'a pas été relue en JSON.
  for (const row of db.prepare('SELECT rang, auto, manual, semi FROM win_types').all()) {
    ;(prizes[row.rang] ??= {}).t = [row.auto, row.manual, row.semi]
  }
  const notes = {}
  for (const row of db.prepare(
    'SELECT rang, note FROM draw_notes ORDER BY rang, position').all()) {
    ;(notes[row.rang] ??= []).push(row.note)
  }

  const meta = {
    fingerprint: fingerprint(db),
    lotto: last(draws, (r) => r.rang, (r) => r.date),
    pension: last(pension, (r) => r.rang, (r) => r.date),
  }
  db.close()

  mkdirSync(out, { recursive: true })
  const written = []
  const emit = (name, value) => {
    const text = JSON.stringify(value)
    writeFileSync(join(out, name), text)
    written.push({ name, bytes: Buffer.byteLength(text) })
  }
  emit('lotto.json', lotto)
  emit('pension.json', annuity)
  emit('prizes.json', prizes)
  emit('notes.json', notes)
  emit('hogi.json', hogi)
  emit('order.json', order)
  emit('meta.json', meta)
  return { written, meta }
}

function last(rows, rang, date) {
  const row = rows.at(-1)
  return { n: rows.length, rang: row ? rang(row) : null, date: row ? date(row) : null }
}

function main() {
  const path = process.argv[2] ?? DEFAULT_PATH
  const { written, meta } = build(path)
  console.log(`empreinte ${meta.fingerprint}`)
  console.log(`로또 6/45      ${meta.lotto.n} tirages · dernier 회차 ${meta.lotto.rang} (${meta.lotto.date})`)
  console.log(`연금복권 720+   ${meta.pension.n} tirages · dernier 회차 ${meta.pension.rang} (${meta.pension.date})`)
  console.log()
  let total = 0
  for (const { name, bytes } of written) {
    total += bytes
    console.log(`  ${name.padEnd(14)} ${(bytes / 1024).toFixed(0).padStart(5)} Ko`)
  }
  console.log(`  ${'total'.padEnd(14)} ${(total / 1024).toFixed(0).padStart(5)} Ko`)
}

// « Ce fichier est-il lancé directement ? » — en passant par pathToFileURL.
// Comparer à `file://${process.argv[1]}` marche sur Linux et jamais sur
// Windows. Et `process.argv[1]` est absent sous `node -e`, d'où la garde.
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (import.meta.url === entry) main()
