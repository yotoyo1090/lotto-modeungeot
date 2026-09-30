<script>
  // 조합결과, côté 연금복권 — les billets notés, et ce qu'ils ont donné.
  //
  // Même page que celle du 6/45, mais huit rangs au lieu de cinq, et une
  // arithmétique plus simple : les gains du 연금복권 sont **fixes**. Rien à
  // aller chercher dans un fichier de montants — la règle suffit, et le
  // total est exact.
  //
  // Le bilan porte son point de comparaison, comme partout ici. Sur ce
  // produit c'est encore plus utile qu'ailleurs : le 7등 tombe une fois sur
  // onze, si bien qu'« avoir gagné » n'y veut presque rien dire. La ligne
  // « 무작위였다면 » remet chaque chiffre à sa place.
  import { PENSION_RANKS, scoreTicket, sourceLabel } from '@core/combos.js'
  import { describeTicket } from '@core/pension.js'

  import { pensionAuto as autoStore, pensionGrids as gridStore } from '../lib/store.js'
  import { num, rang as fmt, won as money } from '../lib/format.js'
  import Pager from '../components/Pager.svelte'

  let { pension, onreplay = null } = $props()

  // Le 연금복권 n'a pas de 일반조합 : deux provenances, pas trois.
  const SOURCES = [
    { key: 'auto', label: '자동조합' },
    { key: 'manual', label: '수동조합' },
  ]

  let entries = $state(gridStore.load())
  let searches = $state(autoStore.load())
  let notice = $state(null)

  const refresh = () => {
    entries = gridStore.load()
    searches = autoStore.load()
    notice = '새로 읽었습니다.'
  }

  function drawAt(rang) {
    for (let k = 0; k < pension.n; k++) {
      if (pension.rangs[k] === rang) {
        return {
          group: pension.groups[k],
          digits: [...pension.digitsAt(k)],
          bonus: [...pension.bonusAt(k)],
        }
      }
    }
    return null
  }

  const previousOf = (rang) => {
    for (let k = 0; k < pension.n; k++) {
      if (pension.rangs[k] === rang - 1) return [...pension.digitsAt(k)]
    }
    return null
  }

  const prepared = $derived.by(() => entries.map((entry) => {
    const rang = Number(entry.rang)
    const draw = drawAt(rang)
    const previous = previousOf(rang)
    // Le score sert au bilan : on le calcule pour tous. La description
    // (`describeTicket`) ne sert qu'au tableau 「자세히」 — elle est faite
    // page par page, sinon une sauvegarde de 50 000 billets figerait l'écran.
    const list = (entry.tickets ?? []).map((t) => ({ ...t, score: scoreTicket(t, draw) }))
    return {
      ...entry,
      source: entry.source ?? 'manual',
      rang,
      draw,
      drawn: draw !== null,
      previous,
      list,
      won: list.filter((t) => t.score?.rank).length,
      paid: list.reduce((a, t) => a + (t.score?.rank?.prize ?? 0), 0),
    }
  }))

  const bySource = $derived(Object.fromEntries(SOURCES.map((s) =>
    [s.key, prepared.filter((e) => e.source === s.key)])))

  const summary = $derived.by(() => {
    const ranks = {}
    let count = 0
    let scored = 0
    let paid = 0
    let best = null

    for (const entry of prepared) {
      for (const t of entry.list) {
        count++
        if (!t.score) continue
        scored++
        if (t.score.key) {
          ranks[t.score.key] = (ranks[t.score.key] ?? 0) + 1
          paid += t.score.rank.prize
          const better = !best
            || PENSION_RANKS.findIndex((r) => r.key === t.score.key)
               < PENSION_RANKS.findIndex((r) => r.key === best.score.key)
          if (better) best = { ...t, entry }
        }
      }
    }
    return { count, scored, ranks, paid, best }
  })

  function drop(id) {
    gridStore.remove(id)
    entries = gridStore.load()
    notice = '삭제했습니다.'
  }

  function dropSearch(id) {
    autoStore.remove(id)
    searches = autoStore.load()
    notice = '삭제했습니다.'
  }

  function exportAll() {
    const bundle = JSON.stringify({
      kind: 'lotto.combos', version: 1,
      pensionGrids: gridStore.load(), pensionAuto: autoStore.load(),
    }, null, 2)
    const url = URL.createObjectURL(new Blob([bundle], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'pension-조합.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  let open = $state({})
  const toggle = (id) => { open = { ...open, [id]: !open[id] } }

  // Une page par enregistrement, 500 billets à la fois.
  const PAGE = 500
  let pages = $state({})
  const pageOf = (entry) => Math.min(pages[entry.id] ?? 0,
    Math.max(0, Math.ceil(entry.list.length / PAGE) - 1))
  const setPage = (id, p) => { pages = { ...pages, [id]: p } }
  const slice = (entry) => {
    const from = pageOf(entry) * PAGE
    return entry.list.slice(from, from + PAGE).map((t, k) => ({ ...t, n: from + k }))
  }
  const rowOf = (t, entry) => {
    try {
      return describeTicket(t.digits, { group: t.group, reference: entry.previous })
    } catch {
      return null
    }
  }
</script>

<section class="panel">
  <div class="head">
    <h2>조합결과</h2>
    <span class="gloss">산 표와, 그 결과</span>
    <span class="right">{num(summary.count)}장 · {num(entries.length)}건</span>
  </div>

  {#if summary.count === 0}
    <p class="note dim tight">
      아직 저장된 표가 없습니다. <strong>자동조합</strong>이나
      <strong>수동조합</strong>에서 「저장」을 누르면 여기에 모입니다.
    </p>
  {:else}
    <div class="stats">
      <div class="stat">
        <span class="k">전체 표</span>
        <b class="fig">{num(summary.count)}</b>
      </div>
      <div class="stat">
        <span class="k">결과를 아는 표</span>
        <b class="fig">{num(summary.scored)}</b>
        <span class="k">추첨이 끝난 회차</span>
      </div>
      <div class="stat">
        <span class="k">가장 좋았던 표</span>
        <b class="fig">{summary.best ? summary.best.score.rank.label : '—'}</b>
        {#if summary.best}
          <span class="k">{fmt(summary.best.entry.rang)}</span>
        {/if}
      </div>
      <div class="stat">
        <span class="k">당첨금</span>
        <b class="fig gold">{money(summary.paid)}</b>
        <span class="k">1·2등과 보너스는 연금 총액</span>
      </div>
    </div>

    <div class="scroll">
      <table class="mx">
        <thead>
          <tr>
            <th>등수</th>
            {#each PENSION_RANKS as r (r.key)}<th class="v">{r.label}</th>{/each}
            <th class="v">꽝</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>내 표</td>
            {#each PENSION_RANKS as r (r.key)}
              {@const n = summary.ranks[r.key] ?? 0}
              <td class="val" class:hot={n > 0}>{num(n)}</td>
            {/each}
            <td class="val">
              {num(summary.scored - Object.values(summary.ranks).reduce((a, b) => a + b, 0))}
            </td>
          </tr>
          <tr class="dim">
            <td>무작위였다면</td>
            {#each PENSION_RANKS as r (r.key)}
              {@const e = summary.scored / r.odds}
              <td class="val">{e < 1 ? e.toFixed(e < 0.01 ? 4 : 2) : e.toFixed(1)}</td>
            {/each}
            <td class="val">—</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="note dim">
      아래 줄은 같은 수의 표를 <strong>아무렇게나</strong> 샀을 때의 기댓값입니다.
      이 제품은 <strong>7등이 11장에 한 번</strong> 나오므로, 「당첨됐다」는
      말만으로는 아무것도 알 수 없습니다 — 두 줄을 나란히 놓아야 합니다.
    </p>

    <div class="saveline">
      <button onclick={exportAll}>전부 파일로 내보내기</button>
      <button onclick={refresh}>새로고침</button>
      {#if notice}<span class="dim small">{notice}</span>{/if}
    </div>
  {/if}
</section>

{#each SOURCES as source (source.key)}
  {@const list = bySource[source.key]}
  {#if list.length}
    <section class="panel">
      <div class="head">
        <h2>{source.label}</h2>
        <span class="gloss">
          {num(list.length)}건 · {num(list.reduce((a, e) => a + e.list.length, 0))}장
        </span>
      </div>

      {#each list as entry (entry.id)}
        <div class="entry">
          <div class="line">
            <b class="nom">{entry.name}</b>
            <span class="rang">{fmt(entry.rang)}</span>
            {#if entry.drawn}
              <span class="balls">
                <span class="grp">{entry.draw.group}조</span>
                {#each entry.draw.digits as d, k (k)}<span class="ball">{d}</span>{/each}
                <span class="sep">보너스</span>
                {#each entry.draw.bonus as d, k (k)}<span class="ball bo">{d}</span>{/each}
              </span>
            {:else}
              <span class="dim small">아직 추첨 전</span>
            {/if}
            {#if entry.won > 0}
              <span class="rank">{num(entry.won)}장 당첨 · {money(entry.paid)}</span>
            {/if}
            <span class="grow"></span>
            <span class="dim small">{entry.savedAt?.slice(0, 10)}</span>
            <button onclick={() => toggle(entry.id)}>
              {open[entry.id] ? '접기' : '자세히'}
            </button>
            <button onclick={() => drop(entry.id)}>×</button>
          </div>

          <Pager page={pageOf(entry)} total={entry.list.length} size={PAGE}
                 onpage={(p) => setPage(entry.id, p)} />
          <div class="tickets">
            {#each slice(entry) as t (t.n)}
              <span class="ticket" class:win={t.score?.rank}>
                <span class="g">{t.group}조</span>
                {#each t.digits as d, j (j)}
                  <span class="n"
                        class:hit={entry.drawn && t.score
                          && j >= t.digits.length - t.score.tail}>{d}</span>
                {/each}
                {#if t.score}
                  <span class="score">
                    {#if t.score.rank}<b>{t.score.rank.label}</b>
                    {:else}<span class="dim">꽝</span>{/if}
                  </span>
                {/if}
              </span>
            {/each}
          </div>

          {#if open[entry.id]}
            <div class="scroll">
              <table class="mx">
                <thead>
                  <tr>
                    <th>조</th><th>번호</th>
                    <th class="v">총합</th><th class="v">AC값</th>
                    <th>저고</th><th>홀짝</th>
                    <th class="v">서로 다른</th><th class="v">중복</th>
                    <th class="v">이월</th><th class="v">뒷자리 일치</th><th>등수</th>
                  </tr>
                </thead>
                <tbody>
                  {#each slice(entry) as t0 (t0.n)}
                    {@const t = { ...t0, row: rowOf(t0, entry) }}
                    <tr>
                      <td class="val">{t.group}</td>
                      <td class="digits">
                        {#each t.digits as d, j (j)}<span class="d">{d}</span>{/each}
                      </td>
                      <td class="val">{t.row?.total ?? ''}</td>
                      <td class="val">{t.row?.ac ?? ''}</td>
                      <td>{t.row?.lowLabel ?? ''}</td>
                      <td>{t.row?.oddLabel ?? ''}</td>
                      <td class="val">{t.row?.distinct ?? ''}</td>
                      <td class="val">{t.row?.repeats ?? ''}</td>
                      <td class="val">{t.row ? t.row.carried.length : ''}</td>
                      <td class="val">{t.score ? `${t.score.tail}자리` : ''}</td>
                      <td>
                        {#if t.score?.rank}<b class="rank">{t.score.rank.label}</b>
                        {:else if t.score}<span class="dim">꽝</span>{/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/each}
    </section>
  {/if}
{/each}

{#if searches.length}
  <section class="panel">
    <div class="head">
      <h2>저장된 검색 조건</h2>
      <span class="gloss">표가 아니라 조건 — 자동조합에서 다시 돌릴 수 있습니다</span>
      <span class="right">{num(searches.length)}건</span>
    </div>
    <div class="scroll">
      <table class="mx">
        <thead>
          <tr><th>이름</th><th>회차</th><th class="v">조건</th><th>저장</th><th></th></tr>
        </thead>
        <tbody>
          {#each searches as s (s.id)}
            <tr>
              <td>{s.name}</td>
              <td>{fmt(s.rang)}</td>
              <td class="val">{s.filters ?? '—'}</td>
              <td class="dim">{s.savedAt?.slice(0, 10)}</td>
              <td class="acts">
                {#if onreplay}
                  <button onclick={() => onreplay(s)}>자동조합에서 열기</button>
                {/if}
                <button onclick={() => dropSearch(s.id)}>×</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<section class="panel">
  <p class="note dim tight">
    당첨금은 이 제품의 <strong>고정 금액</strong>에서 바로 계산합니다 — 당첨자가
    몇 명이든 달라지지 않기 때문입니다. 1·2등과 보너스는 <strong>연금</strong>이라
    한 번에 받지 않고 매달 나옵니다; 위 금액은 20년(또는 10년) 총액이며
    22%의 세금은 빼지 않았습니다.
  </p>
</section>

<style>
  .gloss { color: var(--muted); font-size: 0.8125rem; }
  .small { font-size: 0.75rem; }

  .stats {
    display: grid; gap: 1rem; margin-bottom: 1.1rem;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  }
  .stat { display: grid; gap: 0.15rem; }
  .stat .k { color: var(--muted); font-size: 0.75rem; }
  .stat b.fig { font-family: var(--figure); font-size: 1.35rem; font-weight: 500; }
  .gold { color: var(--gold-deep); }

  table.mx { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  table.mx th, table.mx td { padding: 0.35rem 0.6rem; text-align: left; white-space: nowrap; }
  table.mx th {
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  table.mx td { border-bottom: 1px solid var(--line-soft); }
  table.mx th.v, table.mx td.val { text-align: right; font-family: var(--figure); }
  td.hot { color: var(--gold-deep); font-weight: 600; }
  .digits { font-family: var(--figure); }
  .digits .d { display: inline-block; min-width: 1.1rem; text-align: center; }

  .entry { padding: 0.8rem 0; border-top: 1px solid var(--line-soft); }
  .entry:first-of-type { border-top: 0; }
  .line {
    display: flex; align-items: center; gap: 0.6rem;
    flex-wrap: wrap; margin-bottom: 0.5rem;
  }
  .nom { font-weight: 600; font-size: 0.9375rem; }
  .rang { font-family: var(--figure); color: var(--muted); font-size: 0.8125rem; }
  .grow { flex: 1 1 auto; }
  .line button { font-size: 0.6875rem; padding: 0.15rem 0.5rem; }

  .balls { display: inline-flex; align-items: center; gap: 0.2rem; }
  .grp { font-family: var(--figure); font-size: 0.6875rem; color: var(--gold-deep); }
  .sep { color: var(--muted); font-size: 0.6875rem; margin-left: 0.35rem; }
  .ball {
    font-family: var(--figure); font-size: 0.6875rem;
    border: 1px solid var(--line); border-radius: 0.2rem;
    min-width: 1.1rem; text-align: center;
  }
  .ball.bo { border-color: var(--t-dead-text); color: var(--t-dead-text); }

  .rank {
    font-size: 0.6875rem; font-weight: 600; color: var(--gold-deep);
    border: 1px solid var(--gold); border-radius: 0.25rem; padding: 0.05rem 0.4rem;
  }

  /* Les billets : compacts, avec la queue qui coïncide mise en avant —
     c'est elle qui décide du rang sur ce produit. */
  .tickets { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .ticket {
    display: inline-flex; align-items: center; gap: 0.1rem;
    border: 1px solid var(--line-soft); border-radius: var(--radius);
    padding: 0.15rem 0.4rem;
  }
  .ticket.win {
    border-color: var(--gold);
    background: color-mix(in srgb, var(--gold-soft) 20%, transparent);
  }
  .ticket .g {
    font-family: var(--figure); font-size: 0.625rem;
    color: var(--muted); margin-right: 0.25rem;
  }
  .ticket .n {
    font-family: var(--figure); font-size: 0.75rem;
    min-width: 0.85rem; text-align: center; color: var(--muted);
  }
  .ticket .n.hit { color: var(--gold-deep); font-weight: 700; }
  .score {
    display: inline-flex; align-items: center;
    font-family: var(--figure); font-size: 0.6875rem;
    margin-left: 0.35rem; padding-left: 0.35rem;
    border-left: 1px solid var(--line-soft);
  }
  .score b { color: var(--gold-deep); font-weight: 700; }

  .acts { white-space: nowrap; }
  .acts button { font-size: 0.6875rem; padding: 0.15rem 0.4rem; margin-left: 0.2rem; }

  .saveline {
    display: flex; gap: 0.4rem; flex-wrap: wrap;
    align-items: center; margin-top: 1rem;
  }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.7; }
  .note.tight { margin-top: 0; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
