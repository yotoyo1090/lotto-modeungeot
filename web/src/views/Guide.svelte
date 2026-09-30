<script>
  // 사용법 — le mode d'emploi de chaque écran : ce qu'il montre, comment
  // s'en servir, comment le lire, et comment l'exploiter.
  //
  // Le contenu vit dans `lib/guide.js` ; ce composant ne fait que le ranger,
  // le filtrer par la recherche et ouvrir l'écran décrit.
  import { GUIDE } from '../lib/guide.js'

  let { onopen = null } = $props()

  let query = $state('')

  const PARTS = [
    { key: 'what', label: '무엇을 보여주나' },
    { key: 'how', label: '사용 방법' },
    { key: 'read', label: '읽는 법' },
    { key: 'use', label: '활용법' },
    { key: 'caution', label: '주의' },
  ]

  const TITLES = Object.fromEntries(GUIDE.flatMap((g) => g.items.map((i) => [i.key, i.title])))

  const text = (item) =>
    [item.title, item.summary, ...PARTS.flatMap((p) => item[p.key])].join(' ').toLowerCase()

  // La recherche garde les fiches qui contiennent tous les mots tapés.
  const shown = $derived.by(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return GUIDE
    return GUIDE
      .map((g) => ({ ...g, items: g.items.filter((i) => words.every((w) => text(i).includes(w))) }))
      .filter((g) => g.items.length)
  })
  const count = $derived(shown.reduce((a, g) => a + g.items.length, 0))

  function jump(key) {
    query = ''
    // Le filtre levé, la fiche existe à nouveau : on attend le rendu.
    requestAnimationFrame(() => {
      document.getElementById(`guide-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
</script>

<section class="panel">
  <div class="head">
    <h2>사용법</h2>
    <span class="gloss">모든 화면의 읽는 법과 활용법</span>
    <span class="right">{count}개 항목</span>
  </div>
  <p class="soft intro">
    화면마다 <strong>무엇을 보여주나 · 사용 방법 · 읽는 법 · 활용법 · 주의</strong>를 정리했습니다.
    「이 화면 열기 →」를 누르면 그 화면으로 바로 갑니다. 이 도구는 통계를 보여줄 뿐
    <strong>당첨을 예측하지 않습니다.</strong>
  </p>
  <input class="search" type="search" placeholder="검색 — 예 : 고정수, 이월, 용지 인쇄" bind:value={query} />

  <nav class="toc">
    {#each shown as g (g.key)}
      <div class="tgroup">
        <b>{g.title}</b>
        {#each g.items as i (i.key)}
          <button class="chip" onclick={() => jump(i.key)}>{i.title}</button>
        {/each}
      </div>
    {/each}
  </nav>
</section>

{#each shown as g (g.key)}
  <h3 class="group">{g.title}</h3>
  {#each g.items as i (i.key)}
    <section class="panel card" id={`guide-${i.key}`}>
      <div class="chead">
        <h2>{i.title}</h2>
        {#if i.open && onopen}
          <button class="open" onclick={() => onopen(i.open)}>이 화면 열기 →</button>
        {/if}
      </div>
      <p class="summary">{i.summary}</p>

      {#each PARTS as p (p.key)}
        {#if i[p.key].length}
          <div class="part" class:warn={p.key === 'caution'} class:use={p.key === 'use'}>
            <h4>{p.label}</h4>
            {#if p.key === 'how'}
              <ol>{#each i[p.key] as line, k (k)}<li>{line}</li>{/each}</ol>
            {:else}
              <ul>{#each i[p.key] as line, k (k)}<li>{line}</li>{/each}</ul>
            {/if}
          </div>
        {/if}
      {/each}

      {#if i.related.length}
        <div class="related">
          <span class="dim">함께 보기</span>
          {#each i.related as r (r)}
            <button class="chip" onclick={() => jump(r)}>{TITLES[r] ?? r}</button>
          {/each}
        </div>
      {/if}
    </section>
  {/each}
{:else}
  <p class="panel dim">검색 결과가 없습니다.</p>
{/each}

<style>
  .gloss { color: var(--muted); font-size: 0.8125rem; }
  .intro { margin: 0 0 0.8rem; font-size: 0.875rem; line-height: 1.7; }
  .intro strong { color: var(--ink); }
  .search {
    width: 100%; font-size: 0.9375rem; padding: 0.5rem 0.75rem;
    border: 1px solid var(--line); border-radius: var(--radius); margin-bottom: 0.9rem;
  }
  .toc { display: grid; gap: 0.5rem; }
  .tgroup { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
  .tgroup b { font-size: 0.75rem; color: var(--gold-deep); min-width: 4.5rem; }
  .chip {
    font-size: 0.75rem; padding: 0.12rem 0.55rem; cursor: pointer;
    border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink);
  }
  .chip:hover { border-color: var(--gold); background: var(--gold-wash); }

  .group {
    margin: 1.8rem 0 0.6rem; font-size: 0.8125rem; letter-spacing: 0.08em;
    color: var(--gold-deep); border-bottom: 1px solid var(--gold); padding-bottom: 0.3rem;
  }
  .card { margin-bottom: 1rem; scroll-margin-top: 8rem; }
  .chead { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .chead h2 { margin: 0; font-size: 1.0625rem; }
  .open {
    border: 1px solid var(--gold); border-radius: 999px; padding: 0.25rem 0.8rem;
    font-size: 0.8125rem; color: var(--gold-deep); background: var(--surface); cursor: pointer;
  }
  .open:hover { background: var(--gold-wash); }
  .summary { margin: 0.5rem 0 0.4rem; font-size: 0.9375rem; line-height: 1.7; color: var(--ink); }

  .part { margin-top: 0.8rem; }
  .part h4 {
    margin: 0 0 0.3rem; font-size: 0.75rem; font-weight: 600;
    color: var(--muted); letter-spacing: 0.04em;
  }
  .part ul, .part ol { margin: 0; padding-left: 1.3rem; display: grid; gap: 0.3rem; }
  .part li { font-size: 0.875rem; line-height: 1.7; }
  .part.use {
    background: var(--gold-wash); border-left: 3px solid var(--gold);
    padding: 0.55rem 0.8rem; border-radius: var(--radius);
  }
  .part.use h4 { color: var(--gold-deep); }
  .part.warn h4 { color: var(--s3, #a33b2a); }

  .related { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin-top: 0.9rem; }
  .related .dim { font-size: 0.75rem; margin-right: 0.2rem; }
</style>
