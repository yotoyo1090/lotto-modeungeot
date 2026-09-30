// 1등 당첨자의 선택 방식 (자동 · 수동 · 반자동) — reprise pour les 회차 anciens.
//
//   node --experimental-sqlite tools/backfill-wintypes.js [--pause ms] [--db chemin]
//
// Depuis la refonte du site, chaque réponse JSON contient une fenêtre de
// dix 회차 autour de celui qu'on demande — environ cinq en dessous, quatre
// au-dessus, sauf au bord — et, pour chacun, winType1..3. Les 회차 lus
// avant la refonte n'ont que leur page HTML archivée, sans ces champs. Cet
// outil demande une page par fenêtre manquante et écrit les triplets de
// tout ce que la réponse contient. Il ne touche ni aux tirages ni aux gains.
//
// Il ne raye de sa liste que les 회차 réellement reçus. Supposer la forme
// de la fenêtre — c'est ce que faisait la première version — laissait
// quatre trous sur dix.
//
// Il ne fait que ce qui manque : les 회차 déjà dans `win_types` sont sautés.
// Le relancer après une coupure reprend là où il s'est arrêté.

import { readFileSync } from 'node:fs'

import { readJson } from '../src/node/crawl.js'
import { DEFAULT_PATH, open, putWinTypes } from '../src/node/db.js'
import { winTypesOf } from '../src/node/json.js'

const int = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

async function main() {
  const args = process.argv.slice(2)
  const opt = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : fallback
  }
  const pause = Number(opt('--pause', 1000))
  const db = open(opt('--db', DEFAULT_PATH))

  const last = db.prepare('SELECT MAX(rang) AS last FROM draws').get().last ?? 0
  const have = new Set(db.prepare('SELECT rang FROM win_types').all().map((r) => r.rang))
  const missing = []
  for (let r = 1; r <= last; r++) if (!have.has(r)) missing.push(r)
  if (!missing.length) {
    console.log('모든 회차에 선택 방식이 있습니다 — 할 일 없음')
    db.close()
    return
  }
  console.log(`선택 방식 없는 회차 ${missing.length}개 (${missing[0]} → ${missing.at(-1)})`)

  let written = 0
  let requests = 0
  // Chaque réponse couvre [rang − 9, rang] : on vise le plus haut 회차
  // manquant, on écrit les dix, et on recalcule ce qui manque encore.
  const todo = new Set(missing)
  while (todo.size) {
    const rang = Math.max(...todo)
    let path
    try {
      ;({ path } = await readJson('lotto', rang))
      requests++
    } catch (error) {
      console.error(`  ${rang}회  실패 — ${error.message}`)
      // On ne boucle pas sur une page qui refuse : on l'écarte et on continue.
      for (let r = rang; r > rang - 10; r--) todo.delete(r)
      await new Promise((f) => setTimeout(f, pause))
      continue
    }
    const list = JSON.parse(readFileSync(path, 'utf8'))?.data?.list ?? []
    let here = 0
    let refused = 0
    for (const row of list) {
      const r = int(row.ltEpsd)
      if (!r || !todo.has(r)) continue
      // Reçu : on le raye, écrit ou non. Un triplet incohérent ne sera pas
      // meilleur à la prochaine requête.
      todo.delete(r)
      const types = winTypesOf(row, int(row.rnk1WnNope))
      if (!types) { refused++; continue }
      if (!db.prepare('SELECT 1 FROM draws WHERE rang = ?').get(r)) continue
      putWinTypes(db, r, types)
      written++; here++
    }
    // Une réponse qui ne contenait pas le 회차 demandé : on l'écarte seul,
    // sinon on le redemanderait sans fin.
    todo.delete(rang)
    console.log(`  ${String(rang).padStart(4)}회 페이지  +${here}${refused ? `  거부 ${refused}` : ''}  (남은 회차 ${todo.size})`)
    if (todo.size) await new Promise((f) => setTimeout(f, pause))
  }
  console.log(`\n요청 ${requests}회 · 저장 ${written}회차`)
  db.close()
}

main()
