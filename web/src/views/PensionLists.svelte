<script>
  // 리스트, côté 연금복권 — les onze familles.
  //
  // C'est la page qui transfère le mieux du 6/45 : les onze familles
  // existent telles quelles sur des chiffres — les quatre 배수, 소수, 합성수,
  // 홀수, 짝수, 저수, 고수, et 이월차번호.
  //
  // Une différence de fond avec le 로또, et elle change la lecture : un
  // chiffre peut sortir **plusieurs fois dans le même tirage**. Une liste
  // garde donc ses doublons, et le 숫자수 d'une famille peut dépasser le
  // nombre de chiffres qui la composent — 짝수 en a cinq, mais un tirage
  // peut en aligner six.
  import {
    PENSION_LIST_FAMILIES, pensionListSeries, pensionMembers,
    pensionSectionOf,
  } from '@core/pension-analysis.js'

  import Bars from '../components/Bars.svelte'
  import FlowChart from '../components/FlowChart.svelte'
  import { num, rang as fmt } from '../lib/format.js'

  let { pension } = $props()

  const SOURCES = [
    { key: 'digits', label: '당첨번호' },
    { key: 'bonus', label: '보너스' },
  ]
  const SECTION_VARS = ['--s1', '--s3', '--s5']

  let family = $state('mult2')
  let source = $state('digits')
  const fam = $derived(PENSION_LIST_FAMILIES.find((f) => f.key === family))

  // 이월차번호 se lit sur les 당첨번호 : il n'y a pas de report du bonus.
  const useSource = $derived(fam.carry ? 'digits' : source)
  const s = $derived(pensionListSeries(pension, family, { source: useSource }))
  const members = $derived(pensionMembers(family))

  const WINDOWS = [60, 120, 240, 0]
  let win = $state(120)
  const curve = $derived(win ? s.flow.slice(-win) : s.flow)

  const CSTEP = 40
  let cshow = $state(CSTEP)
  $effect(() => { family; useSource; cshow = CSTEP })
  const once = $derived(s.combos.filter((c) => c.count === 1).length)

  const STEP = 200
  let limit = $state(STEP)
  $effect(() => { family; useSource; limit = STEP })
  const shown = $derived(s.rows.slice(0, limit))
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>{fam.label} 통계 및 패턴</h2>
    <span class="gloss">
      {fam.gloss} · {fam.carry ? '열 숫자 모두' : `${members.join(' · ')}`}
    </span>
  </div>

  <div class="picker">
    {#each SOURCES as x (x.key)}
      <button class="src" aria-pressed={useSource === x.key} disabled={fam.carry}
              onclick={() => (source = x.key)}>{x.label}</button>
    {/each}
    <span class="split" aria-hidden="true"></span>
    {#each PENSION_LIST_FAMILIES as f (f.key)}
      <button aria-pressed={family === f.key}
              onclick={() => (family = f.key)}>{f.label}</button>
    {/each}
  </div>
</section>

{#if fam.carry}
  <section class="panel">
    <p class="note dim tight">
      <strong>이월차번호</strong>는 당첨번호에서만 셉니다 — 보너스에는 이어짐이
      없습니다.
    </p>
  </section>
{/if}

<section class="panel">
  <div class="head">
    <h2>{fam.label} 통계</h2>
    <span class="gloss">가족의 숫자마다 몇 번 나왔나</span>
    <span class="right">{num(pension.n)}회</span>
  </div>
  <Bars data={s.members} />
</section>

<section class="panel two">
  <div class="half">
    <div class="head">
      <h2>{fam.label} 숫자수 통계</h2>
      <span class="gloss">한 회차에 몇 개 — 중복 포함</span>
    </div>
    <Bars data={s.counts} suffix="개" />
  </div>

  <div class="half">
    <div class="head">
      <h2>{fam.label} 숫자합 통계</h2>
      <span class="gloss">그 숫자들의 합</span>
    </div>
    <div class="scroll cap"><Bars data={s.sums} /></div>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>{fam.label} 흐름</h2>
    <span class="gloss">회차별 숫자수</span>
    <span class="right">
      {#each WINDOWS as w (w)}
        <button class="win" aria-pressed={win === w} onclick={() => (win = w)}>
          {w ? `${w}` : '전체'}
        </button>
      {/each}
    </span>
  </div>
  <FlowChart series={curve} heat={false} legend={false}
             label="{fam.label} · 숫자수" gloss="회차별 개수" unit="개" />
</section>

<section class="panel">
  <div class="head">
    <h2>{fam.label} 동반 통계</h2>
    <span class="gloss">함께 나온 조합</span>
    <span class="right">{num(s.combos.length)}가지 · 한 번뿐 {num(once)}</span>
  </div>

  <div class="scroll combos">
    {#each s.combos.slice(0, cshow) as c (c.label)}
      <div class="crow">
        <span class="ccount">{num(c.count)}</span>
        <span class="grid">
          {#if !c.digits.length}
            <span class="none">없음</span>
          {:else}
            {#each c.digits as d, k (k)}
              <span class="n" style="--tone: var({SECTION_VARS[pensionSectionOf(d)]})">{d}</span>
            {/each}
          {/if}
        </span>
      </div>
    {/each}
  </div>

  {#if cshow < s.combos.length}
    <div class="more">
      <button onclick={() => (cshow += CSTEP)}>
        더 보기 <span class="dim">{num(cshow)} / {num(s.combos.length)}</span>
      </button>
    </div>
  {/if}
</section>

<section class="panel">
  <div class="head">
    <h2>{fam.label} 패턴</h2>
    <span class="gloss">회차별 리스트</span>
    <span class="right">{num(s.rows.length)}회</span>
  </div>

  <div class="scroll tablebox">
    <table>
      <thead>
        <tr>
          <th>회차</th><th>{fam.label}</th>
          <th class="v">숫자수</th><th class="v">숫자합</th>
        </tr>
      </thead>
      <tbody>
        {#each shown as row (row.rang)}
          <tr>
            <td class="val">{fmt(row.rang)}</td>
            <td>
              {#if !row.digits.length}
                <span class="none">·</span>
              {:else}
                <span class="grid">
                  {#each row.digits as d, k (k)}
                    <span class="n" style="--tone: var({SECTION_VARS[pensionSectionOf(d)]})">{d}</span>
                  {/each}
                </span>
              {/if}
            </td>
            <td class="val">{row.count}</td>
            <td class="val sum">{num(row.sum)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if limit < s.rows.length}
    <div class="more">
      <button onclick={() => (limit += STEP)}>
        더 보기 <span class="dim">{num(limit)} / {num(s.rows.length)}</span>
      </button>
      <button class="all" onclick={() => (limit = s.rows.length)}>전부</button>
    </div>
  {/if}
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

  .picker { display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center;
            justify-content: flex-end; }
  .picker button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }
  .picker .src { color: var(--muted); }
  .picker button:disabled { opacity: 0.35; }
  .split { width: 1px; height: 1.1rem; background: var(--line); margin: 0 0.35rem; }

  .two { display: grid; gap: 1.5rem 2rem; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
  .half { min-width: 0; }
  .cap { max-height: 20rem; overflow-y: auto; }
  .win { font-size: 0.6875rem; padding: 0.1rem 0.4rem; margin-left: 0.2rem; }

  .combos { max-height: 26rem; overflow-y: auto; display: grid; gap: 1px; }
  .crow {
    display: grid; grid-template-columns: 3rem 1fr;
    align-items: center; gap: 0.75rem;
    padding: 0.15rem 0; border-bottom: 1px solid var(--line-soft);
  }
  .ccount {
    font-family: var(--figure); text-align: right;
    color: var(--gold-deep); font-size: 0.8125rem;
  }

  .tablebox { max-height: 28rem; overflow-y: auto; }
  table { width: 100%; font-size: 0.8125rem; }
  th, td { padding: 0.25rem 0.5rem; text-align: left; }
  th {
    position: sticky; top: 0; background: var(--surface); z-index: 1;
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  th.v, td.val { text-align: right; }
  td { border-bottom: 1px solid var(--line-soft); }
  .val { font-family: var(--figure); white-space: nowrap; }
  .sum { color: var(--gold-deep); }

  .grid { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .n {
    font-family: var(--figure); color: var(--tone);
    min-width: 1.1rem; text-align: center;
  }
  .none { color: var(--line); font-family: var(--figure); font-size: 0.75rem; }

  .more { display: flex; gap: 0.35rem; margin-top: 0.6rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }
  .more .all { border-color: var(--gold); color: var(--gold); }

  .note { margin: 0; font-size: 0.75rem; line-height: 1.7; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
