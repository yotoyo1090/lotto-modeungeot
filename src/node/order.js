// 공나온 순서 — l'ordre réel de sortie des six boules.
//
// La base stocke chaque tirage trié ; le site officiel ne rend que ça
// (vérifié sur 1 060 pages : jamais un autre ordre). L'ordre dans lequel
// les boules sont tombées n'existe que dans le direct, et un site tiers le
// note depuis le 468회. Même mécanique que hogi.js, même page-formulaire
// en GET, même parseur par motif :
//
//     <span>1240회 로또 당첨번호</span>
//     <div class="ball …">44</div>  ×6, puis <div class="plus">+</div>, puis le bonus
//
// Depuis le 2026-09-22 le titre est devenu un lien et s'allonge :
//
//     <a href="/stat/result/1243">1243회 로또 당첨번호 추첨 순서</a>
//
// Le motif accepte donc la suite du titre et `</span>` comme `</a>` — les
// boules, elles, n'ont pas changé.
//
// Ce qu'on vérifie avant d'écrire : les six boules, une fois triées,
// doivent être exactement le tirage en base. Sinon la ligne est rejetée et
// comptée — jamais écrite. C'est l'avantage d'avoir déjà la vérité triée :
// une erreur de saisie du site ne peut pas entrer.

import { fetchPage, archive } from './crawl.js'
import { transaction } from './db.js'

const ORDER_PAGE = 'https://lottotapa.com/stat/result_number.php'
export const ORDER_FIRST = 468

export function orderUrl(end) {
  return `${ORDER_PAGE}?sel_start=${ORDER_FIRST}&sel_end=${end}`
}

const BLOCK = /(\d+)회 로또 당첨번호[^<]*<\/(?:span|a)>([\s\S]*?)(?=\d+회 로또 당첨번호[^<]*<\/(?:span|a)>|$)/g
const BALL = /class="ball [^"]*">\s*(\d{1,2})\s*</g

/**
 * Texte d'une page → [[회차, [six numéros dans l'ordre de sortie]], …].
 * Le bonus (après le « + ») est lu et laissé : il est déjà dans `draws`.
 * Un bloc qui n'a pas six boules avant le « + » est ignoré.
 */
export function parseOrder(text) {
  const out = []
  for (const [, rang, body] of text.matchAll(BLOCK)) {
    const main = body.split('class="plus"')[0]
    const balls = [...main.matchAll(BALL)].map((m) => Number(m[1]))
    if (balls.length === 6) out.push([Number(rang), balls])
  }
  return out
}

/**
 * Écrit les ordres. `rejected` compte les lignes dont les six boules
 * triées ne sont pas le tirage en base — l'étiquette contredit le fait.
 */
export function putOrder(db, rows) {
  const truth = db.prepare('SELECT n1, n2, n3, n4, n5, n6 FROM draws WHERE rang = ?')
  const before = db.prepare('SELECT o1, o2, o3, o4, o5, o6 FROM ball_order WHERE rang = ?')
  const put = db.prepare(
    'INSERT INTO ball_order (rang, o1, o2, o3, o4, o5, o6) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(rang) DO UPDATE SET o1 = excluded.o1, o2 = excluded.o2, o3 = excluded.o3, ' +
    'o4 = excluded.o4, o5 = excluded.o5, o6 = excluded.o6')
  const result = { added: 0, updated: 0, unchanged: 0, orphan: 0, rejected: 0 }
  transaction(db, () => {
    for (const [rang, balls] of rows) {
      const t = truth.get(rang)
      if (!t) { result.orphan++; continue }
      const sorted = [...balls].sort((a, b) => a - b)
      if (sorted.join() !== [t.n1, t.n2, t.n3, t.n4, t.n5, t.n6].join()) { result.rejected++; continue }
      const old = before.get(rang)
      if (old && [old.o1, old.o2, old.o3, old.o4, old.o5, old.o6].join() === balls.join()) {
        result.unchanged++; continue
      }
      put.run(rang, ...balls)
      if (old) result.updated++; else result.added++
    }
  })
  return result
}

export async function collectOrder(db, { keep = true } = {}) {
  const last = db.prepare('SELECT MAX(rang) AS last FROM draws').get().last ?? ORDER_FIRST
  const page = await fetchPage(orderUrl(last + 1))
  if (keep) archive('order', new Date().toISOString().slice(0, 10), page.html)
  const rows = parseOrder(page.html)
  if (!rows.length) throw new Error('페이지에서 「N회 로또 당첨번호」 블록과 공 여섯 개를 찾지 못했습니다')
  return { ...putOrder(db, rows), read: rows.length, bytes: page.bytes }
}
