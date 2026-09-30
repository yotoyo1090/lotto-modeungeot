// Chaque grille des quatre lots de 1242, ses six numéros rangés du plus
// sorti au moins sorti, et la somme de leurs sorties — les grilles elles-
// mêmes triées de la plus « chaude » à la plus « froide ».
//
//   node --experimental-sqlite tools/lot-grids-freq.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'

const db = new DatabaseSync('data/lotto.sqlite', { readOnly: true })
const rows = db.prepare('SELECT n1, n2, n3, n4, n5, n6 FROM draws').all()
db.close()

const hit = new Int32Array(46)
for (const r of rows) for (const n of [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6]) hit[n]++
const N = rows.length
const order = Array.from({ length: 45 }, (_, k) => k + 1).sort((a, b) => hit[b] - hit[a] || a - b)
const place = new Int32Array(46)
order.forEach((n, i) => { place[n] = i + 1 })

const LOTS = [
  ['LOT90   · 고정수 13 · 분배 0.90', 'lot90'],
  ['LOT90S  · 고정수 13 · 분배 1.00', 'lot90S'],
  ['LOT90X  · 고정수 16 · 분배 0.90 · 제외', 'lot90X'],
  ['LOT90XS · 고정수 16 · 분배 1.00 · 제외', 'lot90XS'],
]

for (const [title, p] of LOTS) {
  const grids = JSON.parse(readFileSync(`data/1242/${p}-1242.json`, 'utf8')).map((g) => g.numbers)
  const scored = grids.map((g, i) => {
    const sorted = [...g].sort((a, b) => hit[b] - hit[a] || a - b)
    return { line: i + 1, sorted, sum: g.reduce((a, n) => a + hit[n], 0) }
  }).sort((a, b) => b.sum - a.sum)

  const out = []
  out.push(`${title}  —  ${grids.length}조합`)
  out.push(`1,${N}회차 기준 · 각 줄은 출현 많은 순 · 번호(출현·순위) · 평균 합계 ${(N * 6 / 45 * 6).toFixed(0)}`)
  out.push('')
  out.push('  순위  원번호 |  번호 (출현·순위) — 많이 나온 순                                          합계')
  out.push('──────────────┼────────────────────────────────────────────────────────────────────────────')
  scored.forEach((s, k) => {
    out.push(`  ${String(k + 1).padStart(3)}  ${String(s.line).padStart(4)}번 | ` +
      s.sorted.map((n) => `${String(n).padStart(2)}(${hit[n]}·${String(place[n]).padStart(2)}위)`).join(' ') +
      `  ${s.sum}`)
  })
  out.push('')
  out.push(`가장 뜨거운 줄 : ${scored[0].sorted.join(' ')}  합계 ${scored[0].sum}`)
  out.push(`가장 차가운 줄 : ${scored[scored.length - 1].sorted.join(' ')}  합계 ${scored[scored.length - 1].sum}`)

  const text = out.join('\n')
  writeFileSync(`data/1242/${p}-freq.txt`, text, 'utf8')
  writeFileSync(`${homedir()}/Desktop/${p}-freq.txt`, text, 'utf8')
  console.log(`${title}  →  ${p}-freq.txt`)
  console.log(out.slice(4, 14).join('\n'))
  console.log(`  …`)
  console.log(out[out.length - 1])
  console.log('')
}
