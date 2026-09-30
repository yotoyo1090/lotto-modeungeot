// Pour chaque lot de 90 grilles : la liste de ses numéros et le nombre de
// fois que chacun apparaît dans les 90 grilles, du plus présent au moins
// présent.
//
//   node --experimental-sqlite tools/lot-count.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'

const LOTS = [
  ['LOT90   · 고정수 13 · 분배 0.90', 'lot90'],
  ['LOT90S  · 고정수 13 · 분배 1.00', 'lot90S'],
  ['LOT90X  · 고정수 16 · 분배 0.90 · 제외', 'lot90X'],
  ['LOT90XS · 고정수 16 · 분배 1.00 · 제외', 'lot90XS'],
]

const all = []
for (const [title, p] of LOTS) {
  const grids = JSON.parse(readFileSync(`data/1242/${p}-1242.json`, 'utf8')).map((g) => g.numbers)
  const cnt = new Int32Array(46)
  for (const g of grids) for (const n of g) cnt[n]++
  const list = []
  for (let n = 1; n <= 45; n++) if (cnt[n]) list.push({ n, c: cnt[n] })
  list.sort((a, b) => b.c - a.c || a.n - b.n)

  const out = []
  out.push(`${title}  —  ${grids.length}조합 · ${list.length}개 번호 · 540칸`)
  out.push('')
  out.push('순위   번호   90조합 중 나온 횟수')
  out.push('──────────────────────────────────────────────────────')
  list.forEach((r, i) => {
    out.push(`${String(i + 1).padStart(3)}위  ${String(r.n).padStart(3)}번   ` +
      `${String(r.c).padStart(3)}회  ${'█'.repeat(Math.round(r.c / 2))}`)
  })
  out.push('')
  out.push(`합계 ${list.reduce((a, r) => a + r.c, 0)}칸 · 최다 ${list[0].n}번 ${list[0].c}회 · 최소 ${list[list.length - 1].n}번 ${list[list.length - 1].c}회`)
  const missing = []
  for (let n = 1; n <= 45; n++) if (!cnt[n]) missing.push(n)
  out.push(`없는 번호 (${missing.length}개) : ${missing.join(' ') || '없음'}`)

  const text = out.join('\n')
  writeFileSync(`data/1242/${p}-count.txt`, text, 'utf8')
  writeFileSync(`${homedir()}/Desktop/${p}-count.txt`, text, 'utf8')
  all.push(text)
}
console.log(all.join('\n\n\n'))
