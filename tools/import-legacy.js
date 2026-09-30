// Reprise de l'ancienne base Django.
//
// On ne garde que l'irréductible : le 회차, les six numéros, le bonus, les
// gains et le 비고 pour le 6/45 ; le 조 et les deux nombres de six chiffres
// pour le 연금복권.
//
// Les 126 colonnes dérivées de `lottobasedata` et `bokun`, les six tables
// `bokchk*`, `numberpattern`, `sectionall`, `deletenumber`, `predictnumber`,
// `winnerpremiere` et `winnerseconde` sont laissées de côté : elles se
// recalculent. Pour `winnerpremiere` et `winnerseconde`, c'est même
// démontré — l'une est une copie exacte des six numéros, l'autre est
// l'ensemble des C(7,6) sous-grilles.
//
// Usage :  node --experimental-sqlite tools/import-legacy.js <db.sqlite3> [cible]

import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { open, putDraws, putPension, summarize, setMeta, status, fingerprint,
         DEFAULT_PATH } from '../src/node/db.js'

const MONEY = /\D+/g
const PRIZE_RANKS = [
  [1, '일등'], [2, '이등'], [3, '삼등'], [4, '사등'], [5, '오등'],
]

/** '1,755,689,384원' → 1755689384. Rien d'exploitable → null. */
export function parseMoney(raw) {
  if (raw === null || raw === undefined) return null
  const digits = String(raw).replace(MONEY, '')
  if (!digits) return null
  const value = Number(digits)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/** "['1등', '자동8', '수동4']" → la liste. Le champ est une repr() Python. */
export function parseNotes(raw) {
  if (raw === null || raw === undefined) return []
  const text = String(raw).trim()
  if (!text || text === '0') return []
  // La liste vide s'écrit "[]" dans l'ancienne base — 143 tirages. Sans ce
  // cas, elle deviendrait une note dont le texte est « [] ».
  if (/^\[\s*\]$/.test(text)) return []
  const items = [...text.matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((m) => (m[1] ?? m[2]).trim())
    .filter(Boolean)
  return items.length ? items : [text]
}

/** '[2, 4, 5, 9, 1, 4]' → [2,4,5,9,1,4]. */
export function parseDigits(raw) {
  if (raw === null || raw === undefined) return []
  return [...String(raw).matchAll(/-?\d+/g)].map((m) => Number(m[0]))
}

export function readLegacyDraws(legacy) {
  const columns = [
    '회차', '일', '이', '삼', '사', '오', '육', '보너스', '비고',
    ...PRIZE_RANKS.map(([, name]) => `${name}당첨자수`),
    ...PRIZE_RANKS.map(([, name]) => `${name}당첨금액`),
  ].map((c) => `"${c}"`).join(', ')

  return legacy.prepare(
    `SELECT ${columns} FROM accountadmin_lottobasedata ORDER BY 회차`
  ).all().map((r) => {
    const prizes = {}
    for (const [rank, name] of PRIZE_RANKS) {
      const winners = r[`${name}당첨자수`]
      const amount = parseMoney(r[`${name}당첨금액`])
      const count = winners === null || winners === undefined
        ? null : Math.round(Number(winners))
      if (count || amount) prizes[rank] = { winners: count ?? 0, amount }
    }
    return {
      rang: r['회차'],
      numbers: [r['일'], r['이'], r['삼'], r['사'], r['오'], r['육']],
      bonus: r['보너스'],
      prizes,
      notes: parseNotes(r['비고']),
    }
  })
}

export function readLegacyPension(legacy) {
  return legacy.prepare(
    'SELECT 회차, 당첨날짜, 조, 당첨번호, 보너스 FROM accountadmin_bokun ORDER BY 회차'
  ).all().map((r) => ({
    rang: r['회차'],
    // '2024-08-22 00:00:00' → '2024-08-22'
    date: r['당첨날짜'] ? String(r['당첨날짜']).slice(0, 10) : null,
    group: r['조'],
    digits: parseDigits(r['당첨번호']),
    bonus: parseDigits(r['보너스']),
  }))
}

export function importLegacy(legacyPath, targetPath = DEFAULT_PATH) {
  const legacy = new DatabaseSync(legacyPath, { readOnly: true })
  const db = open(targetPath)
  try {
    const draws = putDraws(db, readLegacyDraws(legacy), { overwrite: true })
    const pension = putPension(db, readLegacyPension(legacy), { overwrite: true })
    setMeta(db, 'imported_from', legacyPath)
    setMeta(db, 'imported_at', new Date().toISOString())
    return { draws, pension, db }
  } finally {
    legacy.close()
  }
}

function main() {
  const [source, target] = process.argv.slice(2)
  if (!source) {
    console.error('usage : node --experimental-sqlite tools/import-legacy.js ' +
                  '<db.sqlite3> [cible.sqlite]')
    process.exit(2)
  }
  const { draws, pension, db } = importLegacy(source, target)

  for (const [label, report] of [['로또 6/45', draws], ['연금복권 720+', pension]]) {
    console.log(`${label.padEnd(16)} ${summarize(report)}`)
    for (const { rang, why } of report.rejected.slice(0, 10)) {
      console.log(`  ✗ 회차 ${rang} : ${why}`)
    }
    if (report.rejected.length > 10) {
      console.log(`  … et ${report.rejected.length - 10} autres refus`)
    }
  }

  console.log()
  for (const s of status(db)) {
    console.log(`${s.label.padEnd(16)} ${String(s.draws).padStart(5)} tirages   ` +
                `dernier 회차 ${String(s.lastRang).padStart(5)}   ${s.lastDate}` +
                (s.gaps.length ? `   ⚠ ${s.gaps.length} trous` : ''))
  }
  console.log(`\nempreinte : ${fingerprint(db)}`)
  db.close()
}

// « Ce fichier est-il lancé directement ? » — en passant par pathToFileURL.
// Comparer à `file://${process.argv[1]}` marche sur Linux et jamais sur
// Windows, où le chemin s'écrit C:\Users\... et l'URL file:///C:/Users/...
// « Ce fichier est-il lancé directement ? » — en passant par pathToFileURL.
// Comparer à `file://${process.argv[1]}` marche sur Linux et jamais sur
// Windows. Et `process.argv[1]` est absent sous `node -e`, d'où la garde.
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (import.meta.url === entry) main()
