// 추첨기 — d'où vient l'étiquette « quelle machine », et comment elle entre.
//
// L'information n'est dans aucune donnée officielle : 동행복권 l'annonce
// chaque lundi sur son café Naver, et un site tiers la tient en tableau
// depuis le 262회. Ce fichier ne connaît que ce tableau, par sa phrase :
//
//     1240회 로또 당첨번호 (3호기)
//
// Il ne dépend d'aucune structure HTML. Si le site change sa mise en page
// mais garde cette phrase, tout continue ; s'il change la phrase, `parseHogi`
// rend une liste vide et l'appelant le voit — jamais des zéros silencieux.
//
// Deux portes d'entrée, un seul chemin d'écriture :
//
//   tools/import-hogi.js   des pages enregistrées à la main — le passé, une fois
//   tools/crawl.js hogi    la page complète, 262회 → aujourd'hui, appelée par
//                          `npm run update` — rejouer ne change rien
//
// Le site n'est pas 동행복권 : `fetchPage` réutilise les en-têtes de
// navigateur du crawler mais pas sa session, qui ne sert à rien ici.

import { fetchPage, archive } from './crawl.js'
import { transaction } from './db.js'

const HOGI_PAGE = 'https://lottotapa.com/stat/result_hogi.php'

// Le formulaire de la page est un GET à trois champs. Sans paramètre elle
// montre les 50 derniers 회차 ; avec sel_start/sel_end elle rend tout ce
// qu'on demande sur une seule page — 979 lignes tiennent dans 1,3 Mo.
// Les étiquettes commencent au 262회 (les machines 비너스 datent de là).
export const HOGI_FIRST = 262

export function hogiUrl(end) {
  return `${HOGI_PAGE}?sel_start=${HOGI_FIRST}&sel_end=${end}&selHogi=`
}

const PATTERN = /(\d+)회 로또 당첨번호\s*\((\d)호기\)/g

/** Texte d'une page → [[회차, machine], …]. Pur, testable. */
export function parseHogi(text) {
  const out = []
  for (const [, rang, machine] of text.matchAll(PATTERN)) {
    out.push([Number(rang), Number(machine)])
  }
  return out
}

/**
 * Écrit des étiquettes. Rejouer n'est jamais un problème : même 회차,
 * même machine → rien ; même 회차, machine différente → mise à jour et
 * comptée comme telle. Un 회차 absent de `draws` est compté, pas inséré —
 * la clé étrangère le refuserait, et une étiquette sans tirage ne veut
 * rien dire (le 회차 de samedi prochain, typiquement).
 */
export function putMachines(db, rows) {
  const before = db.prepare('SELECT machine FROM machines WHERE rang = ?')
  const known = db.prepare('SELECT 1 FROM draws WHERE rang = ?')
  const put = db.prepare(
    'INSERT INTO machines (rang, machine) VALUES (?, ?) ' +
    'ON CONFLICT(rang) DO UPDATE SET machine = excluded.machine')
  const result = { added: 0, updated: 0, unchanged: 0, orphan: 0 }
  transaction(db, () => {
    for (const [rang, machine] of rows) {
      if (!known.get(rang)) { result.orphan++; continue }
      const old = before.get(rang)?.machine
      if (old === machine) { result.unchanged++; continue }
      put.run(rang, machine)
      if (old === undefined) result.added++
      else result.updated++
    }
  })
  return result
}

/**
 * La page du jour : télécharge, archive, analyse, écrit. C'est le mode
 * `hogi` de crawl.js. Une erreur réseau remonte à l'appelant — c'est lui
 * qui décide de l'écrire dans crawl_log ; ici on ne cache rien.
 */
export async function collectHogi(db, { keep = true } = {}) {
  // Jusqu'au 회차 qui suit le dernier en base : s'il est déjà étiqueté sur
  // le site mais pas encore tiré chez nous, il compte comme « 회차 없음 »
  // aujourd'hui et entrera la semaine prochaine.
  const last = db.prepare('SELECT MAX(rang) AS last FROM draws').get().last ?? HOGI_FIRST
  const page = await fetchPage(hogiUrl(last + 1))
  if (keep) archive('hogi', new Date().toISOString().slice(0, 10), page.html)
  const rows = parseHogi(page.html)
  if (!rows.length) throw new Error('페이지에서 「N회 로또 당첨번호 (N호기)」 문장을 찾지 못했습니다')
  return { ...putMachines(db, rows), read: rows.length, bytes: page.bytes }
}
