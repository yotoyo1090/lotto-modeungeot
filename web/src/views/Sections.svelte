<script>
  // L'onglet 구간.
  //
  // L'ancien site en faisait **douze pages**, une par famille de numéros :
  // 당첨번호, les quatre 배수, 소수, 홀수, 짝수, 저수, 고수, 합성수,
  // 이월차번호. Toutes posaient la même question — dans quelles tranches de
  // dizaines la famille tombe-t-elle ? — et montraient les mêmes trois
  // comptages plus le même tableau.
  //
  // Ici : une rangée de douze boutons, et les blocs suivent. Le calcul est
  // dans `core/sections.js`, paramétré par la famille.
  import {
    ON, OFF, SECTION_FAMILIES, SECTION_LABELS, sectionLaw, sectionSeries,
  } from '@core/sections.js'
  import { carryover } from '@core/metrics.js'

  import Compare from '../components/Compare.svelte'
  import Scope from '../components/Scope.svelte'
  import { num, rang as fmt, SECTION_VARS } from '../lib/format.js'
  import { scoped } from '../lib/scope.js'

  let { draws, base = draws } = $props()

  const first = $derived(base.rangs[0])
  const last = $derived(base.rangs[base.n - 1])

  let family = $state('winner')
  const fam = $derived(SECTION_FAMILIES.find((f) => f.key === family))

  let statSpan = $state('follow')
  let tableSpan = $state('follow')
  const statDraws = $derived(scoped(base, draws, statSpan))
  const tableDraws = $derived(scoped(base, draws, tableSpan))

  // 이월차번호 se lit sur deux tirages : ce qu'un 회차 reprend du précédent.
  // Sur une tranche, le premier 회차 n'a pas de prédécesseur **dans la
  // tranche** — mais il en a un dans l'historique. On calcule donc une fois
  // sur tout, puis on aligne sur la tranche affichée.
  const baseCarry = $derived(carryover(base))
  function aligned(d) {
    if (d === base) return baseCarry
    const numbers = []
    for (let i = 0; i < d.n; i++) {
      numbers.push(baseCarry.numbers[base.indexOf(d.rangs[i])] ?? [])
    }
    return { numbers }
  }

  const upper = $derived(sectionSeries(statDraws, family, aligned(statDraws)))
  const lower = $derived(sectionSeries(tableDraws, family, aligned(tableDraws)))

  const total = $derived(upper.rows.length)

  // Le 기대 : la loi de la famille (20 000 tirages simulés avec la même
  // règle), à l'échelle des 회차 affichés. Les combinaisons que le hasard
  // produit mais que l'histoire n'a pas encore vues gardent leur ligne.
  const law = $derived(sectionLaw(family))
  const patternRows = $derived.by(() => {
    const seen = new Map(upper.patterns.map((p) => [p.flags.join(' '), p.count]))
    const keys = new Set([...seen.keys(), ...law.patterns.keys()])
    return [...keys].map((k) => ({
      flags: k.split(' '), count: seen.get(k) ?? 0, exp: (law.patterns.get(k) ?? 0) * total,
    })).filter((p) => p.count > 0 || p.exp >= 0.5)
      .sort((a, b) => b.flags.filter((w) => w === ON).length - a.flags.filter((w) => w === ON).length
        || b.count - a.count)
  })
  const peakAll = $derived(Math.max(1, ...patternRows.flatMap((p) => [p.count, p.exp])))
  const blankRows = $derived(Object.keys(upper.blanks).map((k) => ({
    key: k, obs: upper.blanks[k], exp: (law.blanks[k] ?? 0) * total })))
  const countRows = $derived.by(() => {
    const keys = new Set([...Object.keys(upper.byCount), ...Object.keys(law.byCount)])
    return [...keys].map(Number).sort((a, b) => a - b)
      .map((k) => ({ key: k, obs: upper.byCount[k] ?? 0, exp: (law.byCount[k] ?? 0) * total }))
      .filter((r) => r.obs > 0 || r.exp >= 0.5)
  })

  // Les trois boutons de l'ancien tableau : surligner les 회차 qui ont
  // exactement un, deux ou trois 구간 éteints.
  let marked = $state(new Set())
  function toggle(k) {
    const next = new Set(marked)
    next.has(k) ? next.delete(k) : next.add(k)
    marked = next
  }
  $effect(() => { family; tableSpan; marked = new Set() })

  const STEP = 400
  let limit = $state(STEP)
  $effect(() => { family; tableSpan; limit = STEP })
  const shown = $derived(lower.rows.slice(0, limit))
  const hits = $derived(marked.size
    ? lower.rows.filter((r) => marked.has(r.off)).length : 0)
</script>

{#if draws.n < 2}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}
  <section class="panel bar">
    <div class="head-inline">
      <h2>{fam.label} 구간 통계 및 패턴</h2>
      <span class="gloss">{fam.gloss}</span>
    </div>

    <div class="picker">
      {#each SECTION_FAMILIES as f (f.key)}
        <button aria-pressed={family === f.key}
                onclick={() => (family = f.key)}>{f.label}</button>
      {/each}
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>{fam.label} 구간 통계</h2>
      <span class="gloss">다섯 구간의 켜짐과 꺼짐</span>
      <Scope bind:span={statSpan} {first} {last} />
      <span class="right">{num(total)}회 · {num(upper.patterns.length)}가지</span>
    </div>

    <!-- Une pastille par 구간, dans sa couleur : pleine si 있음, creuse si
         점멸. L'ancien écrivait « ['있음', '점멸', '있음', '있음', '있음'] »
         sous chaque barre — cinq mots entre crochets qu'il fallait relire à
         chaque fois. Les mêmes cinq états se lisent d'un coup d'œil. -->
    <div class="scroll patbox">
      <div class="pats">
        <div class="prow legend-row">
          <span class="marks"></span>
          <span class="track-legend"><span class="key obs"></span>관측 <span class="key exp"></span>기대 (같은 규칙으로 2만 회차 시뮬레이션)</span>
          <span class="count dim">관측</span>
          <span class="pct dim">기대</span>
        </div>
        {#each patternRows as p (p.flags.join(' '))}
          <div class="prow">
            <span class="marks">
              {#each p.flags as f, s (s)}
                <span class="mk" class:off={f === OFF}
                      style="--tone: var({SECTION_VARS[s]})"
                      title="{SECTION_LABELS[s]}구간 {f}"></span>
              {/each}
            </span>
            <span class="track">
              <span class="fill" style="width: {(p.count / peakAll) * 100}%"></span>
              <span class="expfill" style="width: {(p.exp / peakAll) * 100}%"></span>
            </span>
            <span class="count">{num(p.count)}</span>
            <span class="pct">{p.exp.toFixed(1)}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="legend">
      {#each SECTION_LABELS as label, s (s)}
        <span class="mk" style="--tone: var({SECTION_VARS[s]})"></span>
        <span class="name">{label}</span>
      {/each}
      <span class="mk off"></span><span class="name dim">점멸</span>
    </div>

    <p class="note dim">
      회색 「기대」는 같은 규칙을 무작위 2만 회차에 적용해 얻은 값입니다 —
      관측이 그 위에 얹혀 있으면 구간의 켜짐·꺼짐은 추첨이 아니라 구간의
      크기(일 9개 · 십 10개 · … · 사십 6개)가 만든 모양입니다.
      <br />
      <strong>점멸</strong>은 그 구간이 비어 있거나, 10–19 사이의 번호가
      <strong>하나만</strong> 있는 경우입니다 — 다섯 구간 모두 같은 규칙입니다.
      <br />
      과거에 20회 미만으로 나온 값은 <strong>드물었던 모양</strong>일 뿐, 다음 회차에 나올 확률이 낮다는 뜻은 아닙니다 — 드문 값은 그 값을 만드는 조합 수가 적어서 드뭅니다.
      판단은 여러분의 몫입니다.
    </p>
  </section>

  <section class="panel two">
    <div class="half">
      <div class="head">
        <h2>점멸 구간 통계</h2>
        <span class="gloss">어느 구간이 자주 비나</span>
      </div>
      <Compare rows={blankRows} keyWidth="6.5rem" showTotal={false} />
      <p class="note dim">
        여기서는 <strong>비어 있는</strong> 구간만 셉니다 — 10–19 규칙은
        적용하지 않습니다. 사십구간은 여섯 번호뿐이라 가장 자주 빕니다.
      </p>
    </div>

    <div class="half">
      <div class="head">
        <h2>점멸구간수 별로 통계</h2>
        <span class="gloss">한 회차에 몇 구간이 꺼졌나</span>
      </div>
      <Compare rows={countRows} suffix="구간" />
      <p class="note dim">
        기대와 겹치면, 몇 구간이 꺼지는지는 우연이 정합니다.
      </p>
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>{fam.label} 구간 패턴</h2>
      <span class="gloss">회차별 구간 배치</span>
      <Scope bind:span={tableSpan} {first} {last} />
      <span class="right">
        {#if marked.size}{num(hits)} / {num(lower.rows.length)}
        {:else}{num(lower.rows.length)}회{/if}
      </span>
    </div>

    <div class="controls">
      {#each [1, 2, 3] as k (k)}
        <button class="mark" aria-pressed={marked.has(k)} onclick={() => toggle(k)}>
          ({k}) 구간 점멸
        </button>
      {/each}
      {#if marked.size}
        <button class="clear" onclick={() => (marked = new Set())}>지우기</button>
      {/if}
      <span class="chosen dim">
        패턴 선택을 통해 최근 흐름 및 통계의 효율을 판단하는 데 많은 도움이 됩니다.
      </span>
    </div>

    <div class="scroll tablebox">
      <table>
        <thead>
          <tr>
            <th>회차</th>
            {#each SECTION_LABELS as label, s (s)}
              <th style="--tone: var({SECTION_VARS[s]})">
                {fam.label} {label} 구간
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each shown as row}
            <tr class:on={marked.has(row.off)}>
              <td>{fmt(row.rang)}</td>
              {#each row.cells as cell, s}
                <td class="cell" class:blank={cell.length === 0}
                    class:dark={row.flags[s] === OFF}>
                  {#if cell.length}
                    <span class="grid">
                      {#each cell as n (n)}
                        <span class="n" style="--tone: var({SECTION_VARS[s]})">{n}</span>
                      {/each}
                    </span>
                  {:else}
                    <span class="none">·</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if limit < lower.rows.length}
      <div class="more">
        <button onclick={() => (limit += STEP)}>
          더 보기 <span class="dim">{num(limit)} / {num(lower.rows.length)}</span>
        </button>
        <button class="all" onclick={() => (limit = lower.rows.length)}>전부</button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.75rem;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .picker { display: flex; gap: 0.3rem; flex-wrap: wrap; justify-content: flex-end; }
  .picker button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }

  /* Deux blocs de même poids côte à côte : ils répondent à la même question
     sous deux angles, et se lisent ensemble. */
  .two {
    display: grid; gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  }
  .half { min-width: 0; }

  /* La grille de l'histogramme des combinaisons : la même que celle de
     `Bars`, pour que les trois blocs s'alignent. */
  .patbox { max-height: 26rem; overflow-y: auto; }
  .pats { display: grid; gap: 2px; }
  .prow {
    display: grid;
    grid-template-columns: 4.75rem 1fr 3rem 3.25rem;
    align-items: center; gap: 0.5rem;
    font-size: 0.8125rem; padding: 1px 0;
  }
  .marks { display: flex; gap: 3px; justify-content: flex-end; }
  /* Comme `Compare` : l'observé en barre pleine au-dessus, l'attendu en
     filet sombre en dessous, même origine, même échelle. */
  .track {
    position: relative; height: 14px;
    background: var(--line-soft); border-radius: 3px; overflow: hidden;
  }
  .fill {
    position: absolute; left: 0; top: 0; height: 9px;
    background: var(--gold); border-radius: 0 3px 3px 0;
  }
  .expfill {
    position: absolute; left: 0; bottom: 0; height: 3px;
    background: var(--ink-soft); border-radius: 0 2px 2px 0;
  }
  .legend-row { font-size: 0.75rem; color: var(--ink-soft); margin-bottom: 0.2rem; }
  .track-legend { display: flex; align-items: center; gap: 0.35rem; }
  .key { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .key.obs { background: var(--gold); }
  .key.exp { background: transparent; border: 1px solid var(--ink-soft); margin-left: 0.5rem; }
  .count { text-align: right; font-family: var(--figure); }
  .pct { text-align: right; color: var(--muted); font-size: 0.75rem; font-family: var(--figure); }

  /* Pleine = 있음, creuse = 점멸. La couleur est celle du 구간, la même que
     partout ailleurs sur le site. */
  .mk {
    width: 10px; height: 10px; border-radius: 2px;
    background: var(--tone, var(--muted));
    display: inline-block; flex: none;
  }
  .mk.off { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }

  .legend {
    display: flex; align-items: center; gap: 0.3rem;
    margin-top: 0.7rem; font-size: 0.75rem; flex-wrap: wrap;
  }
  .legend .name { margin-right: 0.7rem; color: var(--ink-soft); }

  .controls {
    display: flex; align-items: center; gap: 0.4rem;
    flex-wrap: wrap; margin-bottom: 0.9rem;
  }
  .mark { font-size: 0.75rem; padding: 0.2rem 0.6rem; }
  .clear { font-size: 0.6875rem; padding: 0.12rem 0.45rem; }
  .chosen { font-size: 0.75rem; margin-left: 0.4rem; }

  .tablebox { max-height: 30rem; overflow-y: auto; }
  table { width: 100%; font-size: 0.8125rem; }
  th, td { padding: 0.25rem 0.5rem; text-align: left; }
  th {
    position: sticky; top: 0; background: var(--surface);
    color: var(--tone, var(--muted)); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  td { border-bottom: 1px solid var(--line-soft); }
  tbody tr { content-visibility: auto; contain-intrinsic-size: auto 1.6rem; }

  .grid { display: flex; gap: 0.3rem; flex-wrap: nowrap; }
  .n { font-family: var(--figure); color: var(--tone); min-width: 1.25rem; text-align: center; }
  .none { color: var(--line); font-family: var(--figure); }
  /* Un 구간 éteint sans être vide — le seul numéro entre 10 et 19 : il est
     là, il compte pour 점멸 quand même. Le fond le dit sans l'effacer. */
  .cell.dark:not(.blank) { background: var(--paper); }

  tr.on td { background: var(--gold-wash); }

  .more { display: flex; gap: 0.35rem; margin-top: 0.6rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }
  .more .all { border-color: var(--gold); color: var(--gold); }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
