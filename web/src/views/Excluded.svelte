<script>
  // L'onglet 제외번호.
  //
  // Il remplace la table `customeruser_deletenumber` (1 124 lignes, 135
  // colonnes) et l'écran `deletenumberlist` qui la relisait. Rien n'est
  // stocké : les dix tirages précédents se recomptent en un dixième de
  // milliseconde.
  //
  // Et il montre ce que l'ancien écran ne montrait pas : le taux attendu.
  // Sans lui, « 81 % des numéros gagnants étaient déjà sortis dans les dix
  // derniers tirages » ressemble à une trouvaille. Avec lui, on voit que
  // c'est la taille du vivier qui parle, pas les numéros.
  import { EXCLUDED_WINDOW, excluded, excludedHitRate } from '@core/patterns.js'
  import { periodogram } from '@core/spectrum.js'

  import Balls from '../components/Balls.svelte'
  import Compare from '../components/Compare.svelte'
  import Periodogram from '../components/Periodogram.svelte'
  import RangPick from '../components/RangPick.svelte'
  import { day, num, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'

  let { draws } = $props()

  const firstUsable = $derived(draws.n > EXCLUDED_WINDOW ? draws.rangs[EXCLUDED_WINDOW] : null)

  // Le 회차 demandé, et celui qu'on affiche vraiment. Les deux diffèrent
  // quand la demande sort de l'historique — on retombe alors sur le dernier
  // tirage plutôt que sur une erreur. Un `$effect` qui corrigerait `picked`
  // relirait ce qu'il vient d'écrire : c'est la boucle infinie classique.
  let picked = $state(null)
  const current = $derived.by(() => {
    const last = draws.rangs[draws.n - 1]
    if (picked === null) return last
    if (picked < firstUsable || picked > last) return last
    return picked
  })

  const rows = $derived(firstUsable === null ? null : excluded(draws, current))
  const index = $derived(draws.indexOf(current))

  // Le vivier : les numéros vus au moins une fois dans la fenêtre. C'est
  // lui qu'on « exclut » — d'où son complément, les vrais candidats.
  const pool = $derived(rows ? rows.filter((r) => r.count > 0) : [])
  const fresh = $derived(rows ? rows.filter((r) => r.count === 0) : [])
  const fromPool = $derived(rows ? rows.filter((r) => r.won && r.count > 0).length : 0)

  const frame = $derived.by(() => {
    const out = []
    for (let j = index - EXCLUDED_WINDOW; j < index; j++) {
      out.push({ rang: draws.rangs[j], date: draws.dates[j], numbers: [...draws.fullAt(j)] })
    }
    return out
  })

  const winners = $derived([...draws.sequenceAt(index)])
  const stats = $derived(draws.n > EXCLUDED_WINDOW + 1 ? excludedHitRate(draws) : null)

  // Combien des sept gagnants venaient du vivier, 회차 par 회차 : le
  // comptage contre la loi, et la série elle-même passée au périodogramme.
  const statRows = $derived(stats
    ? Array.from(stats.counts, (c, k) => ({ key: k, obs: c, exp: stats.law[k] }))
    : [])
  const statSpec = $derived(stats ? periodogram(Array.from(stats.series)) : null)

  const pct = (v) => `${(v * 100).toFixed(2)} %`
</script>

{#if firstUsable === null}
  <section class="panel">
    <p class="dim">제외번호는 11회차부터 계산됩니다 — 이 구간에는 회차가 부족합니다.</p>
  </section>
{:else}
  <section class="panel bar">
    <div class="head-inline">
      <h2>제외번호</h2>
      <span class="gloss">직전 10회차</span>
    </div>
    <RangPick {draws} value={current} onpick={(r) => (picked = r)} min={firstUsable} />
  </section>

  <section class="panel">
    <div class="head">
      <h2>{fmt(current)}</h2>
      <span class="gloss">{day(draws.dates[index])}</span>
      <span class="right">당첨번호</span>
    </div>
    <Balls numbers={winners.slice(0, 6)} bonus={winners[6]} size={40} />

    <div class="counts">
      <div class="cell">
        <span class="label">직전 {EXCLUDED_WINDOW}회 출현</span>
        <span class="figure">{num(pool.length)}</span>
        <span class="dim">개 번호</span>
      </div>
      <div class="cell">
        <span class="label">미출현</span>
        <span class="figure">{num(fresh.length)}</span>
        <span class="dim">개 번호</span>
      </div>
      <div class="cell">
        <span class="label">이번 당첨 중 출현 번호</span>
        <span class="figure">{num(fromPool)}</span>
        <span class="dim">/ 7</span>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>번호별 출현 횟수</h2>
      <span class="gloss">직전 {EXCLUDED_WINDOW}회 · 보너스 포함 · 70개</span>
      <span class="right">테두리 두 줄 = 이번 회차 당첨</span>
    </div>

    <div class="board">
      {#each rows as row (row.number)}
        <div class="cell-n" class:zero={row.count === 0} class:won={row.won}
             style="--tone: var({SECTION_VARS[sectionOf(row.number)]})">
          <span class="n">{row.number}</span>
          <span class="c">{row.count || '·'}</span>
        </div>
      {/each}
    </div>

    <p class="note dim">
      45개 번호가 {EXCLUDED_WINDOW}회에 70번 나오므로, 한 번호의 평균 출현은
      {(EXCLUDED_WINDOW * 7 / 45).toFixed(2)}회입니다.
    </p>
  </section>

  {#if stats}
    <section class="panel">
      <div class="head">
        <h2>제외가 통하는가</h2>
        <span class="gloss">관측 대 기대</span>
        <span class="right">{num(stats.rounds)}회차</span>
      </div>

      <div class="verdict">
        <div class="cell">
          <span class="label">직전 {EXCLUDED_WINDOW}회에 나온 번호가 당첨된 비율</span>
          <span class="figure">{pct(stats.rate)}</span>
          <span class="dim">{num(stats.hits)} / {num(stats.total)}</span>
        </div>
        <div class="cell">
          <span class="label">무관할 때의 기대치</span>
          <span class="figure dim">{pct(stats.expectedRate)}</span>
          <span class="dim">{num(Math.round(stats.expected))} / {num(stats.total)}</span>
        </div>
        <div class="cell">
          <span class="label">차이</span>
          <span class="figure" class:flat={Math.abs(stats.rate - stats.expectedRate) < 0.01}>
            {(stats.rate - stats.expectedRate >= 0 ? '+' : '') +
             ((stats.rate - stats.expectedRate) * 100).toFixed(2)} p
          </span>
        </div>
      </div>

      <div class="block">
        <Compare rows={statRows} suffix="개" keyWidth="2.5rem" mark={fromPool}
                 obsLabel="당첨 7개 중 출현 번호" expLabel="기대 (초기하)" />
      </div>

      <p class="note soft">
        기대치는 회차마다 다릅니다 — 직전 {EXCLUDED_WINDOW}회에 나온 번호의 개수가
        매번 달라지기 때문입니다. 그 개수를 감안하면 관측치와 기대치가 거의 같습니다.
        <strong>최근에 나왔다는 이유로 번호를 제외할 근거는 이 데이터에 없습니다.</strong>
      </p>

      <div class="block">
        <Periodogram result={statSpec} label="제외 주기도"
                     gloss="「이미 나온」 당첨번호 수에 리듬이 있는가?" />
      </div>
    </section>
  {/if}

  <section class="panel">
    <div class="head">
      <h2>대상 회차</h2>
      <span class="gloss">대상 구간 자체</span>
    </div>
    <div class="stack">
      {#each frame as w (w.rang)}
        <div class="line">
          <span class="rang">{fmt(w.rang)}</span>
          <span class="date dim">{day(w.date)}</span>
          <Balls numbers={w.numbers} size={28} />
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .block { margin-top: 1rem; }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding-top: 0.85rem;
    padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .counts, .verdict {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 1rem;
    margin-top: 1.25rem;
    padding-top: 1.1rem;
    border-top: 1px solid var(--line-soft);
  }
  .cell { display: flex; flex-direction: column; gap: 0.15rem; }
  .cell .dim { font-size: 0.75rem; }
  .figure.flat { color: var(--muted); }

  /* La planche des 45. Aucun aplat sous un chiffre : c'est le filet qui
     porte la tranche de dizaines, et l'effectif s'écrit dessous. */
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(3.25rem, 1fr));
    gap: 0.4rem;
  }
  .cell-n {
    border: 1px solid var(--tone);
    border-radius: var(--radius);
    padding: 0.35rem 0.2rem 0.3rem;
    text-align: center;
    background: var(--surface);
  }
  .cell-n .n {
    display: block;
    font-family: var(--figure);
    font-size: 1rem;
    line-height: 1.1;
    color: var(--tone);
  }
  .cell-n .c {
    display: block;
    font-size: 0.6875rem;
    color: var(--ink-soft);
  }
  /* Jamais sorti dans la fenêtre : le filet s'efface, le chiffre reste. */
  .cell-n.zero { border-color: var(--line); }
  .cell-n.zero .n { color: var(--muted); }
  .cell-n.zero .c { color: var(--muted); }
  /* Sorti au 회차 regardé : un second trait, à l'intérieur. Pas un fond. */
  .cell-n.won {
    box-shadow: inset 0 0 0 1px var(--surface), inset 0 0 0 2.5px var(--tone);
  }
  .cell-n.won .c { color: var(--ink); font-weight: 600; }

  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.6; }
  .note strong { color: var(--ink); font-weight: 600; }

  .stack { display: grid; gap: 0.5rem; }
  .line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.3rem 0;
  }
  .line + .line { border-top: 1px solid var(--line-soft); }
  .rang { font-size: 0.8125rem; min-width: 4.5rem; }
  .date { font-size: 0.75rem; min-width: 8.5rem; }
</style>
