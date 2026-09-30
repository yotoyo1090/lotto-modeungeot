<script>
  // 팁 — « et si je connaissais deux numéros ? »
  //
  // C'est la question que tout joueur finit par poser, et c'est la seule de
  // tout le site à laquelle on peut répondre exactement : elle ne demande
  // aucune prédiction, seulement de la combinatoire. Les cotes viennent de
  // `core/known.js`, les montants de la base — rien n'est écrit en dur ici.
  //
  // Les blocs 백테스트 sont d'une autre nature : ce sont des mesures, pas des
  // calculs. Chacun porte son protocole, et les chiffres restent tels qu'ils
  // sont sortis du backtest. Les recalculer à l'ouverture prendrait plusieurs
  // minutes pour redonner la même chose.
  //
  // Le dernier bloc est celui qui compte. Tout ce qui précède est
  // conditionnel, et la condition n'est pas atteignable : dix méthodes
  // testées sur 1 040 회차 tombent toutes sur 13,3 % — le hasard.
  import { KNOWN_MAX, knownSpace, knownOdds, knownExpectation, knownChance }
    from '@core/known.js'
  import { num, won, PRIZE_LABELS } from '../lib/format.js'

  let { prizes = null } = $props()

  let k = $state(2)

  const PRICE = 1000
  const SINCE = 1000

  // Les montants moyens réellement distribués. Le 1등 et le 2등 sont des
  // cagnottes partagées : leur « prix » n'existe pas ailleurs que dans
  // l'historique. On se limite aux 회차 récents — la cagnotte de 2003 n'a
  // rien à voir avec celle d'aujourd'hui.
  const FALLBACK = { 1: 2269204926, 2: 55970956, 3: 1444985, 4: 50000, 5: 5000 }

  const avg = $derived.by(() => {
    if (!prizes) return { values: FALLBACK, live: false, draws: 0 }
    const sum = {}
    const seen = {}
    for (const [rangKey, ranks] of Object.entries(prizes)) {
      if (Number(rangKey) < SINCE) continue
      for (const [rank, [, amount]] of Object.entries(ranks)) {
        sum[rank] = (sum[rank] ?? 0) + amount
        seen[rank] = (seen[rank] ?? 0) + 1
      }
    }
    const values = {}
    for (const r of [1, 2, 3, 4, 5]) {
      values[r] = seen[r] ? Math.round(sum[r] / seen[r]) : FALLBACK[r]
    }
    return { values, live: Boolean(seen[1]), draws: seen[1] ?? 0 }
  })

  const space = $derived(knownSpace(k))
  const odds = $derived(knownOdds(k))
  const ev = $derived(knownExpectation(k, avg.values, PRICE))
  const chance = $derived(knownChance(k))
  const shrink = $derived(knownSpace(0) / space)

  const KS = Array.from({ length: KNOWN_MAX + 1 }, (_, i) => i)
  const pct = (v, d = 2) => `${(v * 100).toFixed(d)}%`

  // ───────────────────────────────────────────────── ce qui a été mesuré
  //
  // Backtest walk-forward : pour chaque 회차 on tire au sort k des six
  // numéros sortis, on les fixe, on joue cent조합 en 분배 최저, et on compte
  // avec la cagnotte réelle du 회차. Trente essais indépendants.

  const RUN = { from: 1139, to: 1238, draws: 100, grids: 100, reps: 30, stake: 10_000_000 }

  const BACKTEST = [
    { k: 1, median: 9_144_449, mean: 11_302_016, min: 6_660_000, max: 70_315_614,
      won: 12, touched: 0.988, median50: 1.04, won50: 17 },
    { k: 2, median: 48_105_747, mean: 173_590_247, min: 38_641_652, max: 3_634_752_066,
      won: 30, touched: 0.999, median50: 5.09, won50: 30 },
  ]

  const SIZES = [
    { n: 5, k1: 0.78, w1: 4, t1: 0.359, k2: 3.73, w2: 30, t2: 0.853 },
    { n: 10, k1: 0.75, w1: 4, t1: 0.591, k2: 4.85, w2: 30, t2: 0.969 },
    { n: 20, k1: 0.73, w1: 7, t1: 0.792, k2: 4.83, w2: 30, t2: 0.997 },
    { n: 50, k1: 0.95, w1: 12, t1: 0.954, k2: 4.62, w2: 30, t2: 0.999 },
    { n: 100, k1: 0.91, w1: 12, t1: 0.988, k2: 4.81, w2: 30, t2: 0.999 },
  ]

  // Test A/B à graines identiques : mêmes numéros fixés, mêmes 회차, seul le
  // filtre change. 300 000 조합 par branche.
  const AB = [
    { k: 1, mode: '분배 최저', median: 9_899_958, min: 6_840_000, index: 0.8755, r4: 1917, r5: 24_285 },
    { k: 1, mode: '필터 없음', median: 10_195_334, min: 6_675_000, index: 0.9982, r4: 2067, r5: 25_294 },
    { k: 2, mode: '분배 최저', median: 50_386_158, min: 34_630_436, index: 0.8900, r4: 10_382, r5: 87_727 },
    { k: 2, mode: '필터 없음', median: 53_073_307, min: 44_134_599, index: 0.9989, r4: 10_770, r5: 89_163 },
  ]

  // Walk-forward 200회 → 1239회, 2 080 numéros fixés par méthode. Le z est
  // calculé au niveau du bloc : une paire tenue plusieurs 회차 d'affilée est
  // une seule décision, pas plusieurs. Sans cette correction, une méthode qui
  // change rarement d'avis paraît significative alors qu'elle ne l'est pas.
  const PICKERS = [
    { label: '뜨거운 — 미출현 간격 최소', hits: 289, episodes: 1032, z: 0.53 },
    { label: '최근 5회 최다 출현', hits: 287, episodes: 767, z: 0.33 },
    { label: '최근 100회 최소 출현', hits: 277, episodes: 218, z: -0.00 },
    { label: '최근 30회 최다 출현', hits: 276, episodes: 441, z: -0.03 },
    { label: '차가운 — 미출현 간격 최대', hits: 273, episodes: 260, z: -0.07 },
    { label: '최근 10회 최다 출현', hits: 268, episodes: 653, z: -0.29 },
    { label: '이월 — 직전 회차에서', hits: 268, episodes: 1035, z: -0.42 },
    { label: '최근 100회 최다 출현', hits: 265, episodes: 270, z: -0.19 },
    { label: '전체 최다 출현', hits: 265, episodes: 69, z: -0.06 },
    { label: '기댓값 대비 미출현', hits: 256, episodes: 255, z: -0.36 },
  ]
  const PICK_TOTAL = 2080
  const PICK_BASE = 6 / 45

  // Les numéros allumés dans la grille. Les deux premiers sont ceux que
  // « 전체 최다 출현 » désignait au 1238회 — autant illustrer avec une paire
  // que le site sait produire qu'avec des numéros inventés. Les deux suivants
  // ne servent qu'à ce que la grille montre bien k cases.
  const SHOWN = [27, 34, 12, 40]
  const CELLS = Array.from({ length: 45 }, (_, i) => i + 1)
  const fixedNow = $derived(SHOWN.slice(0, k))
</script>

<section class="panel">
  <div class="head">
    <h2>고정수</h2>
    <span class="gloss">두 번호를 안다면 어떻게 되나</span>
    <span class="right">계산이지 예측이 아닙니다</span>
  </div>

  <p class="lede">
    번호를 고정해도 추첨은 달라지지 않습니다. 달라지는 것은
    <strong>덮어야 할 조합의 수</strong>뿐이고, 그것은 정확히 계산됩니다.
    아래 표는 「만약 안다면」이라는 <em>가정</em>에 대한 답입니다.
    그 가정의 값은 맨 아래에 있습니다.
  </p>

  <div class="picker" role="group" aria-label="고정수 개수">
    {#each KS as v (v)}
      <button class:on={k === v} onclick={() => (k = v)}>
        {v}개
      </button>
    {/each}
  </div>

  <div class="spaces">
    <div class="spacebox">
      <span class="label">남는 경우의 수</span>
      <b class="figure">{num(space)}</b>
      <span class="dim small">
        C({45 - k}, {6 - k})
        {#if k > 0}· 전체의 1/{num(Math.round(shrink))}{/if}
      </span>
    </div>
    <div class="board" aria-hidden="true">
      {#each CELLS as n (n)}
        <span class="cell" class:fix={fixedNow.includes(n)}>{n}</span>
      {/each}
    </div>
  </div>

  {#if k > 2}
    <p class="note dim">
      세 개 이상은 참고용입니다 — 실제로 도달할 수 없는 가정입니다.
    </p>
  {/if}
</section>

<section class="panel">
  <div class="head">
    <h2>등수별 확률과 기댓값</h2>
    <span class="gloss">고정수 {k}개</span>
    <span class="right">
      {#if avg.live}당첨금은 {num(SINCE)}회 이후 실제 평균 · {num(avg.draws)}회{:else}당첨금은 기록된 평균{/if}
    </span>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>등수</th><th class="v">확률</th><th class="v">1 / N</th>
          <th class="v">평균 당첨금</th><th class="v">1,000원당 기댓값</th>
        </tr>
      </thead>
      <tbody>
        {#each ev.rows as row (row.rank)}
          <tr class:top={row.rank === 1}>
            <td><b class="rk">{PRIZE_LABELS[row.rank]}</b></td>
            <td class="val">{row.p ? pct(row.p, 6) : '—'}</td>
            <td class="val dim">{row.p ? num(Math.round(1 / row.p)) : '—'}</td>
            <td class="val dim">{won(row.amount)}</td>
            <td class="val"><b>{num(Math.round(row.value))}원</b></td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">기댓값 합계</td>
          <td class="val"><b>{num(Math.round(ev.total))}원</b>
            <span class="dim"> · {pct(ev.ratio, 0)}</span></td>
        </tr>
        <tr class="dim">
          <td colspan="4">그중 1등 하나가 차지하는 몫</td>
          <td class="val">{num(Math.round(ev.first))}원
            <span> · {pct(ev.first / ev.total, 0)}</span></td>
        </tr>
        <tr class="keep">
          <td colspan="4">1등을 빼면 — 실제로 겪는 값</td>
          <td class="val"><b>{num(Math.round(ev.withoutFirst))}원</b>
            <span class="dim"> · {pct(ev.ratioWithoutFirst, 0)}</span></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    마지막 줄이 유일하게 의미 있는 줄입니다. 고정수 1개일 때 기댓값은
    336%로 보이지만 그 62%가 1등에서 나옵니다 — {num(knownSpace(1))}분의 1의
    사건이고, 평생 한 번도 오지 않습니다. 그것을 빼면 127%, 본전 언저리입니다.
    2개일 때는 1등을 빼고도 688%이고, 그 돈은 3.6%와 29.6%로 떨어지는
    <strong>4등과 5등</strong>에서 나옵니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>실제로 돌려본 결과</h2>
    <span class="gloss">백테스트 · {num(RUN.from)}–{num(RUN.to)}회</span>
    <span class="right">회차당 {RUN.grids}조합 · {RUN.reps}회 반복</span>
  </div>

  <p class="lede small">
    각 회차마다 실제로 나온 여섯 개 중 k개를 뽑아 고정하고, 분배 최저로
    {RUN.grids}조합을 사서 그 회차의 <strong>실제 당첨금</strong>으로
    계산했습니다. 한 번의 시행에 드는 돈은 {num(RUN.stake)}원입니다.
  </p>

  <div class="verdicts">
    {#each BACKTEST as b (b.k)}
      <div class="verdict" class:two={b.k === 2}>
        <span class="tag">고정수 {b.k}개</span>
        <b class="figure">{pct(b.median / RUN.stake, 0)}</b>
        <span class="unit dim">중앙값 · {num(b.median)}원</span>
        <dl>
          <div><dt>최악의 시행</dt><dd>{pct(b.min / RUN.stake, 0)} · {num(b.min)}원</dd></div>
          <div><dt>최고의 시행</dt><dd>{won(b.max)}</dd></div>
          <div><dt>이익이 난 시행</dt><dd><b>{b.won} / {RUN.reps}</b></dd></div>
          <div><dt>당첨이 있던 회차</dt><dd>{pct(b.touched, 1)}</dd></div>
          <div><dt>50회차로 줄이면</dt><dd>{pct(b.median50, 0)} · {b.won50}/{RUN.reps}</dd></div>
        </dl>
      </div>
    {/each}
  </div>

  <p class="note dim">
    1개는 <strong>본전</strong>입니다 — 서른 번 중 열두 번만 이익이 나고,
    나머지는 낸 돈을 되찾는 데 그칩니다. 2개는 <strong>서른 번 모두</strong>
    이익이 났고, 그중 가장 나쁜 시행조차 낸 돈의 386%를 돌려줬습니다.
    두 분포는 겹치지 않습니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>몇 조합을 사야 하나</h2>
    <span class="gloss">회차당 조합 수를 바꿔가며</span>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>회차당 조합</th>
          <th class="v">1개 · 중앙값</th><th class="v">이익</th><th class="v">당첨 회차</th>
          <th class="v">2개 · 중앙값</th><th class="v">이익</th><th class="v">당첨 회차</th>
        </tr>
      </thead>
      <tbody>
        {#each SIZES as s (s.n)}
          <tr>
            <td><b>{s.n}</b></td>
            <td class="val one">{pct(s.k1, 0)}</td>
            <td class="val dim">{s.w1}/30</td>
            <td class="val dim">{pct(s.t1, 1)}</td>
            <td class="val two">{pct(s.k2, 0)}</td>
            <td class="val dim">{s.w2}/30</td>
            <td class="val dim">{pct(s.t2, 1)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    고정수 2개라면 <strong>회차당 다섯 조합으로 충분합니다</strong> — 서른 번
    모두 이익이고 최악이 243%입니다. 조합을 늘려도 수익률은 오르지 않고
    <em>안정성</em>만 오릅니다: 당첨이 있는 회차 비율이 85.3%에서 99.9%로
    갑니다. 1개는 몇 조합을 사도 본전선을 넘지 못합니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>고정수가 있으면 분배 필터는 손해</h2>
    <span class="gloss">같은 시드로 A/B · 분기당 300,000조합</span>
  </div>

  <p class="lede small">
    분배 최저의 하한 0.8567은 <strong>9 이하 번호가 하나도 없어야</strong>
    도달합니다. 그런데 한 회차에는 9 이하가 평균 1.2개 들어 있습니다.
    하한을 고집하면 그 번호들을 구조적으로 포기하게 됩니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>고정수 · 방식</th><th class="v">중앙값</th><th class="v">최악의 시행</th>
          <th class="v">평균 분배</th><th class="v">4등</th><th class="v">5등</th>
        </tr>
      </thead>
      <tbody>
        {#each AB as r, i (r.k + r.mode)}
          <tr class:sep={i === 2}>
            <td>
              <b class:one={r.k === 1} class:two={r.k === 2}>{r.k}개</b>
              <span class="dim"> · {r.mode}</span>
            </td>
            <td class="val">{num(r.median)}원</td>
            <td class="val">{num(r.min)}원</td>
            <td class="val dim">{r.index.toFixed(4)}</td>
            <td class="val">{num(r.r4)}</td>
            <td class="val">{num(r.r5)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    필터 없이 두는 쪽이 중앙값에서 2.9%(1개)와 5.1%(2개) 앞서고, 2개의 최악
    시행에서는 27% 앞섭니다. 이유는 단순합니다 — 고정수가 있으면 돈은
    <strong>금액이 고정된</strong> 4등과 5등에서 나오는데, 분배가 좋아져도
    그 금액은 한 푼도 늘지 않고 확률만 깎이기 때문입니다.
    다만 서른 번의 시행으로 통계적으로 확정할 수 있는 크기는 아닙니다.
  </p>
</section>

<section class="panel edge">
  <div class="head">
    <h2>그 가정의 값</h2>
    <span class="gloss">두 번호를 고를 수 있는가</span>
  </div>

  <p class="lede">
    미리 고른 번호 {k || 2}개가 모두 나올 확률은
    <strong>{pct(knownChance(k || 2), 4)}</strong>입니다. 이 비율을 곱하면
    위의 모든 수치는 규정된 기댓값 <strong>54.5%</strong>로 되돌아옵니다.
    그러니 남는 질문은 하나뿐입니다 — 우연보다 잘 고르는 방법이 있는가.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>고르는 방법</th><th class="v">맞은 개수</th><th class="v">적중률</th>
          <th class="v">결정 횟수</th><th class="v">z</th>
        </tr>
      </thead>
      <tbody>
        {#each PICKERS as p (p.label)}
          <tr>
            <td>{p.label}</td>
            <td class="val">{p.hits}</td>
            <td class="val" class:over={p.hits / PICK_TOTAL > PICK_BASE}>
              {pct(p.hits / PICK_TOTAL)}
            </td>
            <td class="val dim">{num(p.episodes)}</td>
            <td class="val dim">{p.z > 0 ? '+' : ''}{p.z.toFixed(2)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td>아무 정보도 없을 때</td>
          <td class="val">{(PICK_TOTAL * PICK_BASE).toFixed(1)}</td>
          <td class="val"><b>{pct(PICK_BASE, 3)}</b></td>
          <td class="val dim">—</td>
          <td class="val dim">0</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    200회부터 1239회까지 걸어가며, 각 방법이 방법당 {num(PICK_TOTAL)}개의
    번호를 고정했습니다. 가장 좋은 것이 13.89%, 기준은 13.333%,
    z는 최대 0.53입니다 — p&lt;0.05에도 1.96이 필요하고, 열 가지를 함께
    시험했으니 그보다 더 필요합니다. <strong>한 번호도 고를 수 없습니다.</strong>
  </p>

  <p class="note dim">
    50회차만 보면 차가운이 100개 중 22개를 맞혀 우연을 이기는 것처럼
    보였습니다. 100회차에서 무너지고, 1040회차에서는 13.13% — 우연보다
    아래입니다. 「결정 횟수」 칸이 이유입니다: 차가운은 1040회차 동안 260번만
    번호를 바꿉니다. 네 주 동안 들고 있던 한 쌍이 맞은 것은 네 번의 성공이
    아니라 <strong>한 번의 성공</strong>입니다.
  </p>
</section>

<section class="panel plain">
  <p class="close">
    게임의 방식은 풀렸습니다. 두 번호가 확실하다면 회차당 다섯 조합으로도
    돈이 됩니다. 없는 것은 <strong>그 두 번호</strong>이고, 이 사이트의 어떤
    화면도 그것을 만들어내지 못합니다. 수익의 경계는 고정수 1개와 2개 사이에
    있고, 정확히 어디인지도 알지만, 손이 닿지 않습니다.
  </p>
</section>

<style>
  .lede { margin: 0 0 1rem; color: var(--ink-soft); max-width: 62ch; }
  .lede.small { font-size: 0.875rem; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 74ch; }
  .note strong, .lede strong { color: var(--ink); font-weight: 600; }
  .small { font-size: 0.8125rem; }

  /* Le sélecteur de k : c'est ce qui fait de cette page un écran plutôt
     qu'un texte. Tout le premier tableau en dépend. */
  .picker { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .picker button { border-radius: 999px; padding: 0.3rem 0.95rem; font-size: 0.8125rem; }
  .picker button.on {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--surface);
    font-weight: 600;
  }

  .spaces {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.5rem 2.5rem;
  }
  .spacebox { display: flex; flex-direction: column; gap: 0.2rem; min-width: 12rem; }
  .spacebox .figure { color: var(--gold); }

  /* Les 45 numéros. Voir les cases s'éteindre est plus parlant qu'un
     rapport de deux nombres. */
  .board {
    display: grid;
    grid-template-columns: repeat(15, minmax(0, 1fr));
    gap: 2px;
    flex: 1 1 20rem;
    max-width: 34rem;
  }
  .cell {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    font-size: 0.5625rem;
    color: var(--muted);
    background: var(--paper);
    border-radius: 2px;
  }
  .cell.fix { background: var(--gold); color: var(--surface); font-weight: 600; }

  th.v, td.val { text-align: right; }
  .rk { color: var(--gold-deep); }
  tr.top .rk { color: var(--gold); }
  tfoot td {
    border-top: 1px solid var(--line);
    font-size: 0.8125rem;
    padding-top: 0.5rem;
  }
  tfoot tr.keep td { font-weight: 600; color: var(--ink); }
  tbody tr.sep td { border-top: 1px solid var(--line); }
  td.over { color: var(--gold-deep); }

  .one { color: var(--t-mid-text); }
  .two { color: var(--t-dead-text); }

  .verdicts { display: grid; gap: 1.25rem; }
  @media (min-width: 820px) { .verdicts { grid-template-columns: 1fr 1fr; } }

  .verdict {
    border: 1px solid var(--line);
    border-top: 2px solid var(--t-mid);
    border-radius: var(--radius);
    padding: 1.1rem 1.2rem 1.25rem;
  }
  .verdict.two { border-top-color: var(--t-dead); }
  .verdict .tag {
    font-size: 0.6875rem;
    letter-spacing: 0.09em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .verdict .figure { display: block; margin: 0.35rem 0 0.1rem; color: var(--t-mid-text); }
  .verdict.two .figure { color: var(--t-dead-text); }
  .verdict .unit { display: block; font-size: 0.75rem; margin-bottom: 0.9rem; }

  dl { margin: 0; display: grid; gap: 0.3rem; }
  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.8125rem;
    border-top: 1px solid var(--line-soft);
    padding-top: 0.3rem;
  }
  dt { color: var(--muted); }
  dd { margin: 0; white-space: nowrap; }

  .edge { border-color: var(--gold-soft); }
  .plain { background: var(--gold-wash); border-color: var(--gold-soft); }
  .close { margin: 0; font-size: 0.9375rem; line-height: 1.7; max-width: 70ch; }
  .close strong { color: var(--gold-deep); font-weight: 600; }
</style>
