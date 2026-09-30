<script>
  // 위치 — la fréquence de chaque numéro à chaque position de boule.
  //
  // Les six numéros sont triés avant d'être numérotés : 일 est donc toujours
  // le plus petit, 육 le plus grand. La conséquence saute aux yeux dans la
  // grille — 일 n'atteint presque jamais les hautes valeurs, 육 presque
  // jamais les basses. Ce n'est pas une propriété du tirage, c'est une
  // propriété du tri, et il vaut mieux la voir que se la faire raconter.
  //
  // Sept lignes de 45 cases remplacent sept vues séparées.
  import { positions } from '@core/analysis.js'
  import { NMAX } from '@core/draws.js'
  import { num, POSITION_LABELS, sectionOf, SECTION_VARS } from '../lib/format.js'
  import Scope from './Scope.svelte'

  // `place` est lié : cliquer une ligne choisit la position, et les trois
  // blocs de l'onglet suivent. La grille sert donc de sommaire.
  let {
    draws, place = $bindable(null),
    span = $bindable('follow'), first = null, last = null,
  } = $props()

  const grid = $derived(positions(draws))

  // Un maximum par ligne, pas un maximum global : sinon les positions
  // resserrées écrasent toutes les autres et la grille devient illisible.
  const peaks = $derived(grid.map((row) => Math.max(1, ...Object.values(row))))

  const numbers = Array.from({ length: NMAX }, (_, k) => k + 1)

  let hover = $state(null)
</script>

<section class="panel">
  <div class="head">
    <h2>위치</h2>
    <span class="gloss">공 자리별 빈도</span>
    {#if first !== null}<Scope bind:span {first} {last} />{/if}
    <span class="right">
      {#if hover}
        {POSITION_LABELS[hover.p]} · {hover.n}번 · {num(hover.count)}회
      {:else}
        {num(draws.n)}회 기준
      {/if}
    </span>
  </div>

  <div class="scroll">
    <div class="matrix" style="--cols: {NMAX}">
      <div class="corner"></div>
      {#each numbers as n (n)}
        <div class="colhead" style="color: var({SECTION_VARS[sectionOf(n)]})">{n}</div>
      {/each}

      {#each POSITION_LABELS as label, p (label)}
        {#if place === null}
          <div class="rowhead">{label}</div>
        {:else}
          <button class="rowhead pick" class:on={place === p}
                  onclick={() => (place = p)}>{label}</button>
        {/if}
        {#each numbers as n (n)}
          {@const count = grid[p][n] ?? 0}
          <div class="cell" class:row-on={place === p}
               style="--fill: {count / peaks[p]}"
               class:empty={count === 0}
               title="{label} · {n}번 · {count}회"
               onmouseenter={() => (hover = { p, n, count })}
               onmouseleave={() => (hover = null)}
               role="presentation"></div>
        {/each}
      {/each}
    </div>
  </div>

  <p class="foot">
    여섯 번호는 정렬 후 번호가 매겨진다 — 일은 항상 가장 작은 수, 육은 가장 큰 수.
    <span class="dim">그래서 보이는 대각선은 추첨이 아니라 정렬에서 생긴 모양이다.</span>
  </p>
</section>

<style>
  .matrix {
    display: grid;
    grid-template-columns: 3.5rem repeat(var(--cols), minmax(14px, 1fr));
    gap: 2px;
    min-width: 44rem;
  }

  /* La ligne choisie se signale par un filet, pas par un aplat : les cases
     portent déjà une intensité, la repeindre effacerait le comptage. */
  .rowhead.pick {
    border: 0; background: none; padding: 0 0.4rem 0 0;
    text-align: right; font: inherit; cursor: pointer;
  }
  .rowhead.pick:hover { border: 0; text-decoration: underline; }
  .rowhead.pick.on { color: var(--gold); font-weight: 700; }
  .cell.row-on { box-shadow: inset 0 -1px 0 var(--gold), inset 0 1px 0 var(--gold); }

  .colhead {
    font-size: 0.5625rem;
    text-align: center;
    padding-bottom: 2px;
    line-height: 1;
  }

  .rowhead {
    font-size: 0.75rem;
    color: var(--ink-soft);
    display: flex;
    align-items: center;
    padding-right: 0.5rem;
    justify-content: flex-end;
    white-space: nowrap;
  }

  .cell {
    height: 20px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--gold-bright) calc(var(--fill) * 100%), var(--line-soft));
    cursor: crosshair;
  }
  .cell.empty { background: var(--paper); box-shadow: inset 0 0 0 1px var(--line-soft); }
  .cell:hover { outline: 1.5px solid var(--ink); outline-offset: 1px; }

  .foot {
    margin: 1.25rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .foot .dim { display: block; }
</style>
