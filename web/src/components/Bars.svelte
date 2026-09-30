<script>
  // Un histogramme. Des barres horizontales, pas de graphique : sur une
  // vingtaine de valeurs entières, l'axe et les graduations d'un vrai
  // graphique n'ajoutent rien qu'on ne lise déjà dans la longueur.
  //
  // `data` est un objet { valeur: effectif } — ce que rendent
  // `analysis.distribution` et `flowSummary`.
  import { num } from '../lib/format.js'

  // `keyWidth` : la colonne des étiquettes. Quatre caractères tiennent dans
  // la valeur par défaut ; « 이십점멸구간 » en fait six et se casserait en deux.
  // `marks` : plusieurs lignes à surligner d'un coup — une fourchette de 총합.
  let { data = {}, mark = null, marks = [], suffix = '', keyWidth = '4.75rem' } = $props()

  const entries = $derived(Object.entries(data))
  const max = $derived(Math.max(1, ...entries.map(([, n]) => n)))
  const total = $derived(entries.reduce((a, [, n]) => a + n, 0))
</script>

<div class="bars" style="--keyw: {keyWidth}">
  {#each entries as [value, count] (value)}
    <!-- Comparaison en texte : une classe regroupée s'appelle « 90–99 »,
         pas 90, et `Number('90–99')` ne vaut rien. -->
    {@const active = (mark !== null && String(value) === String(mark)) || marks.includes(String(value))}
    <div class="row" class:active>
      <span class="key">{value}{suffix}</span>
      <span class="track">
        <span class="fill" style="width: {(count / max) * 100}%"></span>
      </span>
      <span class="count">{num(count)}</span>
      <span class="pct">{total ? ((count / total) * 100).toFixed(1) : '0.0'}%</span>
    </div>
  {/each}
</div>

<style>
  .bars { display: grid; gap: 2px; }

  .row {
    display: grid;
    grid-template-columns: var(--keyw, 4.75rem) 1fr 3rem 3.25rem;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    padding: 1px 0;
  }

  .key { color: var(--ink-soft); text-align: right; }
  .count { text-align: right; }
  .pct { text-align: right; color: var(--muted); font-size: 0.75rem; }

  .track {
    height: 9px;
    background: var(--line-soft);
    border-radius: 1px;
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--gold-bright);
    opacity: 0.5;
  }

  /* La valeur du dernier tirage, repérée dans sa propre distribution : la
     seule chose qui répond à « et celui-ci, il est où là-dedans ? ». */
  .active .key { color: var(--gold); font-weight: 600; }
  .active .fill { opacity: 1; background: var(--gold); }
  .active .count { font-weight: 600; }
</style>
