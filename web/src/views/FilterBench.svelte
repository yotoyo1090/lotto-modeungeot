<script>
  // 팁 › 필터 조합 검정.
  //
  // Les cases du 자동조합, seules, par centaines de combinaisons, et toutes
  // ensemble : attrapent-elles les numéros gagnants mieux que le hasard ?
  // Le calcul (une vingtaine de minutes, voir `src/core/filter-bench.js`)
  // tourne dans `npm run bench:filters` ; l'écran lit son résultat figé.
  import BENCH from '../lib/filter-bench.json'
  import { num } from '../lib/format.js'

  const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`
  const gain = (r) => r.te / r.K
  // La marge du hasard (95 %) autour de 1 pour un filtre qui garde K.
  const margin = (K) => 1.96 * Math.sqrt(K * (1 - K) / BENCH.testCount) / K

  const all80 = BENCH.all['0.8']
  const all90 = BENCH.all['0.9']
  const lastStep = BENCH.greedy.at(-1)
  const above = BENCH.random.filter((r) => r[3] > 1.96).length
  const below = BENCH.random.filter((r) => r[3] < -1.96).length

  // Chaque filtre seul, au niveau le plus proche de 80 %, trié par gain.
  const singles = (() => {
    const best = new Map()
    for (const s of BENCH.singles) {
      const cur = best.get(s.key)
      if (!cur || Math.abs(s.level - 0.8) < Math.abs(cur.level - 0.8)) best.set(s.key, s)
    }
    return [...best.values()].sort((a, b) => gain(b) - gain(a))
  })()
  const singleRange = [Math.min(...singles.map(gain)), Math.max(...singles.map(gain))]

  // ── 1 · le nuage : 통과 en x, 적중 en y
  const SC = { L: 56, R: 740, T: 16, B: 380 }
  const sx = (v) => SC.L + v * (SC.R - SC.L)
  const sy = (v) => SC.B - v * (SC.B - SC.T)
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1]

  // ── 2 · le glouton : gain d'apprentissage contre gain de test
  const GR = { L: 50, R: 740, T: 16, B: 280, lo: 0.7, hi: 1.5 }
  const gx = (s) => GR.L + (s - 1) / Math.max(1, BENCH.greedy.length - 1) * (GR.R - GR.L)
  const gy = (v) => GR.B - (Math.min(GR.hi, Math.max(GR.lo, v)) - GR.lo) / (GR.hi - GR.lo) * (GR.B - GR.T)
  const gTicks = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]
  const line = (key) => BENCH.greedy.map((g) => `${gx(g.step)},${gy(key === 'tr' ? g.tr / g.K : g.te / g.K)}`).join(' ')

  // ── 3 · chaque filtre seul
  const SI = { L: 130, R: 690, T: 30, H: 24, lo: 0.8, hi: 1.2 }
  const ix = (v) => SI.L + (Math.min(SI.hi, Math.max(SI.lo, v)) - SI.lo) / (SI.hi - SI.lo) * (SI.R - SI.L)
  const siBottom = SI.T + singles.length * SI.H
  const iTicks = [0.8, 0.9, 1.0, 1.1, 1.2]
</script>

<section class="panel">
  <div class="head">
    <h2>필터 조합 검정</h2>
    <span class="gloss">자동조합의 필터를 전부 섞어도, 우연을 넘는가</span>
    <span class="right">{num(BENCH.trainCount + BENCH.testCount)}회차</span>
  </div>

  <p class="lead">
    자동조합의 체크 상자 — 총합 · 저고 · 홀짝 · AC값 · 이월 · 앞/끝자리수합 · 소수 ·
    합성수 · 배수 · 그 합 · 앞쌍 · 끝쌍 · 분배 — 를 <strong>하나씩</strong>,
    <strong>수백 가지 조합으로</strong>, 그리고 <strong>전부 한꺼번에</strong> 시험했습니다.
    값은 앞쪽 회차({BENCH.trainFrom}~{num(BENCH.trainTo)}회)에서 자주 나온 것부터 골랐고,
    채점은 그 선택이 한 번도 보지 못한 뒤쪽 회차({num(BENCH.testFrom)}~{num(BENCH.testTo)}회)에서 했습니다.
  </p>

  <div class="big">
    <div class="cell hero">
      <span class="v">{pct(all80.K)} → {pct(all80.te)}</span>
      <span class="k">모든 필터 각 80% : 조합 {num(all80.kept)}개가 남고, 최근 당첨번호도 그만큼만 들어 있음</span>
    </div>
    <div class="cell">
      <span class="v">{(lastStep.tr / lastStep.K).toFixed(2)} → {(lastStep.te / lastStep.K).toFixed(2)}</span>
      <span class="k">앞쪽 회차에서 찾은 「최고의 조합」 — 뒤쪽 회차에서는</span>
    </div>
    <div class="cell">
      <span class="v">{above} / {BENCH.random.length}</span>
      <span class="k">무작위 필터 조합 중 우연을 뚜렷이 넘은 것 (밑돈 것 {below})</span>
    </div>
  </div>

  <p class="foot">
    <strong>어떤 필터 조합도 당첨번호를 우연보다 잘 잡지 못했습니다.</strong>
    필터는 조합 수를 줄이고, 당첨번호도 <em>정확히 같은 비율로</em> 함께 줄어듭니다.
    한 장의 당첨 확률은 어떤 설정에서도 1/8,145,060입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>점 하나가 필터 조합 하나</h2>
    <span class="gloss">남긴 조합의 비율 ↔ 잡은 당첨 회차의 비율</span>
  </div>
  <p class="lead">
    가로는 8,145,060개 중 남긴 비율(통과), 세로는 뒤쪽 회차 중 당첨번호가 남은 비율(적중)입니다.
    점선이 우연입니다. 쓸모 있는 필터라면 점선보다 <em>뚜렷이 위</em>에 있어야 하지만, 모든 점이 점선에 붙어 있습니다.
  </p>
  <div class="scroll">
    <svg class="chart" viewBox="0 0 760 420" role="img" aria-label="통과와 적중">
      {#each ticks as t (t)}
        <line class="grid" x1={sx(t)} x2={sx(t)} y1={SC.T} y2={SC.B} />
        <line class="grid" x1={SC.L} x2={SC.R} y1={sy(t)} y2={sy(t)} />
        <text x={sx(t)} y={SC.B + 16} text-anchor="middle">{pct(t, 0)}</text>
        <text x={SC.L - 8} y={sy(t) + 4} text-anchor="end">{pct(t, 0)}</text>
      {/each}
      <text x={(SC.L + SC.R) / 2} y="414" text-anchor="middle">통과 — 남긴 조합의 비율</text>
      <line class="chance" x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} />
      <text class="chance-t" x={sx(0.84)} y={sy(0.84) - 10} text-anchor="end">우연</text>
      {#each BENCH.random as [K, te], i (i)}
        <circle class="rnd" cx={sx(K)} cy={sy(te)} r="3" />
      {/each}
      {#each BENCH.singles as s, i (i)}
        <circle class="one" cx={sx(s.K)} cy={sy(s.te)} r="3.5" />
      {/each}
      {#each [[all80, '각 80%'], [all90, '각 90%']] as [a, name] (name)}
        <circle class="all" cx={sx(a.K)} cy={sy(a.te)} r="6" />
        <text class="all-t" x={sx(a.K) + 10} y={sy(a.te) + 4}>모든 필터 {name}</text>
      {/each}
    </svg>
  </div>
  <p class="legend">
    <span><i class="rnd"></i>무작위 조합 {BENCH.random.length}가지 (필터 3~8개)</span>
    <span><i class="one"></i>필터 하나씩</span>
    <span><i class="all"></i>모든 필터 각 80% · 90%</span>
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>「최고의 조합」은 버티지 못합니다</h2>
    <span class="gloss">필터를 하나씩 더할 때, 앞쪽 회차와 뒤쪽 회차</span>
  </div>
  <p class="lead">
    앞쪽 회차에서 배율(적중 ÷ 통과)을 가장 많이 올리는 필터를 하나씩 더했습니다.
    앞쪽에서는 매번 좋아져 <strong>{(lastStep.tr / lastStep.K).toFixed(2)}배</strong>까지 오르지만,
    뒤쪽 회차에서는 <strong>{(lastStep.te / lastStep.K).toFixed(2)}배</strong> 언저리에 머뭅니다.
    찾아낸 것은 규칙이 아니라 <em>앞쪽 회차의 우연</em>이었습니다.
  </p>
  <div class="scroll">
    <svg class="chart" viewBox="0 0 760 320" role="img" aria-label="필터 수에 따른 배율">
      {#each gTicks as v (v)}
        <line class="grid" x1={GR.L} x2={GR.R} y1={gy(v)} y2={gy(v)} />
        <text x={GR.L - 8} y={gy(v) + 4} text-anchor="end">{v.toFixed(1)}</text>
      {/each}
      {#each BENCH.greedy as g (g.step)}
        <line class="band" x1={gx(g.step)} x2={gx(g.step)} y1={gy(1 + margin(g.K))} y2={gy(1 - margin(g.K))} />
        <text x={gx(g.step)} y={GR.B + 18} text-anchor="middle">{g.step}</text>
      {/each}
      <text x={(GR.L + GR.R) / 2} y="316" text-anchor="middle">더한 필터 수</text>
      <line class="chance" x1={GR.L} x2={GR.R} y1={gy(1)} y2={gy(1)} />
      <polyline class="tr" points={line('tr')} />
      <polyline class="te" points={line('te')} />
      {#each BENCH.greedy as g (g.step)}
        <circle class="tr-d" cx={gx(g.step)} cy={gy(g.tr / g.K)} r="4" />
        <circle class="te-d" cx={gx(g.step)} cy={gy(g.te / g.K)} r="4" />
      {/each}
    </svg>
  </div>
  <p class="legend">
    <span><i class="tr-d"></i>앞쪽 회차 (고른 곳)</span>
    <span><i class="te-d"></i>뒤쪽 회차 (채점한 곳)</span>
    <span><i class="band-i"></i>우연의 폭 (95%)</span>
  </p>
  <div class="scroll">
    <table>
      <thead>
        <tr><th>단계</th><th>더한 필터</th><th>체크한 값</th><th class="v">통과</th><th class="v">앞쪽 배율</th><th class="v">뒤쪽 배율</th></tr>
      </thead>
      <tbody>
        {#each BENCH.greedy as g (g.step)}
          <tr>
            <td class="v">{g.step}</td>
            <td>{g.label}</td>
            <td class="vals">{g.what}</td>
            <td class="v">{pct(g.K)}</td>
            <td class="v">{(g.tr / g.K).toFixed(2)}</td>
            <td class="v" class:up={g.te / g.K >= 1} class:down={g.te / g.K < 1}>{(g.te / g.K).toFixed(2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>필터 하나씩</h2>
    <span class="gloss">80%에 가장 가까운 설정, 뒤쪽 회차의 배율</span>
    <span class="right">{singleRange[0].toFixed(2)} ~ {singleRange[1].toFixed(2)}배</span>
  </div>
  <p class="lead">
    회색 띠는 우연의 폭(95%)입니다. 점이 띠 안에 있으면 1.00과의 차이는 우연으로 설명됩니다.
  </p>
  <div class="scroll">
    <svg class="chart" viewBox="0 0 760 {siBottom + 40}" role="img" aria-label="필터별 배율">
      {#each iTicks as v (v)}
        <line class="grid" x1={ix(v)} x2={ix(v)} y1={SI.T - 8} y2={siBottom} />
        <text x={ix(v)} y={siBottom + 16} text-anchor="middle">{v.toFixed(1)}</text>
      {/each}
      <line class="chance" x1={ix(1)} x2={ix(1)} y1={SI.T - 8} y2={siBottom} />
      <text class="chance-t" x={ix(1)} y={SI.T - 14} text-anchor="middle">우연 1.00</text>
      {#each singles as s, i (s.key)}
        <text class="name" x={SI.L - 10} y={SI.T + i * SI.H + SI.H / 2 + 4} text-anchor="end">{s.label}</text>
        <line class="band" x1={ix(1 - margin(s.K))} x2={ix(1 + margin(s.K))} y1={SI.T + i * SI.H + SI.H / 2} y2={SI.T + i * SI.H + SI.H / 2} />
        <line class="stem" x1={ix(1)} x2={ix(gain(s))} y1={SI.T + i * SI.H + SI.H / 2} y2={SI.T + i * SI.H + SI.H / 2} />
        <circle class="te-d" cx={ix(gain(s))} cy={SI.T + i * SI.H + SI.H / 2} r="4.5" />
        <text class="num" x="704" y={SI.T + i * SI.H + SI.H / 2 + 4}>{gain(s).toFixed(2)}</text>
      {/each}
    </svg>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>검정 설정 — 모든 필터 각 80%</h2>
    <span class="gloss">자동조합의 「검정 설정 불러오기」가 체크하는 값</span>
    <span class="right">남는 조합 {num(all80.kept)}개</span>
  </div>
  <p class="lead">
    필터마다 앞쪽 회차의 약 80%가 들어가도록, 많이 나온 값부터 체크했습니다.
    조합은 <strong>{pct(all80.K)}</strong>만 남고, 뒤쪽 회차의 당첨번호는 <strong>{pct(all80.te)}</strong>가
    그 안에 있었습니다 — 우연과 같은 비율입니다.
  </p>
  <div class="scroll">
    <table>
      <thead><tr><th>필터</th><th>체크한 값</th></tr></thead>
      <tbody>
        {#each all80.rows as r (r.label)}
          <tr><td>{r.label}</td><td class="vals">{r.what}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>무엇을 뜻하나</h2>
  </div>
  <ol class="proto">
    <li><b>필터는 조합 수를 줄이는 도구</b>입니다. 자주 나온 값(큰 칸)을 체크하면 흔한 모양만 남기고
      조합 수를 줄일 수 있습니다. 드문 값을 체크해도 무엇을 <em>예측</em>하는 것이 아니라 드문 모양을 남길 뿐입니다.</li>
    <li>필터를 몇 개 겹쳐도 <b>한 장의 당첨 확률은 1/8,145,060</b> 그대로입니다.</li>
    <li>실제로 달라지는 것은 <b>분배</b>뿐입니다 — 당첨 확률이 아니라, 1등을 몇 명과 나누느냐가 달라집니다.</li>
  </ol>
  <p class="foot dim">
    방법 : 통과는 앱의 계산 엔진이 8,145,060개를 전부 세어 얻었고, 적중은 같은 규칙으로 각 회차의
    당첨번호 여섯 개를 확인했습니다. 이월 개수 · 이월합의 통과는 전회차에 따라 달라서
    {num(BENCH.testCount + BENCH.trainCount)}회차 중 일부 전회차로 평균을 냈습니다.
    전회차이월번위치 · 앞자리수 · 끝자리수는 번호를 통째로 빼는 필터라 이 검정에서 뺐습니다.
    새 회차가 쌓이면 <code>npm run bench:filters</code>로 다시 계산합니다(약 20분).
  </p>
</section>

<style>
  .lead { margin: 0 0 1rem; font-size: 0.8125rem; line-height: 1.7; color: var(--ink-soft); }
  .lead strong { color: var(--ink); font-weight: 600; }
  .lead em { font-style: normal; color: var(--gold-deep); }

  .big {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    margin: 1.2rem 0 0.3rem;
  }
  .big .cell { display: flex; flex-direction: column; gap: 0.25rem; }
  .big .v { font-family: var(--figure); font-size: 1.45rem; color: var(--ink); }
  .big .k { font-size: 0.75rem; color: var(--muted); line-height: 1.5; }
  .big .hero .v { color: var(--gold-deep); }

  .scroll { overflow-x: auto; }
  .chart { display: block; width: 100%; min-width: 34rem; height: auto; }
  .chart text { font-size: 11px; fill: var(--muted); }
  .chart .name { fill: var(--ink); font-size: 12px; }
  .chart .num { fill: var(--ink); font-family: var(--figure); }
  .grid { stroke: var(--line-soft); }
  .chance { stroke: var(--muted); stroke-dasharray: 5 4; stroke-width: 1.5; }
  .chart .chance-t { fill: var(--muted); }
  .rnd { fill: var(--muted); fill-opacity: 0.4; }
  .one { fill: var(--ink-soft); }
  .all { fill: var(--gold); stroke: var(--surface); stroke-width: 2; }
  .chart .all-t { fill: var(--ink); font-size: 12px; }
  .band { stroke: var(--muted); stroke-opacity: 0.22; stroke-width: 8; stroke-linecap: round; }
  .stem { stroke: var(--gold); stroke-width: 2; }
  .tr { fill: none; stroke: var(--ink-soft); stroke-width: 2.5; }
  .te { fill: none; stroke: var(--gold); stroke-width: 2.5; }
  .tr-d { fill: var(--ink-soft); }
  .te-d { fill: var(--gold); }

  .legend { display: flex; flex-wrap: wrap; gap: 1rem; margin: 0.5rem 0 0.8rem; font-size: 0.75rem; color: var(--muted); }
  .legend i { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; margin-right: 0.35rem; vertical-align: -1px; }
  .legend i.rnd { background: var(--muted); opacity: 0.5; }
  .legend i.one, .legend i.tr-d { background: var(--ink-soft); }
  .legend i.all, .legend i.te-d { background: var(--gold); }
  .legend i.band-i { background: var(--muted); opacity: 0.3; border-radius: 3px; }

  table { width: 100%; font-size: 0.8125rem; }
  th, td { padding: 0.28rem 0.5rem; text-align: left; vertical-align: top; }
  th { color: var(--muted); font-weight: 400; font-size: 0.75rem; border-bottom: 1px solid var(--line); }
  td { border-bottom: 1px solid var(--line-soft); }
  .v { font-family: var(--figure); text-align: right; white-space: nowrap; }
  .vals { font-family: var(--figure); font-size: 0.75rem; color: var(--ink-soft); }
  .up { color: var(--gold-deep); }
  .down { color: var(--hot, #b4432f); }

  .proto { margin: 0; padding-left: 1.2rem; font-size: 0.8125rem; line-height: 1.75; }
  .proto li { margin-bottom: 0.6rem; color: var(--ink-soft); }
  .proto b { color: var(--ink); font-weight: 600; }
  .proto em { font-style: normal; color: var(--gold-deep); }

  .foot { margin: 1rem 0 0; font-size: 0.75rem; line-height: 1.7; color: var(--ink-soft); }
  .foot strong { color: var(--ink); font-weight: 600; }
  .foot em { font-style: normal; color: var(--gold-deep); }
  .dim { color: var(--muted); }
</style>
