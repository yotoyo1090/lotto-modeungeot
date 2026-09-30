<script>
  // 당첨번호 1등 · 2등 — les vrais tirages, décrits avec le tableau de 42
  // colonnes des écrans 조합 (plus 분배 · 수동), sans rien recalculer à part.
  //
  //   1등 : les six numéros du tirage, une ligne par 회차.
  //   2등 : les grilles « cinq numéros + le bonus » — une par numéro
  //         remplacé —, donc six lignes par 회차. Le bonus y est encadré.
  //
  // Le 이월 se compte contre les sept numéros du 회차 précédent, dans l'ordre
  // de sortie, comme dans les écrans 조합. On le cherche dans `all` et non
  // dans la période choisie : le premier 회차 d'une période a aussi le sien.
  import { describeRow } from '@core/row.js'
  import { num, rang as fmt } from '../lib/format.js'
  import ComboTable from '../components/ComboTable.svelte'

  let { draws, all, rank = 1 } = $props()

  const PAGE = 500
  let listed = $state(PAGE)
  // Changer d'onglet ou de période repart des 500 premières lignes.
  $effect(() => { void rank; void draws; listed = PAGE })

  // `indexOf` lève une erreur pour un 회차 absent — le 0회 avant le 1회.
  const previousOf = (r) => {
    if (r - 1 < all.rangs[0]) return null
    return [...all.sequenceAt(all.indexOf(r - 1))]
  }

  // Du plus récent au plus ancien.
  const rows = $derived.by(() => {
    const out = []
    for (let i = draws.n - 1; i >= 0; i--) {
      const r = draws.rangs[i]
      // `sequenceAt` : les six triés puis le bonus (`fullAt` mêle les sept).
      const full = [...draws.sequenceAt(i)]
      const previous = previousOf(r)
      if (rank === 1) {
        out.push(describeRow(full.slice(0, 6), { rang: r, previous }))
        continue
      }
      for (let k = 0; k < 6; k++) {
        const grid = full.slice(0, 6)
        grid[k] = full[6]
        out.push({ ...describeRow(grid, { rang: r, previous }), _draw: full })
      }
    }
    return out
  })

  const first = $derived(draws.n ? draws.rangs[0] : null)
  const lastRang = $derived(draws.n ? draws.rangs[draws.n - 1] : null)
</script>

<section class="panel">
  <div class="head">
    <h2>당첨번호 {rank}등</h2>
    <span class="gloss">
      {#if rank === 1}회차마다 당첨번호 여섯 개
      {:else}당첨번호 다섯 개 + 보너스 — 회차마다 여섯 조합{/if}
    </span>
    {#if first !== null}
      <span class="right">{fmt(first)} ~ {fmt(lastRang)} · {num(rows.length)}줄</span>
    {/if}
  </div>

  <p class="note dim">
    {#if rank === 1}
      실제로 1등이 된 조합을 조합 화면과 같은 표로 봅니다. 최신 회차가 맨 위입니다.
    {:else}
      2등은 당첨번호 여섯 개 중 다섯 개와 보너스 번호를 맞힌 조합입니다. 빠지는 번호가 여섯 가지라
      한 회차에 2등 조합이 여섯 개 있습니다. 테두리가 있는 칸이 보너스 번호입니다.
    {/if}
    「전회차이월」은 직전 회차의 번호 일곱 개(보너스 포함)와 겹친 번호입니다.
  </p>

  <ComboTable rows={rows.slice(0, listed)} limit={listed} />

  {#if rows.length > listed}
    <button class="more" onclick={() => (listed += PAGE)}>
      더 보기 ({num(listed)} / {num(rows.length)})
    </button>
  {/if}
</section>

<style>
  .note { margin: 0 0 0.9rem; font-size: 0.75rem; line-height: 1.7; }
  .more { display: block; margin: 0.8rem auto 0; font-size: 0.8125rem; }
</style>
