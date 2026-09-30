<script>
  // L'onglet 흐름 · 차뜨.
  //
  // Quatre blocs. Chacun a **sa** période : la barre du haut donne le
  // réglage général, et un bloc qui veut voir autre chose se détache sans
  // toucher aux autres. On peut ainsi lire le 흐름 sur les 50 derniers 회차
  // et le 당첨번호의 온도 sur les 1 134, sur le même écran.
  //
  // C'est possible parce que rien n'est précalculé : chaque bloc refait ses
  // 7 millisecondes de calcul sur ses propres 회차. L'ancienne plateforme
  // aurait eu besoin d'une table par bloc et par période.
  //
  // À eux quatre, ils remplacent 59 pages de l'ancienne plateforme : les 45
  // `pattern*` et les 14 `hotcold*`.
  import { gaps, runs } from '@core/analysis.js'
  import { spectrumAll } from '@core/spectrum.js'

  import HeatBoard from '../components/HeatBoard.svelte'
  import Scope from '../components/Scope.svelte'
  import { num, sectionOf, SECTION_VARS } from '../lib/format.js'
  import FlowMatrix from '../components/FlowMatrix.svelte'
  import NumberFlow from '../components/NumberFlow.svelte'
  import WinnerHeat from '../components/WinnerHeat.svelte'
  import { scoped } from '../lib/scope.js'

  // `draws` est ce que la barre du haut a découpé ; `base` est l'historique
  // entier. Un bloc qui choisit « 전체 » doit repartir de `base`, sinon le mot
  // voudrait dire « tout ce que le haut a bien voulu laisser ».
  let { draws, base = draws } = $props()

  // `withBonus` : la table `numberpattern` d'origine comptait le bonus comme
  // une sortie. On garde cette convention, et on la rend visible plutôt que
  // de la laisser cachée dans le calcul.
  let withBonus = $state(true)
  let selected = $state(null)

  const first = $derived(base.rangs[0])
  const last = $derived(base.rangs[base.n - 1])

  // Une période par bloc. 'follow' = suit la barre du haut.
  let heatSpan = $state('follow')
  let matrixSpan = $state('follow')
  let numberSpan = $state('follow')
  let winnerSpan = $state('follow')

  const heatDraws = $derived(scoped(base, draws, heatSpan))
  const matrixDraws = $derived(scoped(base, draws, matrixSpan))
  const numberDraws = $derived(scoped(base, draws, numberSpan))
  const winnerDraws = $derived(scoped(base, draws, winnerSpan))

  // Chaque bloc a sa matrice, puisqu'il a ses 회차. Deux blocs qui suivent la
  // même période recalculent deux fois la même chose — 7 ms chacun, contre
  // une plomberie de cache qu'il faudrait ensuite maintenir juste.
  const heatGaps = $derived(gaps(heatDraws, { withBonus }))
  const matrixGaps = $derived(gaps(matrixDraws, { withBonus }))
  const matrixRuns = $derived(runs(matrixDraws, { withBonus }))

  // 주기도 des 45 : un périodogramme par numéro, et le compte de ceux qui
  // franchissent le seuil, à lire contre les 45 × 5 % attendus par hasard.
  // Six numéros seulement — le bonus n'entre pas dans le rythme.
  let spectrumSpan = $state('follow')
  const spectrumDraws = $derived(scoped(base, draws, spectrumSpan))
  const spectra = $derived(spectrumAll(spectrumDraws))
  const pval = (p) => (p < 0.001 ? '< 0.001' : p.toFixed(3))
</script>

{#if draws.n < 2}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}
  <section class="panel options">
    <div class="opt">
      <span class="label">보너스</span>
      <button aria-pressed={withBonus} onclick={() => (withBonus = true)}>포함</button>
      <button aria-pressed={!withBonus} onclick={() => (withBonus = false)}>제외</button>
    </div>
    <p class="hint dim">
      표와 그래프마다 자기 기간을 고를 수 있습니다 — 「따름」이면 위 막대를 따릅니다.
    </p>
  </section>

  <HeatBoard draws={heatDraws} gaps={heatGaps} bind:selected
             bind:span={heatSpan} {first} {last} />

  {#if selected !== null}
    <NumberFlow draws={numberDraws} number={selected} {withBonus}
                bind:span={numberSpan} {first} {last}
                onclose={() => (selected = null)} />
  {/if}

  <FlowMatrix draws={matrixDraws} gaps={matrixGaps} runs={matrixRuns}
              bind:selected bind:span={matrixSpan} {first} {last} />

  <WinnerHeat draws={winnerDraws} bind:span={winnerSpan} {first} {last} />

  <section class="panel">
    <div class="head">
      <h2>주기도 — 45개 번호</h2>
      <span class="gloss">어떤 번호에 리듬이 있는가?</span>
      <Scope bind:span={spectrumSpan} {first} {last} />
      <span class="right">{num(spectra.n)}회차 · 보너스 제외</span>
    </div>

    <div class="facts">
      <div class="fact">
        <span class="k">문턱을 넘은 번호</span>
        <b class="figure" class:over={spectra.over > spectra.expected * 2}>{spectra.over}개</b>
        <span class="dim small">우연이라면 {spectra.expected.toFixed(1)}개</span>
      </div>
      <div class="fact">
        <span class="k">문턱</span>
        <b class="figure">Fisher 5%</b>
        <span class="dim small">번호마다 최고 봉우리의 에너지 비율 g 와 비교</span>
      </div>
    </div>

    <div class="scroll">
      <table class="spectra">
        <thead>
          <tr><th>번호</th><th>출현</th><th>최고 봉우리 주기</th><th>g</th><th>문턱</th><th>p</th><th></th></tr>
        </thead>
        <tbody>
          {#each spectra.rows as r (r.number)}
            <tr class:over={r.over} class:picked={selected === r.number}
                onclick={() => (selected = selected === r.number ? null : r.number)}>
              <td><span class="n" style="--tone: var({SECTION_VARS[sectionOf(r.number)]})">{r.number}</span></td>
              <td>{num(r.drawn)}</td>
              <td>{r.period === null ? '—' : `${r.period.toFixed(1)}회`}</td>
              <td>{(r.g * 100).toFixed(2)}%</td>
              <td class="dim">{(r.gStar * 100).toFixed(2)}%</td>
              <td>{pval(r.p)}</td>
              <td class="dim">{r.over ? '문턱 위' : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note dim">
      번호의 0/1 출현 수열을 주파수로 분해한 것입니다. 45개를 5% 문턱으로 검정하면
      우연으로도 2~3개가 넘습니다 — 넘은 개수가 그보다 훨씬 많을 때만 뜻이 있습니다.
      행을 누르면 위에서 그 번호의 주기도가 열립니다.
    </p>
  </section>
{/if}

<style>
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    align-items: center;
    padding-top: 0.85rem;
    padding-bottom: 0.85rem;
  }
  .opt { display: flex; align-items: center; gap: 0.35rem; }
  .opt .label { margin-right: 0.25rem; }
  .opt button { font-size: 0.75rem; }
  .hint { margin: 0; font-size: 0.75rem; }

  /* 주기도 — les mêmes 사실 que 추첨기별, la même table que le reste. */
  .small { font-size: 0.75rem; }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 1rem 1.5rem;
    margin-bottom: 1rem;
  }
  .fact { display: flex; flex-direction: column; gap: 0.15rem; }
  .fact .k {
    font-size: 0.6875rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--muted);
  }
  .figure.over { color: var(--hit-bg); }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 76ch; }

  .spectra tbody tr { cursor: pointer; }
  .spectra tbody tr:hover td { background: var(--gold-wash); }
  .spectra tr.over td { color: var(--hit-bg); }
  .spectra tr.picked td { background: var(--gold-wash); }
  .spectra .n {
    display: inline-grid; place-items: center;
    min-width: 1.6rem; height: 1.6rem; padding: 0 0.3rem;
    border-radius: 999px; font-family: var(--figure); font-weight: 600;
    background: color-mix(in srgb, var(--tone) 18%, transparent); color: var(--ink);
  }
</style>
