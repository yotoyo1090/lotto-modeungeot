// L'écran d'administration — la page Update de l'ancien site.
//
//   npm run admin        →  http://127.0.0.1:8100
//
// L'ancienne plateforme avait `accountadmin/update.html` : huit boutons,
// chacun câblé à sa propre vue Django, chacune avec sa copie de la logique de
// téléchargement. Ici les boutons appellent le **même** `src/node/crawl.js`
// et le même `db.js` que la ligne de commande — un seul chemin de code, donc
// un seul endroit où un bug peut vivre.
//
// Pourquoi un serveur plutôt qu'une page du site : le site est un fichier
// statique, et une page qui télécharge des tirages et écrit dans SQLite a
// besoin de Node. C'était déjà le cas dans l'ancien, où `update.html` vivait
// dans `accountadmin` et non dans l'espace client.
//
// ─── la sécurité, en une ligne
//
// On écoute sur **127.0.0.1 uniquement**, jamais 0.0.0.0 : la page n'est
// joignable que depuis cette machine. L'ancienne, elle, n'avait que
// `@login_required` — n'importe quel compte client connecté pouvait lancer un
// 전회차 업데이트, c'est-à-dire un millier de requêtes vers 동행복권 et une
// réécriture complète de la base. Ici il n'y a pas de compte à protéger,
// parce qu'il n'y a personne d'autre sur la ligne.
//
// Aucune dépendance : `node:http`, `node:sqlite`, et le reste du projet.

import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { collect, known, verify } from '../src/node/crawl.js'
import { collectHogi } from '../src/node/hogi.js'
import { collectOrder } from '../src/node/order.js'
import {
  DEFAULT_PATH, LABELS, PRODUCTS, ValidationError,
  fingerprint, gaps, getDraws, getNotes, getPrizes, lastCrawls, logCrawl,
  open, putDraws, status,
} from '../src/node/db.js'
import { build } from './build.js'
import { plan } from './crawl.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PAGE = join(HERE, 'admin.html')
export const PORT = Number(process.env.PORT) || 8100
export const HOST = '127.0.0.1'

// ──────────────────────────────────────────────────────────── les actions

/**
 * Les six boutons de collecte, et les deux que l'ancien n'avait pas.
 *
 * `mode` et `product` vont tels quels à `plan()` : c'est la même table de
 * décision que la ligne de commande, pas une seconde copie.
 */
export const ACTIONS = {
  lotto_all: { mode: 'all', product: 'lotto', label: '로또 전회차 업데이트' },
  lotto_since: { mode: 'since', product: 'lotto', label: '로또 최근 회차 업데이트' },
  pension_all: { mode: 'all', product: 'pension', label: '복권 전회차 업데이트' },
  pension_since: { mode: 'since', product: 'pension', label: '복권 최근 회차 업데이트' },
  lotto_one: { mode: 'one', product: 'lotto', label: '하나만', args: ['rang'] },
  lotto_range: { mode: 'range', product: 'lotto', label: '여러 개', args: ['start', 'end'] },
  lotto_missing: { mode: 'missing', product: 'lotto', label: '빠진 회차' },
  pension_missing: { mode: 'missing', product: 'pension', label: '빠진 회차' },
  lotto_verify: { mode: 'verify', product: 'lotto', label: '검증', args: ['count'] },
}

/** Les entiers d'un formulaire, refusés plutôt que devinés. */
export function numbers(body, keys) {
  const out = []
  for (const key of keys) {
    const value = Number(body[key])
    if (!Number.isInteger(value) || value < 1) {
      throw new ValidationError(`${key} : 숫자를 입력하세요`)
    }
    out.push(value)
  }
  return out
}

/**
 * 직접 입력 — le 회차 saisi à la main.
 *
 * L'ancien formulaire avait vingt-trois champs et les écrivait sans les
 * relire. Ici `validateDraw` les passe au crible avant d'écrire : six numéros
 * distincts de 1 à 45, un bonus qui n'est pas déjà dedans, une date valide.
 */
export function manualRow(body) {
  const [rang] = numbers(body, ['rang'])
  const picks = numbers(body, ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'bonus'])
  const prizes = {}
  for (let rank = 1; rank <= 5; rank++) {
    const winners = body[`w${rank}`]
    const amount = body[`a${rank}`]
    if (winners === '' && amount === '') continue
    prizes[rank] = {
      winners: winners === '' ? null : Number(winners),
      amount: amount === '' ? null : Number(amount),
    }
  }
  const notes = String(body.notes ?? '').split(',')
    .map((s) => s.trim()).filter(Boolean)

  return {
    rang,
    date: body.date || undefined,
    numbers: picks.slice(0, 6),
    bonus: picks[6],
    prizes,
    notes,
  }
}

// ────────────────────────────────────────────────────── l'état de la base

export function snapshot(db) {
  return {
    fingerprint: fingerprint(db),
    products: status(db).map((s) => ({
      ...s,
      gapCount: s.gaps.length,
      gaps: s.gaps.slice(0, 40),
    })),
    log: lastCrawls(db, 12),
  }
}

/** Les dernières lignes de la table — la page `tablesadmin` de l'ancien. */
export function table(db, limit = 60) {
  // `getDraws` rend déjà { rang, date, numbers, bonus } — on ajoute seulement
  // ce qui vit dans les deux autres tables.
  return getDraws(db).slice(-limit).reverse().map((r) => ({
    ...r,
    prizes: getPrizes(db, r.rang),
    notes: getNotes(db, r.rang),
  }))
}

// ─────────────────────────────────────────────────────────── la collecte

/**
 * Les deux collectes du site tiers — les mêmes fonctions que les modes
 * `hogi` et `order` de `tools/crawl.js`, donc de `npm run update`.
 */
export const THIRD = [
  { mode: 'hogi', label: '추첨기', run: collectHogi },
  { mode: 'order', label: '공나온 순서', run: collectOrder },
]

/**
 * 추첨기 puis 공나온 순서, après un bouton 로또. Comme dans `npm run update`,
 * un échec du site tiers n'interrompt rien : il est écrit dans crawl_log et
 * dans le journal, et l'autre collecte tente quand même sa chance. Rend le
 * nombre d'étiquettes ajoutées ou changées — ce qui décide la régénération.
 */
export async function thirdParty(db, send, sources = THIRD) {
  let changed = 0
  for (const source of sources) {
    try {
      const r = await source.run(db)
      logCrawl(db, {
        product: 'lotto', mode: source.mode, added: r.added, updated: r.updated,
        rejected: r.rejected ?? 0,
        detail: `admin · read ${r.read} · unchanged ${r.unchanged} · orphan ${r.orphan}`,
      })
      changed += r.added + r.updated
      send({
        type: 'third', label: source.label, ok: true,
        message: `읽음 ${r.read} · 저장 ${r.added} · 변경 ${r.updated} · 변화 없음 ${r.unchanged}` +
          ` · 회차 없음 ${r.orphan}${r.rejected ? ` · 불일치 ${r.rejected}` : ''}`,
      })
    } catch (error) {
      logCrawl(db, { product: 'lotto', mode: source.mode, failed: 1, detail: `admin · ${error.message}` })
      send({ type: 'third', label: source.label, ok: false, message: `실패 — ${error.message}` })
    }
  }
  return changed
}

/**
 * Un bouton, du début à la fin — en diffusant chaque ligne au navigateur.
 *
 * `send` reçoit un objet par événement ; l'appelant l'écrit en NDJSON. C'est
 * ce qui fait défiler le journal pendant que ça tourne, au lieu d'une page
 * blanche pendant deux minutes comme l'ancienne.
 */
export async function run(db, key, body, send) {
  const action = ACTIONS[key]
  if (!action) throw new ValidationError(`알 수 없는 동작 : ${key}`)
  const { mode, product } = action

  // Un champ vide donne `Number('') === 0`, un entier valide au sens de
  // `Number.isInteger` — d'où le `> 0`, sans quoi un clic sur un formulaire
  // vide irait chercher le 회차 0.
  const rest = (action.args ?? []).map((name) => Number(body[name]))
  if (action.args?.length && rest.some((v) => !Number.isInteger(v) || v < 1)) {
    throw new ValidationError(`${action.label} : 회차를 입력하세요`)
  }

  // 추첨기 et 공나온 순서 suivent chaque collecte 로또 — même sans nouveau
  // 회차 : le 호기 paraît le lundi, après le tirage du samedi, et c'est le
  // clic suivant qui doit le rattraper.
  const labels = product === 'lotto' && mode !== 'verify'

  const rangs = plan(mode, rest, db, product)
  send({ type: 'plan', label: action.label, product, count: rangs.length })
  if (rangs.length === 0) {
    send({ type: 'done', added: 0, failed: 0, message: '새로운 회차가 없습니다' })
    return { added: 0, failed: 0, labels: labels ? await thirdParty(db, send) : 0 }
  }

  // 검증 ne touche à rien : il redescend les pages et les compare au stocké.
  // `verify` rend une ligne par 회차 — `status` vaut 'identique', 'différent'
  // ou 'illisible'.
  if (mode === 'verify') {
    const results = await verify(db, product, rangs)
    let bad = 0
    for (const [index, item] of results.entries()) {
      const ok = item.status === 'identique'
      if (!ok) bad++
      send({
        type: 'step', ok, rang: item.rang, index, total: results.length,
        reason: ok ? null : (item.reason ?? (item.differences ?? [])
          .map((d) => `${d.field} : ${d.stored} ≠ ${d.page}`).join(' · ')),
      })
    }
    send({
      type: 'done', added: 0, failed: bad,
      message: `${results.length}회차 확인 · 차이 ${bad}`,
    })
    return { added: 0, failed: bad }
  }

  const report = await collect(db, product, rangs, {
    mode,
    stopWhenMissing: mode === 'since' || mode === 'all',
    onStep: (step) => send({ type: 'step', ...step }),
  })
  // Pas de logCrawl ici : `collect()` inscrit déjà son passage dans
  // crawl_log. L'écrire une seconde fois doublait chaque ligne du journal.

  send({
    type: 'done',
    added: report.added.length,
    unchanged: report.unchanged?.length ?? 0,
    failed: report.failed.length,
    message: `추가 ${report.added.length} · 변동 없음 ${report.unchanged?.length ?? 0} · 실패 ${report.failed.length}`,
  })
  return {
    added: report.added.length,
    failed: report.failed.length,
    labels: labels ? await thirdParty(db, send) : 0,
  }
}

/**
 * La régénération, après chaque écriture.
 *
 * `update.bat` écrivait dans `web/public/data` et s'arrêtait là ; le site
 * construit, dans `web/dist/data`, gardait les anciennes données jusqu'au
 * prochain `vite build`. On écrit donc dans les deux — le second seulement
 * s'il existe déjà, pour ne pas fabriquer un `dist` qui n'a jamais été bâti.
 */
export const PUBLIC_DATA = join(HERE, '..', 'web', 'public', 'data')
export const DIST_DATA = join(HERE, '..', 'web', 'dist', 'data')

export function regenerate(dbPath = DEFAULT_PATH, out = PUBLIC_DATA) {
  const written = []
  const { meta } = build(dbPath, out)
  written.push(relative(join(HERE, '..'), out).replaceAll('\\\\', '/'))

  // Le site construit vit ailleurs et gardait les anciennes données jusqu'au
  // prochain `vite build` — c'est le défaut de `update.bat`. On y écrit aussi,
  // mais seulement s'il existe déjà : sinon on fabriquerait un `dist` sans
  // page. Et seulement quand on régénère la vraie sortie, pour qu'un test
  // dirigé vers un dossier jetable ne touche à rien de réel.
  if (out === PUBLIC_DATA && existsSync(join(HERE, '..', 'web', 'dist'))) {
    build(dbPath, DIST_DATA)
    written.push('web/dist/data')
  }
  return { meta, written }
}

// ───────────────────────────────────────────────────────────── le serveur

function json(res, code, value) {
  const body = JSON.stringify(value)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

export function handler(dbPath = DEFAULT_PATH, out = PUBLIC_DATA) {
  return async (req, res) => {
    const url = new URL(req.url, `http://${HOST}`)

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const html = readFileSync(PAGE, 'utf8')
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        return res.end(html)
      }

      // Le navigateur la demande tout seul ; sans réponse il inscrit une
      // erreur 404 dans la console à chaque ouverture.
      if (req.method === 'GET' && url.pathname === '/favicon.ico') {
        res.writeHead(204)
        return res.end()
      }

      if (req.method === 'GET' && url.pathname === '/api/status') {
        const db = open(dbPath, { readOnly: true })
        try { return json(res, 200, snapshot(db)) } finally { db.close() }
      }

      if (req.method === 'GET' && url.pathname === '/api/table') {
        const db = open(dbPath, { readOnly: true })
        const limit = Number(url.searchParams.get('limit')) || 60
        try { return json(res, 200, { rows: table(db, limit) }) } finally { db.close() }
      }

      if (req.method === 'POST' && url.pathname === '/api/manual') {
        const body = await readBody(req)
        const db = open(dbPath)
        try {
          const report = putDraws(db, [manualRow(body)], { overwrite: true })
          if (report.rejected.length) {
            return json(res, 400, { error: report.rejected[0].why })
          }
          logCrawl(db, {
            product: 'lotto', mode: 'manual',
            added: report.added.length, detail: 'admin 직접 입력',
          })
        } finally { db.close() }
        const { meta, written } = regenerate(dbPath, out)
        return json(res, 200, { ok: true, meta, written })
      }

      if (req.method === 'POST' && url.pathname === '/api/run') {
        const body = await readBody(req)
        res.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-store',
          'x-accel-buffering': 'no',
        })
        const send = (event) => res.write(`${JSON.stringify(event)}\n`)

        const db = open(dbPath)
        let outcome = { added: 0, failed: 0, labels: 0 }
        try {
          outcome = await run(db, body.action, body, send)
        } catch (error) {
          send({ type: 'error', message: error.message })
        } finally {
          db.close()
        }

        // On ne régénère que si quelque chose a bougé — un tirage, ou une
        // étiquette 추첨기 / 공나온 순서 : sinon reconstruire ne sert à rien.
        if (outcome.added > 0 || outcome.labels > 0) {
          try {
            const { meta, written } = regenerate(dbPath, out)
            send({ type: 'built', meta, written })
          } catch (error) {
            send({ type: 'error', message: `재생성 실패 : ${error.message}` })
          }
        }
        return res.end()
      }

      json(res, 404, { error: `${req.method} ${url.pathname}` })
    } catch (error) {
      const code = error instanceof ValidationError ? 400 : 500
      json(res, code, { error: error.message })
    }
  }
}

export function serve({ port = PORT, dbPath = DEFAULT_PATH, out = PUBLIC_DATA } = {}) {
  const server = createServer(handler(dbPath, out))
  return new Promise((resolve) => {
    // L'adresse est explicite et ne doit pas changer : sur 0.0.0.0 la page
    // serait offerte à tout le réseau local.
    server.listen(port, HOST, () => resolve(server))
  })
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (entry === import.meta.url) {
  const db = open(DEFAULT_PATH, { readOnly: true })
  const state = status(db)
  db.close()

  await serve()
  console.log('')
  for (const s of state) {
    console.log(`  ${s.label.padEnd(16)} ${String(s.draws).padStart(5)}회 · 최신 ${s.lastRang}`)
  }
  console.log('')
  console.log(`  관리 페이지  http://${HOST}:${PORT}`)
  console.log('  이 컴퓨터에서만 열립니다. 중지하려면 Ctrl-C.')
  console.log('')
}

export { LABELS, PRODUCTS, gaps, known }
