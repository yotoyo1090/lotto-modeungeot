<script>
  // L'onglet 수동조합.
  //
  // Cet écran ne génère rien — c'est le seul des trois. On y tape ses
  // propres grilles et l'outil les évalue : les 36 colonnes se remplissent
  // dès que six numéros valides sont posés, une ligne vide s'ajoute en bas,
  // elle se retire quand on efface.
  //
  // L'ancien faisait la même chose en manipulant le DOM à la main, ce qui
  // lui a coûté deux défauts : une ligne partiellement remplie était
  // enregistrée avec ses colonnes manquantes, et le nettoyage des cellules
  // recalculées reposait sur un « plus de 42 cellules » fragile. Ici l'état
  // est une liste de nombres, et le tableau n'en est que l'affichage.
  import { lineStats, stack, temperatureShare, upcomingBoard } from '@core/board.js'
  import { buildPool } from '@core/criteria.js'
  import { NMAX, PICK } from '@core/draws.js'
  import { describeRow } from '@core/row.js'
  import { numberStats, tableListCellStats } from '@core/tablelist.js'

  import BadgeStrip from '../components/BadgeStrip.svelte'
  import Bars from '../components/Bars.svelte'
  import ComboTable from '../components/ComboTable.svelte'
  import PatternBoard from '../components/PatternBoard.svelte'
  import PoolBuilder from '../components/PoolBuilder.svelte'
  import RangPick from '../components/RangPick.svelte'
  import TempBoard from '../components/TempBoard.svelte'
  import { choices } from '../lib/combinaison.js'
  import { day, num, rang as fmt } from '../lib/format.js'
  import * as store from '../lib/store.js'

  let { draws } = $props()

  const last = $derived(draws.rangs[draws.n - 1])

  // Le 회차 va jusqu'au prochain non tiré : c'est celui qu'on prépare.
  let picked = $state(null)
  const target = $derived(picked ?? last + 1)
  const known = $derived(target <= last)
  const boardRang = $derived(known ? target : last)
  const index = $derived(draws.indexOf(boardRang))

  const boards = $derived(stack(draws, boardRang))

  // Les deux tableaux posent en tête le 회차 à venir — celui pour lequel on
  // saisit ses grilles. Il disparaît si l'on remonte dans le passé.
  const atLast = $derived(draws.rangs[draws.n - 1] === boardRang)

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
  const previous = $derived.by(() => {
    for (let k = draws.n - 1; k >= 0; k--) {
      if (draws.rangs[k] === target - 1) return [...draws.sequenceAt(k)]
    }
    return null
  })

  let family = $state(null)
  const highlight = $derived(new Set(family?.numbers ?? []))

  // Le vivier — sans 고정번호 : l'ancien formulaire manuel n'en avait pas.
  let presetKey = $state('all')
  let add = $state([])
  let remove = $state([])
  let sections = $state([])
  const pool = $derived(buildPool({ preset: presetKey, add, remove, sections }))

  // --- la grille de saisie ----------------------------------------------

  const blank = () => Array(PICK).fill('')
  let grid = $state([blank()])

  /** Une ligne : ses numéros valides, ses doublons, son état. */
  function inspect(line) {
    const values = line.map((v) => (v === '' || v === null ? null : Number(v)))
    const filled = values.filter((v) => v !== null)
    const bad = values.map((v) =>
      v !== null && (!Number.isInteger(v) || v < 1 || v > NMAX))
    const seen = new Map()
    for (const v of filled) seen.set(v, (seen.get(v) ?? 0) + 1)
    const dup = values.map((v) => v !== null && seen.get(v) > 1)
    const complete = filled.length === PICK && !bad.some(Boolean) && !dup.some(Boolean)
    return { values, filled, bad, dup, complete, empty: filled.length === 0 }
  }

  const lines = $derived(grid.map(inspect))

  const described = $derived(lines.map((line) =>
    line.complete
      ? describeRow(line.filled, { rang: target, previous })
      : null))

  const ready = $derived(described.filter(Boolean))

  // Une ligne vide en bas, toujours ; et pas deux. Écrit comme une
  // transformation de la liste, pas comme un effet qui se relit lui-même —
  // c'est ce qui avait provoqué la boucle infinie du générateur.
  function normalise() {
    let next = grid.filter((line, i) =>
      i === grid.length - 1 || !inspect(line).empty)
    if (next.length === 0 || !inspect(next.at(-1)).empty) next = [...next, blank()]
    if (next.length !== grid.length) grid = next
  }

  function set(row, col, value) {
    const line = [...grid[row]]
    line[col] = value
    grid = grid.map((l, i) => (i === row ? line : l))
    normalise()
  }

  function clearAll() { grid = [blank()] }

  function removeLine(row) {
    grid = grid.filter((_, i) => i !== row)
    normalise()
  }

  function fillFromPool(row) {
    // Un coup de pouce que l'ancien n'avait pas : six numéros pris au hasard
    // dans le vivier, pour partir de quelque chose plutôt que d'une ligne vide.
    const bag = [...pool]
    if (bag.length < PICK) return
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    const line = bag.slice(0, PICK).sort((a, b) => a - b).map(String)
    grid = grid.map((l, i) => (i === row ? line : l))
    normalise()
  }

  // --- l'enregistrement --------------------------------------------------

  const canStore = store.available()
  let saved = $state(store.load())
  let name = $state('')
  let notice = $state(null)

  function doSave() {
    if (!ready.length) return
    const entry = store.save({
      name,
      rang: target,
      // Le carnet est commun aux trois écrans ; `source` dit d'où vient la
      // grille, et 조합결과 les range par là.
      source: 'manual',
      grids: ready.map((r) => r.numbers),
      pool: [...pool],
    })
    if (!entry) { notice = '브라우저가 저장을 거부했습니다.'; return }
    saved = store.load()
    name = ''
    notice = `${entry.name} — ${entry.grids.length}개 조합을 저장했습니다.`
  }

  function reopen(entry) {
    grid = entry.grids.map((g) => g.map(String))
    normalise()
    notice = `${entry.name} 를 불러왔습니다.`
  }

  function drop(id) {
    store.remove(id)
    saved = store.load()
  }

  function exportFile() {
    const blob = new Blob([store.toFile()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lotto-수동조합.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(event) {
    // `currentTarget` ne vaut que pendant la propagation de l'événement :
    // après le premier `await` il est nul, et le remettre à zéro plus bas
    // levait. On garde donc l'élément avant d'attendre quoi que ce soit.
    // Sans cette remise à zéro, choisir deux fois de suite le **même**
    // fichier n'émet pas de second `change` — l'import paraîtrait ignoré.
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const added = store.fromFile(await file.text())
      saved = store.load()
      notice = `${added}개를 불러왔습니다.`
    } catch (error) {
      notice = error.message
    }
    input.value = ''
  }

  // --- les treize histogrammes -------------------------------------------

  const opts = $derived(choices(draws))

  // La dernière grille complète : on marque sa valeur dans chaque
  // distribution. Un histogramme sans repère ne répond pas à la seule
  // question qu'on se pose ici — « et la mienne, elle est où ? »
  const current = $derived.by(() => {
    const r = ready.at(-1)
    if (!r) return {}
    return {
      total: r.total, odd: r.odd.length, low: r.low.length, ac: r.ac,
      carry: r.carried.length, headSum: r.headSum, tailSum: r.tailSum,
      primes: r.primes.count, composites: r.composites.count,
      mult2: r.multiples[2].count, mult3: r.multiples[3].count,
      mult4: r.multiples[4].count, mult5: r.multiples[5].count,
    }
  })
  const toBars = (entries) =>
    Object.fromEntries(entries.map((o) => [o.value, o.seen]))

  const CHARTS = $derived([
    { key: 'total', label: '총합', gloss: '1등 기준', bin: 10 },
    { key: 'odd', label: '홀수 짝수 비율', gloss: '1등 기준' },
    { key: 'low', label: '저수 고수 비율', gloss: '1등 기준' },
    { key: 'ac', label: 'AC값', gloss: '1등 기준' },
    { key: 'carry', label: '전회차이월번호', gloss: '보너스포함 기준' },
    { key: 'headSum', label: '앞자리수합', gloss: '1등 기준' },
    { key: 'tailSum', label: '끝자리수합', gloss: '1등 기준' },
    { key: 'primes', label: '소수', gloss: '개수 기준' },
    { key: 'composites', label: '합성수', gloss: '개수 기준' },
    { key: 'mult2', label: '이의배수', gloss: '개수 기준' },
    { key: 'mult3', label: '삼의배수', gloss: '개수 기준' },
    { key: 'mult4', label: '사의배수', gloss: '개수 기준' },
    { key: 'mult5', label: '오의배수', gloss: '개수 기준' },
  ])

  // Les treize, ensemble. L'ancien les affichait tous d'un coup et c'est
  // ce qu'il faut : on vient ici pour comparer sa grille à plusieurs
  // distributions à la fois, pas pour en feuilleter une par une.
  const binned = (entries, bin) => {
    if (!bin) return Object.fromEntries(entries.map((o) => [o.value, o.seen]))
    // Le 총합 prend deux cents valeurs distinctes : une barre par valeur ne
    // se lit pas. On regroupe par dizaine, comme sur l'onglet 분석.
    const bins = new Map()
    for (const o of entries) {
      const lo = Math.floor(o.value / bin) * bin
      const key = `${lo}–${lo + bin - 1}`
      bins.set(key, (bins.get(key) ?? 0) + o.seen)
    }
    return Object.fromEntries(bins)
  }

  const charts = $derived(CHARTS.map((c) => ({
    ...c,
    data: binned(opts[c.key] ?? [], c.bin),
    mark: c.key in current ? current[c.key] : null,
  })))

  const format = (key, value) =>
    (key === 'low' || key === 'odd') ? `${value} : ${PICK - value}` : String(value)
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>수동조합</h2>
    <span class="gloss">직접 고른 조합의 평가</span>
  </div>
  <div class="pick">
    <span class="label">회차</span>
    <select bind:value={picked}>
      <option value={null}>{fmt(last + 1)} · 다음 회차</option>
      {#each Array.from({ length: Math.min(draws.n, 60) }, (_, i) => draws.n - 1 - i) as k (k)}
        <option value={draws.rangs[k]}>{fmt(draws.rangs[k])} · {day(draws.dates[k])}</option>
      {/each}
    </select>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>{known ? fmt(boardRang) : `${fmt(boardRang)} (마지막 추첨)`}</h2>
    <span class="gloss">{day(draws.dates[index])}</span>
    <span class="right">번호를 눌러 두 표에서 찾아보세요</span>
  </div>
  <BadgeStrip {drawn} pool={pool} bind:selected={family} />
</section>

<PatternBoard boards={stackBoards} {highlight} cells={patternCells}
              numbers={tempNumbers} />

<TempBoard boards={stackBoards} {highlight} history={tempShare} lines={tempLines}
           numbers={tempNumbers} />

<PoolBuilder bind:presetKey bind:add bind:remove bind:sections withFixed={false} />

<section class="panel">
  <div class="head">
    <h2>참고 통계</h2>
    <span class="gloss">역대 1등 조합의 분포, 13가지</span>
    <span class="right">
      {num(draws.n)}회차{#if ready.length} · 마지막 조합에 표시{/if}
    </span>
  </div>

  <div class="charts">
    {#each charts as c (c.key)}
      <div class="chartbox">
        <div class="chart-head">
          <span class="chart-title">{c.label}</span>
          <span class="chart-gloss">{c.gloss}</span>
          {#if c.mark !== null}
            <span class="chart-mark">내 조합 {c.bin ? c.mark : format(c.key, c.mark)}</span>
          {/if}
        </div>
        <Bars data={c.data}
              mark={c.mark === null ? null : (c.bin
                ? `${Math.floor(c.mark / c.bin) * c.bin}–${Math.floor(c.mark / c.bin) * c.bin + c.bin - 1}`
                : c.mark)} />
      </div>
    {/each}
  </div>

  <p class="note dim">
    보너스를 제외한 6개 번호 기준입니다. 「전회차이월번호」만 직전 회차의 7개
    번호와 비교합니다. 조합을 입력하면 각 분포에서 그 값이 표시됩니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>조합 입력</h2>
    <span class="gloss">6개를 넣으면 나머지 36칸이 채워집니다</span>
    <span class="right">{num(ready.length)}개 완성</span>
  </div>

  <div class="scroll">
    <table class="entry">
      <thead>
        <tr>
          <th>#</th>
          <th>일</th><th>이</th><th>삼</th><th>사</th><th>오</th><th>육</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each grid as line, r (r)}
          {@const info = lines[r]}
          <tr>
            <td class="dim">{r + 1}</td>
            {#each line as value, c (c)}
              <td>
                <input type="number" min="1" max={NMAX} inputmode="numeric"
                       class:bad={info.bad[c]} class:dup={info.dup[c]}
                       value={value}
                       oninput={(e) => set(r, c, e.currentTarget.value)} />
              </td>
            {/each}
            <td class="acts">
              <button onclick={() => fillFromPool(r)} title="번호 범위에서 무작위">뽑기</button>
              {#if grid.length > 1}
                <button onclick={() => removeLine(r)} title="이 줄 삭제">×</button>
              {/if}
            </td>
          </tr>
          {#if info.bad.some(Boolean) || info.dup.some(Boolean)}
            <tr class="msg">
              <td colspan="8">
                {#if info.bad.some(Boolean)}1부터 {NMAX}까지만 넣을 수 있습니다.{/if}
                {#if info.dup.some(Boolean)}같은 번호는 한 줄에 두 번 넣을 수 없습니다.{/if}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>

  <div class="acts-bar">
    <button onclick={clearAll}>전체 지우기</button>
    <span class="dim">
      {#if previous}
        「전회차이월」은 {fmt(target - 1)}의 7개 번호 기준입니다.
      {:else}
        이전 회차를 찾지 못해 이월 칸은 비어 있습니다.
      {/if}
    </span>
  </div>
</section>

{#if ready.length}
  <section class="panel">
    <div class="head">
      <h2>조합 결과</h2>
      <span class="gloss">{fmt(target)} 기준</span>
      <span class="right">{num(ready.length)}개</span>
    </div>
    <ComboTable rows={ready} limit={500} />
  </section>
{/if}

<section class="panel">
  <div class="head">
    <h2>저장</h2>
    <span class="gloss">이 브라우저에만 저장됩니다</span>
    {#if saved.length}<span class="right">{num(saved.length)}개 보관 중</span>{/if}
  </div>

  {#if !canStore}
    <p class="warn">
      이 브라우저에서는 저장이 되지 않습니다 (시크릿 모드이거나 저장이 차단됨).
      아래 내보내기로 파일에 남겨 두세요.
    </p>
  {/if}

  <div class="saveline">
    <input class="name" type="text" placeholder="이름 (비워도 됩니다)" bind:value={name} />
    <button onclick={doSave} disabled={!ready.length}>
      {num(ready.length)}개 저장
    </button>
    <button onclick={exportFile} disabled={!saved.length}>파일로 내보내기</button>
    <label class="import">
      파일에서 가져오기
      <input type="file" accept="application/json" onchange={importFile} />
    </label>
  </div>

  {#if notice}<p class="notice">{notice}</p>{/if}

  {#if saved.length}
    <div class="scroll">
      <table>
        <thead>
          <tr><th>이름</th><th>회차</th><th>조합</th><th>저장 시각</th><th></th></tr>
        </thead>
        <tbody>
          {#each saved as entry (entry.id)}
            <tr>
              <td>{entry.name}</td>
              <td>{fmt(entry.rang)}</td>
              <td>{num(entry.grids.length)}</td>
              <td class="dim">{entry.savedAt?.slice(0, 16).replace('T', ' ')}</td>
              <td class="acts">
                <button onclick={() => reopen(entry)}>불러오기</button>
                <button onclick={() => drop(entry.id)}>×</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
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
  .pick { display: flex; align-items: center; gap: 0.5rem; }

  select, input[type='text'] {
    font: inherit; font-size: 0.8125rem; color: inherit;
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 0.3rem 0.5rem;
  }
  select:focus-visible, input:focus-visible {
    outline: 2px solid var(--gold-bright); outline-offset: 2px;
  }

  table.entry th, table.entry td { padding: 0.2rem 0.25rem; text-align: center; }
  table.entry input[type='number'] {
    width: 3.4rem;
    font: inherit;
    font-family: var(--figure);
    font-size: 0.9375rem;
    text-align: center;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0.25rem 0.2rem;
  }
  table.entry input:hover { border-color: var(--gold-bright); }
  /* Une saisie fautive se signale par son trait, pas par un fond : le
     chiffre qu'on est en train de corriger doit rester lisible. */
  table.entry input.bad, table.entry input.dup { border-color: var(--s3); color: var(--s3); }

  tr.msg td { text-align: left; font-size: 0.75rem; color: var(--s3); padding-top: 0; }

  .acts { white-space: nowrap; }
  .acts button { font-size: 0.6875rem; padding: 0.15rem 0.4rem; margin-left: 0.2rem; }

  .acts-bar {
    display: flex; align-items: center; gap: 0.75rem;
    flex-wrap: wrap; margin-top: 0.9rem;
  }
  .acts-bar .dim { font-size: 0.75rem; }

  .saveline { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
  .name { min-width: 12rem; }
  .import {
    font-size: 0.875rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0.3rem 0.75rem;
    cursor: pointer;
  }
  .import:hover { border-color: var(--gold-bright); }
  .import input { display: none; }

  .notice { margin: 0.7rem 0 0; font-size: 0.8125rem; color: var(--gold); }
  .warn { color: var(--s3); font-size: 0.8125rem; margin: 0 0 0.8rem; }

  /* Les treize côte à côte. Deux colonnes dès qu'il y a la place : au-delà,
     les barres deviennent trop courtes pour qu'on lise leur longueur. */
  .charts { display: grid; gap: 1.6rem; }
  @media (min-width: 860px) { .charts { grid-template-columns: 1fr 1fr; } }

  .chart-head {
    display: flex; align-items: baseline; gap: 0.5rem;
    margin-bottom: 0.5rem; flex-wrap: wrap;
  }
  .chart-title { font-size: 0.875rem; font-weight: 600; }
  .chart-gloss { color: var(--muted); font-size: 0.6875rem; }
  .chart-mark {
    margin-left: auto; font-size: 0.6875rem; color: var(--gold);
    border: 1px solid var(--gold); border-radius: var(--radius);
    padding: 0.05rem 0.35rem;
  }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
</style>
