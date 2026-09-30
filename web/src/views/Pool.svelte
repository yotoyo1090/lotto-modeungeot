<script>
  // 풀 검정 — l'écran qui manquait.
  //
  // Les onze autres décrivent : ils comptent, ils classent, ils colorient.
  // Aucun ne répond à la question qui décide de tout — « ce que je viens de
  // composer, est-ce mieux que de tirer les numéros au sort ? »
  //
  // Ici on compose un ensemble avec n'importe quelle règle, et l'écran le
  // rejoue sur mille회차 en marche avant : à chaque 회차 il refait l'ensemble
  // sans regarder ce 회차-là, et compte ce qu'il a attrapé. La réponse tombe
  // en une ligne.
  //
  // Le bloc 전반부 / 후반부 est le cœur de la page. Une règle qui paraît
  // bonne sur toute la période mais ne l'est que sur une moitié n'a rien
  // trouvé — c'est la forme exacte d'une coïncidence, et c'est ce qui a
  // démasqué 차가운 (14,16% puis 13,36%).
  import {
    BASE_RATE, POOL_RULES, buildPool, poolCapture, poolRule, poolVerdict,
  } from '@core/pool.js'
  import { allCells } from '@core/tablelist.js'
  import { NMAX } from '@core/draws.js'
  import { num, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'

  let { draws } = $props()

  let rule = $state('cold')
  let size = $state(14)
  let window = $state(30)
  let mine = $state([])

  const spec = $derived(poolRule(rule))
  const SIZES = [6, 10, 14, 20, 25, 30]
  const WINDOWS = [5, 10, 30, 60, 120]

  // Les 45 cases de chaque 회차 — une seule passe, partagée par la règle
  // 패턴 et par la proposition du 회차 à venir.
  const cells = $derived(allCells(draws))

  const opts = $derived({ rule, size, window, numbers: mine, from: 200, cells })
  const result = $derived(poolCapture(draws, opts))
  const verdict = $derived(poolVerdict(result))

  // Ce que la règle propose pour le 회차 qui vient — la seule sortie de cette
  // page qui serve à décider quelque chose.
  const upcoming = $derived.by(() => {
    try { return buildPool(draws, draws.n, opts) } catch { return [] }
  })

  const pc = (v, d = 2) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`)
  const f2 = (v) => (v === null || v === undefined ? '—' : v.toFixed(2))
  const f4 = (v) => (v === null || v === undefined ? '—' : v.toFixed(4))

  function toggle(n) {
    mine = mine.includes(n) ? mine.filter((x) => x !== n) : [...mine, n].sort((a, b) => a - b)
  }

  const PAD = Array.from({ length: NMAX }, (_, k) => k + 1)

  // La répartition observée contre l'attendue, prête à dessiner.
  const bars = $derived.by(() => {
    if (!result.ok) return []
    const out = []
    const max = Math.max(
      ...[...result.dist.values()],
      ...result.expectedDist,
    )
    for (let k = 0; k <= 6; k++) {
      const obs = result.dist.get(k) ?? 0
      const exp = result.expectedDist[k] ?? 0
      if (obs === 0 && exp < 0.5) continue
      out.push({ k, obs, exp, wo: max ? obs / max : 0, we: max ? exp / max : 0 })
    }
    return out
  })
</script>

<section class="panel">
  <div class="head">
    <h2>풀 검정</h2>
    <span class="gloss">이 묶음은 우연보다 나은가</span>
    <span class="right">기준 6/45 = {pc(BASE_RATE, 3)}</span>
  </div>

  <p class="lede">
    번호 묶음을 하나 만들면, 그 묶음은 회차마다
    <strong>크기 × 6/45</strong>개의 당첨번호를 잡아야 합니다. 더도 덜도
    아닙니다. 아래에서 규칙을 고르면, 그 규칙을 {num(200)}회부터 지금까지
    <strong>매 회차 다시 만들어</strong> — 그 회차는 절대 보지 않고 —
    실제로 몇 개를 잡았는지 셉니다.
  </p>

  <div class="chips" role="group" aria-label="규칙">
    {#each POOL_RULES as r (r.key)}
      <button class:on={rule === r.key} onclick={() => (rule = r.key)} title={r.gloss}>
        {r.label}
      </button>
    {/each}
  </div>
  <p class="gloss-line dim">{spec?.gloss ?? ''}</p>

  {#if spec?.size}
    <div class="knob">
      <span class="label">묶음 크기</span>
      <div class="chips small">
        {#each SIZES as s (s)}
          <button class:on={size === s} onclick={() => (size = s)}>{s}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if spec?.window}
    <div class="knob">
      <span class="label">기간</span>
      <div class="chips small">
        {#each WINDOWS as w (w)}
          <button class:on={window === w} onclick={() => (window = w)}>{w}회</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if spec?.manual}
    <div class="knob column">
      <span class="label">번호를 직접 고르세요 — {mine.length}개</span>
      <div class="pad">
        {#each PAD as n (n)}
          <button class="cell" class:on={mine.includes(n)} onclick={() => toggle(n)}
                  style={`--tone: var(${SECTION_VARS[sectionOf(n)]})`}>{n}</button>
        {/each}
      </div>
      {#if mine.length}
        <button class="reset" onclick={() => (mine = [])}>초기화</button>
      {/if}
    </div>
  {/if}
</section>

{#if spec?.manual && !mine.length}
  <section class="panel">
    <p class="dim">
      위 판에서 번호를 골라 주세요. 몇 개든 상관없습니다 — 여섯 개든
      스무 개든, 고른 만큼을 {num(200)}회부터 지금까지 되짚어 검정합니다.
    </p>
  </section>
{:else if !result.ok}
  <section class="panel">
    <p class="dim">{result.why}</p>
  </section>
{:else}
  <section class="panel verdict {verdict.key}">
    <div class="head">
      <h2>판정</h2>
      <span class="gloss">{fmt(result.span[0])} – {fmt(result.span[1])} · {num(result.whole.draws)} 회차</span>
    </div>

    <p class="call">{verdict.label}</p>
    <p class="call-gloss dim">{verdict.gloss}</p>

    <div class="facts">
      <div class="fact">
        <span class="k">회차당 잡은 개수</span>
        <b class="figure">{f4(result.whole.perDraw)}</b>
        <span class="dim small">기대 {f4(result.whole.expectedPerDraw)}</span>
      </div>
      <div class="fact">
        <span class="k">번호 하나가 나온 비율</span>
        <b class="figure">{pc(result.whole.rate)}</b>
        <span class="dim small">기준 {pc(BASE_RATE, 3)}</span>
      </div>
      <div class="fact">
        <span class="k">z</span>
        <b class="figure">{result.whole.z > 0 ? '+' : ''}{f2(result.whole.z)}</b>
        <span class="dim small">p = {result.whole.p?.toFixed(3) ?? '—'}</span>
      </div>
      <div class="fact">
        <span class="k">묶음이 바뀐 횟수</span>
        <b class="figure">{num(result.distinct)}</b>
        <span class="dim small">{num(result.whole.draws)} 회차 중</span>
      </div>
    </div>

    <p class="note dim">
      z는 우연에서 얼마나 벗어났는지입니다. p&lt;0.05 하나만으로도
      <strong>1.96</strong>이 필요하고, 여러 규칙을 함께 시험한다면 그보다 더
      필요합니다. 「묶음이 바뀐 횟수」가 적으면 회차 수만큼 측정한 것이
      아닙니다 — 한 번 정하고 기다린 것입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>전반부와 후반부</h2>
      <span class="gloss">진짜 효과라면 양쪽에 다 있어야 합니다</span>
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>구간</th><th class="v">회차</th><th class="v">잡음</th>
            <th class="v">기대</th><th class="v">비율</th><th class="v">z</th>
          </tr>
        </thead>
        <tbody>
          {#each [['전반부', result.first], ['후반부', result.second]] as [label, half] (label)}
            <tr>
              <td><b>{label}</b></td>
              <td class="val">{num(half.draws)}</td>
              <td class="val">{num(half.caught)}</td>
              <td class="val dim">{half.expected.toFixed(1)}</td>
              <td class="val">{pc(half.rate)}</td>
              <td class="val" class:up={half.z > 0} class:down={half.z < 0}>
                {half.z > 0 ? '+' : ''}{f2(half.z)}
              </td>
            </tr>
          {/each}
          <tr class="whole">
            <td><b>전체</b></td>
            <td class="val">{num(result.whole.draws)}</td>
            <td class="val">{num(result.whole.caught)}</td>
            <td class="val dim">{result.whole.expected.toFixed(1)}</td>
            <td class="val">{pc(result.whole.rate)}</td>
            <td class="val">{result.whole.z > 0 ? '+' : ''}{f2(result.whole.z)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="note dim">
      이 표가 이 화면의 핵심입니다. 직전 회차의 번호(이월)는 전체로 보면
      13.76%로 기준을 넘는 듯했지만, 나눠 보면 전반부 14.16% · 후반부
      13.36%였습니다 — 한쪽에만 있었던 것이고, 그것이 우연의 생김새입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>다음 회차용 묶음</h2>
      <span class="gloss">{fmt(draws.rangs[draws.n - 1] + 1)} · 이 규칙이 지금 지목하는 번호</span>
      <span class="right">{upcoming.length}개</span>
    </div>

    {#if upcoming.length}
      <div class="balls">
        {#each upcoming as n (n)}
          <span class="ball" style={`--tone: var(${SECTION_VARS[sectionOf(n)]})`}>{n}</span>
        {/each}
      </div>
      <p class="note dim">
        이 묶음이 다음 회차에서 잡을 것으로 <strong>기대되는</strong> 개수는
        {(upcoming.length * BASE_RATE).toFixed(2)}개입니다. 위의 판정이
        「우연과 구별되지 않습니다」라면, 이 번호들은 아무 번호
        {upcoming.length}개와 정확히 같은 값어치입니다.
      </p>
    {:else}
      <p class="dim">번호를 고르면 여기에 표시됩니다.</p>
    {/if}
  </section>

  <section class="panel">
    <div class="head">
      <h2>몇 개를 잡았나</h2>
      <span class="gloss">관측 · 기대 (초기하분포)</span>
    </div>

    <div class="dist">
      {#each bars as b (b.k)}
        <div class="drow">
          <span class="dk">{b.k}개</span>
          <div class="track">
            <div class="bar obs" style={`width:${b.wo * 100}%`}></div>
            <div class="bar exp" style={`width:${b.we * 100}%`}></div>
          </div>
          <span class="dv">{num(b.obs)}</span>
          <span class="dv dim">{b.exp.toFixed(1)}</span>
        </div>
      {/each}
    </div>

    <div class="key dim">
      <span><i class="sw obs"></i> 관측</span>
      <span><i class="sw exp"></i> 기대</span>
      <span>평균 묶음 크기 {result.meanSize.toFixed(1)}</span>
    </div>
  </section>
{/if}

<style>
  .lede { margin: 0 0 1.1rem; color: var(--ink-soft); max-width: 66ch; }
  .lede strong { color: var(--ink); font-weight: 600; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 74ch; }
  .note strong { color: var(--ink); font-weight: 600; }
  .small { font-size: 0.75rem; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chips button { border-radius: 999px; padding: 0.3rem 0.9rem; font-size: 0.8125rem; }
  .chips button.on {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--surface);
    font-weight: 600;
  }
  .chips.small button { padding: 0.25rem 0.7rem; font-size: 0.75rem; }
  .gloss-line { margin: 0.5rem 0 0; font-size: 0.8125rem; }

  .knob {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }
  .knob.column { align-items: flex-start; flex-direction: column; gap: 0.6rem; }
  .knob .label {
    font-size: 0.6875rem;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--muted);
    min-width: 5.5rem;
  }

  .pad {
    display: grid;
    grid-template-columns: repeat(15, minmax(0, 1fr));
    gap: 3px;
    width: 100%;
    max-width: 34rem;
  }
  .cell {
    aspect-ratio: 1;
    padding: 0;
    border-radius: 2px;
    font-size: 0.625rem;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .cell.on {
    border-color: var(--tone);
    color: var(--tone);
    font-weight: 600;
    box-shadow: inset 0 -2px 0 var(--tone);
  }
  .reset { font-size: 0.75rem; }

  /* Le verdict porte un liseré, jamais un aplat : c'est un résultat de
     mesure, pas une alerte. Le rouge est réservé au cas qui n'arrive
     presque jamais — un ensemble qui bat vraiment le hasard. */
  .verdict { border-left: 3px solid var(--line); }
  .verdict.chance { border-left-color: var(--muted); }
  .verdict.fragile { border-left-color: var(--gold); }
  .verdict.signal { border-left-color: var(--hit-bg); }

  .call { margin: 0; font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; }
  .verdict.signal .call { color: var(--hit-bg); }
  .verdict.fragile .call { color: var(--gold-deep); }
  .call-gloss { margin: 0.3rem 0 0; font-size: 0.875rem; }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 1rem 1.5rem;
    margin-top: 1.4rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--line-soft);
  }
  .fact { display: flex; flex-direction: column; gap: 0.15rem; }
  .fact .k {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  th.v, td.val { text-align: right; }
  td.up { color: var(--gold-deep); }
  td.down { color: var(--t-dead-text); }
  tr.whole td { border-top: 1px solid var(--line); font-weight: 600; }

  .balls { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .ball {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 1.5px solid var(--tone);
    color: var(--tone);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .dist { display: grid; gap: 0.45rem; }
  .drow {
    display: grid;
    grid-template-columns: 3rem 1fr 3.5rem 3.5rem;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.8125rem;
  }
  .dk { color: var(--muted); }
  .track { position: relative; height: 1.1rem; }
  .bar { position: absolute; left: 0; height: 0.45rem; border-radius: 2px; }
  .bar.obs { top: 0; background: var(--gold); }
  .bar.exp { top: 0.55rem; background: var(--line); }
  .dv { text-align: right; }

  .key { display: flex; gap: 1.25rem; margin-top: 0.9rem; font-size: 0.75rem; flex-wrap: wrap; }
  .key span { display: inline-flex; align-items: center; gap: 0.4rem; }
  .sw { width: 12px; height: 6px; border-radius: 2px; display: inline-block; }
  .sw.obs { background: var(--gold); }
  .sw.exp { background: var(--line); }
</style>
