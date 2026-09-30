<script>
  // Le sélecteur de période.
  //
  // Il commande les quatre blocs à la fois. C'est possible parce que rien
  // n'est précalculé : changer la période relance les analyses, et elles
  // prennent 7 millisecondes. L'ancienne plateforme aurait eu besoin d'une
  // table par période.
  import { num } from '../lib/format.js'

  let { total, first, last, span = $bindable('all') } = $props()

  const PRESETS = [
    { key: 'all', label: '전체' },
    { key: 200, label: '최근 200' },
    { key: 100, label: '최근 100' },
    { key: 50, label: '최근 50' },
  ]

  let custom = $state({ from: null, to: null })
  let open = $state(false)

  function apply() {
    const from = Number(custom.from)
    const to = Number(custom.to)
    if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) return
    span = [Math.max(first, from), Math.min(last, to)]
    open = false
  }
</script>

<div class="range">
  {#each PRESETS as preset (preset.key)}
    <button aria-pressed={span === preset.key}
            onclick={() => (span = preset.key)}>{preset.label}</button>
  {/each}

  <button aria-pressed={Array.isArray(span)} onclick={() => (open = !open)}>
    {Array.isArray(span) ? `${num(span[0])}–${num(span[1])}회` : '회차 지정'}
  </button>

  <span class="count">{num(total)}회</span>
</div>

{#if open}
  <div class="custom">
    <input type="number" min={first} max={last} placeholder={String(first)}
           bind:value={custom.from} />
    <span class="dash">–</span>
    <input type="number" min={first} max={last} placeholder={String(last)}
           bind:value={custom.to} />
    <button class="on" onclick={apply}>적용</button>
  </div>
{/if}

<style>
  .range { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
  .range button { font-size: 0.8125rem; }
  .count {
    margin-left: 0.35rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .custom {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }
  input {
    font: inherit;
    width: 6rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: inherit;
  }
  input:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 1px; }
  .dash { color: var(--muted); }
</style>
