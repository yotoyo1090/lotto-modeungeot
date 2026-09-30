<script>
  // L'accueil : le dernier tirage, puis quatre façons de le situer.
  //
  // Les indicateurs sont calculés **une fois** ici et passés aux blocs.
  // Sans ça, chaque bloc appellerait `compute` pour son compte — quatre
  // fois le même travail à chaque changement de période.
  import { compute } from '@core/metrics.js'

  import LastDraw from '../components/LastDraw.svelte'
  import Carry from '../components/Carry.svelte'
  import Distributions from '../components/Distributions.svelte'
  import Sections from '../components/Sections.svelte'

  let { draws } = $props()

  const metrics = $derived(compute(draws))
</script>

{#if draws.n < 2}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}
  <LastDraw {draws} {metrics} />
  <Carry {draws} {metrics} />
  <Distributions {draws} {metrics} />
  <Sections {draws} />
{/if}
