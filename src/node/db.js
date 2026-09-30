// La base : ouverture, schéma, lecture, écriture.
//
// C'est la seule porte en écriture. Le crawler passe par ici, le
// pré-calcul et le MCP ne font que lire.
//
// Deux garanties structurelles :
//
//   * la base refuse elle-même ce qui est mal formé — les CHECK du schéma
//     rendent impossible un tirage à numéros décroissants ou un bonus déjà
//     tiré, même si le code se trompe ;
//   * toute écriture est transactionnelle — une collecte interrompue ne
//     laisse jamais la moitié d'un tirage.
//
// La validation JS ci-dessous ne remplace pas les CHECK : elle les double
// pour produire un message lisible plutôt qu'une erreur SQLite brute.

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Les règles du 6/45 — rang et gain fixe — ne sont pas réécrites ici.
import { FIXED_PRIZE, rankOf } from '../core/combos.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCHEMA = readFileSync(join(HERE, 'schema.sql'), 'utf8')

export const DEFAULT_PATH = join(HERE, '..', '..', 'data', 'lotto.sqlite')

export const PRODUCTS = ['lotto', 'pension']
export const LABELS = { lotto: '로또 6/45', pension: '연금복권 720+' }

// Tirage n°1 du 6/45 — samedi 7 décembre 2002, puis chaque samedi.
const LOTTO_DRAW_ONE = Date.UTC(2002, 11, 7)
const WEEK = 7 * 24 * 3600 * 1000

export class ValidationError extends Error {}

export function lottoDate(rang) {
  return new Date(LOTTO_DRAW_ONE + (rang - 1) * WEEK).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------- ouverture

export function open(path = DEFAULT_PATH, { readOnly = false } = {}) {
  // En lecture seule, on n'applique pas le schéma et on ne crée aucun
  // dossier : le serveur MCP ne doit rien pouvoir modifier, pas même par
  // accident au moment de l'ouverture.
  if (readOnly) return new DatabaseSync(path, { readOnly: true })

  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  // WAL : les lectures ne bloquent pas l'écriture hebdomadaire.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(SCHEMA)
  return db
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// --------------------------------------------------------------- validation

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function validateDraw(row) {
  const rang = row.rang
  if (!Number.isInteger(rang) || rang < 1) {
    throw new ValidationError(`회차 invalide : ${JSON.stringify(rang)}`)
  }
  const numbers = [...(row.numbers ?? [])].map(Number).sort((a, b) => a - b)
  if (numbers.length !== 6) {
    throw new ValidationError(`회차 ${rang} : ${numbers.length} numéros au lieu de 6`)
  }
  if (new Set(numbers).size !== 6) {
    throw new ValidationError(`회차 ${rang} : numéros en double — ${numbers.join(', ')}`)
  }
  if (!numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) {
    throw new ValidationError(`회차 ${rang} : numéro hors de 1..45 — ${numbers.join(', ')}`)
  }
  const bonus = Number(row.bonus)
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) {
    throw new ValidationError(`회차 ${rang} : bonus invalide — ${JSON.stringify(row.bonus)}`)
  }
  if (numbers.includes(bonus)) {
    throw new ValidationError(`회차 ${rang} : le bonus ${bonus} est déjà tiré`)
  }
  const date = row.date ?? lottoDate(rang)
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date))) {
    throw new ValidationError(`회차 ${rang} : date invalide — ${JSON.stringify(date)}`)
  }

  const prizes = []
  for (const [rank, value] of Object.entries(row.prizes ?? {})) {
    const r = Number(rank)
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      throw new ValidationError(`회차 ${rang} : rang de gain inconnu — ${rank}`)
    }
    const winners = value.winners ?? null
    const amount = value.amount ?? null
    for (const [name, v] of [['당첨자수', winners], ['당첨금액', amount]]) {
      if (v !== null && (!Number.isInteger(v) || v < 0)) {
        throw new ValidationError(`회차 ${rang} · ${r}등 : ${name} invalide — ${v}`)
      }
    }
    prizes.push({ rank: r, winners, amount })
  }

  const notes = (row.notes ?? []).map(String)

  let winTypes = null
  if (row.winTypes) {
    const { auto, manual, semi } = row.winTypes
    for (const [name, v] of [['자동', auto], ['수동', manual], ['반자동', semi]]) {
      if (!Number.isInteger(v) || v < 0) {
        throw new ValidationError(`회차 ${rang} · 1등 ${name} : invalide — ${v}`)
      }
    }
    winTypes = { auto, manual, semi }
  }
  return { rang, date, numbers, bonus, prizes, notes, winTypes }
}

export function validateGrid(row) {
  const lot = String(row.lot ?? '').trim()
  if (!lot) throw new ValidationError('lot manquant')
  const target = row.target
  if (!Number.isInteger(target) || target < 1) {
    throw new ValidationError(`${lot} : 회차 invalide — ${JSON.stringify(target)}`)
  }
  const numbers = [...(row.numbers ?? [])].map(Number).sort((a, b) => a - b)
  if (numbers.length !== 6) {
    throw new ValidationError(`${lot} ${target}회 : ${numbers.length} numéros au lieu de 6`)
  }
  if (new Set(numbers).size !== 6) {
    throw new ValidationError(`${lot} ${target}회 : numéros en double — ${numbers.join(', ')}`)
  }
  if (!numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) {
    throw new ValidationError(`${lot} ${target}회 : numéro hors de 1..45 — ${numbers.join(', ')}`)
  }
  const sharing = row.sharing ?? null
  if (sharing !== null && (!Number.isFinite(sharing) || sharing <= 0)) {
    throw new ValidationError(`${lot} ${target}회 : 분배 지표 invalide — ${sharing}`)
  }
  return {
    lot, target, numbers, sharing,
    source: row.source ?? null,
    note: row.note ?? null,
    savedAt: row.savedAt ?? new Date().toISOString(),
  }
}

export function validatePension(row) {
  const rang = row.rang
  if (!Number.isInteger(rang) || rang < 1) {
    throw new ValidationError(`회차 invalide : ${JSON.stringify(rang)}`)
  }
  const grp = Number(row.group)
  if (!Number.isInteger(grp) || grp < 1 || grp > 5) {
    throw new ValidationError(`회차 ${rang} : 조 invalide — ${JSON.stringify(row.group)}`)
  }
  const read = (key) => {
    const seq = [...(row[key] ?? [])].map(Number)
    if (seq.length !== 6) {
      throw new ValidationError(`회차 ${rang} : ${key} doit compter 6 chiffres, pas ${seq.length}`)
    }
    if (!seq.every((d) => Number.isInteger(d) && d >= 0 && d <= 9)) {
      throw new ValidationError(`회차 ${rang} : ${key} hors de 0..9 — ${seq.join('')}`)
    }
    return seq
  }
  const digits = read('digits')
  const bonus = read('bonus')
  const date = row.date ?? null
  if (date !== null && (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date)))) {
    throw new ValidationError(`회차 ${rang} : date invalide — ${JSON.stringify(date)}`)
  }
  return { rang, date, group: grp, digits, bonus }
}

// ----------------------------------------------------------------- écriture

/**
 * Intègre des tirages. Une ligne refusée n'empêche pas les autres.
 *
 * `overwrite = false` (le défaut) ne touche jamais à ce qui existe : une
 * collecte relancée ne fait rien. C'est ce qui la rend rejouable sans
 * risque.
 */
export function putWinTypes(db, rang, { auto, manual, semi }) {
  db.prepare(`INSERT INTO win_types (rang, auto, manual, semi) VALUES (?, ?, ?, ?)
              ON CONFLICT(rang) DO UPDATE SET
                auto = excluded.auto, manual = excluded.manual, semi = excluded.semi`)
    .run(rang, auto, manual, semi)
}

export function putDraws(db, rows, { overwrite = false } = {}) {
  return put(db, rows, {
    overwrite,
    validate: validateDraw,
    read: db.prepare('SELECT * FROM draws WHERE rang = ?'),
    write: (clean) => {
      db.prepare(`INSERT INTO draws (rang, date, n1, n2, n3, n4, n5, n6, bonus)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(rang) DO UPDATE SET
                    date = excluded.date, n1 = excluded.n1, n2 = excluded.n2,
                    n3 = excluded.n3, n4 = excluded.n4, n5 = excluded.n5,
                    n6 = excluded.n6, bonus = excluded.bonus`)
        .run(clean.rang, clean.date, ...clean.numbers, clean.bonus)

      db.prepare('DELETE FROM prizes WHERE rang = ?').run(clean.rang)
      const prize = db.prepare(
        'INSERT INTO prizes (rang, rank, winners, amount) VALUES (?, ?, ?, ?)')
      for (const p of clean.prizes) prize.run(clean.rang, p.rank, p.winners, p.amount)

      db.prepare('DELETE FROM draw_notes WHERE rang = ?').run(clean.rang)
      const note = db.prepare(
        'INSERT INTO draw_notes (rang, position, note) VALUES (?, ?, ?)')
      clean.notes.forEach((text, i) => note.run(clean.rang, i, text))

      // Une page HTML ancienne n'a pas les modes de choix : on ne touche
      // pas à ce qu'une page JSON aurait déjà écrit.
      if (clean.winTypes) putWinTypes(db, clean.rang, clean.winTypes)
    },
    same: (clean, existing) =>
      existing.date === clean.date && existing.bonus === clean.bonus &&
      [existing.n1, existing.n2, existing.n3, existing.n4, existing.n5, existing.n6]
        .every((n, i) => n === clean.numbers[i]) &&
      samePrizes(db, clean) && sameNotes(db, clean),
  })
}

/**
 * Enregistre des grilles. Rejouable : la clé unique (lot, 회차, six numéros)
 * fait qu'un second import ne crée pas de doublon.
 */
export function putGrids(db, rows) {
  const report = { added: [], unchanged: [], rejected: [] }
  transaction(db, () => {
    const read = db.prepare(`SELECT id FROM grids
      WHERE lot = ? AND target = ? AND n1 = ? AND n2 = ? AND n3 = ?
        AND n4 = ? AND n5 = ? AND n6 = ?`)
    const write = db.prepare(`INSERT INTO grids
      (lot, target, n1, n2, n3, n4, n5, n6, sharing, source, note, saved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const row of rows) {
      let clean
      try {
        clean = validateGrid(row)
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error
        report.rejected.push({ lot: row?.lot ?? null, why: error.message })
        continue
      }
      if (read.get(clean.lot, clean.target, ...clean.numbers)) {
        report.unchanged.push(clean.numbers)
        continue
      }
      write.run(clean.lot, clean.target, ...clean.numbers,
        clean.sharing, clean.source, clean.note, clean.savedAt)
      report.added.push(clean.numbers)
    }
  })
  report.changed = report.added.length > 0
  return report
}

export function putPension(db, rows, { overwrite = false } = {}) {
  return put(db, rows, {
    overwrite,
    validate: validatePension,
    read: db.prepare('SELECT * FROM pension WHERE rang = ?'),
    write: (clean) => {
      db.prepare(`INSERT INTO pension
                    (rang, date, grp, d1, d2, d3, d4, d5, d6, b1, b2, b3, b4, b5, b6)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(rang) DO UPDATE SET
                    date = excluded.date, grp = excluded.grp,
                    d1 = excluded.d1, d2 = excluded.d2, d3 = excluded.d3,
                    d4 = excluded.d4, d5 = excluded.d5, d6 = excluded.d6,
                    b1 = excluded.b1, b2 = excluded.b2, b3 = excluded.b3,
                    b4 = excluded.b4, b5 = excluded.b5, b6 = excluded.b6`)
        .run(clean.rang, clean.date, clean.group, ...clean.digits, ...clean.bonus)
    },
    same: (clean, existing) =>
      existing.date === clean.date && existing.grp === clean.group &&
      clean.digits.every((d, i) => existing[`d${i + 1}`] === d) &&
      clean.bonus.every((d, i) => existing[`b${i + 1}`] === d),
  })
}

function samePrizes(db, clean) {
  const stored = db.prepare(
    'SELECT rank, winners, amount FROM prizes WHERE rang = ? ORDER BY rank')
    .all(clean.rang)
  const wanted = [...clean.prizes].sort((a, b) => a.rank - b.rank)
  return stored.length === wanted.length && stored.every((s, i) =>
    s.rank === wanted[i].rank && s.winners === wanted[i].winners &&
    s.amount === wanted[i].amount)
}

function sameNotes(db, clean) {
  const stored = db.prepare(
    'SELECT note FROM draw_notes WHERE rang = ? ORDER BY position').all(clean.rang)
  return stored.length === clean.notes.length &&
    stored.every((s, i) => s.note === clean.notes[i])
}

function put(db, rows, { overwrite, validate, read, write, same }) {
  const report = { added: [], updated: [], unchanged: [], rejected: [] }
  transaction(db, () => {
    for (const row of rows) {
      let clean
      try {
        clean = validate(row)
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error
        report.rejected.push({ rang: row?.rang ?? null, why: error.message })
        continue
      }
      const existing = read.get(clean.rang)
      if (!existing) {
        write(clean)
        report.added.push(clean.rang)
      } else if (same(clean, existing)) {
        report.unchanged.push(clean.rang)
      } else if (overwrite) {
        write(clean)
        report.updated.push(clean.rang)
      } else {
        report.unchanged.push(clean.rang)
      }
    }
  })
  report.changed = report.added.length > 0 || report.updated.length > 0
  return report
}

export function summarize(report) {
  const parts = []
  if (report.added.length) parts.push(`${report.added.length} ajoutés`)
  if (report.updated.length) parts.push(`${report.updated.length} corrigés`)
  if (report.unchanged.length) parts.push(`${report.unchanged.length} inchangés`)
  if (report.rejected.length) parts.push(`${report.rejected.length} refusés`)
  return parts.join(', ') || 'rien à faire'
}

// ------------------------------------------------------------------ lecture

export function getDraws(db, { start = null, end = null, limit = null } = {}) {
  const where = []
  const args = []
  if (start !== null) { where.push('rang >= ?'); args.push(start) }
  if (end !== null) { where.push('rang <= ?'); args.push(end) }
  const sql = `SELECT * FROM draws${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
               ORDER BY rang`
  let rows = db.prepare(sql).all(...args)
  if (limit !== null && rows.length > limit) rows = rows.slice(-limit)
  return rows.map((r) => ({
    rang: r.rang, date: r.date,
    numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6],
    bonus: r.bonus,
  }))
}

export function getPension(db, { start = null, end = null, limit = null } = {}) {
  const where = []
  const args = []
  if (start !== null) { where.push('rang >= ?'); args.push(start) }
  if (end !== null) { where.push('rang <= ?'); args.push(end) }
  const sql = `SELECT * FROM pension${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
               ORDER BY rang`
  let rows = db.prepare(sql).all(...args)
  if (limit !== null && rows.length > limit) rows = rows.slice(-limit)
  return rows.map((r) => ({
    rang: r.rang, date: r.date, group: r.grp,
    digits: [r.d1, r.d2, r.d3, r.d4, r.d5, r.d6],
    bonus: [r.b1, r.b2, r.b3, r.b4, r.b5, r.b6],
  }))
}

/**
 * Les grilles enregistrées, et ce qu'elles ont donné.
 *
 * La vue `grid_hits` compte les coïncidences ; le rang et le gain viennent
 * de `core/combos.js`, seul endroit où les règles du 6/45 sont écrites. Une
 * grille dont le 회차 n'est pas encore tiré sort avec `drawn: false` et
 * `rank: null` — en attente, pas perdante.
 */
export function getGrids(db, { lot = null, target = null } = {}) {
  const where = []
  const args = []
  if (lot !== null) { where.push('lot = ?'); args.push(lot) }
  if (target !== null) { where.push('target = ?'); args.push(target) }
  const sql = `SELECT * FROM grid_hits${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
               ORDER BY target, lot, id`
  return db.prepare(sql).all(...args).map((r) => {
    const drawn = r.drawn === 1
    const bonus = r.bonus === 1
    const rank = drawn ? rankOf(r.matched, bonus) : null
    return {
      id: r.id, lot: r.lot, target: r.target,
      numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6],
      sharing: r.sharing, source: r.source, note: r.note, savedAt: r.saved_at,
      drawn, drawDate: r.draw_date,
      matched: drawn ? r.matched : null,
      bonus: drawn ? bonus : null,
      rank,
      // Seuls le 4등 et le 5등 ont un montant fixe. Les trois premiers rangs
      // dépendent du nombre de gagnants : ils se lisent dans `prizes`.
      prize: rank ? (FIXED_PRIZE[rank] ?? null) : null,
    }
  })
}

/** Le bilan d'un lot : combien de grilles, combien ont touché, et quoi. */
export function gridSummary(db, { lot = null, target = null } = {}) {
  const rows = getGrids(db, { lot, target })
  const byRank = {}
  let fixed = 0
  for (const g of rows) {
    if (!g.rank) continue
    byRank[g.rank] = (byRank[g.rank] ?? 0) + 1
    fixed += g.prize ?? 0
  }
  return {
    grids: rows.length,
    drawn: rows.filter((g) => g.drawn).length,
    pending: rows.filter((g) => !g.drawn).length,
    byRank,
    fixedPrize: fixed,
  }
}

export function getPrizes(db, rang) {
  const rows = db.prepare(
    'SELECT rank, winners, amount FROM prizes WHERE rang = ? ORDER BY rank').all(rang)
  return Object.fromEntries(rows.map((r) => [r.rank, { winners: r.winners, amount: r.amount }]))
}

export function getNotes(db, rang) {
  return db.prepare('SELECT note FROM draw_notes WHERE rang = ? ORDER BY position')
    .all(rang).map((r) => r.note)
}

/** Les gagnants du 1등 par mode de choix, ou null si la page n'a pas été relue en JSON. */
export function getWinTypes(db, rang) {
  const row = db.prepare('SELECT auto, manual, semi FROM win_types WHERE rang = ?').get(rang)
  return row ? { 자동: row.auto, 수동: row.manual, 반자동: row.semi } : null
}

/**
 * L'ordre de sortie, Map 회차 → [o1…o6] — la forme que core/order.js attend.
 * `start`/`end` bornent les 회차 ; sans eux, tout ce que la table connaît.
 */
export function getOrder(db, { start = null, end = null } = {}) {
  const where = []
  const params = []
  if (start !== null) { where.push('rang >= ?'); params.push(start) }
  if (end !== null) { where.push('rang <= ?'); params.push(end) }
  const sql = 'SELECT rang, o1, o2, o3, o4, o5, o6 FROM ball_order'
    + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ' ORDER BY rang'
  return new Map(db.prepare(sql).all(...params)
    .map((r) => [r.rang, [r.o1, r.o2, r.o3, r.o4, r.o5, r.o6]]))
}

/** Les étiquettes 추첨기, Map 회차 → 1 | 2 | 3 — la forme que core/machine.js attend. */
export function getMachines(db) {
  return new Map(db.prepare('SELECT rang, machine FROM machines ORDER BY rang').all()
    .map((r) => [r.rang, r.machine]))
}

// -------------------------------------------------------------------- état

const TABLE = { lotto: 'draws', pension: 'pension' }

export function gaps(db, product, upto = null) {
  const table = TABLE[product]
  const last = upto ?? (db.prepare(`SELECT MAX(rang) AS m FROM ${table}`).get().m ?? 0)
  if (!last) return []
  // Les 회차 absents entre 1 et `last`, trouvés par la base elle-même.
  return db.prepare(`
    WITH RECURSIVE series(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM series WHERE n < ?
    )
    SELECT n FROM series WHERE n NOT IN (SELECT rang FROM ${table}) ORDER BY n
  `).all(last).map((r) => r.n)
}

export function status(db, today = new Date()) {
  const out = []
  for (const product of PRODUCTS) {
    const table = TABLE[product]
    const row = db.prepare(
      `SELECT COUNT(*) AS n, MAX(rang) AS last FROM ${table}`).get()
    const lastDate = row.last
      ? db.prepare(`SELECT date FROM ${table} WHERE rang = ?`).get(row.last).date
      : null
    const staleWeeks = lastDate
      ? Math.max(0, Math.floor((today - Date.parse(lastDate)) / WEEK))
      : null
    out.push({
      product, label: LABELS[product],
      draws: row.n, lastRang: row.last ?? 0, lastDate, staleWeeks,
      gaps: gaps(db, product),
    })
  }
  return out
}

export function logCrawl(db, entry) {
  db.prepare(`INSERT INTO crawl_log (at, product, mode, added, updated, rejected, failed, detail)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(new Date().toISOString(), entry.product, entry.mode,
         entry.added ?? 0, entry.updated ?? 0, entry.rejected ?? 0,
         entry.failed ?? 0, entry.detail ?? null)
}

export function lastCrawls(db, limit = 10) {
  // `id DESC` en second : deux entrées écrites dans la même milliseconde
  // ont le même `at`, et l'ordre serait sinon indéterminé.
  return db.prepare('SELECT * FROM crawl_log ORDER BY at DESC, id DESC LIMIT ?')
    .all(limit)
}

export function setMeta(db, key, value) {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, String(value))
}

export function getMeta(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null
}

/**
 * L'empreinte du jeu de données. Sert d'ETag, de clé de cache, et de
 * suffixe aux fichiers publiés : quand un tirage arrive, elle change, les
 * noms de fichiers changent, et les caches se périment tout seuls.
 */
export function fingerprint(db) {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM draws)   AS d,
      (SELECT MAX(rang) FROM draws)  AS dr,
      (SELECT COUNT(*) FROM pension) AS p,
      (SELECT MAX(rang) FROM pension) AS pr,
      (SELECT total(n1 + n2 * 3 + n3 * 5 + n4 * 7 + n5 * 11 + n6 * 13 + bonus * 17)
         FROM draws) AS ds,
      (SELECT total(d1 + d2 * 3 + d3 * 5 + d4 * 7 + d5 * 11 + d6 * 13) FROM pension) AS ps
  `).get()
  const seed = `${row.d}:${row.dr}:${row.ds}:${row.p}:${row.pr}:${row.ps}`
  // FNV-1a, suffisant pour distinguer deux états — ce n'est pas une signature.
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
