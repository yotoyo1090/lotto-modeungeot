// 추첨기 — reprise ponctuelle des étiquettes, depuis des pages enregistrées.
//
//   node --experimental-sqlite tools/import-hogi.js page1.html page2.html … [--db chemin]
//
// Ce n'est pas un crawler. La page 호기별 당첨번호 est un formulaire de 50
// 회차 à la fois ; pour remonter au 262회 on l'enregistre une vingtaine de
// fois (Ctrl+S, « HTML만 ») et on donne les fichiers à cet outil. Le
// hebdomadaire, lui, passe par `crawl.js hogi` et ne demande rien à la main.
//
// La lecture et l'écriture vivent dans src/node/hogi.js — une seule
// implémentation pour les deux portes d'entrée.

import { readFileSync } from 'node:fs'

import { open, DEFAULT_PATH } from '../src/node/db.js'
import { parseHogi, putMachines } from '../src/node/hogi.js'

function main() {
  const args = process.argv.slice(2)
  const dbFlag = args.indexOf('--db')
  const dbPath = dbFlag >= 0 ? args.splice(dbFlag, 2)[1] : DEFAULT_PATH
  if (!args.length) {
    console.error('usage : node --experimental-sqlite tools/import-hogi.js page.html … [--db chemin]')
    process.exit(1)
  }

  const rows = new Map()
  for (const file of args) {
    const found = parseHogi(readFileSync(file, 'utf8'))
    if (!found.length) console.warn(`${file} : aucune étiquette trouvée`)
    for (const [rang, machine] of found) {
      const before = rows.get(rang)
      if (before !== undefined && before !== machine) {
        throw new Error(`회차 ${rang} : ${before}호기 dans une page, ${machine}호기 dans une autre`)
      }
      rows.set(rang, machine)
    }
  }

  const db = open(dbPath)
  const r = putMachines(db, rows)
  db.close()
  console.log(`읽음 ${rows.size} · 저장 ${r.added} · 변경 ${r.updated} · 변화 없음 ${r.unchanged} · 회차 없음 ${r.orphan}`)
}

main()
