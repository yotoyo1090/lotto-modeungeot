<script>
  // L'onglet 당첨 위치.
  //
  // L'ancien site en faisait **sept pages** — 일 · 이 · 삼 · 사 · 오 · 육 ·
  // 보너스 — de plusieurs centaines de lignes chacune, pour trois blocs
  // rigoureusement identiques : le comptage par numéro, la suite dans le
  // temps, et le tableau 회차 / 당첨번호 qu'on filtrait par intervalle.
  //
  // Ici, une position se choisit et les trois blocs suivent. La grille
  // 7 × 45 en tête donne la vue d'ensemble que l'ancien n'avait pas : on y
  // voit d'un coup que 일 n'atteint jamais les hautes valeurs et 육 jamais
  // les basses — une conséquence du **tri**, pas du tirage.
  import { placeFlow } from '@core/analysis.js'

  import Compare from '../components/Compare.svelte'
  import FlowChart from '../components/FlowChart.svelte'
  import Positions from '../components/Positions.svelte'
  import Scope from '../components/Scope.svelte'
  import { num, POSITION_LABELS, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'
  import { scoped } from '../lib/scope.js'

  let { draws, base = draws } = $props()

  const first = $derived(base.rangs[0])
  const last = $derived(base.rangs[base.n - 1])

  let place = $state(0)

  // Une période par bloc, comme dans 흐름 · 차뜨.
  let gridSpan = $state('follow')
  let flowSpan = $state('follow')

  const gridDraws = $derived(scoped(base, draws, gridSpan))
  const flowDraws = $derived(scoped(base, draws, flowSpan))

  const flow = $derived(placeFlow(flowDraws, place))

  // 관측 contre la loi de la position : toutes les valeurs que l'un ou
  // l'autre touche — un numéro attendu 0,3 fois et jamais vu reste une
  // ligne, sinon la courbe du hasard aurait des trous.
  const compareRows = $derived.by(() => {
    const rows = []
    for (let v = 1; v <= 45; v++) {
      const obs = flow.counts[v] ?? 0
      const exp = flow.expected[v] ?? 0
      if (obs > 0 || exp >= 0.5) rows.push({ key: v, obs, exp })
    }
    return rows
  })
  const latest = $derived(flow.series[0]?.value ?? null)

  // 시작패턴 / 종료패턴 — les deux menus de l'ancien. Ils ne proposaient que
  // les valeurs **rencontrées** à cette position, pas 1..45 : un 육 ne
  // descend jamais à 3, l'offrir au choix n'aurait aucun sens.
  let from = $state(null)
  let to = $state(null)

  // Un changement de position vide la sélection : garder « 2–3 » en passant
  // de 일 à 육 afficherait un tableau entièrement blanc sans rien expliquer.
  $effect(() => {
    place
    from = null
    to = null
  })

  const range = $derived.by(() => {
    if (from === null || to === null) return null
    const lo = Math.min(Number(from), Number(to))
    const hi = Math.max(Number(from), Number(to))
    return { min: lo, max: hi }
  })

  const chosen = $derived(
    range ? flow.values.filter((v) => v >= range.min && v <= range.max) : [])

  // Le graphique lit du plus ancien au plus récent ; la série vient dans
  // l'autre sens, comme le tableau de l'ancien.
  //
  // Et il ne montre qu'une fenêtre : 1 134 points dans 720 unités, c'est
  // trois traits par pixel — une forêt où plus rien ne se lit. L'ancien
  // affichait tout et en faisait un mur de 2 800 pixels de large.
  const WINDOWS = [60, 120, 240, 0]
  let win = $state(120)
  const curve = $derived.by(() => {
    const all = [...flow.series].reverse()
    return win ? all.slice(-win) : all
  })

  const inRange = (v) => range !== null && v >= range.min && v <= range.max
  const hits = $derived(range ? flow.series.filter((s) => inRange(s.value)).length : 0)
</script>

{#if draws.n < 2}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}
  <section class="panel bar">
    <div class="head-inline">
      <h2>당첨 위치</h2>
      <span class="gloss">자리마다 어떤 번호가 오는가</span>
    </div>
    <div class="picker">
      {#each POSITION_LABELS as label, p (label)}
        <button aria-pressed={place === p} onclick={() => (place = p)}>{label}</button>
      {/each}
    </div>
  </section>

  <Positions draws={gridDraws} bind:span={gridSpan} {first} {last} bind:place />

  <section class="panel">
    <div class="head">
      <h2>{POSITION_LABELS[place]} 당첨번호 통계</h2>
      <span class="gloss">이 자리에 몇 번 왔나</span>
      <Scope bind:span={flowSpan} {first} {last} />
      <span class="right">{num(flowDraws.n)}회 기준</span>
    </div>

    <Compare rows={compareRows} suffix="번" mark={latest}
             obsLabel="관측" expLabel="기대 (정렬된 6개 중 {POSITION_LABELS[place]}의 법칙)" />

    <p class="note dim">
      번호는 뽑힌 뒤 <strong>크기순으로 정렬</strong>되므로, 일은 늘 가장 작고
      육은 늘 가장 큽니다. 이 치우침은 추첨이 아니라 정렬 때문입니다 — 회색
      「기대」가 바로 그 정렬만으로 나오는 모양이고, 관측이 그 위에 얹혀 있으면
      추첨은 아무것도 더하지 않은 것입니다. 표시된 줄은 최근 회차의 번호입니다.
    </p>
  </section>

  <section class="panel">
    <div class="winbar">
      {#each WINDOWS as w (w)}
        <button aria-pressed={win === w} onclick={() => (win = w)}>
          {w ? `${w}회차` : '전체'}
        </button>
      {/each}
    </div>
    <FlowChart series={curve} heat={false} legend={false}
               label="{POSITION_LABELS[place]} 당첨번호 흐름"
               gloss="회차별 이 자리의 번호" unit="번" band={range} />
    <p class="note dim">
      과거에 10회 미만으로 나온 값은 <strong>드물었던 모양</strong>일 뿐, 다음 회차에 나올 확률이 낮다는 뜻은 아닙니다 — 드문 값은 그 값을 만드는 조합 수가 적어서 드뭅니다.
      판단은 여러분의 몫입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>{POSITION_LABELS[place]} 당첨번호 패턴</h2>
      <span class="gloss">구간을 골라 흐름을 확인하세요</span>
      <span class="right">
        {#if range}{num(hits)}회 / {num(flow.series.length)}회{:else}{num(flow.series.length)}회{/if}
      </span>
    </div>

    <div class="controls">
      <label>
        시작패턴
        <select bind:value={from}>
          <option value={null}>선택</option>
          {#each flow.values as v (v)}<option value={v}>{v}</option>{/each}
        </select>
      </label>
      <label>
        종료패턴
        <select bind:value={to}>
          <option value={null}>선택</option>
          {#each flow.values as v (v)}<option value={v}>{v}</option>{/each}
        </select>
      </label>
      <span class="chosen">
        선택한 리스트 :
        {#if chosen.length}
          {#each chosen as v (v)}
            <span class="tag" style="--tone: var({SECTION_VARS[sectionOf(v)]})">{v}</span>
          {/each}
        {:else}
          <span class="dim">없음</span>
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
          <tr><th>회차</th><th>당첨번호</th></tr>
        </thead>
        <tbody>
          {#each flow.series as row (row.rang)}
            <tr class:on={inRange(row.value)}>
              <td>{fmt(row.rang)}</td>
              <td class="val">{row.value}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
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

  .picker { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .picker button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }

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
    font-family: var(--figure); color: var(--tone);
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 0.05rem 0.3rem; margin-left: 0.2rem;
  }
  .clear { font-size: 0.6875rem; padding: 0.12rem 0.45rem; }

  .winbar { display: flex; gap: 0.3rem; justify-content: flex-end; margin-bottom: 0.35rem; }
  .winbar button { font-size: 0.6875rem; padding: 0.15rem 0.5rem; }

  /* Le tableau fait 1 134 lignes : il défile dans son cadre plutôt que de
     pousser le reste de la page hors de portée. */
  .tablebox { max-height: 26rem; overflow-y: auto; }
  table { width: 100%; font-size: 0.8125rem; }
  th, td { padding: 0.25rem 0.5rem; text-align: left; }
  th {
    position: sticky; top: 0; background: var(--surface);
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  td { border-bottom: 1px solid var(--line-soft); }
  .val { font-family: var(--figure); }
  /* L'ancien peignait la ligne choisie en bleu clair. On garde le principe
     et la couleur d'accent du site : c'est un aplat, mais sur une ligne
     entière, pas sous un chiffre isolé. */
  tr.on td { background: var(--gold-wash); }
  tr.on .val { color: var(--gold-deep); font-weight: 700; }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
