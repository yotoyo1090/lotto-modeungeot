<script>
  // 당첨 띠 — chaque grille de la liste est une ligne verticale, colorée par le
  // nombre de ses numéros parmi les 7 du 회차 (보너스 compris), dans l'ordre de
  // la liste (donc du 「정렬」).
  //
  // Deux bandes : 「전체」 montre toute la liste — une colonne de pixels regroupe
  // plusieurs grilles, on y empile la part des niveaux courants, et les niveaux
  // rares (`rare` et plus) sont redessinés par-dessus en trait plein.
  // 「확대」 montre une fenêtre de la liste, une ligne = une grille ; on la
  // déplace en cliquant sur 「전체」 ou avec ◀ ▶.
  import { num } from '../lib/format.js'

  // `hits` : Uint8Array (`hitsOf`), `gridOf(k)` : les six numéros de la k-ième
  // grille de la liste, `next` : les 7 numéros du 회차, `rang` : son libellé.
  let { hits, gridOf, next, rang } = $props()

  const COLORS = ['#d9d6cd', '#9cc3ea', '#5dbf9c', '#e8a33a', '#d8602f', '#c22d4f', '#6b1f7a']
  const BAND = 56
  const PX = 4                       // largeur d'une grille dans 「확대」

  let width = $state(0)
  let whole = $state()
  let zoom = $state()
  let start = $state(0)
  let hover = $state(null)

  const n = $derived(hits.length)
  const tally = $derived.by(() => {
    const t = [0, 0, 0, 0, 0, 0, 0]
    for (let k = 0; k < hits.length; k++) t[hits[k]]++
    return t
  })
  // Le premier niveau tracé en trait plein : assez rare pour qu'au plus une
  // colonne sur quatre en porte un (sinon toute la bande prendrait sa couleur).
  const cols = $derived(Math.max(1, Math.min(Math.floor(width), n)))
  const rare = $derived.by(() => {
    let h = 7
    while (h > 1 && tally[h - 1] <= cols / 4) h--
    return h
  })
  const span = $derived(Math.max(1, Math.floor(width / PX)))
  const first = $derived(Math.max(0, Math.min(start, n - span)))

  // Une nouvelle liste repart du début.
  $effect(() => { hits; start = 0; hover = null })

  function canvas(el, w) {
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(w * dpr)
    el.height = Math.round(BAND * dpr)
    const g = el.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, BAND)
    return g
  }

  // 「전체」
  $effect(() => {
    if (!whole || !width || !n) return
    const g = canvas(whole, width)
    const w = width / cols
    const lines = []
    const c = [0, 0, 0, 0, 0, 0, 0]
    for (let x = 0; x < cols; x++) {
      const a = Math.floor((x * n) / cols)
      const b = Math.floor(((x + 1) * n) / cols)
      c.fill(0)
      for (let k = a; k < b; k++) c[hits[k]]++
      // la part de chaque niveau courant, empilée de bas en haut
      let y = BAND
      const common = c.slice(0, rare).reduce((s, v) => s + v, 0) || 1
      for (let h = 0; h < rare; h++) {
        const t = (c[h] / common) * BAND
        g.fillStyle = COLORS[h]
        g.fillRect(x * w, y - t, Math.max(1, w), t)
        y -= t
      }
      for (let h = 6; h >= rare; h--) if (c[h]) { lines.push([x * w, h]); break }
    }
    lines.sort((p, q) => p[1] - q[1])          // les plus rares dessinées en dernier
    for (const [x, h] of lines) { g.fillStyle = COLORS[h]; g.fillRect(x, 0, Math.max(2, w), BAND) }
    // la fenêtre de 「확대」
    g.strokeStyle = '#222'
    g.lineWidth = 1.5
    g.strokeRect((first / n) * width + 0.75, 0.75, Math.max(3, (Math.min(span, n) / n) * width) - 1.5, BAND - 1.5)
  })

  // 「확대」
  $effect(() => {
    if (!zoom || !width || !n) return
    const g = canvas(zoom, width)
    const end = Math.min(n, first + span)
    for (let k = first; k < end; k++) {
      g.fillStyle = COLORS[hits[k]]
      g.fillRect((k - first) * PX, 0, PX - 1, BAND)
    }
    if (hover !== null && hover >= first && hover < end) {
      g.strokeStyle = '#222'
      g.lineWidth = 1.5
      g.strokeRect((hover - first) * PX - 0.5, 0.75, PX + 0.5, BAND - 1.5)
    }
  })

  function jump(e) {
    const r = whole.getBoundingClientRect()
    const k = Math.floor(((e.clientX - r.left) / r.width) * n)
    start = Math.max(0, Math.min(n - span, k - Math.floor(span / 2)))
  }
  function point(e) {
    const r = zoom.getBoundingClientRect()
    const k = first + Math.floor((e.clientX - r.left) / PX)
    hover = k < Math.min(n, first + span) ? k : null
  }
  const step = (d) => { start = Math.max(0, Math.min(n - span, first + d * span)) }

  const pct = (v) => (n ? ((v / n) * 100).toFixed(v / n < 0.001 ? 4 : 2) : '0')
  const shown = $derived(hover === null ? null : { k: hover, nums: [...gridOf(hover)], hit: hits[hover] })
</script>

<section class="strip" aria-label="당첨 띠">
  <div class="title">
    <b>당첨 띠</b>
    <span class="dim">{rang}회 당첨번호 7개(보너스 포함)와 맞은 개수 · 목록 순서 그대로 · 한 줄 = 조합 하나</span>
  </div>

  <div class="legend">
    {#each tally as t, h (h)}
      <span><i style="background:{COLORS[h]}"></i>{h}개 <strong>{num(t)}</strong> <em>{pct(t)}%</em></span>
    {/each}
  </div>

  <div class="band-label"><span>전체 {num(n)}개</span><span class="dim">눌러서 그 자리를 확대{rare <= 6 ? ` · ${rare}개 이상은 굵은 줄로 표시` : ''}{width && n > cols ? ` · 한 칸 ≈ ${num(Math.round(n / cols))}개` : ''}</span></div>
  <div class="box" bind:clientWidth={width}>
    <canvas bind:this={whole} style="height:{BAND}px" onclick={jump} aria-label="목록 전체의 당첨 띠"></canvas>
  </div>

  <div class="band-label">
    <span>확대 {num(first + 1)} ~ {num(Math.min(n, first + span))}번째</span>
    <span class="nav">
      <button type="button" onclick={() => step(-1)} disabled={first === 0} aria-label="이전">◀</button>
      <button type="button" onclick={() => step(1)} disabled={first + span >= n} aria-label="다음">▶</button>
    </span>
  </div>
  <div class="box">
    <canvas bind:this={zoom} style="height:{BAND}px" onmousemove={point} onmouseleave={() => (hover = null)} aria-label="확대한 당첨 띠"></canvas>
  </div>
  <p class="pointed">
    {#if shown}
      {num(shown.k + 1)}번째 ·
      {#each shown.nums as v (v)}<span class="ball" class:win={next.slice(0, 6).includes(v)} class:bonus={next[6] === v}>{v}</span>{/each}
      · <strong style="color:{COLORS[shown.hit]}">{shown.hit}개</strong>
    {:else}
      <span class="dim">확대 띠 위에 마우스를 올리면 그 조합이 보입니다.</span>
    {/if}
  </p>
</section>

<style>
  .strip { margin: 0.9rem 0 0; padding: 0.8rem 0.9rem; border: 1px solid var(--line); border-radius: var(--radius); }
  .title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.6rem; margin-bottom: 0.5rem; font-size: 0.875rem; }
  .title b { color: var(--ink); }
  .dim { color: var(--muted); font-size: 0.75rem; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.3rem 0.9rem; font-size: 0.75rem; color: var(--muted); margin-bottom: 0.6rem; }
  .legend span { display: inline-flex; align-items: center; gap: 0.3rem; }
  .legend i { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 2px; }
  .legend strong { color: var(--ink); font-family: var(--figure); font-weight: 600; }
  .legend em { font-style: normal; font-family: var(--figure); }
  .band-label { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; font-size: 0.75rem; color: var(--ink); margin: 0.4rem 0 0.25rem; }
  .box { width: 100%; }
  canvas { display: block; width: 100%; border-radius: 3px; background: var(--line-soft); cursor: crosshair; }
  .nav { display: inline-flex; gap: 0.25rem; }
  .nav button { padding: 0.05rem 0.5rem; font-size: 0.6875rem; }
  .pointed { margin: 0.35rem 0 0; min-height: 1.6rem; font-size: 0.8125rem; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .ball { display: inline-block; min-width: 1.5rem; padding: 0.05rem 0.25rem; text-align: center; border-radius: 999px; border: 1px solid var(--line); font-family: var(--figure); font-size: 0.75rem; }
  .ball.win { background: var(--gold); border-color: var(--gold); color: #fff; }
  .ball.bonus { border: 2px solid var(--gold-deep); }
</style>
