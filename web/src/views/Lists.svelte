<script>
  // L'onglet 리스트.
  //
  // L'ancien site en faisait **onze pages**, une par famille de numéros. Une
  // rangée de onze boutons, et les cinq blocs suivent : les membres de la
  // famille, les combinaisons, le compte, la somme, et le tableau.
  //
  // Ce sont les mêmes onze familles que l'onglet 구간, et ce n'est pas un
  // doublon : le 구간 demande *dans quelle tranche de dizaines* elles
  // tombent, le 리스트 *combien il y en a, lesquelles, et pour quelle somme*.
  import { LIST_FAMILIES, listSeries } from '@core/lists.js'
  import { carryover } from '@core/metrics.js'

  import Bars from '../components/Bars.svelte'
  import FlowChart from '../components/FlowChart.svelte'
  import Scope from '../components/Scope.svelte'
  import { num, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'
  import { scoped } from '../lib/scope.js'

  let { draws, base = draws } = $props()

  const first = $derived(base.rangs[0])
  const last = $derived(base.rangs[base.n - 1])

  let family = $state('double')
  const fam = $derived(LIST_FAMILIES.find((f) => f.key === family))

  let statSpan = $state('follow')
  let tableSpan = $state('follow')
  const statDraws = $derived(scoped(base, draws, statSpan))
  const tableDraws = $derived(scoped(base, draws, tableSpan))

  // 이월차번호 se lit sur deux tirages : sur une tranche, le premier 회차 a
  // bien un prédécesseur dans l'historique. On calcule une fois sur tout.
  const baseCarry = $derived(carryover(base))
  function aligned(d) {
    if (d === base) return baseCarry
    const numbers = []
    for (let i = 0; i < d.n; i++) {
      numbers.push(baseCarry.numbers[base.indexOf(d.rangs[i])] ?? [])
    }
    return { numbers }
  }

  const upper = $derived(listSeries(statDraws, family, aligned(statDraws)))
  const lower = $derived(listSeries(tableDraws, family, aligned(tableDraws)))

  // Les combinaisons se comptent par centaines : sur 1 134 회차 la plupart
  // ne sortent qu'une fois. On montre les plus fréquentes, le reste sur
  // demande.
  const CSTEP = 60
  let cshow = $state(CSTEP)
  $effect(() => { family; statSpan; cshow = CSTEP })

  const STEP = 400
  let limit = $state(STEP)
  $effect(() => { family; tableSpan; limit = STEP })
  const shown = $derived(lower.rows.slice(0, limit))

  // Le graphique du 숫자수 : une fenêtre, comme partout.
  const WINDOWS = [60, 120, 240, 0]
  let win = $state(120)
  const curve = $derived(win ? upper.flow.slice(-win) : upper.flow)

  const once = $derived(upper.combos.filter((c) => c.count === 1).length)
</script>

{#if draws.n < 2}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}
  <section class="panel bar">
    <div class="head-inline">
      <h2>{fam.label} 당첨번호 통계 및 패턴</h2>
      <span class="gloss">{fam.gloss} · 일곱 번호 중에서</span>
    </div>

    <div class="picker">
      {#each LIST_FAMILIES as f (f.key)}
        <button aria-pressed={family === f.key}
                onclick={() => (family = f.key)}>{f.label}</button>
      {/each}
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>{fam.label} 당첨번호 통계</h2>
      <span class="gloss">가족의 번호마다 몇 번 나왔나</span>
      <Scope bind:span={statSpan} {first} {last} />
      <span class="right">{num(statDraws.n)}회</span>
    </div>

    <div class="scroll" class:barbox={Object.keys(upper.members).length > 24}>
      <Bars data={upper.members} />
    </div>

    <p class="note dim">
      1회차부터 최근 회차까지의 기록입니다. 선택의 폭을 좁히는 데 쓸 수 있지만, 어떤 번호 묶음도 1등 확률을 높이지는 못합니다 — 「팁 › 필터 검정」 참고.
      <br />
      보너스를 포함한 <strong>일곱 번호</strong>를 봅니다.
      판단은 여러분의 몫입니다.
    </p>
  </section>

  <section class="panel two">
    <div class="half">
      <div class="head">
        <h2>{fam.label} 숫자수 통계</h2>
        <span class="gloss">한 회차에 몇 개</span>
      </div>
      <Bars data={upper.counts} suffix="개" />
    </div>

    <div class="half">
      <div class="head">
        <h2>{fam.label} 숫자합 통계</h2>
        <span class="gloss">그 번호들의 합</span>
      </div>
      <div class="scroll" class:barbox={Object.keys(upper.sums).length > 24}>
        <Bars data={upper.sums} />
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>{fam.label} 당첨번호 흐름</h2>
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
      <h2>{fam.label} 동반 당첨번호 통계</h2>
      <span class="gloss">함께 나온 조합</span>
      <span class="right">
        {num(upper.combos.length)}가지 · 한 번뿐 {num(once)}
      </span>
    </div>

    <!-- Sur mille tirages, presque chaque combinaison est unique : les
         montrer toutes ferait mille lignes qui disent toutes « 1 ». On range
         de la plus fréquente à la plus rare, et on s'arrête là où ça cesse
         d'apprendre quelque chose. -->
    <div class="scroll combos">
      {#each upper.combos.slice(0, cshow) as c, k (c.label)}
        <div class="crow">
          <span class="ccount">{num(c.count)}</span>
          <span class="grid">
            {#if !c.numbers.length}
              <span class="none">없음</span>
            {:else}
              {#each c.numbers as n (n)}
                <span class="n" style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
              {/each}
            {/if}
          </span>
        </div>
      {/each}
    </div>

    {#if cshow < upper.combos.length}
      <div class="more">
        <button onclick={() => (cshow += CSTEP)}>
          더 보기 <span class="dim">{num(cshow)} / {num(upper.combos.length)}</span>
        </button>
      </div>
    {/if}
  </section>

  <section class="panel">
    <div class="head">
      <h2>{fam.label} 당첨번호 패턴</h2>
      <span class="gloss">회차별 리스트</span>
      <Scope bind:span={tableSpan} {first} {last} />
      <span class="right">{num(lower.rows.length)}회</span>
    </div>

    <div class="scroll tablebox">
      <table>
        <thead>
          <tr>
            <th>회차</th>
            <th>{fam.label}</th>
            <th class="v">숫자수</th>
            <th class="v">숫자합</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as row}
            <tr>
              <td>{fmt(row.rang)}</td>
              <td>
                {#if !row.numbers.length}
                  <span class="none">·</span>
                {:else}
                  <span class="grid">
                    {#each row.numbers as n (n)}
                      <span class="n" style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
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
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .picker { display: flex; gap: 0.3rem; flex-wrap: wrap; justify-content: flex-end; }
  .picker button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }

  .two {
    display: grid; gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  }
  .half { min-width: 0; }

  .win { font-size: 0.6875rem; padding: 0.1rem 0.4rem; margin-left: 0.2rem; }

  .barbox { max-height: 26rem; overflow-y: auto; }
  .tablebox { max-height: 28rem; overflow-y: auto; }

  /* Les combinaisons : le compte à gauche, la grille à droite. Deux colonnes
     valent mieux qu'une barre — ce qu'on lit ici, c'est la grille. */
  .combos { max-height: 30rem; overflow-y: auto; display: grid; gap: 1px; }
  .crow {
    display: grid; grid-template-columns: 3rem 1fr;
    align-items: center; gap: 0.75rem;
    padding: 0.15rem 0; border-bottom: 1px solid var(--line-soft);
  }
  .ccount {
    font-family: var(--figure); text-align: right;
    color: var(--gold-deep); font-size: 0.8125rem;
  }

  table { width: 100%; font-size: 0.8125rem; }
  th, td { padding: 0.25rem 0.5rem; text-align: left; }
  th {
    position: sticky; top: 0; background: var(--surface);
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  th.v, td.val { text-align: right; }
  td { border-bottom: 1px solid var(--line-soft); }
  tbody tr { content-visibility: auto; contain-intrinsic-size: auto 1.6rem; }
  .val { font-family: var(--figure); white-space: nowrap; }
  .sum { color: var(--gold-deep); }

  .grid { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .n {
    font-family: var(--figure); color: var(--tone);
    min-width: 1.5rem; text-align: center;
  }
  .none { color: var(--line); font-family: var(--figure); font-size: 0.75rem; }

  .more { display: flex; gap: 0.35rem; margin-top: 0.6rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }
  .more .all { border-color: var(--gold); color: var(--gold); }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
