<script>
  // Les étiquettes cliquables qui surlignent une famille de numéros dans les
  // deux tableaux.
  //
  // C'est le geste central de ces deux écrans : cliquer 소수 et voir d'un
  // coup où tombent les premiers dans le 패턴 et dans le 차뜨. L'ancien site
  // le faisait avec dix-neuf classes CSS et autant de blocs jQuery ; ici
  // c'est un ensemble de numéros qui remonte au parent.
  //
  // 리스트 I et 리스트 II sont deux tirages au sort — 5 et 35 numéros pris
  // dans le vivier. L'ancien les retirait à chaque rendu, sans le dire, ce
  // qui donnait des listes différentes à chaque clic ailleurs sur la page.
  // Ici c'est un bouton : on tire quand on le demande.
  import { COMPOSITES, NMAX, PRIMES } from '@core/draws.js'
  import { EXCLUDABLE_SECTIONS } from '@core/criteria.js'

  let { drawn = [], pool = null, selected = $bindable(null) } = $props()

  const series = (step) => {
    const out = []
    for (let n = step; n <= NMAX; n += step) out.push(n)
    return out
  }
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

  let lottery = $state({ one: [], two: [] })

  const families = $derived([
    { key: 'won', label: '당첨 회차', numbers: [...drawn] },
    { key: 'mult2', label: '이의배수', numbers: series(2) },
    { key: 'mult3', label: '삼의배수', numbers: series(3) },
    { key: 'mult4', label: '사의배수', numbers: series(4) },
    { key: 'mult5', label: '오의배수', numbers: series(5) },
    { key: 'primes', label: '소수', numbers: [...PRIMES] },
    { key: 'composites', label: '합성수', numbers: [...COMPOSITES] },
    { key: 'low', label: '저수', numbers: range(1, 22) },
    { key: 'high', label: '고수', numbers: range(23, NMAX) },
    { key: 'odd', label: '홀수', numbers: range(1, NMAX).filter((n) => n % 2) },
    { key: 'even', label: '짝수', numbers: range(1, NMAX).filter((n) => !(n % 2)) },
    ...EXCLUDABLE_SECTIONS.map((b) => ({
      key: `s${b.key}`, label: `${b.key}구간`, numbers: b.numbers,
    })),
    ...(pool ? [{ key: 'pool', label: '선택 리스트', numbers: [...pool] }] : []),
    ...(lottery.one.length ? [{ key: 'l1', label: '리스트 I', numbers: lottery.one }] : []),
    ...(lottery.two.length ? [{ key: 'l2', label: '리스트 II', numbers: lottery.two }] : []),
  ])

  function pick(family) {
    selected = selected?.key === family.key ? null : family
  }

  function shuffle() {
    const source = pool?.length ? [...pool] : range(1, NMAX)
    const bag = [...source]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    const sort = (a) => [...a].sort((x, y) => x - y)
    lottery = {
      one: sort(bag.slice(0, Math.min(5, bag.length))),
      two: sort(bag.slice(0, Math.min(35, bag.length))),
    }
  }
</script>

<div class="strip">
  {#each families as f (f.key)}
    <button class="badge" aria-pressed={selected?.key === f.key} onclick={() => pick(f)}>
      {f.label}<span class="n">{f.numbers.length}</span>
    </button>
  {/each}
  <button class="badge draw" onclick={shuffle}>리스트 뽑기</button>
  {#if selected}
    <button class="badge clear" onclick={() => (selected = null)}>선택 해제</button>
  {/if}
</div>

{#if selected}
  <p class="chosen">
    <span class="label">{selected.label}</span>
    {selected.numbers.join(', ')}
  </p>
{/if}

<style>
  .strip { display: flex; flex-wrap: wrap; gap: 0.3rem; }

  .badge {
    font-size: 0.6875rem;
    padding: 0.2rem 0.5rem;
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
  }
  .badge .n { color: var(--muted); font-size: 0.625rem; }
  .badge[aria-pressed='true'] .n { color: var(--gold); }
  .draw { border-style: dashed; color: var(--ink-soft); }
  .clear { color: var(--muted); }

  .chosen {
    margin: 0.6rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-soft);
    font-family: var(--figure);
  }
  .chosen .label { font-family: var(--font); margin-right: 0.5rem; }
</style>
