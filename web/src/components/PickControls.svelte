<script>
  // 개수 · 방식 · 정렬 — commun au 일반조합, au 자동조합 et au 연금 자동조합
  // (voir `lib/pick.js`). Le 연금 n'a que le 개수 : `modes` et `sorts` à false.
  import { MODES, SORTS } from '../lib/pick.js'
  import { num } from '../lib/format.js'

  let {
    count = $bindable(100), mode = $bindable('random'),
    sort = $bindable('none'), dir = $bindable('asc'), max,
    modes = true, sorts = true, hide = [], counts = true,
  } = $props()
  // `hide` : les tris qui n'ont pas de sens ici (당첨 개수 avant le tirage).
  const shownSorts = $derived(SORTS.filter((s) => !hide.includes(s.key)))
  $effect(() => { if (hide.includes(sort)) sort = 'none' })
</script>

<span class="pick">
  {#if counts}
    <label>
      개수
      <input type="number" min="1" {max} step="1" bind:value={count} />
    </label>
    <span class="dim">1 ~ {num(max)}</span>
  {/if}
  {#if modes}
    <span class="modes" role="group" aria-label="방식">
      {#each MODES as m (m.key)}
        <button aria-pressed={mode === m.key} onclick={() => (mode = m.key)}>{m.label}</button>
      {/each}
    </span>
  {/if}
  {#if sorts}
    <label>
      정렬
      <select bind:value={sort}>
        {#each shownSorts as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
      </select>
    </label>
    <button class="dir" disabled={sort === 'none'}
            onclick={() => (dir = dir === 'asc' ? 'desc' : 'asc')}>
      {dir === 'asc' ? '↑ 작은 값부터' : '↓ 큰 값부터'}
    </button>
  {/if}
</span>

<style>
  .pick { display: inline-flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  label { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem; }
  input { width: 6.5rem; }
  .dim { font-size: 0.75rem; }
  .modes { display: inline-flex; gap: 0.25rem; }
  .modes button, .dir { padding: 0.2rem 0.7rem; font-size: 0.8125rem; }
</style>
