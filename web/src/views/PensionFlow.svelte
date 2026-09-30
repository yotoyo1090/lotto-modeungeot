<script>
  // 흐름 · 차뜨, côté 연금복권.
  //
  // Au 6/45 la matrice fait quarante-cinq colonnes et il n'y en a qu'une :
  // un numéro est un numéro, où qu'il tombe. Ici la **place est l'identité**
  // — le 7 de la première position et le 7 de la quatrième sont deux choses
  // différentes, qui ne s'attendent pas ensemble. Il y a donc **six
  // matrices de dix colonnes**, et on en regarde une à la fois.
  //
  // Les bandes 차뜨 sont rééchelonnées : l'écart attendu vaut 10 ici contre
  // 6,4 au 6/45. Les bornes du 로또 laisseraient la moitié des chiffres en
  // 사망 en permanence. Le détail est dans `core/pension-analysis.js`.
  import {
    PENSION_BANDS, pensionBandOf, pensionCells, pensionSectionOf,
    pensionTemperature,
  } from '@core/pension-analysis.js'

  import Bars from '../components/Bars.svelte'
  import FlowChart from '../components/FlowChart.svelte'
  import { num, rang as fmt } from '../lib/format.js'

  let { pension } = $props()

  const PLACES = ['일', '이', '삼', '사', '오', '육']
  const SOURCES = [
    { key: 'digits', label: '당첨번호' },
    { key: 'bonus', label: '보너스' },
  ]

  let place = $state(0)
  let source = $state('digits')
  let picked = $state(null)          // le chiffre ouvert dans le graphique

  const cells = $derived(pensionCells(pension, place, { source }))
  const last = $derived(pension.n - 1)
  const bands = $derived(pensionTemperature(cells[last]))

  const TONE = { hot: '--t-hot', midle: '--t-mid', cold: '--t-cold', dead: '--t-dead' }
  const TEXT = {
    hot: '--t-hot-text', midle: '--t-mid-text',
    cold: '--t-cold-text', dead: '--t-dead-text',
  }
  const SECTION_VARS = ['--s1', '--s3', '--s5']

  // La distribution des écarts, tous chiffres confondus — ce qui justifie
  // les bornes des bandes plutôt que de les poser sans les montrer.
  const spread = $derived.by(() => {
    const out = {}
    for (let i = 0; i < pension.n; i++) {
      for (const c of cells[i]) {
        if (c.drawn) continue
        const k = c.gap >= 30 ? '30+' : String(c.gap)
        out[k] = (out[k] ?? 0) + 1
      }
    }
    // Clés non entières impossibles à trier par l'objet : on les range.
    const keys = Object.keys(out).sort(
      (a, b) => (a === '30+' ? 1 : b === '30+' ? -1 : Number(a) - Number(b)))
    return Object.fromEntries(keys.map((k) => [k, out[k]]))
  })

  const curve = $derived(picked === null ? [] :
    Array.from({ length: pension.n }, (_, i) => ({
      rang: pension.rangs[i], value: cells[i][picked].gap,
    })))

  // La matrice ne dessine que ce qu'on voit : 225 × 10 tiendrait, mais le
  // 로또 en fait 1 238 × 45 et la règle vaut mieux d'être la même partout.
  const STEP = 200
  let shown = $state(STEP)
  $effect(() => { place; source; shown = STEP })
  const rows = $derived.by(() => {
    const out = []
    for (let k = 0; k < shown && last - k >= 0; k++) out.push(last - k)
    return out
  })
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>{PLACES[place]}번째 자리</h2>
    <span class="gloss">숫자 0–9 · 미출현 간격</span>
  </div>
  <div class="picker">
    {#each SOURCES as s (s.key)}
      <button class="src" aria-pressed={source === s.key}
              onclick={() => { source = s.key; picked = null }}>{s.label}</button>
    {/each}
    <span class="split" aria-hidden="true"></span>
    {#each PLACES as w, k (k)}
      <button aria-pressed={place === k}
              onclick={() => { place = k; picked = null }}>{w}</button>
    {/each}
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>차뜨</h2>
    <span class="gloss">{fmt(pension.rangs[last])} · 기다린 회차순</span>
  </div>

  <div class="scroll">
    <table class="temp">
      <thead>
        <tr>
          {#each bands as b (b.key)}
            <th colspan={Math.max(1, b.entries.length)}
                style="--tone: var({TONE[b.key]})">
              {b.label} <span class="rng">{b.max === Infinity ? `${b.min}+` : `${b.min}–${b.max}`}</span>
            </th>
          {/each}
        </tr>
        <tr class="nums">
          {#each bands as b (b.key)}
            {#if b.entries.length}
              {#each b.entries as e (e.digit)}
                <th style="--tone: var({SECTION_VARS[pensionSectionOf(e.digit)]})">{e.digit}</th>
              {/each}
            {:else}<th class="empty">·</th>{/if}
          {/each}
        </tr>
      </thead>
      <tbody>
        <tr>
          {#each bands as b (b.key)}
            {#if b.entries.length}
              {#each b.entries as e (e.digit)}
                <td class:drawn={e.drawn} style="--tone: var({TONE[b.key]})">
                  {e.gap}{#if e.flag}<b>{e.flag}</b>{/if}
                </td>
              {/each}
            {:else}<td class="empty">·</td>{/if}
          {/each}
        </tr>
      </tbody>
    </table>
  </div>

  <p class="note dim">
    이 제품의 <strong>기대 간격은 10회</strong>입니다 — 자리마다 열 개의
    숫자가 있기 때문입니다. 로또 6/45는 6.4회였습니다. 그래서 경계도
    그만큼 늘렸습니다.
  </p>
</section>

<section class="panel two">
  <div class="half">
    <div class="head">
      <h2>간격 분포</h2>
      <span class="gloss">{PLACES[place]}번째 자리 · 안 나온 칸</span>
    </div>
    <div class="scroll cap"><Bars data={spread} suffix="회" /></div>
  </div>

  <div class="half">
    <div class="head">
      <h2>{picked === null ? '숫자 흐름' : `${picked} 흐름`}</h2>
      <span class="gloss">
        {picked === null ? '아래 표에서 숫자를 고르세요' : `${PLACES[place]}번째 자리`}
      </span>
      {#if picked !== null}
        <span class="right"><button class="clear" onclick={() => (picked = null)}>지우기</button></span>
      {/if}
    </div>
    {#if picked === null}
      <p class="dim empty-note">숫자 머리글을 누르면 그 숫자의 기다림이 그려집니다.</p>
    {:else}
      <FlowChart series={curve} heat={false} legend={false}
                 label="{picked} · {PLACES[place]}자리" gloss="미출현 간격" unit="회" />
    {/if}
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>흐름</h2>
    <span class="gloss">회차마다, 숫자마다</span>
    <span class="right">{num(rows.length)} / {num(pension.n)}회차</span>
  </div>

  <div class="scroll matrix">
    <table class="mx">
      <thead>
        <tr>
          <th class="stub">회차</th>
          {#each Array(10) as _, d (d)}
            <th>
              <button class="dhead" aria-pressed={picked === d}
                      style="--tone: var({SECTION_VARS[pensionSectionOf(d)]})"
                      onclick={() => (picked = picked === d ? null : d)}>{d}</button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as i (i)}
          <tr>
            <th class="stub">{fmt(pension.rangs[i])}</th>
            {#each cells[i] as c (c.digit)}
              <td class:drawn={c.drawn} class:carry={c.flag && c.flag !== '당첨'}
                  class:lit={picked === c.digit}
                  style="--tone: var({TONE[pensionBandOf(c.gap)]})">
                {c.drawn ? '' : c.gap}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if shown < pension.n}
    <div class="more">
      <button onclick={() => (shown += STEP)}>
        더 보기 <span class="dim">{num(shown)} / {num(pension.n)}</span>
      </button>
      <button class="all" onclick={() => (shown = pension.n)}>전부</button>
    </div>
  {/if}

  <div class="legend">
    {#each PENSION_BANDS as b (b.key)}
      <span class="key" style="--tone: var({TONE[b.key]}); --text: var({TEXT[b.key]})">
        <i></i><b>{b.label}</b>
        <em>{b.max === Infinity ? `${b.min}+` : `${b.min}–${b.max}`}</em>
      </span>
    {/each}
    <span class="key sep"><i class="won"></i><b>당첨 · 이월</b>
      <em>칸이 채워짐 · 이월은 테두리</em></span>
  </div>
</section>

<style>
  .bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.75rem;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .picker { display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center; }
  .picker button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }
  .picker .src { color: var(--muted); }
  .split {
    width: 1px; height: 1.1rem; background: var(--line); margin: 0 0.35rem;
  }

  .two { display: grid; gap: 1.5rem 2rem; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); }
  .half { min-width: 0; }
  .cap { max-height: 15rem; overflow-y: auto; }
  .empty-note { font-size: 0.8125rem; padding: 2rem 0; text-align: center; }
  .clear { font-size: 0.6875rem; padding: 0.1rem 0.45rem; }

  table { border-collapse: collapse; font-size: 0.75rem; }
  th, td { border: 1px solid var(--line-soft); text-align: center; padding: 0.2rem 0.45rem; }

  .temp { width: 100%; }
  .temp thead tr:first-child th {
    background: var(--tone); color: #fff; font-weight: 600;
  }
  .temp .rng { font-family: var(--figure); font-weight: 400; opacity: 0.75; font-size: 0.6875rem; }
  .temp .nums th { font-family: var(--figure); font-weight: 400; color: var(--tone); }
  .temp td { font-family: var(--figure); color: var(--muted); }
  .temp td.drawn { background: var(--tone); color: #fff; font-weight: 600; }
  .temp td.drawn b { font-weight: 400; opacity: 0.85; margin-left: 0.2rem; }
  .temp .empty { color: var(--line); }

  /* La matrice. Une case pleine dit « sorti », sa teinte dit depuis combien
     de temps il attendait — comme au 6/45, à l'échelle de ce jeu-ci. */
  .matrix { max-height: 30rem; overflow: auto; }
  .mx { width: 100%; }
  .mx th.stub {
    position: sticky; left: 0; background: var(--surface); z-index: 1;
    font-family: var(--figure); font-weight: 400; color: var(--muted);
    font-size: 0.6875rem; white-space: nowrap; text-align: right;
  }
  .mx thead th { position: sticky; top: 0; background: var(--surface); z-index: 2; }
  .mx thead th.stub { z-index: 3; }
  .dhead {
    border: 0; background: none; padding: 0.1rem 0.35rem; cursor: pointer;
    font-family: var(--figure); font-size: 0.75rem; color: var(--tone);
    border-radius: 0.2rem;
  }
  .dhead[aria-pressed='true'] { background: var(--ink); color: var(--paper); }
  .mx td {
    font-family: var(--figure); color: var(--muted);
    min-width: 2.1rem; height: 1.35rem;
  }
  .mx td.drawn { background: var(--tone); }
  .mx td.carry { box-shadow: inset 0 0 0 2px var(--surface); }
  .mx td.lit { outline: 1px solid var(--ink); outline-offset: -1px; }

  .legend { display: flex; gap: 1.1rem; flex-wrap: wrap; margin-top: 0.7rem; }
  .key { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; }
  .key i {
    width: 0.8rem; height: 0.8rem; border-radius: 0.2rem;
    background: var(--tone); display: inline-block;
  }
  .key i.won { background: var(--t-hot); }
  .key.sep { border-left: 1px solid var(--line); padding-left: 1rem; }
  .key b { color: var(--text, var(--ink)); font-weight: 600; }
  .key em { color: var(--muted); font-style: normal; font-family: var(--figure); }

  .more { display: flex; gap: 0.35rem; margin-top: 0.6rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }
  .more .all { border-color: var(--gold); color: var(--gold); }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.7; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
