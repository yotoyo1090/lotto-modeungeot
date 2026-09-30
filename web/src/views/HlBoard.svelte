<script>
  // 테이블리스트 HL — le damier du 차뜨, avec le passé de chaque case.
  //
  // La deuxième entrée du menu 테이블 de l'ancien site, celle que je n'avais
  // pas portée. Elle pose la même question à chacune des 45 cases :
  //
  //   si ce numéro sortait au prochain 회차, il sortirait après tant
  //   d'attente — combien de fois cela lui est-il déjà arrivé ?
  //
  // Dix chiffres par case, donc 450 chiffres par 회차. Les montrer tous
  // ferait un mur illisible : la case ne porte que son numéro, sa 미래위치 et
  // son 당첨 위치합, et le reste s'ouvre au clic.
  import { hlBoard, hlCells, hlHistory, hlLineStats, hlNextCells } from '@core/hl.js'
  import { REFERENCE_LISTS, repeatTally } from '@core/tablelist.js'
  import { allCells, nextRang } from '@core/tablelist.js'

  import Bars from '../components/Bars.svelte'
  import { num, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'

  let { draws } = $props()

  const cells = $derived(hlCells(draws))
  const stats = $derived(hlLineStats(draws, cells))

  // Les neuf blocs, dans l'ordre de l'ancienne page.
  const BLOCKS = [
    { key: 'wonVertical', label: '당첨 all vertical 라인 통계', gloss: '나온 번호의 기다림', unit: '회' },
    { key: 'lostVertical', label: '꽝 all vertical 라인 통계', gloss: '안 나온 번호의 기다림', unit: '회' },
    { key: 'wonHorizontal', label: '당첨 all horizontal 라인 통계', gloss: '나온 번호의 줄 순서', unit: '번째' },
    { key: 'lostHorizontal', label: '꽝 all horizontal 라인 통계', gloss: '안 나온 번호의 줄 순서', unit: '번째' },
    { key: 'up', label: 'up 1-3 vertical 라인 통계', gloss: '줄에서 앞쪽 세 자리', unit: '개' },
    { key: 'down', label: 'down 4-7 vertical 라인 통계', gloss: '그보다 아래', unit: '개' },
    { key: 'start', label: '1-5 horizontal 라인 통계', gloss: '5회 이내로 기다린', unit: '개' },
    { key: 'middle', label: '5-10 horizontal 라인 통계', gloss: '6에서 10회', unit: '개' },
    { key: 'end', label: '10-@ horizontal 라인 통계', gloss: '10회를 넘게', unit: '개' },
  ]

  // ─────────────────────────────────────────────── les listes de référence

  const PICK_TONES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--gold']
  let picks = $state([])
  function togglePick(key) {
    picks = picks.includes(key) ? picks.filter((k) => k !== key) : [...picks, key]
  }
  const toneOf = (key) => PICK_TONES[picks.indexOf(key) % PICK_TONES.length]

  const paint = $derived.by(() => {
    const out = new Array(46).fill(null)
    for (const key of picks) {
      const list = REFERENCE_LISTS.find((l) => l.key === key)
      if (!list) continue
      const tone = toneOf(key)
      for (const n of list.numbers) if (!out[n]) out[n] = tone
    }
    return out
  })

  // ──────────────────────────────────────────────────────── les cartes

  // Chaque carte recompte l'historique jusqu'à son 회차 — une passe de 45 ×
  // le rang. L'ancien le faisait pour les 1 238 회차 d'un coup, ce qui ne
  // pouvait pas s'afficher ; ici on ne le fait que pour les cartes ouvertes.
  const LSTEP = 4
  let lcount = $state(LSTEP)

  const plainCells = $derived(allCells(draws))

  // La carte du 회차 **à venir**, toujours en tête. Aucune case n'y est
  // sortie : son `run` vaut zéro partout, donc rien n'est retranché du passé
  // au moment de compter les 위치합 — le 미래위치 s'y lit tel quel.
  const upcoming = $derived.by(() => {
    const row = hlNextCells(draws)
    const plus = [...cells, row]
    return {
      i: draws.n,
      rang: nextRang(draws),
      upcoming: true,
      now: null,
      after: null,
      board: hlBoard(plus, draws.n, hlHistory(cells), null),
      repeats: repeatTally(row),
    }
  })

  const boards = $derived.by(() => {
    const out = [upcoming]
    const at = draws.n - 1
    for (let k = 0; k < lcount && at - k >= 0; k++) {
      const i = at - k
      const nxt = i + 1 < draws.n ? draws.fullAt(i + 1) : null
      out.push({
        i,
        rang: draws.rangs[i],
        now: [...draws.sequenceAt(i)],
        after: nxt ? [...draws.sequenceAt(i + 1)] : null,
        board: hlBoard(cells, i, hlHistory(cells, i + 1), nxt),
        repeats: repeatTally(plainCells[i]),
      })
    }
    return out
  })

  // La case ouverte : « 회차 · numéro ». Une seule à la fois — deux panneaux
  // de dix chiffres côte à côte ne se comparent pas mieux qu'un seul.
  let open = $state(null)
  const isOpen = (rang, n) => open === `${rang}:${n}`
  const toggle = (rang, n) => { open = isOpen(rang, n) ? null : `${rang}:${n}` }
</script>

{#if draws.n < 2}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}

  <section class="panel">
    <div class="head">
      <h2>라인 통계</h2>
      <span class="gloss">세로는 기다림, 가로는 줄에서의 순서</span>
      <span class="right">{num(draws.n - 1)}회차</span>
    </div>
    <p class="note dim tight">
      <strong>vertical</strong>은 그 번호가 몇 회를 기다렸는지 — 이미 나온
      번호는 0입니다. <strong>horizontal</strong>은 같은 값을 가진 번호 중
      몇 번째인지. 각각을 <strong>나온 일곱</strong>과
      <strong>안 나온 서른여덟</strong>으로 나눠 셉니다.
    </p>
  </section>

  <section class="panel grid9">
    {#each BLOCKS as b (b.key)}
      <div class="ninth">
        <div class="head">
          <h2>{b.label}</h2>
          <span class="gloss">{b.gloss}</span>
        </div>
        <div class="scroll cap">
          <Bars data={stats[b.key]} suffix={b.unit} />
        </div>
      </div>
    {/each}
  </section>

  <section class="panel">
    <div class="head">
      <h2>리스트</h2>
      <span class="gloss">눌러서 아래 표에 켜고 끕니다</span>
      <span class="right">
        {#if picks.length}
          {num(picks.length)}개 선택
          <button class="clear" onclick={() => (picks = [])}>지우기</button>
        {:else}
          <span class="dim">선택 없음</span>
        {/if}
      </span>
    </div>
    <div class="refs">
      {#each REFERENCE_LISTS as l (l.key)}
        <button class="ref" aria-pressed={picks.includes(l.key)}
                style={picks.includes(l.key) ? `--pick: var(${toneOf(l.key)})` : null}
                onclick={() => togglePick(l.key)}>
          <span class="dot"></span>
          <span class="rlabel">{l.label}</span>
          <span class="rnums">{l.numbers.join(', ')}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>회차별 번호</h2>
      <span class="gloss">칸을 누르면 그 번호의 과거가 열립니다</span>
      <span class="right">{num(boards.length)}회차</span>
    </div>
    <p class="note dim tight">
      칸의 큰 숫자는 <strong>번호</strong>, 그 아래 작은 두 숫자는
      <strong>미래위치</strong>와 <strong>당첨 위치합</strong> — 다음 회차에
      나온다면 몇 회 만이고, 그런 일이 지금까지 몇 번 있었는지.
      <br />
      <span class="chip mk low">검정</span>과 <span class="chip mk high">금색</span>은
      <strong>제외번호</strong>입니다 — 같은 미래위치끼리 견줘서, 그 자리에서
      가장 <strong>적게</strong> 나온 번호와 가장 <strong>많이</strong> 나온 번호.
    </p>
  </section>

  {#each boards as b (b.rang)}
    <section class="panel card">
      <div class="cardhead">
        <div class="pair">
          <span class="lead">{b.upcoming ? '다음 회차' : '현재 회차'}</span>
          <b class="rg" class:soon={b.upcoming}>{fmt(b.rang)}</b>
          {#if b.now}
            <span class="grid">
              {#each b.now as n, j (j)}
                <span class="n" class:bonus={j === 6} class:lit={paint[n]}
                      style="--tone: var({SECTION_VARS[sectionOf(n)]}); {paint[n]
                        ? `--pick: var(${paint[n]})` : ''}">{n}</span>
              {/each}
            </span>
          {:else}
            <span class="soonnote">아직 추첨 전 — 지금 기다리는 번호입니다</span>
          {/if}
        </div>
        {#if b.after}
          <div class="pair">
            <span class="lead">당첨 회차</span>
            <b class="rg">{fmt(b.rang + 1)}</b>
            <span class="grid">
              {#each b.after as n, j (j)}
                <span class="n hit" class:bonus={j === 6}
                      style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
              {/each}
            </span>
          </div>
        {/if}
        <div class="pair">
          <span class="lead">반복 수</span>
          <span class="chips">
            {#each b.repeats as r (r.label)}
              <span class="chip" class:flag={r.flag}>{r.label}<i>:</i>{r.count}</span>
            {/each}
          </span>
        </div>
      </div>

      <div class="scroll">
        <table class="board">
          <thead>
            <tr>
              <th class="stub">라인</th>
              {#each b.board.columns as c (c.key)}
                <th class:won={c.key === 'won'}>{c.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each Array(b.board.height) as _, r (r)}
              <tr>
                <th class="stub">{r + 1}</th>
                {#each b.board.columns as c (c.key)}
                  {@const e = c.entries[r]}
                  <td class:filled={!!e} class:next={e?.hit}
                      class:mlow={e?.mark === 'low'} class:mhigh={e?.mark === 'high'}>
                    {#if e}
                      <button class="cell" class:lit={paint[e.number]}
                              aria-expanded={isOpen(b.rang, e.number)}
                              style={paint[e.number] ? `--pick: var(${paint[e.number]})` : null}
                              onclick={() => toggle(b.rang, e.number)}>
                        <b style="--tone: var({SECTION_VARS[sectionOf(e.number)]})">{e.number}</b>
                        {#if e.flag}<i class="fl">{e.flag}</i>{/if}
                        <span class="two">
                          <span class="f">{e.digits.future}</span>
                          <span class="w">{e.digits.won}</span>
                        </span>
                      </button>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Le panneau des dix chiffres, pour la case ouverte. -->
      {#each b.board.columns as c (c.key)}
        {#each c.entries as e (e.number)}
          {#if isOpen(b.rang, e.number)}
            {@const d = e.digits}
            <div class="detail">
              <div class="dhead">
                <b class="dn" style="--tone: var({SECTION_VARS[sectionOf(e.number)]})">{e.number}</b>
                <span class="lead">번</span>
                {#if e.flag}<span class="tag">{e.flag}</span>{/if}
                <span class="lead">미래위치</span><b class="dv">{d.future}</b>
                <span class="lead">전부 통계</span><b class="dv">{num(d.total)}</b>
                <button class="clear" onclick={() => (open = null)}>닫기</button>
              </div>

              <div class="rows">
                {#each [
                  { k: '당첨', total: d.wonTotal, at: d.won, tone: '--gold', ink: '--gold-deep' },
                  { k: '이월', total: d.carryTotal, at: d.carry, tone: '--t-dead', ink: '--t-dead-text' },
                  { k: '꽝', total: d.blankTotal, at: d.blank, tone: '--line', ink: '--muted' },
                ] as row (row.k)}
                  <div class="drow">
                    <span class="dk" style="--tone: var({row.ink})">{row.k}</span>
                    <span class="dsum">합계 {num(row.total)}</span>
                    <span class="track">
                      <span class="fill" style="--tone: var({row.tone});
                        width: {d.total ? (row.total / d.total) * 100 : 0}%"></span>
                    </span>
                    <span class="dpos">위치합 <b>{num(row.at)}</b></span>
                  </div>
                {/each}
                <div class="drow all">
                  <span class="dk">전부</span>
                  <span class="dsum">합계 {num(d.total)}</span>
                  <span class="track"></span>
                  <span class="dpos">위치합 <b>{num(d.all)}</b></span>
                </div>
              </div>

              <div class="clist">
                <span class="lead">이월 리스트</span>
                {#if d.carryList.length}
                  {#each d.carryList as [value, count] (value)}
                    <span class="cpair">{value}<i>:</i>{count}</span>
                  {/each}
                {:else}
                  <span class="dim">없음</span>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/each}
    </section>
  {/each}

  {#if lcount < draws.n}
    <div class="more">
      <button onclick={() => (lcount += LSTEP)}>
        더 보기 <span class="dim">{num(lcount)} / {num(draws.n)}</span>
      </button>
    </div>
  {/if}
{/if}

<style>
  /* Le 회차 à venir : doré, et dit en toutes lettres qu'il n'est pas tiré.
     Sans ça on lirait ses 대기 comme un résultat. */
  .rg.soon { color: var(--gold-deep); }
  .soonnote { color: var(--muted); font-size: 0.75rem; }

  .grid9 {
    display: grid; gap: 1.4rem 2rem;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  }
  .ninth { min-width: 0; }
  .ninth h2 { font-size: 0.9375rem; }
  .cap { max-height: 15rem; overflow-y: auto; }

  .refs { display: grid; gap: 1px; }
  .ref {
    display: grid; grid-template-columns: 0.7rem 4.5rem 1fr;
    align-items: center; gap: 0.5rem; text-align: left;
    border: 0; background: none; padding: 0.2rem 0.25rem;
    border-bottom: 1px solid var(--line-soft); cursor: pointer;
  }
  .ref .dot {
    width: 0.55rem; height: 0.55rem; border-radius: 50%;
    border: 1px solid var(--line); background: transparent;
  }
  .ref[aria-pressed='true'] .dot { background: var(--pick); border-color: var(--pick); }
  .ref[aria-pressed='true'] .rlabel { color: var(--pick); font-weight: 600; }
  .rlabel { font-size: 0.8125rem; }
  .rnums {
    font-family: var(--figure); font-size: 0.6875rem; color: var(--muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .clear { font-size: 0.6875rem; padding: 0.1rem 0.45rem; margin-left: 0.35rem; }

  .card { padding-top: 0.9rem; }
  .cardhead {
    display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem;
    align-items: baseline; margin-bottom: 0.7rem;
  }
  .pair { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .lead { color: var(--muted); font-size: 0.75rem; }
  .rg { font-family: var(--figure); font-size: 0.8125rem; }
  .grid { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .n {
    font-family: var(--figure); color: var(--tone);
    min-width: 1.5rem; text-align: center; font-size: 0.8125rem;
  }
  .n.bonus { opacity: 0.7; }
  .n.lit { background: var(--pick); color: #fff; border-radius: 0.25rem; }
  .n.hit { font-weight: 600; }
  .chips { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .chip {
    font-family: var(--figure); font-size: 0.6875rem; color: var(--muted);
    border: 1px solid var(--line-soft); border-radius: 0.25rem; padding: 0 0.3rem;
  }
  .chip.flag { color: var(--gold-deep); border-color: var(--gold-soft); }
  .chip i { opacity: 0.45; font-style: normal; margin: 0 0.15rem; }
  .chip.mk.low { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .chip.mk.high { background: var(--gold); color: #fff; border-color: var(--gold); }

  /* Le damier. Une case tient trois choses : le numéro, et les deux chiffres
     qui décident — le reste attend le clic. */
  .board { border-collapse: collapse; font-size: 0.75rem; }
  .board th, .board td {
    border: 1px solid var(--line-soft); padding: 0; text-align: center;
  }
  .board thead th {
    font-family: var(--figure); font-weight: 400; color: var(--muted);
    background: var(--surface); padding: 0.2rem 0.4rem; white-space: nowrap;
  }
  .board thead th.won { color: var(--gold-deep); }
  .board .stub {
    background: var(--surface); color: var(--muted); font-weight: 400;
    font-size: 0.6875rem; position: sticky; left: 0; z-index: 1;
    padding: 0.2rem 0.4rem;
  }
  .board td { min-width: 2.6rem; }
  .board td.next { outline: 2px solid var(--gold); outline-offset: -2px; }

  .cell {
    display: grid; gap: 1px; width: 100%; border: 0; background: none;
    padding: 0.15rem 0.2rem; cursor: pointer; border-radius: 0;
    font: inherit; line-height: 1.15;
  }
  .cell:hover { background: var(--line-soft); }
  .cell[aria-expanded='true'] { background: var(--gold-soft); }
  .cell b { font-family: var(--figure); color: var(--tone); font-weight: 600; }
  .cell.lit b { background: var(--pick); color: #fff; border-radius: 0.2rem; }
  .cell .fl { font-style: normal; font-size: 0.5625rem; color: var(--gold-deep); }
  .two {
    display: flex; justify-content: center; gap: 0.25rem;
    font-family: var(--figure); font-size: 0.5625rem;
  }
  .two .f { color: var(--muted); }
  .two .w { color: var(--gold-deep); }

  td.mlow .cell b { background: var(--ink); color: var(--paper); border-radius: 0.2rem; }
  td.mhigh .cell b { background: var(--gold); color: #fff; border-radius: 0.2rem; }

  /* Le panneau ouvert. */
  .detail {
    margin-top: 0.8rem; border: 1px solid var(--gold-soft);
    border-radius: var(--radius); padding: 0.85rem 1rem;
    background: color-mix(in srgb, var(--gold-soft) 14%, var(--surface));
  }
  .dhead {
    display: flex; align-items: baseline; gap: 0.45rem; flex-wrap: wrap;
    margin-bottom: 0.6rem;
  }
  .dn { font-family: var(--figure); font-size: 1.25rem; color: var(--tone); }
  .dv { font-family: var(--figure); }
  .dhead .tag {
    font-size: 0.6875rem; color: var(--gold-deep);
    border: 1px solid var(--gold-soft); border-radius: 0.25rem; padding: 0 0.3rem;
  }
  .dhead .clear { margin-left: auto; }

  .rows { display: grid; gap: 0.25rem; }
  .drow {
    display: grid; align-items: center; gap: 0.6rem;
    grid-template-columns: 2.5rem 5.5rem 1fr 6.5rem;
    font-size: 0.75rem;
  }
  .dk { font-weight: 600; color: var(--tone); }
  .drow.all .dk { color: var(--muted); }
  .dsum, .dpos { font-family: var(--figure); color: var(--muted); }
  .dpos { text-align: right; }
  .dpos b { color: var(--ink); }
  .track {
    height: 0.45rem; background: var(--line-soft);
    border-radius: 0.25rem; overflow: hidden;
  }
  .fill { display: block; height: 100%; background: var(--tone); }

  .clist {
    margin-top: 0.7rem; padding-top: 0.6rem;
    border-top: 1px solid var(--line-soft);
    display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: baseline;
  }
  .cpair {
    font-family: var(--figure); font-size: 0.6875rem; color: var(--muted);
    border: 1px solid var(--line-soft); border-radius: 0.25rem; padding: 0 0.3rem;
  }
  .cpair i { opacity: 0.45; font-style: normal; margin: 0 0.1rem; }

  .more { display: flex; gap: 0.35rem; margin-top: 0.6rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.7; }
  .note.tight { margin-top: 0.4rem; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
