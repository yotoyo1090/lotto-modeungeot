<script>
  // Le sélecteur de période d'un bloc — les mêmes mots que la barre du haut.
  //
  // Il se pose dans l'en-tête du bloc, à côté de son titre : le réglage est
  // là où on regarde, pas dans une barre qu'il faut remonter chercher.
  //
  // Par défaut il est sur 따름 : le bloc suit la barre générale et rien ne
  // change tant qu'on n'y touche pas. Dès qu'on choisit, le bloc se détache
  // et le dit — sinon on lirait un tableau sur 50 회차 en croyant le lire
  // sur 1 134.
  import { SCOPES, follows } from '../lib/scope.js'
  import { num } from '../lib/format.js'

  let { span = $bindable('follow'), first, last, compact = false } = $props()

  let open = $state(false)
  let from = $state(null)
  let to = $state(null)

  function apply() {
    const a = Number(from)
    const b = Number(to)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) return
    span = [Math.max(first, a), Math.min(last, b)]
    open = false
  }
</script>

<div class="scope" class:compact class:free={!follows(span)}>
  {#each SCOPES as s (s.key)}
    <button aria-pressed={span === s.key}
            onclick={() => { span = s.key; open = false }}>{s.label}</button>
  {/each}
  <button aria-pressed={Array.isArray(span)} onclick={() => (open = !open)}>
    {Array.isArray(span) ? `${num(span[0])}–${num(span[1])}회` : '회차 지정'}
  </button>
</div>

{#if open}
  <div class="custom">
    <input type="number" min={first} max={last} placeholder={String(first)} bind:value={from} />
    <span class="dash">–</span>
    <input type="number" min={first} max={last} placeholder={String(last)} bind:value={to} />
    <button class="go" onclick={apply}>적용</button>
  </div>
{/if}

<style>
  .scope { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
  .scope button { font-size: 0.6875rem; padding: 0.12rem 0.42rem; }
  .compact button { font-size: 0.625rem; padding: 0.1rem 0.35rem; }

  /* Un bloc détaché de la barre générale porte un filet doré : on doit voir
     d'un coup d'œil qu'il ne montre pas la même période que ses voisins. */
  .free { box-shadow: inset 0 -2px 0 var(--gold-soft); padding-bottom: 0.2rem; }

  .custom { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.45rem; }
  input {
    font: inherit; width: 5.5rem; padding: 0.2rem 0.4rem;
    border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--surface); color: inherit; font-size: 0.75rem;
  }
  input:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 1px; }
  .dash { color: var(--muted); }
  .go { font-size: 0.6875rem; border-color: var(--gold); color: var(--gold); }
</style>
