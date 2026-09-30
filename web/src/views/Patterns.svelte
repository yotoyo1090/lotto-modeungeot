<script>
  // L'onglet 패턴.
  //
  // Il remplace sept pages de l'ancienne plateforme — 일패턴 … 보너스패턴 —
  // qui étaient sept copies du même template, et la table
  // `customeruser_predictnumber` (1 134 lignes × 7 colonnes de listes
  // sérialisées) qu'elles relisaient. Un sélecteur de position remplace les
  // sept pages ; le calcul remplace la table.
  //
  // L'interrupteur 원본 순서 / 회차 순서 mérite un mot. L'ancienne liste
  // était ordonnée par les `id` de la base, donc par l'ordre de saisie —
  // 28 → 1087, puis les 회차 1 à 27 en désordre, puis la suite. Les colonnes
  // cumulées sont indexées sur cette position, donc cet accident est visible
  // à l'écran. On le reproduit par défaut, et on offre l'ordre vrai à côté.
  import {
    commonHistogram, expectedCommon, pattern, patternColumns, patternTable,
  } from '@core/patterns.js'

  import Balls from '../components/Balls.svelte'
  import Compare from '../components/Compare.svelte'
  import RangPick from '../components/RangPick.svelte'
  import {
    day, num, POSITION_LABELS, rang as fmt, sectionOf, SECTION_VARS,
  } from '../lib/format.js'

  let { draws } = $props()

  let position = $state(0)
  let order = $state('legacy')
  let picked = $state(null)

  const current = $derived.by(() => {
    const last = draws.rangs[draws.n - 1]
    if (picked === null) return last
    return picked < draws.rangs[0] || picked > last ? last : picked
  })

  const index = $derived(draws.indexOf(current))
  const winners = $derived([...draws.sequenceAt(index)])

  const list = $derived(pattern(draws, current, position, { order }))

  // ~90 ms sur 1 134 tirages. Assez court pour rester au clic, assez long
  // pour ne surtout pas être refait à chaque rendu : d'où le `$derived`,
  // qui ne le rejoue que si la position ou l'ordre changent.
  const table = $derived(patternTable(draws, position, { order }))
  const columns = $derived(patternColumns(table, current))
  const histogram = $derived(commonHistogram(table))
  const expected = expectedCommon()

  const totalEntries = $derived(histogram.reduce((a, b) => a + b, 0))
  const mean = $derived(totalEntries
    ? histogram.reduce((s, c, k) => s + c * k, 0) / totalEntries
    : 0)
  const expectedMean = expected.reduce((s, p, k) => s + p * k, 0)

  // Les mêmes chiffres que le tableau, en 회차 plutôt qu'en pour cent : la
  // barre observée contre le filet attendu.
  const distRows = $derived(Array.from(histogram, (count, k) => ({
    key: k, obs: count, exp: expected[k] * totalEntries,
  })))

  // La même loi pour le seul numéro choisi : ses apparitions passées
  // annoncent-elles mieux le tirage suivant que n'importe quelles autres ?
  const listRows = $derived.by(() => {
    if (!list.hasFuture) return []
    const counts = new Array(expected.length).fill(0)
    for (const e of list.entries) counts[e.common]++
    return counts.map((count, k) => ({
      key: k, obs: count, exp: expected[k] * list.entries.length,
    }))
  })

  const ORDERS = [
    { key: 'legacy', label: '원본 순서', gloss: '옛 데이터베이스의 순서' },
    { key: 'rang', label: '회차 순서', gloss: '시간 순서' },
  ]
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>패턴</h2>
    <span class="gloss">당첨번호의 과거 출현</span>
  </div>
  <RangPick {draws} value={current} onpick={(r) => (picked = r)} />
</section>

<section class="panel options">
  <div class="opt">
    <span class="label">위치</span>
    {#each POSITION_LABELS as label, p (label)}
      <button aria-pressed={position === p} onclick={() => (position = p)}>
        {label}
      </button>
    {/each}
  </div>
  <div class="opt">
    <span class="label">순서</span>
    {#each ORDERS as o (o.key)}
      <button aria-pressed={order === o.key} onclick={() => (order = o.key)}
              title={o.gloss}>{o.label}</button>
    {/each}
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>{fmt(current)}</h2>
    <span class="gloss">{day(draws.dates[index])}</span>
    <span class="right">{POSITION_LABELS[position]} = {list.number}</span>
  </div>

  <Balls numbers={winners.slice(0, 6)} bonus={winners[6]} size={40}
         highlight={new Set([list.number])} />

  <div class="counts">
    <div class="cell">
      <span class="label">{list.number}번이 나온 지난 회차</span>
      <span class="figure">{num(list.entries.length)}</span>
      <span class="dim">/ {num(index)}회차 중</span>
    </div>
    <div class="cell">
      <span class="label">다음 회차와의 평균 공통 개수</span>
      <span class="figure">
        {list.hasFuture
          ? (list.entries.reduce((s, e) => s + e.common, 0) /
             Math.max(1, list.entries.length)).toFixed(2)
          : '—'}
      </span>
      <span class="dim">기대 {expectedMean.toFixed(2)}</span>
    </div>
    <div class="cell">
      <span class="label">다음 회차</span>
      <span class="figure" class:dim={!list.hasFuture}>
        {list.hasFuture ? fmt(current + 1) : '아직 없음'}
      </span>
      <span class="dim">
        {list.hasFuture ? '공통 개수를 셀 수 있습니다' : '공통 개수는 모두 0입니다'}
      </span>
    </div>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>전체 분포</h2>
    <span class="gloss">관측 대 기대</span>
    <span class="right">{num(totalEntries)}개 항목 · 모든 회차</span>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>공통</th><th>관측</th><th>관측 %</th><th>기대 %</th><th>차이</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each Array.from(histogram) as count, k (k)}
          {@const seen = totalEntries ? count / totalEntries : 0}
          {@const gap = seen - expected[k]}
          <tr>
            <td>{k}개</td>
            <td>{num(count)}</td>
            <td>{(seen * 100).toFixed(2)} %</td>
            <td class="dim">{(expected[k] * 100).toFixed(2)} %</td>
            <td class:flat={Math.abs(gap) < 0.005}>
              {(gap >= 0 ? '+' : '') + (gap * 100).toFixed(2)} p
            </td>
            <td class="track-cell">
              <span class="track">
                <span class="fill" style="width: {seen * 100}%"></span>
                <span class="tick" style="left: {expected[k] * 100}%"></span>
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="block">
    <Compare rows={distRows} suffix="개" keyWidth="2.5rem"
             obsLabel="관측 항목" expLabel="기대 (초기하)" />
  </div>

  <p class="note soft">
    관측 평균 <strong>{mean.toFixed(3)}</strong> · 기대 평균
    <strong>{expectedMean.toFixed(3)}</strong>. 기대치는 초기하분포입니다 —
    45개 중 7개를 뽑을 때 정해진 7개와 몇 개가 겹치는가.
    <strong>이 목록은 무작위 추첨과 거의 구별되지 않습니다.</strong>
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>누적 열</h2>
    <span class="gloss">alllistcouter — {fmt(current)}까지</span>
    <span class="right">{num(columns.length)}개 열</span>
  </div>

  {#if columns.length === 0}
    <p class="dim">이 회차까지는 항목이 없습니다.</p>
  {:else}
    <div class="scroll tall">
      <table>
        <thead>
          <tr>
            <th>열</th>
            {#each Array.from({ length: 8 }, (_, k) => k) as k (k)}
              <th>{k}</th>
            {/each}
            <th>합</th>
          </tr>
        </thead>
        <tbody>
          {#each columns as col (col.column)}
            {@const total = col.counts.reduce((a, b) => a + b, 0)}
            <tr>
              <td>{col.column}</td>
              {#each Array.from(col.counts) as c, k (k)}
                <td class:zero={c === 0}>{c || '·'}</td>
              {/each}
              <td class="sum">{num(total)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<section class="panel">
  <div class="head">
    <h2>목록</h2>
    <span class="gloss">
      {list.number}번이 나온 회차, {order === 'legacy' ? '원본 순서' : '회차 순서'}
    </span>
    <span class="right">{num(list.entries.length)}개</span>
  </div>

  {#if list.entries.length === 0}
    <p class="dim">이전 회차에 {list.number}번이 나온 적이 없습니다.</p>
  {:else}
    {#if list.hasFuture}
      <div class="block">
        <Compare rows={listRows} suffix="개" keyWidth="2.5rem"
                 obsLabel="{list.number}번 · 공통" expLabel="기대 (초기하)" />
      </div>
    {/if}
    <div class="scroll tall">
      <table>
        <thead>
          <tr><th>열</th><th>회차</th><th class="wide">번호</th><th>공통</th></tr>
        </thead>
        <tbody>
          {#each list.entries as e, k (`${e.rang}-${k}`)}
            <tr>
              <td class="dim">{k + 1}</td>
              <td>{fmt(e.rang)}</td>
              <td class="wide">
                {#each e.numbers as n, i (i)}
                  <span class="mini"
                        class:hit={n === list.number}
                        class:bonus={i === 6}
                        style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
                {/each}
              </td>
              <td class:strong={e.common >= 3}>{e.common}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .block { margin-top: 1rem; margin-bottom: 1rem; }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding-top: 0.85rem;
    padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    align-items: center;
    padding-top: 0.85rem;
    padding-bottom: 0.85rem;
  }
  .opt { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .opt .label { margin-right: 0.25rem; }
  .opt button { font-size: 0.75rem; }

  .counts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
    margin-top: 1.25rem;
    padding-top: 1.1rem;
    border-top: 1px solid var(--line-soft);
  }
  .cell { display: flex; flex-direction: column; gap: 0.15rem; }
  .cell .dim { font-size: 0.75rem; }

  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.6; }
  .note strong { color: var(--ink); font-weight: 600; }

  /* Une liste de 180 lignes n'a pas à pousser le reste de la page hors de
     l'écran : elle défile dans sa propre fenêtre, en-tête compris. */
  .tall { max-height: 26rem; overflow-y: auto; }
  .tall thead th {
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 1;
  }

  td.zero { color: var(--muted); }
  td.sum { color: var(--ink-soft); border-left: 1px solid var(--line-soft); }
  td.strong { font-weight: 600; color: var(--gold); }
  td.flat { color: var(--muted); }

  .track-cell { width: 40%; min-width: 8rem; }
  .track {
    position: relative;
    display: block;
    height: 9px;
    background: var(--line-soft);
    border-radius: 1px;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--gold-bright);
    opacity: 0.55;
  }
  /* L'attendu : un trait vertical sur la barre. Deux barres côte à côte
     invitent à les additionner ; un repère se lit pour ce qu'il est. */
  .tick {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 1.5px;
    background: var(--ink);
  }

  /* Les numéros dans le tableau : le chiffre prend la couleur de sa tranche,
     rien ne se pose derrière. */
  .mini {
    display: inline-block;
    min-width: 1.5rem;
    text-align: center;
    font-family: var(--figure);
    color: var(--tone);
  }
  .mini.bonus { border-bottom: 1px dashed var(--gold); }
  .mini.hit {
    font-weight: 700;
    border: 1px solid var(--tone);
    border-radius: var(--radius);
    min-width: 1.65rem;
  }
  .wide { text-align: left; white-space: nowrap; }
</style>
