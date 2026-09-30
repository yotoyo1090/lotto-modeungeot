<script>
  // Des pages de `size` lignes : tout reste consultable, mais le navigateur
  // n'a jamais plus d'une page à dessiner. Rien n'apparaît s'il n'y a qu'une page.
  import { num } from '../lib/format.js'

  let { page = 0, total = 0, size = 500, onpage } = $props()

  const pages = $derived(Math.max(1, Math.ceil(total / size)))
  const at = $derived(Math.min(page, pages - 1))
  const from = $derived(total ? at * size + 1 : 0)
  const to = $derived(Math.min(total, (at + 1) * size))
</script>

{#if total > size}
  <div class="pager">
    <button onclick={() => onpage?.(0)} disabled={at === 0} aria-label="처음">«</button>
    <button onclick={() => onpage?.(at - 1)} disabled={at === 0} aria-label="이전">◀</button>
    <span>{num(from)}–{num(to)} / {num(total)}</span>
    <button onclick={() => onpage?.(at + 1)} disabled={at >= pages - 1} aria-label="다음">▶</button>
    <button onclick={() => onpage?.(pages - 1)} disabled={at >= pages - 1} aria-label="끝">»</button>
  </div>
{/if}

<style>
  .pager { display: flex; align-items: center; gap: 0.35rem; margin: 0.5rem 0; font-size: 0.8125rem; }
  .pager button { padding: 0.1rem 0.55rem; }
</style>
