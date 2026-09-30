<script>
  // Un critère en cases à cocher.
  //
  // C'est la forme qu'avait l'ancien formulaire, et elle dit quelque chose
  // qu'une fourchette ne dit pas : « AC 6 ou 10 » n'est pas « AC de 6 à 10 ».
  //
  // Chaque case porte son effectif — le nombre de 회차 où la valeur est
  // sortie. L'ancien formulaire proposait les mêmes valeurs sans jamais
  // dire lesquelles étaient courantes ; on coche alors à l'aveugle.
  import { num } from '../lib/format.js'

  let {
    label,
    gloss = '',
    options = [],          // [{ value, seen }]
    selected = $bindable([]),
    format = (v) => String(v),
    columns = 'auto',
    // Pour les critères à plusieurs valeurs par 회차 (이월 위치, 앞자리…),
    // la somme des effectifs n'est plus le nombre de tirages : l'écran passe
    // alors le nombre de tirages (`total`) et la couverture calculée (`cover`).
    total = null,
    cover = null,
  } = $props()

  const chosen = $derived(new Set(selected))
  const max = $derived(Math.max(1, ...options.map((o) => o.seen)))

  // Chaque 회차 a exactement une valeur par indicateur : la somme des
  // effectifs est donc le nombre de tirages, sans avoir à le passer.
  const draws = $derived(total ?? options.reduce((a, o) => a + o.seen, 0))
  const pct = (n) => (draws ? (n / draws) * 100 : 0)

  // Le taux de couverture : quelle part du passé la sélection laisse
  // passer. C'est le seul chiffre qui dise si on vient de se restreindre
  // à une bande courante ou à une bizarrerie.
  const covered = $derived(cover ??
    options.filter((o) => chosen.has(o.value)).reduce((a, o) => a + o.seen, 0))

  function toggle(value) {
    selected = chosen.has(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value].sort((a, b) => a - b)
  }
</script>

<fieldset>
  <legend>
    <span class="name">{label}</span>
    {#if gloss}<span class="gloss">{gloss}</span>{/if}
    {#if selected.length}
      <button class="clear" onclick={() => (selected = [])}>지우기</button>
      <span class="count"
            title="과거 {num(draws)}회 중 {num(covered)}회가 이 선택에 들어맞습니다">
        {selected.length}개 · 과거 {pct(covered).toFixed(1)}%
      </span>
    {:else}
      <span class="count dim">과거 100%</span>
    {/if}
  </legend>

  <div class="set" class:tight={columns === 'tight'}>
    {#each options as o (o.value)}
      <label class="box" class:on={chosen.has(o.value)}>
        <input type="checkbox" checked={chosen.has(o.value)}
               onchange={() => toggle(o.value)} />
        <span class="v">{format(o.value)}</span>
        <span class="n"
              title="과거 {num(draws)}회 중 {num(o.seen)}회 · {pct(o.seen).toFixed(1)}%">
          {pct(o.seen).toFixed(1)}%
        </span>
        <span class="bar" style="--w: {(o.seen / max) * 100}%"></span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset { border: 0; margin: 0; padding: 0; }

  legend {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0;
    margin-bottom: 0.45rem;
    width: 100%;
  }
  .name { font-size: 0.875rem; font-weight: 600; }
  .gloss { color: var(--muted); font-size: 0.75rem; }
  .count { color: var(--gold); font-size: 0.75rem; margin-left: auto; }
  .clear {
    font-size: 0.6875rem;
    padding: 0.1rem 0.4rem;
    color: var(--muted);
  }

  .set {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .set.tight .box { min-width: 2.6rem; }

  /* Une case : la valeur, son effectif dessous, et un filet proportionnel
     tout en bas. Aucun aplat derrière le chiffre — le fond reste blanc et
     c'est le trait qui marque la sélection. */
  .box {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 3.1rem;
    padding: 0.28rem 0.4rem 0.4rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    cursor: pointer;
    overflow: hidden;
    transition: border-color .12s;
  }
  .box:hover { border-color: var(--gold-bright); }
  .box.on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }

  .box input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .box input:focus-visible ~ .v { outline: 2px solid var(--gold-bright); outline-offset: 2px; }

  .v {
    font-family: var(--figure);
    font-size: 0.9375rem;
    line-height: 1.15;
    white-space: nowrap;
  }
  .box.on .v { color: var(--gold); font-weight: 600; }
  .n { font-size: 0.625rem; color: var(--muted); line-height: 1.2; }

  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: var(--w);
    background: var(--gold-bright);
    opacity: 0.35;
  }
  .box.on .bar { opacity: 1; background: var(--gold); }
</style>
