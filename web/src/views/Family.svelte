<script>
  // 패밀리 — l'historique, découpé par situation.
  //
  // Le 차가운번호/뜨거운번호 montre les mêmes blocs sur TOUS les 회차. Ici on
  // choisit d'abord une famille — « aucun 이월 », « trois pairs trois
  // impairs », « les six venaient du chaud » — et tout se recalcule sur ces
  // 회차-là.
  //
  // Chaque chiffre arrive avec son attendu, et l'attendu tient compte de ce
  // que la famille impose : dans « 홀 3 : 짝 3 » les impairs ne peuvent pas
  // recevoir la même part que les pairs, et le comparer à l'uniforme ferait
  // crier l'anomalie à chaque fois. C'est `core/family.js` qui s'en charge.
  import {
    BASE_RATE, FAMILY_DIMENSIONS, classifyDraws, familyList, familyMembers,
    familyNext, familyStats,
  } from '@core/family.js'
  import { allCells, boardColumns } from '@core/tablelist.js'
  import Compare from '../components/Compare.svelte'
  import { num, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'

  let { draws } = $props()

  let dim = $state('carry')
  let value = $state(null)
  let shown = $state(60)

  // Les 45 cases de chaque 회차, une seule fois — le classement s'en sert
  // pour lire la température, et rien d'autre n'en a besoin ici.
  const cells = $derived(allCells(draws))

  const rows = $derived.by(() => {
    // Les lignes qu'occupaient, sur le tableau de la semaine d'avant, les
    // six numéros de CE 회차. Surtout pas ceux du suivant : ce serait lire le
    // futur, et la dimension 패턴 deviendrait circulaire.
    const linesOf = (i) => {
      if (i < 1) return new Set()
      const { columns } = boardColumns(cells[i - 1], draws.fullAt(i))
      const out = new Set()
      for (const col of columns) {
        col.entries.forEach((e, line) => { if (e.hit) out.add(line) })
      }
      return out
    }
    return classifyDraws(draws, cells, linesOf)
  })

  const families = $derived(familyList(rows, dim))
  const current = $derived(value && families.some((f) => f.value === value)
    ? value
    : (families[0]?.value ?? null))

  const members = $derived(current ? familyMembers(rows, dim, current) : [])
  const stats = $derived(members.length ? familyStats(members, rows, cells, dim) : null)
  const next = $derived(members.length ? familyNext(members, rows, rows) : null)
  const spec = $derived(FAMILY_DIMENSIONS.find((d) => d.key === dim))

  function pickDim(key) { dim = key; value = null; shown = 60 }
  function pickFamily(v) { value = v; shown = 60 }

  const pc = (v, d = 1) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`)
  const f2 = (v) => (v === null || v === undefined ? '—' : v.toFixed(2))

  const BAND = {
    hot: { label: '뜨거운', tone: '--t-hot', text: '--t-hot-text' },
    midle: { label: '중간', tone: '--t-mid', text: '--t-mid-text' },
    cold: { label: '차가운', tone: '--t-cold', text: '--t-cold-text' },
    dead: { label: '사망', tone: '--t-dead', text: '--t-dead-text' },
  }

  const LIST_LABEL = {
    odd: '홀수 개수', low: `저수 개수 (1–22)`, small: '9 이하 개수', primes: '소수 개수',
  }

  // Les 45 numéros, dans l'ordre naturel — pas par fréquence. Un tableau de
  // numéros trié par fréquence invite à lire le premier comme « le bon ».
  const grid = $derived.by(() => {
    if (!stats) return []
    const by = new Map(stats.numbers.rows.map((r) => [r.number, r]))
    return Array.from({ length: 45 }, (_, k) => by.get(k + 1))
  })

  // Les mêmes chiffres que la planche, en barres : 45 numéros, 4 bandes, et
  // les 45 du 회차 suivant contre l'uniforme.
  const numberRows = $derived(grid.map((r) => ({ key: r.number, obs: r.count, exp: r.expected })))
  const bandRows = $derived(stats
    ? stats.bands.map((b) => ({ key: BAND[b.name].label, obs: b.drawn, exp: b.expected }))
    : [])
  const nextRows = $derived(next
    ? next.numbers.map((c, k) => ({ key: k + 1, obs: c, exp: next.flat }))
    : [])

  // L'écart d'un numéro, ramené entre 0 et 1 pour l'intensité du fond.
  const heat = (r) => {
    if (!r || !r.expected) return 0
    return Math.min(1, Math.abs(r.count - r.expected) / Math.max(3, Math.sqrt(r.expected) * 2.5))
  }
</script>

<section class="panel">
  <div class="head">
    <h2>패밀리</h2>
    <span class="gloss">회차를 상황별로 나눠서 보기</span>
    <span class="right">{num(rows.length)}회차 분류됨</span>
  </div>

  <p class="lede">
    같은 화면을 <strong>전체</strong>가 아니라 <strong>한 가족</strong>에만
    적용합니다. 아래에서 기준을 고르고, 그 안에서 가족을 고르세요.
    모든 숫자 옆에는 그 가족에서의 <strong>기대치</strong>가 함께 나옵니다 —
    가족이 강제하는 몫까지 계산에 넣은 기대치입니다.
  </p>

  <div class="chips" role="group" aria-label="분류 기준">
    {#each FAMILY_DIMENSIONS as d (d.key)}
      <button class:on={dim === d.key} onclick={() => pickDim(d.key)} title={d.gloss}>
        {d.label}
      </button>
    {/each}
  </div>
  <p class="gloss-line dim">{spec?.gloss ?? ''}</p>

  <div class="fams">
    {#each families as f (f.value)}
      <button class="fam" class:on={current === f.value} onclick={() => pickFamily(f.value)}>
        <b>{f.value}</b>
        <span class="cnt">{num(f.n)}회차</span>
        <span class="shr dim">{pc(f.share)}</span>
        <span class="rail"><i style={`width:${f.share * 100}%`}></i></span>
      </button>
    {/each}
  </div>
</section>

{#if !stats}
  <section class="panel"><p class="dim">이 가족에는 회차가 없습니다.</p></section>
{:else}
  <section class="panel">
    <div class="head">
      <h2>{spec.label} · {current}</h2>
      <span class="gloss">{num(stats.n)}회차 · 전체의 {pc(stats.share)}</span>
      <span class="right">번호 χ² p = {stats.numbers.chi.p.toFixed(3)}</span>
    </div>

    <div class="facts">
      <div class="fact">
        <span class="k">회차</span>
        <b class="figure">{num(stats.n)}</b>
        <span class="dim small">전체 {num(rows.length)}</span>
      </div>
      <div class="fact">
        <span class="k">총합 평균</span>
        <b class="figure">{f2(stats.sum.here)}</b>
        <span class="dim small">전체 {f2(stats.sum.all)}</span>
      </div>
      <div class="fact">
        <span class="k">이월 평균</span>
        <b class="figure">{f2(stats.carry.here)}</b>
        <span class="dim small">전체 {f2(stats.carry.all)}</span>
      </div>
      <div class="fact">
        <span class="k">반복 라인 평균</span>
        <b class="figure">{f2(stats.repeat.here)}</b>
        <span class="dim small">전체 {f2(stats.repeat.all)}</span>
      </div>
    </div>

    <p class="note dim">
      χ²는 45개 번호가 이 가족 안에서 <strong>고르게</strong> 나왔는지를
      한 번에 검정합니다. p가 크면 고르다는 뜻입니다 — 어떤 번호가 제일 많이
      나왔는지는 늘 하나 있게 마련이고, 그것만으로는 아무 의미가 없습니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>번호별 출현</h2>
      <span class="gloss">관측 · 기대 (가족의 제약을 반영)</span>
      <span class="right">기대 평균 {f2(stats.numbers.flat)}</span>
    </div>

    <div class="board">
      {#each grid as r (r.number)}
        <div class="cell" class:over={r.count > r.expected} class:under={r.count < r.expected}
             style={`--heat:${heat(r)}; --tone: var(${SECTION_VARS[sectionOf(r.number)]})`}
             title={`${r.number}번 — 관측 ${r.count}회 · 기대 ${r.expected.toFixed(1)}회`}>
          <span class="nn">{r.number}</span>
          <span class="cc">{r.count}</span>
          <span class="ee dim">{r.expected.toFixed(1)}</span>
        </div>
      {/each}
    </div>

    <p class="note dim">
      위 숫자가 <strong>관측</strong>, 아래 작은 숫자가 <strong>기대</strong>입니다.
      배경이 진할수록 둘의 차이가 큽니다 — 금색은 많이 나온 쪽, 회청색은 적게
      나온 쪽. 낱개의 차이는 거의 언제나 우연입니다. 전체가 고른지는 위의 χ²가
      말해 줍니다.
    </p>

    <div class="block">
      <Compare rows={numberRows} showTotal={false} keyWidth="2.5rem" suffix="번"
               obsLabel="관측" expLabel="기대 (가족 제약 반영)" />
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>온도</h2>
      <span class="gloss">여섯 번호가 어느 바닥에서 왔나</span>
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr><th>바닥</th><th class="v">나온 수</th><th class="v">기대</th><th class="v">비</th><th>—</th></tr>
        </thead>
        <tbody>
          {#each stats.bands as b (b.name)}
            <tr>
              <td><b style={`color: var(${BAND[b.name].text})`}>{BAND[b.name].label}</b></td>
              <td class="val">{num(b.drawn)}</td>
              <td class="val dim">{b.expected.toFixed(1)}</td>
              <td class="val">{f2(b.lift)}</td>
              <td>
                <span class="mix">
                  <i style={`width:${Math.min(100, (b.lift ?? 0) * 50)}%; background: var(${BAND[b.name].tone})`}></i>
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="block">
      <Compare rows={bandRows} showTotal={false} keyWidth="3.5rem"
               obsLabel="나온 수" expLabel="기대 (바닥 크기 반영)" />
    </div>

    <p class="note dim">
      비가 1이면 그 바닥은 정확히 제 몫만큼 냈다는 뜻입니다. 기대치는 그
      회차에 그 바닥에 <strong>몇 개의 번호가 있었는지</strong>로 계산합니다 —
      바닥 크기는 회차마다 달라지기 때문입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>리스트</h2>
      <span class="gloss">관측 · 기대 (초기하분포)</span>
    </div>

    <div class="grid two">
      {#each ['odd', 'low', 'small', 'primes'] as key (key)}
        <div class="listbox">
          <h3>{LIST_LABEL[key]}</h3>
          {#each stats.lists[key] as row (row.k)}
            {#if row.count || row.expected >= 0.5}
              <div class="lrow">
                <span class="lk">{row.k}개</span>
                <span class="track">
                  <i class="obs" style={`width:${Math.min(100, row.share * 100 * 2)}%`}></i>
                  <i class="exp" style={`width:${Math.min(100, row.expected / stats.n * 100 * 2)}%`}></i>
                </span>
                <span class="lv">{num(row.count)}</span>
                <span class="lv dim">{row.expected.toFixed(1)}</span>
              </div>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </section>

  {#if next}
    <section class="panel edge">
      <div class="head">
        <h2>다음 회차</h2>
        <span class="gloss">이 가족 바로 뒤에 온 {num(next.n)}회차</span>
        <span class="right">번호 χ² p = {next.chi.p.toFixed(3)}</span>
      </div>

      <div class="scroll">
        <table>
          <thead>
            <tr><th>지표</th><th class="v">이 가족 다음</th><th class="v">전체 평균</th><th class="v">차이</th></tr>
          </thead>
          <tbody>
            {#each [['이월', next.carry], ['반복 라인', next.repeat], ['총합', next.sum],
                    ['홀수 개수', next.odd], ['저수 개수', next.low], ['9 이하 개수', next.small]] as [label, m] (label)}
              <tr>
                <td>{label}</td>
                <td class="val">{f2(m.here)}</td>
                <td class="val dim">{f2(m.all)}</td>
                <td class="val" class:up={m.here > m.all} class:down={m.here < m.all}>
                  {m.here > m.all ? '+' : ''}{f2(m.here - m.all)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="block">
        <Compare rows={nextRows} showTotal={false} keyWidth="2.5rem" suffix="번"
                 obsLabel="다음 회차 출현" expLabel="기대 (균등)" />
      </div>

      <p class="note dim">
        이 표만이 <strong>앞을 봅니다</strong> — 그래서 이 화면에서 유일하게
        속일 수 있는 표입니다. 여기서 기대치는 다시 균등입니다: 가족은 직전
        회차를 설명할 뿐, 다음 회차에 아무것도 강제하지 않습니다. 그것이
        바로 검정하는 대상입니다. p가 크면 다음 회차는 평범했다는 뜻입니다.
      </p>
    </section>
  {/if}

  <section class="panel">
    <div class="head">
      <h2>회차 목록</h2>
      <span class="gloss">{spec.label} · {current}</span>
      <span class="right">{num(members.length)}회차</span>
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>회차</th><th>당첨번호</th><th class="v">총합</th>
            <th class="v">이월</th><th class="v">라인</th>
            <th class="v">홀짝</th><th class="v">저고</th>
            <th>온도 (뜨·중·차·사)</th>
          </tr>
        </thead>
        <tbody>
          {#each members.slice(-shown).reverse() as r (r.rang)}
            <tr>
              <td><b>{fmt(r.rang)}</b></td>
              <td>
                <span class="balls">
                  {#each r.numbers as n (n)}
                    <span class="ball" style={`--tone: var(${SECTION_VARS[sectionOf(n)]})`}>{n}</span>
                  {/each}
                </span>
              </td>
              <td class="val">{r.sum}</td>
              <td class="val">{r.carry}</td>
              <td class="val">{r.repeat}</td>
              <td class="val dim">{r.odd}:{6 - r.odd}</td>
              <td class="val dim">{r.low}:{6 - r.low}</td>
              <td class="val dim">{r.temp.hot}·{r.temp.midle}·{r.temp.cold}·{r.temp.dead}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if shown < members.length}
      <div class="more">
        <button onclick={() => (shown += 120)}>더 보기</button>
        <button onclick={() => (shown = members.length)}>전부 ({num(members.length)})</button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .block { margin-top: 1rem; }
  .lede { margin: 0 0 1.1rem; color: var(--ink-soft); max-width: 66ch; }
  .lede strong { color: var(--ink); font-weight: 600; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 76ch; }
  .note strong { color: var(--ink); font-weight: 600; }
  .small { font-size: 0.75rem; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chips button { border-radius: 999px; padding: 0.3rem 0.9rem; font-size: 0.8125rem; }
  .chips button.on {
    background: var(--gold); border-color: var(--gold);
    color: var(--surface); font-weight: 600;
  }
  .gloss-line { margin: 0.5rem 0 1.1rem; font-size: 0.8125rem; }

  /* Les familles : chaque bouton porte son effectif et sa part. On voit d'un
     coup d'œil laquelle a assez de 회차 pour qu'on puisse en dire quelque
     chose — une famille de vingt 회차 ne dira jamais rien. */
  .fams { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.5rem; }
  .fam {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.15rem 0.5rem;
    text-align: left;
    padding: 0.55rem 0.75rem 0.7rem;
    align-items: baseline;
  }
  .fam b { font-size: 0.875rem; font-weight: 600; }
  .fam .cnt { font-size: 0.75rem; color: var(--ink-soft); text-align: right; }
  .fam .shr { font-size: 0.6875rem; grid-column: 1 / -1; }
  .fam .rail {
    grid-column: 1 / -1; height: 3px; background: var(--line-soft);
    border-radius: 2px; overflow: hidden; margin-top: 0.2rem;
  }
  .fam .rail i { display: block; height: 100%; background: var(--gold); }
  .fam.on { border-color: var(--gold); background: var(--gold-wash); }
  .fam.on b { color: var(--gold-deep); }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 1rem 1.5rem;
  }
  .fact { display: flex; flex-direction: column; gap: 0.15rem; }
  .fact .k {
    font-size: 0.6875rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--muted);
  }

  /* Les 45 numéros dans l'ordre naturel. Les trier par fréquence ferait lire
     le premier comme « le bon » — c'est exactement ce qu'il ne faut pas. */
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(2.6rem, 1fr));
    gap: 3px;
  }
  .cell {
    display: grid;
    justify-items: center;
    gap: 1px;
    padding: 0.3rem 0.15rem 0.35rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    position: relative;
  }
  .cell::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
    opacity: calc(var(--heat) * 0.22);
    pointer-events: none;
  }
  .cell.over::before { background: var(--gold); }
  .cell.under::before { background: var(--t-dead); }
  .nn { font-size: 0.625rem; color: var(--tone); font-weight: 600; }
  .cc { font-family: var(--figure); font-size: 0.9375rem; line-height: 1.1; }
  .ee { font-size: 0.5625rem; }

  th.v, td.val { text-align: right; }
  td.up { color: var(--gold-deep); }
  td.down { color: var(--t-dead-text); }

  .mix { display: block; height: 0.5rem; min-width: 5rem; background: var(--line-soft); border-radius: 2px; }
  .mix i { display: block; height: 100%; border-radius: 2px; }

  .listbox h3 { font-size: 0.8125rem; margin: 0 0 0.5rem; color: var(--ink-soft); }
  .lrow {
    display: grid;
    grid-template-columns: 2.6rem 1fr 2.6rem 2.6rem;
    align-items: center; gap: 0.5rem;
    font-size: 0.75rem;
  }
  .lk { color: var(--muted); }
  .track { position: relative; height: 0.9rem; }
  .track i { position: absolute; left: 0; height: 0.35rem; border-radius: 2px; }
  .track .obs { top: 0; background: var(--gold); }
  .track .exp { top: 0.45rem; background: var(--line); }
  .lv { text-align: right; font-family: var(--figure); }

  .balls { display: inline-flex; gap: 0.2rem; }
  .ball {
    width: 1.5rem; height: 1.5rem;
    display: inline-grid; place-items: center;
    border-radius: 999px;
    border: 1px solid var(--tone);
    color: var(--tone);
    font-size: 0.6875rem; font-weight: 600;
  }

  .edge { border-color: var(--gold-soft); }
  .more { display: flex; gap: 0.35rem; margin-top: 0.7rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }
</style>
