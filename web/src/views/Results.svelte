<script>
  // L'onglet 조합결과 — tout ce qu'on a fabriqué, et ce que ça a donné.
  //
  // Les trois écrans du 조합 produisent des grilles ; aucun ne montrait ce
  // qu'elles étaient devenues. C'est pourtant la seule question qui compte
  // une fois le tirage passé, et l'ancienne plateforme n'y répondait nulle
  // part : elle rangeait `tabledata` dans une table et ne la relisait jamais.
  //
  // Trois sections, une par provenance, dans l'ordre du menu. Chaque
  // enregistrement porte son 회차, et chaque grille son 당첨 여부 quand ce
  // 회차 est tiré — avec le 등수 réel, qui est ce qu'on veut savoir.
  //
  // Le bilan du haut porte son point de comparaison, comme partout ici : la
  // loi hypergéométrique dit ce que ferait le hasard sur le même nombre de
  // grilles. « J'ai fait trois numéros deux fois » ne veut rien dire sans
  // elle.
  import {
    FIXED_PRIZE, GRID_SOURCES, expectedHits, scoreGrid, sourceOf, sourceLabel,
  } from '@core/combos.js'
  import { PRESETS } from '@core/criteria.js'
  import { FULL, NMAX, PICK } from '@core/draws.js'
  import { describeRow } from '@core/row.js'
  import { untrack } from 'svelte'
  import { profileKey, profiles, requestProfile } from '../lib/profiles.svelte.js'

  import ComboTable from '../components/ComboTable.svelte'
  import SlipPrint from '../components/SlipPrint.svelte'
  import { auto as autoStore, grids as gridStore } from '../lib/store.js'
  import { num, rang as fmt, won as money } from '../lib/format.js'

  let { draws, prizes = null, onreplay = null } = $props()

  // Le carnet est lu à l'ouverture. Il ne change pas pendant qu'on le
  // regarde — c'est un autre onglet qui y écrit.
  let entries = $state(gridStore.load())
  let searches = $state(autoStore.load())
  let notice = $state(null)

  const refresh = () => {
    entries = gridStore.load()
    searches = autoStore.load()
  }

  /** Le tirage complet d'un 회차 — six numéros puis le bonus — ou null. */
  function drawAt(rang) {
    for (let k = 0; k < draws.n; k++) {
      if (draws.rangs[k] === rang) return [...draws.sequenceAt(k)]
    }
    return null
  }

  function previousOf(rang) {
    for (let k = 0; k < draws.n; k++) {
      if (draws.rangs[k] === rang - 1) return [...draws.sequenceAt(k)]
    }
    return null
  }

  /**
   * Un enregistrement, prêt à l'écran : ses grilles décrites (les 42
   * colonnes de l'ancien tableau) et notées contre le tirage réel.
   */
  const prepared = $derived.by(() => entries.map((entry) => {
    const rang = Number(entry.rang)
    const draw = drawAt(rang)
    const previous = previousOf(rang)
    // Le score sert aux bilans : on le fait pour toutes les grilles. La
    // description (les 42 colonnes) ne sert qu'au tableau 「자세히」 : elle
    // est faite pour les lignes affichées seulement (voir `rowsOf`).
    const list = (entry.grids ?? []).map((grid) => {
      const numbers = [...grid].sort((a, b) => a - b)
      return { numbers, score: scoreGrid(numbers, draw) }
    })
    // Le décompte par numéro sorti — combien de grilles de cet
    // enregistrement portaient le 11, le 13, … et le 보너스. Le total est
    // la seule mesure qui ne dépend pas du découpage en 등수 : une grille
    // qui fait deux fois 2개 et une qui fait 4개 valent quatre numéros.
    // L'espérance est celle du hasard sur le même nombre de grilles —
    // six numéros tirés sur quarante-cinq, sept avec le 보너스.
    const per = draw
      ? draw.map((n) => ({ n, count: list.filter((g) => g.numbers.includes(n)).length }))
      : []
    const main = per.slice(0, 6).reduce((a, x) => a + x.count, 0)
    const bonus = per[6]?.count ?? 0
    // Le même total vu par l'autre bout : combien de grilles ont fait
    // zéro, un, deux… numéros. Les deux lignes disent la même somme —
    // par numéro, et par grille — mais pas la même chose : dix numéros
    // répartis sur dix grilles ou empilés sur deux, c'est très différent.
    const dist = [0, 0, 0, 0, 0, 0, 0]
    for (const g of list) if (g.score) dist[g.score.matched]++

    // Les quarante-cinq numéros, et non plus les sept sortis : combien de
    // grilles de cet enregistrement portent le 1, le 2, … le 45. C'est la
    // composition du lot, lisible **avant** le tirage — les deux blocs
    // au-dessus ont besoin d'un tirage, celui-ci non. La somme des
    // quarante-cinq comptes fait 조합 × 6, puisque chaque grille occupe
    // six cases.
    const spread = new Int32Array(NMAX + 1)
    for (const g of list) for (const n of g.numbers) spread[n]++
    const tally = draw
      ? {
        per, main, bonus, dist, total: main + bonus,
        // Le calcul, en clair : chaque grille a six cases, une case au
        // hasard porte un des six numéros sortis avec la probabilité
        // 6/45 — sept sur quarante-cinq si l'on compte le 보너스.
        cases: list.length * PICK,
        expMain: (list.length * PICK * PICK) / NMAX,
        expAll: (list.length * PICK * FULL) / NMAX,
      }
      : null

    // Ce que ce lot annonçait **avant** le tirage — la semaine vide, le
    // 본전, le 분배 — vient de `lotProfile`, calculé en arrière-plan (voir
    // `lib/profiles.svelte.js`) : il simule 100 000 tirages contre chaque
    // grille, trop long pour le fil de la page sur un gros lot.
    //
    // Le 고정수, lui, se lit tout de suite sur le comptage `spread` : un
    // numéro que portent toutes les grilles (au moins deux).
    const fixed = list.length >= 2
      ? Array.from({ length: NMAX }, (_, k) => k + 1).filter((v) => spread[v] === list.length)
      : []
    // 실제, en face : combien de 5등·4등, et la semaine était-elle vide.
    const actual = draw ? {
      fifth: list.filter((g) => g.score?.rank === 5).length,
      fourth: list.filter((g) => g.score?.rank === 4).length,
      zero: !list.some((g) => g.score && g.score.matched >= 3),
      paid: list.reduce((a, g) => a + (g.score?.rank ? (prizeFor(rang, g.score.rank) ?? 0) : 0), 0),
      fixedOut: fixed.length ? fixed.every((n) => draw.slice(0, PICK).includes(n)) : null,
    } : null

    return {
      ...entry,
      source: sourceOf(entry),
      rang,
      drawn: draw !== null,
      draw,
      list,
      tally,
      previous,
      pkey: profileKey(entry),
      actual,
      spread: Array.from({ length: NMAX }, (_, k) => ({ n: k + 1, count: spread[k + 1] })),
      spreadExp: list.length ? (list.length * PICK) / NMAX : 0,
      // Ce que la ligne des quarante-cinq dit en trois chiffres : combien de
      // numéros le lot joue, combien il laisse de côté, et l'écart entre le
      // plus porté et le moins porté — la mesure de l'inégalité, celle que
      // l'étape « couverture égale » cherche à réduire.
      spreadUsed: spread.filter((c, n) => n >= 1 && c > 0).length,
      spreadRange: (() => {
        const kept = []
        for (let n = 1; n <= NMAX; n++) if (spread[n]) kept.push(spread[n])
        return kept.length ? [Math.min(...kept), Math.max(...kept)] : [0, 0]
      })(),
      best: list.reduce((a, g) =>
        (g.score && (!a || g.score.matched > a.matched
          || (g.score.matched === a.matched && g.score.bonus && !a.bonus))
          ? g.score : a), null),
    }
  }))

  // Le 예고 de chaque lot : demandé au fil d'arrière-plan s'il n'est pas
  // déjà connu. `profileOf` rend null tant qu'il n'est pas prêt.
  $effect(() => {
    // Les petits lots d'abord : leur 예고 est prêt en un instant, au lieu
    // d'attendre derrière un gros lot d'une minute.
    const lots = [...prepared].sort((a, b) => a.list.length - b.list.length)
    untrack(() => {
      for (const e of lots) {
        if (e.list.length) requestProfile(e.pkey, e.list.map((g) => g.numbers))
      }
    })
  })
  const profileOf = (entry) => {
    const p = profiles[entry.pkey]
    return p && p !== 'pending' && !p.error ? p : null
  }

  // 더 보기 : 500 grilles à la fois, par lot — la liste, 「자세히」 et le
  // panneau d'impression suivent le même compte.
  const STEP = 500
  let more = $state({})
  const limitOf = (id) => more[id] ?? STEP
  const showMore = (id) => { more = { ...more, [id]: limitOf(id) + STEP } }
  const shownOf = (entry) => entry.list.slice(0, limitOf(entry.id))
  // Les 42 colonnes, seulement pour les lignes affichées.
  const rowsOf = (entry) => shownOf(entry).map((g) => {
    try {
      return describeRow(g.numbers, { rang: entry.rang, previous: entry.previous })
    } catch {
      // Une grille abîmée ne doit pas emporter la page avec elle.
      return null
    }
  }).filter(Boolean)

  const bySource = $derived(Object.fromEntries(GRID_SOURCES.map((s) =>
    [s.key, prepared.filter((e) => e.source === s.key)])))

  // ── le bilan ─────────────────────────────────────────────────────────

  const EXPECTED = expectedHits()

  // ── l'ordre du bloc 전체 번호별 ──────────────────────────────────────────
  //
  // Trois lectures du même comptage : par numéro (l'ordre du bulletin),
  // par ce que le lot porte le plus, et par ce que le tirage a le plus
  // sorti depuis le 1회. Le troisième a besoin de l'historique, pas du
  // tirage de la semaine : il vaut donc aussi avant le samedi.
  const SPREAD_SORTS = [
    { key: 'number', label: '번호순' },
    { key: 'count', label: '많은순' },
    { key: 'hits', label: '출현순' },
  ]
  let spreadSort = $state('number')

  const HITS = $derived.by(() => {
    const c = new Int32Array(NMAX + 1)
    for (let i = 0; i < draws.n; i++) for (const n of draws.numbersAt(i)) c[n]++
    return c
  })

  const sortSpread = (rows) => {
    if (spreadSort === 'count') {
      return [...rows].sort((a, b) => b.count - a.count || a.n - b.n)
    }
    if (spreadSort === 'hits') {
      return [...rows].sort((a, b) => HITS[b.n] - HITS[a.n] || a.n - b.n)
    }
    return rows
  }

  const summary = $derived.by(() => {
    const hits = [0, 0, 0, 0, 0, 0, 0]
    const ranks = {}
    let grids = 0
    let scored = 0
    let paid = 0
    let unknown = 0
    let best = null

    for (const entry of prepared) {
      for (const g of entry.list) {
        grids++
        if (!g.score) continue
        scored++
        hits[g.score.matched]++
        if (g.score.rank) {
          ranks[g.score.rank] = (ranks[g.score.rank] ?? 0) + 1
          const amount = prizeFor(entry.rang, g.score.rank)
          if (amount === null) unknown++
          else paid += amount
        }
        if (!best || g.score.matched > best.score.matched) {
          best = { ...g, entry }
        }
      }
    }
    // 예고 contre 실제, cumulés sur les lots tirés : la somme des semaines
    // vides annoncées contre celles qu'il y a eu, et les 5등 attendus contre
    // les 5등 faits. Si le pipeline tient ses promesses, les deux colonnes
    // se suivent — lot après lot, sans refaire un rapport.
    // Seuls les lots dont le 예고 est prêt entrent dans le cumul.
    const drawn = prepared.filter((e) => e.actual && profileOf(e))
    const forecast = drawn.length ? {
      lots: drawn.length,
      expZero: drawn.reduce((a, e) => a + profileOf(e).zero, 0),
      actZero: drawn.filter((e) => e.actual.zero).length,
      exp5: drawn.reduce((a, e) => a + profileOf(e).exp5, 0),
      act5: drawn.reduce((a, e) => a + e.actual.fifth, 0),
      exp4: drawn.reduce((a, e) => a + profileOf(e).exp4, 0),
      act4: drawn.reduce((a, e) => a + e.actual.fourth, 0),
    } : null
    return { grids, scored, hits, ranks, paid, unknown, best, forecast }
  })

  /**
   * Ce qu'un rang a rapporté à ce 회차.
   *
   * Les 4등 et 5등 sont fixes depuis les 회차 401 et 88 ; au-dessus, le
   * montant dépend du nombre de gagnants et vient du fichier des gains.
   * Tant qu'il n'est pas chargé, on rend `null` plutôt qu'un zéro : un
   * total faux est pire qu'un total incomplet, et l'écran le dit.
   */
  function prizeFor(rang, rank) {
    if (FIXED_PRIZE[rank] !== undefined) return FIXED_PRIZE[rank]
    const row = prizes?.[String(rang)]?.[String(rank)]
    return row ? row[1] : null
  }

  const RANK_LABEL = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등' }

  // ── les recherches enregistrées ───────────────────────────────────────

  const presetLabel = (key) =>
    PRESETS.find((p) => p.key === key)?.label ?? '모든수'

  function drop(id) {
    gridStore.remove(id)
    refresh()
    notice = '삭제했습니다.'
  }

  function dropSearch(id) {
    autoStore.remove(id)
    refresh()
    notice = '삭제했습니다.'
  }

  function exportAll() {
    const bundle = JSON.stringify({
      kind: 'lotto.combos', version: 1,
      manual: gridStore.load(), auto: autoStore.load(),
    }, null, 2)
    const url = URL.createObjectURL(new Blob([bundle], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'lotto-조합.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  let open = $state({})
  const toggle = (id) => { open = { ...open, [id]: !open[id] } }

  // Le panneau 용지 인쇄, ouvert enregistrement par enregistrement.
  let printing = $state({})
  const togglePrint = (id) => { printing = { ...printing, [id]: !printing[id] } }
</script>

<section class="panel">
  <div class="head">
    <h2>조합결과</h2>
    <span class="gloss">만든 조합과, 그 결과</span>
    <span class="right">{num(summary.grids)}개 조합 · {num(entries.length)}건</span>
  </div>

  {#if summary.grids === 0}
    <p class="note dim tight">
      아직 저장된 조합이 없습니다. <strong>일반조합 · 자동조합 · 수동조합</strong>에서
      조합을 만든 뒤 「저장」을 누르면 여기에 모입니다.
    </p>
  {:else}
    <div class="stats">
      <div class="stat">
        <span class="k">전체 조합</span>
        <b class="fig">{num(summary.grids)}</b>
      </div>
      <div class="stat">
        <span class="k">결과를 아는 조합</span>
        <b class="fig">{num(summary.scored)}</b>
        <span class="k">추첨이 끝난 회차</span>
      </div>
      <div class="stat">
        <span class="k">가장 좋았던 조합</span>
        <b class="fig">{summary.best ? `${summary.best.score.matched}개` : '—'}</b>
        {#if summary.best}
          <span class="k">
            {fmt(summary.best.entry.rang)}{#if summary.best.score.rank}
              · {RANK_LABEL[summary.best.score.rank]}{/if}
          </span>
        {/if}
      </div>
      <div class="stat">
        <span class="k">당첨금</span>
        <b class="fig gold">{money(summary.paid)}</b>
        {#if summary.unknown > 0}
          <span class="k">{num(summary.unknown)}건은 금액 미확인</span>
        {/if}
      </div>
    </div>

    {#if summary.forecast}
      <!-- 예고 contre 실제, sur tous les lots tirés. Deux colonnes qui se
           suivent = le pipeline fait ce qu'il annonce. -->
      <div class="fcast">
        <b class="tag">예고 ↔ 실제</b>
        <span>꽝인 회차 <em>예고 {summary.forecast.expZero.toFixed(1)}</em><b>{num(summary.forecast.actZero)}</b></span>
        <span>5등 <em>예고 {summary.forecast.exp5.toFixed(1)}</em><b>{num(summary.forecast.act5)}</b></span>
        <span>4등 <em>예고 {summary.forecast.exp4.toFixed(2)}</em><b>{num(summary.forecast.act4)}</b></span>
        <span class="how">추첨이 끝난 {num(summary.forecast.lots)}건의 합 · 예고는 각 조합 묶음이 추첨 전에 스스로 말한 것</span>
      </div>
    {/if}

    <div class="scroll">
      <table class="mx">
        <thead>
          <tr>
            <th>당첨 여부</th>
            {#each [0, 1, 2, 3, 4, 5, 6] as k (k)}<th class="v">{k}개</th>{/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>내 조합</td>
            {#each summary.hits as n, k (k)}
              <td class="val" class:hot={n > 0 && k >= 3}>{num(n)}</td>
            {/each}
          </tr>
          <tr class="dim">
            <td>무작위였다면</td>
            {#each EXPECTED as p, k (k)}
              <td class="val">{(p * summary.scored).toFixed(p * summary.scored < 1 ? 2 : 1)}</td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>

    <p class="note dim">
      아래 줄은 같은 수의 조합을 <strong>아무렇게나</strong> 골랐을 때의 기댓값입니다.
      두 줄이 비슷하다면, 조건을 걸어 고른 조합이 무작위보다 나았다는 근거는 없습니다 —
      그것이 이 표가 있는 이유입니다.
    </p>

    <div class="saveline">
      <button onclick={exportAll}>전부 파일로 내보내기</button>
      <button onclick={refresh}>새로고침</button>
      {#if notice}<span class="dim small">{notice}</span>{/if}
    </div>
  {/if}
</section>

{#each GRID_SOURCES as source (source.key)}
  {@const list = bySource[source.key]}
  {#if list.length}
    <section class="panel">
      <div class="head">
        <h2>{source.label}</h2>
        <span class="gloss">
          {num(list.length)}건 · {num(list.reduce((a, e) => a + e.list.length, 0))}개 조합
        </span>
      </div>

      {#each list as entry (entry.id)}
        <div class="entry">
          <div class="line">
            <b class="nom">{entry.name}</b>
            <span class="rang">{fmt(entry.rang)}</span>
            {#if entry.drawn}
              <span class="balls">
                {#each entry.draw.slice(0, 6) as n (n)}<span class="ball">{n}</span>{/each}
                <span class="ball bo">{entry.draw[6]}</span>
              </span>
            {:else}
              <span class="dim small">아직 추첨 전</span>
            {/if}
            {#if entry.best?.rank}
              <span class="rank">{RANK_LABEL[entry.best.rank]}</span>
            {:else if entry.best}
              <span class="dim small">최고 {entry.best.matched}개</span>
            {/if}
            {#if entry.tally}
              <span class="tally">
                적중 <b>{num(entry.tally.main)}</b><em>기대 {entry.tally.expMain.toFixed(1)}</em>
                <i>·</i>
                보너스 포함 <b>{num(entry.tally.total)}</b><em>기대 {entry.tally.expAll.toFixed(1)}</em>
              </span>
            {/if}
            <span class="grow"></span>
            <span class="dim small">{entry.savedAt?.slice(0, 10)}</span>
            <button onclick={() => togglePrint(entry.id)}>용지 인쇄</button>
            <button onclick={() => toggle(entry.id)}>
              {open[entry.id] ? '접기' : '자세히'}
            </button>
            <button onclick={() => drop(entry.id)}>×</button>
          </div>

          {#if printing[entry.id]}
            <SlipPrint grids={entry.list.map((g) => g.numbers)} />
          {/if}

          {#if entry.list.length}
            {@const prof = profileOf(entry)}
            {@const pstate = profiles[entry.pkey]}
            <!-- Ce que le lot annonçait avant le tirage, et — une fois
                 tiré — ce qu'il a fait, sur la même ligne. Le 예고 arrive
                 du fil d'arrière-plan : en attendant, on le dit. -->
            <div class="pernum forecast">
              <b class="tag">예고</b>
              {#if prof}
                <span title="이 묶음에서 3개 이상 맞힌 조합이 하나도 없을 확률 — 배치가 정하는 것">
                  꽝 <b>{(100 * prof.zero).toFixed(1)}%</b>
                </span>
                <span title="조합 수 × P(3개) — 배치와 무관하게 고정">
                  5등 <b>{prof.exp5.toFixed(2)}</b>장
                </span>
                <span title="4·5등(고정)과 3등(약 144만원)으로 9만원 이상 돌아올 확률">
                  본전 <b>{(100 * prof.breakEven).toFixed(1)}%</b>
                </span>
                <span title="평균 분배 지수 — 1보다 작을수록 당첨 시 나눌 사람이 적다">
                  분배 <b>{prof.sharing.mean.toFixed(2)}</b>
                  <i>적게 {num(prof.sharing.bands.rare)} · 많이 {num(prof.sharing.bands.crowded)}</i>
                </span>
                {#if prof.fixed.numbers.length}
                  <span class="bo" title="모든 조합이 갖고 있는 번호 — 나오는 주에 5등이 몰린다">
                    고정수 <b>{prof.fixed.numbers.join(' ')}</b>
                    <i>{(100 * prof.fixed.p).toFixed(1)}%</i>
                  </span>
                {/if}
              {:else if pstate?.error}
                <span class="dim">계산하지 못했습니다 — {pstate.error}</span>
              {:else}
                <span class="dim">계산 중… ({num(entry.list.length)}조합 · 큰 묶음은 몇 분 걸릴 수 있습니다)</span>
              {/if}
              {#if entry.actual}
                <b class="tag act">실제</b>
                <span class:won={!entry.actual.zero} class:zero={entry.actual.zero}>
                  {entry.actual.zero ? '꽝' : '당첨'}
                </span>
                <span class:won={entry.actual.fifth > 0}>5등 <b>{num(entry.actual.fifth)}</b>장</span>
                {#if entry.actual.fourth}<span class="won">4등 <b>{num(entry.actual.fourth)}</b>장</span>{/if}
                <span>수령 <b>{money(entry.actual.paid)}</b></span>
                {#if entry.actual.fixedOut !== null}
                  <span class:won={entry.actual.fixedOut}>
                    고정수 {entry.actual.fixedOut ? '나옴' : '안 나옴'}
                  </span>
                {/if}
              {/if}
            </div>
          {/if}

          {#if entry.tally}
            <!-- Chaque numéro sorti et le nombre de grilles qui le
                 portaient. Un zéro se voit : c'est un numéro qu'aucune
                 grille ne pouvait attraper. -->
            <div class="pernum">
              <b class="tag">번호별</b>
              {#each entry.tally.per as x, k (x.n)}
                <span class:zero={x.count === 0} class:bo={k === 6}>
                  {x.n}<i>×{x.count}</i>
                </span>
              {/each}
              <span class="sum">총<b>{num(entry.tally.cases)}</b></span>
              <span class="sum">당첨<b>{num(entry.tally.main)}</b></span>
              <span class="sum">보너스 포함<b>{num(entry.tally.total)}</b></span>
              <span class="how">
                {num(entry.list.length)}조합 × {PICK} = {num(entry.tally.cases)}칸 중
                당첨 <b>{num(entry.tally.main)}</b>칸
                = <b>{(100 * entry.tally.main / entry.tally.cases).toFixed(1)}%</b>
                · 기대 {(100 * PICK / NMAX).toFixed(1)}% (당첨번호 {PICK} ÷ 전체 {NMAX})
                <i>|</i>
                보너스 포함 <b>{num(entry.tally.total)}</b>칸
                = <b>{(100 * entry.tally.total / entry.tally.cases).toFixed(1)}%</b>
                · 기대 {(100 * FULL / NMAX).toFixed(1)}%
              </span>
            </div>
            <!-- Le même total, vu par grille. La somme k × (조합 수) redonne
                 le 적중 de l'en-tête — c'est la répartition qui change. -->
            <div class="pernum">
              <b class="tag">조합별</b>
              {#each entry.tally.dist as c, k (k)}
                {#if c > 0 || EXPECTED[k] * entry.list.length >= 0.05}
                  <span class:zero={c === 0}>
                    {k}개<i>{num(c)}장</i><em>{(EXPECTED[k] * entry.list.length).toFixed(1)}</em>
                  </span>
                {/if}
              {/each}
              <span class="how">
                작은 회색 숫자는 무작위였을 때의 장수 · 합계 Σ k×장수 = {num(entry.tally.main)}개
              </span>
            </div>
          {/if}

          <!-- Les 45 numéros, tirage ou pas : combien de grilles portent
               chacun. Les deux blocs au-dessus ne parlent que des numéros
               sortis ; celui-ci dit ce que le lot contient, point. -->
          {#if entry.list.length}
            <div class="pernum">
              <b class="tag">전체 번호별</b>
              {#each sortSpread(entry.spread) as x (x.n)}
                <span class:zero={x.count === 0}
                      class:won={entry.drawn && entry.draw.slice(0, PICK).includes(x.n)}
                      class:bo={entry.drawn && x.n === entry.draw[PICK]}
                      title={`${x.n}번 — 이 조합 ${x.count}장 · 전체 출현 ${num(HITS[x.n])}회`}>{x.n}<i
                      >×{x.count}</i>{#if spreadSort === 'hits'}<em>{num(HITS[x.n])}회</em>{/if}</span>
              {/each}
              <span class="sum">칸<b>{num(entry.list.length * PICK)}</b></span>
              <span class="sortby">
                {#each SPREAD_SORTS as s (s.key)}
                  <button class:on={spreadSort === s.key}
                          onclick={() => (spreadSort = s.key)}>{s.label}</button>
                {/each}
              </span>
              <span class="how">
                {#if spreadSort === 'hits'}
                  전체 {num(draws.n)}회차에서 많이 나온 번호 순 · 옆의 작은 숫자가 그 출현 횟수 ·
                {:else if spreadSort === 'count'}
                  이 조합에 많이 담긴 번호 순 ·
                {:else}
                  1번부터 45번까지, 각 번호를 담은 조합 장수 ·
                {/if}
                {num(entry.list.length)}조합 × {PICK} = <b>{num(entry.list.length * PICK)}</b>칸 ·
                고르게 나누면 번호당 <b>{entry.spreadExp.toFixed(1)}</b>장
                <i>|</i>
                <b>{entry.spreadUsed}개</b> 사용 ·
                <b>{NMAX - entry.spreadUsed}개</b> 없음 ·
                가장 많이 <b>{entry.spreadRange[1]}</b>장, 가장 적게 <b>{entry.spreadRange[0]}</b>장
              </span>
            </div>
          {/if}

          <div class="gridlist">
            {#each shownOf(entry) as g, k (k)}
              <span class="combo"
                    class:win={g.score?.rank}
                    class:near={g.score && g.score.matched === 2}>
                {#each g.numbers as n (n)}
                  <span class="n" class:hit={g.score?.hits.includes(n)}
                        class:bonus={entry.drawn && n === entry.draw[6]}>{n}</span>
                {/each}
                {#if g.score}
                  <span class="score">
                    {#if g.score.rank}
                      <b>{RANK_LABEL[g.score.rank]}</b>
                      <span class="hits">{g.score.matched}개{#if g.score.bonus}+B{/if}</span>
                    {:else if g.score.matched > 0 || g.score.bonus}
                      <span class="hits">{g.score.matched}개{#if g.score.bonus}+B{/if}</span>
                    {:else}
                      <!-- 꽝 : le mot de l'ancien site pour « rien ». -->
                      <span class="hits dim">꽝</span>
                    {/if}
                  </span>
                {/if}
              </span>
            {/each}
          </div>

          {#if entry.list.length > limitOf(entry.id)}
            <button class="more" onclick={() => showMore(entry.id)}>
              더 보기 ({num(limitOf(entry.id))} / {num(entry.list.length)})
            </button>
          {/if}

          {#if open[entry.id]}
            {@const rows = rowsOf(entry)}
            {#if rows.length}
              <ComboTable {rows} limit={rows.length} draw={entry.draw} />
            {/if}
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
      <span class="gloss">조합이 아니라 조건 — 자동조합에서 다시 돌릴 수 있습니다</span>
      <span class="right">{num(searches.length)}건</span>
    </div>

    <div class="scroll tall">
      <table class="mx">
        <thead>
          <tr>
            <th>이름</th><th>회차</th><th>리스트추천</th><th class="v">고정수</th>
            <th class="v">조건</th><th>저장</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#each searches as s (s.id)}
            <tr>
              <td>
                {s.name}
                {#if s.shifted}<span class="flag" title="배수 필터가 걸려 있습니다">배수</span>{/if}
              </td>
              <td>{fmt(s.rang)}</td>
              <td class="dim">{presetLabel(s.form?.preset)}</td>
              <td class="val">{s.form?.fix?.length ?? 0}</td>
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

    <p class="note dim">
      「배수」가 붙은 조건은 옛 사이트에서 <strong>이의배수 · 삼의배수 · 사의배수 ·
      오의배수 · 합성수</strong> 필터가 한 칸씩 밀려 있던 것들입니다. 여기서는 이름표대로
      걸리므로, 옛 결과와 다를 수 있습니다.
    </p>
  </section>
{/if}

<style>
  .more { margin: 0.5rem 0 0.2rem; padding: 0.2rem 0.9rem; font-size: 0.8125rem; }
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

  .balls { display: inline-flex; gap: 0.2rem; }
  .ball {
    font-family: var(--figure); font-size: 0.6875rem;
    border: 1px solid var(--line); border-radius: 999px;
    min-width: 1.35rem; text-align: center; padding: 0.05rem 0.2rem;
  }
  .ball.bo { border-color: var(--gold); color: var(--gold-deep); }

  .rank {
    font-size: 0.6875rem; font-weight: 600; color: var(--gold-deep);
    border: 1px solid var(--gold); border-radius: 0.25rem; padding: 0.05rem 0.4rem;
  }

  /* Le total des numéros sortis que l'enregistrement a portés — dans la
     ligne d'en-tête, à côté du tirage, avec son espérance. */
  .tally {
    font-family: var(--figure); font-size: 0.6875rem; color: var(--muted);
    border: 1px solid var(--line); border-radius: 0.25rem; padding: 0.05rem 0.45rem;
    white-space: nowrap;
  }
  .tally b { font-weight: 600; color: var(--gold-deep); }
  .tally em { font-style: normal; margin-left: 0.25rem; }
  .tally i { font-style: normal; color: var(--line); margin: 0 0.15rem; }

  .pernum { display: flex; flex-wrap: wrap; align-items: center;
            gap: 0.3rem; margin: -0.15rem 0 0.35rem; }
  .pernum + .pernum { margin-top: -0.15rem; }
  .pernum .tag {
    font-size: 0.65rem; font-weight: 600; color: var(--muted);
    min-width: 3.1rem; letter-spacing: 0.02em;
  }
  .pernum span em {
    font-style: normal; color: var(--muted); opacity: 0.75;
    font-size: 0.625rem; margin-left: 0.3rem;
  }
  .pernum span {
    font-family: var(--figure); font-size: 0.6875rem; white-space: nowrap;
    border: 1px solid var(--line-soft); border-radius: 0.25rem; padding: 0.02rem 0.32rem;
  }
  .pernum span i { font-style: normal; color: var(--muted); margin-left: 0.1rem; }
  .pernum span.zero { color: var(--muted); opacity: 0.5; }
  .pernum span.bo { border-color: var(--gold); color: var(--gold-deep); }

  /* 예고 / 실제 — la ligne qui donne au lot son propre point de
     comparaison. Même grammaire que 번호별 : une étiquette, des cases. */
  .pernum.forecast { margin-top: 0; }
  .pernum.forecast span b { font-weight: 600; color: var(--gold-deep); margin-left: 0.15rem; }
  .pernum.forecast .tag.act { margin-left: 0.6rem; min-width: 0; color: var(--gold-deep); }
  .pernum.forecast span.won { border-color: var(--gold); background: var(--gold-wash); }

  /* Le cumul du haut : 예고 en gris, 실제 en or, côte à côte. */
  .fcast {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
    margin: -0.3rem 0 1rem; font-size: 0.75rem;
  }
  .fcast .tag { font-size: 0.65rem; font-weight: 600; color: var(--muted); letter-spacing: 0.02em; }
  .fcast > span {
    font-family: var(--figure); font-size: 0.6875rem; white-space: nowrap;
    border: 1px solid var(--line-soft); border-radius: 0.25rem; padding: 0.05rem 0.4rem;
  }
  .fcast > span em { font-style: normal; color: var(--muted); margin: 0 0.4rem 0 0.25rem; }
  .fcast > span b { font-weight: 600; color: var(--gold-deep); }
  .fcast > span.how { border: 0; color: var(--muted); font-size: 0.65rem; white-space: normal; }

  /* Les numéros sortis, repérés dans la ligne des quarante-cinq : même or
     que les grilles en dessous, pour que l'œil fasse le lien sans légende.
     Un gagnant qu'aucune grille ne portait reste en or, mais pâle — c'est
     l'information la plus utile de la ligne. */
  .pernum span.won {
    border-color: var(--gold); background: var(--gold-wash);
    color: var(--gold-deep); font-weight: 600;
  }
  .pernum span.won i { color: var(--gold-deep); }
  .pernum span.won.zero { opacity: 1; background: none; color: var(--gold); }

  /* Les trois ordres de lecture. Trois mots, pas un menu : on veut pouvoir
     basculer sans quitter la ligne des yeux. */
  .pernum span.sortby {
    border: 0; padding: 0; display: inline-flex; gap: 0.2rem; margin-left: 0.15rem;
  }
  .pernum span.sortby button {
    font-size: 0.625rem; padding: 0.05rem 0.4rem; line-height: 1.5;
    border: 1px solid var(--line-soft); border-radius: 0.25rem;
    background: none; color: var(--muted); cursor: pointer;
  }
  .pernum span.sortby button.on {
    border-color: var(--gold); color: var(--gold-deep); font-weight: 600;
  }

  /* Les trois totaux, au bout de la ligne : les cases possédées, celles
     qui portaient un numéro sorti, et la même chose avec le 보너스. */
  .pernum span.sum {
    border-color: var(--gold); background: var(--gold-wash, transparent);
    color: var(--muted); margin-left: 0.15rem;
  }
  .pernum span.sum b {
    font-weight: 600; color: var(--gold-deep); margin-left: 0.25rem;
  }

  /* D'où sort le « 기대 » : le calcul écrit à côté, pas caché. */
  .pernum span.how {
    border: 0; padding: 0.02rem 0 0.02rem 0.35rem;
    color: var(--muted); font-size: 0.65rem;
    white-space: normal;
  }
  .pernum span.how b { font-weight: 600; color: var(--gold-deep); }
  .pernum span.how i { font-style: normal; color: var(--line); margin: 0 0.3rem; }

  /* Les grilles : compactes, mais chaque numéro sorti se voit. C'est la
     seule chose qu'on cherche en ouvrant cette page. */
  .gridlist { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .combo {
    display: inline-flex; align-items: center; gap: 0.15rem;
    border: 1px solid var(--line-soft); border-radius: var(--radius);
    padding: 0.15rem 0.4rem;
  }
  .combo.near { border-color: var(--line); }
  .combo.win { border-color: var(--gold); background: color-mix(in srgb, var(--gold-soft) 20%, transparent); }
  .combo .n {
    font-family: var(--figure); font-size: 0.75rem;
    min-width: 1.2rem; text-align: center; color: var(--muted);
  }
  .combo .n.hit {
    color: var(--gold-deep); font-weight: 700;
    background: var(--gold-wash); border-radius: 3px;
  }
  .combo .n.bonus { color: var(--gold-deep); font-weight: 700; outline: 1px solid var(--gold); border-radius: 3px; }
  /* Le verdict, séparé des numéros par un filet : sans lui, « 40 0 » se lit
     comme un septième numéro. */
  .score {
    display: inline-flex; align-items: center; gap: 0.25rem;
    font-family: var(--figure); font-size: 0.6875rem;
    color: var(--muted); margin-left: 0.35rem;
    padding-left: 0.35rem; border-left: 1px solid var(--line-soft);
  }
  .score b { color: var(--gold-deep); font-weight: 700; }
  .score .hits { white-space: nowrap; }

  .flag {
    font-size: 0.625rem; color: var(--s3); border: 1px solid var(--s3);
    border-radius: 0.25rem; padding: 0 0.25rem; margin-left: 0.3rem;
  }

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
