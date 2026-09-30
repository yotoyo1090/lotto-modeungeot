<script>
  // 이월 — ce qu'un tirage reprend du précédent.
  //
  // Deux questions, deux moitiés. À gauche : est-ce fréquent ? La
  // distribution du nombre de reprises sur toute la période, avec le
  // dernier tirage repéré dedans. À droite : lesquels, et où ? Les
  // derniers tirages, numéros repris et position qu'ils occupaient dans le
  // tirage d'avant (일 = 1 … 보너스 = 7).
  //
  // Ces deux colonnes remplacent `전회차이월번호` et `전회차이월번호위치`,
  // qui étaient stockées en base et donc figées.
  import Bars from './Bars.svelte'
  import { distribution } from '@core/analysis.js'
  import { num, POSITION_LABELS, rang } from '../lib/format.js'

  let { draws, metrics, rows = 12 } = $props()

  const last = $derived(draws.n - 1)
  const spread = $derived(distribution(metrics.carryCount.subarray(1)))
  const recent = $derived(
    Array.from({ length: Math.min(rows, draws.n - 1) }, (_, k) => last - k))

  // Sur toute la période, combien de numéros un tirage reprend-il en moyenne ?
  const mean = $derived(
    draws.n > 1
      ? metrics.carryCount.subarray(1).reduce((a, b) => a + b, 0) / (draws.n - 1)
      : 0)
</script>

<section class="panel">
  <div class="head">
    <h2>이월</h2>
    <span class="gloss">직전 회차에서 이어진 번호</span>
    <span class="right">평균 {mean.toFixed(2)}개</span>
  </div>

  <div class="grid two">
    <div>
      <p class="lead">전 회차에서 몇 개나 다시 나왔나</p>
      <Bars data={spread} mark={metrics.carryCount[last]} suffix="개" />
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr><th>회차</th><th>이월번호</th><th>전회차 위치</th><th>합</th></tr>
        </thead>
        <tbody>
          {#each recent as i (i)}
            {@const numbers = metrics.carry.numbers[i] ?? []}
            {@const where = metrics.carry.positions[i] ?? []}
            <tr class:now={i === last}>
              <td>{rang(draws.rangs[i])}</td>
              <td class="nums">
                {#if numbers.length}
                  {[...numbers].sort((a, b) => a - b).join(' · ')}
                {:else}<span class="dim">없음</span>{/if}
              </td>
              <td class="dim pos">
                {where.length
                  ? where.map((p) => POSITION_LABELS[p - 1]).join(' ')
                  : '—'}
              </td>
              <td>{numbers.length ? num(metrics.carrySum[i]) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</section>

<style>
  .lead {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    color: var(--muted);
  }
  .nums { text-align: right; font-variant-numeric: tabular-nums; }
  .pos { font-size: 0.75rem; }
  tr.now td { background: var(--gold-wash); }
  tr.now td:first-child { color: var(--gold); font-weight: 600; }
</style>
