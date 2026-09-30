// Les 45 numéros, ligne par ligne : leur fréquence historique et le nombre
// de grilles qui les portent dans chacun des quatre lots de 1242.
//
//   node --experimental-sqlite tools/lot-table.mjs [--by number]

import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const BY_NUMBER = process.argv.includes('--by') && process.argv[process.argv.indexOf('--by') + 1] === 'number'

const db = new DatabaseSync('data/lotto.sqlite', { readOnly: true })
const rows = db.prepare('SELECT n1, n2, n3, n4, n5, n6, bonus FROM draws').all()
db.close()

const hit = new Int32Array(46)
const bon = new Int32Array(46)
for (const r of rows) {
  for (const n of [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6]) hit[n]++
  bon[r.bonus]++
}
const N = rows.length
const order = Array.from({ length: 45 }, (_, k) => k + 1).sort((a, b) => hit[b] - hit[a] || a - b)
const place = new Int32Array(46)
order.forEach((n, i) => { place[n] = i + 1 })

const LOTS = [
  ['LOT90', 'lot90'],
  ['LOT90S', 'lot90S'],
  ['LOT90X', 'lot90X'],
  ['LOT90XS', 'lot90XS'],
]
const cover = LOTS.map(([, p]) => {
  const grids = JSON.parse(readFileSync(`data/1242/${p}-1242.json`, 'utf8')).map((g) => g.numbers)
  const c = new Int32Array(46)
  for (const g of grids) for (const n of g) c[n]++
  return c
})

const list = BY_NUMBER ? Array.from({ length: 45 }, (_, k) => k + 1) : order
const out = []
out.push(`1,${N}회차 · 번호당 평균 출현 ${(N * 6 / 45).toFixed(1)}회 · ${BY_NUMBER ? '번호 순' : '출현 많은 순'}`)
out.push('')
out.push('순위  번호   출현   보너스 |  LOT90  LOT90S  LOT90X  LOT90XS')
out.push('────────────────────────────┼─────────────────────────────────')
for (const n of list) {
  const bar = '█'.repeat(Math.round((hit[n] - 130) / 4))
  out.push(
    `${String(place[n]).padStart(3)}위 ${String(n).padStart(3)}번 ${String(hit[n]).padStart(5)}회 ` +
    `${String(bon[n]).padStart(5)}회 |` +
    cover.map((c) => String(c[n] || '·').padStart(7)).join('') +
    `  ${bar}`)
}
out.push('')
out.push('합계 (540칸) :' + cover.map((c) => String([...c].reduce((a, b) => a + b, 0)).padStart(7)).join(''))
out.push('쓰인 번호   :' + cover.map((c) => String([...c].filter((v, i) => i && v).length).padStart(7)).join(''))

const text = out.join('\n')
console.log(text)
writeFileSync('data/1242/table-1242.txt', text, 'utf8')
