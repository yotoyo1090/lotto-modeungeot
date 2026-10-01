<script>
  // 당첨 스펙트럼 — les grilles de la liste rangées par leur vrai rang face au
  // 회차 choisi (déjà tiré), à côté de ce que le hasard donnerait pour le même
  // nombre de grilles, puis ce que cela aurait rapporté.
  //
  // L'échelle est logarithmique : le hasard attend ~0,03 1등 et des milliers
  // de 5등 pour la même liste. En linéaire, 1등 · 2등 · 3등 seraient invisibles.
  import { RANK_WAYS } from '../lib/pick.js'
  import { num } from '../lib/format.js'

  // `counts` : [낙첨, 1등 … 5등] (`rankCounts`), `total` : grilles de la liste,
  // `sampled` : vrai quand la liste n'est qu'un tirage parmi plus de grilles,
  // `prize` : la ligne du 회차 dans prizes.json — { 1: [당첨자, 1인당], … }.
  let { counts, total, sampled = false, prize = null, rang } = $props()

  const N = 8_145_060
  // 4등 et 5등 sont fixes depuis longtemps ; s'ils manquent, on prend ces montants.
  const FIXED = { 4: 50_000, 5: 5_000 }
  const PRICE = 1_000

  const rows = $derived([1, 2, 3, 4, 5].map((r) => {
    const mine = counts[r]
    const expected = (total * RANK_WAYS[r]) / N
    const each = prize?.[r]?.[1] ?? FIXED[r] ?? null
    return {
      r, mine, expected, each,
      fixed: prize?.[r] === undefined && FIXED[r] !== undefined,
      money: each === null ? null : mine * each,
      ratio: expected > 0 ? mine / expected : null,
    }
  }))
  const won = $derived(rows.reduce((a, x) => a + (x.money ?? 0), 0))
  const cost = $derived(total * PRICE)
  const unknown = $derived(rows.some((x) => x.mine > 0 && x.each === null))

  // ── le graphique : deux barres par rang, mes grilles et le hasard
  const W = 520
  const L = 54
  const H = 22
  const top = $derived(Math.max(1, ...rows.map((x) => Math.max(x.mine, x.expected))))
  const x = (v) => L + (Math.log10(1 + v) / Math.log10(1 + top)) * (W - L - 70)
  const ticks = $derived([1, 10, 100, 1_000, 10_000, 100_000, 1_000_000].filter((t) => t <= top * 1.2))
  const fmtExp = (v) => (v >= 10 ? num(Math.round(v)) : v >= 1 ? v.toFixed(1) : v.toFixed(2))
</script>

<section class="spectrum" aria-label="당첨 스펙트럼">
  <div class="title">
    <b>당첨 스펙트럼</b>
    <span class="dim">{rang}회 당첨번호 기준 · 목록의 {num(total)}개 조합{#if sampled} (뽑힌 조합 안에서){/if}</span>
  </div>

  <div class="body">
    <div class="scroll">
      <svg viewBox="0 0 {W} {5 * H * 2 + 34}" role="img" aria-label="등수별 조합 수와 우연의 기대값">
        {#each ticks as t (t)}
          <line class="grid" x1={x(t)} x2={x(t)} y1="4" y2={5 * H * 2 + 8} />
          <text class="tick" x={x(t)} y={5 * H * 2 + 22} text-anchor="middle">{num(t)}</text>
        {/each}
        {#each rows as row, i (row.r)}
          {@const y = 6 + i * H * 2}
          <text class="rank" x={L - 10} y={y + H - 2} text-anchor="end">{row.r}등</text>
          <rect class="mine" x={L} y={y} width={Math.max(0, x(row.mine) - L)} height={H * 0.8} rx="2" />
          <text class="val" x={x(row.mine) + 6} y={y + H * 0.6}>{num(row.mine)}</text>
          <rect class="chance" x={L} y={y + H * 0.85} width={Math.max(0, x(row.expected) - L)} height={H * 0.55} rx="2" />
          <text class="val soft" x={x(row.expected) + 6} y={y + H * 1.3}>{fmtExp(row.expected)}</text>
        {/each}
      </svg>
      <p class="legend"><i class="mine"></i>내 조합 <i class="chance"></i>같은 개수를 무작위로 골랐을 때의 기대값 · 로그 눈금</p>
    </div>

    <table>
      <thead>
        <tr><th>등수</th><th class="v">내 조합</th><th class="v">우연 기대</th><th class="v">배율</th><th class="v">1인당 당첨금</th><th class="v">합계</th></tr>
      </thead>
      <tbody>
        {#each rows as row (row.r)}
          <tr class:hit={row.mine > 0}>
            <td>{row.r}등</td>
            <td class="v">{num(row.mine)}</td>
            <td class="v soft">{fmtExp(row.expected)}</td>
            <td class="v" class:up={row.ratio !== null && row.ratio > 1} class:down={row.ratio !== null && row.ratio < 1}>
              {row.ratio === null || row.expected < 1 ? '—' : `${row.ratio.toFixed(2)}배`}
            </td>
            <td class="v soft">{row.each === null ? '당첨자 없음' : `${num(row.each)}원${row.fixed ? ' (고정)' : ''}`}</td>
            <td class="v">{row.money === null ? '—' : `${num(row.money)}원`}</td>
          </tr>
        {/each}
        <tr class="miss"><td>낙첨</td><td class="v">{num(counts[0])}</td><td colspan="4"></td></tr>
      </tbody>
      <tfoot>
        <tr><td colspan="5">당첨금 합계</td><td class="v strong">{num(won)}원</td></tr>
        <tr><td colspan="5">구입비 ({num(total)}장 × {num(PRICE)}원)</td><td class="v">{num(cost)}원</td></tr>
        <tr><td colspan="5">회수율</td><td class="v strong">{cost ? ((won / cost) * 100).toFixed(1) : '0'}%</td></tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    배율 = 내 조합 ÷ 우연 기대. 1.00배면 필터가 이 회차에서 우연과 같았다는 뜻입니다(기대값이 1보다 작은 등수는 「—」).
    1~3등 금액은 그 회차의 실제 1인당 금액입니다 — 실제로 샀다면 당첨자가 늘어 더 나눠집니다.
    {#if unknown}당첨자가 없던 등수는 금액을 알 수 없어 합계에서 빠집니다.{/if}
    한 회차의 결과는 운에 크게 좌우됩니다. 여러 회차로 보려면 「팁 › 필터 조합 검정」을 보세요.
  </p>
</section>

<style>
  .spectrum { margin: 0.9rem 0 1rem; padding: 0.8rem 0.9rem; border: 1px solid var(--line); border-radius: var(--radius); }
  .title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.6rem; margin-bottom: 0.6rem; font-size: 0.875rem; }
  .title b { color: var(--ink); }
  .dim { color: var(--muted); font-size: 0.75rem; }
  .body { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); align-items: start; }
  .scroll { overflow-x: auto; min-width: 0; }
  svg { display: block; width: 100%; min-width: 22rem; height: auto; }
  .grid { stroke: var(--line-soft); }
  .tick { font-size: 9px; fill: var(--muted); }
  .rank { font-size: 11px; fill: var(--ink); }
  .val { font-size: 10px; fill: var(--ink); font-family: var(--figure); }
  .val.soft { fill: var(--muted); }
  rect.mine { fill: var(--gold); }
  rect.chance { fill: var(--muted); opacity: 0.45; }
  .legend { margin: 0.3rem 0 0; font-size: 0.6875rem; color: var(--muted); display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .legend i { display: inline-block; width: 0.7rem; height: 0.55rem; border-radius: 2px; }
  .legend i.mine { background: var(--gold); }
  .legend i.chance { background: var(--muted); opacity: 0.45; margin-left: 0.5rem; }
  table { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  th, td { padding: 0.25rem 0.45rem; text-align: left; white-space: nowrap; }
  th { color: var(--muted); font-weight: 400; font-size: 0.6875rem; border-bottom: 1px solid var(--line); }
  td { border-bottom: 1px solid var(--line-soft); }
  .v { text-align: right; font-family: var(--figure); }
  .soft { color: var(--muted); }
  tr.hit td:first-child { color: var(--gold-deep); font-weight: 600; }
  tr.miss td { color: var(--muted); }
  .up { color: var(--gold-deep); }
  .down { color: var(--hot, #b4432f); }
  tfoot td { border-bottom: 0; padding-top: 0.35rem; }
  .strong { font-weight: 700; color: var(--ink); }
  .note { margin: 0.7rem 0 0; line-height: 1.6; }
</style>
