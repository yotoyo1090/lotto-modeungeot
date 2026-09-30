<script>
  // L'onglet 필터.
  //
  // L'ancien site en faisait **vingt et une pages** : trois groupes
  // (보너스포함 · 1등 · 2등) × sept écrans chacun ou presque, toutes bâties
  // sur le même moule — un comptage, une suite dans le temps, un tableau
  // filtrable par intervalle. Elles ne différaient que par les numéros
  // regardés et par l'indicateur calculé.
  //
  // Ici : deux rangées de boutons, et les trois blocs suivent. Passer de
  // 총합 à AC값 ou de 1등 à 2등 ne recharge rien — c'est le même calcul
  // paramétré, dans `core/filters.js`.
  //
  // Le groupe 1등 en comptait neuf, pas six : trois pages de plus, qui ne
  // rentraient dans aucun moule commun — 배수분석, 10회차1등, 홀짝저고AC.
  // Elles s'ouvrent depuis la même rangée de boutons, à la suite des six,
  // exactement là où l'ancien menu les rangeait ; leurs règles sont dans
  // `core/first.js`.
  import { INDICATORS, POPULATIONS, filterSeries } from '@core/filters.js'
  import {
    FIRST_VIEWS, multipleSeries, paritySeries, recentSeries, RECENT_SPAN,
  } from '@core/first.js'

  import Bars from '../components/Bars.svelte'
  import Compare from '../components/Compare.svelte'
  import FlowChart from '../components/FlowChart.svelte'
  import Scope from '../components/Scope.svelte'
  import { num, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'
  import { scoped } from '../lib/scope.js'

  let { draws, base = draws } = $props()

  const first = $derived(base.rangs[0])
  const last = $derived(base.rangs[base.n - 1])

  let population = $state('bonus')
  let indicator = $state('total')

  const pop = $derived(POPULATIONS.find((p) => p.key === population))
  const ind = $derived(INDICATORS.find((i) => i.key === indicator))

  // `null` = un des six indicateurs ; sinon la clé d'une des trois pages
  // propres au 1등.
  let view = $state(null)
  const special = $derived(view ? FIRST_VIEWS.find((v) => v.key === view) : null)

  // Elles n'existent que pour le 1등 : quitter cette population les referme,
  // sinon on lirait « 배수분석 » au-dessus des chiffres du 2등.
  $effect(() => {
    if (population !== 'first') view = null
  })

  // Une période par bloc, comme dans 흐름 · 차뜨 et 당첨 위치.
  let statSpan = $state('follow')
  let chartSpan = $state('follow')
  let tableSpan = $state('follow')

  const statDraws = $derived(scoped(base, draws, statSpan))
  const chartDraws = $derived(scoped(base, draws, chartSpan))
  const tableDraws = $derived(scoped(base, draws, tableSpan))

  // `base` : les 이월 cherchent le 회차 précédent dans tout l'historique.
  const stat = $derived(view ? null : filterSeries(statDraws, population, indicator, base))

  // 관측 contre la loi : toutes les valeurs que l'un ou l'autre touche, dans
  // l'ordre numérique — une valeur attendue 0,3 fois et jamais vue garde sa
  // ligne, sinon la courbe du hasard aurait des trous.
  const statRows = $derived.by(() => {
    if (!stat) return []
    const keys = new Set([...Object.keys(stat.counts), ...Object.keys(stat.expected)])
    const order = (k) => Number(String(k).split(' ')[0])
    return [...keys].sort((a, b) => order(a) - order(b))
      .map((key) => ({ key, obs: stat.counts[key] ?? 0, exp: stat.expected[key] ?? 0 }))
      .filter((r) => r.obs > 0 || r.exp >= 0.5)
  })
  const latestLabel = $derived(stat?.series[0]?.label ?? null)
  const chart = $derived(view ? null : filterSeries(chartDraws, population, indicator, base))
  const table = $derived(view ? null : filterSeries(tableDraws, population, indicator, base))

  // Les trois pages du 1등. Deux calculs chacune — l'histogramme et le
  // tableau ont leur propre période, comme partout ailleurs.
  //
  // 10회차1등 reçoit `base` en plus : la liste d'un 회차 est faite des
  // quatorze qui le précèdent, et sur une tranche ces quatorze-là sont
  // souvent hors tranche.
  const build = (key, d) => (
    key === 'multiples' ? multipleSeries(d)
      : key === 'recent' ? recentSeries(base, d)
        : key === 'parity' ? paritySeries(d)
          : null)

  const upper = $derived(build(view, statDraws))

  // 10회차1등의 요약 문장 — 고정 문구가 아니라, 고른 기간에서 센 값.
  const recentFacts = $derived.by(() => {
    if (view !== 'recent' || !upper?.rows.length) return null
    const won = upper.rows.map((r) => r.wonCount)
    const tally = new Map()
    for (const w of won) tally.set(w, (tally.get(w) ?? 0) + 1)
    const [mode, top] = [...tally].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    return { mode, modeShare: ((100 * top) / won.length).toFixed(1), min: Math.min(...won) }
  })
  const lower = $derived(build(view, tableDraws))

  // 배수분석 rangeait son tableau par 회차 croissant — le seul des trois. Il
  // se lit ici du plus récent au plus ancien comme les autres : avec un
  // tableau qui se dévoile par tranches, commencer par 회차 1 montrerait
  // quatre cents lignes que personne ne cherche.
  const specialRows = $derived(
    view === 'multiples' ? [...lower.rows].reverse() : (lower?.rows ?? []))

  // L'ordonnée est un nombre. Pour une paire « 5 : 1 » on trace le premier
  // terme : la somme étant fixe, il détermine l'autre.
  const unit = $derived(ind.kind === 'pair' ? '개' : '')

  // 시작패턴 / 종료패턴 — les deux menus de l'ancien, qui ne proposaient que
  // les valeurs **rencontrées**, jamais un intervalle théorique.
  let from = $state(null)
  let to = $state(null)

  // Changer de population ou d'indicateur vide la sélection : garder « 2–3 »
  // en passant de 총합 à AC값 afficherait un tableau vide sans rien dire.
  $effect(() => {
    population
    indicator
    view
    from = null
    to = null
  })

  const range = $derived.by(() => {
    if (from === null || to === null) return null
    const lo = Math.min(Number(from), Number(to))
    const hi = Math.max(Number(from), Number(to))
    return { min: lo, max: hi }
  })

  const inRange = (v) => range !== null && v >= range.min && v <= range.max
  const chosen = $derived(
    range && table ? table.values.filter((v) => inRange(v)) : [])
  const hits = $derived(range && table ? table.series.filter((s) => inRange(s.value)).length : 0)

  // Le graphique ne montre qu'une fenêtre. Avec le 2등 la série compte sept
  // lignes par 회차 — 7 938 points sur tout l'historique, soit onze traits
  // par pixel. L'ancien affichait tout et en faisait un mur illisible.
  const WINDOWS = [60, 120, 240, 0]
  let win = $state(120)
  const curve = $derived.by(() => {
    if (!chart) return []
    const all = [...chart.series].reverse()
    return win ? all.slice(-win) : all
  })

  // Le tableau se dévoile par tranches. Poser 7 938 lignes d'un coup dans le
  // DOM coûte plusieurs secondes de calcul de mise en page pour des lignes
  // que personne ne fait défiler jusqu'au bout ; le bouton rend le reste
  // accessible sans le payer d'avance.
  const STEP = 400
  let limit = $state(STEP)
  $effect(() => {
    population
    indicator
    view
    tableSpan
    limit = STEP
  })
  const rows = $derived(view ? specialRows : table.series)
  const shown = $derived(rows.slice(0, limit))

  // Le 보너스 se lit à sa place : dernier de la grille pour 보너스포함 et
  // 2등, absent du 1등.
  const bonusAt = $derived(population === 'first' ? -1 : pop.size - 1)

  const statValues = $derived(stat ? stat.values.length : 0)
</script>

{#if draws.n < 2}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}
  <section class="panel bar">
    <!-- Le titre de l'ancienne page, mot pour mot : « 1등 총합 당첨 통계 및
         패턴 ». Il change avec les deux boutons, comme changeait la page. -->
    <div class="head-inline">
      {#if special}
        <!-- Le nom du menu, pas celui de la page : les deux <h1> hérités
             étaient des copiés-collés — « 1등 AC 당첨 통계 및 패턴 » au-dessus
             du 배수분석, « 10회차 당첨 통계 및 패턴 » au-dessus du 홀짝저고AC. -->
        <h2>{special.label}</h2>
        <span class="gloss">{pop.gloss} · {special.gloss}</span>
      {:else}
        <h2>{pop.label} {ind.label} 당첨 통계 및 패턴</h2>
        <span class="gloss">{pop.gloss} · {ind.gloss}</span>
      {/if}
    </div>

    <div class="pickers">
      <div class="picker">
        {#each POPULATIONS as p (p.key)}
          <button aria-pressed={population === p.key}
                  onclick={() => (population = p.key)}>{p.label}</button>
        {/each}
      </div>
      <div class="picker second">
        {#each INDICATORS as i (i.key)}
          <button aria-pressed={!view && indicator === i.key}
                  onclick={() => { view = null; indicator = i.key }}>{i.label}</button>
        {/each}
        <!-- Les trois dernières entrées du groupe 필터 1등, à leur place. -->
        {#if population === 'first'}
          <span class="split" aria-hidden="true"></span>
          {#each FIRST_VIEWS as v (v.key)}
            <button aria-pressed={view === v.key}
                    onclick={() => (view = v.key)}>{v.label}</button>
          {/each}
        {/if}
      </div>
    </div>
  </section>

  {#if !view}
  <section class="panel">
    <div class="head">
      <h2>{ind.label} 당첨번호 통계</h2>
      <span class="gloss">값마다 몇 번 나왔나</span>
      <Scope bind:span={statSpan} {first} {last} />
      <span class="right">
        {num(statDraws.n)}회
        {#if pop.perDraw > 1}· {num(stat.series.length)}조합{/if}
      </span>
    </div>

    <!-- 총합 va de 60 à 268 : cent soixante barres, un mur de deux mille
         pixels qui repousse le reste de la page hors de portée. Au-delà de
         quarante valeurs l'histogramme défile dans son cadre, comme le
         tableau. Les paires (저고, 홀짝) en ont huit : elles restent
         entières. -->
    <!-- L'ancien étiquetait ses barres « 98번 ». On garde le suffixe, sauf
         pour les paires : « 5 : 1번 » ne veut rien dire. -->
    <div class="scroll" class:barbox={statValues > 40}>
      <Compare rows={statRows} suffix={ind.kind === 'pair' ? '' : '번'} mark={latestLabel}
               obsLabel="관측" expLabel={ind.key === 'ac' ? '기대 (무작위 20만 조합)' : '기대 (모든 조합의 법칙)'} />
    </div>

    <p class="note dim">
      회색 「기대」는 {pop.size}개 번호를 아무렇게나 고른 조합에서 이 값이 나올
      비율입니다 — 45개 중 {pop.size}개의 모든 조합을 세어 얻은 법칙{#if !ind.previous}이지, 회차와는
      무관합니다{/if}. 관측이 그 위에 얹혀 있으면 추첨은 이 지표에 아무것도 더하지
      않은 것입니다. 표시된 줄은 최근 회차의 값입니다.
      {#if ind.previous}
        <br />이월은 각 회차를 <strong>바로 앞 회차의 번호 7개</strong>(보너스 포함)와 비교합니다 —
        기대도 회차마다 그 7개를 기준으로 계산해 더한 값입니다. 앞 회차가 없는 1회는 빠집니다.
      {/if}
      {#if population === 'second'}
        <br />2등은 한 회차마다 <strong>일곱 조합</strong>입니다 — 당첨 조합과,
        보너스가 여섯 번호 중 하나를 대신한 여섯 조합.
      {/if}
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>{ind.label} 당첨번호 흐름</h2>
      <span class="gloss">회차별 값의 움직임</span>
      <Scope bind:span={chartSpan} {first} {last} />
      <span class="right">
        {#each WINDOWS as w (w)}
          <button class="win" aria-pressed={win === w} onclick={() => (win = w)}>
            {w ? `${w}` : '전체'}
          </button>
        {/each}
      </span>
    </div>

    <FlowChart series={curve} heat={false} legend={false}
               label="{pop.label} · {ind.label}" gloss={ind.gloss}
               {unit} band={range} />

    <p class="note dim">
      과거에 10회 미만으로 나온 값은 <strong>드물었던 모양</strong>일 뿐, 다음 회차에 나올 확률이 낮다는 뜻은 아닙니다 — 드문 값은 그 값을 만드는 조합 수가 적어서 드뭅니다.
      판단은 여러분의 몫입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>{ind.label} 당첨번호 패턴</h2>
      <span class="gloss">구간을 골라 흐름을 확인하세요</span>
      <Scope bind:span={tableSpan} {first} {last} />
      <span class="right">
        {#if range}{num(hits)} / {num(table.series.length)}{:else}{num(table.series.length)}{/if}
      </span>
    </div>

    <div class="controls">
      <label>
        시작패턴
        <select bind:value={from}>
          <option value={null}>선택</option>
          {#each table.values as v (v)}<option value={v}>{table.labels[v]}</option>{/each}
        </select>
      </label>
      <label>
        종료패턴
        <select bind:value={to}>
          <option value={null}>선택</option>
          {#each table.values as v (v)}<option value={v}>{table.labels[v]}</option>{/each}
        </select>
      </label>
      <span class="chosen">
        선택한 리스트 :
        {#if !chosen.length}
          <span class="dim">없음</span>
        {:else if chosen.length <= 12}
          {#each chosen as v (v)}<span class="tag">{table.labels[v]}</span>{/each}
        {:else}
          <!-- 총합 va de 60 à 268 : un intervalle un peu large ferait deux
               cents pastilles, une bouillie de chiffres. Au-delà d'une
               douzaine on n'écrit que les bornes et le compte. -->
          <span class="tag">{table.labels[chosen[0]]}</span>
          <span class="dash">–</span>
          <span class="tag">{table.labels[chosen.at(-1)]}</span>
          <span class="dim">{num(chosen.length)}개</span>
        {/if}
      </span>
      {#if range}
        <button class="clear" onclick={() => { from = null; to = null }}>지우기</button>
      {/if}
    </div>

    <p class="note dim">
      패턴 선택을 통해 최근 흐름 및 통계의 효율을 판단하는 데 많은 도움이 됩니다.
      {#if range}
        <br />고른 구간은 위 그래프에도 띠로 표시됩니다.
      {/if}
    </p>

    <div class="scroll tablebox">
      <table>
        <thead>
          <tr><th>회차</th><th>당첨번호</th><th class="v">{ind.label}</th></tr>
        </thead>
        <tbody>
          {#each shown as row, k}
            <tr class:on={inRange(row.value)}>
              <td>{fmt(row.rang)}</td>
              <td>
                <span class="grid">
                  {#each row.numbers as n, j}
                    <span class="n" class:bonus={j === bonusAt}
                          style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
                  {/each}
                </span>
              </td>
              <td class="val">{row.label}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if limit < rows.length}
      <div class="more">
        <button onclick={() => (limit += STEP)}>
          더 보기 <span class="dim">{num(limit)} / {num(rows.length)}</span>
        </button>
        <button class="all" onclick={() => (limit = rows.length)}>전부</button>
      </div>
    {/if}
  </section>

  <!-- ───────────────────────────────────────────────────────── 배수분석 -->
  {:else if view === 'multiples'}
  <section class="panel">
    <div class="head">
      <h2>배수 통계</h2>
      <span class="gloss">2 · 3 · 4 · 5의 배수 개수</span>
      <Scope bind:span={statSpan} {first} {last} />
      <span class="right">{num(statDraws.n)}회</span>
    </div>

    <!-- Les trois histogrammes de l'ancienne page. Le 2 domine tout — un
         tirage sur deux numéros est pair —, d'où les deux sommes qui
         l'écartent : ce qui reste bouge assez pour se lire. -->
    <div class="triple">
      <div class="one">
        <h3>2+3+4+5</h3>
        <Bars data={upper.all} suffix="개" />
      </div>
      <div class="one">
        <h3>3+4+5</h3>
        <Bars data={upper.odd} suffix="개" />
      </div>
      <div class="one">
        <h3>3+4</h3>
        <Bars data={upper.pair} suffix="개" />
      </div>
    </div>

    <p class="note dim">
      1회차부터 최근 회차까지의 기록입니다. 선택의 폭을 좁히는 데 쓸 수 있지만, 어떤 번호 묶음도 1등 확률을 높이지는 못합니다 — 「팁 › 필터 검정」 참고.
      <br />4의 배수는 모두 2의 배수입니다 — 두 열은 겹칩니다.
      판단은 여러분의 몫입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>배수분석</h2>
      <span class="gloss">회차별 배수 개수</span>
      <Scope bind:span={tableSpan} {first} {last} />
      <span class="right">{num(rows.length)}회</span>
    </div>

    <div class="scroll tablebox">
      <table>
        <thead>
          <tr>
            <th>회차</th><th>당첨번호</th>
            <th class="v">2배수</th><th class="v">3배수</th>
            <th class="v">4배수</th><th class="v">5배수</th>
            <th class="v">AC값</th>
            <th class="v">2+3+4+5</th><th class="v">3+4+5</th><th class="v">3+4</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as row}
            <tr>
              <td>{fmt(row.rang)}</td>
              <td><span class="grid">
                  {#each row.numbers as n (n)}
                    <span class="n" style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
                  {/each}
                </span></td>
              <td class="val">{row.counts[2]}</td>
              <td class="val">{row.counts[3]}</td>
              <td class="val">{row.counts[4]}</td>
              <td class="val">{row.counts[5]}</td>
              <td class="val">{row.ac}</td>
              <td class="val sum">{row.all}</td>
              <td class="val sum">{row.odd}</td>
              <td class="val sum">{row.pair}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if limit < rows.length}
      <div class="more">
        <button onclick={() => (limit += STEP)}>
          더 보기 <span class="dim">{num(limit)} / {num(rows.length)}</span>
        </button>
        <button class="all" onclick={() => (limit = rows.length)}>전부</button>
      </div>
    {/if}
  </section>

  <!-- ──────────────────────────────────────────────────────── 10회차1등 -->
  {:else if view === 'recent'}
  <section class="panel">
    <div class="head">
      <h2>당첨번호 수 통계</h2>
      <span class="gloss">여섯 중 몇 개가 리스트에 있었나</span>
      <Scope bind:span={statSpan} {first} {last} />
      <span class="right">{num(upper.rows.length)}회</span>
    </div>

    <Bars data={upper.counts} suffix="번" />

    <p class="note dim">
      리스트는 앞 <strong>{RECENT_SPAN}회차</strong>에 나온 번호를 모은 것입니다 —
      보너스를 포함한 일곱 번호씩. 당첨번호는 그 리스트 안에 있던 당첨 번호입니다.
      <br />
      {#if recentFacts}
        이 기간에는 <strong>{recentFacts.mode}개</strong>가 리스트 안에 있던 경우가 가장
        흔했고({recentFacts.modeShare}%), 가장 적었을 때는 {recentFacts.min}개였습니다.
      {/if}
      판단은 여러분의 몫입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>10회차분석</h2>
      <span class="gloss">회차별 리스트와 당첨번호</span>
      <Scope bind:span={tableSpan} {first} {last} />
      <span class="right">{num(rows.length)}회</span>
    </div>

    <div class="scroll tablebox">
      <table>
        <thead>
          <tr>
            <th>회차</th><th>리스트</th><th class="v">리스트수</th>
            <th>당첨번호</th><th class="v">당첨번호수</th>
            <th>소수</th><th class="v">소수수</th><th>당첨번호소수</th>
            <th>합성수</th><th class="v">합성수수</th><th>당첨번호합성수</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as row}
            <tr>
              <td>{fmt(row.rang)}</td>
              <td class="set">{row.list.join(' ')}</td>
              <td class="val">{row.listCount}</td>
              <td class="six"><span class="grid">
                  {#each row.won as n (n)}
                    <span class="n" style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
                  {/each}
                </span></td>
              <td class="val">{row.wonCount}</td>
              <td class="set">{row.primes.join(' ')}</td>
              <td class="val">{row.primeCount}</td>
              <td class="set">{row.wonPrimes.join(' ')}</td>
              <td class="set">{row.composites.join(' ')}</td>
              <td class="val">{row.compositeCount}</td>
              <td class="set">{row.wonComposites.join(' ')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if limit < rows.length}
      <div class="more">
        <button onclick={() => (limit += STEP)}>
          더 보기 <span class="dim">{num(limit)} / {num(rows.length)}</span>
        </button>
        <button class="all" onclick={() => (limit = rows.length)}>전부</button>
      </div>
    {/if}
  </section>

  <!-- ─────────────────────────────────────────────────────── 홀짝저고AC -->
  {:else if view === 'parity'}
  <section class="panel">
    <div class="head">
      <h2>홀짝 · 저고 통계</h2>
      <span class="gloss">두 지표를 겹쳐서</span>
      <Scope bind:span={statSpan} {first} {last} />
      <span class="right">
        {num(statDraws.n)}회 · {num(Object.keys(upper.counts).length)}가지
      </span>
    </div>

    <!-- Quarante-deux couples : le cadre défile, comme pour le 총합. -->
    <div class="scroll barbox">
      <Bars data={upper.counts} />
    </div>

    <p class="note dim">
      홀짝과 저고를 따로 보면 놓치는 것이 있습니다 — 같은 홀짝이라도 저고가
      다르면 다른 조합입니다. 많이 나온 짝부터 나열했습니다.
      <br />과거에 20회 미만으로 나온 값은 <strong>드물었던 모양</strong>일 뿐, 다음 회차에 나올 확률이 낮다는 뜻은 아닙니다 — 드문 값은 그 값을 만드는 조합 수가 적어서 드뭅니다.
      판단은 여러분의 몫입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>홀짝저고AC</h2>
      <span class="gloss">회차별 홀짝과 저고</span>
      <Scope bind:span={tableSpan} {first} {last} />
      <span class="right">{num(rows.length)}회</span>
    </div>

    <div class="scroll tablebox">
      <table>
        <thead>
          <tr>
            <th>회차</th><th>당첨번호</th>
            <th class="v">홀짝</th><th class="v">저고</th><th class="v">AC값</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as row}
            <tr>
              <td>{fmt(row.rang)}</td>
              <td><span class="grid">
                  {#each row.numbers as n (n)}
                    <span class="n" style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
                  {/each}
                </span></td>
              <td class="val">{row.odd}</td>
              <td class="val">{row.low}</td>
              <td class="val">{row.ac}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if limit < rows.length}
      <div class="more">
        <button onclick={() => (limit += STEP)}>
          더 보기 <span class="dim">{num(limit)} / {num(rows.length)}</span>
        </button>
        <button class="all" onclick={() => (limit = rows.length)}>전부</button>
      </div>
    {/if}
  </section>
  {/if}
{/if}

<style>
  .bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.75rem;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  /* Deux étages, comme l'ancien menu : la population d'abord, l'indicateur
     ensuite. Le second est en retrait — il ne se lit que par rapport au
     premier. */
  .pickers { display: flex; flex-direction: column; gap: 0.3rem; align-items: flex-end; }
  .picker { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .picker button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }
  .picker.second button { font-size: 0.75rem; padding: 0.18rem 0.55rem; }

  .win { font-size: 0.6875rem; padding: 0.1rem 0.4rem; margin-left: 0.2rem; }

  /* Le petit blanc qui sépare les six indicateurs des trois pages : elles
     ne sont pas des indicateurs, et rien d'autre ne le dirait. */
  .split { width: 0.6rem; }

  /* Les trois histogrammes du 배수분석, côte à côte tant qu'il y a la place.
     Ils se lisent ensemble — c'est la même distribution, dépouillée deux
     fois. */
  .triple {
    display: grid; gap: 1.25rem;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  }
  .triple h3 {
    font-size: 0.8125rem; font-weight: 400; color: var(--muted);
    font-family: var(--figure);
    margin: 0 0 0.4rem; padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--line-soft);
  }

  /* Les longues suites du 10회차1등 — jusqu'à quarante-cinq numéros. En
     chiffres tabulaires, sans couleur : c'est un décompte, pas une grille. */
  .set {
    font-family: var(--figure); font-size: 0.75rem;
    color: var(--ink-soft); line-height: 1.5;
    white-space: normal; max-width: 24rem;
  }
  /* Les six gagnants tiennent sur une ligne : entre deux colonnes de
     longues suites, un bloc de trois sur deux lignes se confond avec elles. */
  .six { min-width: 11rem; }
  .six .grid { flex-wrap: nowrap; }
  /* Les trois colonnes calculées, celles que l'ancienne vue ajoutait. */
  .sum { color: var(--gold-deep); }

  .controls {
    display: flex; align-items: center; gap: 0.9rem;
    flex-wrap: wrap; margin-bottom: 0.9rem;
  }
  .controls label {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.8125rem; color: var(--muted);
  }
  select {
    font: inherit; font-size: 0.8125rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--surface); color: var(--ink);
  }
  select:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 1px; }

  .chosen { font-size: 0.8125rem; color: var(--muted); }
  .tag {
    font-family: var(--figure); color: var(--gold-deep);
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 0.05rem 0.3rem; margin-left: 0.2rem;
  }
  .chosen .dash { color: var(--muted); margin: 0 0.25rem; }
  .clear { font-size: 0.6875rem; padding: 0.12rem 0.45rem; }

  .barbox { max-height: 26rem; overflow-y: auto; }
  .tablebox { max-height: 26rem; overflow-y: auto; }
  table { width: 100%; font-size: 0.8125rem; }
  th, td { padding: 0.25rem 0.5rem; text-align: left; }
  th {
    position: sticky; top: 0; background: var(--surface);
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  th.v, td.val { text-align: right; }
  td { border-bottom: 1px solid var(--line-soft); }
  /* Le 2등 déplié fait 7 938 lignes. Le navigateur saute la mise en page de
     celles qu'on ne voit pas — la hauteur annoncée garde la barre de
     défilement honnête. */
  tbody tr { content-visibility: auto; contain-intrinsic-size: auto 1.6rem; }
  .val { font-family: var(--figure); white-space: nowrap; }

  /* Les numéros de la ligne : la couleur est celle du 구간, dans le chiffre
     et non sous lui. Le 보너스 garde son trait discontinu. */
  .grid { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .n {
    font-family: var(--figure); color: var(--tone);
    min-width: 1.5rem; text-align: center;
  }
  .n.bonus {
    border-bottom: 1px dashed var(--gold);
    color: var(--gold);
  }

  tr.on td { background: var(--gold-wash); }
  tr.on .val { color: var(--gold-deep); font-weight: 700; }

  .more { display: flex; gap: 0.35rem; margin-top: 0.6rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }
  .more .all { border-color: var(--gold); color: var(--gold); }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
