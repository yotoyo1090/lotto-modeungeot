<script>
  // Le bulletin, dessiné une bonne fois : 용지 마킹 l'empile par dix, 모양
  // 닮은꼴 le montre par paires. Les deux écrans avaient commencé à en
  // garder chacun leur copie — une de trop.
  //
  // `numbers` sont les six marqués, `bonus` la case en pointillé. `ghost`
  // est la figure d'un autre 회차 posée par-dessus, déjà décalée : c'est
  // elle qui montre ce qui coïncide et ce qui manque.
  import { cellOf, COLS, ROWS } from '@core/shape.js'

  let {
    numbers = [], bonus = null, ghost = null,
    label = 'A', price = '1,000원', steps = true,
  } = $props()

  const CW = 44
  const CH = 30
  const GAP = 6
  const PAD = 14
  const HEAD = 34

  const px = (c) => PAD + c * (CW + GAP)
  const py = (r) => PAD + HEAD + r * (CH + GAP)
  const cxOf = (n) => px(cellOf(n)[1]) + CW / 2
  const cyOf = (n) => py(cellOf(n)[0]) + CH / 2

  const W = PAD * 2 + COLS * CW + (COLS - 1) * GAP
  const H = PAD * 2 + HEAD + ROWS * CH + (ROWS - 1) * GAP + 30

  const all = Array.from({ length: 45 }, (_, k) => k + 1)
  const six = $derived([...numbers].sort((a, b) => a - b))
  const marked = $derived(new Set(six))
  const path = $derived(six.map((n) => `${cxOf(n)},${cyOf(n)}`).join(' '))

  // La figure invitée : ses cases, déjà glissées, et celles qui tombent
  // juste. `ghost` vaut { numbers, dr, dc }.
  const ghostCells = $derived.by(() => {
    if (!ghost) return []
    return ghost.numbers.map((n) => {
      const [r, c] = cellOf(n)
      const rr = r + ghost.dr
      const cc = c + ghost.dc
      // Une case existe si elle est dans la grille **et** porte un numéro :
      // la dernière rangée s'arrête à 45.
      const target = rr * COLS + cc + 1
      const inside = rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && target <= 45
      const hit = inside && marked.has(target)
      return { x: px(cc) + CW / 2, y: py(rr) + CH / 2, inside, hit }
    }).filter((g) => g.inside)
  })
</script>

<div class="sheet">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="마킹 용지">
    <rect class="frame" x="1" y="1" width={W - 2} height={H - 2} rx="6" />
    <rect class="panelhead" x={PAD} y={PAD - 2} width={W - PAD * 2} height="24" rx="4" />
    <text class="letter" x={PAD + 9} y={PAD + 15}>{label}</text>
    <text class="price" x={W - PAD - 9} y={PAD + 15} text-anchor="end">{price}</text>

    {#each all as n (n)}
      <g class="cell" class:on={marked.has(n)} class:bo={n === bonus}>
        <rect x={px(cellOf(n)[1])} y={py(cellOf(n)[0])} width={CW} height={CH} rx={CH / 2} />
        <text x={cxOf(n)} y={cyOf(n) + 5} text-anchor="middle">{n}</text>
      </g>
    {/each}

    <polyline class="trace" points={path} />
    {#each six as n, k (n)}
      <circle class="dot" cx={cxOf(n)} cy={cyOf(n)} r="4" />
      {#if steps}
        <text class="step" x={cxOf(n) + CW / 2 - 2} y={cyOf(n) - CH / 2 + 2}
              text-anchor="middle">{k + 1}</text>
      {/if}
    {/each}

    {#each ghostCells as g, k (k)}
      <circle class="ghost" class:hit={g.hit} cx={g.x} cy={g.y} r={CH / 2 - 2} />
    {/each}

    <text class="foot" x={W - PAD} y={H - PAD - 15} text-anchor="end">자동선택 ☐</text>
    <text class="foot" x={W - PAD} y={H - PAD - 2} text-anchor="end">취소 ☐</text>
  </svg>
</div>

<style>
  /* Le rouge du bulletin, en variables locales : le site est or et encre,
     le papier est rouge. Les deux doivent tenir dans les deux thèmes. */
  .sheet {
    --sheet-line: color-mix(in srgb, var(--hit-bg) 70%, var(--surface));
    --sheet-ink: var(--hit-bg);
  }
  .sheet svg { width: 100%; height: auto; display: block; }

  .frame { fill: var(--surface); stroke: var(--sheet-line); stroke-width: 1.5; }
  .panelhead { fill: var(--sheet-line); }
  .letter { fill: var(--surface); font-family: var(--figure); font-weight: 700; font-size: 14px; }
  .price { fill: var(--surface); font-family: var(--figure); font-weight: 600; font-size: 12px; }

  /* Une case vide : contour fin, chiffre rouge, comme à l'impression. */
  .cell rect { fill: none; stroke: var(--sheet-line); stroke-width: 1; }
  .cell text {
    fill: var(--sheet-ink); font-family: var(--figure);
    font-size: 15px; font-weight: 600;
  }

  /* Une case marquée : le coup de crayon. */
  .cell.on rect { fill: var(--ink); stroke: var(--ink); }
  .cell.on text { fill: var(--surface); }
  .cell.bo rect { fill: none; stroke: var(--gold); stroke-width: 1.5; stroke-dasharray: 3 2; }
  .cell.bo text { fill: var(--gold-deep); }

  /* Le trait du motif. */
  .trace {
    fill: none; stroke: var(--gold); stroke-width: 2;
    stroke-linejoin: round; stroke-linecap: round; opacity: 0.9;
  }
  .dot { fill: var(--gold); }
  .step {
    fill: var(--gold-deep); font-family: var(--figure);
    font-size: 10px; font-weight: 700;
  }
  .foot { fill: var(--sheet-ink); font-size: 11px; }

  /* La figure invitée : un cercle posé par-dessus. Plein quand il tombe sur
     une marque, creux quand il tombe à côté — c'est toute la lecture. */
  .ghost {
    fill: none; stroke: var(--t-cold-text, var(--muted));
    stroke-width: 2; stroke-dasharray: 4 3; opacity: 0.85;
  }
  .ghost.hit {
    stroke: var(--gold); stroke-dasharray: none; stroke-width: 2.5;
    fill: color-mix(in srgb, var(--gold) 22%, transparent);
  }
</style>
