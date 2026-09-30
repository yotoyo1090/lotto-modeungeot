<script>
  // 패턴 — la grille 라인 × 미출현간격.
  //
  // Colonne 당첨 en tête, puis une colonne par écart. La case (ligne r,
  // colonne g) porte le r-ième numéro dont l'écart vaut g.
  //
  // Aucun aplat sous un chiffre : la tranche de dizaines est dans le trait
  // et dans la couleur du chiffre. Les numéros sortis se distinguent par un
  // second filet, pas par un fond rouge comme dans l'ancien.
  import { patternGrid, repeats } from '@core/board.js'

  import { num, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'

  // `boards` : le 회차 regardé et les deux d'avant. Trois grilles empilées,
  // chacune avec son 반복 수 — c'est ce qui permet de voir bouger les écarts
  // d'un tirage au suivant plutôt que de regarder une photo isolée.
  // `cells` — les deux marges de la grille (라인 et 간격), `numbers` — le
  // taux du numéro lui-même. Cette grille a exactement la forme de celle du
  // 테이블리스트 : colonne 당첨, puis une colonne par écart, et les numéros
  // empilés dans l'ordre. Les mêmes chiffres s'y appliquent donc tels quels.
  let {
    boards = [], highlight = new Set(), title = '패턴',
    cells = null, numbers = null,
  } = $props()

  const pc = (v) => (v * 100).toFixed(1)

  // Le taux d'une colonne, retrouvé par son écart. La colonne 당첨 porte la
  // clé `'won'` ; les autres, le nombre lui-même.
  const colRate = $derived.by(() => {
    const m = new Map()
    for (const c of cells?.columns ?? []) m.set(c.key, c)
    return m
  })

  const built = $derived(boards.map((b) => ({
    rang: b.rang,
    // Le 회차 à venir : sa colonne 당첨 est vide, et c'est normal — rien
    // n'est sorti. Les 45 numéros sont tous dans les colonnes d'écart.
    upcoming: b.upcoming === true,
    // Les sept du 회차 **suivant**. La grille est la photo de ce 회차-ci ;
    // les cocher dessus, c'est voir d'où le tirage d'après est parti — quel
    // écart, quelle ligne. C'est le seul lien entre deux cartes de la pile.
    next: b.next ?? null,
    hits: new Set(b.next ?? []),
    board: patternGrid(b.cells),
    count: repeats(b.cells),
  })))

  const widest = $derived(Math.max(0, ...built.map((b) => b.board.maxGap)))
  const drawnCount = $derived(built.filter((b) => !b.upcoming).length)
  // La phrase du bas compte les numéros restés dans les colonnes d'écart :
  // elle doit se lire sur un tirage connu, pas sur celui qui vient.
  const sample = $derived(built.find((b) => !b.upcoming) ?? built[0])
</script>

<section class="panel">
  <div class="head">
    <h2>{title}</h2>
    <span class="gloss">라인 × 미출현 간격</span>
    <span class="right">
      {drawnCount}개 회차{#if drawnCount !== built.length}&nbsp;· 다음 회차 포함{/if} · 최대 간격 {widest}
    </span>
  </div>

  {#if built.length === 0}
    <p class="dim">보여줄 회차가 없습니다.</p>
  {:else}
    {#each built as item (item.rang)}
      <div class="stack-item">
        <div class="stack-head">
          {#if item.upcoming}
            <span class="stack-rang soon">{fmt(item.rang)}</span>
            <span class="soonnote">다음 회차 · 아직 추첨 전 — 지금 기다리는 번호입니다</span>
          {:else}
            <span class="stack-rang">{fmt(item.rang)}</span>
          {/if}
          <span class="label">반복 수</span>
          {#each item.count.gaps as [gap, n] (gap)}
            <span class="tag"><b>{gap}</b>×{n}</span>
          {/each}
          <!-- Pas d'étiquette 당첨×0 sur le 회차 à venir : un zéro se lirait
               comme un résultat, alors qu'il n'y a pas encore de tirage. -->
          {#if !item.upcoming}
            <span class="tag won"><b>당첨</b>×{item.count.won}</span>
          {/if}
          {#if item.count.carried}
            <span class="tag won"><b>이월</b>×{item.count.carried}</span>
          {/if}
          <!-- Les sept du 회차 suivant, nommés : sans eux on verrait des
               soulignés dans la grille sans savoir ce qu'ils cochent. -->
          {#if item.next}
            <span class="nextlead">다음 {fmt(item.rang + 1)} 당첨</span>
            <span class="nextnums">
              {#each item.next as n, j (j)}
                <span class="nn" class:bonus={j === 6}
                      style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
              {/each}
            </span>
          {/if}
        </div>

        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>라인</th>
                <th class="win">당첨</th>
                {#each item.board.headers as g (g)}<th>{g}</th>{/each}
              </tr>
              {#if cells}
                <!-- Sous chaque en-tête, ce que cette colonne a donné sur
                     toute l'histoire : la part de ses cases qui sont sorties
                     au 회차 suivant. Toutes se lisent contre 15,6 %. -->
                {@const w = colRate.get('won')}
                <tr class="rate">
                  <th>당첨률</th>
                  <th class="win" title={w
                    ? `당첨 열 : 과거 ${num(w.seen)}칸 중 ${num(w.hit)}칸이 다음 회차에 당첨`
                    : null}>{w ? pc(w.rate) : '·'}</th>
                  {#each item.board.headers as g (g)}
                    {@const s = colRate.get(g)}
                    <th title={s
                      ? `간격 ${g} : 과거 ${num(s.seen)}칸 중 ${num(s.hit)}칸이 다음 회차에 당첨`
                      : null}>{s ? pc(s.rate) : '·'}</th>
                  {/each}
                </tr>
              {/if}
            </thead>
            <tbody>
              {#each item.board.grid as line (line.line)}
                {@const ls = cells?.lines[line.line - 1]}
                <tr>
                  <td class="dim">{line.line}
                    {#if ls}<i class="lrate"
                      title="라인 {line.line} : 과거 {num(ls.seen)}칸 중 {num(ls.hit)}칸이 다음 회차에 당첨"
                      >{pc(ls.rate)}</i>{/if}
                  </td>
                  <td class="win">
                    {#if line.won}
                      <span class="ball flagged" class:on={highlight.has(line.won.number)}
                            class:hit={item.hits.has(line.won.number)}
                            title={item.hits.has(line.won.number)
                              ? `${line.won.number} — 다음 회차에도 나왔습니다` : null}
                            style="--tone: var({SECTION_VARS[sectionOf(line.won.number)]})">
                        {line.won.number}<i>{line.won.flag}</i>
                      </span>
                      {#if numbers}
                        {@const ns = numbers.numbers[line.won.number - 1]}
                        <i class="nrate" class:over={ns.gap > 0}
                           title="{line.won.number}번 : 과거 {num(numbers.seen)}회차 중 {num(ns.hit)}회 당첨"
                          >{pc(ns.rate)}</i>
                      {/if}
                    {/if}
                  </td>
                  {#each line.cells as cell, k (k)}
                    <td>
                      {#if cell}
                        <span class="ball" class:on={highlight.has(cell.number)}
                              class:hit={item.hits.has(cell.number)}
                              title={item.hits.has(cell.number)
                                ? `${cell.number} — ${item.rang + 1}회 당첨 · 이 회차에는 ${cell.gap}회 대기 중이었습니다`
                                : null}
                              style="--tone: var({SECTION_VARS[sectionOf(cell.number)]})">
                          {cell.number}
                        </span>
                        <!-- Le taux du numéro, sous le numéro : il le suit
                             d'une colonne à l'autre, contrairement aux deux
                             taux de place. -->
                        {#if numbers}
                          {@const ns = numbers.numbers[cell.number - 1]}
                          <i class="nrate" class:over={ns.gap > 0}
                             title="{cell.number}번 : 과거 {num(numbers.seen)}회차 중 {num(ns.hit)}회 당첨"
                            >{pc(ns.rate)}</i>
                        {/if}
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/each}

    <p class="note dim">
      열 번호 = 그 번호가 마지막으로 나온 뒤 지난 회차 수. 「당첨」 열은 그 회차의
      7개 번호이며, 직전 회차에도 있었으면 이월로 표시됩니다.
      회차마다 열의 개수가 다른 것은 최대 간격이 다르기 때문입니다.
      45개 중 {num(45 - sample.count.won - sample.count.carried)}개가
      간격 열에 들어갑니다.
      {#if built.some((b) => b.next)}
        <br />
        <strong>밑줄 친 번호</strong>는 그 회차의 <strong>다음 회차</strong>에
        나온 번호입니다 — 예를 들어 1,237회 표에서는 1,238회 당첨번호에
        밑줄이 그어집니다. 이 표는 그 회차의 사진이고, 밑줄만이 다음 회차를
        가리킵니다. 밑줄이 어느 간격 열, 어느 라인에 떨어졌는지 보세요.
      {/if}
      {#if drawnCount !== built.length}
        <br />맨 위 <strong>다음 회차</strong>는 아직 추첨 전이라
        <strong>당첨 열이 비어 있습니다</strong> — 45개가 모두 간격 열에
        있습니다. 이것이 지금 기다리고 있는 상태입니다.
      {/if}
    </p>

    {#if cells}
      <p class="note dim">
        작은 회색 숫자는 이 회차가 아니라 <strong>전체 {num(cells.n)}회차</strong>의
        것이며, 세 가지가 서로 다릅니다.
        <br />
        <strong>열 밑의 당첨률</strong> = 그 <strong>간격</strong>의 칸들이 다음
        회차에 나온 비율. <strong>라인 옆의 숫자</strong> = 그
        <strong>자리</strong>의 비율. <strong>번호 밑의 숫자</strong> = 그
        <strong>번호</strong> 자신의 비율 — 이것만 번호를 따라 움직입니다.
        <br />
        표에는 45칸이 있고 다음 회차에 <strong>정확히 7칸</strong>이 나옵니다.
        그러니 세 숫자 모두 <strong>7 ÷ 45 = {pc(cells.expected)}%</strong> 근처에
        머뭅니다{#if numbers} (45개 번호 전체 검정 : χ² = {numbers.chi2.toFixed(1)} ·
        자유도 {numbers.df} · p = {numbers.p.toFixed(3)}){/if}.
        칸 수가 적은 오른쪽 끝과 아래쪽 라인은 크게 흔들리니 그대로 믿지 마세요.
      </p>
    {/if}
  {/if}
</section>

<style>
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
  /* Le 회차 à venir. Sans ce mot, sa colonne 당첨 vide passerait pour un
     bug plutôt que pour l'état d'attente qu'elle est. */
  .stack-rang.soon { color: var(--gold-deep); }
  .soonnote { font-size: 0.6875rem; color: var(--muted); margin-right: 0.5rem; }

  .stack-head .label { margin-right: 0.25rem; }
  /* Les sept du 회차 suivant, en tête de carte. */
  .nextlead {
    font-size: 0.6875rem; color: var(--gold-deep);
    margin-left: 0.5rem; margin-right: 0.15rem;
  }
  .nextnums { display: inline-flex; gap: 0.25rem; flex-wrap: wrap; }
  .nn {
    font-family: var(--figure); font-size: 0.6875rem; color: var(--tone);
    box-shadow: inset 0 -2px 0 var(--gold);
  }
  .nn.bonus { border-bottom: 1px dashed var(--gold); }
  .tag {
    font-size: 0.6875rem;
    color: var(--ink-soft);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0.1rem 0.35rem;
  }
  .tag b { color: var(--muted); font-weight: 500; margin-right: 0.15rem; }
  .tag.won { border-color: var(--gold); color: var(--gold); }
  .tag.won b { color: var(--gold); }

  table { font-size: 0.75rem; }
  th, td { padding: 0.15rem 0.2rem; text-align: center; }
  th:first-child, td:first-child { text-align: center; }
  th.win, td.win { border-right: 1px solid var(--line); padding-right: 0.5rem; }

  .ball {
    display: inline-block;
    min-width: 1.7rem;
    padding: 0.05rem 0.15rem;
    border-radius: var(--radius);
    font-family: var(--figure);
    color: var(--tone);
    border: 1px solid transparent;
  }
  /* Sorti ce 회차 : un filet, et le drapeau en exposant. Pas de fond rouge —
     le chiffre reste lisible et la couleur garde son sens de tranche. */
  .ball.flagged { border-color: var(--tone); min-width: 3.4rem; }
  .ball.flagged i { font-style: normal; font-size: 0.5625rem; color: var(--muted); margin-left: 0.15rem; }
  .ball.on { box-shadow: inset 0 0 0 1px var(--gold); border-color: var(--gold); font-weight: 700; }
  /* Coché : ce numéro est sorti au 회차 **suivant**. C'est la seule marque
     du tableau qui parle d'un autre tirage que le sien, d'où le trait plein
     sous le chiffre plutôt qu'un cadre — on doit la distinguer du 강조. */
  .ball.hit {
    box-shadow: inset 0 -2px 0 var(--gold);
    font-weight: 700;
  }
  .ball.on.hit { box-shadow: inset 0 0 0 1px var(--gold), inset 0 -2px 0 var(--gold); }

  /* Les trois taux d'historique. Ils ne parlent pas de ce 회차-ci : très
     petits, gris, et posés sous ce qu'ils décrivent. */
  thead tr.rate th {
    font-size: 0.5625rem; font-weight: 400; color: var(--muted);
    font-family: var(--figure);
    padding-top: 0; padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--line-soft);
  }
  thead tr.rate th:first-child { font-family: inherit; }
  .lrate, .nrate {
    display: block; font-style: normal;
    font-size: 0.5rem; line-height: 1.1; color: var(--muted);
    font-family: var(--figure);
  }
  .nrate.over { color: var(--gold-deep); }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
</style>
