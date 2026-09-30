<script>
  // 자동조합, côté 연금복권.
  //
  // Une différence de fond avec le 6/45, et elle change ce que l'écran veut
  // dire : on ne compose pas un billet de 연금복권, on en achète un déjà
  // imprimé. Ce générateur ne fabrique donc pas une grille à jouer — il
  // **réduit la liste des billets à chercher**. C'est écrit sur la page,
  // parce qu'un écran qui laisse croire le contraire ment.
  //
  // Le moteur est `core/pension-generator.js` : il balaie le million de
  // séquences en quelques dizaines de millisecondes, dans un fil séparé.
  // Contrairement au 6/45, ses filtres sont des **bornes** — un minimum et
  // un maximum — pas des listes de valeurs cochées.
  import {
    BASE, DIGITS, GROUPS, MULTIPLES, compute, describeTicket, distribution,
  } from '@core/pension.js'
  import { LABELS } from '@core/pension-generator.js'
  import { PENSION_RANKS, scoreTicket } from '@core/combos.js'

  import { isSkipped, search } from '../lib/generator.js'
  import { pensionAuto as store, pensionGrids as gridStore } from '../lib/store.js'
  import { num, rang as fmt, won as money } from '../lib/format.js'
  import { engineOptions, PAGE, shuffleGrids } from '../lib/pick.js'

  let { pension, pending = null, onconsumed = null } = $props()

  const last = $derived(pension.rangs[pension.n - 1])
  let rang = $state(null)
  const target = $derived(rang ?? last + 1)

  const m = $derived(compute(pension))

  // Les bornes offertes viennent de ce qu'on a **vu** : proposer un 총합 de
  // 54 quand le maximum observé est 47 ne sert qu'à faire une case vide.
  const seen = $derived({
    total: distribution(m.total),
    ac: distribution(m.ac),
    low: distribution(m.lowCount),
    odd: distribution(m.oddCount),
    primes: distribution(m.primeCount),
    composites: distribution(m.compositeCount),
    distinct: distribution(m.distinct),
    repeats: distribution(m.repeats),
    match: distribution(m.carryCount.subarray(1)),
  })

  const RANGES = {
    total: [0, 54], ac: [0, 5], low: [0, 6], odd: [0, 6],
    primes: [0, 6], composites: [0, 6], distinct: [1, 6], repeats: [0, 6],
    match: [0, 6],
  }
  const span = (key) => {
    const [lo, hi] = RANGES[key]
    return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
  }

  // --- le formulaire ------------------------------------------------------

  const CRITERIA = [
    { key: 'total', label: '총합', gloss: '여섯 숫자의 합' },
    { key: 'ac', label: 'AC값', gloss: '서로 다른 차' },
    { key: 'low', label: '저수', gloss: '0–4의 개수' },
    { key: 'odd', label: '홀수', gloss: '홀수의 개수' },
    { key: 'primes', label: '소수', gloss: '2 · 3 · 5 · 7' },
    { key: 'composites', label: '합성수', gloss: '4 · 6 · 8 · 9' },
    { key: 'distinct', label: '서로 다른 숫자', gloss: '1–6' },
    { key: 'repeats', label: '중복 숫자', gloss: '겹친 숫자의 개수' },
    { key: 'match', label: '전회차 대비', gloss: '전 회차와 겹치는 숫자' },
  ]

  const empty = () => ({
    groups: [],
    positions: Array.from({ length: DIGITS }, () => []),
    include: [], exclude: [],
    bounds: Object.fromEntries(CRITERIA.map((c) => [c.key, ['', '']])),
    multiples: Object.fromEntries(MULTIPLES.map((k) => [k, ['', '']])),
  })

  let form = $state(empty())

  const toggle = (list, value) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const toggleGroup = (g) => { form.groups = toggle(form.groups, g) }
  const togglePos = (p, d) => {
    form.positions = form.positions.map((list, k) => (k === p ? toggle(list, d) : list))
  }
  const toggleFix = (d) => {
    form.include = toggle(form.include, d)
    form.exclude = form.exclude.filter((x) => x !== d)
  }
  const toggleOut = (d) => {
    form.exclude = toggle(form.exclude, d)
    form.include = form.include.filter((x) => x !== d)
  }

  function reset() { form = empty() }

  const DIGITS_LIST = Array.from({ length: BASE }, (_, d) => d)
  const PLACES = ['일', '이', '삼', '사', '오', '육']

  // Le tirage précédent — c'est contre lui que se compte le 전회차 대비.
  const previous = $derived.by(() => {
    for (let k = 0; k < pension.n; k++) {
      if (pension.rangs[k] === target - 1) return [...pension.digitsAt(k)]
    }
    return null
  })

  /** Une paire de champs vides veut dire « pas de limite ». */
  const bound = (pair) => {
    const a = pair[0] === '' ? null : Number(pair[0])
    const b = pair[1] === '' ? null : Number(pair[1])
    if (a === null && b === null) return null
    return [a ?? -Infinity, b ?? Infinity]
  }

  const filters = $derived.by(() => {
    const f = {}
    if (form.groups.length) f.groups = [...form.groups].sort((a, b) => a - b)
    if (form.positions.some((p) => p.length)) {
      f.positions = form.positions.map((p) => (p.length ? [...p].sort((a, b) => a - b) : null))
    }
    if (form.include.length) f.include = [...form.include]
    if (form.exclude.length) f.exclude = [...form.exclude]

    for (const c of CRITERIA) {
      const b = bound(form.bounds[c.key])
      if (!b) continue
      if (c.key === 'match') {
        // Sans référence le moteur refuse le critère — et il a raison : il
        // n'y a rien à comparer.
        if (previous) { f.reference = previous; f.match = b }
      } else f[c.key] = b
    }

    const mult = {}
    for (const k of MULTIPLES) {
      const b = bound(form.multiples[k])
      if (b) mult[k] = b
    }
    if (Object.keys(mult).length) f.multiples = mult
    return f
  })

  const active = $derived([
    form.groups.length && `조 ${form.groups.length}개`,
    form.positions.some((p) => p.length) && '자리별 숫자',
    form.include.length && `고정수 ${form.include.length}개`,
    form.exclude.length && `제외수 ${form.exclude.length}개`,
    ...CRITERIA.map((c) => bound(form.bounds[c.key]) && c.label),
    ...MULTIPLES.map((k) => bound(form.multiples[k]) && `${k}의배수`),
  ].filter(Boolean))

  // --- le calcul ---------------------------------------------------------

  // Pas de plafond d'écran : seulement celui du moteur, qui ne garde jamais
  // plus d'un million de billets. Toujours tirés au sort — dans l'ordre, les
  // 2 000 premiers étaient tous du 1조 et commençaient tous par 00.
  // Plus de case 개수, comme au 6/45 : on tire tout (dans la limite du
  // moteur), on en montre 500 et 「더 보기」 en ajoute 500 à chaque fois.
  const MAX = 1_000_000
  const STRIDE = DIGITS + 1
  let listed = $state(PAGE)

  let status = $state('idle')
  // `raw` : jamais modifié en place, et trop gros pour un proxy par chiffre
  // (voir le 자동조합).
  let result = $state.raw(null)
  let failure = $state(null)

  async function run() {
    status = 'running'
    failure = null
    try {
      const r = await search('pension', $state.snapshot(filters), engineOptions('random', MAX))
      shuffleGrids(r.grids, STRIDE)
      result = r
      listed = PAGE
      status = 'done'
    } catch (error) {
      if (isSkipped(error)) return
      failure = error.message
      status = 'failed'
    }
  }

  /** Le tirage visé, s'il a eu lieu — pour noter ce qu'on aurait fait. */
  const draw = $derived.by(() => {
    for (let k = 0; k < pension.n; k++) {
      if (pension.rangs[k] === target) {
        return {
          group: pension.groups[k],
          digits: [...pension.digitsAt(k)],
          bonus: [...pension.bonusAt(k)],
        }
      }
    }
    return null
  })

  // Tous les billets tirés restent dans `result.grids` ; on ne décrit que
  // ceux qui sont affichés.
  const total = $derived(result ? result.count : 0)
  const ticketAt = (i) => {
    const at = i * STRIDE
    return { group: result.grids[at], digits: Array.from(result.grids.slice(at + 1, at + STRIDE)) }
  }
  const tickets = $derived.by(() => {
    if (!result) return []
    const out = []
    for (let i = 0; i < Math.min(total, listed); i++) {
      const t = ticketAt(i)
      out.push({
        ...t,
        n: i + 1,
        row: describeTicket(t.digits, { group: t.group, reference: previous }),
        score: scoreTicket(t, draw),
      })
    }
    return out
  })

  // --- les carnets -------------------------------------------------------

  const canStore = store.available()
  let saved = $state(store.load())
  let saveName = $state('')
  let notice = $state(null)

  $effect(() => {
    if (!pending) return
    reopen(pending)
    onconsumed?.()
  })

  function doSave() {
    const entry = store.save({
      name: saveName, rang: target,
      form: $state.snapshot(form), filters: active.length,
    })
    if (!entry) { notice = '브라우저가 저장을 거부했습니다.'; return }
    saved = store.load()
    saveName = ''
    notice = `${entry.name} — 조건을 저장했습니다.`
  }

  function reopen(entry) {
    const f = entry.form ?? {}
    form = {
      ...empty(),
      ...f,
      positions: (f.positions ?? []).length === DIGITS
        ? f.positions.map((p) => [...(p ?? [])])
        : Array.from({ length: DIGITS }, () => []),
      bounds: { ...empty().bounds, ...(f.bounds ?? {}) },
      multiples: { ...empty().multiples, ...(f.multiples ?? {}) },
      groups: [...(f.groups ?? [])],
      include: [...(f.include ?? [])],
      exclude: [...(f.exclude ?? [])],
    }
    rang = entry.rang != null && entry.rang <= last ? entry.rang : null
    result = null
    status = 'idle'
    notice = `${entry.name} 를 불러왔습니다 — 「표 찾기」를 누르세요.`
  }

  function drop(id) {
    store.remove(id)
    saved = store.load()
  }

  // Tout ce qui est tiré part au carnet, pas seulement l'affiché. La seule
  // borne est la place du navigateur, ~5 Mo pour tous les carnets réunis.
  function saveTickets() {
    if (!total) return
    const keep = Array.from({ length: total }, (_, i) => ticketAt(i))
    const entry = gridStore.save({
      name: saveName || `${target}회 자동`,
      rang: target, source: 'auto', tickets: keep,
      form: $state.snapshot(form),
    })
    if (!entry) {
      notice = `브라우저가 저장을 거부했습니다 — ${num(keep.length)}장은 브라우저 저장 공간(약 5MB)에 비해 너무 많을 수 있습니다. 조건을 더 걸어 표 수를 줄여 보세요.`
      return
    }
    saveName = ''
    notice = `${entry.name} — ${num(keep.length)}장을 조합결과에 저장했습니다.`
  }
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>자동조합</h2>
    <span class="gloss">조건에 맞는 표 찾기</span>
  </div>
  <div class="pick">
    <span class="label">회차</span>
    <select bind:value={rang}>
      <option value={null}>{fmt(last + 1)} · 다음 회차</option>
      {#each Array.from({ length: Math.min(pension.n, 60) }, (_, i) => pension.n - 1 - i) as k (k)}
        <option value={pension.rangs[k]}>{fmt(pension.rangs[k])}</option>
      {/each}
    </select>
  </div>
</section>

<section class="panel">
  <p class="notice">
    <strong>연금복권은 번호를 고르는 게임이 아닙니다.</strong> 이미 인쇄된 표를
    사는 것이므로, 이 화면은 조합을 <em>만들지</em> 않습니다 — 살 만한 표의
    범위를 <strong>좁혀 줄 뿐</strong>입니다. 어떤 조건도 당첨 확률을 바꾸지
    않습니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>조</h2>
    <span class="gloss">비워 두면 다섯 조 모두</span>
  </div>
  <div class="chips">
    {#each GROUPS as g (g)}
      <button class="chip" class:on={form.groups.includes(g)}
              onclick={() => toggleGroup(g)}>{g}조</button>
    {/each}
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>자리별 숫자</h2>
    <span class="gloss">각 자리에 올 수 있는 숫자 · 비워 두면 전부</span>
  </div>
  <div class="places">
    {#each PLACES as place, p (p)}
      <div class="place">
        <span class="plabel">{place}</span>
        <div class="chips">
          {#each DIGITS_LIST as d (d)}
            <button class="chip small" class:on={form.positions[p].includes(d)}
                    onclick={() => togglePos(p, d)}>{d}</button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>

<section class="panel two">
  <div class="half">
    <div class="head">
      <h2>{LABELS.include}</h2>
      <span class="gloss">반드시 들어갈 숫자</span>
    </div>
    <div class="chips">
      {#each DIGITS_LIST as d (d)}
        <button class="chip" class:on={form.include.includes(d)}
                onclick={() => toggleFix(d)}>{d}</button>
      {/each}
    </div>
  </div>
  <div class="half">
    <div class="head">
      <h2>{LABELS.exclude}</h2>
      <span class="gloss">어느 자리에도 오지 않을 숫자</span>
    </div>
    <div class="chips">
      {#each DIGITS_LIST as d (d)}
        <button class="chip out" class:on={form.exclude.includes(d)}
                onclick={() => toggleOut(d)}>{d}</button>
      {/each}
    </div>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>필터</h2>
    <span class="gloss">최소와 최대 · 비워 두면 제한 없음</span>
    {#if active.length}<span class="right">{active.join(' · ')}</span>{/if}
  </div>

  <div class="bounds">
    {#each CRITERIA as c (c.key)}
      <div class="crit">
        <span class="clabel">{c.label}<span class="cg">{c.gloss}</span></span>
        <span class="pair">
          <select bind:value={form.bounds[c.key][0]}>
            <option value="">—</option>
            {#each span(c.key) as v (v)}
              <option value={String(v)}>{v}{#if seen[c.key]?.[v]} ({num(seen[c.key][v])}){/if}</option>
            {/each}
          </select>
          <i>~</i>
          <select bind:value={form.bounds[c.key][1]}>
            <option value="">—</option>
            {#each span(c.key) as v (v)}
              <option value={String(v)}>{v}{#if seen[c.key]?.[v]} ({num(seen[c.key][v])}){/if}</option>
            {/each}
          </select>
        </span>
      </div>
    {/each}

    {#each MULTIPLES as k (k)}
      <div class="crit">
        <span class="clabel">{k}의배수<span class="cg">0은 제외</span></span>
        <span class="pair">
          <select bind:value={form.multiples[k][0]}>
            <option value="">—</option>
            {#each [0, 1, 2, 3, 4, 5, 6] as v (v)}<option value={String(v)}>{v}</option>{/each}
          </select>
          <i>~</i>
          <select bind:value={form.multiples[k][1]}>
            <option value="">—</option>
            {#each [0, 1, 2, 3, 4, 5, 6] as v (v)}<option value={String(v)}>{v}</option>{/each}
          </select>
        </span>
      </div>
    {/each}
  </div>

  <p class="note dim">
    괄호 안은 <strong>{num(pension.n)}회차 중 몇 번</strong> 그 값이 나왔는지입니다.
    한 번도 없던 값을 고르면 결과는 0이 됩니다 — 그게 잘못은 아니지만, 알고
    고르는 편이 낫습니다.
    {#if !previous}
      <br />전회차 대비는 {fmt(target - 1)}가 없어 쓸 수 없습니다.
    {/if}
  </p>
</section>

<section class="panel run">
  <button class="go" onclick={run} disabled={status === 'running'}>
    {status === 'running' ? '계산 중…' : '표 찾기'}
  </button>
  <button onclick={reset}>초기화</button>
  <span class="dim">통과한 표를 모두 무작위 순서로 뽑습니다 (최대 {num(MAX)}장) · {num(PAGE)}장씩 표시합니다.</span>
</section>

{#if status === 'failed'}
  <section class="panel"><p class="warn">{failure}</p></section>
{/if}

{#if status === 'done' && result}
  <section class="panel">
    <div class="head">
      <h2>결과</h2>
      <span class="gloss">{fmt(target)} 기준</span>
      <span class="right">
        {num(result.kept)}개 번호 · {num(result.tickets)}장
        · 무작위 {num(total)}장 뽑음
        · {num(tickets.length)}장 표시
        · {result.elapsedMs.toFixed(0)} ms
      </span>
    </div>

    <div class="counts">
      <div class="cell">
        <span class="label">전체 후보</span>
        <span class="figure">{num(result.candidates)}</span>
      </div>
      <div class="cell">
        <span class="label">통과</span>
        <span class="figure">{num(result.kept)}</span>
        <span class="dim">
          {result.candidates ? ((result.kept / result.candidates) * 100).toFixed(2) : '0'}%
        </span>
      </div>
      <div class="cell">
        <span class="label">조를 곱하면</span>
        <span class="figure">{num(result.tickets)}</span>
        <span class="dim">장</span>
      </div>
    </div>

    <div class="saveline">
      <input class="name" type="text" placeholder="이름 (비워도 됩니다)" bind:value={saveName} />
      <button onclick={saveTickets} disabled={!total}>
        전체 조합결과에 저장
      </button>
      <button onclick={doSave}>조건 저장</button>
    </div>
    {#if notice}<p class="notice tight">{notice}</p>{/if}

    <div class="scroll tall">
      <table class="mx">
        <thead>
          <tr>
            <th>#</th><th>조</th><th>번호</th>
            <th class="v">총합</th><th class="v">AC값</th>
            <th>저고</th><th>홀짝</th>
            <th class="v">서로 다른</th><th class="v">중복</th><th class="v">이월</th>
            {#if draw}<th>결과</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each tickets as t (t.n)}
            <tr>
              <td class="dim">{t.n}</td>
              <td class="val">{t.group}</td>
              <td class="digits">
                {#each t.digits as d, k (k)}<span class="d">{d}</span>{/each}
              </td>
              <td class="val">{t.row.total}</td>
              <td class="val">{t.row.ac}</td>
              <td>{t.row.lowLabel}</td>
              <td>{t.row.oddLabel}</td>
              <td class="val">{t.row.distinct}</td>
              <td class="val">{t.row.repeats}</td>
              <td class="val">{t.row.carried.length}</td>
              {#if draw}
                <td>
                  {#if t.score?.rank}<b class="rank">{t.score.rank.label}</b>
                  {:else}<span class="dim">꽝</span>{/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if tickets.length < total}
      <button class="more" onclick={() => (listed += PAGE)}>
        더 보기 ({num(tickets.length)} / {num(total)})
      </button>
    {/if}

    {#if draw}
      <p class="note dim">
        「결과」는 {fmt(target)}가 <strong>이미 추첨된</strong> 회차라서 채워집니다.
        지나간 회차로 조건을 시험해 볼 수는 있지만, 그것이 다음 회차에 대해
        말해 주는 것은 <strong>아무것도 없습니다</strong>.
      </p>
    {/if}
  </section>
{/if}

{#if saved.length}
  <section class="panel">
    <div class="head">
      <h2>저장된 검색 조건</h2>
      <span class="gloss">조건만 저장됩니다 — 표가 아니라</span>
      <span class="right">{num(saved.length)}건</span>
    </div>
    {#if !canStore}
      <p class="warn">이 브라우저에서는 저장이 되지 않습니다.</p>
    {/if}
    <div class="scroll">
      <table class="mx">
        <thead>
          <tr><th>이름</th><th>회차</th><th class="v">조건</th><th>저장 시각</th><th></th></tr>
        </thead>
        <tbody>
          {#each saved as entry (entry.id)}
            <tr>
              <td>{entry.name}</td>
              <td>{fmt(entry.rang)}</td>
              <td class="val">{entry.filters ?? '—'}</td>
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
  </section>
{/if}

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
  .pick .label { color: var(--muted); font-size: 0.75rem; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip {
    font-family: var(--figure); font-size: 0.8125rem;
    min-width: 2.1rem; padding: 0.2rem 0.4rem;
  }
  .chip.small { min-width: 1.8rem; font-size: 0.75rem; padding: 0.15rem 0.3rem; }
  .chip.on { border-color: var(--gold); color: var(--gold-deep); }
  .chip.out.on { border-color: var(--s3); color: var(--s3); }

  .places { display: grid; gap: 0.5rem; }
  .place { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .plabel {
    color: var(--muted); font-size: 0.75rem;
    min-width: 1.5rem; text-align: right;
  }

  .two { display: grid; gap: 1.4rem 2rem; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); }
  .half { min-width: 0; }

  .bounds {
    display: grid; gap: 0.6rem 1.4rem;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  }
  .crit { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  .clabel { display: flex; flex-direction: column; font-size: 0.8125rem; }
  .cg { color: var(--muted); font-size: 0.6875rem; }
  .pair { display: inline-flex; align-items: center; gap: 0.25rem; }
  .pair i { color: var(--muted); font-style: normal; }
  .pair select { max-width: 7.5rem; }

  .run { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .go { border-color: var(--gold); color: var(--gold); padding: 0.45rem 1.4rem; font-size: 0.9375rem; }
  .go:disabled { border-color: var(--line); color: var(--muted); cursor: default; }
  .run .dim { font-size: 0.75rem; }

  .counts {
    display: grid; gap: 1rem; margin-bottom: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }
  .cell { display: grid; gap: 0.1rem; }
  .cell .label { color: var(--muted); font-size: 0.75rem; }
  .cell .figure { font-family: var(--figure); font-size: 1.25rem; }
  .cell .dim { font-size: 0.75rem; }

  table.mx { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  table.mx th, table.mx td { padding: 0.3rem 0.5rem; text-align: left; white-space: nowrap; }
  table.mx th {
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  table.mx td { border-bottom: 1px solid var(--line-soft); }
  table.mx th.v, table.mx td.val { text-align: right; font-family: var(--figure); }
  .digits { font-family: var(--figure); }
  .digits .d { display: inline-block; min-width: 1.1rem; text-align: center; }
  .rank { color: var(--gold-deep); font-weight: 600; }

  .acts { white-space: nowrap; }
  .acts button { font-size: 0.6875rem; padding: 0.15rem 0.4rem; margin-left: 0.2rem; }

  .saveline {
    display: flex; gap: 0.4rem; flex-wrap: wrap;
    align-items: center; margin-bottom: 0.9rem;
  }
  .name { min-width: 12rem; }

  .notice {
    margin: 0; padding: 0.7rem 0 0.7rem 0.9rem;
    border-left: 2px solid var(--gold);
    font-size: 0.8125rem; line-height: 1.7; color: var(--ink-soft);
  }
  .notice.tight { margin-bottom: 0.9rem; }
  .notice strong { color: var(--ink); font-weight: 600; }
  .warn { color: var(--s3); font-size: 0.8125rem; margin: 0 0 0.8rem; }
  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.7; }
  .note strong { color: var(--ink); font-weight: 600; }
  .tall { max-height: 30rem; overflow-y: auto; }
  .more { display: block; margin: 0.8rem auto 0; font-size: 0.8125rem; }
</style>
