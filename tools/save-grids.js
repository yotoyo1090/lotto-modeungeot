// Enregistre des grilles dans la base.
//
//   node --experimental-sqlite tools/save-grids.js [fichier.json] [chemin.sqlite]
//
// Sans fichier, il enregistre les trois lots préparés pour le 1 239회 — ceux
// qui sont écrits en bas de ce fichier. Le format attendu, sinon :
//
//   [ { lot, target, numbers: [6], sharing?, source?, note? }, … ]
//
// L'opération est rejouable : la clé unique (lot, 회차, six numéros) fait
// qu'un second passage n'ajoute rien.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { open, putGrids, gridSummary, getGrids, DEFAULT_PATH } from '../src/node/db.js'
import { sharingIndex } from '../src/core/sharing.js'

const TARGET = 1239

// Les vingt du premier envoi : filtre « union des huit fenêtres » + 분배.
const LOT1 = [
  [10,11,12,14,23,44],[15,19,20,24,35,41],[14,18,21,31,32,41],[12,17,29,35,37,38],
  [11,17,24,30,34,35],[12,16,17,27,28,33],[10,16,23,39,40,42],[12,13,18,21,37,44],
  [15,21,22,32,38,43],[12,20,23,32,34,35],[11,15,18,23,33,34],[15,21,30,31,37,39],
  [13,17,20,32,38,39],[13,23,30,32,36,37],[14,18,23,25,35,36],[15,20,27,29,30,44],
  [13,26,28,29,35,40],[10,17,19,20,43,45],[15,17,18,36,41,42],[18,22,29,30,33,43],
]

// Le lot A : après le backtest, plus aucun filtre de forme — 분배 seul.
const LOTA = [
  [18,25,33,36,37,44],[12,14,15,27,28,35],[11,21,22,27,39,41],[13,26,34,38,39,42],
  [19,30,32,37,41,42],[10,18,19,20,24,39],[18,27,28,41,43,44],[10,11,12,14,16,41],
  [14,22,26,30,44,45],[11,14,18,30,31,35],[13,17,18,23,25,41],[22,32,35,36,37,45],
  [12,13,24,26,29,45],[19,21,23,24,29,41],[15,20,21,25,35,43],[11,13,25,30,32,33],
  [22,23,25,32,39,44],[11,17,33,35,41,42],[12,16,21,26,27,34],[13,17,28,29,38,44],
]

// Le lot B : les quatorze premières du lot A, plus six qui portent un
// numéro ≤ 9 — le plancher du 분배 les interdit, et sans elles les vingt
// grilles ne couvrent pas le tableau.
const LOTB = [
  ...LOTA.slice(0, 14),
  [1,7,23,24,43,45],[4,16,17,36,41,43],[6,12,22,23,25,37],
  [6,7,13,16,22,31],[3,5,25,26,38,43],[9,11,13,28,44,45],
]

const LOTS = [
  ['1239-union', LOT1, '여덟 구간 합집합 필터 + 분배 ≤ 0.90'],
  ['1239-A', LOTA, '백테스트 후 : 분배 ≤ 0.90 단독'],
  ['1239-B', LOTB, '분배 위주 + 9 이하 번호 포함, 45개 번호 커버'],
]

function defaults() {
  const out = []
  for (const [lot, grids, note] of LOTS) {
    for (const numbers of grids) {
      out.push({
        lot, target: TARGET, numbers,
        sharing: Number(sharingIndex(numbers).toFixed(4)),
        source: 'auto', note,
      })
    }
  }
  return out
}

const RANK_LABEL = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등' }

function main() {
  const file = process.argv[2] && !process.argv[2].endsWith('.sqlite')
    ? process.argv[2] : null
  const path = process.argv.find((a) => a.endsWith('.sqlite')) ?? DEFAULT_PATH

  // Un fichier peut ne porter que les numéros. L'indice 분배 se recalcule —
  // il ne dépend que de la grille — plutôt que d'entrer à `null` et de
  // manquer plus tard, quand on voudra comparer les lots.
  const rows = (file ? JSON.parse(readFileSync(file, 'utf8')) : defaults())
    .map((r) => (r.sharing != null || !Array.isArray(r.numbers) || r.numbers.length !== 6
      ? r
      : { ...r, sharing: Number(sharingIndex(r.numbers).toFixed(4)) }))
  const db = open(path)
  const report = putGrids(db, rows)

  console.log(`${report.added.length} ajoutées, ${report.unchanged.length} déjà là` +
    (report.rejected.length ? `, ${report.rejected.length} refusées` : ''))
  for (const r of report.rejected) console.log('  refusée :', r.why)

  // Ce que la base sait maintenant dire toute seule. On parcourt les lots
  // **présents en base**, pas ceux écrits dans ce fichier : un lot venu
  // d'un JSON doit s'afficher comme les autres.
  const lots = [...new Set(getGrids(db).map((g) => g.lot))].sort()
  for (const lot of lots) {
    const s = gridSummary(db, { lot })
    if (!s.grids) continue
    const ranks = Object.entries(s.byRank)
      .sort((a, b) => a[0] - b[0])
      .map(([r, n]) => `${RANK_LABEL[r]}×${n}`).join(' ') || '당첨 없음'
    console.log(`\n${lot} — ${s.grids} 조합 · ${s.drawn} 추첨됨 · ${s.pending} 대기`)
    console.log(`  ${ranks}` +
      (s.fixedPrize ? ` · 고정 당첨금 ${s.fixedPrize.toLocaleString('ko-KR')}원` : ''))
    for (const g of getGrids(db, { lot })) {
      if (!g.rank) continue
      console.log(`  ${g.numbers.map((n) => String(n).padStart(2)).join(' ')}` +
        `  ${g.target}회  일치 ${g.matched}${g.bonus ? '+보너스' : ''}  ${RANK_LABEL[g.rank]}`)
    }
  }
  db.close()
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (import.meta.url === entry) main()

export { defaults, LOTS, TARGET }
