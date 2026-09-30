<script>
  // 당첨번호의 온도 — d'où venaient les six numéros ?
  //
  // C'est la question que posaient les 14 pages `hotcold*` de l'ancienne
  // plateforme, une par découpage. Elle tient dans une matrice : pour chaque
  // tirage, combien de ses six numéros étaient 핫 / 미들 / 콜드 / 데드
  // **avant** ce tirage.
  //
  // La réponse mérite d'être lue avec méfiance, et c'est pour ça que la
  // colonne « 기대 » est là. Il y a mécaniquement plus de numéros 핫 que de
  // numéros 데드 à tout instant : si les 핫 fournissent plus de gagnants,
  // cela ne dit rien d'autre que « il y en avait plus ». L'écart à
  // l'attendu, lui, dit quelque chose.
  import { temperature, temperatureOfWinners } from '@core/analysis.js'
  import { NMAX } from '@core/draws.js'
  import { BANDS } from '../lib/heat.js'
  import { num } from '../lib/format.js'
  import Scope from './Scope.svelte'
  import Compare from './Compare.svelte'

  let { draws, span = $bindable('follow'), first, last } = $props()

  const WIDTH = NMAX + 1

  const stats = $derived.by(() => {
    const bands = temperature(draws)
    const winners = temperatureOfWinners(draws)
    const w = BANDS.length

    const got = new Array(w).fill(0)       // gagnants venus de chaque bande
    const pool = new Array(w).fill(0)      // numéros disponibles dans chaque bande
    let counted = 0

    // On part de i = 1 : le premier tirage n'a pas de « avant ».
    for (let i = 1; i < draws.n; i++) {
      for (let b = 0; b < w; b++) got[b] += winners[i * w + b]
      const previous = (i - 1) * WIDTH
      for (let n = 1; n <= NMAX; n++) {
        const band = bands[previous + n]
        if (band >= 0) pool[band]++
      }
      counted++
    }

    const drawn = got.reduce((a, b) => a + b, 0) || 1
    const available = pool.reduce((a, b) => a + b, 0) || 1
    return {
      counted,
      rows: BANDS.map((band, b) => ({
        band,
        got: got[b],
        share: got[b] / drawn,
        expected: pool[b] / available,
        perDraw: got[b] / (counted || 1),
        latest: winners[(draws.n - 1) * w + b],
      })),
    }
  })
</script>

<section class="panel">
  <div class="head">
    <h2>당첨번호의 온도</h2>
    <span class="gloss">여섯 당첨번호는 어디에서 왔나</span>
    <Scope bind:span {first} {last} />
    <span class="right">{num(stats.counted)}회 분석</span>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>구분</th>
          <th>회당 평균</th>
          <th>비중</th>
          <th>기대</th>
          <th>차이</th>
          <th>최근 회차</th>
        </tr>
      </thead>
      <tbody>
        {#each stats.rows as row (row.band.key)}
          {@const points = (row.share - row.expected) * 100}
          <tr>
            <td>
              <span class="swatch" style="background: {row.band.tone}"></span>
              {row.band.ko}<span class="dim"> {row.band.range}</span>
            </td>
            <td>{row.perDraw.toFixed(2)}개</td>
            <td>{(row.share * 100).toFixed(1)}%</td>
            <td class="dim">{(row.expected * 100).toFixed(1)}%</td>
            <td class:over={points >= 0.5} class:under={points <= -0.5}>
              {Math.abs(points) < 0.5 ? '기대대로'
                : `${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)}p`}
            </td>
            <td>{row.latest}개</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Le même tableau, en barres : 실제 contre 기대, bande par bande. Si les
       deux barres se recouvrent, la température ne change rien. -->
  <div class="block">
    <Compare pct
             rows={stats.rows.map((r) => ({ key: r.band.ko, obs: r.share, exp: r.expected }))}
             obsLabel="실제 비중" expLabel="기대 (인원 비례)" keyWidth="3.5rem" />
  </div>

  <div class="mix">
    {#each stats.rows as row (row.band.key)}
      {#if row.share > 0}
        <span class="seg" style="--tone: {row.band.tone}; flex-grow: {row.share}"
              title="{row.band.ko} {(row.share * 100).toFixed(1)}%"></span>
      {/if}
    {/each}
  </div>

  <p class="foot">
    핫 번호가 더 많은 당첨을 낸다면, 그것은 언제나 핫 번호의 수가 더 많기 때문일 수
    있습니다. <strong>기대</strong> 열은 각 구간에 몇 개의 번호가 있었는지를 보여줍니다 —
    비교해야 할 대상은 그쪽입니다.
  </p>
</section>

<style>
  .swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 1px;
    margin-right: 0.4rem;
  }

  td.over { color: var(--gold); }
  td.under { color: var(--ink-soft); }

  .block { margin-top: 1rem; }

  .mix {
    display: flex;
    margin-top: 1.25rem;
    border-radius: 2px;
    overflow: hidden;
  }
  /* Une bande de proportion, sans chiffre écrit dessus : les pourcentages
     sont déjà dans le tableau juste au-dessus. */
  .seg {
    background: var(--tone);
    height: 8px;
    flex-basis: 0;
    min-width: 0;
  }

  .foot {
    margin: 1.1rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-soft);
    line-height: 1.6;
  }
  .foot strong { color: var(--ink); font-weight: 600; }
</style>
