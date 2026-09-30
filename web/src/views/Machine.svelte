<script>
  // 추첨기별 — l'onglet à côté de 패밀리.
  //
  // Trois questions, trois chiffres, et pour chacun ce qu'il faudrait pour
  // qu'il compte. Les calculs viennent de `core/machine.js` ; ici on ne
  // fait qu'afficher. `hogi` est l'objet plat de hogi.json, converti en Map.
  //
  // Le bloc reste honnête sur sa propre puissance : avec ~300 tirages par
  // machine, un biais de moins de 3 % sur un numéro est invisible. Un
  // résultat négatif veut dire « rien de gros », pas « rien ».
  import { machine, MACHINES } from '@core/machine.js'

  import Compare from '../components/Compare.svelte'

  let { draws, hogi = null } = $props()

  // La machine dont on regarde les 45 numéros. Une seule à la fois : trois
  // graphes de 45 barres empilés ne se lisent pas.
  let shownMachine = $state(1)

  const result = $derived.by(() => {
    if (!draws || !hogi || !Object.keys(hogi).length) return null
    const map = new Map(Object.entries(hogi).map(([r, m]) => [Number(r), m]))
    return machine(draws, map)
  })

  const labelled = $derived(result ? result.uniform.reduce((s, r) => s + r.draws, 0) : 0)

  // Les 45 numéros de la machine choisie : contre l'uniforme (question 1)
  // et contre la part de chaque numéro chez les trois machines (question 2).
  const shown = $derived(result ? result.uniform.find((r) => r.machine === shownMachine) : null)
  const uniformRows = $derived(shown
    ? shown.numbers.map((c, k) => ({ key: k + 1, obs: c, exp: shown.expected }))
    : [])
  const sameRows = $derived(shown
    ? shown.numbers.map((c, k) => ({ key: k + 1, obs: c, exp: result.same.expected.get(shownMachine)[k] }))
    : [])
  const num = (v) => v.toLocaleString('ko-KR')
  const pct = (v) => `${(v * 100).toFixed(1)}%`
  const p = (v) => (v < 0.001 ? '< 0.001' : v.toFixed(3))
  const BONFERRONI = 0.05 / 3
</script>

{#if !result}
  <section class="panel">
    <div class="head">
      <h2>추첨기별</h2>
      <span class="gloss">세 대의 추첨기는 같은 우연인가</span>
    </div>
    <p class="dim">추첨기 정보가 없습니다 — <code>npm run update</code> (crawl hogi) 를 먼저 실행하세요.</p>
  </section>
{:else}
  <section class="panel">
    <div class="head">
      <h2>추첨기별</h2>
      <span class="gloss">세 대의 추첨기는 같은 우연인가</span>
      <span class="right">{num(labelled)}회차 · 262회부터</span>
    </div>

    <p class="lede">
      262회부터 세 대의 비너스 추첨기(<strong>1·2·3호기</strong>)가 번갈아 쓰입니다.
      어느 기계가 썼는지는 공식 데이터에 없어, 매주 방송·카페 발표를 옮겨 적은 것을
      가져옵니다. 질문은 하나 — <strong>세 기계는 같은 우연인가.</strong>
    </p>

    <div class="facts">
      {#each result.uniform as row (row.machine)}
        <div class="fact">
          <span class="k">{row.machine}호기</span>
          <b class="figure">{num(row.draws)}회</b>
          <span class="dim small">χ² {row.chi2.toFixed(1)} · p {p(row.p)}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>추첨기별 45개 번호</h2>
      <span class="gloss">기계 하나씩, 균등한가</span>
      <span class="right">기준 0.05 / 3 = {BONFERRONI.toFixed(4)}</span>
    </div>
    <div class="scroll">
      <table>
        <thead><tr><th>호기</th><th>회차</th><th>χ²</th><th>df</th><th>p</th><th></th></tr></thead>
        <tbody>
          {#each result.uniform as row (row.machine)}
            <tr>
              <td>{row.machine}호기</td>
              <td>{num(row.draws)}</td>
              <td>{row.chi2.toFixed(1)}</td>
              <td>{row.df}</td>
              <td>{p(row.p)}</td>
              <td class="dim">{row.p < BONFERRONI ? '살펴볼 것' : '기대대로'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note dim">
      각 기계 안에서 45개 번호가 <strong>고르게</strong> 나왔는지를 검정합니다.
      전체에서는 1/3로 희석되는 결함이 여기서는 세 배로 보입니다.
      세 번 검정하므로 기준을 셋으로 나눕니다.
    </p>

    <div class="pick">
      <span class="label">호기</span>
      {#each MACHINES as m (m)}
        <button aria-pressed={shownMachine === m} onclick={() => (shownMachine = m)}>{m}호기</button>
      {/each}
    </div>
    <div class="block">
      <Compare rows={uniformRows} showTotal={false} keyWidth="2.5rem" suffix="번"
               obsLabel={`${shownMachine}호기 관측`}
               expLabel={`기대 (균등) ${shown ? shown.expected.toFixed(1) : ''}`} />
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>세 추첨기가 같은 분포인가</h2>
      <span class="gloss">3 × 45 표의 동질성</span>
      <span class="right">df {result.same.df}</span>
    </div>
    <div class="facts">
      <div class="fact">
        <span class="k">χ²</span>
        <b class="figure">{result.same.chi2.toFixed(1)}</b>
        <span class="dim small">기대 {result.same.df}</span>
      </div>
      <div class="fact">
        <span class="k">p</span>
        <b class="figure">{p(result.same.p)}</b>
        <span class="dim small">{result.same.p < 0.05 ? '기계마다 다르다' : '구별되지 않는다'}</span>
      </div>
    </div>

    <div class="block">
      <Compare rows={sameRows} showTotal={false} keyWidth="2.5rem" suffix="번"
               obsLabel={`${shownMachine}호기 관측`} expLabel="기대 (세 기계 합산 비율)" />
    </div>
    <p class="note dim">
      여기서 기대치는 균등이 아니라 <strong>세 기계를 합친 번호별 비율</strong>을
      이 기계의 회차 수에 맞춘 것입니다. 균등 검정이 「45개가 고른가」를 묻는다면,
      이 검정은 「이 기계가 다른 두 대와 같은가」를 묻습니다. 위의 호기 선택이 여기에도 적용됩니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>번호 6개로 추첨기를 맞힐 수 있는가</h2>
      <span class="gloss">walk-forward · 대조군은 최다 호기</span>
      <span class="right">{num(result.guess.tested)}회 시험</span>
    </div>
    <div class="facts">
      <div class="fact">
        <span class="k">적중</span>
        <b class="figure">{pct(result.guess.accuracy)}</b>
        <span class="dim small">{num(result.guess.hits)}회</span>
      </div>
      <div class="fact">
        <span class="k">대조군</span>
        <b class="figure">{pct(result.guess.baseline)}</b>
        <span class="dim small">늘 최다 호기라고 답할 때</span>
      </div>
      <div class="fact">
        <span class="k">z</span>
        <b class="figure">{result.guess.z.toFixed(2)}</b>
        <span class="dim small">{result.guess.z > 2 ? '신호' : '잡음'}</span>
      </div>
    </div>
    <p class="note dim">
      회차마다 그 이전 기록만으로 세 기계 중 어디서 나왔는지 맞혀 봅니다.
      신호는 z가 <strong>+2를 넘을 때뿐</strong>입니다 — 번호로 기계를 대조군보다 잘
      맞힌다는 뜻. 0 근처나 음수는 과거 빈도가 잡음이라는 뜻이고, 그게 무작위의
      정상 모습입니다. 시험은 라벨이 100회 쌓인 뒤부터 시작합니다.
    </p>
  </section>
{/if}

<style>
  .block { margin-top: 1rem; }
  .pick { display: flex; align-items: center; gap: 0.35rem; margin-top: 1.25rem; }
  .pick .label { margin-right: 0.25rem; font-size: 0.75rem; color: var(--muted); }
  .pick button { font-size: 0.75rem; }
  .lede { margin: 0 0 1.1rem; color: var(--ink-soft); max-width: 66ch; }
  .lede strong { color: var(--ink); font-weight: 600; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 76ch; }
  .note strong { color: var(--ink); font-weight: 600; }
  .small { font-size: 0.75rem; }
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
</style>
