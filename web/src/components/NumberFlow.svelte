<script>
  // 번호별 흐름 — le détail d'un seul numéro.
  //
  // Une fonction paramétrée remplace ici 45 classes de vues. Le contenu est
  // celui de `flowSummary` : combien de sorties, l'écart courant, l'écart
  // moyen, le plus long, et la distribution des intervalles.
  import { companionsOf, flow, flowSummary, numberFlow } from '@core/analysis.js'
  import { spectrum } from '@core/spectrum.js'
  import Bars from './Bars.svelte'
  import Scope from './Scope.svelte'
  import FlowChart from './FlowChart.svelte'
  import Periodogram from './Periodogram.svelte'
  import Stat from './Stat.svelte'
  import { num, rang, sectionOf, SECTION_VARS } from '../lib/format.js'
  import { bandOf } from '../lib/heat.js'

  // `withBonus` vient de l'interrupteur de l'onglet. Sans lui, ce panneau
  // comptait sans le bonus pendant que la matrice au-dessus le comptait :
  // 출현 disait 164 là où 전부 통계 disait 190, sur le même numéro.
  let {
    draws, number, withBonus = true, onclose,
    span = $bindable('follow'), first, last,
  } = $props()

  const summary = $derived(flowSummary(draws, number, { withBonus }))
  const detail = $derived(flow(draws, number, { withBonus }))
  const band = $derived(bandOf(summary.currentGap))

  // Les quatre comptages des anciennes pages 1번 … 45번, sous leurs noms.
  const own = $derived(numberFlow(draws, number, { withBonus }))
  // Le compte ne s'affichait pas : `companionsOf` rend `together`, et je
  // lisais `count`. Le `<i>` sortait vide — une file de numéros nus, sans
  // qu'on sache ni ce qu'ils comptent ni qu'ils sont triés par fréquence.
  // Et il compte maintenant le 보너스 comme le reste de l'onglet.
  const friends = $derived(companionsOf(draws, number, 12, { withBonus }))

  // 전부 흐름 : la suite complète, en graphique. Une fenêtre glissante — au
  // -delà de quelques centaines de 회차, les points se touchent et la courbe
  // ne dit plus rien.
  const WINDOWS = [60, 120, 240, 0]     // 0 = tout
  let window = $state(120)
  const strip = $derived(window ? own.series.slice(-window) : own.series)

  // 주기도 sur la période du bloc, six numéros seulement : le bonus sort
  // après une pause, ce n'est pas la même expérience.
  const spec = $derived(spectrum(draws, number))

  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0)

  // Les 회차 où il est sorti, du plus récent au plus ancien.
  const hits = $derived.by(() => {
    const out = []
    for (let i = draws.n - 1; i >= 0 && out.length < 14; i--) {
      if (detail.gap[i] === 0) out.push(draws.rangs[i])
    }
    return out
  })

  // Une fréquence théorique, pour situer la moyenne observée : sur 45
  // numéros dont 7 sortent, un numéro devrait revenir tous les 45/7 tirages.
  const theoretical = 45 / 7
</script>

<section class="panel picked">
  <div class="head">
    <h2>
      <span class="badge" style="--tone: var({SECTION_VARS[sectionOf(number)]})">{number}</span>
      번호별 흐름
    </h2>
    <span class="gloss">한 번호의 리듬</span>
    <Scope bind:span {first} {last} />
    <span class="conv dim">보너스 {withBonus ? '포함' : '제외'} · {num(draws.n)}회</span>
    <button class="close" onclick={onclose} aria-label="닫기">✕</button>
  </div>

  <div class="stats">
    <Stat label="출현" value={num(summary.hits)} note={`${num(draws.n)}회 중`} />
    <Stat label="현재 흐름" value={summary.currentGap === 0 ? '당첨' : summary.currentGap}
          tone={band.text} note={band.ko} />
    <Stat label="평균 간격" value={summary.gapMean ?? '—'}
          note={`이론값 ${theoretical.toFixed(1)}`} />
    <Stat label="최장 간격" value={summary.gapMax ?? '—'} note="회" />
  </div>

  <!-- 전부 흐름 en premier : c'est la vue d'ensemble du numéro, et elle
       éclaire les quatre histogrammes qui suivent. -->
  <div class="block">
    <div class="winbar">
      {#each WINDOWS as w (w)}
        <button aria-pressed={window === w} onclick={() => (window = w)}>
          {w ? `${w}회차` : '전체'}
        </button>
      {/each}
    </div>
    <FlowChart series={strip} />
  </div>

  <!-- 주기도 : la même suite, lue en fréquences. Le seuil de Fisher
       répond à la seule question utile — ce pic est-il plus qu'un accident. -->
  <div class="block">
    <Periodogram result={spec} label="주기도" gloss="이 번호에 리듬이 있는가?" />
    <p class="sub dim">
      {num(spec.drawn)}회 출현 · {num(spec.n)}회차 · 보너스 제외.
      {#if spec.g > spec.gStar}
        최고 봉우리가 문턱을 넘습니다 — 45개 중 2~3개는 우연으로도 넘으니, 다른 번호와 함께 보세요.
      {:else}
        봉우리가 문턱 아래입니다 — 리듬이라 부를 것이 없습니다.
      {/if}
    </p>
  </div>

  <!-- 동반 출현 번호 remonte ici : dans l'ordre précédent il tombait sous
       quatre histogrammes et une bande de 120 회차, et ne se voyait plus. -->
  <div class="grid two">
    <div>
      <p class="lead">동반 출현 번호 — 같이 나온 번호</p>
      <p class="denom">
        {number}번은 {num(friends.hits)}회 나왔습니다 —
        <span class="dim">번호당 기대값 약 {friends.expected.toFixed(1)}회</span>
      </p>
      <div class="friends">
        {#each friends.pairs as f (f.number)}
          <span class="friend" class:over={f.together > friends.expected}
                style="--tone: var({SECTION_VARS[sectionOf(f.number)]})"
                title="{f.number}번 — {num(f.together)}회 함께 ({(f.share * 100).toFixed(0)}%)">
            <b>{f.number}</b><i>{num(f.together)}회</i><em>{(f.share * 100).toFixed(0)}%</em>
          </span>
        {/each}
        {#if !friends.pairs.length}<span class="dim">아직 없습니다.</span>{/if}
      </div>
      <p class="sub dim">많이 나온 순입니다. 기대값보다 많은 번호는 테두리가 진합니다.</p>
    </div>
    <div>
      <p class="lead">최근 출현 회차</p>
      <div class="hits">
        {#each hits as r (r)}<span class="hit">{rang(r)}</span>{/each}
        {#if !hits.length}<span class="dim">이 구간에서는 나온 적이 없습니다.</span>{/if}
      </div>
    </div>
  </div>

  <div class="grid two">
    <div>
      <p class="lead">당첨 통계 — 몇 회 만에 돌아왔나</p>
      <Bars data={own.won} suffix="회" />
      <p class="sub dim">{num(total(own.won))}번</p>
    </div>
    <div>
      <p class="lead">이월 통계 — 연속으로 나온 경우</p>
      {#if total(own.carried)}
        <Bars data={own.carried} suffix="회" />
        <p class="sub dim">{num(total(own.carried))}번</p>
      {:else}
        <p class="dim">이 구간에서는 연속으로 나온 적이 없습니다.</p>
      {/if}
    </div>
  </div>

  <div class="grid two">
    <div>
      <p class="lead">전부 통계 — 당첨과 이월을 합쳐서</p>
      <Bars data={own.all} suffix="회" />
      <p class="sub dim">{num(total(own.all))}번</p>
    </div>
    <div>
      <p class="lead">당첨안된번호 통계 — 나오지 않은 회차의 간격</p>
      <Bars data={own.lost} suffix="회" />
      <p class="sub dim">{num(total(own.lost))}회차</p>
    </div>
  </div>

  <p class="note dim">
    「이월」의 값은 1이 아닙니다 — 연속으로 나온 경우, 그 <strong>연속이
    시작되기 전의 기다림</strong>을 셉니다. 스무 회차 쉬었다가 두 번 연속으로
    나오면 20과 21이지, 20과 1이 아닙니다. 옛 사이트도 그렇게 셌습니다.
  </p>
</section>

<style>
  .panel.picked { border-color: var(--gold); }

  h2 { display: flex; align-items: center; gap: 0.5rem; }
  .badge {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    border: 1.5px solid var(--tone);
    color: var(--tone);
    font-family: var(--figure);
    font-size: 0.9375rem;
  }

  .conv { margin-left: auto; font-size: 0.6875rem; }

  .close {
    margin-left: 0.6rem;
    border: 0;
    color: var(--muted);
    padding: 0 0.35rem;
    font-size: 0.875rem;
  }
  .close:hover { border: 0; color: var(--ink); }

  .stats {
    display: grid;
    gap: 1.25rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    margin-bottom: 1.75rem;
  }

  .lead { margin: 0 0 0.75rem; font-size: 0.8125rem; color: var(--muted); }
  .sub { margin: 0.45rem 0 0; font-size: 0.6875rem; }
  .block { margin-bottom: 1.75rem; }
  .grid.two + .grid.two, .grid.two + .note { margin-top: 1.75rem; }
  .note { font-size: 0.75rem; line-height: 1.6; margin: 1.5rem 0 0; }
  .note strong { color: var(--ink); font-weight: 600; }

  /* La fenêtre du graphique — au-dessus de lui, à droite du titre. */
  .winbar { display: flex; gap: 0.3rem; justify-content: flex-end; margin-bottom: 0.35rem; }
  .winbar button { font-size: 0.6875rem; padding: 0.15rem 0.5rem; }

  .denom {
    margin: 0 0 0.7rem; font-size: 0.75rem; color: var(--ink-soft);
    border-left: 2px solid var(--gold); padding-left: 0.55rem;
  }

  .friends { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  /* Le numéro, le compte, la part. Trois valeurs dans une pastille, mais
     hiérarchisées : le numéro se lit de loin, la part se lit si on la
     cherche. */
  .friend {
    display: inline-flex; align-items: baseline; gap: 0.3rem;
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 0.2rem 0.45rem;
    font-family: var(--figure); font-size: 0.8125rem; color: var(--tone);
  }
  .friend.over { border-color: var(--tone); }
  .friend b { font-weight: 600; }
  .friend i { font-style: normal; font-family: var(--font); font-size: 0.6875rem; color: var(--ink-soft); }
  .friend em { font-style: normal; font-family: var(--font); font-size: 0.625rem; color: var(--muted); }

  .hits { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .hit {
    font-size: 0.75rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 2px;
    color: var(--ink-soft);
  }
</style>
