// Le pont entre la table `grids` et le carnet du navigateur.
//
//   node --experimental-sqlite tools/export-grids.js [sortie.json] [chemin.sqlite]
//
// Deux magasins vivent côte à côte, et c'est voulu :
//
//   * la table `grids` de la base — ce que les outils enregistrent, ce que
//     `save-grids.js` écrit, ce qu'on interroge en SQL ;
//   * le carnet `localStorage` du site — ce que les trois écrans 조합
//     enregistrent, et ce que 조합결과 relit.
//
// Le site n'a plus de serveur : il ne peut pas lire la base. Le seul
// passage est donc un fichier, exactement celui que 수동조합 sait déjà
// importer — `kind: 'lotto.manual'`. Rien de nouveau à apprendre au site.
//
// Une entrée par lot : c'est ainsi que 수동조합 enregistre, un paquet de
// grilles sous un nom.
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { open, getGrids, DEFAULT_PATH } from '../src/node/db.js'
import { MANUAL_KIND, carnet } from '../src/core/combos.js'

export function bundleFrom(db, { target = null } = {}) {
  const rows = getGrids(db, { target })
  const lots = new Map()
  for (const g of rows) {
    if (!lots.has(g.lot)) lots.set(g.lot, [])
    lots.get(g.lot).push(g)
  }

  const entries = []
  let id = 1
  for (const [lot, list] of lots) {
    const first = list[0]
    entries.push({
      id: id++,
      name: lot,
      rang: first.target,
      // Ces grilles viennent du générateur, pas d'une saisie : `source` le
      // dit, et 조합결과 les rangera dans la bonne section.
      source: first.source === 'auto' ? 'auto' : 'manual',
      grids: list.map((g) => g.numbers),
      note: first.note ?? null,
      savedAt: first.savedAt,
    })
  }
  return { kind: MANUAL_KIND, version: 1, entries }
}

/**
 * Contre-épreuve : le fichier est relu par le **vrai** carnet du noyau,
 * branché sur une Map au lieu de `localStorage`. Si le site refusait ce
 * fichier, il le refuse ici aussi — et on le sait avant de le livrer,
 * plutôt qu'au moment du clic.
 */
export function selfCheck(bundle) {
  const store = new Map()
  const book = carnet({
    key: 'check', kind: MANUAL_KIND, slot: 'manual',
    storage: () => ({
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    }),
  })
  const added = book.fromFile(JSON.stringify(bundle))
  const loaded = book.load()
  return {
    added,
    entries: loaded.length,
    grids: loaded.reduce((a, e) => a + e.grids.length, 0),
  }
}

function main() {
  const out = process.argv.find((a) => a.endsWith('.json')) ?? 'my-grids.json'
  const path = process.argv.find((a) => a.endsWith('.sqlite')) ?? DEFAULT_PATH

  const db = open(path, { readOnly: true })
  const bundle = bundleFrom(db)
  db.close()

  if (!bundle.entries.length) {
    console.log('la table `grids` est vide — rien à exporter')
    return
  }

  const check = selfCheck(bundle)
  writeFileSync(out, JSON.stringify(bundle, null, 2), 'utf8')

  console.log(`${out} écrit`)
  for (const e of bundle.entries) {
    console.log(`  ${e.name} — ${e.rang}회 · ${e.grids.length} 조합 · ${e.source}`)
  }
  console.log(`\ncontre-épreuve (carnet du noyau) : ` +
    `${check.entries} 건 · ${check.grids} 조합 relus`)
  console.log('\n수동조합 화면의 「불러오기」로 이 파일을 열면 조합결과에 나타납니다.')
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (import.meta.url === entry) main()
