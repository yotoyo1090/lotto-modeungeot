<script>
  // 주기도 — le périodogramme d'un numéro.
  //
  // Abscisse : la période en 회차, sur une échelle log (2 회차 à gauche, tout
  // l'historique à droite). Ordonnée : la part d'énergie de chaque fréquence.
  // La ligne pointillée est le seuil de Fisher : un pic qui la dépasse est un
  // rythme, un pic en dessous est du bruit — quelle que soit sa hauteur
  // apparente.
  //
  // Même écriture que `FlowChart` : SVG à la main, couleurs du thème, une
  // cible large par point pour le survol.
  import { num } from '../lib/format.js'

  let { result = null, height = 200, label = '주기도', gloss = '주기별 에너지 비율' } = $props()

  const W = 720
  const PAD = { l: 34, r: 10, t: 12, b: 24 }
  const HOVERABLE = 900

  let hover = $state(null)

  const view = $derived.by(() => {
    if (!result || !result.share?.length) return null
    const { periods, share, gStar, peak } = result
    const iw = W - PAD.l - PAD.r
    const ih = height - PAD.t - PAD.b
    const lo = Math.log(2)
    const hi = Math.log(periods[0])                       // la plus longue période : N
    const max = Math.max(gStar * 1.6, ...share)
    const px = (p) => PAD.l + ((Math.log(p) - lo) / (hi - lo)) * iw
    const py = (v) => PAD.t + ih - (v / max) * ih

    const points = share.map((v, k) => ({ period: periods[k], share: v, cx: px(periods[k]), cy: py(v) }))
    const line = points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')

    const ticks = [2, 3, 5, 7, 10, 20, 50, 100, 200, 500, 1000]
      .filter((t) => t >= 2 && t <= periods[0])
      .map((t) => ({ x: px(t), at: t }))
    const rules = [0.25, 0.5, 0.75, 1].map((f) => ({ at: f * max, y: py(f * max) }))
    const peakPt = points[peak.index]
    return { points, line, ticks, rules, threshold: py(gStar), baseline: py(0), peakPt, max }
  })

  const hoverable = $derived(view && view.points.length <= HOVERABLE ? view.points : [])
  const pctOf = (v) => `${(v * 100).toFixed(2)}%`
</script>

<div class="chart">
  <div class="cap">
    <span class="lead">{label}</span>
    <span class="gloss">{gloss}</span>
    <span class="right">
      {#if hover}
        주기 {hover.period.toFixed(1)}회 · {pctOf(hover.share)}
      {:else if result?.peak}
        최고 봉우리 주기 {result.peak.period.toFixed(1)}회 · g {pctOf(result.g)}
        · 문턱 {pctOf(result.gStar)} · p <b class:over={result.g > result.gStar}>{result.p < 0.001 ? '< 0.001' : result.p.toFixed(3)}</b>
      {/if}
    </span>
  </div>

  {#if !view}
    <p class="dim">보여줄 회차가 없습니다.</p>
  {:else}
    <svg viewBox="0 0 {W} {height}" role="img" aria-label="주기도">
      {#each view.rules as r (r.at)}
        <line class="rule" x1={PAD.l} x2={W - PAD.r} y1={r.y} y2={r.y} />
        <text class="rulelabel" x={PAD.l - 5} y={r.y + 3}>{(r.at * 100).toFixed(1)}%</text>
      {/each}
      <line class="axis" x1={PAD.l} x2={W - PAD.r} y1={view.baseline} y2={view.baseline} />

      <!-- Le seuil de Fisher -->
      <line class="threshold" x1={PAD.l} x2={W - PAD.r} y1={view.threshold} y2={view.threshold} />
      <text class="thlabel" x={W - PAD.r} y={view.threshold - 4}>Fisher 5% 문턱</text>

      <polyline class="line" points={view.line} />

      <circle class="peak" class:over={result.g > result.gStar} cx={view.peakPt.cx} cy={view.peakPt.cy} r="3.5" />

      {#each view.ticks as t (t.at)}
        <text class="tick" x={t.x} y={height - 6}>{t.at}</text>
      {/each}

      {#each hoverable as p, k (k)}
        <circle class="hit" cx={p.cx} cy={p.cy} r="5"
                onmouseenter={() => (hover = p)}
                onmouseleave={() => (hover = null)}
                role="presentation" />
      {/each}
      {#if hover}
        <line class="cursor" x1={hover.cx} x2={hover.cx} y1={PAD.t} y2={view.baseline} />
      {/if}
    </svg>
    <div class="legend">
      <span class="name dim">가로 = 주기(회차, 로그 눈금) · 세로 = 에너지 비율 · 점선 위로 솟은 봉우리만 「리듬」입니다</span>
    </div>
  {/if}
</div>

<style>
  .cap { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .lead { font-size: 0.8125rem; color: var(--muted); }
  .gloss { font-size: 0.75rem; color: var(--line); }
  .cap .right { margin-left: auto; font-size: 0.75rem; color: var(--ink-soft); font-family: var(--figure); }
  .cap .right b { color: var(--ink); margin-left: 0.15rem; }
  .cap .right b.over { color: var(--hit-bg); }

  svg { width: 100%; height: auto; display: block; overflow: visible; }
  .rule { stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 2 4; }
  .axis { stroke: var(--line); stroke-width: 1; }
  .rulelabel { font-size: 9px; text-anchor: end; fill: var(--muted); font-family: var(--figure); }
  .tick { font-size: 9px; text-anchor: middle; fill: var(--muted); font-family: var(--figure); }
  .thlabel { font-size: 9px; text-anchor: end; fill: var(--hit-bg); font-family: var(--figure); }
  @media (max-width: 640px) { .rulelabel, .tick, .thlabel { font-size: 17px; } }

  .line { fill: none; stroke: var(--line); stroke-width: 1; stroke-linejoin: round; }
  .threshold { stroke: var(--hit-bg); stroke-width: 1.2; stroke-dasharray: 5 3; }
  .peak { fill: var(--gold); }
  .peak.over { fill: var(--hit-bg); }
  .hit { fill: transparent; }
  .hit:hover { fill: color-mix(in srgb, var(--gold) 18%, transparent); }
  .cursor { stroke: var(--gold); stroke-width: 1; stroke-dasharray: 2 3; }
  .legend { margin-top: 0.5rem; font-size: 0.75rem; }
  .name { color: var(--ink-soft); }
</style>
