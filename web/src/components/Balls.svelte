<script>
  // Les boules d'un tirage.
  //
  // Aucun aplat sous un chiffre : le cercle reste blanc, la couleur est dans
  // le trait et dans le chiffre. C'est la tranche de dizaines — donc
  // l'analyse 구간 elle-même, pas une décoration.
  //
  // Un numéro repris du tirage précédent (이월) reçoit un second anneau
  // plutôt qu'un remplissage. Il se distingue d'aussi loin, sans que le
  // chiffre perde son fond blanc.
  import { sectionOf, SECTION_VARS } from '../lib/format.js'

  let {
    numbers = [],
    bonus = null,
    size = 40,
    highlight = new Set(),
  } = $props()
</script>

<div class="balls" style="--size: {size}px">
  {#each numbers as n (n)}
    <span class="ball" class:carried={highlight.has(n)}
          style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
  {/each}
  {#if bonus !== null}
    <span class="plus" aria-hidden="true">+</span>
    <span class="ball bonus" class:carried={highlight.has(bonus)}
          style="--tone: var(--gold)">{bonus}</span>
  {/if}
</div>

<style>
  .balls {
    display: flex;
    align-items: center;
    gap: calc(var(--size) * 0.18);
    flex-wrap: wrap;
  }

  .ball {
    width: var(--size);
    height: var(--size);
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1.5px solid var(--tone);
    color: var(--tone);
    font-family: var(--figure);
    font-size: calc(var(--size) * 0.42);
    line-height: 1;
    background: var(--surface);
  }

  /* 이월 : un anneau intérieur, tracé en ombre vers l'intérieur. Deux traits
     au lieu d'un aplat — le chiffre garde son fond blanc. */
  .ball.carried {
    box-shadow: inset 0 0 0 2px var(--surface), inset 0 0 0 3.5px var(--tone);
  }

  /* Le bonus : un trait discontinu, pas un fond. */
  .ball.bonus { border-style: dashed; }

  .plus {
    color: var(--muted);
    font-size: calc(var(--size) * 0.4);
    margin: 0 calc(var(--size) * 0.06);
  }
</style>
