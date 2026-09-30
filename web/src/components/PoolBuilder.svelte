<script>
  // Le constructeur de vivier — 리스트추천, 추가번호, 제외번호, 제외구간,
  // 고정번호.
  //
  // Les trois écrans 조합 avaient chacun leur copie de ce bloc dans
  // l'ancien site, avec trois copies du même JavaScript. Ici c'est un seul
  // composant, et l'ordre des opérations — liste, ajout, retrait, tranche —
  // vit dans `buildPool()`, testé à part.
  import { buildPool, EXCLUDABLE_SECTIONS, PRESETS } from '@core/criteria.js'
  import { NMAX } from '@core/draws.js'

  import NumberCheck from './NumberCheck.svelte'
  import { num } from '../lib/format.js'

  let {
    presetKey = $bindable('all'),
    add = $bindable([]),
    remove = $bindable([]),
    sections = $bindable([]),
    fix = $bindable([]),
    withFixed = true,
    maxFixed = 5,
  } = $props()

  export const MAX_FIXED = 5

  const pool = $derived(buildPool({ preset: presetKey, add, remove, sections }))
  const poolSet = $derived(new Set(pool))
  const outside = $derived(new Set(
    Array.from({ length: NMAX }, (_, i) => i + 1).filter((n) => !poolSet.has(n))))
  const dropped = $derived(fix.filter((n) => !poolSet.has(n)))

  function toggleSection(key) {
    sections = sections.includes(key)
      ? sections.filter((s) => s !== key)
      : [...sections, key]
  }
</script>

<section class="panel">
  <div class="head">
    <h2>번호 범위</h2>
    <span class="gloss">리스트추천 · 추가번호 · 제외번호 · 제외구간</span>
    <span class="right">{num(pool.length)} / {NMAX}개</span>
  </div>

  <div class="row">
    <span class="label">리스트추천</span>
    <div class="chips">
      {#each PRESETS as p (p.key)}
        <button aria-pressed={presetKey === p.key} onclick={() => (presetKey = p.key)}>
          {p.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="row">
    <span class="label">제외구간</span>
    <div class="chips">
      {#each EXCLUDABLE_SECTIONS as b (b.key)}
        <button aria-pressed={sections.includes(b.key)} onclick={() => toggleSection(b.key)}>
          {b.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="grid two">
    <div>
      <span class="label">추가번호</span>
      <NumberCheck bind:selected={add} tone="gold" />
    </div>
    <div>
      <span class="label">제외번호</span>
      <NumberCheck bind:selected={remove} tone="strike" />
    </div>
  </div>

  <div class="poolview">
    <span class="label">최종 번호</span>
    {#if pool.length === 0}
      <p class="dim">번호가 하나도 남지 않았습니다.</p>
    {:else}
      <p class="numbers">{pool.join(', ')}</p>
    {/if}
  </div>
</section>

{#if withFixed}
  <section class="panel">
    <div class="head">
      <h2>고정번호</h2>
      <span class="gloss">최대 {maxFixed}개, 모든 조합에 포함</span>
      {#if fix.length}<span class="right">{fix.join(', ')}</span>{/if}
    </div>
    <NumberCheck bind:selected={fix} tone="gold" disabled={outside} />
    {#if fix.length > maxFixed}
      <p class="warn">고정번호는 {maxFixed}개까지입니다 — 지금 {fix.length}개.</p>
    {/if}
    {#if dropped.length}
      <p class="warn">{dropped.join(', ')}번은 번호 범위에 없어 제외됩니다.</p>
    {/if}
  </section>
{/if}

<style>
  .row {
    display: flex; align-items: center; gap: 0.5rem;
    flex-wrap: wrap; margin-bottom: 1rem;
  }
  .row .label { margin-right: 0.25rem; }
  .chips { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .chips button { font-size: 0.75rem; }

  .grid.two > div > .label { display: block; margin-bottom: 0.45rem; }

  .poolview { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid var(--line-soft); }
  .poolview .label { display: block; margin-bottom: 0.3rem; }
  .numbers { margin: 0; font-family: var(--figure); font-size: 0.8125rem; color: var(--ink-soft); }

  .warn { color: var(--s3); font-size: 0.8125rem; margin: 0.6rem 0 0; }
</style>
