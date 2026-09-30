<script>
  // 구간 — les cinq tranches de dizaines.
  //
  // Deux lectures. En haut, la répartition d'ensemble : combien de numéros
  // chaque tranche a fourni sur la période, comparé à ce qu'elle
  // fournirait si tout était uniforme — une tranche de 6 numéros sur 45 ne
  // peut pas produire autant qu'une de 10.
  //
  // En dessous, tirage par tirage : cinq cases par ligne, teintées selon
  // combien de numéros la tranche a donné. C'est ce que les 12 classes
  // `section*` de l'ancien code affichaient une par une.
  import { sections } from '@core/analysis.js'
  import { SECTIONS } from '@core/draws.js'
  import { num, SECTION_LABELS, SECTION_VARS } from '../lib/format.js'

  let { draws, rows = 24 } = $props()

  const counts = $derived(sections(draws))
  const width = SECTIONS.length

  const totals = $derived.by(() => {
    const out = new Array(width).fill(0)
    for (let i = 0; i < draws.n; i++) {
      for (let s = 0; s < width; s++) out[s] += counts[i * width + s]
    }
    return out
  })

  const drawn = $derived(totals.reduce((a, b) => a + b, 0))

  // La part « attendue » : la taille de la tranche rapportée à 45. C'est le
  // seul repère qui rend un écart lisible.
  const expected = $derived(
    SECTIONS.map(([lo, hi]) => (hi - lo + 1) / 45))

  const recent = $derived(
    Array.from({ length: Math.min(rows, draws.n) }, (_, k) => draws.n - 1 - k))
</script>

<section class="panel">
  <div class="head">
    <h2>구간</h2>
    <span class="gloss">10단위 다섯 구간</span>
    <span class="right">{num(draws.n)}회 · 보너스 포함</span>
  </div>

  <div class="summary">
    {#each SECTION_LABELS as label, s (label)}
      {@const share = drawn ? totals[s] / drawn : 0}
      {@const points = (share - expected[s]) * 100}
      <div class="band">
        <div class="swatch" style="background: var({SECTION_VARS[s]})"></div>
        <div class="band-label">{label}</div>
        <div class="band-figure">{(share * 100).toFixed(1)}<span class="pct">%</span></div>
        <div class="band-gap" class:up={points >= 0.05} class:down={points <= -0.05}>
          {Math.abs(points) < 0.05 ? '기대대로'
            : `${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)}p`}
        </div>
        <div class="band-note">{num(totals[s])}개 · 기대 {(expected[s] * 100).toFixed(1)}%</div>
      </div>
    {/each}
  </div>

  <div class="scroll">
    <table class="matrix">
      <thead>
        <tr>
          <th>회차</th>
          {#each SECTION_LABELS as label, s (label)}
            <th style="color: var({SECTION_VARS[s]})">{label}</th>
          {/each}
          <th>번호</th>
        </tr>
      </thead>
      <tbody>
        {#each recent as i (i)}
          <tr class:now={i === draws.n - 1}>
            <td>{num(draws.rangs[i])}</td>
            {#each SECTION_LABELS as _, s (s)}
              {@const c = counts[i * width + s]}
              <td class="cell">
                <span class="pill" style="--tone: var({SECTION_VARS[s]})"
                      class:empty={c === 0}>
                  <span class="count">{c || '·'}</span>
                  <span class="rule" style="--fill: {c / 4}"></span>
                </span>
              </td>
            {/each}
            <td class="nums dim">
              {[...draws.fullAt(i)].join(' ')}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 1rem;
    margin-bottom: 1.75rem;
  }

  .band { min-width: 0; }
  .swatch { height: 3px; border-radius: 2px; margin-bottom: 0.5rem; }
  .band-label { font-size: 0.8125rem; color: var(--ink-soft); }
  .band-figure {
    font-family: var(--figure);
    font-size: 1.5rem;
    line-height: 1.2;
  }
  .pct { font-size: 0.875rem; color: var(--muted); margin-left: 1px; }
  .band-gap { font-size: 0.75rem; color: var(--muted); }
  .band-gap.up { color: var(--gold); }
  .band-gap.down { color: var(--muted); }
  .band-note { font-size: 0.6875rem; color: var(--muted); margin-top: 0.15rem; }

  .matrix th, .matrix td { text-align: center; }
  .matrix th:first-child, .matrix td:first-child,
  .matrix th:last-child, .matrix td:last-child { text-align: left; }

  .cell { padding: 2px 4px; }

  /* Le compte est écrit dans la teinte de sa tranche, et souligné d'un trait
     dont la longueur vaut ce compte. Aucun fond : le trait porte l'intensité
     que l'aplat portait avant, et se lit de la même façon en diagonale. */
  .pill {
    display: grid;
    gap: 2px;
    justify-items: center;
    color: var(--tone);
    font-size: 0.75rem;
    min-width: 2.25rem;
  }
  .pill.empty { color: var(--line); }
  .rule {
    display: block;
    width: calc(var(--fill) * 100%);
    height: 2px;
    border-radius: 1px;
    background: var(--tone);
  }
  .pill.empty .rule { background: none; }

  .nums {
    font-size: 0.75rem;
    letter-spacing: 0.02em;
    white-space: nowrap;
    padding-left: 0.75rem;
  }

  tr.now td:first-child { color: var(--gold); font-weight: 600; }
</style>
