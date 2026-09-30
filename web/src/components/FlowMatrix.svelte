<script>
  // 흐름 — la matrice des écarts.
  //
  // C'est le cœur de l'ancienne plateforme : 45 classes `pattern*` et une
  // table `numberpattern` de 1 238 lignes × 45 colonnes de texte, stockée en
  // base et régénérée à chaque tirage. Ici, une matrice reconstruite en 1,3
  // milliseconde à partir des seuls tirages.
  //
  // Une ligne par 회차, une colonne par numéro. La case porte le nombre de
  // tirages écoulés depuis la dernière sortie du numéro ; quand il sort,
  // elle se remplit. Lue verticalement, une colonne montre le rythme d'un
  // numéro ; lue horizontalement, une ligne montre d'où venaient les six.
  //
  // Une case pleine ne suffit pas : sortir après une attente (당첨) et sortir
  // deux fois de suite (이월) sont deux événements différents, et l'ancienne
  // table les nommait différemment. La matrice ne le savait pas — `gaps()` ne
  // rend que des nombres. `runs()` apporte la série, et les deux se
  // distinguent maintenant par leur aplat : rouge pour 당첨, bleu pour 이월.
  // L'ancienne plateforme peignait tout en rouge, sans faire la différence.
  //
  // Le tableau fait 45 colonnes. À 1 134 회차 cela ferait 52 164 cases dans la
  // page — ~4 secondes pour les dessiner, et un défilement qui saccade. On ne
  // dessine donc que les lignes visibles, plus une marge de part et d'autre,
  // en suivant le défilement : 전체 coûte alors autant que 최근 50.
  import { runFlag } from '@core/analysis.js'
  import { NMAX } from '@core/draws.js'
  import { BANDS, bandOf } from '../lib/heat.js'
  import { num, sectionOf, SECTION_VARS } from '../lib/format.js'
  import Scope from './Scope.svelte'

  let {
    draws, gaps, runs, selected = $bindable(null),
    span = $bindable('follow'), first, last,
  } = $props()

  const WIDTH = NMAX + 1
  const numbers = Array.from({ length: NMAX }, (_, k) => k + 1)

  // Hauteur d'une ligne, en pixels. Elle est écrite ici **et** dans le CSS ;
  // les deux doivent rester d'accord, sinon les lignes se décalent du
  // défilement. C'est la seule valeur partagée entre les deux.
  const ROW = 20
  const OVER = 6           // lignes dessinées au-delà du cadre, de chaque côté
  const VIEW = 30          // lignes visibles d'un coup

  // Du plus récent au plus ancien.
  const order = $derived(
    Array.from({ length: draws.n }, (_, k) => draws.n - 1 - k))

  let scrollTop = $state(0)
  let headH = $state(22)

  // Le cadre fait un nombre **entier** de lignes. Une hauteur en `vh`
  // couperait la dernière en deux, et une demi-ligne de cases colorées
  // ressemble à un défaut d'affichage plutôt qu'à « la suite est en bas ».
  const frame = $derived(headH + Math.min(order.length, VIEW) * ROW)

  const slice = $derived.by(() => {
    const start = Math.max(0, Math.floor((scrollTop - headH) / ROW) - OVER)
    const count = VIEW + OVER * 2
    return { start, end: Math.min(order.length, start + count) }
  })

  const visible = $derived(order.slice(slice.start, slice.end))

  let hover = $state(null)
</script>

<section class="panel">
  <div class="head">
    <h2>흐름</h2>
    <span class="gloss">출현 사이의 간격</span>
    <Scope bind:span {first} {last} />
    <span class="right">
      {#if hover}
        {num(draws.rangs[hover.i])}회 · {hover.n}번 ·
        {hover.run ? runFlag(hover.run) : `${hover.gap}회 전 출현`}
      {:else}
        {num(draws.n)}회
      {/if}
    </span>
  </div>

  <div class="scroll">
    <div class="table" style="--cols: {NMAX}">
      <div class="viewport" style="max-height: {frame}px"
           onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}>
        <!-- L'en-tête est **dans** le cadre qui défile, collée en haut :
             sans elle, à la trentième ligne on ne sait plus quelle colonne
             est quel numéro. Et en la mettant dedans plutôt qu'au-dessus,
             elle subit la même barre de défilement que les lignes — sinon
             elle se décalerait de sa largeur, là où le système en dessine
             une qui prend de la place. -->
        <div class="matrix headrow" bind:clientHeight={headH}>
          <div class="corner">회차</div>
          {#each numbers as n (n)}
            <button class="colhead" class:picked={selected === n}
                    style="color: var({SECTION_VARS[sectionOf(n)]})"
                    onclick={() => (selected = selected === n ? null : n)}>{n}</button>
          {/each}
        </div>

        <!-- Un bloc à la hauteur de **toutes** les lignes : la barre de
             défilement dit la vérité sur la taille du tableau, même si on
             n'en dessine que trente. -->
        <div class="body" style="height: {order.length * ROW}px">
          {#each visible as i, k (i)}
            <div class="matrix line" style="top: {(slice.start + k) * ROW}px">
              <div class="rowhead" class:now={i === draws.n - 1}>{num(draws.rangs[i])}</div>
              {#each numbers as n (n)}
                {@const gap = gaps[i * WIDTH + n]}
                {@const run = runs[i * WIDTH + n]}
                {@const band = bandOf(gap)}
                <div class="cell" class:hit={run === 1} class:carry={run > 1}
                     class:col={selected === n}
                     style="--tone: {band.text}"
                     onmouseenter={() => (hover = { i, n, gap, run })}
                     onmouseleave={() => (hover = null)}
                     role="presentation">{run ? '●' : gap}</div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div class="legend">
    {#each BANDS as band (band.key)}
      <span class="key" style="--tone: {band.text}"></span>
      <span class="name">{band.ko}<span class="dim"> {band.range}</span></span>
    {/each}
    <span class="key hit-key"></span>
    <span class="name">당첨</span>
    <span class="key carry-key"></span>
    <span class="name">이월 <span class="dim">연속 출현</span></span>
  </div>
</section>

<style>
  .table { min-width: 56rem; }

  .matrix {
    display: grid;
    grid-template-columns: 3.5rem repeat(var(--cols), minmax(19px, 1fr));
    gap: 1px;
  }

  .headrow {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--surface);
    padding-bottom: 2px;
    border-bottom: 1px solid var(--line-soft);
  }

  /* Le cadre qui défile. Sa hauteur suit le contenu tant qu'il est court —
     à trente lignes on voit tout d'un coup, comme avant — et se bloque
     au-delà, pour que la page reste parcourable. */
  .viewport { overflow-y: auto; overflow-x: hidden; }
  .body { position: relative; }
  /* Chaque ligne est posée à sa place exacte : c'est ce qui permet de n'en
     dessiner que trente sans que la barre de défilement mente. */
  .line { position: absolute; left: 0; right: 0; height: 19px; }

  .corner {
    font-size: 0.625rem;
    color: var(--muted);
    display: flex;
    align-items: flex-end;
    padding-bottom: 3px;
  }

  .colhead {
    border: 0;
    border-radius: 0;
    padding: 0 0 3px;
    font-size: 0.5625rem;
    line-height: 1;
    background: none;
    text-align: center;
  }
  .colhead:hover { border: 0; text-decoration: underline; }
  /* La colonne choisie se signale par un trait, pas par un aplat : le
     numéro garde son fond. */
  .colhead.picked {
    font-weight: 700;
    box-shadow: inset 0 -2px 0 var(--ink);
  }

  .rowhead {
    font-size: 0.6875rem;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 0.4rem;
    white-space: nowrap;
  }
  .rowhead.now { color: var(--gold); font-weight: 600; }

  /* Un chiffre d'attente garde le fond de la page — sa bande 차뜨 est portée
     par la couleur du chiffre. Seules les cases **sorties** prennent un
     aplat : c'est là que se lit le motif du tirage. */
  .cell {
    height: 19px;
    display: grid;
    place-items: center;
    font-size: 0.5625rem;
    color: var(--tone);
    background: var(--surface);
  }
  /* Une sortie prend l'aplat, comme sur l'ancienne plateforme — et les deux
     sortes de sortie prennent deux aplats différents, ce que l'ancienne ne
     faisait pas : elle peignait tout en rouge et perdait le 이월. */
  .cell.hit, .cell.carry {
    color: var(--on-fill);
    font-size: 0.625rem;
    font-weight: 600;
    border-radius: 1px;
  }
  .cell.hit { background: var(--hit-bg); }
  .cell.carry { background: var(--carry-bg); }
  /* Deux rails verticaux encadrent la colonne choisie — visibles sur toute
     la hauteur, et sans rien peindre derrière les chiffres. */
  .cell.col { box-shadow: inset 1px 0 0 var(--gold), inset -1px 0 0 var(--gold); }
  .cell:hover { outline: 1.5px solid var(--ink); outline-offset: -1px; }

  .legend {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 1rem;
    font-size: 0.75rem;
    flex-wrap: wrap;
  }
  /* La légende est le seul endroit où la couleur devient un aplat : elle ne
     recouvre aucun chiffre. */
  .key {
    width: 14px;
    height: 10px;
    border-radius: 1px;
    background: var(--tone);
  }
  .hit-key { background: var(--hit-bg); }
  .carry-key { background: var(--carry-bg); }
  .name { margin-right: 0.75rem; color: var(--ink-soft); }
</style>
