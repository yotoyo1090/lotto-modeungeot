<script>
  // Le choix d'un 회차.
  //
  // Un `<select>` natif plutôt qu'une liste maison : mille options, ça se
  // fait défiler au doigt sur un téléphone et ça se tape au clavier sur un
  // ordinateur, gratuitement. Les deux flèches servent au pas à pas, qui
  // est ce qu'on fait le plus souvent.
  //
  // Pas de `bind:` ici mais une valeur et un rappel. Le parent garde le
  // droit de refuser — quand la période change, le 회차 choisi peut ne
  // plus exister, et c'est à lui de décider ce qu'il affiche à la place.
  import { day, rang as fmt } from '../lib/format.js'

  let { draws, value, onpick, min = null } = $props()

  // Du plus récent au plus ancien. `min` écarte les 회차 pour lesquels
  // l'écran n'a rien à montrer — le 제외번호 n'existe pas avant le onzième.
  const options = $derived.by(() => {
    const out = []
    for (let i = draws.n - 1; i >= 0; i--) {
      if (min !== null && draws.rangs[i] < min) break
      out.push({ rang: draws.rangs[i], date: draws.dates[i] })
    }
    return out
  })

  const first = $derived(options.length ? options.at(-1).rang : null)
  const last = $derived(options.length ? options[0].rang : null)

  function step(delta) {
    const next = value + delta
    if (next >= first && next <= last) onpick(next)
  }
</script>

<div class="pick">
  <button onclick={() => step(-1)} disabled={value <= first}
          aria-label="이전 회차">‹</button>

  <select {value} onchange={(e) => onpick(Number(e.currentTarget.value))} aria-label="회차">
    {#each options as o (o.rang)}
      <option value={o.rang}>{fmt(o.rang)} · {day(o.date)}</option>
    {/each}
  </select>

  <button onclick={() => step(1)} disabled={value >= last}
          aria-label="다음 회차">›</button>

  <button class="now" onclick={() => onpick(last)} disabled={value === last}>
    최신
  </button>
</div>

<style>
  .pick { display: flex; align-items: center; gap: 0.35rem; }

  select {
    font: inherit;
    font-size: 0.8125rem;
    color: inherit;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0.3rem 0.5rem;
    max-width: 15rem;
  }
  select:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 2px; }

  button { padding: 0.3rem 0.6rem; line-height: 1; }
  button:disabled { color: var(--muted); border-color: var(--line-soft); cursor: default; }
  button:disabled:hover { border-color: var(--line-soft); }
  .now { font-size: 0.75rem; }
</style>
