<script>
  // 용지 마킹 — le bulletin, comme sur le papier, dix 회차 à la fois.
  //
  // Chaque feuille porte les numéros d'un 회차 et un trait qui relie les six
  // gagnants dans l'ordre où la feuille les présente : le motif que le
  // tirage a dessiné sur le papier. Dix côte à côte, parce qu'un motif seul
  // ne dit rien — c'est en les voyant à la suite qu'on juge s'ils se
  // ressemblent. (Ils ne se ressemblent pas, et 모양 닮은꼴 le mesure.)
  import { PICK } from '@core/draws.js'
  import { cellOf } from '@core/shape.js'

  import RangPick from '../components/RangPick.svelte'
  import Sheet from '../components/Sheet.svelte'
  import { day, num, rang as fmt } from '../lib/format.js'

  let { draws } = $props()

  const STEP = 10

  let picked = $state(null)
  let count = $state(STEP)
  const current = $derived.by(() => {
    const last = draws.rangs[draws.n - 1]
    if (picked === null) return last
    return picked < draws.rangs[0] || picked > last ? last : picked
  })
  const start = $derived(draws.indexOf(current))

  // Les lignes et colonnes qu'une figure occupe, et la longueur du trait :
  // trois chiffres pour comparer deux semaines sans les superposer.
  function shapeOf(numbers) {
    const six = [...numbers].sort((a, b) => a - b)
    const rows = new Set()
    const cols = new Set()
    let len = 0
    let prev = null
    for (const n of six) {
      const [r, c] = cellOf(n)
      rows.add(r)
      cols.add(c)
      if (prev) len += Math.hypot(r - prev[0], c - prev[1])
      prev = [r, c]
    }
    return { six, rows: rows.size, cols: cols.size, len: Math.round(len * 10) / 10 }
  }

  const sheets = $derived.by(() => {
    const out = []
    for (let k = 0; k < count && start - k >= 0; k++) {
      const i = start - k
      const seq = [...draws.sequenceAt(i)]
      out.push({
        rang: draws.rangs[i],
        date: draws.dates[i],
        bonus: seq[PICK],
        ...shapeOf(seq.slice(0, PICK)),
      })
    }
    return out
  })

  const left = $derived(Math.max(0, start + 1 - sheets.length))

  // Changer de 회차 de départ, c'est repartir de dix : sans ça on se
  // retrouverait avec deux cents feuilles après quelques clics.
  function pick(r) { picked = r; count = STEP }
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>용지 마킹</h2>
    <span class="gloss">용지와, 당첨번호가 그리는 모양</span>
  </div>
  <RangPick {draws} value={current} onpick={pick} />
</section>

<section class="panel">
  <div class="head">
    <h2>{fmt(sheets[sheets.length - 1]?.rang ?? current)} → {fmt(current)}</h2>
    <span class="gloss">{num(sheets.length)}장</span>
    <span class="right">한 장이 한 회차 · 선은 당첨번호 6개만</span>
  </div>

  <div class="wall">
    {#each sheets as s (s.rang)}
      <figure class="card">
        <figcaption>
          <b>{fmt(s.rang)}</b>
          <span class="dim">{day(s.date)}</span>
        </figcaption>
        <Sheet numbers={s.six} bonus={s.bonus} />
        <p class="line">{s.six.join(' · ')} <span class="dim">+ {s.bonus}</span></p>
        <p class="line dim">{s.rows}줄 · {s.cols}칸 · 선 {s.len}</p>
      </figure>
    {/each}
  </div>

  {#if left > 0}
    <div class="more">
      <button onclick={() => (count += STEP)}>
        더 보기 <span class="dim">{num(sheets.length)} / {num(start + 1)}회차</span>
      </button>
      {#if left > STEP}
        <button onclick={() => (count += STEP * 5)}>50회차 더</button>
      {/if}
    </div>
  {:else}
    <p class="note dim tight">{fmt(draws.rangs[0])}까지 모두 보았습니다.</p>
  {/if}

  <p class="note dim">
    번호 모서리의 작은 숫자는 마킹 순서(작은 번호부터)입니다. 보너스는 점선 테두리로만
    표시하고 선에는 넣지 않습니다 — 한 박자 쉬고 나오는 공이라 종이에 칠하지 않기
    때문입니다. 모양끼리 얼마나 닮았는지는 <strong>모양 닮은꼴</strong> 탭에서 잽니다.
  </p>
</section>

<style>
  .bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.75rem;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  /* Le mur de feuilles : autant de colonnes que la largeur en permet, et
     chaque bulletin garde ses proportions — c'est le viewBox qui l'étire. */
  .wall {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1.25rem 1rem;
  }
  .card { margin: 0; }
  .card figcaption {
    display: flex; align-items: baseline; gap: 0.4rem;
    margin-bottom: 0.3rem; font-size: 0.8125rem;
  }
  .card figcaption .dim { font-size: 0.6875rem; }
  .line { margin: 0.3rem 0 0; font-size: 0.75rem; font-family: var(--figure); }
  .line.dim { font-size: 0.6875rem; }

  .more { display: flex; gap: 0.5rem; justify-content: center; margin-top: 1.25rem; }
  .more button { font-size: 0.8125rem; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 76ch; }
  .note.tight { margin-top: 1.25rem; text-align: center; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
