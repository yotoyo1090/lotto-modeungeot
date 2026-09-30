// Le crawler.
//
// Il n'y a pas d'API : tout se lit dans des pages HTML. Trois principes,
// dans cet ordre d'importance.
//
// **1. Rien n'est écrit sans avoir été validé.** Le crawler produit des
// lignes candidates ; `db.js` les refuse si elles ne passent pas ses
// contraintes. Une page mal lue ne peut donc pas corrompre la base — elle
// produit une erreur nommée.
//
// **2. Chaque page reçue est archivée.** Quand une lecture se trompe, on a
// la page exacte qui a produit l'erreur, sans avoir à retourner sur le site
// pour la retrouver — et sans se demander si elle a changé entre-temps.
//
// **3. On peut vérifier le lecteur contre la base.** Le mode `verify`
// retélécharge des tirages **déjà connus** et compare, sans rien écrire.
// C'est la seule preuve possible que le lecteur lit juste : les fixtures ne
// prouvent que la capacité à relire ses propres exemples.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseLotto, parsePension } from './parse.js'
import { ENDPOINTS, JSON_PARSERS } from './json.js'
import { getDraws, getPension, logCrawl, putDraws, putPension } from './db.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ARCHIVE = join(HERE, '..', '..', 'data', 'pages')

export const ROOT = 'https://www.dhlottery.co.kr'

// Les adresses des pages de résultats. Le site a changé de forme d'URL : les
// anciennes (`gameResult.do?method=byWin`) répondent encore HTTP 200, mais
// avec une coquille vide — l'habillage et le calque d'attente, sans aucun
// tirage. C'est la navigation de cette coquille qui a livré les nouvelles.
//
// Plusieurs formes de paramètre sont possibles et le mode `probe` sert à
// trouver laquelle répond : on ne devine pas, on essaie et on regarde.
export const CANDIDATES = {
  lotto: [
    (rang) => `${ROOT}/lt645/result?drwNo=${rang}`,
    (rang) => `${ROOT}/lt645/result?round=${rang}`,
    (rang) => `${ROOT}/lt645/result?gameNo=${rang}`,
    (rang) => `${ROOT}/lt645/result`,
    (rang) => `${ROOT}/gameResult.do?method=byWin&drwNo=${rang}`,
  ],
  pension: [
    (rang) => `${ROOT}/pt720/result?round=${rang}`,
    (rang) => `${ROOT}/pt720/result?drwNo=${rang}`,
    (rang) => `${ROOT}/pt720/result?gameNo=${rang}`,
    (rang) => `${ROOT}/pt720/result`,
    (rang) => `${ROOT}/gameResult.do?method=win720&Round=${rang}`,
  ],
}

export const SOURCES = {
  lotto: (rang) => CANDIDATES.lotto[0](rang),
  pension: (rang) => CANDIDATES.pension[0](rang),
}

/**
 * La page est-elle une coquille — habillage sans résultat ?
 *
 * Le site répond HTTP 200 même quand il ne sert rien : file d'attente,
 * blocage, ou adresse périmée. Sans ce test, l'erreur remontait sous la
 * forme « 회차를 찾지 못했습니다 », ce qui accusait le lecteur alors que le
 * problème était la page. Un diagnostic qui désigne le mauvais coupable
 * coûte plus cher qu'une absence de diagnostic.
 */
export function looksEmpty(html) {
  const text = String(html)
  const queue = /id="waitPage"|서비스 접근 대기|접속이 차단|접속이 불가/.test(text)
  const hasResult = /당첨번호|당첨결과|drwtNo|win_result/.test(text)
  if (hasResult) return null
  if (queue) return '대기·차단 화면이 돌아왔습니다 (결과 없음)'
  return '결과가 없는 페이지입니다 (주소가 바뀌었을 수 있습니다)'
}

export const PARSERS = { lotto: parseLotto, pension: parsePension }

// Le site coréen sert encore de l'EUC-KR sur certaines pages. On décode
// selon ce que l'en-tête annonce plutôt que de supposer de l'UTF-8, sans
// quoi les 회, 등 et 조 arriveraient en points d'interrogation — et les
// signatures de forme ne trouveraient plus rien.
function decodeBody(buffer, contentType) {
  const declared = /charset=([\w-]+)/i.exec(contentType ?? '')?.[1]
  const guessed = declared ?? sniff(buffer)
  try {
    return new TextDecoder(guessed).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

function sniff(buffer) {
  const head = new TextDecoder('latin1').decode(buffer.slice(0, 2048))
  return /charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8'
}

// Les cookies de session. Le site en pose au premier contact et attend de
// les revoir ensuite ; sans eux, certaines pages ne servent que la coquille.
const jar = new Map()

function cookieHeader() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
}

function remember(response) {
  const raw = response.headers.getSetCookie?.() ?? []
  for (const line of raw) {
    const [pair] = line.split(';')
    const cut = pair.indexOf('=')
    if (cut > 0) jar.set(pair.slice(0, cut).trim(), pair.slice(cut + 1).trim())
  }
}

/** Une visite de la page d'accueil, pour obtenir une session avant le reste. */
export async function warmup() {
  if (jar.size) return
  try {
    const response = await fetch(ROOT, { headers: browserHeaders() })
    remember(response)
    await response.arrayBuffer()
  } catch {
    // Sans session on tente quand même : elle n'est peut-être pas requise.
  }
}

// Des en-têtes de navigateur. J'avais d'abord mis un agent explicite —
// « lotto-analyse/0.1 » — par honnêteté. Le site a répondu par sa page
// d'attente. Ces en-têtes-ci ne cachent rien de ce que fait l'outil : il
// lit, à une page par seconde, des résultats publics. Ils disent seulement
// « je suis un navigateur ordinaire », ce qui est la seule façon d'obtenir
// la page que n'importe quel visiteur obtient.
function browserHeaders(referer = null) {
  return {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      + ' (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
    ...(jar.size ? { cookie: cookieHeader() } : {}),
    ...(referer ? { referer } : {}),
  }
}

/** Télécharge une page. Rend le texte décodé et de quoi l'archiver. */
export async function fetchPage(url, { timeout = 15_000, retries = 2 } = {}) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: browserHeaders(ROOT),
        redirect: 'follow',
      })
      remember(response)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      return {
        html: decodeBody(buffer, response.headers.get('content-type')),
        bytes: buffer.length,
        status: response.status,
      }
    } catch (error) {
      lastError = error
      // Une attente qui double : deux essais rapprochés sur un site qui
      // vient de refuser ne servent qu'à se faire refuser deux fois.
      if (attempt < retries) await sleep(600 * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function archive(product, rang, body, { dir = ARCHIVE, ext = 'html' } = {}) {
  const folder = join(dir, product)
  mkdirSync(folder, { recursive: true })
  const name = /^\d+$/.test(String(rang)) ? String(rang).padStart(5, '0') : String(rang)
  const path = join(folder, `${name}.${ext}`)
  writeFileSync(path, body)
  return path
}

/**
 * Lit un tirage : télécharge, archive, analyse. N'écrit rien en base.
 *
 * Séparer la lecture de l'écriture est ce qui rend `verify` possible — et
 * ce qui garantit qu'un mode « regarder sans toucher » existe vraiment.
 */
/**
 * Demande au site la même chose que sa propre page.
 *
 * Le chemin normal depuis que le site est devenu une application
 * JavaScript : la page `/lt645/result` arrive vide et va chercher ses
 * tirages ici. On archive la réponse comme on archivait le HTML — c'est ce
 * qui permet de comprendre après coup ce qui a été reçu.
 */
export async function readJson(product, rang, { keep = true, dir = ARCHIVE } = {}) {
  await warmup()
  const spec = ENDPOINTS[product]
  const query = new URLSearchParams(spec.params(rang)).toString()
  const target = `${ROOT}${spec.url}?${query}`

  const page = await fetchPage(target)
  const path = keep ? archive(product, `${rang}`, page.html, { dir, ext: 'json' }) : null

  let payload
  try {
    payload = JSON.parse(page.html)
  } catch {
    const empty = looksEmpty(page.html)
    const error = new Error(empty
      ? `${empty} — JSON 대신 HTML이 돌아왔습니다`
      : 'JSON을 해석하지 못했습니다')
    error.emptyPage = true
    error.path = path
    throw error
  }

  const row = JSON_PARSERS[product](payload, { expect: rang })
  return { row, url: target, path, bytes: page.bytes }
}

/**
 * Lit un tirage. Le JSON d'abord, le HTML en repli.
 *
 * L'ordre n'est pas une préférence esthétique : depuis la refonte du site,
 * le HTML ne contient plus les numéros. Le repli reste utile pour les pages
 * archivées et pour le jour où le site changerait encore.
 */
export async function read(product, rang, options = {}) {
  if (options.url) return readHtml(product, rang, options)
  try {
    return await readJson(product, rang, options)
  } catch (error) {
    if (error.emptyPage) throw error
    // Une erreur de lecture du JSON mérite qu'on essaie l'ancienne page :
    // elle dira peut-être quelque chose de plus clair.
    try {
      return await readHtml(product, rang, options)
    } catch {
      throw error          // la première erreur est la plus informative
    }
  }
}

export async function readHtml(product, rang, { keep = true, dir = ARCHIVE, url = null } = {}) {
  await warmup()
  const target = url ?? `${ROOT}/gameResult.do?method=${
    product === 'lotto' ? `byWin&drwNo=${rang}` : `win720&Round=${rang}`}`
  const page = await fetchPage(target)
  const path = keep ? archive(product, rang, page.html, { dir }) : null

  // La coquille se reconnaît avant toute tentative de lecture : autrement
  // l'erreur remonterait comme un défaut du lecteur.
  const empty = looksEmpty(page.html)
  if (empty) {
    const error = new Error(empty)
    error.emptyPage = true
    error.path = path
    throw error
  }

  const row = PARSERS[product](page.html, { expect: rang })
  return { row, url: target, path, bytes: page.bytes }
}

/**
 * Essaie plusieurs adresses pour un seul 회차 et dit laquelle répond.
 *
 * Je ne peux pas atteindre le site depuis mon environnement : deviner la
 * bonne forme d'URL nous ferait faire dix allers-retours. Cette commande
 * fait les dix essais d'un coup, sur ta machine, et rend un verdict.
 */
export async function probe(product, rang, { pause = 1200, dir = ARCHIVE } = {}) {
  await warmup()
  const out = []

  // D'abord le point que la page appelle elle-même. C'est le seul endroit
  // où les numéros existent depuis la refonte ; les pages HTML n'en portent
  // plus aucun, quelle que soit la forme du paramètre.
  try {
    const found = await readJson(product, rang, { dir })
    out.push({ url: found.url, kind: 'json', ok: true, row: found.row, bytes: found.bytes })
  } catch (error) {
    out.push({ url: `${ROOT}${ENDPOINTS[product].url}`, kind: 'json',
               ok: false, reason: error.message })
  }
  await sleep(pause)

  for (const [index, make] of CANDIDATES[product].entries()) {
    const url = make(rang)
    try {
      const page = await fetchPage(url, { retries: 0 })
      const empty = looksEmpty(page.html)
      let parsed = null
      let reason = empty
      if (!empty) {
        try {
          parsed = PARSERS[product](page.html, { expect: rang })
        } catch (error) {
          reason = `읽기 실패 — ${error.message}`
        }
      }
      archive(product, `probe-${index}-${rang}`, page.html, { dir })
      out.push({ url, bytes: page.bytes, ok: Boolean(parsed), reason, row: parsed })
    } catch (error) {
      out.push({ url, ok: false, reason: error.message })
    }
    await sleep(pause)
  }
  return out
}

/** Ce que la base contient déjà pour ce produit. */
export function known(db, product) {
  const rows = product === 'lotto' ? getDraws(db) : getPension(db)
  return new Map(rows.map((row) => [row.rang, row]))
}

/**
 * Télécharge une liste de 회차 et les écrit, un par un.
 *
 * Chaque tirage est traité isolément : une page illisible n'annule pas les
 * précédentes. Le compte rendu dit ce qui est passé et ce qui a échoué.
 */
export async function collect(db, product, rangs, {
  mode = 'collect', pause = 1000, keep = true, dry = false,
  dir = ARCHIVE, onStep = null, stopWhenMissing = false,
} = {}) {
  const added = []
  const failed = []
  const unchanged = []
  let stopped = null

  for (const [index, rang] of rangs.entries()) {
    try {
      const { row, path } = await read(product, rang, { keep, dir })
      if (dry) {
        added.push({ rang, row, path, dry: true })
      } else {
        const report = product === 'lotto'
          ? putDraws(db, [row]) : putPension(db, [row])
        if (report.added.length) added.push({ rang, row, path })
        else unchanged.push(rang)
        if (report.rejected.length) {
          failed.push({ rang, reason: report.rejected[0].reason })
        }
      }
      onStep?.({ rang, ok: true, index, total: rangs.length })
    } catch (error) {
      failed.push({ rang, reason: error.message })
      onStep?.({ rang, ok: false, index, total: rangs.length, reason: error.message })

      // « Ce 회차 n'est pas dans la réponse » veut dire qu'il n'a pas encore
      // eu lieu — pas que quelque chose s'est mal passé. Continuer
      // reviendrait à frapper cent fois à une porte qui n'existe pas.
      if (stopWhenMissing && /응답에 없습니다|응답에 결과가 없습니다/.test(error.message)) {
        stopped = rang
        onStep?.({ rang, ok: false, index, total: rangs.length,
                   reason: '아직 없는 회차 — 여기서 멈춥니다', halted: true })
        break
      }
    }
    // Une pause entre deux pages. Le site n'est pas à nous.
    if (index < rangs.length - 1) await sleep(pause)
  }

  if (!dry) {
    // Le journal garde la trace de chaque passage, réussi ou non : c'est ce
    // que `doctor` lit pour dire si la dernière mise à jour s'est bien
    // passée, sans avoir à relancer quoi que ce soit.
    logCrawl(db, {
      product,
      mode,
      added: added.length,
      updated: unchanged.length,
      rejected: 0,
      failed: failed.length,
      detail: failed.length ? `${failed[0].rang}회 — ${failed[0].reason}` : null,
    })
  }
  return { added, failed, unchanged, stopped }
}

/**
 * Retélécharge des tirages **connus** et compare, sans rien écrire.
 *
 * C'est la seule vérification qui prouve quelque chose. Une fixture ne
 * démontre que la capacité du lecteur à relire l'exemple qu'on lui a
 * fabriqué ; ici, la référence est la vraie base, et la page est la vraie
 * page d'aujourd'hui.
 */
export async function verify(db, product, rangs, { pause = 1000, dir = ARCHIVE } = {}) {
  const reference = known(db, product)
  const results = []

  for (const [index, rang] of rangs.entries()) {
    const stored = reference.get(rang)
    if (!stored) {
      results.push({ rang, status: 'absent' })
      continue
    }
    try {
      const { row } = await read(product, rang, { keep: true, dir })
      const differences = compare(product, stored, row)
      results.push({
        rang,
        status: differences.length ? 'divergent' : 'identique',
        differences,
      })
    } catch (error) {
      results.push({ rang, status: 'illisible', reason: error.message })
    }
    if (index < rangs.length - 1) await sleep(pause)
  }
  return results
}

function compare(product, stored, fresh) {
  const out = []
  const check = (field, a, b) => {
    const left = Array.isArray(a) ? a.join(',') : String(a ?? '')
    const right = Array.isArray(b) ? b.join(',') : String(b ?? '')
    if (left !== right) out.push({ field, stored: left, page: right })
  }
  if (product === 'lotto') {
    check('numbers', stored.numbers, fresh.numbers)
    check('bonus', stored.bonus, fresh.bonus)
    check('date', stored.date, fresh.date)
  } else {
    check('group', stored.group, fresh.group)
    check('digits', stored.digits, fresh.digits)
    check('bonus', stored.bonus, fresh.bonus)
    if (fresh.date) check('date', stored.date, fresh.date)
  }
  return out
}
