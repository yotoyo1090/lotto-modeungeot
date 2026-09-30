<script>
  // 분포 — les histogrammes des indicateurs.
  //
  // L'ancienne plateforme écrivait 59 `GROUP BY` à la main, un par
  // indicateur et par page. Ici un seul `distribution()` appliqué à des
  // colonnes différentes, et un sélecteur pour choisir laquelle.
  //
  // Chaque histogramme repère la valeur du dernier tirage : sans ce
  // repère, une distribution ne dit rien qu'on puisse utiliser.
  import Bars from './Bars.svelte'
  import { num, rang } from '../lib/format.js'

  let { draws, metrics } = $props()

  const last = $derived(draws.n - 1)

  // Les indicateurs proposés. `bin` regroupe les valeurs par tranches : le
  // 총합 prend 180 valeurs distinctes entre 60 et 230, une barre chacune
  // donnerait un mur de 180 lignes où l'on ne verrait plus la forme. Les
  // comptages (이월, 저고, 홀짝…) n'en ont pas besoin — ils vont de 0 à 7.
  const CHOICES = $derived([
    { key: 'total', label: '총합', gloss: '일곱 번호의 합',
      column: metrics.total, bin: 10 },
    { key: 'ac', label: 'AC값', gloss: '서로 다른 차 − 6',
      column: metrics.ac },
    { key: 'carry', label: '이월', gloss: '직전 회차에서 이어진 번호',
      column: metrics.carryCount.subarray(1), suffix: '개' },
    { key: 'low', label: '저고', gloss: '1–22의 개수',
      column: metrics.lowCount, suffix: '개' },
    { key: 'odd', label: '홀짝', gloss: '홀수의 개수',
      column: metrics.oddCount, suffix: '개' },
    { key: 'prime', label: '소수', gloss: '소수의 개수',
      column: metrics.primeCount, suffix: '개' },
    { key: 'head', label: '앞자리수합', gloss: '앞자리 숫자의 합',
      column: metrics.headSum, bin: 5 },
    { key: 'tail', label: '끝자리수합', gloss: '끝자리 숫자의 합',
      column: metrics.tailSum, bin: 5 },
  ])

  const floor = (v, size) => Math.floor(v / size) * size
  const band = (lo, size) => (size === 1 ? String(lo) : `${lo}–${lo + size - 1}`)

  /**
   * Regroupe par tranches de `size`, **sans trous** : les tranches vides
   * gardent leur ligne. Sans elles, deux barres voisines à l'écran
   * pourraient être éloignées de cinquante points, et la forme mentirait.
   */
  function grouped(column, size) {
    const values = [...column]
    if (!values.length) return {}
    const lo = floor(Math.min(...values), size)
    const hi = floor(Math.max(...values), size)
    const out = {}
    for (let start = lo; start <= hi; start += size) out[band(start, size)] = 0
    for (const v of values) out[band(floor(v, size), size)]++
    return out
  }

  let chosen = $state('total')
  const current = $derived(CHOICES.find((c) => c.key === chosen) ?? CHOICES[0])

  // Toujours `grouped`, même sans regroupement : `distribution` ne liste
  // que les valeurs observées, si bien qu'un AC값 jamais sorti disparaissait
  // de l'histogramme et les barres voisines se touchaient à tort.
  const data = $derived(grouped(current.column, current.bin ?? 1))

  const value = $derived(current.column[current.column.length - 1])
  const mark = $derived(current.bin ? band(floor(value, current.bin), current.bin) : value)

  // Moyenne et étendue : trois chiffres qui situent l'histogramme d'un coup.
  const stats = $derived.by(() => {
    const values = [...current.column]
    if (!values.length) return null
    const sum = values.reduce((a, b) => a + b, 0)
    return {
      mean: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    }
  })
</script>

<section class="panel">
  <div class="head">
    <h2>분포</h2>
    <span class="gloss">{current.gloss}</span>
    {#if stats}
      <span class="right">
        평균 {stats.mean.toFixed(1)} · {num(stats.min)}–{num(stats.max)}
      </span>
    {/if}
  </div>

  <div class="picker">
    {#each CHOICES as choice (choice.key)}
      <button aria-pressed={chosen === choice.key}
              onclick={() => (chosen = choice.key)}>{choice.label}</button>
    {/each}
  </div>

  <Bars {data} {mark} suffix={current.suffix ?? ''} />

  <p class="foot">
    금색 막대 = {rang(draws.rangs[last])} ({num(value)}{current.suffix ?? ''})
    {#if current.bin}<span class="dim"> · {current.bin}단위</span>{/if}
  </p>
</section>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1.25rem;
  }
  .picker button { font-size: 0.8125rem; }

  .foot {
    margin: 1rem 0 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
