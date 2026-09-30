<script>
  // 결과 필터 — affiner la liste déjà calculée, sans relancer le moteur.
  // Commun au 일반조합 et au 자동조합 (voir `lib/pick.js`).
  import { FILTER_KEYS } from '../lib/pick.js'
  import { num } from '../lib/format.js'

  // `left` : combien de grilles passent encore, `of` : sur combien.
  // `local` : les colonnes qui ne filtrent que les grilles tirées ; les
  // autres partent au moteur et filtrent toutes les grilles (voir `mergeConds`).
  let { conds = $bindable([]), left = 0, of = 0, hide = [], local = [] } = $props()
  // `hide` : les colonnes qui n'ont pas de sens ici (당첨 개수 avant le tirage).
  const keys = $derived(FILTER_KEYS.filter((k) => !hide.includes(k.key)))

  // Les conditions vivent chez l'écran et survivent à un nouveau calcul :
  // l'identifiant suivant se lit donc sur elles, pas sur un compteur local.
  const add = () => {
    const id = Math.max(0, ...conds.map((c) => c.id)) + 1
    conds.push({ id, key: 'total', min: '', max: '' })
  }
  const drop = (id) => { conds = conds.filter((c) => c.id !== id) }
  const HINT = { sharing: '예 0.9', popularity: '예 1.0', won: '0~6' }
</script>

<div class="rowfilter">
  <button class="add" onclick={add}>+ 결과 필터</button>
  {#each conds as c (c.id)}
    <span class="cond">
      <select bind:value={c.key}>
        {#each keys as k (k.key)}<option value={k.key}>{k.label}</option>{/each}
      </select>
      <input type="number" step="any" placeholder={HINT[c.key] ?? '최소'} bind:value={c.min} />
      ~
      <input type="number" step="any" placeholder={HINT[c.key] ?? '최대'} bind:value={c.max} />
      <em class="scope" class:local={local.includes(c.key)}
          title={local.includes(c.key) ? '뽑힌 조합에만 적용' : '통과한 조합 전체에 적용(다시 계산)'}>
        {local.includes(c.key) ? '뽑힌 것만' : '전체'}
      </em>
      <button class="x" onclick={() => drop(c.id)} aria-label="필터 지우기">×</button>
    </span>
  {/each}
  {#if conds.some((c) => local.includes(c.key))}
    <span class="dim">뽑힌 것 중 <strong>{num(left)}</strong> / {num(of)}개</span>
  {/if}
  {#if conds.length}
    <button class="clear" onclick={() => (conds = [])}>필터 모두 지우기</button>
  {/if}
</div>

<style>
  .rowfilter { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
  .cond {
    display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem;
    border: 1px solid var(--line); border-radius: var(--radius); padding: 0.2rem 0.4rem;
  }
  input { width: 4.8rem; }
  .x { border: 0; background: none; cursor: pointer; color: var(--muted); font-size: 1rem; padding: 0 0.2rem; }
  .add, .clear { padding: 0.2rem 0.7rem; font-size: 0.8125rem; }
  .dim { font-size: 0.75rem; }
  .scope {
    font-style: normal; font-size: 0.6875rem; padding: 0 0.35rem; border-radius: 999px;
    border: 1px solid var(--gold); color: var(--gold-deep);
  }
  .scope.local { border-color: var(--line); color: var(--muted); }
</style>
