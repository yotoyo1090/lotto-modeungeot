<script>
  // 팁 › 휠 — le seul écran de ce dépôt qui garantisse quelque chose.
  //
  // Les cinq autres onglets de 팁 mesurent et concluent chaque fois la même
  // chose : rien ne bat le hasard pour attraper les gagnants. 전체 검정, juste
  // à côté, en donne la version complète — 167 méthodes, 21 304 croisements,
  // et un tirage au sort qui finit 8ᵉ sur 167.
  //
  // Celui-ci ne mesure rien. Il calcule. La question qu'il traite a une
  // réponse exacte, démontrable, et vérifiable ici même :
  //
  //   « SI les six gagnants sont dans mon ensemble de T numéros, combien de
  //     grilles faut-il pour être CERTAIN de toucher un rang ? »
  //
  // La différence avec tout le reste de l'application tient dans ce « si ».
  // La roue ne le rend pas plus probable — pour 14 numéros il reste à
  // 1/2 712, une fois tous les cinquante-deux ans. Elle rend seulement le
  // « alors » bon marché : 17 grilles au lieu de 3 003.
  //
  // Le bouton 검증 n'est pas décoratif. Il énumère les C(T,6) tirages
  // possibles à l'intérieur de l'ensemble et vérifie qu'aucun n'échappe à la
  // garantie. C'est la même fonction que celle des tests.
  import { NMAX, PICK } from '@core/draws.js'
  import {
    GUARANTEES, LEGAL_GRIDS, poolHits, TICKET, verifyWheel, wheelFor,
    WHEEL_MAX, WHEEL_MIN,
  } from '@core/wheel.js'

  import { num, sectionOf, SECTION_VARS } from '../lib/format.js'

  const numbers = Array.from({ length: NMAX }, (_, k) => k + 1)
  const won = (v) => `${num(v)}원`

  let chosen = $state(new Set([3, 7, 11, 14, 18, 22, 27, 31, 35, 38, 41, 44]))
  let guarantee = $state(4)

  const pool = $derived([...chosen].sort((a, b) => a - b))
  const wheel = $derived(wheelFor(pool, guarantee))

  const toggle = (n) => {
    const next = new Set(chosen)
    if (next.has(n)) next.delete(n)
    // Au-delà de WHEEL_MAX il n'y a pas de table : refuser le clic est plus
    // honnête que d'accepter puis d'afficher une erreur.
    else if (next.size < WHEEL_MAX) next.add(n)
    chosen = next
  }

  const fill = (k) => {
    const bag = [...numbers]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]]
    }
    chosen = new Set(bag.slice(0, k))
  }

  // La vérification tourne à la demande : sur 18 numéros elle parcourt
  // 18 564 tirages, ce qui est instantané mais inutile à refaire à chaque
  // clic tant que personne ne la réclame.
  let checked = $state(null)
  $effect(() => {
    pool
    guarantee
    checked = null
  })
  const check = () => {
    checked = wheel.ok ? verifyWheel(wheel.pool, wheel.grids, guarantee) : null
  }

  const law = $derived(wheel.ok ? poolHits(wheel.size) : [])
</script>

<section class="panel">
  <div class="head">
    <h2>휠</h2>
    <span class="gloss">6개가 풀 안에 있다면, 몇 조합으로 확실히 맞출까</span>
    <span class="right">{wheel.size}개 선택</span>
  </div>

  <p class="lead">
    팁의 다른 다섯 탭은 전부 같은 결론에 닿았습니다 —
    <strong>번호를 고르는 방법으로는 확률이 바뀌지 않습니다.</strong>
    이 탭은 확률을 건드리지 않습니다. 대신 답이 정확히 계산되는 다른 질문을
    다룹니다 : <em>만약</em> 여섯 개가 내 풀 안에 있다면, 반드시 한 등수를
    맞추려면 몇 조합이 필요한가.
  </p>

  <div class="board">
    {#each numbers as n (n)}
      <button class="cell" class:on={chosen.has(n)}
              style="--tone: var({SECTION_VARS[sectionOf(n)]})"
              aria-pressed={chosen.has(n)} onclick={() => toggle(n)}>{n}</button>
    {/each}
  </div>

  <div class="tools">
    <span class="label">무작위로</span>
    {#each [10, 12, 14, 16, 18] as k (k)}
      <button class="mini" onclick={() => fill(k)}>{k}개</button>
    {/each}
    <span class="sep"></span>
    <span class="label">보장</span>
    {#each GUARANTEES as g (g)}
      <button class="mini" aria-pressed={guarantee === g}
              onclick={() => (guarantee = g)}>{g}개</button>
    {/each}
  </div>

  {#if !wheel.ok}
    <p class="warn">
      {WHEEL_MIN}개에서 {WHEEL_MAX}개 사이로 골라 주세요 — 지금은 {wheel.size}개입니다.
      <br />
      <span class="dim">
        표가 있는 범위만 다룹니다. 없는 크기를 어림잡아 채우면 «보장»이라는
        말이 거짓이 되기 때문입니다.
      </span>
    </p>
  {/if}
</section>

{#if wheel.ok}
  <section class="panel">
    <div class="head">
      <h2>{wheel.size}개 풀 · {guarantee}개 보장</h2>
      <span class="gloss">이 조합들을 전부 사면</span>
      <span class="right">
        {#if wheel.overLimit}
          <span class="over">한도 초과</span>
        {:else}
          <span class="ok" title="1인 1회차 구매 한도 {won(LEGAL_GRIDS * TICKET)}">한도 이내 · {wheel.count} / {LEGAL_GRIDS}장</span>
        {/if}
      </span>
    </div>

    <div class="stats">
      <div class="stat">
        <span class="k">조합</span>
        <span class="v">{num(wheel.count)}</span>
        <span class="n">개</span>
      </div>
      <div class="stat">
        <span class="k">비용</span>
        <span class="v">{num(wheel.cost)}</span>
        <span class="n">원</span>
      </div>
      <div class="stat">
        <span class="k">전부 사면</span>
        <span class="v">{num(wheel.fullCount)}</span>
        <span class="n">개 · {won(wheel.fullCost)}</span>
      </div>
      <div class="stat">
        <span class="k">절약</span>
        <span class="v">{wheel.saving.toFixed(0)}</span>
        <span class="n">배 저렴</span>
      </div>
    </div>

    <p class="foot">
      풀 안에서 6개가 어떻게 나오든 — <strong>{num(wheel.fullCount)}가지 경우 전부</strong> —
      이 {num(wheel.count)}조합 중 적어도 하나가 <strong>{guarantee}개 이상</strong> 맞습니다.
      {#if guarantee === 4}4개는 4등입니다.{:else}3개는 5등입니다.{/if}
      {#if wheel.overLimit}
        <br />
        <span class="over">다만 {num(wheel.count)}조합은 {num(LEGAL_GRIDS)}조합
        ({won(LEGAL_GRIDS * TICKET)}) 한도를 넘습니다 — 한 회차에 한 사람이
        살 수 있는 양이 아닙니다.</span>
      {/if}
    </p>

    <div class="verify">
      <button class="mini" onclick={check}>검증하기</button>
      {#if checked}
        {#if checked.ok}
          <span class="ok">
            통과 — {num(checked.targets)}가지 경우를 전부 확인했고,
            최악의 경우에도 {checked.worst}개 적중.
          </span>
        {:else}
          <span class="over">실패 — {num(checked.uncovered)}가지가 보장을 벗어납니다.</span>
        {/if}
      {:else}
        <span class="dim">
          말로 하는 보장은 보장이 아닙니다. 누르면 {num(wheel.fullCount)}가지
          경우를 하나도 빼지 않고 확인합니다.
        </span>
      {/if}
    </div>
  </section>
{/if}

{#if wheel.ok}
  <section class="panel">
    <div class="head">
      <h2>그 «만약»은 얼마나 자주 오는가</h2>
      <span class="gloss">휠이 절대 바꾸지 못하는 부분</span>
      <span class="right">1 / {num(wheel.oncePer)}회차</span>
    </div>

    <p class="foot">
      위의 보장은 <strong>6개가 전부 풀 안에 있을 때</strong>만 작동합니다.
      그 확률은 C({wheel.size},6) / C(45,6) =
      <strong>{(wheel.inPool * 100).toFixed(4)}%</strong>,
      즉 <strong>{num(wheel.oncePer)}회차에 한 번</strong>입니다 —
      매주 산다면 약 <strong>{Math.round(wheel.oncePer / 52)}년</strong>에 한 번.
      <br />
      휠은 이 숫자를 바꾸지 않습니다. 어떤 번호 고르기 방법도 바꾸지 못합니다
      (옆 탭 <strong>전체 검정</strong>의 21,304회 검정이 그 이야기입니다).
      휠이 바꾸는 것은 <em>그 일이 일어났을 때의 값</em>뿐입니다 :
      {num(wheel.fullCost)}원이 아니라 {won(wheel.cost)}.
    </p>

    <table class="law">
      <thead>
        <tr><th>풀이 잡는 개수</th><th class="v">확률</th><th class="v">몇 회차마다</th></tr>
      </thead>
      <tbody>
        {#each law as p, k (k)}
          <tr class:hi={k === PICK}>
            <td>{k}개</td>
            <td class="v">{(p * 100).toFixed(p < 0.001 ? 4 : 2)}%</td>
            <td class="v">{p > 0 ? `1 / ${num(Math.round(1 / p))}` : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="foot dim">
      대부분의 회차에서 풀은 {(law.reduce((s, p, k) => s + p * k, 0)).toFixed(2)}개쯤
      잡습니다 — 6 × {wheel.size} / 45 입니다. 그때는 보장이 적용되지 않습니다.
      이 표를 보이는 이유가 그것입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>조합 {num(wheel.count)}개</h2>
      <span class="gloss">그대로 사면 됩니다</span>
      <span class="right">{won(wheel.cost)}</span>
    </div>
    <div class="scroll gridbox">
      <ol class="grids">
        {#each wheel.grids as g, i (i)}
          <li>
            {#each g as n (n)}
              <span class="ball" style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
            {/each}
          </li>
        {/each}
      </ol>
    </div>
  </section>
{/if}

<style>
  .lead { margin: 0 0 1.1rem; font-size: 0.8125rem; line-height: 1.7; color: var(--ink-soft); }
  .lead strong { color: var(--ink); font-weight: 600; }
  .lead em { font-style: normal; color: var(--gold-deep); }

  .board {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(2.1rem, 1fr));
    gap: 0.25rem;
    margin-bottom: 1rem;
  }
  .cell {
    font-family: var(--figure); font-size: 0.8125rem;
    padding: 0.35rem 0; border: 1px solid var(--line);
    border-radius: var(--radius); background: var(--surface); color: var(--muted);
  }
  .cell.on {
    border-color: var(--tone); color: var(--tone);
    background: var(--gold-wash); font-weight: 700;
  }

  .tools { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .tools .label { font-size: 0.75rem; color: var(--muted); margin-right: 0.15rem; }
  .tools .sep { width: 1px; height: 1rem; background: var(--line); margin: 0 0.5rem; }
  .mini { font-size: 0.75rem; padding: 0.2rem 0.6rem; }

  .stats {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    margin-bottom: 0.4rem;
  }
  .stat { display: flex; flex-direction: column; gap: 0.15rem; }
  .stat .k { font-size: 0.75rem; color: var(--muted); }
  .stat .v { font-family: var(--figure); font-size: 1.375rem; color: var(--ink); }
  .stat .n { font-size: 0.75rem; color: var(--muted); }

  .foot { margin: 1rem 0 0; font-size: 0.75rem; line-height: 1.7; color: var(--ink-soft); }
  .foot strong { color: var(--ink); font-weight: 600; }
  .foot em { font-style: normal; color: var(--gold-deep); }
  .dim { color: var(--muted); }
  .warn { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.7; color: var(--ink-soft); }

  .ok { color: var(--gold-deep); font-size: 0.75rem; }
  .over { color: var(--hot, #b4432f); font-size: 0.75rem; }

  .verify {
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid var(--line);
    font-size: 0.75rem;
  }

  .law { width: 100%; margin-top: 1rem; font-size: 0.8125rem; }
  .law th, .law td { padding: 0.25rem 0.5rem; text-align: left; }
  .law th {
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  .law td { border-bottom: 1px solid var(--line-soft); }
  .law .v { font-family: var(--figure); text-align: right; }
  .law tr.hi td { background: var(--gold-wash); color: var(--gold-deep); font-weight: 600; }

  /* Cinquante-huit grilles poussent le reste de la page hors de portée :
     la liste défile dans son cadre. */
  .gridbox { max-height: 22rem; overflow-y: auto; }
  .grids { margin: 0; padding: 0 0 0 2.5rem; }
  .grids li { padding: 0.2rem 0; font-size: 0.8125rem; color: var(--muted); }
  .ball {
    display: inline-block; min-width: 1.6rem; text-align: center;
    font-family: var(--figure); color: var(--tone);
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 0.05rem 0.3rem; margin-right: 0.25rem;
  }
</style>
