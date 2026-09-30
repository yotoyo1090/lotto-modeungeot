<script>
  // 뜨거운 · 중간 · 차가운 · 사망 — les 45 numéros triés par écart croissant.
  //
  // Trois lignes d'en-tête, comme dans l'ancien : les quatre bandes, la
  // position 라인, puis le numéro. La ligne de corps porte le 회차 et les 45
  // écarts.
  //
  // Une correction : dans l'ancien, le `colspan` de 뜨거운 avalait la colonne
  // de gauche, si bien que les quatre bandes tombaient une colonne trop à
  // gauche. Ici la colonne d'en-tête est à part et les bandes sont en face
  // de leurs numéros.
  import { temperatureRow } from '@core/board.js'

  import { rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'

  // Un tableau par 회차, empilés — comme le 패턴. Chacun est trié pour
  // lui-même : les colonnes ne se correspondent donc pas d'un tableau à
  // l'autre, chaque tableau est la photo de son propre tirage.
  // `history` — le bilan des quatre bandes sur tout l'historique, si le
  // parent le passe. C'est le seul chiffre de cet écran qui tranche quelque
  // chose ; sans lui on ne voit que des effectifs.
  // `lines` — les deux taux de chaque position, sur tout l'historique.
  // `numbers` — le taux du **numéro** lui-même, avec son χ². Position et
  // numéro sont deux questions différentes : la 9e colonne n'est pas le même
  // numéro d'un 회차 à l'autre, le 27 est toujours le 27.
  let {
    boards = [], highlight = new Set(), history = null, lines = null,
    numbers = null,
  } = $props()

  const pc = (v) => `${(v * 100).toFixed(1)}%`
  const p1 = (v) => (v * 100).toFixed(1)

  const tables = $derived(boards.map((b) => ({
    rang: b.rang,
    // Le 회차 à venir n'est pas tiré : ses bandes n'ont ni sortis ni
    // attendus à montrer, seulement des effectifs.
    upcoming: b.upcoming === true,
    ...temperatureRow(b.cells),
  })))

  const TONE = {
    hot: '--t-hot', midle: '--t-mid', cold: '--t-cold', dead: '--t-dead',
  }
  const TEXT = {
    hot: '--t-hot-text', midle: '--t-mid-text',
    cold: '--t-cold-text', dead: '--t-dead-text',
  }
</script>

<section class="panel">
  <div class="head">
    <h2>뜨거운 · 중간 · 차가운 · 사망</h2>
    <span class="gloss">미출현 간격순</span>
    <span class="right">
      {tables.filter((t) => !t.upcoming).length}개 회차{#if tables.some((t) => t.upcoming)}&nbsp;· 다음 회차 포함{/if}
    </span>
  </div>

  {#if tables.length === 0}
    <p class="dim">보여줄 회차가 없습니다.</p>
  {:else}
    {#each tables as table (table.rang)}
      <div class="stack-item">
        <div class="stack-head">
          {#if table.upcoming}
            <span class="stack-rang soon">{fmt(table.rang)}</span>
            <span class="soonnote">다음 회차 · 아직 추첨 전 — 지금 기다리는 번호입니다</span>
          {:else}
            <span class="stack-rang">{fmt(table.rang)}</span>
          {/if}
          {#each table.spans as s (s.key)}
            <span class="tag" style="--tone: var({TEXT[s.key]})"
                  title={table.upcoming
                    ? `${s.label} : 지금 번호 ${s.count}개 · 추첨되면 ${s.expected.toFixed(1)}개가 기대값`
                    : `${s.label} : 번호 ${s.count}개 · 이 회차에 ${s.drawn}개 나옴 · 기대 ${s.expected.toFixed(1)}개`}>
              <b>{s.label}</b>{s.count}
              {#if table.upcoming}
                <em class="soon"><span class="exp">기대 {s.expected.toFixed(1)}</span></em>
              {:else}
                <em class:over={s.drawn > s.expected}>
                  {s.drawn}<span class="exp">/{s.expected.toFixed(1)}</span>
                </em>
              {/if}
            </span>
          {/each}
        </div>

        <div class="scroll">
          <table>
            <thead>
              <tr class="bands">
                <th class="stub"></th>
                {#each table.spans as s (s.key)}
                  {#if s.count}
                    <th colspan={s.count} style="--tone: var({TEXT[s.key]})">{s.label}</th>
                  {/if}
                {/each}
              </tr>
              <tr>
                <th class="stub">라인</th>
                {#each table.cells as _, k (k)}<th class="dim">{k + 1}</th>{/each}
              </tr>
              <tr>
                <th class="stub">번호</th>
                {#each table.cells as cell (cell.number)}
                  <th class="numcell" class:on={highlight.has(cell.number)}
                      style="--tone: var({SECTION_VARS[sectionOf(cell.number)]})">
                    {cell.number}
                  </th>
                {/each}
              </tr>
              {#if numbers}
                <!-- Le taux du numéro, collé sous le numéro : c'est de lui
                     qu'il parle, pas de la colonne où il se trouve
                     aujourd'hui. -->
                <tr class="nrate">
                  <th class="stub">번호당첨률</th>
                  {#each table.cells as cell (cell.number)}
                    {@const s = numbers.numbers[cell.number - 1]}
                    <th class:over={s.gap > 0}
                        title="{cell.number}번 : 과거 {numbers.seen}회차 중 {s.hit}회 당첨 ({pc(s.rate)}) · 기대 {pc(numbers.expectedRate)}">
                      {p1(s.rate)}
                    </th>
                  {/each}
                </tr>
              {/if}
            </thead>
            <tbody>
              <tr>
                <td class="stub">간격</td>
                {#each table.cells as cell (cell.number)}
                  <td class:won={cell.flag === '당첨'}
                      class:carried={cell.flag && cell.flag !== '당첨'}
                      style="--tone: var({TEXT[cell.band]})">
                    {cell.gap}{#if cell.flag}<i>{cell.flag}</i>{/if}
                  </td>
                {/each}
              </tr>
              {#if lines}
                <!-- Les deux taux de la **position**, pas du numéro : la 9e
                     colonne n'est pas le même numéro d'un 회차 à l'autre. -->
                <tr class="rate">
                  <td class="stub">당첨률</td>
                  {#each table.cells as _, k (k)}
                    <td title="라인 {k + 1} : 과거 {lines[k].won}회 당첨 ({pc(lines[k].wonRate)})">
                      {p1(lines[k].wonRate)}
                    </td>
                  {/each}
                </tr>
                <tr class="rate">
                  <td class="stub">첫당첨</td>
                  {#each table.cells as _, k (k)}
                    <td title="라인 {k + 1} : 과거 {lines[k].first}회 이 자리가 맨 왼쪽 당첨 ({pc(lines[k].firstRate)})">
                      {p1(lines[k].firstRate)}
                    </td>
                  {/each}
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/each}

    {#if history}
      <div class="verdict">
        <div class="verdict-head">
          <span class="lbl">전체 회차 검증</span>
          <span class="gloss">당첨번호가 어느 구간에서 나왔는가</span>
        </div>
        <div class="scroll">
          <table class="tally">
            <thead>
              <tr>
                <th class="stub">구간</th>
                {#each history as h (h.key)}
                  <th style="--tone: var({TEXT[h.key]})">{h.label}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="stub">실제</td>
                {#each history as h (h.key)}<td>{pc(h.share)}</td>{/each}
              </tr>
              <tr>
                <td class="stub">기대</td>
                {#each history as h (h.key)}<td class="dim">{pc(h.expectedShare)}</td>{/each}
              </tr>
              <tr>
                <td class="stub">차이</td>
                {#each history as h (h.key)}
                  <td class="gap">{(h.share - h.expectedShare) * 100 >= 0 ? '+' : ''}{((h.share - h.expectedShare) * 100).toFixed(1)}</td>
                {/each}
              </tr>
            </tbody>
          </table>
        </div>
        <p class="note dim">
          「실제」와 「기대」가 같다면, 뜨거운 번호가 더 많이 당첨되는 것은
          <strong>뜨거운 번호의 수가 더 많기 때문</strong>입니다 — 더 잘 나오기
          때문이 아닙니다. 어느 구간의 번호든 한 회차에 나올 확률은 똑같이
          7/45 = 15.6% 입니다.
        </p>
      </div>
    {/if}

    <p class="note dim">
      각 칸은 그 번호의 미출현 간격입니다 — 뜨거운 1–5, 중간 6–10, 차가운 11–19,
      사망 20 이상. 표마다 그 회차 기준으로 따로 정렬되므로, 같은 자리라도
      회차가 다르면 다른 번호입니다. 그 회차에 나온 번호는 당첨 · 이월로 표시됩니다.
    </p>

    {#if numbers}
      <p class="note dim">
        <strong>번호당첨률</strong> = 그 <strong>번호</strong>가 과거
        {numbers.seen}회차 중 나온 비율. 위의 두 줄은 <strong>자리</strong>를,
        이 줄은 <strong>번호</strong>를 봅니다 — 9번째 칸은 회차마다 다른
        번호지만, 27번은 언제나 27번입니다.
        <br />
        가장 많이 나온 {numbers.top.number}번이 {pc(numbers.top.rate)},
        가장 적은 {numbers.bottom.number}번이 {pc(numbers.bottom.rate)}.
        45개를 한 번에 검정하면 χ² = {numbers.chi2.toFixed(1)} · 자유도
        {numbers.df} · <strong>p = {numbers.p.toFixed(3)}</strong>
        {#if numbers.p > 0.05}
          — 공평한 45개 번호로도 흔히 나오는 정도의 차이입니다.
          <strong>어떤 번호도 다른 번호보다 잘 나오지 않습니다.</strong>
        {:else}
          — 이 정도의 불균형은 우연으로 설명하기 어렵습니다.
        {/if}
      </p>
    {/if}

    {#if lines}
      <p class="note dim">
        <strong>당첨률</strong> = 과거 회차 중 그 <strong>자리</strong>에 당첨번호가
        있었던 비율. 45개 자리 모두 15.6% 근처입니다 — 45개 중 7개가 나오니
        어느 자리든 7/45 이기 때문입니다 (χ² = 47.8 · df 44 · p = 0.32).
        <strong>첫당첨</strong> = 그 자리가 맨 왼쪽 당첨이었던 비율. 왼쪽에서
        오른쪽으로 갈수록 줄어드는 것은 정의상 당연합니다 — 1번 자리는 앞을
        기다릴 필요가 없고, 40번 자리는 앞의 39개가 모두 비어야 합니다.
        <strong>두 숫자 모두 다음 회차를 예측하지 않습니다.</strong>
        자리마다 고정된 값이라 회차가 바뀌어도 변하지 않습니다.
      </p>
    {/if}
  {/if}
</section>

<style>
  table { font-size: 0.6875rem; }
  th, td { padding: 0.2rem 0.15rem; text-align: center; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }

  .stub {
    position: sticky;
    left: 0;
    background: var(--surface);
    z-index: 1;
    border-right: 1px solid var(--line);
    padding-right: 0.5rem;
    color: var(--muted);
    font-size: 0.6875rem;
  }
  tbody .stub { color: var(--ink-soft); }

  /* Un tableau par 회차, séparés par du blanc et un filet — la même
     construction que le 패턴, pour que les deux se lisent pareil. */
  .stack-item + .stack-item {
    margin-top: 1.35rem; padding-top: 1.35rem;
    border-top: 1px solid var(--line-soft);
  }
  .stack-head {
    display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: baseline;
    margin: 0 0 0.6rem;
  }
  .stack-rang {
    font-family: var(--figure); font-size: 0.9375rem; color: var(--gold);
    margin-right: 0.4rem;
  }
  /* Le 회차 à venir. Sans ce mot, on lirait ses 간격 comme un résultat. */
  .stack-rang.soon { color: var(--gold-deep); }
  .soonnote {
    font-size: 0.6875rem; color: var(--muted); margin-right: 0.5rem;
  }
  .tag em.soon { color: var(--muted); }
  .tag {
    font-size: 0.6875rem; color: var(--tone);
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 0.1rem 0.35rem;
  }
  .tag b { font-weight: 500; margin-right: 0.25rem; }
  /* Sortis / attendus. Le second chiffre est le point de comparaison, il
     reste donc en retrait — c'est une référence, pas une mesure. */
  .tag em {
    font-style: normal;
    margin-left: 0.35rem;
    padding-left: 0.35rem;
    border-left: 1px solid var(--line);
    font-family: var(--figure);
  }
  .tag em.over { color: var(--gold); }
  .tag .exp { color: var(--muted); }

  .verdict {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
  }
  .verdict-head {
    display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.6rem;
  }
  .verdict-head .lbl { font-size: 0.875rem; font-weight: 600; }
  .verdict-head .gloss { font-size: 0.75rem; color: var(--muted); }
  .tally { font-size: 0.8125rem; }
  .tally th { color: var(--tone); padding: 0.3rem 0.9rem; }
  .tally td { padding: 0.3rem 0.9rem; font-family: var(--figure); }
  .tally td.gap { color: var(--muted); }

  .bands th {
    color: var(--tone);
    border-bottom: 1px solid var(--tone);
    font-size: 0.75rem;
    letter-spacing: 0.02em;
    padding-bottom: 0.25rem;
  }
  .bands .stub { border-bottom: 0; }

  /* Le taux du numéro, sous le numéro. Même discrétion que les deux taux de
     position : c'est un repère, pas le sujet du tableau. */
  thead tr.nrate th {
    font-size: 0.5rem; line-height: 1.25; font-weight: 400;
    color: var(--muted); padding: 0 0.15rem 0.25rem;
    font-family: var(--figure);
  }
  thead tr.nrate th.over { color: var(--gold-deep); }
  thead tr.nrate th.stub { font-size: 0.5625rem; font-family: inherit; }

  .numcell { font-family: var(--figure); color: var(--tone); font-size: 0.75rem; }
  .numcell.on {
    box-shadow: inset 0 0 0 1px var(--gold);
    color: var(--gold);
    font-weight: 700;
  }

  tbody td { color: var(--tone); font-family: var(--figure); }
  /* Sorti ce 회차 : l'aplat plein, comme dans la matrice 흐름 et comme
     l'ancienne plateforme — rouge pour 당첨, bleu pour 이월, qu'elle ne
     distinguait pas.
     L'aplat recouvre la couleur de bande du chiffre, mais ici elle n'est pas
     perdue : le tableau est trié par écart, et la bande de chaque colonne est
     écrite juste au-dessus, en face d'elle. La position dit la bande. */
  tbody td.won, tbody td.carried {
    color: var(--on-fill);
    border-radius: var(--radius);
    font-weight: 600;
  }
  tbody td.won { background: var(--hit-bg); }
  tbody td.carried { background: var(--carry-bg); }
  tbody td i {
    display: block;
    font-style: normal;
    font-size: 0.5rem;
    color: var(--muted);
    line-height: 1.1;
  }
  tbody td.won i, tbody td.carried i { color: var(--on-fill); opacity: 0.85; }

  /* Les deux taux de position. Très petits et gris : ce sont des repères
     de lecture, pas des mesures — ils ne changent jamais d'un 회차 à
     l'autre, puisqu'ils portent sur la colonne et non sur le tirage. */
  tbody tr.rate td {
    font-size: 0.5rem;
    line-height: 1.25;
    color: var(--muted);
    padding: 0 0.15rem;
    font-weight: 400;
    background: none;
  }
  tbody tr.rate td.stub { font-size: 0.5625rem; }
  tbody tr.rate:first-of-type td { padding-top: 0.25rem; }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
</style>
