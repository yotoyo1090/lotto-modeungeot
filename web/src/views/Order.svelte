<script>
  // 공나온 순서 — l'onglet à côté de 추첨기별.
  //
  // La base connaît le tirage trié ; ici on regarde l'ordre dans lequel
  // les boules sont tombées. Une boule différente sortirait à un autre
  // moment du brassage, même si elle sort aussi souvent que les autres.
  // Les calculs viennent de `core/order.js` ; ici on affiche.
  import { order as orderTest } from '@core/order.js'

  import Compare from '../components/Compare.svelte'

  let { order = null } = $props()

  // Ce que les deux graphes regardent : un numéro (ses six positions) et
  // une position (ses 45 numéros). `null` = le plus écarté.
  let pickedNumber = $state(null)
  let pickedPosition = $state(1)

  const result = $derived.by(() => {
    if (!order || !Object.keys(order).length) return null
    const map = new Map(Object.entries(order).map(([r, o]) => [Number(r), o]))
    return orderTest(map)
  })

  // Les numéros les plus écartés, par p croissant — pour montrer où
  // regarder, pas pour conclure : le seuil corrigé est 0,05 / 45.
  const worst = $derived(result ? [...result.each].sort((a, b) => a.p - b.p).slice(0, 8) : [])

  const shownNumber = $derived(!result ? null
    : (result.each.find((r) => r.number === pickedNumber) ?? worst[0] ?? null))
  const numberRows = $derived(shownNumber
    ? shownNumber.positions.map((c, k) => ({ key: k + 1, obs: c, exp: shownNumber.expected }))
    : [])
  const shownPosition = $derived(result ? result.byPosition[pickedPosition - 1] : null)
  const positionRows = $derived(shownPosition
    ? shownPosition.numbers.map((c, k) => ({ key: k + 1, obs: c, exp: shownPosition.expected }))
    : [])
  const BONFERRONI = 0.05 / 45
  const num = (v) => v.toLocaleString('ko-KR')
  const p = (v) => (v < 0.001 ? '< 0.001' : v.toFixed(3))
</script>

{#if !result}
  <section class="panel">
    <div class="head">
      <h2>공나온 순서</h2>
      <span class="gloss">어떤 번호가 유난히 먼저, 또는 늦게 나오는가</span>
    </div>
    <p class="dim">공나온 순서 정보가 없습니다 — <code>npm run update</code> (crawl order) 를 먼저 실행하세요.</p>
  </section>
{:else}
  <section class="panel">
    <div class="head">
      <h2>공나온 순서</h2>
      <span class="gloss">어떤 번호가 유난히 먼저, 또는 늦게 나오는가</span>
      <span class="right">{num(result.draws)}회차 · 468회부터</span>
    </div>

    <p class="lede">
      공식 데이터는 <strong>정렬된</strong> 번호만 줍니다. 여기 있는 건 방송에서 공이
      실제로 떨어진 순서입니다. 우연이라면 모든 번호가 1번째부터 6번째 자리를
      각각 <strong>1/6씩</strong> 차지합니다 — 평균 자리는 3.5.
    </p>

    <div class="facts">
      <div class="fact">
        <span class="k">45개 한꺼번에 χ²</span>
        <b class="figure">{result.all.chi2.toFixed(1)}</b>
        <span class="dim small">기대 {result.all.df}</span>
      </div>
      <div class="fact">
        <span class="k">p</span>
        <b class="figure">{p(result.all.p)}</b>
        <span class="dim small">{result.all.p < 0.05 ? '살펴볼 것' : '기대대로'}</span>
      </div>
    </div>
    <p class="note dim">
      번호마다 여섯 자리가 고른지 검정한 45개의 χ²를 더한 값입니다 — 한 번호의
      큰 치우침도, 여러 번호의 작은 치우침도 여기에 잡힙니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>번호별 — 가장 치우친 여덟</h2>
      <span class="gloss">평균 자리 · 우연이면 3.5</span>
      <span class="right">기준 0.05 / 45 = {BONFERRONI.toFixed(4)}</span>
    </div>
    <div class="scroll">
      <table>
        <thead><tr><th>번호</th><th>출현</th><th>평균 자리</th><th>χ²</th><th>p</th><th></th></tr></thead>
        <tbody>
          {#each worst as row (row.number)}
            <tr class="row" class:on={shownNumber?.number === row.number}
                onclick={() => (pickedNumber = row.number)}>
              <td>{row.number}</td>
              <td>{num(row.total)}</td>
              <td>{row.mean.toFixed(2)}</td>
              <td>{row.chi2.toFixed(1)}</td>
              <td>{p(row.p)}</td>
              <td class="dim">{row.p < BONFERRONI ? '살펴볼 것' : '잡음 범위'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note dim">
      45번 검정하므로 기준을 45로 나눕니다. 가장 작은 p가 0.02 근처에 오는 건
      <strong>45개 중 하나는 늘 그렇게</strong> 나오기 때문입니다 — 그것만으로는
      아무 의미가 없습니다.
    </p>

    {#if shownNumber}
      <div class="pick">
        <span class="label">번호</span>
        {#each Array.from({ length: 45 }, (_, k) => k + 1) as n (n)}
          <button aria-pressed={shownNumber.number === n} onclick={() => (pickedNumber = n)}>{n}</button>
        {/each}
      </div>
      <div class="block">
        <Compare rows={numberRows} showTotal={false} keyWidth="3rem" suffix="번째"
                 obsLabel={`${shownNumber.number}번 · 나온 자리`}
                 expLabel={`기대 ${shownNumber.expected.toFixed(1)} (출현 ÷ 6)`} />
      </div>
    {/if}
  </section>

  <section class="panel">
    <div class="head">
      <h2>자리별 45개 번호</h2>
      <span class="gloss">n번째로 떨어진 공은 어느 번호였나</span>
      <span class="right">
        {#if shownPosition}χ² {shownPosition.chi2.toFixed(1)} · df {shownPosition.df} · p {p(shownPosition.p)}{/if}
      </span>
    </div>
    <div class="pick">
      <span class="label">자리</span>
      {#each [1, 2, 3, 4, 5, 6] as k (k)}
        <button aria-pressed={pickedPosition === k} onclick={() => (pickedPosition = k)}>{k}번째</button>
      {/each}
    </div>
    <div class="block">
      <Compare rows={positionRows} showTotal={false} keyWidth="2.5rem" suffix="번"
               obsLabel={`${pickedPosition}번째 자리 · 관측`}
               expLabel={`기대 ${shownPosition ? shownPosition.expected.toFixed(1) : ''} (회차 ÷ 45)`} />
    </div>
    <p class="note dim">
      정렬된 당첨 위치와 달리, <strong>떨어진 순서</strong>의 각 자리는 45개 번호에
      대해 균등합니다 — 첫 번째 공이 작은 번호일 이유가 없습니다. 그래서 기대치는
      모든 번호에 같고, 자리마다 χ²(44) 하나로 검정합니다.
    </p>
  </section>
{/if}

<style>
  .block { margin-top: 1rem; }
  .pick { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin-top: 1.25rem; }
  .pick .label { margin-right: 0.25rem; font-size: 0.75rem; color: var(--muted); }
  .pick button { font-size: 0.75rem; padding: 0.2rem 0.5rem; min-width: 2rem; }
  .row { cursor: pointer; }
  .row.on td { background: var(--gold-wash); }
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
</style>
