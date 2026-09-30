<script>
  // La planche des 45 numéros, en cases à cocher.
  //
  // Sert au 추가번호 comme au 제외번호 : c'est le même geste, seule la
  // couleur du trait change. Le chiffre garde son fond blanc dans les deux
  // cas — la sélection se lit dans le filet, pas dans un aplat.
  import { NMAX } from '@core/draws.js'
  import { sectionOf, SECTION_VARS } from '../lib/format.js'

  let {
    selected = $bindable([]),
    tone = 'gold',            // 'gold' pour 추가, 'strike' pour 제외
    disabled = new Set(),     // numéros hors du vivier, non cochables
  } = $props()

  const numbers = Array.from({ length: NMAX }, (_, i) => i + 1)
  const chosen = $derived(new Set(selected))

  function toggle(n) {
    if (disabled.has(n)) return
    selected = chosen.has(n)
      ? selected.filter((v) => v !== n)
      : [...selected, n].sort((a, b) => a - b)
  }
</script>

<div class="board" class:strike={tone === 'strike'}>
  {#each numbers as n (n)}
    <label class="cell" class:on={chosen.has(n)} class:off={disabled.has(n)}
           style="--tone: var({SECTION_VARS[sectionOf(n)]})">
      <input type="checkbox" checked={chosen.has(n)} disabled={disabled.has(n)}
             onchange={() => toggle(n)} />
      <span class="n">{n}</span>
    </label>
  {/each}
</div>

{#if selected.length}
  <p class="picked">
    {selected.join(', ')}
    <button onclick={() => (selected = [])}>지우기</button>
  </p>
{/if}

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.4rem, 1fr));
    gap: 0.3rem;
  }

  .cell {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--surface);
    cursor: pointer;
    transition: border-color .12s;
  }
  .cell:hover:not(.off) { border-color: var(--tone); }

  .cell input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .cell input:focus-visible ~ .n { outline: 2px solid var(--gold-bright); outline-offset: 3px; }

  .n {
    font-family: var(--figure);
    font-size: 0.875rem;
    color: var(--ink-soft);
    line-height: 1;
  }

  /* 추가번호 : un double anneau à la couleur de la tranche de dizaines. */
  .cell.on { border-color: var(--tone); box-shadow: inset 0 0 0 2px var(--surface), inset 0 0 0 3px var(--tone); }
  .cell.on .n { color: var(--tone); font-weight: 600; }

  /* 제외번호 : le chiffre est barré, et le cercle s'efface. Rien de rouge —
     ce n'est pas une erreur, c'est un choix. */
  .strike .cell.on { box-shadow: none; border-style: dashed; border-color: var(--muted); }
  .strike .cell.on .n { color: var(--muted); text-decoration: line-through; font-weight: 400; }

  /* Hors du vivier : ni cochable, ni tout à fait invisible. */
  .cell.off { cursor: default; border-color: var(--line-soft); background: var(--paper); }
  .cell.off .n { color: var(--line); }

  .picked {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-soft);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .picked button { font-size: 0.6875rem; padding: 0.1rem 0.4rem; color: var(--muted); }
</style>
