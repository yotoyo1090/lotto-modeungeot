<script>
  // L'onglet 생성기.
  //
  // Les critères se règlent, le compte se met à jour, les grilles sortent.
  // Le calcul part dans un Web Worker : faire glisser un curseur ne fige
  // jamais la page, même quand la recherche parcourt les 8 145 060
  // combinaisons.
  //
  // Deux choix de fond, hérités de tout le reste du projet :
  //
  //   * chaque critère montre la **distribution des tirages passés**. On
  //     règle donc ses bornes en voyant ce qui est arrivé, pas à l'aveugle ;
  //   * le tirage au sort est **reproductible**. Une graine, les mêmes
  //     grilles — sur n'importe quelle machine, aujourd'hui ou dans un mois.
  import { compute } from '@core/metrics.js'
  import { LABELS, TOTAL_COMBINATIONS } from '@core/generator.js'
  import { PICK } from '@core/draws.js'
  import { sharing as shareOf } from '@core/sharing.js'

  import Balls from '../components/Balls.svelte'
  import Bound from '../components/Bound.svelte'
  import NumberPad from '../components/NumberPad.svelte'
  import Stat from '../components/Stat.svelte'
  import { isSkipped, search } from '../lib/generator.js'
  import { num } from '../lib/format.js'

  let { draws } = $props()

  const metrics = $derived(compute(draws))

  // Les indicateurs du noyau portent sur les **sept** numéros ; le
  // générateur travaille sur **six**. Les histogrammes sont donc recalculés
  // sur les six seuls, sinon les bornes proposées seraient décalées.
  const history = $derived.by(() => {
    const total = new Int16Array(draws.n)
    const low = new Int8Array(draws.n)
    const odd = new Int8Array(draws.n)
    for (let i = 0; i < draws.n; i++) {
      const row = draws.numbersAt(i)
      let sum = 0; let lows = 0; let odds = 0
      for (let k = 0; k < PICK; k++) {
        sum += row[k]
        if (row[k] <= 22) lows++
        if (row[k] % 2 === 1) odds++
      }
      total[i] = sum; low[i] = lows; odd[i] = odds
    }
    return { total, low, odd, ac: metrics.ac }
  })

  let filters = $state({
    total: null, ac: null, low: null, odd: null,
    primes: null, headSum: null, tailSum: null, sharing: null,
  })

  // 분배 — le seul critère de cet écran qui ne parle pas du tirage.
  //
  // Les autres découpent l'espace des combinaisons ; celui-ci découpe les
  // **joueurs**. Il ne se règle donc pas au curseur comme une somme : trois
  // choix suffisent, et le libellé dit ce qu'on achète — moins de monde avec
  // qui partager, à probabilité rigoureusement identique.
  const SHARING_CHOICES = [
    { key: 'all', label: '전체', bounds: null, note: '조건 없음' },
    { key: 'below', label: '평균 이하', bounds: [0, 1.0], note: '지표 ≤ 1.00' },
    { key: 'rare', label: '적게 팔린', bounds: [0, 0.90], note: '지표 ≤ 0.90' },
  ]
  let sharingPick = $state('all')
  function pickSharing(key) {
    sharingPick = key
    filters.sharing = SHARING_CHOICES.find((c) => c.key === key).bounds
  }
  let include = $state([])
  let exclude = $state([])
  let count = $state(5)
  let seed = $state(2026)

  // Trois variables séparées, et non un seul objet : un `$effect` qui lit
  // l'état qu'il écrit se rappelle lui-même sans fin. Ici l'effet n'écrit
  // que `status`, et ne lit jamais aucune des trois.
  let status = $state('idle')
  let result = $state(null)
  let failure = $state(null)

  // Ce que le générateur reçoit — reconstruit à chaque changement, et c'est
  // ce qui déclenche la recherche.
  const query = $derived({
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== null)),
    ...(include.length ? { include } : {}),
    ...(exclude.length ? { exclude } : {}),
  })

  $effect(() => {
    const wanted = JSON.parse(JSON.stringify(query))
    const options = { sample: count, seed }
    status = 'working'
    search('lotto', wanted, options)
      .then((found) => { result = found; failure = null; status = 'ready' })
      .catch((error) => {
        if (isSkipped(error)) return
        result = null; failure = error; status = 'failed'
      })
  })

  const grids = $derived.by(() => {
    const r = result
    if (!r) return []
    const out = []
    for (let i = 0; i < r.count; i++) out.push(r.grids.slice(i * PICK, (i + 1) * PICK))
    return out
  })

  const odds = $derived(result && result.kept
    ? TOTAL_COMBINATIONS / result.kept : null)

  const reroll = () => { seed = (seed * 1103515245 + 12345) >>> 8 }
  const clearAll = () => {
    filters = { total: null, ac: null, low: null, odd: null,
                primes: null, headSum: null, tailSum: null, sharing: null }
    include = []
    exclude = []
    sharingPick = 'all'
  }
  const activeCount = $derived(
    Object.values(filters).filter((v) => v !== null).length
    + (include.length ? 1 : 0) + (exclude.length ? 1 : 0))
</script>

<section class="panel">
  <div class="head">
    <h2>생성기</h2>
    <span class="gloss">조건에 맞는 조합 찾기</span>
    <span class="right">
      {#if status === 'working'}<span class="dim">계산 중…</span>
      {:else if result}{result.elapsedMs.toFixed(0)} ms{/if}
    </span>
  </div>

  <div class="stats">
    <Stat label="조건에 맞는 조합"
          value={result ? num(result.kept) : '—'}
          note={`전체 ${num(TOTAL_COMBINATIONS)}개 중`} />
    <Stat label="비율"
          value={result ? `${((result.kept / TOTAL_COMBINATIONS) * 100).toFixed(2)}%` : '—'} />
    <Stat label="몇 개 중 하나"
          value={odds ? `1 / ${num(Math.round(odds))}` : '—'}
          note="조건이 좁힌 정도" />
    <Stat label="적용된 조건" value={activeCount} note={activeCount ? null : '전체 조합'} />
  </div>

  {#if status === 'failed'}
    <p class="error">{failure.message}</p>
  {:else if result && result.kept === 0}
    <p class="error">
      조건을 모두 만족하는 조합이 없습니다. 아래 목록이 어느 조건에서 걸렸는지 보여줍니다.
    </p>
  {/if}

  {#if result?.rejected?.length}
    <div class="rejected">
      {#each result.rejected.slice(0, 6) as row (row.key)}
        <span class="chip">{row.label}<span class="n">{num(row.rejected)}</span></span>
      {/each}
    </div>
  {/if}
</section>

<section class="panel">
  <div class="head">
    <h2>조건</h2>
    <span class="gloss">조건마다 과거 분포를 보여줍니다</span>
    <button class="link" onclick={clearAll} disabled={!activeCount}>모두 해제</button>
  </div>

  <div class="bounds">
    <Bound label="총합" gloss="21–255" min={21} max={255}
           bind:value={filters.total} history={history.total} />
    <Bound label="AC값" gloss="0–10" min={0} max={10}
           bind:value={filters.ac} history={history.ac} />
    <Bound label="저 (1–22)" gloss="0–6개" min={0} max={6} suffix="개"
           bind:value={filters.low} history={history.low} />
    <Bound label="홀수" gloss="0–6개" min={0} max={6} suffix="개"
           bind:value={filters.odd} history={history.odd} />
    <Bound label="소수" gloss="0–6개" min={0} max={6} suffix="개"
           bind:value={filters.primes} />
    <Bound label="앞자리수합" gloss="6–27" min={6} max={27}
           bind:value={filters.headSum} />
    <Bound label="끝자리수합" gloss="0–45" min={0} max={45}
           bind:value={filters.tailSum} />
  </div>

  <div class="sharing">
    <div class="sharing-head">
      <span class="lbl">분배</span>
      <span class="gloss">같은 조합을 고른 사람이 몇 명이었는지</span>
    </div>
    <div class="sharing-pick">
      {#each SHARING_CHOICES as c (c.key)}
        <button aria-pressed={sharingPick === c.key} onclick={() => pickSharing(c.key)}>
          {c.label}<span class="n">{c.note}</span>
        </button>
      {/each}
    </div>
    <p class="sharing-note">
      1등은 정해진 금액이 아니라 <strong>나눠 갖는 몫</strong>입니다. 1 238회를 재보면
      같은 조합을 고른 사람 수는 조합의 모양에 따라 <strong>0,88배에서 1,46배</strong>까지
      달라집니다. 이 조건은 <strong>당첨 확률을 바꾸지 않습니다</strong> — 당첨됐을 때
      몇 명과 나누는지만 바꿉니다.
    </p>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>번호 지정</h2>
    <span class="gloss">고정수 · 제외수</span>
  </div>
  <NumberPad bind:include bind:exclude max={PICK} />
</section>

<section class="panel">
  <div class="head">
    <h2>추첨</h2>
    <span class="gloss">남은 조합 중에서 무작위로 뽑습니다</span>
    <span class="right">시드 {seed}</span>
  </div>

  <div class="draw-controls">
    <span class="label">개수</span>
    {#each [5, 10, 20, 45] as k (k)}
      <button aria-pressed={count === k} onclick={() => (count = k)}>{k}</button>
    {/each}
    <button class="again" onclick={reroll}>다시 뽑기</button>
  </div>

  {#if grids.length}
    <ol class="grids">
      {#each grids as row, i (i)}
        <li>
          <span class="rank">{i + 1}</span>
          <Balls numbers={row} size={30} />
          <span class="sum">합 {num(row.reduce((a, b) => a + b, 0))}</span>
          {#key row}
            {@const s = shareOf([...row])}
            <span class="share" class:rare={s.band === 'rare'}
                  title={`분배 지표 ${s.index.toFixed(3)} — 평균 대비 ${s.share.toFixed(2)}배`}>
              {s.label}
            </span>
          {/key}
        </li>
      {/each}
    </ol>
    <p class="foot">
      같은 시드는 언제나 같은 조합을 냅니다 — 다른 기기에서도, 한 달 뒤에도.
      <strong>당첨 확률은 어떤 조건을 걸어도 달라지지 않습니다.</strong>
    </p>
  {:else if status !== 'working'}
    <p class="dim">조건에 맞는 조합이 없습니다.</p>
  {/if}
</section>

<style>
  .stats {
    display: grid;
    gap: 1.25rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  }

  .sharing {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
  }

  .sharing-head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-bottom: 0.6rem;
  }

  .sharing-head .lbl { font-weight: 600; font-size: 0.875rem; }
  .sharing-head .gloss { font-size: 0.75rem; color: var(--ink-soft); }

  .sharing-pick { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  .sharing-pick button {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: none;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--ink);
    cursor: pointer;
  }

  .sharing-pick button[aria-pressed='true'] {
    border-color: var(--gold);
    box-shadow: inset 0 0 0 1px var(--gold);
  }

  .sharing-pick button .n { font-size: 0.6875rem; color: var(--ink-soft); }

  .sharing-note {
    margin: 0.75rem 0 0;
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--ink-soft);
  }

  .share {
    margin-left: 0.5rem;
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.6875rem;
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .share.rare { border-color: var(--gold); color: var(--ink); }

  .error {
    margin: 1.25rem 0 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-left: 2px solid var(--gold);
    border-radius: var(--radius);
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }

  /* Combien de grilles chaque critère a écartées : ce qui répond à
     « pourquoi si peu ? » sans avoir à tâtonner. */
  .rejected { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 1.25rem; }
  .chip {
    display: inline-flex;
    gap: 0.35rem;
    font-size: 0.6875rem;
    color: var(--muted);
    border: 1px solid var(--line-soft);
    border-radius: 2px;
    padding: 0.15rem 0.4rem;
  }
  .chip .n { color: var(--ink-soft); }

  .link { border: 0; margin-left: auto; font-size: 0.75rem; color: var(--muted); }
  .link:hover:not(:disabled) { border: 0; color: var(--gold); }
  .link:disabled { color: var(--line); cursor: default; }

  .bounds {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  }

  .draw-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }
  .draw-controls .label { margin-right: 0.25rem; }
  .draw-controls button { font-size: 0.75rem; }
  .again { margin-left: auto; border-color: var(--gold); color: var(--gold); }

  .grids { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
  .grids li {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.35rem 0;
    border-top: 1px solid var(--line-soft);
  }
  .grids li:first-child { border-top: 0; }
  .rank {
    width: 1.5rem;
    font-size: 0.6875rem;
    color: var(--muted);
    text-align: right;
  }
  .sum { margin-left: auto; font-size: 0.75rem; color: var(--muted); white-space: nowrap; }

  .foot {
    margin: 1.25rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-soft);
    line-height: 1.6;
  }
  .foot strong { color: var(--ink); font-weight: 600; }
</style>
