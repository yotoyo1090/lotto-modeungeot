<script>
  // 감시 — l'onglet à côté de 공나온 순서.
  //
  // Quatre surveillances CUSUM, rejouées sur tout l'historique à chaque
  // ouverture. Rien n'est stocké ; les calculs sont dans `core/watch.js`.
  // Chaque bloc montre son pire accumulateur, sa courbe, et — surtout —
  // le délai que ce détecteur mettrait à voir le défaut qu'il vise.
  import { watch } from '@core/watch.js'

  let { draws, order = null, hogi = null } = $props()

  const result = $derived.by(() => {
    if (!draws) return null
    const toMap = (obj, f) => (obj && Object.keys(obj).length
      ? new Map(Object.entries(obj).map(([r, v]) => [Number(r), f(v)])) : null)
    return watch(draws, { order: toMap(order, (v) => v), hogi: toMap(hogi, (v) => v) })
  })

  const KEYS = ['freq', 'order', 'machine', 'carry']
  const STATE = { ok: '정상', watch: '주의', alarm: '경보' }
  const TARGET = {
    freq: '번호 하나가 두 배로 나옴',
    order: '공 하나가 한 자리 먼저(늦게) 나옴',
    machine: '기계 한 대에서 번호 하나가 두 배로 나옴',
    carry: '이월 개수가 두 배로 늘어남',
  }
  const num = (v) => v.toLocaleString('ko-KR')
  const years = (w) => (w / 52).toFixed(1)

  // La courbe : maximum des accumulateurs semaine après semaine, en % de h.
  function path(trail, h, w = 600, ht = 90) {
    if (!trail.length) return ''
    const n = trail.length
    return trail.map((v, i) => `${(i / (n - 1)) * w},${ht - Math.min(1.2, v / h) / 1.2 * ht}`).join(' ')
  }
</script>

{#if !result}
  <section class="panel"><p class="dim">자료가 없습니다.</p></section>
{:else}
  <section class="panel">
    <div class="head">
      <h2>감시</h2>
      <span class="gloss">기계가 이번 주도 바르게 돌았는가</span>
      <span class="right">{num(result.rangs.length)}회차 · 매주 갱신</span>
    </div>
    <p class="lede">
      무작위성 보고서는 <strong>과거 전체</strong>를 본다. 여기서는 매주 <strong>누적합(CUSUM)</strong>이
      작은 편차를 쌓는다 — 정상 주는 0으로 되돌리고, 지속되는 편차만 올라간다.
      문턱 h는 226개 누적기 전체에서 <strong>10년에 한 번</strong> 거짓 경보가 나도록 잡았다.
    </p>
    <div class="facts">
      {#each KEYS as key (key)}
        <div class="fact">
          <span class="k">{result[key].label}</span>
          <b class="figure st-{result[key].state}">{STATE[result[key].state]}</b>
          <span class="dim small">최대 {(result[key].worst.ratio * 100).toFixed(0)}% of h</span>
        </div>
      {/each}
    </div>
    <p class="note dim">
      초록이라고 편향이 없다는 뜻은 아니다. 각 감시는 <strong>겨냥한 결함</strong>이 있고, 그 결함이
      생겼을 때 평균 몇 년 뒤에 잡는지가 아래에 적혀 있다. 일주일에 추첨이 한 번뿐이라 느리다 —
      그것이 이 문제의 물리적 한계이고, 이 화면은 그 한계를 숨기지 않는다.
    </p>
  </section>

  {#each KEYS as key (key)}
    {@const s = result[key]}
    <section class="panel">
      <div class="head">
        <h2>{s.label}</h2>
        <span class="gloss">{TARGET[key]} → 평균 {years(s.delay)}년 뒤 감지</span>
        <span class="right">h = {s.h.toFixed(1)}σ · k = {s.k.toFixed(2)}σ</span>
      </div>

      <svg class="trail" viewBox="0 0 600 100" preserveAspectRatio="none" aria-label="누적 최대값 추이">
        <line x1="0" y1={100 - 100 / 1.2} x2="600" y2={100 - 100 / 1.2} class="h" />
        <line x1="0" y1={100 - 50 / 1.2} x2="600" y2={100 - 50 / 1.2} class="half" />
        <polyline points={path(s.trail, s.h)} />
      </svg>
      <p class="dim small">{s.rows.length}개 누적기의 주별 최대값, 문턱 h 대비. 점선 = h, 연한 선 = h/2.</p>

      <div class="scroll">
        <table>
          <thead><tr><th>누적기</th><th>지금</th><th>h 대비</th><th>역대 최고</th><th>언제</th><th></th></tr></thead>
          <tbody>
            {#each s.rows.slice(0, 6) as row (row.label)}
              <tr>
                <td>{row.label}</td>
                <td>{row.value.toFixed(1)}</td>
                <td>{(row.ratio * 100).toFixed(0)}%</td>
                <td>{row.peak.toFixed(1)}</td>
                <td>{row.peakAt ?? '—'}회</td>
                <td class="dim">{STATE[row.state]}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/each}
{/if}

<style>
  .lede { margin: 0 0 1.1rem; color: var(--ink-soft); max-width: 66ch; }
  .lede strong { color: var(--ink); font-weight: 600; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 76ch; }
  .note strong { color: var(--ink); font-weight: 600; }
  .small { font-size: 0.75rem; }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 1rem 1.5rem;
  }
  .fact { display: flex; flex-direction: column; gap: 0.15rem; }
  .fact .k {
    font-size: 0.6875rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--muted);
  }
  .st-ok { color: var(--green, #4a7c59); }
  .st-watch { color: var(--gold-deep); }
  .st-alarm { color: var(--hot, #b4432f); }
  .trail { width: 100%; height: 100px; margin: 0.5rem 0 0.2rem; }
  .trail polyline { fill: none; stroke: var(--gold); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .trail .h { stroke: var(--hot, #b4432f); stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
  .trail .half { stroke: var(--line); vector-effect: non-scaling-stroke; }
</style>
