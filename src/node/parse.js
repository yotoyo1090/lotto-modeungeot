// Lire un tirage dans une page, par la forme de ce qu'on cherche.
//
// Chaque fonction rend soit une ligne prête pour `db.js` — qui la validera à
// son tour —, soit une erreur qui dit ce qui manquait. Jamais un objet à
// moitié rempli : une donnée incertaine vaut moins que pas de donnée.

import { NMAX, PICK } from '../core/draws.js'
import { BASE, DIGITS, GROUPS } from '../core/pension.js'
import { integers, runs, soleInteger } from './html.js'

export class ParseError extends Error {
  constructor(message, { found = null } = {}) {
    super(message)
    this.found = found
  }
}

/** « 1234회 » — le numéro de tirage annoncé par la page. */
export function findRang(fragments) {
  for (const text of fragments) {
    const match = /(\d[\d,]*)\s*회/.exec(text)
    if (match) {
      const value = Number(match[1].replace(/,/g, ''))
      if (value > 0 && value < 100_000) return value
    }
  }
  return null
}

/** « 2024년 8월 24일 » devient « 2024-08-24 ». */
export function findDate(fragments) {
  for (const text of fragments) {
    const korean = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text)
    if (korean) return iso(korean)
    const plain = /(\d{4})[-.](\d{1,2})[-.](\d{1,2})/.exec(text)
    if (plain) return iso(plain)
  }
  return null
}

const iso = ([, y, m, d]) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Les sept numéros — six croissants puis le bonus.
 *
 * On balaie les fragments qui ne contiennent qu'un entier et on cherche une
 * suite de sept, tous entre 1 et 45, tous distincts, dont les six premiers
 * montent. Sur une page de résultats il n'existe qu'une seule suite pareille :
 * ni les 회차, ni les dates, ni les montants ne peuvent la former.
 */
export function findNumbers(fragments) {
  const singles = fragments.map((text) => {
    const value = soleInteger(text)
    // Une valeur hors 1..45 coupe la suite : c'est ce qui empêche un
    // « 2024 » ou un montant de servir de pont entre deux blocs.
    return value !== null && value >= 1 && value <= NMAX ? value : null
  })

  for (let i = 0; i + PICK < singles.length; i++) {
    const window = singles.slice(i, i + PICK + 1)
    if (window.some((v) => v === null)) continue
    let ascending = true
    for (let k = 1; k < PICK; k++) if (window[k] <= window[k - 1]) ascending = false
    if (!ascending) continue
    if (new Set(window).size !== PICK + 1) continue
    return { numbers: window.slice(0, PICK), bonus: window[PICK] }
  }
  return null
}

/** Les gains : { 1: { winners, amount }, … } — par ordre des libellés 등. */
export function findPrizes(fragments) {
  const out = {}
  for (let i = 0; i < fragments.length; i++) {
    const rank = /^([1-5])\s*등/.exec(fragments[i])
    if (!rank) continue
    // Les deux premiers entiers qui suivent le libellé, dans l'ordre du
    // tableau : d'abord le nombre de gagnants, puis le montant unitaire.
    // Les départager par ordre de grandeur serait faux — aux rangs 4 et 5,
    // les gagnants sont plus nombreux que le gain n'est élevé.
    const found = []
    for (let k = i + 1; k < fragments.length && found.length < 2; k++) {
      if (/^[1-5]\s*등/.test(fragments[k])) break
      for (const value of integers(fragments[k])) {
        found.push(value)
        if (found.length === 2) break
      }
    }
    if (found.length === 2) {
      out[Number(rank[1])] = { winners: found[0], amount: found[1] }
    }
  }
  return out
}

/** Un tirage 6/45 complet, ou une erreur qui dit ce qui manquait. */
export function parseLotto(html, { expect = null } = {}) {
  const fragments = runs(html)
  const rang = findRang(fragments)
  if (rang === null) throw new ParseError('회차를 찾지 못했습니다')
  if (expect !== null && rang !== expect) {
    throw new ParseError(`요청한 회차는 ${expect}인데 페이지는 ${rang}입니다`,
      { found: rang })
  }
  const drawn = findNumbers(fragments)
  if (!drawn) throw new ParseError(`${rang}회 — 당첨번호 일곱 개를 찾지 못했습니다`)
  const date = findDate(fragments)
  if (!date) throw new ParseError(`${rang}회 — 추첨일을 찾지 못했습니다`)

  return {
    rang, date, numbers: drawn.numbers, bonus: drawn.bonus,
    prizes: findPrizes(fragments),
  }
}

/**
 * Six fragments qui ne portent chacun qu'un seul chiffre de 0 à 9.
 *
 * C'est la signature d'un numéro 연금복권. Elle est plus faible que celle du
 * 6/45 — un chiffre isolé est chose commune — d'où la recherche à partir
 * d'une position donnée, qui permet de lire le second nombre après le
 * premier plutôt que de rechercher deux fois la même chose.
 */
export function findDigits(fragments, { after = 0 } = {}) {
  const singles = fragments.map((text) => {
    const trimmed = String(text).trim()
    if (trimmed.length !== 1) return null
    const value = soleInteger(trimmed)
    return value !== null && value >= 0 && value < BASE ? value : null
  })
  for (let i = after; i + DIGITS <= singles.length; i++) {
    const window = singles.slice(i, i + DIGITS)
    if (window.some((v) => v === null)) continue
    return { digits: window, at: i }
  }
  return null
}

export function findGroup(fragments) {
  for (const text of fragments) {
    const match = /([1-5])\s*조/.exec(text)
    if (match) return Number(match[1])
  }
  return null
}

export function parsePension(html, { expect = null } = {}) {
  const fragments = runs(html)
  const rang = findRang(fragments)
  if (rang === null) throw new ParseError('회차를 찾지 못했습니다')
  if (expect !== null && rang !== expect) {
    throw new ParseError(`요청한 회차는 ${expect}인데 페이지는 ${rang}입니다`,
      { found: rang })
  }
  const group = findGroup(fragments)
  if (group === null || !GROUPS.includes(group)) {
    throw new ParseError(`${rang}회 — 조를 찾지 못했습니다`)
  }
  const first = findDigits(fragments)
  if (!first) throw new ParseError(`${rang}회 — 당첨번호 여섯 자리를 찾지 못했습니다`)
  const second = findDigits(fragments, { after: first.at + DIGITS })
  if (!second) throw new ParseError(`${rang}회 — 2등 번호를 찾지 못했습니다`)

  return {
    rang,
    date: findDate(fragments),
    group,
    digits: first.digits,
    bonus: second.digits,
  }
}
