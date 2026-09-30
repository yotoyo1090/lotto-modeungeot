// La lecture du nouveau site.
//
// Un mot sur ce que ce fichier change, parce que le projet était parti de
// l'idée inverse : « il n'y a pas d'API, tout est du crawling ». C'était vrai
// de l'ancien site, qui rendait ses résultats dans le HTML. Ce n'est plus
// vrai : la page `/lt645/result` arrive **vide** et demande ses tirages à
// `/lt645/selectPstLt645InfoNew.do`. Les numéros ne figurent nulle part dans
// le document servi — les chercher par forme ne peut donc pas marcher.
//
// Deux voies restaient : piloter un navigateur sans interface, ou demander
// la même chose que la page. La première coûte des centaines de mégaoctets
// de dépendances pour obtenir exactement le même objet ; la seconde tient en
// une requête. Le lecteur HTML est gardé — il sert encore aux pages
// archivées et à l'ancien site — mais il n'est plus le chemin principal.

import { NMAX, PICK } from '../core/draws.js'
import { BASE, DIGITS, GROUPS } from '../core/pension.js'
import { ParseError } from './parse.js'

export const ENDPOINTS = {
  lotto: {
    // `srchDir: center` demande le 회차 visé et ses voisins ; c'est ce que
    // fait le sélecteur de la page quand on choisit un tirage.
    url: '/lt645/selectPstLt645InfoNew.do',
    params: (rang) => ({ srchDir: 'center', srchLtEpsd: String(rang) }),
  },
  pension: {
    url: '/pt720/selectPstPt720Info.do',
    params: (rang) => ({ srchPsltEpsd: String(rang) }),
  },
}

/** `20260822` ou `2026-08-22` ou `2026.08.22` deviennent `2026-08-22`. */
export function normalizeDate(raw) {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  const spaced = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(text)
  if (spaced) {
    return `${spaced[1]}-${String(spaced[2]).padStart(2, '0')}-${String(spaced[3]).padStart(2, '0')}`
  }
  return null
}

const int = (value) => {
  if (value === null || value === undefined) return null
  const n = Number(String(value).replace(/[^\d-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Retrouve le 회차 demandé dans la liste renvoyée.
 *
 * La réponse contient plusieurs tirages — le sélecteur en affiche un carrousel.
 * Prendre le premier serait une erreur silencieuse le jour où l'ordre change.
 */
export function pick(payload, rang, key) {
  const list = payload?.data?.list ?? payload?.list ?? []
  if (!Array.isArray(list) || list.length === 0) {
    throw new ParseError(`${rang}회 — 응답에 회차 목록이 없습니다`)
  }
  const found = list.find((row) => int(row[key]) === rang)
  if (!found) {
    const seen = list.map((row) => int(row[key])).filter((n) => n !== null)
    throw new ParseError(
      `${rang}회가 응답에 없습니다 (받은 회차 : ${seen.slice(0, 6).join(', ')}…)`)
  }
  return found
}

export function parseLottoJson(payload, { expect = null } = {}) {
  const rang = expect
  const row = pick(payload, rang, 'ltEpsd')

  const numbers = []
  for (let k = 1; k <= PICK; k++) {
    const value = int(row[`tm${k}WnNo`])
    if (value === null) throw new ParseError(`${rang}회 — tm${k}WnNo 없음`)
    numbers.push(value)
  }
  const bonus = int(row.bnsWnNo)
  if (bonus === null) throw new ParseError(`${rang}회 — bnsWnNo 없음`)

  // Les mêmes contrôles que sur le HTML : le format a changé, pas ce qui
  // fait qu'un tirage est un tirage.
  for (const value of [...numbers, bonus]) {
    if (!Number.isInteger(value) || value < 1 || value > NMAX) {
      throw new ParseError(`${rang}회 — 번호 ${value} 가 1..${NMAX} 밖입니다`)
    }
  }
  if (new Set([...numbers, bonus]).size !== PICK + 1) {
    throw new ParseError(`${rang}회 — 중복된 번호가 있습니다`)
  }

  const prizes = {}
  for (let rank = 1; rank <= 5; rank++) {
    const winners = int(row[`rnk${rank}WnNope`])
    const amount = int(row[`rnk${rank}WnAmt`])
    if (winners !== null && amount !== null) prizes[rank] = { winners, amount }
  }

  // Les gagnants du 1등 par mode de choix : 자동 · 수동 · 반자동. Les 자동
  // ne dépendent pas des numéros ; les 수동 portent la popularité de la
  // grille. On ne garde le triplet que s'il redonne exactement le total —
  // un triplet incohérent est une réponse partielle, pas une donnée.
  const winTypes = winTypesOf(row, prizes[1]?.winners)

  return {
    rang: int(row.ltEpsd),
    date: normalizeDate(row.ltRflYmd),
    numbers: numbers.sort((a, b) => a - b),
    bonus,
    prizes,
    ...(winTypes ? { winTypes } : {}),
  }
}

export function winTypesOf(row, firstWinners) {
  const auto = int(row.winType1)
  const manual = int(row.winType2)
  const semi = int(row.winType3)
  if (auto === null || manual === null || semi === null) return null
  if (firstWinners !== null && firstWinners !== undefined && auto + manual + semi !== firstWinners) return null
  return { auto, manual, semi }
}

/**
 * 연금복권 720+.
 *
 * La réponse ne ressemble pas à celle du 6/45, et deux pièges s'y cachent.
 *
 * **Huit lignes par 회차**, une par rang. Le numéro y est tronqué à mesure
 * qu'on descend — 245914, 45914, 5914, 914, 14, 4 — parce que gagner au 3등
 * ne demande que les cinq derniers chiffres. Lire la mauvaise ligne donnerait
 * un tirage amputé qui aurait l'air valide.
 *
 * Deux lignes seulement portent un nombre complet :
 *   `wnSqNo === 1`   당첨번호, et le 조 (`wnBndNo`, absent partout ailleurs) ;
 *   `wnSqNo === 21`  le second nombre, celui du 2등, valable pour tous les 조.
 *
 * **Les chiffres arrivent en une chaîne**, pas en six champs. Un `Number()`
 * dessus perdrait les zéros de tête : « 058627 » deviendrait 58627, et sur
 * un produit où la position porte du sens, ce serait un autre tirage.
 */
export function parsePensionJson(payload, { expect = null } = {}) {
  const rang = expect
  const rows = payload?.data?.result ?? payload?.result ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ParseError(
      `${rang}회 — 응답에 결과가 없습니다. 받은 키 : ${describe(payload)}`)
  }

  // La réponse porte une fenêtre de 회차 autour de celui demandé : le
  // carrousel du sélecteur. Prendre le premier venu écrirait le tirage d'un
  // autre 회차 sous le numéro demandé.
  const mine = rows.filter((row) => int(row.psltEpsd) === rang)
  if (mine.length === 0) {
    const seen = [...new Set(rows.map((row) => int(row.psltEpsd)))].filter(Boolean)
    throw new ParseError(
      `${rang}회가 응답에 없습니다 (받은 회차 : ${seen.slice(0, 8).join(', ')})`)
  }

  const first = mine.find((row) => int(row.wnSqNo) === 1)
  if (!first) throw new ParseError(`${rang}회 — 1등 행(wnSqNo 1)이 없습니다`)
  const second = mine.find((row) => int(row.wnSqNo) === 21)
  if (!second) throw new ParseError(`${rang}회 — 2등 행(wnSqNo 21)이 없습니다`)

  const group = int(first.wnBndNo)
  if (group === null || !GROUPS.includes(group)) {
    throw new ParseError(`${rang}회 — 조가 1..5 밖입니다 (${first.wnBndNo})`)
  }

  return {
    rang,
    date: normalizeDate(first.psltRflYmd),
    group,
    digits: splitDigits(first.wnRnkVl, `${rang}회 · 당첨번호`),
    bonus: splitDigits(second.wnRnkVl, `${rang}회 · 2등번호`),
  }
}

/** « 245914 » devient [2,4,5,9,1,4] — sans jamais passer par un entier. */
export function splitDigits(raw, label) {
  const text = String(raw ?? '').trim()
  if (!/^\d+$/.test(text)) {
    throw new ParseError(`${label} — 숫자 문자열이 아닙니다 (${raw})`)
  }
  if (text.length !== DIGITS) {
    throw new ParseError(`${label} — ${DIGITS}자리가 아닙니다 (${text.length}자리)`)
  }
  const out = [...text].map(Number)
  for (const value of out) {
    if (!Number.isInteger(value) || value < 0 || value >= BASE) {
      throw new ParseError(`${label} — 숫자 ${value} 가 0..9 밖입니다`)
    }
  }
  return out
}

/** Les clés d'une réponse, sur deux niveaux — de quoi voir sa forme. */
export function describe(payload, depth = 2) {
  const walk = (value, level) => {
    if (value === null || value === undefined) return String(value)
    if (Array.isArray(value)) {
      return level <= 0 || value.length === 0
        ? `[${value.length}]`
        : `[${value.length} × ${walk(value[0], level - 1)}]`
    }
    if (typeof value !== 'object') return typeof value
    const keys = Object.keys(value)
    if (level <= 0) return `{${keys.length} clés}`
    return `{${keys.slice(0, 14).map((k) =>
      `${k}: ${walk(value[k], level - 1)}`).join(', ')}${keys.length > 14 ? ', …' : ''}}`
  }
  return walk(payload, depth)
}

export const JSON_PARSERS = { lotto: parseLottoJson, pension: parsePensionJson }
