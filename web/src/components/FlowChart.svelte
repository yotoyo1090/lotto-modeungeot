<script>
  // 전부 흐름 — le graphique d'un seul numéro.
  //
  // Les mêmes données que la matrice 흐름, mais restreintes au numéro choisi
  // et lues dans le temps : le 회차 en abscisse, l'écart en ordonnée. La
  // courbe monte d'un cran à chaque tirage sans sortie, et retombe quand le
  // numéro sort — une dent de scie dont la hauteur est l'attente.
  //
  // L'ancien site en faisait un nuage Google Charts. Ici, du SVG écrit à la
  // main : aucune dépendance, la page reste un seul fichier, et le graphe
  // suit les couleurs du thème au lieu de les figer.
  //
  // Les couleurs sont celles de la matrice, et pour la même raison : rouge
  // pour 당첨, bleu pour 이월. Un point et une case peints pareil, c'est le
  // même événement — l'œil n'a rien à retraduire en passant de l'un à l'autre.
  //
  // Le même graphique sert à l'onglet 당첨 위치, où l'ordonnée n'est plus un
  // écart mais le numéro qui occupe la position. D'où les réglages : les
  // bornes 차뜨 et les marques 당첨 / 이월 n'ont de sens que pour un numéro,
  // et la bande horizontale ne sert qu'au 패턴 des positions.
  import { BANDS } from '../lib/heat.js'
  import { num, rang as fmt } from '../lib/format.js'

  let {
    series = [], height = 200,
    label = '전부 흐름', gloss = '회차별 미출현 간격',
    heat = true,                  // les bornes 뜨거운 · 중간 · 차가운
    legend = true,                // les clés 당첨 / 이월
    unit = '회 기다림',
    band = null,                  // { min, max } — l'intervalle choisi
  } = $props()

  // Au-delà, une cible de survol par point ferait des milliers d'éléments
  // pour un pointeur qui ne peut de toute façon plus viser un point.
  const HOVERABLE = 400

  const W = 720
  const PAD = { l: 30, r: 10, t: 12, b: 22 }

  /** Trois paliers ronds sous le maximum — 10, 20, 30 plutôt que 11,3. */
  function plainRules(max) {
    const raw = max / 3
    const pow = 10 ** Math.floor(Math.log10(Math.max(1, raw)))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10
    const out = []
    for (let v = step; v <= max; v += step) out.push(Math.round(v))
    return out
  }

  let hover = $state(null)

  const view = $derived.by(() => {
    const pts = series
    const n = pts.length
    if (!n) return null

    // Une échelle qui ne descend jamais sous 10 : sur un numéro très
    // régulier, une échelle serrée transformerait des écarts de 2 et 3 en
    // montagnes.
    const max = Math.max(10, ...pts.map((p) => p.value))
    const iw = W - PAD.l - PAD.r
    const ih = height - PAD.t - PAD.b
    const px = (k) => PAD.l + (n < 2 ? iw / 2 : (k * iw) / (n - 1))
    const py = (v) => PAD.t + ih - (v / max) * ih

    const points = pts.map((p, k) => ({ ...p, cx: px(k), cy: py(p.value) }))
    const line = points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')

    // Les bornes 차뜨 en filets horizontaux — 5, 10, 19. Elles disent tout de
    // suite si une attente était chaude ou morte, sans avoir à lire l'axe.
    // Avec un écart en ordonnée, les graduations utiles sont les bornes
    // 차뜨. Avec un numéro, elles n'ont aucun sens : on met alors trois
    // paliers ronds, juste pour donner l'échelle.
    const rules = heat
      ? BANDS
        .filter((b) => b.max !== Infinity && b.max <= max)
        .map((b) => ({ at: b.max, y: py(b.max), ko: b.ko, tone: b.text }))
      : plainRules(max).map((v) => ({ at: v, y: py(v), tone: null }))

    // Quelques 회차 en abscisse — jamais plus de six, sinon ils se touchent.
    const step = Math.max(1, Math.ceil(n / 6))
    const ticks = []
    for (let k = 0; k < n; k += step) ticks.push({ x: px(k), rang: pts[k].rang })
    if (ticks.at(-1)?.rang !== pts[n - 1].rang) {
      ticks.push({ x: px(n - 1), rang: pts[n - 1].rang })
    }
    // Le premier et le dernier se rangent vers l'intérieur, sinon la moitié
    // du 회차 dépasse du cadre — visible tout de suite sur un téléphone.
    if (ticks.length) {
      ticks[0].anchor = 'start'
      ticks.at(-1).anchor = 'end'
    }

    // La bande de l'intervalle choisi — `py` inverse l'axe, donc le haut de
    // la bande est le `max`.
    const span = band && band.max >= band.min
      ? { y: py(band.max), height: Math.max(2, py(band.min) - py(band.max)) }
      : null

    return { points, line, max, rules, ticks, span, baseline: py(0) }
  })

  const marks = $derived(view ? view.points.filter((p) => p.run) : [])
  const hoverable = $derived(view && view.points.length <= HOVERABLE ? view.points : [])
</script>

<div class="chart">
  <div class="cap">
    <span class="lead">{label}</span>
    <span class="gloss">{gloss}</span>
    <span class="right">
      {#if hover}
        {fmt(hover.rang)} · {hover.flag ?? `${hover.value}${unit}`}
        {#if hover.flag}<b>{hover.value}</b>{/if}
      {:else if view}
        {num(series.length)}회차 · 최대 {view.max}
      {/if}
    </span>
  </div>

  {#if !view}
    <p class="dim">보여줄 회차가 없습니다.</p>
  {:else}
    <svg viewBox="0 0 {W} {height}" role="img"
         aria-label="{num(series.length)}회차 그래프">
      <!-- L'intervalle choisi, en arrière-plan : la même sélection que celle
           qui surligne les lignes du tableau, pour qu'on voie d'un coup où
           elle tombe dans le temps. -->
      {#if view.span}
        <rect class="span" x={PAD.l} y={view.span.y}
              width={W - PAD.l - PAD.r} height={view.span.height} />
      {/if}

      <!-- Les bornes 차뜨 -->
      {#each view.rules as r (r.at)}
        <line class="rule" x1={PAD.l} x2={W - PAD.r} y1={r.y} y2={r.y} />
        <text class="rulelabel" x={PAD.l - 5} y={r.y + 3}
              style={r.tone ? `fill: ${r.tone}` : null}>{r.at}</text>
      {/each}

      <line class="axis" x1={PAD.l} x2={W - PAD.r} y1={view.baseline} y2={view.baseline} />
      <text class="rulelabel" x={PAD.l - 5} y={view.baseline + 3}>0</text>

      <!-- La dent de scie -->
      <polyline class="line" points={view.line} />

      <!-- Les sorties -->
      <!-- Clés par rang d'affichage, pas par 회차 : le 필터 2등 pose sept
           points sur le même 회차, et deux clés identiques feraient tomber
           le rendu. -->
      {#each marks as p, k (k)}
        <circle class="mark" class:carry={p.run > 1} cx={p.cx} cy={p.cy} r="3.2" />
      {/each}

      <!-- Les 회차 en bas -->
      {#each view.ticks as t, k (k)}
        <text class="tick" x={t.x} y={height - 6}
              style={t.anchor ? `text-anchor: ${t.anchor}` : null}>{t.rang}</text>
      {/each}

      <!-- Une cible large par point, pour que le survol attrape sans viser -->
      {#each hoverable as p, k (k)}
        <circle class="hit" cx={p.cx} cy={p.cy} r="7"
                onmouseenter={() => (hover = p)}
                onmouseleave={() => (hover = null)}
                role="presentation" />
      {/each}

      {#if hover}
        <line class="cursor" x1={hover.cx} x2={hover.cx} y1={PAD.t} y2={view.baseline} />
      {/if}
    </svg>

    {#if legend}
    <div class="legend">
      <span class="key won"></span><span class="name">당첨</span>
      <span class="key carried"></span><span class="name">이월 <span class="dim">연속 출현</span></span>
      <span class="name dim">가로 눈금은 뜨거운 · 중간 · 차가운의 경계입니다</span>
    </div>
    {/if}
  {/if}
</div>

<style>
  .cap {
    display: flex; align-items: baseline; gap: 0.6rem;
    flex-wrap: wrap; margin-bottom: 0.5rem;
  }
  .lead { font-size: 0.8125rem; color: var(--muted); }
  .gloss { font-size: 0.75rem; color: var(--line); }
  .cap .right {
    margin-left: auto; font-size: 0.75rem; color: var(--ink-soft);
    font-family: var(--figure);
  }
  .cap .right b { color: var(--gold); margin-left: 0.25rem; }

  svg { width: 100%; height: auto; display: block; overflow: visible; }

  .rule { stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 2 4; }
  .axis { stroke: var(--line); stroke-width: 1; }
  .rulelabel {
    font-size: 9px; text-anchor: end; fill: var(--muted);
    font-family: var(--figure);
  }
  .tick {
    font-size: 9px; text-anchor: middle; fill: var(--muted);
    font-family: var(--figure);
  }
  /* Le SVG se réduit avec la page : sur un téléphone, 720 unités tiennent
     dans 390 pixels et un texte de 9 en tomberait à 5. On l'écrit plus gros
     dans le repère pour qu'il arrive à la même taille à l'écran. */
  @media (max-width: 640px) {
    .rulelabel, .tick { font-size: 17px; }
    .mark { r: 5; }
  }

  /* La courbe reste discrète : ce sont les points qui portent le sens, elle
     ne fait que les relier. */
  .line {
    fill: none; stroke: var(--line); stroke-width: 1;
    stroke-linejoin: round;
  }

  /* La bande de l'intervalle : un lavis, jamais sous un chiffre — la zone
     du tracé n'en porte aucun. */
  .span { fill: var(--gold-wash); }

  .mark { fill: var(--hit-bg); }
  .mark.carry { fill: var(--carry-bg); }

  .hit { fill: transparent; }
  .hit:hover { fill: color-mix(in srgb, var(--gold) 18%, transparent); }
  .cursor { stroke: var(--gold); stroke-width: 1; stroke-dasharray: 2 3; }

  .legend {
    display: flex; align-items: center; gap: 0.35rem;
    margin-top: 0.6rem; font-size: 0.75rem; flex-wrap: wrap;
  }
  .key { width: 10px; height: 10px; border-radius: 50%; }
  .key.won { background: var(--hit-bg); }
  .key.carried { background: var(--carry-bg); }
  .name { margin-right: 0.75rem; color: var(--ink-soft); }
</style>
