<script>
  // L'onglet 연금복권 720+.
  //
  // L'ancien menu en faisait **vingt pages**, en trois groupes : 당첨번호 (13),
  // 보너스 (4), 당첨번호+보너스 (3). Ici, trois rangées de boutons et un
  // écran par page, comme pour 구간, 리스트, 테이블 et 차뜨.
  //
  // Le catalogue vit dans `core/pension-pages.js` ; ce fichier ne fait que
  // le rendre. Chaque page dit son `kind`, et chaque `kind` sait quels blocs
  // dessiner — les vingt pages tiennent donc en sept formes.
  import {
    acValue, carryover, compute, distribution, groupFrequency,
    positionFrequency,
  } from '@core/pension.js'
  import {
    DIGIT_WORDS, MULTIPLES, PENSION_GROUPS, digitFrequency, gaps, hitIntervals,
    pageWindows, pageWindowFrequency, pensionPage, repeatTokens, sourceDigits,
  } from '@core/pension-pages.js'

  import Bars from '../components/Bars.svelte'
  import FlowChart from '../components/FlowChart.svelte'
  import { day, num, rang as fmt } from '../lib/format.js'

  let { pension } = $props()

  let page = $state('base')
  const cur = $derived(pensionPage(page))
  const src = $derived(cur.source)

  const last = $derived(pension.n - 1)
  const m = $derived(compute(pension))
  const carry = $derived(carryover(pension))

  // ─────────────────────────────────────────────────── les blocs par forme

  const groups = $derived(groupFrequency(pension))
  const groupFlow = $derived(
    Array.from({ length: pension.n }, (_, i) => ({
      rang: pension.rangs[i], value: pension.groups[i],
    })))

  const digitTally = $derived(digitFrequency(pension, src))
  const perPlace = $derived(cur.kind === 'positions'
    ? positionFrequency(pension, { source: src }) : [])

  const winTally = $derived(cur.kind === 'windows'
    ? pageWindowFrequency(pension, cur.size, src) : {})
  const winRows = $derived(cur.kind === 'windows'
    ? pageWindows(pension, cur.size, src) : [])

  const rep = $derived(cur.kind === 'repeats' ? repeatTokens(pension, { source: src }) : null)
  const line = $derived(cur.kind === 'line' ? hitIntervals(pension, cur.place, { source: src }) : [])

  // Le compteur d'attente de chaque chiffre, à chaque tirage : c'est ce que
  // les tables `bokchk일`…`bokchk육` stockaient en texte, avec `-당첨` collé
  // le tirage où il tombait. Ici il se recalcule.
  const lineGaps = $derived(cur.kind === 'line' ? gaps(pension, { source: src }) : null)
  const gapAt = (i, d) => lineGaps[(i * 6 + cur.place) * 10 + d]

  // 총저고홀짝소합A이월 — les sept indicateurs, dans l'ordre de l'ancien.
  const INDICATORS = $derived(cur.kind === 'indicators' ? [
    { key: 'total', label: '총합 통계', data: distribution([...m.total]), suffix: '' },
    { key: 'lh', label: '저고 통계', data: tallyOf((i) => m.lowHigh(i)), suffix: '' },
    { key: 'oe', label: '홀짝 통계', data: tallyOf((i) => m.oddEven(i)), suffix: '' },
    { key: 'prime', label: '소수 통계', data: distribution([...m.primeCount]), suffix: '개' },
    { key: 'comp', label: '합성수 통계', data: distribution([...m.compositeCount]), suffix: '개' },
    { key: 'ac', label: 'AC 통계', data: distribution([...m.ac]), suffix: '' },
    { key: 'carry', label: '이월수 통계', data: distribution([...m.carryCount].slice(1)), suffix: '개' },
  ] : [])

  function tallyOf(read) {
    const out = {}
    for (let i = 0; i < pension.n; i++) {
      const k = read(i)
      out[k] = (out[k] ?? 0) + 1
    }
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]))
  }

  const multTally = $derived(cur.kind === 'multiples'
    ? MULTIPLES.map((k) => ({
        k, label: `${['', '', '이', '삼', '사', '오'][k]}의배수 통계`,
        data: distribution([...m.multipleCount[k]]),
      }))
    : [])

  // ────────────────────────────────────────────────────────── le tableau

  const STEP = 120
  let shown = $state(STEP)
  $effect(() => { page; shown = STEP })

  // Du plus récent au plus ancien, comme toutes les autres pages du site —
  // l'ancien laissait ses graphiques en ordre inverse du temps sans le dire.
  const rows = $derived.by(() => {
    const out = []
    for (let k = 0; k < shown && last - k >= 0; k++) out.push(last - k)
    return out
  })
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>{cur.label}</h2>
    <span class="gloss">{cur.groupLabel} · {num(pension.n)}회 · 최신 {fmt(pension.rangs[last])} ({day(pension.dates[last])})</span>
  </div>
</section>

<section class="panel picker">
  {#each PENSION_GROUPS as g (g.key)}
    <div class="prow">
      <span class="plabel">{g.label}</span>
      <div class="pbtns">
        {#each g.pages as pg (pg.key)}
          <button aria-pressed={page === pg.key}
                  onclick={() => (page = pg.key)}>{pg.label}</button>
        {/each}
      </div>
    </div>
  {/each}
</section>

{#if pension.n < 2}
  <section class="panel"><p class="dim">분석할 만한 회차가 없습니다.</p></section>

<!-- ───────────────────────────────────────────── 당첨번호 · 보너스 · 둘 다 -->
{:else if cur.kind === 'base'}
  {#if src === 'digits'}
    <section class="panel">
      <div class="head"><h2>복권 당첨번호 통계</h2><span class="gloss">조의 분포</span></div>
      <Bars data={groups} suffix="조" />
    </section>

    <section class="panel">
      <div class="head"><h2>복권 당첨번호 흐름</h2><span class="gloss">회차별 조</span></div>
      <FlowChart series={groupFlow} heat={false} legend={false}
                 label="조" gloss="회차별" unit="조" />
      <p class="note dim">
        옛 그래프는 <strong>최신 회차를 왼쪽</strong>에 두어 시간이 거꾸로
        흘렀습니다 — `order_by('-회차')`를 되돌리지 않았기 때문입니다.
        여기서는 왼쪽이 과거입니다.
      </p>
    </section>
  {:else}
    <section class="panel">
      <div class="head">
        <h2>복권 {src === 'both' ? '당첨번호+보너스' : '보너스'} 통계</h2>
        <span class="gloss">숫자 0–9 · 한 회차에 {src === 'both' ? 12 : 6}개</span>
      </div>
      <Bars data={digitTally} suffix="" />
      <p class="note dim">
        {#if src === 'both'}
          옛 페이지처럼 당첨번호 여섯과 보너스 여섯을 <strong>한 자루에</strong>
          넣어 셉니다 — 자리끼리 짝지은 것이 아닙니다.
        {:else}
          옛 그래프는 <strong>보너스 목록 전체</strong>를 하나의 값으로 세어
          높이 1짜리 막대가 회차 수만큼 나왔습니다. 여기서는 숫자를 셉니다.
        {/if}
      </p>
    </section>

    {#if src === 'both'}
      <section class="panel">
        <div class="head"><h2>복권 당첨번호 조 비율</h2><span class="gloss">조의 분포</span></div>
        <Bars data={groups} suffix="조" />
      </section>
    {/if}
  {/if}

<!-- ─────────────────────────────────────────────────────── 자리별 통계 -->
{:else if cur.kind === 'positions'}
  <section class="panel">
    <div class="head">
      <h2>복권 {src === 'bonus' ? '보너스' : '당첨번호'} 전체 통계</h2>
      <span class="gloss">여섯 자리를 한꺼번에</span>
    </div>
    <Bars data={digitTally} suffix="" />
  </section>

  <section class="panel six">
    {#each perPlace as counts, place (place)}
      <div class="sixth">
        <div class="head">
          <h2>{place + 1}번위치 통계</h2>
          <span class="gloss">그 자리의 숫자</span>
        </div>
        <Bars data={counts} suffix="" />
      </div>
    {/each}
  </section>

  {#if src === 'bonus'}
    <section class="panel">
      <p class="note dim tight">
        옛 보너스일 페이지는 이 <strong>여섯 블록을 그리지 못했습니다</strong> —
        가로대는 자리별 변수를 기다렸지만 뷰가 한 번도 채우지 않았습니다.
        패턴 표도 셀을 감싸지 않아 표 밖으로 흘렀습니다.
      </p>
    </section>
  {/if}

<!-- ───────────────────────────────────────────────── 두 자리 · 세 자리 -->
{:else if cur.kind === 'windows'}
  <section class="panel">
    <div class="head">
      <h2>복권 당첨번호 통계</h2>
      <span class="gloss">
        이웃한 {cur.size}자리 · 한 회차에 {(6 - cur.size + 1) * (src === 'both' ? 2 : 1)}개
      </span>
      <span class="right">{num(Object.keys(winTally).length)}가지</span>
    </div>
    <div class="scroll tall"><Bars data={winTally} suffix="" keyWidth="4rem" /></div>
    <p class="note dim">
      자리를 <strong>이웃끼리</strong> 붙인 창입니다 — 모든 짝이 아닙니다.
      {#if cur.size === 3}
        옛 페이지는 <strong>010</strong> 같은 앞 0 값을 자바스크립트 8진수로
        읽어 25로 바꿔 놓았습니다 — 범위 고르기가 엉뚱한 줄을 잡았습니다.
      {/if}
    </p>
  </section>

<!-- ───────────────────────────────────────────────────────── 배수 -->
{:else if cur.kind === 'multiples'}
  <section class="panel four">
    {#each multTally as t (t.k)}
      <div class="quarter">
        <div class="head">
          <h2>복권 당첨번호 {t.label}</h2>
          <span class="gloss">여섯 중 몇 개</span>
        </div>
        <Bars data={t.data} suffix="개" />
      </div>
    {/each}
  </section>
  <section class="panel">
    <p class="note dim tight">
      <strong>0은 세지 않습니다.</strong> 0은 2·3·4·5의 배수를 모두 만족해
      옛 계산에서는 네 가족에 동시에 들어가면서 합에는 아무것도 더하지
      않았습니다 — 개수만 부풀렸습니다.
    </p>
  </section>

<!-- ───────────────────────────── 총합 · 저고 · 홀짝 · 소수 · 합성수 · AC · 이월 -->
{:else if cur.kind === 'indicators'}
  <section class="panel four">
    {#each INDICATORS as b (b.key)}
      <div class="quarter">
        <div class="head">
          <h2>복권 당첨번호 {b.label}</h2>
        </div>
        <div class="scroll cap"><Bars data={b.data} suffix={b.suffix} /></div>
      </div>
    {/each}
  </section>
  <section class="panel">
    <p class="note dim tight">
      <strong>저고</strong>는 0–4 대 5–9입니다. 옛 코드는 비율을 <code>&lt; 4</code>로
      세면서 목록은 <code>≤ 4</code>로 만들어, 4가 든 회차마다 두 값이
      어긋났습니다.
      <br />
      <strong>소수</strong>는 2·3·5·7, <strong>합성수</strong>는 4·6·8·9 —
      0과 1은 어느 쪽도 아니므로 둘을 더해도 여섯이 되지 않습니다.
    </p>
  </section>

<!-- ─────────────────────────────────────────────────────── 반복수 -->
{:else if cur.kind === 'repeats'}
  <section class="panel">
    <div class="head">
      <h2>복권 당첨번호 전체 반복수 통계</h2>
      <span class="gloss">한 회차 안에서 되풀이된 숫자</span>
      <span class="right">겹침 없는 회차 {num(rep.clean)}회</span>
    </div>
    <div class="scroll tall"><Bars data={rep.tally} suffix="" keyWidth="4rem" /></div>
    <p class="note dim">
      <strong>5:2</strong>는 « 숫자 5가 한 회차에 두 번 나왔다 »는 뜻입니다.
      옛 표는 2·3·4번 겹침만 칠할 줄 알아, 다섯 번 이상 겹치면 칸을 아예 쓰지
      않고 그 줄이 한 칸 모자란 채로 그려졌습니다.
    </p>
  </section>

<!-- ─────────────────────────────────────────────── 라인일 … 라인육 -->
{:else if cur.kind === 'line'}
  <section class="panel">
    <div class="head">
      <h2>{cur.label}</h2>
      <span class="gloss">{cur.place + 1}번째 자리 · 숫자마다 기다린 회차</span>
    </div>
    <p class="note dim tight">
      숫자가 이 자리에 나올 때, <strong>지난번 이 자리에 나온 뒤로 몇 회가
      지났는지</strong>. 그 기다림의 분포입니다 — 빈도가 아닙니다.
    </p>
  </section>

  <section class="panel five">
    {#each line as e (e.digit)}
      <div class="fifth">
        <div class="head">
          <h2>복권 당첨번호 {DIGIT_WORDS[e.digit]} 통계</h2>
          <span class="gloss">
            {e.digit} · {num(e.hits)}회 · 평균 {e.mean.toFixed(1)} · 지금 {num(e.since)}회째
          </span>
        </div>
        <div class="scroll cap"><Bars data={e.counts} suffix="회" /></div>
      </div>
    {/each}
  </section>
{/if}

<!-- ─────────────────────────────────────────────────────── 패턴, partout -->
{#if pension.n >= 2}
  <section class="panel">
    <div class="head">
      <h2>복권 {cur.label} 패턴</h2>
      <span class="gloss">회차별</span>
      <span class="right">{num(pension.n)}회</span>
    </div>

    <div class="scroll tablebox">
      <table>
        <thead>
          <tr>
            <th>회차</th>
            {#if cur.kind === 'base' && src === 'digits'}
              <th>조</th><th>당첨번호</th>
            {:else if cur.kind === 'base' && src === 'both'}
              <th>조</th><th>당첨번호</th><th>보너스</th>
            {:else if cur.kind === 'base'}
              <th>보너스</th>
            {:else if cur.kind === 'positions'}
              {#each ['일', '이', '삼', '사', '오', '육'] as w (w)}<th class="v">{w}</th>{/each}
            {:else if cur.kind === 'windows'}
              {#each winRows[0] as _, k (k)}<th class="v">{k + 1}</th>{/each}
            {:else if cur.kind === 'multiples'}
              {#each MULTIPLES as k (k)}
                <th>{['', '', '이', '삼', '사', '오'][k]}의배수</th>
                <th class="v">숫자수</th><th class="v">합</th>
              {/each}
            {:else if cur.kind === 'indicators'}
              <th>당첨번호</th><th class="v">총합</th><th>저고</th><th>저번호</th>
              <th>고번호</th><th>홀짝</th><th>소수</th><th class="v">소수합</th>
              <th>합성수</th><th class="v">합성수합</th><th class="v">AC</th>
              <th>이월번호</th><th class="v">이월합</th><th>이월위치</th>
            {:else if cur.kind === 'repeats'}
              {#each ['일', '이', '삼', '사', '오', '육'] as w (w)}<th class="v">{w}</th>{/each}
              <th>반복</th>
            {:else if cur.kind === 'line'}
              {#each Array(10) as _, d (d)}<th class="v">{d}</th>{/each}
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each rows as i (i)}
            {@const digits = sourceDigits(pension, i, src)}
            <tr>
              <td class="val">{fmt(pension.rangs[i])}</td>

              {#if cur.kind === 'base'}
                {#if src !== 'bonus'}<td class="val g">{pension.groups[i]}조</td>{/if}
                {#if src !== 'bonus'}
                  <td><span class="row">{#each pension.digitsAt(i) as d, k (k)}<b>{d}</b>{/each}</span></td>
                {/if}
                {#if src !== 'digits'}
                  <td><span class="row">{#each pension.bonusAt(i) as d, k (k)}<b class="bo">{d}</b>{/each}</span></td>
                {/if}

              {:else if cur.kind === 'positions'}
                {#each digits as d, k (k)}<td class="val">{d}</td>{/each}

              {:else if cur.kind === 'windows'}
                {#each winRows[i] as w, k (k)}<td class="val w">{w}</td>{/each}

              {:else if cur.kind === 'multiples'}
                {#each MULTIPLES as k (k)}
                  <td class="lst">{[...pension.digitsAt(i)].filter((d) => d > 0 && d % k === 0).join(' ') || '·'}</td>
                  <td class="val">{m.multipleCount[k][i]}</td>
                  <td class="val s">{m.multipleSum[k][i]}</td>
                {/each}

              {:else if cur.kind === 'indicators'}
                <td><span class="row">{#each pension.digitsAt(i) as d, k (k)}<b>{d}</b>{/each}</span></td>
                <td class="val s">{m.total[i]}</td>
                <td class="val">{m.lowHigh(i)}</td>
                <td class="lst">{[...pension.digitsAt(i)].filter((d) => d <= 4).join(' ') || '·'}</td>
                <td class="lst">{[...pension.digitsAt(i)].filter((d) => d > 4).join(' ') || '·'}</td>
                <td class="val">{m.oddEven(i)}</td>
                <td class="lst">{[...pension.digitsAt(i)].filter((d) => [2, 3, 5, 7].includes(d)).join(' ') || '·'}</td>
                <td class="val s">{m.primeSum[i]}</td>
                <td class="lst">{[...pension.digitsAt(i)].filter((d) => [4, 6, 8, 9].includes(d)).join(' ') || '·'}</td>
                <td class="val s">{m.compositeSum[i]}</td>
                <td class="val">{m.ac[i]}</td>
                <td class="lst">{carry.values[i]?.join(' ') || '·'}</td>
                <td class="val s">{m.carrySum[i]}</td>
                <td class="lst">{carry.positions[i]?.join(' ') || '·'}</td>

              {:else if cur.kind === 'repeats'}
                {@const seen = digits.reduce((a, d) => (a[d] = (a[d] ?? 0) + 1, a), {})}
                {#each digits as d, k (k)}
                  <td class="val" class:r2={seen[d] === 2} class:r3={seen[d] === 3}
                      class:r4={seen[d] >= 4}>{d}</td>
                {/each}
                <td class="lst">{rep.perDraw[i].map((t) => t.token).join(' ') || '·'}</td>

              {:else if cur.kind === 'line'}
                {@const hit = pension.sourceAt(i, src)[cur.place]}
                {#each Array(10) as _, d (d)}
                  <td class="val" class:hit={d === hit}>
                    {#if d === hit}<b class="wn">당첨</b>{:else}{gapAt(i, d)}{/if}
                  </td>
                {/each}
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if shown < pension.n}
      <div class="more">
        <button onclick={() => (shown += STEP)}>
          더 보기 <span class="dim">{num(shown)} / {num(pension.n)}</span>
        </button>
        <button class="all" onclick={() => (shown = pension.n)}>전부</button>
      </div>
    {/if}
  </section>

  <section class="panel">
    <p class="note dim tight">
      옛 스무 페이지 가운데 <strong>여덟 곳</strong>의 범위 고르기가
      작동하지 않았습니다 — 가로대가 뷰에 없는 변수를 기다렸기 때문입니다.
      그래프도 <strong>열한 블록</strong>이 그려지지 않았습니다.
      여기서는 모두 살아 있습니다.
      <br />
      메뉴의 <strong>당첨번호+보너스 › 일</strong>은 옮기지 않았습니다 — 그
      링크는 사이드바에서 <strong>주석 처리</strong>되어 있었고, 연금복권이
      아니라 로또 6/45의 페이지를 가리켰습니다.
    </p>
  </section>
{/if}

<style>
  .bar { padding-top: 0.85rem; padding-bottom: 0.85rem; }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .picker { display: grid; gap: 0.55rem; }
  .prow { display: grid; grid-template-columns: 8rem 1fr; gap: 0.75rem; align-items: start; }
  .plabel { color: var(--muted); font-size: 0.75rem; padding-top: 0.3rem; }
  .pbtns { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .pbtns button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }

  .four, .five, .six {
    display: grid; gap: 1.3rem 2rem;
  }
  .four { grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); }
  .five { grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
  .six { grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
  .quarter, .fifth, .sixth { min-width: 0; }
  .quarter h2, .fifth h2, .sixth h2 { font-size: 0.9375rem; }

  .cap { max-height: 14rem; overflow-y: auto; }
  .tall { max-height: 26rem; overflow-y: auto; }
  .tablebox { max-height: 30rem; overflow: auto; }

  table { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  th, td { padding: 0.22rem 0.5rem; text-align: left; white-space: nowrap; }
  th {
    position: sticky; top: 0; background: var(--surface); z-index: 1;
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  th.v, td.val { text-align: right; }
  td { border-bottom: 1px solid var(--line-soft); }
  .val { font-family: var(--figure); }
  .val.s { color: var(--gold-deep); }
  .val.g { color: var(--t-dead-text); }
  .val.w { color: var(--ink); }
  .lst { font-family: var(--figure); color: var(--muted); font-size: 0.75rem; }

  .row { display: inline-flex; gap: 0.25rem; }
  .row b {
    font-family: var(--figure); font-weight: 400;
    min-width: 1.1rem; text-align: center;
  }
  .row b.bo { color: var(--t-dead-text); }

  /* Les répétitions à l'intérieur d'un tirage. L'ancien peignait en jaune,
     rouge et bleu ; ici trois intensités d'or, et la quatrième existe. */
  td.r2 { background: color-mix(in srgb, var(--gold-soft) 55%, var(--surface)); }
  td.r3 { background: var(--gold-soft); }
  td.r4 { background: var(--gold); color: #fff; }
  td.hit { background: var(--gold-soft); color: var(--gold-deep); }
  .wn { font-weight: 600; font-size: 0.6875rem; }

  .more { display: flex; gap: 0.35rem; margin-top: 0.6rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }
  .more .all { border-color: var(--gold); color: var(--gold); }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.7; }
  .note.tight { margin-top: 0; }
  .note strong { color: var(--ink); font-weight: 600; }
  .note code {
    font-family: var(--figure); font-size: 0.6875rem;
    background: var(--line-soft); border-radius: 0.2rem; padding: 0 0.25rem;
  }
</style>
