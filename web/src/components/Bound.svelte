<script>
  // Un critère à bornes, avec son contexte.
  //
  // Le petit histogramme au-dessus des curseurs n'est pas un ornement :
  // c'est la distribution réelle des tirages passés pour ce critère. Sans
  // lui, on choisit des bornes à l'aveugle et on s'étonne de ne rien
  // trouver. Avec lui, on voit qu'un 총합 sous 90 n'est presque jamais
  // arrivé avant même de bouger le curseur.
  let {
    label, gloss = null, min, max,
    value = $bindable(null),          // [lo, hi] ou null quand le critère dort
    history = null,                   // tableau de valeurs observées
    suffix = '',
  } = $props()

  const active = $derived(value !== null)

  // La distribution passée, ramenée aux bornes du critère.
  const bars = $derived.by(() => {
    if (!history) return null
    const span = max - min + 1
    const counts = new Array(span).fill(0)
    for (const v of history) {
      const k = v - min
      if (k >= 0 && k < span) counts[k]++
    }
    const peak = Math.max(1, ...counts)
    return counts.map((c) => c / peak)
  })

  function toggle() {
    value = active ? null : [min, max]
  }

  function setLow(next) {
    const lo = Math.min(Number(next), value[1])
    value = [lo, value[1]]
  }

  function setHigh(next) {
    const hi = Math.max(Number(next), value[0])
    value = [value[0], hi]
  }
</script>

<div class="bound" class:active>
  <div class="top">
    <button class="toggle" aria-pressed={active} onclick={toggle}>{label}</button>
    {#if gloss && !active}<span class="gloss">{gloss}</span>{/if}
    {#if active}
      <span class="read">{value[0]}{suffix} – {value[1]}{suffix}</span>
      <button class="clear" onclick={toggle} aria-label="해제">✕</button>
    {/if}
  </div>

  {#if active}
    {#if bars}
      <div class="spark" aria-hidden="true">
        {#each bars as height, k (k)}
          {@const v = min + k}
          <span class="tick" class:inside={v >= value[0] && v <= value[1]}
                style="--h: {Math.max(0.06, height)}"></span>
        {/each}
      </div>
    {/if}
    <div class="sliders">
      <input type="range" {min} {max} value={value[0]}
             oninput={(e) => setLow(e.currentTarget.value)} aria-label="{label} 최소" />
      <input type="range" {min} {max} value={value[1]}
             oninput={(e) => setHigh(e.currentTarget.value)} aria-label="{label} 최대" />
    </div>
  {/if}
</div>

<style>
  .bound {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .bound.active { border-color: var(--gold); }

  .top { display: flex; align-items: center; gap: 0.5rem; }

  .toggle {
    border: 0;
    padding: 0;
    font-size: 0.875rem;
    color: var(--ink-soft);
    background: none;
  }
  .toggle:hover { border: 0; color: var(--ink); }
  .bound.active .toggle { color: var(--gold); font-weight: 600; }

  .gloss { font-size: 0.6875rem; color: var(--muted); }
  .read { margin-left: auto; font-size: 0.8125rem; }
  .clear { border: 0; color: var(--muted); padding: 0 0.15rem; font-size: 0.75rem; }
  .clear:hover { border: 0; color: var(--ink); }

  /* La distribution passée : les barres hors des bornes choisies restent
     visibles mais s'effacent — on voit ce qu'on écarte. */
  .spark {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 26px;
    margin: 0.5rem 0 0.15rem;
  }
  .tick {
    flex: 1;
    height: calc(var(--h) * 100%);
    background: var(--line);
    border-radius: 1px 1px 0 0;
    min-width: 1px;
  }
  .tick.inside { background: var(--gold-bright); }

  .sliders { display: grid; gap: 2px; }

  input[type='range'] {
    width: 100%;
    height: 14px;
    accent-color: var(--gold);
    cursor: pointer;
  }
</style>
