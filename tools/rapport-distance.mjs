// 거리 보고서 — génère web/public/rapport-distance.html
//
// La question : les 회차 qui font trois justes ou plus se tiennent-ils à une
// distance particulière du tirage gagnant ? Et si oui, cette distance
// est-elle un cadre, ou un artefact de la recherche ?
//
// Tout ce qui se recalcule est recalculé ici. Deux résultats ne le sont
// pas — le témoin Monte-Carlo (40 reprises, plusieurs minutes) — et sont
// repris tels que mesurés le 2026-09-18, méthode décrite dans le rapport.
//
//   node --experimental-sqlite tools/rapport-distance.mjs

import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { cells, grid, match } from '../src/core/shape.js'

const OUT = 'web/public/rapport-distance.html'
const START = 200, MID = 720, BIN = 25

const db = new DatabaseSync('data/lotto.sqlite', { readOnly: true })
const draws = db.prepare('SELECT rang,n1,n2,n3,n4,n5,n6,bonus FROM draws ORDER BY rang').all()
const wtypes = db.prepare('SELECT rang,auto,manual,semi FROM win_types').all()
db.close()

const N = draws.length
const rang = draws.map((r) => r.rang)
const seven = draws.map((r) => [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.bonus])
const six = draws.map((r) => [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6])
const mask7 = seven.map((s) => { const m = new Uint8Array(46); for (const n of s) m[n] = 1; return m })
const holders = Array.from({ length: 46 }, () => [])
for (let k = 0; k < N; k++) for (const n of seven[k]) holders[n].push(k)

// ───────────────────────── le vivier, par moitié et par distance
const NB = Math.ceil(N / BIN)
const H = [0, 1].map(() => ({ pool: new Float64Array(NB), won: new Float64Array(NB), lost: new Float64Array(NB) }))
const all = { pool: new Float64Array(NB), won: new Float64Array(NB), lost: new Float64Array(NB) }
const slot = (d) => Math.floor((d - 1) / BIN)
for (let i = START; i + 1 < N; i++) {
  const nm = mask7[i + 1], A = H[i < MID ? 0 : 1]
  const seen = new Set()
  for (const t of seven[i]) for (const k of holders[t]) {
    if (k >= i) break
    if (seen.has(k)) continue
    seen.add(k)
    let h = 0
    for (const n of seven[k]) if (nm[n]) h++
    const b = slot(rang[i + 1] - rang[k])
    A.pool[b]++; all.pool[b]++
    if (h >= 3) { A.won[b]++; all.won[b]++ }
    if (h === 0) { A.lost[b]++; all.lost[b]++ }
  }
}
const sum = (a) => a.reduce((x, y) => x + y, 0)
const total = { pool: sum(all.pool), won: sum(all.won), lost: sum(all.lost) }
const base = { won: total.won / total.pool, lost: total.lost / total.pool }

// z d'un seau contre le taux de fond de sa moitié
function zed(A, fam, b) {
  const q = A.pool[b]
  if (q < 500) return null
  const r = sum(A[fam]) / sum(A.pool)
  const e = q * r
  return { q, p: A[fam][b], rate: A[fam][b] / q, base: r, z: (A[fam][b] - e) / Math.sqrt(e * (1 - r)) }
}
// les 4 meilleurs seaux de la 1re moitié, relus sur la 2e
function split(fam) {
  const idx = []
  for (let b = 0; b < NB; b++) if (zed(H[0], fam, b)) idx.push(b)
  idx.sort((x, y) => zed(H[0], fam, y).z - zed(H[0], fam, x).z)
  return idx.slice(0, 4).map((b) => ({
    lo: b * BIN + 1, hi: (b + 1) * BIN, a: zed(H[0], fam, b), b: zed(H[1], fam, b),
  }))
}
const splitWon = split('won')
const splitLost = split('lost')

// ───────────────────────── les joueurs copient-ils le passé ?
const at = new Map(rang.map((r, i) => [r, i]))
const C6 = six.map(cells), G6 = six.map(grid)
const m6 = six.map((s) => { const m = new Uint8Array(46); for (const n of s) m[n] = 1; return m })
const hand = []
for (const w of wtypes) {
  const i = at.get(w.rang)
  if (i === undefined || i < 50) continue
  const tot = (w.auto ?? 0) + (w.manual ?? 0) + (w.semi ?? 0)
  if (tot < 3) continue
  let best = 0, shape = 0
  for (let k = 0; k < i; k++) {
    let h = 0
    for (const n of six[k]) if (m6[i][n]) h++
    if (h > best) best = h
    const s = match(C6[k], G6[i]).score
    if (s > shape) shape = s
  }
  let prev = 0
  for (const n of six[i - 1]) if (m6[i][n]) prev++
  hand.push({ share: w.manual / tot, best, shape, prev })
}
const handMean = hand.reduce((a, r) => a + r.share, 0) / hand.length
function handTab(key, values) {
  return values.map((v) => {
    const g = hand.filter((r) => r[key] === v)
    if (g.length < 5) return null
    const m = g.reduce((a, r) => a + r.share, 0) / g.length
    const sd = Math.sqrt(g.reduce((a, r) => a + (r.share - m) ** 2, 0) / g.length)
    return { v, n: g.length, share: m, z: (m - handMean) / (sd / Math.sqrt(g.length)) }
  }).filter(Boolean)
}
const handBest = handTab('best', [3, 4, 5, 6])
const handPrev = handTab('prev', [0, 1, 2, 3, 4])
const handShape = handTab('shape', [3, 4, 5, 6])

// ───────────────────────── le témoin, mesuré une fois (voir en-tête)
const NULLTEST = {
  reps: 40, real: 2.32, max: 2.50, median: 1.07, ge: 3,
  top: [2.50, 2.34, 2.33, 2.07, 1.88, 1.64, 1.62, 1.59],
}

// ───────────────────────── le dessin
const W = 880
const f1 = (v) => v.toFixed(1)

// le taux par distance, sur tout l'historique, avec la ligne de fond
function rateChart(fam, lo, hi, color) {
  const H2 = 250, L = 56, R = 16, T = 14, B = 38
  const y = (v) => T + (H2 - T - B) * (1 - (v - lo) / (hi - lo))
  const keep = []
  for (let b = 0; b < NB; b++) if (all.pool[b] >= 500) keep.push(b)
  const w = (W - L - R) / keep.length
  const s = []
  for (let g = 0; g <= 4; g++) {
    const v = lo + (hi - lo) * g / 4
    s.push(`<line x1="${L}" y1="${f1(y(v))}" x2="${W - R}" y2="${f1(y(v))}" stroke="#f0ebe1"/>`)
    s.push(`<text x="${L - 6}" y="${f1(y(v) + 3)}" font-size="10" text-anchor="end" fill="#8b8375">${v.toFixed(1)} %</text>`)
  }
  const b0 = base[fam] * 100
  s.push(`<line x1="${L}" y1="${f1(y(b0))}" x2="${W - R}" y2="${f1(y(b0))}" stroke="#3a6b8a" stroke-dasharray="4 3"/>`)
  s.push(`<text x="${W - R}" y="${f1(y(b0) - 5)}" font-size="10" text-anchor="end" fill="#3a6b8a">전체 ${b0.toFixed(2)} %</text>`)
  keep.forEach((b, i) => {
    const v = all[fam][b] / all.pool[b] * 100
    const up = v >= b0
    const x = L + i * w
    s.push(`<rect x="${f1(x + w * 0.2)}" y="${f1(up ? y(v) : y(b0))}" width="${f1(w * 0.6)}" height="${f1(Math.abs(y(v) - y(b0)))}" fill="${up ? color : '#d9d3c6'}"/>`)
    if (i % 6 === 0) s.push(`<text x="${f1(x + w / 2)}" y="${H2 - B + 15}" font-size="10" text-anchor="middle" fill="#8b8375">${b * BIN + 1}</text>`)
  })
  return `<svg viewBox="0 0 ${W} ${H2}" xmlns="http://www.w3.org/2000/svg">\n${s.join('\n')}\n</svg>`
}

//앞 절반 → 뒤 절반, un trait par fenêtre
function slope(list, hero) {
  const H2 = 250, T = 26, B = 44, x1 = 210, x2 = W - 190
  const y = (v) => T + (H2 - T - B) * (1 - (v + 1.5) / 4.5)
  const s = [`<line x1="90" y1="${f1(y(0))}" x2="${W - 70}" y2="${f1(y(0))}" stroke="#e3ddd1" stroke-dasharray="4 3"/>`]
  s.push(`<text x="84" y="${f1(y(0) + 4)}" font-size="11" text-anchor="end" fill="#8b8375">z 0</text>`)
  for (const v of [2, 1, -1]) s.push(`<text x="84" y="${f1(y(v) + 4)}" font-size="11" text-anchor="end" fill="#c9c2b4">${v > 0 ? '+' : ''}${v}</text>`)
  s.push(`<text x="${x1}" y="16" font-size="11" text-anchor="middle" fill="#8b8375">앞 절반 — 고른 곳</text>`)
  s.push(`<text x="${x2}" y="16" font-size="11" text-anchor="middle" fill="#8b8375">뒤 절반 — 확인</text>`)
  s.push(`<line x1="${x1}" y1="${T}" x2="${x1}" y2="${H2 - B}" stroke="#f0ebe1"/>`)
  s.push(`<line x1="${x2}" y1="${T}" x2="${x2}" y2="${H2 - B}" stroke="#f0ebe1"/>`)
  for (const t of list) {
    const isHero = hero && t.lo === hero
    const col = isHero ? '#b8912f' : (t.b.z < 0 ? '#b4432f' : '#b9b1a2')
    s.push(`<line x1="${x1}" y1="${f1(y(t.a.z))}" x2="${x2}" y2="${f1(y(t.b.z))}" stroke="${col}" stroke-width="${isHero ? 2.6 : 1.6}"/>`)
    s.push(`<circle cx="${x1}" cy="${f1(y(t.a.z))}" r="${isHero ? 5 : 3.5}" fill="${col}"/>`)
    s.push(`<circle cx="${x2}" cy="${f1(y(t.b.z))}" r="${isHero ? 5 : 3.5}" fill="${col}"/>`)
    s.push(`<text x="${x1 - 12}" y="${f1(y(t.a.z) + 4)}" font-size="11" text-anchor="end" fill="${isHero ? '#8a6a1c' : '#8b8375'}">${t.lo}~${t.hi}  ${t.a.z > 0 ? '+' : ''}${t.a.z.toFixed(2)}</text>`)
    s.push(`<text x="${x2 + 12}" y="${f1(y(t.b.z) + 4)}" font-size="11" fill="${isHero ? '#8a6a1c' : (t.b.z < 0 ? '#b4432f' : '#8b8375')}">${t.b.z > 0 ? '+' : ''}${t.b.z.toFixed(2)}</text>`)
  }
  return `<svg viewBox="0 0 ${W} ${H2}" xmlns="http://www.w3.org/2000/svg">\n${s.join('\n')}\n</svg>`
}

const CSS = `  :root {
    --paper:#faf8f4; --surface:#fff; --ink:#1c1a16; --ink-soft:#4a453c;
    --muted:#8b8375; --line:#e3ddd1; --line-soft:#f0ebe1;
    --gold:#b8912f; --gold-deep:#8a6a1c; --gold-wash:#fdf6e3;
    --hot:#b4432f; --cool:#3a6b8a; --green:#4a7c59;
    --figure:"SF Mono",ui-monospace,Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",sans-serif; }
  .wrap { max-width:940px; margin:0 auto; padding:2.5rem 1.5rem 5rem; }
  h1 { font-size:1.45rem; margin:0 0 .35rem; }
  .sub { color:var(--muted); font-size:.88rem; max-width:70ch; }
  h2 { font-size:1rem; margin:2.6rem 0 .6rem; padding-top:1.4rem; border-top:1px solid var(--line); }
  p { color:var(--ink-soft); font-size:.9rem; max-width:70ch; }
  strong { color:var(--ink); } em { font-style:normal; color:var(--gold-deep); }
  code { font-family:var(--figure); font-size:.85em; background:var(--gold-wash);
         padding:.05em .3em; border-radius:3px; }
  .note { background:var(--surface); border-left:3px solid var(--gold);
          padding:.8rem 1rem; margin:1.2rem 0; font-size:.88rem; }
  .note.bad { border-left-color:var(--hot); }
  .note.ok { border-left-color:var(--green); }
  .note.cool { border-left-color:var(--cool); }
  .chart { background:var(--surface); border:1px solid var(--line);
           border-radius:6px; padding:1rem 1.1rem; margin:1rem 0; overflow-x:auto; }
  .key { font-size:.75rem; color:var(--muted); margin-top:.5rem; }
  table { width:100%; border-collapse:collapse; font-size:.82rem; margin:1rem 0; }
  th { text-align:left; font-size:.71rem; font-weight:600; color:var(--ink);
       border-bottom:1px solid var(--line); padding:.35rem .45rem; white-space:nowrap; }
  td { padding:.28rem .45rem; border-bottom:1px solid var(--line-soft); white-space:nowrap; }
  .n { font-family:var(--figure); text-align:right; }
  tr.law td { color:var(--muted); }
  tr.kept { background:var(--gold-wash); }
  .scroll { overflow-x:auto; }
  svg { display:block; max-width:100%; }
  footer { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--line);
           font-size:.76rem; color:var(--muted); }`

const today = new Date().toISOString().slice(0, 10)
const num = (v) => Math.round(v).toLocaleString('ko-KR')
const pc = (v) => (v * 100).toFixed(2)
const sz = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2)
const h = []
h.push('<!doctype html>')
h.push('<html lang="ko">')
h.push('<head>')
h.push('<meta charset="utf-8">')
h.push('<meta name="viewport" content="width=device-width, initial-scale=1">')
h.push('<title>거리 보고서 — 맞히는 줄은 어디에서 오는가</title>')
h.push(`<style>\n${CSS}\n</style>`)
h.push('</head><body><div class="wrap">')
h.push('<h1>거리 보고서 — 맞히는 줄은 어디에서 오는가</h1>')
h.push(`<div class="sub">
  당첨이월의 줄은 저마다 과거의 한 회차입니다. 당첨 회차까지의 <strong>거리</strong>를 재고,
  3개 이상 맞힌 줄이 특정한 거리에 몰려 있는지 묻습니다.
  기준 ${START}~${rang[N - 2]}회 · 줄 ${num(total.pool)}개 · ${today}.
</div>`)
h.push(`<div class="note">
  이 보고서는 번호를 고르지 않습니다. 묻는 것은 하나 — <strong>거리라는 틀이 존재하는가</strong>.
  네 단계로 답합니다 : 거리별 비율, 앞뒤 절반 교차 검증, 무작위 대조군, 그리고 사람 쪽(수동·자동).
</div>`)

h.push('<h2>0. 재료</h2>')
h.push(`<p>기준 회차 하나마다 그 7개 번호를 가진 과거 회차를 모아 중복을 지웁니다. ${START}회부터
${rang[N - 2]}회까지 되풀이하면 <strong>${num(total.pool)}줄</strong>. 각 줄에 두 가지를 붙입니다 —
<em>거리</em> (당첨 회차 − 줄의 회차) 와 <em>판정</em> (그 줄의 7개 중 몇 개가 당첨 회차에 나왔는가).</p>`)
h.push(`<div class="scroll"><table>
<tr><th>판정</th><th class="n">줄</th><th class="n">비율</th><th>뜻</th></tr>
<tr><td>3개 이상</td><td class="n">${num(total.won)}</td><td class="n">${pc(base.won)} %</td><td>맞힌 줄</td></tr>
<tr><td>0개</td><td class="n">${num(total.lost)}</td><td class="n">${pc(base.lost)} %</td><td>꽝</td></tr>
<tr class="law"><td>1~2개</td><td class="n">${num(total.pool - total.won - total.lost)}</td><td class="n">${pc((total.pool - total.won - total.lost) / total.pool)} %</td><td>대부분</td></tr>
</table></div>`)

h.push('<h2>1. 거리별 비율 — 선은 평평한가</h2>')
h.push(`<p>25회차 단위로 묶어, 그 구간의 줄 가운데 몇 %가 3개 이상 맞혔는지 셉니다.
어떤 거리가 특별하다면 그 막대가 솟아야 합니다. 점선은 전체 평균 ${pc(base.won)} %입니다.</p>`)
h.push(`<div class="chart">${rateChart('won', 5.5, 7.5, '#b8912f')}<div class="key">가로 : 당첨 회차로부터 몇 회차 전 · 세로 : 3개 이상 비율</div></div>`)
h.push(`<p>같은 그림을 꽝(0개) 쪽으로. 진짜 구간이라면 이쪽은 <em>반대로</em> 내려가야 합니다.</p>`)
h.push(`<div class="chart">${rateChart('lost', 26, 30, '#4a6d8c')}<div class="key">세로 : 0개(꽝) 비율 · 전체 평균 ${pc(base.lost)} %</div></div>`)
h.push(`<div class="note ok">두 선 모두 평평합니다. 5회차 전의 줄과 800회차 전의 줄이 같은 확률로 맞힙니다.
추첨은 130주 전에 무슨 일이 있었는지 기억하지 않습니다.</div>`)

h.push('<h2>2. 앞에서 고르고, 뒤에서 확인</h2>')
h.push(`<p>「가장 높은 구간」은 언제나 찾을 수 있습니다 — 50개를 보면 하나는 반드시 튑니다.
그래서 <strong>앞 절반(기준 ${START}~${MID - 1}회)에서만</strong> 가장 높은 네 구간을 고르고,
고를 때 보지 않은 <strong>뒤 절반(${MID}~${rang[N - 2]}회)</strong>에서 다시 잽니다.</p>`)
h.push(`<div class="chart">${slope(splitWon, splitWon[0].lo)}<div class="key">3개 이상 · 왼쪽 = 고른 곳의 z, 오른쪽 = 확인한 z</div></div>`)
h.push(`<div class="scroll"><table>
<tr><th>구간</th><th class="n">앞 절반</th><th class="n">z</th><th class="n">뒤 절반</th><th class="n">z</th></tr>`)
for (const [k, t] of splitWon.entries()) {
  h.push(`<tr${k === 0 ? ' class="kept"' : ''}><td>${t.lo}~${t.hi}회차 전</td><td class="n">${pc(t.a.rate)} %</td><td class="n">${sz(t.a.z)}</td><td class="n">${pc(t.b.rate)} %</td><td class="n">${sz(t.b.z)}</td></tr>`)
}
h.push(`<tr class="law"><td>전체 평균</td><td class="n">${pc(splitWon[0].a.base)} %</td><td></td><td class="n">${pc(splitWon[0].b.base)} %</td><td></td></tr>
</table></div>`)
h.push(`<div class="chart">${slope(splitLost, null)}<div class="key">0개(꽝) · 같은 절차</div></div>`)
h.push(`<div class="scroll"><table>
<tr><th>구간</th><th class="n">앞 절반</th><th class="n">z</th><th class="n">뒤 절반</th><th class="n">z</th></tr>`)
for (const t of splitLost) {
  h.push(`<tr><td>${t.lo}~${t.hi}회차 전</td><td class="n">${pc(t.a.rate)} %</td><td class="n">${sz(t.a.z)}</td><td class="n">${pc(t.b.rate)} %</td><td class="n">${sz(t.b.z)}</td></tr>`)
}
h.push(`<tr class="law"><td>전체 평균</td><td class="n">${pc(splitLost[0].a.base)} %</td><td></td><td class="n">${pc(splitLost[0].b.base)} %</td><td></td></tr>
</table></div>`)
h.push(`<div class="note">꽝 쪽은 네 구간 모두 0 근처로 주저앉습니다.
3개 이상 쪽은 <strong>${splitWon[0].lo}~${splitWon[0].hi}</strong> 하나만 버팁니다 —
${pc(splitWon[0].a.rate)} % 다음 ${pc(splitWon[0].b.rate)} %. 고른 뒤에도 남은 유일한 구간입니다.</div>`)

h.push('<h2>3. 대조군 — 같은 절차를 무작위에 돌리면</h2>')
h.push(`<p>2장을 통과했다고 끝이 아닙니다. <strong>그 절차 자체가</strong> 살아남는 구간을 만들어낼 수 있기
때문입니다. 확인하는 방법은 하나 — 같은 줄, 같은 거리를 두고 <em>당첨 번호만 무작위 7개로 바꿔</em>
전부 다시 돌립니다. 구간 고르기도, 뒤 절반 확인도 똑같이. ${NULLTEST.reps}번 반복했습니다.</p>`)
h.push(`<div class="scroll"><table>
<tr><th></th><th class="n">뒤 절반의 최고 z</th></tr>
<tr class="kept"><td>실제 자료</td><td class="n">${NULLTEST.real.toFixed(2)}</td></tr>
<tr><td>무작위 ${NULLTEST.reps}번 중 최대</td><td class="n">${NULLTEST.max.toFixed(2)}</td></tr>
<tr><td>무작위 중앙값</td><td class="n">${NULLTEST.median.toFixed(2)}</td></tr>
<tr class="law"><td>무작위 상위 8개</td><td class="n">${NULLTEST.top.map((v) => v.toFixed(2)).join(' · ')}</td></tr>
</table></div>`)
h.push(`<div class="note bad">무작위도 ${NULLTEST.ge}번은 실제만큼 잘합니다 — <strong>p = ${(NULLTEST.ge / NULLTEST.reps).toFixed(3)}</strong>.
실제는 소음 더미의 위쪽에 있지만, 더미 <em>밖</em>에 있지 않습니다. 1.09배의 차이는 우연과 구별되지 않습니다.</div>`)

h.push('<h2>4. 사람 쪽 — 지난 회차를 베끼는가</h2>')
h.push(`<p>추첨에 틀이 없어도 <strong>사람</strong>에게는 있을 수 있습니다. 많은 이가 지난 당첨번호를 적어 냅니다.
그렇다면 어떤 회차가 과거와 닮았을 때 <em>수동</em> 당첨자가 늘어야 합니다.
1등 가운데 수동의 비율은 회차 수가 늘어도 저절로 정규화되므로 시대 효과가 섞이지 않습니다.
표본 ${num(hand.length)}회차, 평균 ${pc(handMean)} %.</p>`)
h.push(`<div class="scroll"><table>
<tr><th>과거와 최대 몇 개 겹치는가</th><th class="n">회차</th><th class="n">수동 비율</th><th class="n">z</th></tr>`)
for (const r of handBest) h.push(`<tr><td>${r.v}개</td><td class="n">${num(r.n)}</td><td class="n">${pc(r.share)} %</td><td class="n">${sz(r.z)}</td></tr>`)
h.push('</table></div>')
h.push(`<div class="scroll"><table>
<tr><th>바로 앞 회차와 겹침 (이월)</th><th class="n">회차</th><th class="n">수동 비율</th><th class="n">z</th></tr>`)
for (const r of handPrev) h.push(`<tr><td>${r.v}개</td><td class="n">${num(r.n)}</td><td class="n">${pc(r.share)} %</td><td class="n">${sz(r.z)}</td></tr>`)
h.push('</table></div>')
h.push(`<div class="scroll"><table>
<tr><th>과거와 가장 닮은 그림 (닮은꼴)</th><th class="n">회차</th><th class="n">수동 비율</th><th class="n">z</th></tr>`)
for (const r of handShape) h.push(`<tr><td>${r.v}/6</td><td class="n">${num(r.n)}</td><td class="n">${pc(r.share)} %</td><td class="n">${sz(r.z)}</td></tr>`)
h.push('</table></div>')
h.push(`<div class="note ok">전부 |z| 1.4 아래. 과거와 닮은 회차라고 수동 당첨자가 늘지 않습니다 —
사람들이 지난 당첨번호를 베낀다 해도, 그 흔적이 당첨자 구성에는 남지 않습니다.</div>`)

h.push('<h2>5. 결론 — 틀은 두 가지가 있다</h2>')
h.push(`<p><strong>추첨이 따르는 틀</strong>은 없습니다. 거리 ${num(NB)}개 구간, 양쪽 판정, 교차 검증, 대조군 —
전부 같은 답입니다. 「몇 회차 전을 보라」는 규칙은 자료에 없습니다.</p>`)
h.push(`<p><strong>당신이 놓는 틀</strong>은 있습니다. 용지의 7×7, 당첨이월의 일곱 자리, 이 보고서의 거리,
닮은꼴의 그림 — 이것들은 추첨을 구속하지 않고 <em>시선을 정리합니다</em>. 그리고 그 쓸모는 예측이 아니라
<strong>배분</strong>입니다 : 90장의 정답 개수(주당 72개)는 바뀌지 않지만, 그것이 어떻게 흩어지는지는 틀이 정합니다.</p>`)
h.push(`<div class="scroll"><table>
<tr><th>틀</th><th>바꾸는 것</th><th>검증</th></tr>
<tr><td>거리 · 닮은꼴 · 주기 · 패턴</td><td>아무것도</td><td>lift 0.95~1.09 · 이 보고서</td></tr>
<tr class="kept"><td>분배 (모양으로 계산)</td><td>당첨 시 <strong>나누는 사람 수</strong></td><td>실제 당첨자 수에 적합</td></tr>
<tr class="kept"><td>90장의 고른 퍼뜨림</td><td>72개 정답의 <strong>흩어짐</strong></td><td>조합론 · 0인 주가 줄고 5등이 는다</td></tr>
</table></div>`)
h.push(`<div class="note cool">한 줄로 : <strong>추첨에는 틀이 없다. 당신은 틀을 놓을 수 있고, 그것은 확률이 아니라
결과의 분포를 정한다.</strong> 이 프로젝트에서 살아남은 틀은 분배와 퍼뜨림, 둘뿐입니다.</div>`)
h.push(`<p>이 문서는 그 결론을 못 박아 두기 위한 것입니다 — 여섯 달 뒤에 같은 길을 다시 걷지 않도록.
화면의 <strong>테이블 › 당첨이월 › 거리</strong> 칸은 이 계산을 회차마다 보여 주고,
${splitWon[0].lo}~${splitWon[0].hi} 구간을 금색 점선으로 표시합니다 — 규칙이라서가 아니라,
지켜보라고.</p>`)
h.push(`<footer>기준 ${START}~${rang[N - 2]}회 · 줄 ${num(total.pool)}개 · 수동 표본 ${num(hand.length)}회차 · ${today}<br>
재현 : <code>node --experimental-sqlite tools/rapport-distance.mjs</code>
(대조군 ${NULLTEST.reps}회는 한 번 측정해 고정)</footer>`)
h.push('</div></body></html>')

writeFileSync(OUT, h.join('\n'), 'utf8')
console.log(`${OUT} — ${Math.round(total.pool)} lignes, base ${pc(base.won)} %, top ${splitWon[0].lo}~${splitWon[0].hi} ${sz(splitWon[0].a.z)} -> ${sz(splitWon[0].b.z)}, main ${hand.length} 회차`)
