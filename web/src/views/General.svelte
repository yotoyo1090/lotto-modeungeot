<script>
  // L'onglet 일반조합.
  //
  // L'écran d'origine faisait 1 817 lignes de template pour **une** boucle
  // et **une** variable : tout le reste était du HTML collé en dur, dont
  // deux tableaux figés sur le 1087회 depuis des années. Et son bouton
  // 조합하기 ne marchait pas du tout — `base.html` L1721 écrit
  // `let  = extractedValueoldlist`, sans nom de variable, ce qui invalide
  // le script entier.
  //
  // Les quatre blocs sont donc ici pour la première fois vivants : le 패턴,
  // le 차뜨, le constructeur de vivier, et la combinaison.
  import { lineStats, stack, temperatureShare, upcomingBoard } from '@core/board.js'
  import { buildPool } from '@core/criteria.js'
  import { describeRow } from '@core/row.js'
  import { numberStats, tableListCellStats } from '@core/tablelist.js'

  import BadgeStrip from '../components/BadgeStrip.svelte'
  import ComboTable from '../components/ComboTable.svelte'
  import PatternBoard from '../components/PatternBoard.svelte'
  import PoolBuilder from '../components/PoolBuilder.svelte'
  import RangPick from '../components/RangPick.svelte'
  import TempBoard from '../components/TempBoard.svelte'
  import { isSkipped, search } from '../lib/generator.js'
  import { grids as gridStore } from '../lib/store.js'
  import {
    activeConds, ENGINE_KEYS, ENGINE_MAX, engineOptions,
    FILTER_KEYS, gridAt, mergeConds, NEEDS_PREVIOUS, PAGE, pickIndices, shuffleGrids,
  } from '../lib/pick.js'
  import { untrack } from 'svelte'
  import PickControls from '../components/PickControls.svelte'
  import RowFilter from '../components/RowFilter.svelte'
  import { day, num, rang as fmt } from '../lib/format.js'

  let { draws } = $props()

  let picked = $state(null)
  const current = $derived.by(() => {
    const last = draws.rangs[draws.n - 1]
    if (picked === null) return last
    return picked < draws.rangs[0] || picked > last ? last : picked
  })
  const index = $derived(draws.indexOf(current))

  // Le 회차 regardé et les deux d'avant — les deux tableaux les empilent.
  const boards = $derived(stack(draws, current))

  // Les deux tableaux y ajoutent le 회차 **à venir**, en tête : c'est celui
  // qu'on prépare. On ne le pose que si l'on regarde bien la fin de
  // l'historique — au milieu du passé, « le prochain tirage » n'a aucun sens.
  const atLast = $derived(draws.rangs[draws.n - 1] === current)

  // Chaque carte porte les sept du 회차 **suivant**, quand il existe : c'est
  // ce que le 패턴 coche sur la grille.
  const withNext = (list) => list.map((b) => {
    const i = draws.indexOf(b.rang)
    if (i < 0 || i + 1 >= draws.n) return b
    return { ...b, next: [...draws.sequenceAt(i + 1)] }
  })
  const stackBoards = $derived(atLast
    ? [upcomingBoard(draws), ...withNext(boards)]
    : withNext(boards))
  const drawn = $derived([...draws.fullAt(index)])

  // Les deux références du 차뜨 : la part de chaque bande sur toute
  // l'histoire, et le taux de gagnants par ligne du tableau.
  const tempShare = $derived(temperatureShare(draws))
  const tempLines = $derived(lineStats(draws))
  // Et le taux du numéro lui-même, avec le χ² qui le remet à sa place.
  const tempNumbers = $derived(numberStats(draws))
  // Les deux marges de la grille 패턴 — même forme que le 테이블리스트.
  const patternCells = $derived(tableListCellStats(draws))

  let family = $state(null)
  const highlight = $derived(new Set(family?.numbers ?? []))

  // Le vivier
  let presetKey = $state('all')
  let add = $state([])
  let remove = $state([])
  let sections = $state([])
  let fix = $state([])
  const pool = $derived(buildPool({ preset: presetKey, add, remove, sections }))
  const poolSet = $derived(new Set(pool))
  const fixValid = $derived(fix.filter((n) => poolSet.has(n)))

  const previous = $derived(index > 0 && draws.rangs[index - 1] === current - 1
    ? [...draws.sequenceAt(index - 1)]
    : null)

  // La combinaison — même réglage que le 자동조합 (voir `lib/pick.js`).
  // Pas de 개수 : tout ce qui passe (jusqu'au plafond du moteur), 500 à
  // l'écran puis 500 de plus par 「더 보기」, et tout à l'enregistrement.
  let pickMode = $state('random')
  let sortKey = $state('none')
  let sortDir = $state('asc')
  let conds = $state([])
  const count = ENGINE_MAX
  let listed = $state(PAGE)

  let status = $state('idle')
  // `raw` : jamais modifié en place, et trop gros pour un proxy par numéro
  // (voir le 자동조합).
  let result = $state.raw(null)
  let failure = $state(null)

  // Le 결과 필터, côté moteur — même règle que le 자동조합 (`mergeConds`).
  const merged = $derived(mergeConds(
    { pool: [...pool], include: [...fixValid] }, $state.snapshot(conds), previous))
  const rest = $derived(merged.rest ?? [])

  async function run() {
    status = 'running'
    failure = null
    if (merged.impossible) {
      result = {
        grids: [], count: 0, kept: 0, candidates: result?.candidates ?? 0, rejected: [],
        elapsedMs: 0, mode: pickMode,
        impossible: FILTER_KEYS.find((k) => k.key === merged.impossible)?.label,
      }
      checked = new Set()
      status = 'done'
      return
    }
    try {
      const mode = pickMode
      const r = await search('lotto', merged.filters, engineOptions(mode, count))
      if (mode === 'random') shuffleGrids(r.grids)
      result = { ...r, mode }
      checked = new Set()
      listed = PAGE
      status = 'done'
    } catch (error) {
      if (isSkipped(error)) return
      failure = error.message
      status = 'failed'
    }
  }

  // Ce qu'on garde va dans le carnet commun aux trois écrans, marqué de sa
  // provenance : 조합결과 le range sous 일반조합. Tout part — la liste
  // entière, ou le coché. La seule borne est la place du navigateur.
  let saveName = $state('')
  let notice = $state(null)

  function saveGrids() {
    if (!toSave.length) return
    const keep = toSave.map((i) => gridAt(result.grids, i))
    const entry = gridStore.save({
      name: saveName || `${current}회 일반`,
      rang: current,
      source: 'general',
      grids: keep,
      pool: [...pool],
    })
    if (!entry) {
      notice = `브라우저가 저장을 거부했습니다 — ${num(keep.length)}개는 브라우저 저장 공간(약 5MB)에 비해 너무 많을 수 있습니다. 조건이나 결과 필터로 조합 수를 줄이거나, 일부를 체크해 저장해 보세요.`
      return
    }
    saveName = ''
    notice = `${entry.name} — ${keep.length}개 조합을 조합결과에 저장했습니다.`
  }

  // Même chemin que le 자동조합 : des positions, et seule la page est décrite.
  const taken = $derived(result ? result.count : 0)
  const order = $derived(result
    ? pickIndices(result.grids, taken, { conds: rest, sortKey, dir: sortDir, previous })
    : [])
  const filtering = $derived(rest.length > 0)

  // Une condition envoyée au moteur a changé : on relance (400 ms après).
  const engineConds = $derived(JSON.stringify(activeConds(conds).filter((c) => ENGINE_KEYS.has(c.key))))
  let rerun = null
  $effect(() => {
    engineConds
    if (!untrack(() => result)) return
    clearTimeout(rerun)
    rerun = setTimeout(run, 400)
  })
  const shown = $derived(order.slice(0, listed).map((i, k) => ({
    ...describeRow(gridAt(result.grids, i), { rang: current, previous }),
    _i: i, _pos: k + 1,
  })))

  // Les cases cochées — même règle que le 자동조합.
  let checked = $state(new Set())
  const toggle = (i) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    checked = next
  }
  const checkAll = () => { checked = new Set(order) }
  const listedChecked = $derived(checked.size ? order.filter((i) => checked.has(i)) : [])
  const hiddenChecked = $derived(checked.size - listedChecked.length)
  const toSave = $derived(listedChecked.length ? listedChecked : order)
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>일반조합</h2>
    <span class="gloss">두 가지 표와, 필터 없는 조합</span>
  </div>
  <RangPick {draws} value={current} onpick={(r) => (picked = r)} />
</section>

<section class="panel">
  <div class="head">
    <h2>{fmt(current)}</h2>
    <span class="gloss">{day(draws.dates[index])}</span>
    <span class="right">번호를 눌러 두 표에서 찾아보세요</span>
  </div>
  <BadgeStrip {drawn} pool={pool} bind:selected={family} />
</section>

<PatternBoard boards={stackBoards} {highlight} cells={patternCells}
              numbers={tempNumbers} />

<TempBoard boards={stackBoards} {highlight} history={tempShare} lines={tempLines}
           numbers={tempNumbers} />

<PoolBuilder bind:presetKey bind:add bind:remove bind:sections bind:fix />

<section class="panel run">
  <button class="go" onclick={run} disabled={status === 'running' || pool.length < 6}>
    {status === 'running' ? '계산 중…' : '조합하기'}
  </button>
  <PickControls bind:mode={pickMode} bind:sort={sortKey} bind:dir={sortDir}
                max={ENGINE_MAX} hide={['won']} counts={false} />
  <span class="dim">
    {#if pool.length < 6}
      번호가 6개 이상 필요합니다.
    {:else}
      필터 없이 {num(pool.length)}개에서 6개를 모두 조합합니다(최대 {num(ENGINE_MAX)}개).
      500개씩 보이고 「더 보기」로 늘어납니다.
    {/if}
  </span>
</section>

{#if status === 'failed'}
  <section class="panel"><p class="warn">{failure}</p></section>
{/if}

{#if status === 'done' && result}
  <section class="panel">
    <div class="head">
      <h2>조합 결과</h2>
      <span class="gloss">{fmt(current)} 기준</span>
      <span class="right">
        조합수 {num(result.kept)}
        {#if result.kept > taken}
          · {result.mode === 'order' ? '번호 순 앞의' : '무작위'} {num(taken)}개 뽑음
        {/if}
        · {num(Math.min(listed, order.length))}개 표시
        {#if filtering} · 필터 후 {num(order.length)}개{/if}
        {#if (sortKey !== 'none' || filtering) && result.kept > taken}
          · 필터 · 정렬은 뽑힌 {num(taken)}개 안에서
        {/if}
        · {result.elapsedMs.toFixed(0)} ms
      </span>
    </div>

    <RowFilter bind:conds left={order.length} of={taken} hide={['won']}
               local={previous ? [] : NEEDS_PREVIOUS} />
    {#if result.impossible}
      <p class="dim small">결과 필터의 「{result.impossible}」 조건이 다른 조건과 겹치지 않아, 통과하는 조합이 없습니다.</p>
    {/if}

    {#if taken === 0}
      <p class="dim">조합이 없습니다.</p>
    {:else}
      <div class="saveline">
        <input class="name" type="text" placeholder="이름 (비워도 됩니다)"
               bind:value={saveName} />
        <button onclick={saveGrids} disabled={!toSave.length}>
          {listedChecked.length ? '선택한' : '전체'} 조합결과에 저장
        </button>
        <button onclick={checkAll} disabled={!order.length}>전체 선택</button>
        <button onclick={() => (checked = new Set())} disabled={!checked.size}>전체 해제</button>
        {#if hiddenChecked > 0}
          <span class="dim small">선택한 것 중 {num(hiddenChecked)}개는 지금 목록에 없어 저장되지 않습니다.</span>
        {/if}
        {#if notice}<span class="dim small">{notice}</span>{/if}
      </div>
      {#if order.length === 0}
        <p class="dim">결과 필터를 통과한 조합이 없습니다.</p>
      {:else}
        <ComboTable rows={shown} limit={shown.length} {checked} ontoggle={toggle} />
        {#if order.length > listed}
          <button class="more" onclick={() => (listed += PAGE)}>
            더 보기 ({num(listed)} / {num(order.length)})
          </button>
        {/if}
      {/if}
      <p class="note dim">
        「전회차이월번호」는 {previous ? fmt(current - 1) : '이전 회차'}의 7개 번호와
        겹치는 것, 「전회차이월번위치」는 그 회차에서의 자리(1–7)입니다.
        {#if !previous}이전 회차가 없어 비어 있습니다.{/if}
      </p>
    {/if}
  </section>
{/if}

<style>
  .more { margin: 0.6rem 0 0; padding: 0.3rem 1rem; font-size: 0.8125rem; }
  .saveline {
    display: flex; gap: 0.4rem; flex-wrap: wrap;
    align-items: center; margin-bottom: 0.9rem;
  }
  .name { min-width: 12rem; }
  .small { font-size: 0.75rem; }

  .bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.75rem;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .run { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .go {
    border-color: var(--gold); color: var(--gold);
    padding: 0.45rem 1.4rem; font-size: 0.9375rem;
  }
  .go:disabled { border-color: var(--line); color: var(--muted); cursor: default; }
  .run .dim { font-size: 0.75rem; }

  .warn { color: var(--s3); font-size: 0.8125rem; margin: 0; }
  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
</style>
