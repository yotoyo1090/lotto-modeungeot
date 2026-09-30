<script>
  // 관측 대 기대 — l'histogramme de `Bars`, mais à deux séries.
  //
  // Presque tout ce que le site calcule a cette forme : une distribution
  // observée et, à côté, ce que le hasard aurait donné. `Bars` n'en dessine
  // qu'une ; ici les deux se superposent sur la même échelle, l'observé en
  // barre pleine, l'attendu en filet dessous, pour que l'œil compare sans
  // lire les chiffres. Les chiffres restent à droite pour qui les veut.
  //
  // `rows` : [{ key, obs, exp }] — la clé est affichée telle quelle
  // (« 90–99 » est une clé, pas un nombre). `mark` surligne une ligne :
  // la valeur du 회차 courant. `pct` affiche les parts au lieu des effectifs.
  import { num } from '../lib/format.js'

  let {
    rows = [], mark = null, marks = [], suffix = '', keyWidth = '4.75rem',
    obsLabel = '관측', expLabel = '기대', pct = false, digits = 1,
    // Le total des observés se lit comme un nombre de 회차 quand chaque
    // 회차 tombe dans une ligne et une seule ; sinon (다섯 구간 비었나) il
    // ne veut rien dire, et on ne l'écrit pas.
    showTotal = true,
  } = $props()

  const max = $derived(Math.max(1e-9, ...rows.flatMap((r) => [r.obs ?? 0, r.exp ?? 0])))
  const totalObs = $derived(rows.reduce((a, r) => a + (r.obs ?? 0), 0))
  const fmt = (v) => (pct ? `${(v * 100).toFixed(digits)}%` : Number.isInteger(v) ? num(v) : v.toFixed(digits))
  const isMarked = (key) => (mark !== null && String(key) === String(mark)) || marks.includes(String(key))
</script>

<div class="compare" style="--keyw: {keyWidth}">
  <div class="legend">
    <span class="key obs"></span><span class="name">{obsLabel}</span>
    <span class="key exp"></span><span class="name">{expLabel}</span>
    {#if showTotal && !pct && totalObs}<span class="name dim">{num(totalObs)}회차</span>{/if}
  </div>
  {#each rows as r (r.key)}
    <div class="row" class:active={isMarked(r.key)}>
      <span class="k">{r.key}{suffix}</span>
      <span class="track">
        <span class="obs" style="width: {((r.obs ?? 0) / max) * 100}%"></span>
        <span class="exp" style="width: {((r.exp ?? 0) / max) * 100}%"></span>
      </span>
      <span class="val">{fmt(r.obs ?? 0)}</span>
      <span class="val soft">{fmt(r.exp ?? 0)}</span>
    </div>
  {/each}
</div>

<style>
  .compare { display: grid; gap: 3px; }
  .legend {
    display: flex; align-items: center; gap: 0.35rem;
    margin-bottom: 0.35rem; font-size: 0.75rem;
  }
  .key { width: 10px; height: 10px; border-radius: 2px; }
  .key.obs { background: var(--gold); }
  .key.exp { background: transparent; border: 1px solid var(--ink-soft); }
  .name { margin-right: 0.75rem; color: var(--ink-soft); }

  .row {
    display: grid;
    grid-template-columns: var(--keyw, 4.75rem) 1fr 3.5rem 3.5rem;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    padding: 1px 0;
  }
  .row.active .k { color: var(--gold-deep); font-weight: 600; }
  .row.active .track { outline: 1px solid var(--gold-soft); outline-offset: 1px; }
  .k { color: var(--ink-soft); font-family: var(--figure); text-align: right; }

  /* Deux barres empilées dans une même piste : la pleine (observé) au-dessus,
     le filet (attendu) en dessous, même origine, même échelle. */
  .track {
    position: relative; height: 14px;
    background: var(--line-soft); border-radius: 3px; overflow: hidden;
  }
  .obs {
    position: absolute; left: 0; top: 0; height: 9px;
    background: var(--gold); border-radius: 0 3px 3px 0;
  }
  .exp {
    position: absolute; left: 0; bottom: 0; height: 3px;
    background: var(--ink-soft); border-radius: 0 2px 2px 0;
  }
  .val { text-align: right; font-family: var(--figure); color: var(--ink); }
  .val.soft { color: var(--muted); }
</style>
