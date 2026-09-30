<script>
  // 고정수 / 제외수 — le clavier des 45 numéros.
  //
  // Un clic fait tourner l'état : neutre → 고정 (obligatoire) → 제외
  // (interdit) → neutre. Un seul geste pour les deux listes, au lieu de deux
  // champs de saisie séparés où l'on peut écrire un numéro dans les deux.
  //
  // Aucun aplat : le numéro garde son fond, l'état est porté par le trait.
  import { NMAX } from '@core/draws.js'
  import { sectionOf, SECTION_VARS } from '../lib/format.js'

  let { include = $bindable([]), exclude = $bindable([]), max = 6 } = $props()

  const numbers = Array.from({ length: NMAX }, (_, k) => k + 1)
  const inSet = $derived(new Set(include))
  const outSet = $derived(new Set(exclude))

  function cycle(n) {
    if (inSet.has(n)) {
      include = include.filter((x) => x !== n)
      exclude = [...exclude, n].sort((a, b) => a - b)
    } else if (outSet.has(n)) {
      exclude = exclude.filter((x) => x !== n)
    } else {
      if (include.length >= max) return
      include = [...include, n].sort((a, b) => a - b)
    }
  }

  const reset = () => { include = []; exclude = [] }
</script>

<div class="pad">
  <div class="row">
    <span class="label">고정수</span>
    <span class="value">{include.length ? include.join(' · ') : '없음'}</span>
    <span class="cap">{include.length}/{max}</span>
  </div>
  <div class="row">
    <span class="label">제외수</span>
    <span class="value">{exclude.length ? exclude.join(' · ') : '없음'}</span>
    <button class="reset" onclick={reset} disabled={!include.length && !exclude.length}>
      초기화
    </button>
  </div>

  <div class="keys">
    {#each numbers as n (n)}
      <button class="key"
              class:on={inSet.has(n)} class:off={outSet.has(n)}
              style="--tone: var({SECTION_VARS[sectionOf(n)]})"
              onclick={() => cycle(n)}
              title={inSet.has(n) ? '고정' : outSet.has(n) ? '제외' : '자유'}>{n}</button>
    {/each}
  </div>

  <p class="hint">클릭할 때마다 <strong>자유 → 고정 → 제외 → 자유</strong> 순으로 바뀝니다.</p>
</div>

<style>
  .row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    font-size: 0.8125rem;
    margin-bottom: 0.35rem;
  }
  .label { color: var(--muted); font-size: 0.6875rem; letter-spacing: 0.08em;
           text-transform: uppercase; min-width: 3.5rem; }
  .value { color: var(--ink-soft); }
  .cap { margin-left: auto; font-size: 0.75rem; color: var(--muted); }
  .reset { margin-left: auto; font-size: 0.6875rem; padding: 0.1rem 0.4rem; }
  .reset:disabled { color: var(--line); border-color: var(--line-soft); cursor: default; }

  .keys {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.1rem, 1fr));
    gap: 3px;
    margin: 0.9rem 0 0.6rem;
  }

  .key {
    padding: 0.3rem 0;
    font-family: var(--figure);
    font-size: 0.875rem;
    color: var(--ink-soft);
    border-color: var(--line);
  }
  .key:hover { border-color: var(--tone); color: var(--tone); }

  /* 고정 : double trait dans la teinte du 구간. 제외 : barré, effacé. */
  .key.on {
    /* La règle globale de `button.on` peint un fond doré ; ici le fond doit
       rester blanc — c'est un numéro, pas une commande. */
    background: var(--surface);
    color: var(--tone);
    border-color: var(--tone);
    box-shadow: inset 0 0 0 1px var(--tone);
    font-weight: 700;
  }
  .key.off {
    color: var(--line);
    border-color: var(--line-soft);
    text-decoration: line-through;
  }

  .hint { margin: 0; font-size: 0.6875rem; color: var(--muted); }
  .hint strong { color: var(--ink-soft); font-weight: 600; }
</style>
