<script>
  // 기본상식 — comment le jeu marche, et ce que chaque rang rapporte.
  //
  // Deux moitiés, et elles ne se mélangent pas :
  //
  //   la **règle**    prix, jour du tirage, condition de chaque rang, cote,
  //                   mode de calcul du gain. Elle vient de `core/rules.js`,
  //                   écrite une fois, jamais recalculée.
  //   le **réel**     ce qui a effectivement été distribué, tiré de la base.
  //                   Seul le 로또 en a : le 연금복권 verse des montants fixes
  //                   et sa table ne les stocke pas.
  //
  // Ce qui manque d'habitude à ces pages, c'est le sens des cotes. « Une sur
  // 8 145 060 » ne dit rien. « Un jeu par semaine pendant 156 000 ans » dit
  // quelque chose. Les deux sont le même chiffre.
  import { RULES, chanceOver, yearsFor } from '@core/rules.js'
  import { num, rang as fmt, won } from '../lib/format.js'

  let { product = 'lotto', draws = null, prizes = null } = $props()

  const r = $derived(RULES[product])

  // ─────────────────────────────────────── ce qui a vraiment été distribué

  // `prizes` est { 회차: { 등수: [당첨자수, 당첨금액] } }. Rien n'est stocké
  // pour le 연금복권 — ses montants sont fixes et connus d'avance.
  const real = $derived.by(() => {
    if (!prizes) return null
    const by = new Map()
    let grand = 0
    for (const [rangKey, ranks] of Object.entries(prizes)) {
      for (const [rank, [winners, amount]] of Object.entries(ranks)) {
        if (!by.has(rank)) by.set(rank, { rows: [], winners: 0, paid: 0 })
        const e = by.get(rank)
        e.rows.push({ rang: Number(rangKey), winners, amount })
        e.winners += winners
        e.paid += winners * amount
        grand += winners * amount
      }
    }
    const out = {}
    for (const [rank, e] of by) {
      const amounts = e.rows.map((x) => x.amount).sort((a, b) => a - b)
      const best = e.rows.reduce((a, b) => (b.amount > a.amount ? b : a))
      out[rank] = {
        draws: e.rows.length,
        winners: e.winners,
        paid: e.paid,
        median: amounts[Math.floor(amounts.length / 2)],
        best,
        share: grand ? e.paid / grand : 0,
      }
    }
    return { byRank: out, grand, draws: Object.keys(prizes).length }
  })

  // Combien de 회차 n'ont eu aucun gagnant au premier rang.
  const barren = $derived(real && draws
    ? draws.n - (real.byRank['1']?.draws ?? 0) : null)

  // ─────────────────────────────────────────────────── le sens des cotes

  // Un jeu par tirage : combien d'années avant de toucher, en moyenne.
  const DRAWS_PER_YEAR = 52
  const TRIES = [1, 10, 100, 1000]
</script>

<section class="panel">
  <div class="head">
    <h2>{r.label}</h2>
    <span class="gloss">{r.draw}</span>
    <span class="right">{num(r.price)}원 / 게임</span>
  </div>

  <div class="facts">
    <div class="fact">
      <span class="k">고르는 방식</span>
      <b>{r.pick}</b>
    </div>
    <div class="fact">
      <span class="k">경우의 수</span>
      <b class="fig">{num(r.space)}</b>
    </div>
    {#if r.tickets}
      <div class="fact"><span class="k">한 회차</span><b>{r.tickets}</b></div>
    {/if}
    {#if r.payout}
      <div class="fact">
        <span class="k">당첨금 비율</span>
        <b class="fig">{(r.payout * 100).toFixed(0)}%</b>
      </div>
    {/if}
  </div>

  <p class="note dim">{r.note}</p>
</section>

<section class="panel">
  <div class="head">
    <h2>등수별 상금</h2>
    <span class="gloss">조건 · 확률 · 받는 돈</span>
  </div>

  <div class="scroll">
    <table class="ranks">
      <thead>
        <tr>
          <th>등수</th><th>조건</th><th class="v">확률</th>
          <th>상금</th><th class="v">한 게임씩 사면</th>
        </tr>
      </thead>
      <tbody>
        {#each r.ranks as k (k.label)}
          <tr class:top={k.rank === 1} class:bonus={k.bonus}>
            <td><b class="rk">{k.label}</b></td>
            <td>{k.match}</td>
            <td class="val">1 / {num(k.odds)}</td>
            <td class="pz">
              {k.prize}
              {#if k.total}
                <span class="tot">총 {won(k.total)}</span>
              {/if}
            </td>
            <td class="val dim">
              {#if k.odds / DRAWS_PER_YEAR >= 1}
                {num(Math.round(yearsFor(k.odds, DRAWS_PER_YEAR)))}년
              {:else}
                {(k.odds / DRAWS_PER_YEAR * 12).toFixed(1)}달
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    마지막 칸은 <strong>한 회차에 한 게임씩</strong> 사서 평균적으로 한 번
    맞히기까지 걸리는 시간입니다. 확률을 시간으로 바꾼 것뿐, 보장이 아닙니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>돈이 어떻게 정해지나</h2>
    <span class="gloss">{r.label}</span>
  </div>
  <ol class="how">
    {#each r.how as line (line)}
      <li>{@html line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</li>
    {/each}
  </ol>
</section>

<section class="panel">
  <div class="head">
    <h2>확률이란 무엇인가</h2>
    <span class="gloss">여러 게임을 살 때</span>
  </div>

  <div class="scroll">
    <table class="odds">
      <thead>
        <tr>
          <th>등수</th>
          {#each TRIES as t (t)}<th class="v">{num(t)}게임</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each r.ranks as k (k.label)}
          <tr>
            <td><b class="rk">{k.label}</b></td>
            {#each TRIES as t (t)}
              {@const c = chanceOver(k.odds, t)}
              <td class="val">
                {#if c >= 0.01}{(c * 100).toFixed(1)}%
                {:else if c >= 0.0001}{(c * 100).toFixed(3)}%
                {:else}<span class="tiny">1 / {num(Math.round(1 / c))}</span>{/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    <strong>천 게임을 사도</strong> 1등 확률은 거의 그대로입니다. 게임을 열 배
    늘리면 확률도 열 배가 되지만, 0의 열 배는 여전히 0에 가깝습니다.
    이 표는 그것을 숨기지 않으려고 있습니다.
  </p>
</section>

{#if real}
  <section class="panel">
    <div class="head">
      <h2>실제로 지급된 돈</h2>
      <span class="gloss">규칙이 아니라, 이 데이터에 기록된 것</span>
      <span class="right">{num(real.draws)}회차 · 합계 {won(real.grand)}</span>
    </div>

    <div class="scroll">
      <table class="ranks">
        <thead>
          <tr>
            <th>등수</th><th class="v">당첨자</th><th class="v">중앙값</th>
            <th class="v">최고</th><th class="v">지급 총액</th><th>비중</th>
          </tr>
        </thead>
        <tbody>
          {#each ['1', '2', '3', '4', '5'] as rank (rank)}
            {#if real.byRank[rank]}
              {@const e = real.byRank[rank]}
              <tr class:top={rank === '1'}>
                <td><b class="rk">{rank}등</b></td>
                <td class="val">{num(e.winners)}명</td>
                <td class="val">{won(e.median)}</td>
                <td class="val gold">
                  {won(e.best.amount)}
                  <span class="tiny">{fmt(e.best.rang)}</span>
                </td>
                <td class="val">{won(e.paid)}</td>
                <td>
                  <span class="track">
                    <span class="fill" style="width: {e.share * 100}%"></span>
                  </span>
                  <span class="pct">{(e.share * 100).toFixed(1)}%</span>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>

    {#if barren !== null && barren > 0}
      <p class="note dim">
        <strong>{num(barren)}회차</strong>에는 1등이 한 명도 없었습니다 — 그
        돈은 다음 회차로 넘어갔습니다.
        4등이 <strong>50,000원</strong>으로, 5등이 <strong>5,000원</strong>으로
        굳은 것은 각각 <strong>401회차</strong>와 <strong>88회차</strong>부터입니다.
        그 전에는 이 둘도 나눠 갖는 몫이었습니다.
      </p>
    {/if}
  </section>
{:else}
  <section class="panel">
    <div class="head">
      <h2>실제로 지급된 돈</h2>
      <span class="gloss">이 제품은 기록이 없습니다</span>
    </div>
    <p class="note dim tight">
      연금복권은 <strong>등수마다 금액이 정해져</strong> 있습니다 — 당첨자가
      몇 명이든 달라지지 않으므로, 위의 표가 곧 실제 금액입니다.
      옛 데이터베이스도 이 제품의 지급액은 담고 있지 않습니다.
    </p>
  </section>
{/if}

<section class="panel">
  <p class="note dim tight">
    규칙과 확률은 <strong>동행복권</strong>이 공표한 것을 옮긴 것입니다
    (2026년 8월 확인). 지급액은 이 프로젝트의 데이터에서 직접 계산했습니다.
    <br />
    이 도구는 <strong>당첨을 예측하지 않습니다.</strong> 과거 결과는 다음
    회차와 무관합니다.
  </p>
</section>

<style>
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .facts {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  }
  .fact { display: grid; gap: 0.15rem; }
  .fact .k { color: var(--muted); font-size: 0.75rem; }
  .fact b { font-weight: 500; font-size: 0.9375rem; }
  .fact b.fig { font-family: var(--figure); font-size: 1.25rem; }

  table { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  th, td { padding: 0.4rem 0.6rem; text-align: left; }
  th {
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  th.v, td.val { text-align: right; }
  td { border-bottom: 1px solid var(--line-soft); }
  .val { font-family: var(--figure); white-space: nowrap; }
  .rk { font-weight: 600; }
  tr.top .rk { color: var(--gold-deep); }
  tr.top td { background: color-mix(in srgb, var(--gold-soft) 22%, transparent); }
  tr.bonus .rk { color: var(--t-dead-text); }
  .gold { color: var(--gold-deep); }
  .tiny { font-size: 0.6875rem; color: var(--muted); margin-left: 0.3rem; }

  .pz { line-height: 1.4; }
  .tot {
    display: block; font-family: var(--figure);
    font-size: 0.6875rem; color: var(--muted);
  }

  .track {
    display: inline-block; width: 5rem; height: 0.45rem;
    background: var(--line-soft); border-radius: 0.25rem;
    overflow: hidden; vertical-align: middle;
  }
  .fill { display: block; height: 100%; background: var(--gold); }
  .pct {
    font-family: var(--figure); font-size: 0.6875rem;
    color: var(--muted); margin-left: 0.4rem;
  }

  .how { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.5rem; }
  .how li { font-size: 0.875rem; line-height: 1.6; }
  /* Le <strong> vient de {@html} : sans :global, Svelte retire ce style. */
  .how :global(strong) { color: var(--ink); font-weight: 600; }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.7; }
  .note.tight { margin-top: 0; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
