<script>
  // La carte d'identité du dernier tirage.
  //
  // Tout ce qui suit sur la page est une mise en perspective de ces
  // chiffres-là : la distribution dira où se situe ce 총합, le bloc 이월
  // dira si ces reprises sont fréquentes. C'est donc lui qui ouvre.
  import Balls from './Balls.svelte'
  import Stat from './Stat.svelte'
  import { day, num, PRIZE_LABELS, rang, won } from '../lib/format.js'
  import { notes as loadNotes, prizes as loadPrizes } from '../lib/data.js'

  let { draws, metrics } = $props()

  const i = $derived(draws.n - 1)
  const carried = $derived(new Set(metrics.carry.numbers[i] ?? []))

  // Gains et 비고 : 148 Ko qu'on ne charge qu'ici, après le premier rendu.
  let extra = $state({ prizes: null, notes: null })
  $effect(() => {
    const wanted = draws.rangs[i]
    let alive = true
    Promise.all([loadPrizes(), loadNotes()]).then(([p, n]) => {
      if (alive) extra = { prizes: p[wanted] ?? null, notes: n[wanted] ?? null }
    }).catch(() => { if (alive) extra = { prizes: null, notes: null } })
    return () => { alive = false }
  })
</script>

<section class="panel">
  <div class="head">
    <h2>{rang(draws.rangs[i])}</h2>
    <span class="gloss">{day(draws.dates[i])}</span>
    <span class="right">최근 당첨번호</span>
  </div>

  <Balls numbers={[...draws.numbersAt(i)]} bonus={draws.bonus[i]}
         size={48} highlight={carried} />

  <div class="stats">
    <Stat label="총합" value={num(metrics.total[i])} />
    <Stat label="AC값" value={metrics.ac[i]} note="보너스 포함 · 최대 15" />
    <Stat label="저고" value={metrics.lowHigh(i)} note="1–22 : 23–45" />
    <Stat label="홀짝" value={metrics.oddEven(i)} />
    <Stat label="이월" value={metrics.carryCount[i]}
          note={carried.size ? [...carried].sort((a, b) => a - b).join(', ') : '없음'} />
    <Stat label="소수" value={metrics.primeCount[i]} note={`합 ${num(metrics.primeSum[i])}`} />
  </div>

  {#if extra.prizes}
    <div class="scroll prizes">
      <table>
        <thead>
          <tr>
            <th>순위</th>
            {#each Object.keys(PRIZE_LABELS) as k (k)}<th>{PRIZE_LABELS[k]}</th>{/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="dim">당첨자</td>
            {#each Object.keys(PRIZE_LABELS) as k (k)}
              <td>{extra.prizes[k] ? `${num(extra.prizes[k][0])}명` : '—'}</td>
            {/each}
          </tr>
          <tr>
            <td class="dim">1인당</td>
            {#each Object.keys(PRIZE_LABELS) as k (k)}
              <td>{extra.prizes[k] ? won(extra.prizes[k][1]) : '—'}</td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
  {/if}

  {#if extra.notes?.length}
    <p class="notes">비고 · {extra.notes.join(' · ')}</p>
  {/if}
</section>

<style>
  .stats {
    margin-top: 1.5rem;
    display: grid;
    gap: 1.25rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
  }

  .prizes { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line-soft); }

  .notes {
    margin: 1rem 0 0;
    font-size: 0.8125rem;
    color: var(--muted);
  }
</style>
