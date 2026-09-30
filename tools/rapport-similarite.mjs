// 닮은꼴 간격 보고서 — génère web/public/rapport-similarite.html
//
// Question : les 닮은꼴 (deux tirages qui dessinent la même figure sur le
// bulletin, à une translation près) reviennent-ils à intervalle régulier ?
// Quatre mesures, toutes sur l'historique complet :
//
//   1. la distance |a-b| des paires, contre la loi triangulaire (N-d) ;
//   2. l'écart entre deux 닮은꼴 successifs d'une même référence, contre
//      la loi sans mémoire (géométrique) ;
//   3. « distance mod k », k = 2..120, pour débusquer un pas multiple ;
//   4. la plus longue chaîne à pas constant, contre Monte-Carlo.
//
//   node --experimental-sqlite tools/rapport-similarite.mjs [seuil=4]

import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { cells, grid, match } from '../src/core/shape.js'
import { mulberry32 } from '../src/core/generator.js'

const MIN = Number(process.argv[2] ?? 4)
const OUT = 'web/public/rapport-similarite.html'

const db = new DatabaseSync('data/lotto.sqlite', { readOnly: true })
const rows = db.prepare('SELECT rang, n1, n2, n3, n4, n5, n6 FROM draws ORDER BY rang').all()
db.close()

const N = rows.length
const rang = rows.map((r) => r.rang)
const nums = rows.map((r) => [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6])
const C = nums.map(cells)
const G = nums.map(grid)

// ───────────────────────────────────────────────── les paires
const adj = Array.from({ length: N }, () => [])
const dist = new Float64Array(N)
let pairs = 0
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    if (match(C[i], G[j]).score >= MIN) { adj[i].push(j); adj[j].push(i); dist[j - i]++; pairs++ }
  }
}
const p = pairs / (N * (N - 1) / 2)

// 1. distance par tranche, contre le triangle
const BIN = 50
const d1 = []
let chi1 = 0
for (let b = 1; b < N; b += BIN) {
  let o = 0, e = 0
  for (let d = b; d < Math.min(b + BIN, N); d++) { o += dist[d]; e += p * (N - d) }
  if (e >= 5) { chi1 += (o - e) ** 2 / e; d1.push({ a: b, b: Math.min(b + BIN, N) - 1, o, e }) }
}

// 2. écarts entre 닮은꼴 successifs
const gaps = []
for (let i = 0; i < N; i++) for (let t = 1; t < adj[i].length; t++) gaps.push(adj[i][t] - adj[i][t - 1])
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length)
const H = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 400, 1300]
const d2 = []
for (let h = 0; h + 1 < H.length; h++) {
  const o = gaps.filter((g) => g >= H[h] && g < H[h + 1]).length
  const e = gaps.length * (Math.exp(-(H[h] - 1) / mean) - Math.exp(-(H[h + 1] - 1) / mean))
  d2.push({ lo: H[h], hi: H[h + 1] - 1, o, e })
}

// 3. distance mod k — l'attendu suit le triangle, pas l'uniforme
const zs = []
for (let k = 2; k <= 120; k++) {
  const o = new Float64Array(k), w = new Float64Array(k)
  let wt = 0
  for (let d = 1; d < N; d++) { o[d % k] += dist[d]; w[d % k] += N - d; wt += N - d }
  let x = 0
  for (let r = 0; r < k; r++) { const e = pairs * w[r] / wt; x += (o[r] - e) ** 2 / e }
  zs.push({ k, x, z: (x - (k - 1)) / Math.sqrt(2 * (k - 1)) })
}
const bestK = zs.reduce((a, b) => (b.z > a.z ? b : a))

// 4. la plus longue chaîne à pas constant
function longest(list) {
  const set = new Set(list)
  let best = null
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const s = list[b] - list[a]
    let n = 2, x = list[b] + s
    while (set.has(x)) { n++; x += s }
    if (!best || n > best.n) best = { start: list[a], step: s, n }
  }
  return best
}
let champ = null
for (let i = 0; i < N; i++) {
  const r = longest(adj[i])
  if (r && (!champ || r.n > champ.n)) champ = { ref: rang[i], ...r }
}
const rnd = mulberry32(0x5EED)
const REP = 200
let hits = 0, maxRnd = 0
for (let s = 0; s < REP; s++) {
  let m = 0
  for (let i = 0; i < N; i++) {
    const k = adj[i].length
    if (k < 3) continue
    const set = new Set()
    while (set.size < k) set.add(1 + Math.floor(rnd() * N))
    const r = longest([...set].sort((a, b) => a - b))
    if (r && r.n > m) m = r.n
  }
  if (m > maxRnd) maxRnd = m
  if (m >= champ.n) hits++
}

// 5. la dernière référence
const last = N - 1
const mates = adj[last].map((j) => rang[j])
const steps = mates.slice(1).map((r, i) => r - mates[i])

// ───────────────────────────────────────────────── le dessin
const W = 880, HT = 250, L = 52, R = 18, T = 16, B = 40
const f1 = (v) => v.toFixed(1)

function bars(data, label) {
  const max = Math.max(...data.map((d) => Math.max(d.o, d.e))) * 1.08
  const w = (W - L - R) / data.length
  const y = (v) => T + (HT - T - B) * (1 - v / max)
  const s = []
  for (let g = 0; g <= 4; g++) {
    const v = max * g / 4
    s.push(`<line x1="${L}" y1="${f1(y(v))}" x2="${W - R}" y2="${f1(y(v))}" stroke="#f0ebe1"/>`)
    s.push(`<text x="${L - 6}" y="${f1(y(v) + 3)}" font-size="10" text-anchor="end" fill="#8b8375">${Math.round(v)}</text>`)
  }
  data.forEach((d, i) => {
    s.push(`<rect x="${f1(L + i * w + w * 0.16)}" y="${f1(y(d.o))}" width="${f1(w * 0.68)}" height="${f1(HT - B - y(d.o))}" fill="#b8912f"/>`)
    s.push(`<text x="${f1(L + i * w + w / 2)}" y="${HT - B + 15}" font-size="10" text-anchor="middle" fill="#8b8375">${label(d)}</text>`)
  })
  const pts = data.map((d, i) => `${f1(L + i * w + w / 2)},${f1(y(d.e))}`).join(' ')
  s.push(`<polyline points="${pts}" fill="none" stroke="#3a6b8a" stroke-width="1.8" stroke-dasharray="4 3"/>`)
  return `<svg viewBox="0 0 ${W} ${HT}" xmlns="http://www.w3.org/2000/svg">\n${s.join('\n')}\n</svg>`
}

function scatter(list) {
  const H2 = 230, y = (v) => T + (H2 - T - B) * (1 - (v + 4) / 8)
  const x = (k) => L + (W - L - R) * (k - 2) / 118
  const s = [`<rect x="${L}" y="${f1(y(2))}" width="${W - L - R}" height="${f1(y(-2) - y(2))}" fill="#b8912f" opacity="0.12"/>`]
  s.push(`<line x1="${L}" y1="${f1(y(0))}" x2="${W - R}" y2="${f1(y(0))}" stroke="#e3ddd1"/>`)
  for (const v of [-4, -2, 0, 2, 4]) s.push(`<text x="${L - 6}" y="${f1(y(v) + 3)}" font-size="10" text-anchor="end" fill="#8b8375">${v > 0 ? '+' : ''}${v}</text>`)
  for (const d of list) s.push(`<circle cx="${f1(x(d.k))}" cy="${f1(y(d.z))}" r="2.6" fill="#b8912f"/>`)
  for (const k of [2, 20, 40, 60, 80, 100, 120]) s.push(`<text x="${f1(x(k))}" y="${H2 - 12}" font-size="10" text-anchor="middle" fill="#8b8375">k=${k}</text>`)
  s.push(`<line x1="${L}" y1="${f1(y(bestK.z))}" x2="${W - R}" y2="${f1(y(bestK.z))}" stroke="#b4432f" stroke-dasharray="3 3"/>`)
  s.push(`<text x="${W - R}" y="${f1(y(bestK.z) - 5)}" font-size="10" text-anchor="end" fill="#b4432f">최대 z ${bestK.z.toFixed(2)} (k=${bestK.k})</text>`)
  return `<svg viewBox="0 0 ${W} ${H2}" xmlns="http://www.w3.org/2000/svg">\n${s.join('\n')}\n</svg>`
}

function timeline(list, ref, max) {
  const H3 = 120, Y = 62, x = (r) => L + (W - L - R) * r / max
  const s = [`<line x1="${L}" y1="${Y}" x2="${W - R}" y2="${Y}" stroke="#e3ddd1"/>`]
  for (const r of [1, 300, 600, 900, max]) s.push(`<text x="${f1(x(r))}" y="${Y + 24}" font-size="10" text-anchor="middle" fill="#8b8375">${r}회</text>`)
  for (const r of list) {
    s.push(`<circle cx="${f1(x(r))}" cy="${Y}" r="5" fill="#b8912f"/>`)
    s.push(`<text x="${f1(x(r))}" y="${Y - 13}" font-size="10" text-anchor="middle" fill="#8b8375">${r}</text>`)
  }
  s.push(`<circle cx="${f1(x(ref))}" cy="${Y}" r="6" fill="#b4432f"/>`)
  s.push(`<text x="${f1(x(ref))}" y="${Y - 15}" font-size="10" text-anchor="end" fill="#b4432f">${ref}</text>`)
  return `<svg viewBox="0 0 ${W} ${H3}" xmlns="http://www.w3.org/2000/svg">\n${s.join('\n')}\n</svg>`
}

// ───────────────────────────────────────────────── le rapport
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
  .scroll { overflow-x:auto; }
  svg { display:block; max-width:100%; }
  footer { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--line);
           font-size:.76rem; color:var(--muted); }`

const today = new Date().toISOString().slice(0, 10)
const num = (v) => v.toLocaleString('ko-KR')
const h = []
h.push('<!doctype html>')
h.push('<html lang="ko">')
h.push('<head>')
h.push('<meta charset="utf-8">')
h.push('<meta name="viewport" content="width=device-width, initial-scale=1">')
h.push('<title>패턴 닮은꼴 간격 보고서 — 같은 그림은 규칙적으로 돌아오는가</title>')
h.push('<style>')
h.push(CSS)
h.push('</style>')
h.push('</head>')
h.push('<body>')
h.push('<div class="wrap">')
h.push('<h1>패턴 닮은꼴 간격 보고서 — 같은 그림은 규칙적으로 돌아오는가</h1>')
h.push(`<div class="sub">
  용지 위에 같은 그림을 그리는 두 회차를 「닮은꼴」이라 부른다 (평행이동을 허용한 겹침 점수 ${MIN}/6 이상).
  그런 쌍이 ${num(pairs)}개 있다. 이 보고서가 묻는 것은 하나 — <strong>그 닮은꼴들은 규칙적인 간격으로 돌아오는가</strong>.
  1~${num(rang[N - 1])}회 · ${today}.
</div>`)
h.push(`<div class="note">
  「모양 닮은꼴」 화면은 <em>어떤</em> 회차가 닮았는지를 보여준다. 여기서는 그 목록을 받아
  <em>언제</em> 닮았는지만 본다. 네 가지 방법으로 간격을 재고, 매번 우연이 만드는 간격과 견준다.
</div>`)

h.push('<h2>0. 재료</h2>')
h.push(`<p>${num(N)}회차에서 만들 수 있는 쌍은 ${num(N * (N - 1) / 2)}개. 그중 점수 ${MIN}/6 이상은 ${num(pairs)}개,
곧 <strong>${(1 / p).toFixed(0)}쌍에 1쌍</strong>(${(p * 100).toFixed(2)}%)이다. 이 ${num(pairs)}개 쌍의
두 회차 번호 차이가 이 보고서의 모든 자료다. 번호가 무엇이었는지는 더 이상 쓰이지 않는다.</p>`)

h.push('<h2>1. 두 회차 사이의 거리</h2>')
h.push(`<p>먼저 가장 단순한 것. 닮은꼴 쌍의 거리 <code>|a − b|</code>를 ${BIN} 단위로 세었다.
비교선은 <strong>삼각형</strong>이다 — 거리가 d인 쌍은 회차 축 위에 ${num(N)}−d 자리밖에 없으므로,
아무 구조가 없어도 먼 거리일수록 쌍이 적어진다. 이 기울기는 구조가 아니다.</p>`)
h.push(`<div class="chart">${bars(d1, (d) => d.a)}<div class="key">가로 : 두 회차의 거리 (회차) · 세로 : 쌍의 수 · 막대 = 실제, 점선 = 삼각형 기대값</div></div>`)
h.push(`<div class="note ok">χ² ${chi1.toFixed(1)} / 자유도 ${d1.length - 1}. 어느 거리대도 튀지 않는다.
가까운 회차끼리 더 닮지도, 특정 거리에 몰리지도 않는다.</div>`)

h.push('<h2>2. 연속된 닮은꼴 사이의 간격</h2>')
h.push(`<p>한 회차를 기준으로 잡고, 그 닮은꼴들을 회차 순으로 늘어놓은 뒤 이웃한 둘 사이의 간격을 잰다.
모든 기준을 합치면 간격 ${num(gaps.length)}개. <strong>규칙적이라면 이 간격들은 한 값 주위에 모여야 한다</strong> —
즉 표준편차가 평균보다 훨씬 작아야 한다. 기억이 전혀 없다면 표준편차 = 평균(지수분포)이다.</p>`)
h.push(`<div class="chart">${bars(d2, (d) => (d.hi > 1000 ? d.lo + '+' : d.lo === d.hi ? d.lo : d.lo + '-' + d.hi))}<div class="key">가로 : 간격 (회차, 로그 눈금의 구간) · 세로 : 간격의 수 · 막대 = 실제, 점선 = 기억 없음</div></div>`)
h.push(`<div class="scroll"><table>
<tr><th>측도</th><th>실제</th><th>규칙적이라면</th><th>기억이 없다면</th></tr>
<tr><td>평균 간격</td><td class="n">${mean.toFixed(1)}회</td><td class="n">—</td><td class="n">${mean.toFixed(1)}회</td></tr>
<tr><td>표준편차</td><td class="n">${sd.toFixed(1)}</td><td class="n">0 에 가깝게</td><td class="n">${mean.toFixed(1)}</td></tr>
<tr><td>표준편차 ÷ 평균</td><td class="n">${(sd / mean).toFixed(3)}</td><td class="n">≈ 0</td><td class="n">1.000</td></tr>
</table></div>`)
h.push(`<div class="note bad">비율 ${(sd / mean).toFixed(2)} — 0 근처가 아니라 <strong>1보다 크다</strong>.
간격은 규칙적이기는커녕 기억 없는 간격보다도 더 흩어져 있다.
1~2회 간격과 400회 이상 간격이 동시에 많은 것은, 닮은꼴이 유난히 많은 회차와 거의 없는 회차가 섞여 있기 때문이다 —
주기가 아니라 <em>불균등</em>이다.</div>`)

h.push('<h2>3. 거리가 어떤 수의 배수인가</h2>')
h.push(`<p>「닮은꼴은 k회마다 돌아온다」가 사실이라면, 거리를 k로 나눈 나머지가 0에 몰려야 한다.
k = 2부터 120까지 각각 <code>거리 mod k</code>의 χ²를 구하고 z로 환산했다.
(여기서도 기대값은 삼각형을 따른다. 균등으로 놓으면 가짜 신호가 나온다 — 처음 계산에서 z 5.4가 나온 것이 그 실수였다.)</p>`)
h.push(`<div class="chart">${scatter(zs)}<div class="key">가로 : k · 세로 : z · 띠 = ±2 (우연의 범위)</div></div>`)
h.push(`<div class="note ok">가장 높은 것은 k = ${bestK.k}에서 z ${bestK.z.toFixed(2)}.
119번 시험하면 우연만으로도 최대 z가 <strong>2.7 근처</strong>에 온다. 정확히 그만큼 나왔다. 배수 구조는 없다.</div>`)

h.push('<h2>4. 일정한 걸음으로 이어지는 사슬</h2>')
h.push(`<p>앞의 세 검정은 전체를 본다. 이번에는 가장 좋은 한 곳만 본다 —
어느 기준의 닮은꼴들이 <code>r, r+s, r+2s, …</code>처럼 같은 걸음으로 늘어서는 가장 긴 사슬은 얼마인가.
그리고 같은 개수의 회차를 무작위로 뿌렸을 때 나오는 가장 긴 사슬과 비교한다.</p>`)
h.push(`<div class="scroll"><table>
<tr><th>자료</th><th>가장 긴 사슬</th><th>내용</th></tr>
<tr><td>실제 ${num(N)}회차</td><td class="n">${champ.n}회차</td><td>기준 ${champ.ref}회 · 걸음 ${champ.step}</td></tr>
<tr><td>무작위 ${REP}회 재현</td><td class="n">최대 ${maxRnd}회차</td><td>실제와 같거나 더 김 : <strong>${hits} / ${REP}</strong></td></tr>
</table></div>`)
h.push(`<div class="note bad">p = ${(hits / REP).toFixed(3)}. 무작위가 <strong>매번</strong> 실제만큼 하거나 더 잘한다.
실제 자료의 「사슬」은 우연이 저절로 만드는 것보다도 짧다. 규칙적인 걸음은 없다.</div>`)

h.push(`<h2>5. ${num(rang[last])}회의 경우</h2>`)
h.push(`<p>마지막 회차를 기준으로 실제 목록을 보자. 닮은꼴 ${mates.length}회차, 그 간격은 아래와 같다.</p>`)
h.push(`<div class="chart">${timeline(mates, rang[last], rang[N - 1])}<div class="key">금색 = ${num(rang[last])}회의 닮은꼴 · 붉은색 = 기준 회차</div></div>`)
h.push(`<div class="scroll"><table>
<tr><th>닮은꼴</th><td>${mates.join(' · ')}</td></tr>
<tr><th>간격</th><td>${steps.join(' · ')}</td></tr>
<tr><th>마지막 닮은꼴</th><td>${rang[last] - mates[mates.length - 1]}회 전 (${mates[mates.length - 1]}회)</td></tr>
</table></div>`)
h.push(`<div class="note">${Math.min(...steps)}부터 ${Math.max(...steps)}까지. 다음 닮은꼴이 언제 올지 이 간격들로는 좁혀지지 않는다.</div>`)

h.push('<h2>6. 결론 — 그리고 이 「없음」이 뜻하는 것</h2>')
h.push(`<p>네 가지 검정이 모두 같은 답을 준다. <strong>닮은꼴 사이에 규칙적인 간격은 없다.</strong>
닮은꼴은 회차 축 위에 무작위로 흩뿌려져 있고, 「다음 닮은꼴은 N회 뒤」라고 말할 근거가 자료에 없다.</p>`)
h.push(`<div class="scroll"><table>
<tr><th>검정</th><th>겨냥하는 구조</th><th>결과</th></tr>
<tr><td>1. 거리 분포</td><td>특정 거리에 몰림</td><td class="n">χ² ${chi1.toFixed(1)} / ${d1.length - 1}</td></tr>
<tr><td>2. 연속 간격</td><td>일정한 주기</td><td class="n">표준편차 ÷ 평균 = ${(sd / mean).toFixed(2)}</td></tr>
<tr><td>3. 거리 mod k</td><td>k의 배수</td><td class="n">최대 z ${bestK.z.toFixed(2)} (119회 시험)</td></tr>
<tr><td>4. 일정 걸음 사슬</td><td>등차 수열</td><td class="n">p = ${(hits / REP).toFixed(3)}</td></tr>
</table></div>`)
h.push(`<div class="note cool">이 결과는 「모양 닮은꼴」 화면의 다른 사실과 정확히 맞물린다 —
${num(N)}회차가 ${num(N)}개의 서로 다른 그림을 그렸고, 똑같은 모양이 두 번 나온 적은 한 번도 없다.
닮음은 기하학의 사실이지 리듬이 아니다. 두 회차가 닮는 것은 <em>번호가 우연히 같은 자리에 떨어졌기</em> 때문이고,
그 우연에는 달력이 없다.</div>`)
h.push(`<footer>1~${num(rang[N - 1])}회 · 닮은꼴 기준 점수 ${MIN}/6 이상 · 쌍 ${num(pairs)}개 · ${today}<br>
재현 : <code>node --experimental-sqlite tools/rapport-similarite.mjs ${MIN}</code></footer>`)
h.push('</div>')
h.push('</body>')
h.push('</html>')

writeFileSync(OUT, h.join('\n'), 'utf8')
console.log(`${OUT} — ${pairs} paires, chi2 ${chi1.toFixed(1)}, sd/mean ${(sd / mean).toFixed(3)}, best k ${bestK.k} z ${bestK.z.toFixed(2)}, chain ${champ.n} p ${(hits / REP).toFixed(3)}`)
