// Les quatre lots de 1242, lus par la fréquence historique des numéros.
//
//   node --experimental-sqlite tools/lot-freq.mjs
//
// Pour chaque lot : combien de cases vont aux numéros les plus sortis de
// l'histoire, combien aux moins sortis, et la fréquence moyenne des numéros
// joués (pondérée par le nombre de grilles qui les portent).

import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('data/lotto.sqlite', { readOnly: true })
const rows = db.prepare('SELECT n1, n2, n3, n4, n5, n6, bonus FROM draws').all()
db.close()

// Fréquence historique : les six numéros gagnants (bonus à part, plus bas).
const hit = new Int32Array(46)
const withBonus = new Int32Array(46)
for (const r of rows) {
  for (const n of [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6]) { hit[n]++; withBonus[n]++ }
  withBonus[r.bonus]++
}
const N = rows.length
const rank = Array.from({ length: 45 }, (_, k) => k + 1).sort((a, b) => hit[b] - hit[a] || a - b)
const place = new Int32Array(46)
rank.forEach((n, i) => { place[n] = i + 1 })
const MEAN = N * 6 / 45

const LOTS = [
  ['LOT90   (13 · 분배 0.90)', 'data/1242/lot90-1242.json'],
  ['LOT90S  (13 · 분배 1.00)', 'data/1242/lot90S-1242.json'],
  ['LOT90X  (16 · 분배 0.90 · 제외)', 'data/1242/lot90X-1242.json'],
  ['LOT90XS (16 · 분배 1.00 · 제외)', 'data/1242/lot90XS-1242.json'],
]

console.log(`1,${N}회차 · 번호당 평균 출현 ${MEAN.toFixed(1)}회`)
console.log('')
console.log('가장 많이 나온 10개 :', rank.slice(0, 10).map((n) => `${n}(${hit[n]})`).join(' '))
console.log('가장 적게 나온 10개 :', rank.slice(-10).map((n) => `${n}(${hit[n]})`).join(' '))
console.log('')

const TOP = new Set(rank.slice(0, 10))
const BOT = new Set(rank.slice(-10))
const table = []
for (const [name, path] of LOTS) {
  const grids = JSON.parse(readFileSync(path, 'utf8')).map((g) => g.numbers)
  const cnt = new Int32Array(46)
  for (const g of grids) for (const n of g) cnt[n]++
  const slots = grids.length * 6
  let top = 0, bot = 0, freqSum = 0, placeSum = 0
  for (let n = 1; n <= 45; n++) {
    if (!cnt[n]) continue
    if (TOP.has(n)) top += cnt[n]
    if (BOT.has(n)) bot += cnt[n]
    freqSum += cnt[n] * hit[n]
    placeSum += cnt[n] * place[n]
  }
  const used = [...cnt].map((c, n) => [n, c]).filter(([n, c]) => n && c)
  const best = used.slice().sort((a, b) => hit[b[0]] - hit[a[0]]).slice(0, 5)
  table.push({ name, slots, top, bot, freq: freqSum / slots, rank: placeSum / slots, used: used.length, best })
}

console.log('lot                              칸수  상위10  하위10  평균출현  평균순위  번호수')
for (const t of table) {
  console.log(`${t.name.padEnd(30)} ${String(t.slots).padStart(4)}  ` +
    `${String(t.top).padStart(5)}  ${String(t.bot).padStart(5)}  ` +
    `${t.freq.toFixed(1).padStart(7)}  ${t.rank.toFixed(1).padStart(7)}  ${String(t.used).padStart(5)}`)
}
console.log('')
console.log(`기준 : 무작위로 90조합이면 상위10에 ${(540 * 10 / 45).toFixed(0)}칸, 하위10에 ${(540 * 10 / 45).toFixed(0)}칸, 평균출현 ${MEAN.toFixed(1)}, 평균순위 23.0`)
console.log('')
for (const t of table) {
  console.log(`${t.name} — 가장 많이 나온 번호 상위 5 : ` +
    t.best.map(([n, c]) => `${n}번 ${hit[n]}회·${place[n]}위 (${c}칸)`).join(' · '))
}
