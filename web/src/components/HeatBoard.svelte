<script>
  // 현재 온도 — les 45 numéros, tels qu'ils se présentent maintenant.
  //
  // C'est la réponse à la seule question qu'on se pose en arrivant : « qui
  // vient de sortir, qui manque depuis longtemps ? ». Un chiffre par
  // numéro — l'écart depuis sa dernière sortie — et la couleur de sa bande.
  //
  // Le tri par écart est le vrai apport : rangés par numéro, les 45 écarts
  // ne racontent rien ; rangés par écart, la file se lit d'un bout à l'autre.
  import { NMAX } from '@core/draws.js'
  import { BANDS, bandOf } from '../lib/heat.js'
  import { num } from '../lib/format.js'
  import Scope from './Scope.svelte'

  let {
    draws, gaps, selected = $bindable(null),
    span = $bindable('follow'), first, last,
  } = $props()

  const WIDTH = NMAX + 1
  let order = $state('gap')

  const current = $derived.by(() => {
    const base = (draws.n - 1) * WIDTH
    const list = []
    for (let n = 1; n <= NMAX; n++) {
      const gap = gaps[base + n]
      list.push({ n, gap, band: bandOf(gap) })
    }
    return order === 'gap'
      ? list.sort((a, b) => a.gap - b.gap || a.n - b.n)
      : list
  })

  const tally = $derived.by(() => {
    const out = BANDS.map(() => 0)
    for (const item of current) out[item.band.index]++
    return out
  })
</script>

<section class="panel">
  <div class="head">
    <h2>현재 온도</h2>
    <span class="gloss">지금 각 번호의 미출현 간격</span>
    <Scope bind:span {first} {last} />
    <span class="right">{num(draws.rangs[draws.n - 1])}회 기준 · {num(draws.n)}회</span>
  </div>

  <div class="controls">
    <div class="legend">
      {#each BANDS as band, i (band.key)}
        <span class="chip" style="--tone: {band.tone}; --fg: {band.key === 'hot' || band.key === 'dead' ? '#fff' : 'var(--ink)'}">
          {band.ko}<span class="chip-range">{band.range}</span>
        </span>
        <span class="chip-count">{tally[i]}</span>
      {/each}
    </div>
    <div class="sort">
      <button aria-pressed={order === 'gap'} onclick={() => (order = 'gap')}>흐름순</button>
      <button aria-pressed={order === 'number'} onclick={() => (order = 'number')}>번호순</button>
    </div>
  </div>

  <div class="board">
    {#each current as item (item.n)}
      <button class="tile" class:picked={selected === item.n}
              style="--tone: {item.band.tone}; --text: {item.band.text}"
              onclick={() => (selected = selected === item.n ? null : item.n)}
              title="{item.n}번 · {item.gap === 0 ? '이번 회차 당첨' : `${item.gap}회 전`}">
        <span class="bar"></span>
        <span class="n">{item.n}</span>
        <span class="gap">{item.gap === 0 ? '당첨' : item.gap}</span>
      </button>
    {/each}
  </div>
</section>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1.1rem;
  }

  .legend { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    padding: 0.15rem 0.45rem;
    border-radius: 2px;
    background: var(--tone);
    color: var(--fg);
    font-size: 0.75rem;
  }
  .chip-range { font-size: 0.6875rem; opacity: 0.75; }
  .chip-count {
    font-size: 0.75rem;
    color: var(--ink-soft);
    margin-right: 0.5rem;
  }

  .sort { display: flex; gap: 0.3rem; }
  .sort button { font-size: 0.75rem; }

  .board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(3.25rem, 1fr));
    gap: 3px;
  }

  /* Le numéro reste sur fond blanc. La bande 차뜨 est portée par un filet
     en tête de tuile et par la couleur de l'écart — deux signaux qui se
     lisent d'aussi loin qu'un aplat, sans passer sous le chiffre. */
  .tile {
    border: 1px solid var(--line);
    border-radius: 2px;
    padding: 0 0.25rem 0.35rem;
    background: var(--surface);
    color: var(--ink);
    display: grid;
    gap: 1px;
    text-align: center;
    line-height: 1.1;
    overflow: hidden;
  }
  .tile:hover { border-color: var(--tone); }
  .tile.picked { border-color: var(--ink); outline: 1px solid var(--ink); }

  .bar {
    display: block;
    height: 3px;
    margin: 0 -0.25rem 0.35rem;
    background: var(--tone);
  }
  .n { font-family: var(--figure); font-size: 1rem; }
  .gap { font-size: 0.6875rem; color: var(--text); font-weight: 600; }
</style>
