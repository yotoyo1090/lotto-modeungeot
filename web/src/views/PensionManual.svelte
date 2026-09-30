<script>
  // 수동조합, côté 연금복권 — les billets qu'on a réellement achetés.
  //
  // C'est l'écran qui a le plus de sens sur ce produit, et c'est le seul des
  // trois qui corresponde à ce qu'on fait vraiment : on ne compose pas un
  // billet, on en achète un déjà imprimé. Le noter permet ensuite de savoir
  // ce qu'il a donné — jusqu'au 7등, qui tombe une fois sur onze.
  //
  // Un billet, c'est un 조 (1 à 5) et six chiffres. Rien d'autre : pas de
  // doublons interdits, pas d'ordre à respecter — 0 est un chiffre comme un
  // autre et 000000 est un billet valable.
  import { DIGITS, GROUPS, describeTicket } from '@core/pension.js'
  import { PENSION_RANKS, scoreTicket } from '@core/combos.js'

  import { pensionGrids as store } from '../lib/store.js'
  import { num, rang as fmt, won as money } from '../lib/format.js'

  let { pension } = $props()

  const last = $derived(pension.rangs[pension.n - 1])
  let rang = $state(null)
  const target = $derived(rang ?? last + 1)

  // Le tirage visé, s'il a déjà eu lieu — c'est lui qui note les billets.
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

  const previous = $derived.by(() => {
    for (let k = 0; k < pension.n; k++) {
      if (pension.rangs[k] === target - 1) return [...pension.digitsAt(k)]
    }
    return null
  })

  // --- la saisie ---------------------------------------------------------

  const blank = () => ({ group: 1, digits: Array(DIGITS).fill('') })
  let lines = $state([blank()])

  /** Une ligne devient un billet dès que ses six chiffres sont posés. */
  const readLine = (line) => {
    const digits = line.digits.map((d) => (d === '' ? null : Number(d)))
    const full = digits.every((d) => Number.isInteger(d) && d >= 0 && d <= 9)
    return full ? { group: Number(line.group), digits } : null
  }

  const ready = $derived(lines.map(readLine).filter(Boolean))

  // Une ligne vide reste toujours en bas : c'est ce que faisait l'ancien
  // formulaire du 6/45, et c'est ce qui évite de cliquer « ajouter ».
  $effect(() => {
    const lastLine = lines[lines.length - 1]
    if (lastLine && lastLine.digits.some((d) => d !== '')) {
      lines = [...lines, blank()]
    }
  })

  function setDigit(row, k, value) {
    // On ne garde que le dernier chiffre tapé : taper « 12 » dans une case
    // laisse « 2 », ce qui est ce qu'on veut d'une case à un chiffre.
    const clean = String(value).replace(/\D/g, '').slice(-1)
    lines = lines.map((l, i) => (i === row
      ? { ...l, digits: l.digits.map((d, j) => (j === k ? clean : d)) } : l))
  }

  function setGroup(row, value) {
    lines = lines.map((l, i) => (i === row ? { ...l, group: Number(value) } : l))
  }

  function removeLine(row) {
    const next = lines.filter((_, i) => i !== row)
    lines = next.length ? next : [blank()]
  }

  function clearAll() { lines = [blank()] }

  /** Six chiffres au hasard — pour partir de quelque chose. */
  function fill(row) {
    const digits = Array.from({ length: DIGITS },
      () => String(Math.floor(Math.random() * 10)))
    const group = 1 + Math.floor(Math.random() * GROUPS.length)
    lines = lines.map((l, i) => (i === row ? { group, digits } : l))
  }

  // --- ce que chaque billet donne ---------------------------------------

  const rows = $derived(ready.map((t) => ({
    ticket: t,
    row: describeTicket(t.digits, { group: t.group, reference: previous }),
    score: scoreTicket(t, draw),
  })))

  const paid = $derived(rows.reduce((a, r) => a + (r.score?.rank?.prize ?? 0), 0))

  // --- le carnet ---------------------------------------------------------

  const canStore = store.available()
  let saved = $state(store.load())
  let name = $state('')
  let notice = $state(null)

  function doSave() {
    if (!ready.length) return
    const entry = store.save({
      name,
      rang: target,
      source: 'manual',
      tickets: ready.map((t) => ({ group: t.group, digits: [...t.digits] })),
    })
    if (!entry) { notice = '브라우저가 저장을 거부했습니다.'; return }
    saved = store.load()
    name = ''
    notice = `${entry.name} — ${entry.tickets.length}장을 저장했습니다.`
  }

  function reopen(entry) {
    lines = entry.tickets.map((t) => ({
      group: t.group, digits: t.digits.map(String),
    }))
    lines = [...lines, blank()]
    rang = entry.rang <= last ? entry.rang : null
    notice = `${entry.name} 를 불러왔습니다.`
  }

  function drop(id) {
    store.remove(id)
    saved = store.load()
  }

  function exportFile() {
    const url = URL.createObjectURL(
      new Blob([store.toFile()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'pension-수동조합.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(event) {
    // `currentTarget` ne vaut que pendant la propagation : on garde l'élément
    // avant d'attendre, et on le remet à zéro pour que le même fichier
    // choisi deux fois émette bien un second `change`.
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
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>수동조합</h2>
    <span class="gloss">산 표를 적어 두면, 결과를 알려줍니다</span>
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

{#if draw}
  <section class="panel">
    <div class="head">
      <h2>{fmt(target)} 당첨번호</h2>
      <span class="gloss">이 표들을 여기에 맞춰 봅니다</span>
    </div>
    <div class="drawline">
      <span class="lead">조</span><b class="gv">{draw.group}</b>
      <span class="lead">당첨번호</span>
      <span class="row">{#each draw.digits as d, k (k)}<span class="d">{d}</span>{/each}</span>
      <span class="lead">보너스</span>
      <span class="row">{#each draw.bonus as d, k (k)}<span class="d bo">{d}</span>{/each}</span>
    </div>
  </section>
{/if}

<section class="panel">
  <div class="head">
    <h2>표 입력</h2>
    <span class="gloss">조 하나와 여섯 자리 · 0도 숫자입니다</span>
    <span class="right">{num(ready.length)}장</span>
  </div>

  <div class="scroll">
    <table class="entry">
      <thead>
        <tr>
          <th>#</th><th>조</th>
          <th colspan={DIGITS}>번호</th>
          <th>총합</th><th>AC값</th><th>저고</th><th>홀짝</th>
          <th>서로 다른</th><th>이월</th>
          {#if draw}<th>결과</th>{/if}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each lines as line, i (i)}
          {@const built = readLine(line)}
          {@const info = built
            ? describeTicket(built.digits, { reference: previous }) : null}
          {@const score = built ? scoreTicket(built, draw) : null}
          <tr>
            <td class="dim">{i + 1}</td>
            <td>
              <select value={line.group} onchange={(e) => setGroup(i, e.currentTarget.value)}>
                {#each GROUPS as g (g)}<option value={g}>{g}</option>{/each}
              </select>
            </td>
            {#each line.digits as d, k (k)}
              <td class="cell">
                <input inputmode="numeric" value={d}
                       onfocus={(e) => e.currentTarget.select()}
                       oninput={(e) => setDigit(i, k, e.currentTarget.value)} />
              </td>
            {/each}
            <td class="val">{info?.total ?? ''}</td>
            <td class="val">{info?.ac ?? ''}</td>
            <td class="val">{info?.lowLabel ?? ''}</td>
            <td class="val">{info?.oddLabel ?? ''}</td>
            <td class="val">{info?.distinct ?? ''}</td>
            <td class="val">{info ? info.carried.length : ''}</td>
            {#if draw}
              <td class="val">
                {#if score?.rank}
                  <b class="rank">{score.rank.label}</b>
                {:else if score}
                  <span class="dim">꽝</span>
                {/if}
              </td>
            {/if}
            <td class="acts">
              <button onclick={() => fill(i)} title="아무 번호나">↻</button>
              <button onclick={() => removeLine(i)}>×</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="acts-bar">
    <button onclick={clearAll} disabled={!ready.length}>전부 지우기</button>
    {#if draw && ready.length}
      <span class="dim">
        {num(rows.filter((r) => r.score?.rank).length)}장 당첨 · {money(paid)}
      </span>
    {:else if !draw}
      <span class="dim">{fmt(target)}는 아직 추첨 전입니다 — 결과는 추첨 후에 채워집니다.</span>
    {/if}
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>저장</h2>
    <span class="gloss">이 브라우저에만 저장됩니다</span>
    {#if saved.length}<span class="right">{num(saved.length)}건 보관 중</span>{/if}
  </div>

  {#if !canStore}
    <p class="warn">
      이 브라우저에서는 저장이 되지 않습니다 (시크릿 모드이거나 저장이 차단됨).
      아래 내보내기로 파일에 남겨 두세요.
    </p>
  {/if}

  <div class="saveline">
    <input class="name" type="text" placeholder="이름 (비워도 됩니다)" bind:value={name} />
    <button onclick={doSave} disabled={!ready.length}>{num(ready.length)}장 저장</button>
    <button onclick={exportFile} disabled={!saved.length}>파일로 내보내기</button>
    <label class="import">
      파일에서 가져오기
      <input type="file" accept="application/json" onchange={importFile} />
    </label>
  </div>

  {#if notice}<p class="notice">{notice}</p>{/if}

  {#if saved.length}
    <div class="scroll">
      <table class="mx">
        <thead>
          <tr><th>이름</th><th>회차</th><th class="v">표</th><th>저장 시각</th><th></th></tr>
        </thead>
        <tbody>
          {#each saved as entry (entry.id)}
            <tr>
              <td>{entry.name}</td>
              <td>{fmt(entry.rang)}</td>
              <td class="val">{num(entry.tickets?.length ?? 0)}</td>
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

  <p class="note dim">
    저장한 표는 <strong>조합결과</strong> 탭에 모입니다 — 거기서 등수와
    당첨금까지 볼 수 있습니다. 저장은 이 브라우저 안에만 남습니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>등수표</h2>
    <span class="gloss">이 제품은 뒷자리만 맞아도 됩니다</span>
  </div>
  <div class="scroll">
    <table class="mx">
      <thead>
        <tr><th>등수</th><th>조건</th><th class="v">확률</th><th class="v">상금</th></tr>
      </thead>
      <tbody>
        {#each PENSION_RANKS as r (r.key)}
          <tr>
            <td><b class="rank">{r.label}</b></td>
            <td>{r.match}</td>
            <td class="val">1 / {num(r.odds)}</td>
            <td class="val">
              {money(r.prize)}{#if r.annuity}<span class="tiny">연금</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
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
  .pick .label { color: var(--muted); font-size: 0.75rem; }

  .drawline { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .lead { color: var(--muted); font-size: 0.75rem; margin-left: 0.6rem; }
  .lead:first-child { margin-left: 0; }
  .gv { font-family: var(--figure); font-size: 1.25rem; color: var(--gold-deep); }
  .row { display: inline-flex; gap: 0.3rem; }
  .d { font-family: var(--figure); font-size: 1.1rem; }
  .d.bo { color: var(--t-dead-text); }

  table { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  th, td { padding: 0.3rem 0.45rem; text-align: left; white-space: nowrap; }
  th {
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  td { border-bottom: 1px solid var(--line-soft); }
  th.v, td.val { text-align: right; font-family: var(--figure); }

  table.entry input {
    width: 2rem; text-align: center; font-family: var(--figure);
    padding: 0.15rem 0.1rem;
  }
  table.entry select { padding: 0.15rem 0.25rem; }
  .cell { padding: 0.15rem 0.1rem; }

  .rank { color: var(--gold-deep); font-weight: 600; }
  .tiny { font-size: 0.6875rem; color: var(--muted); margin-left: 0.3rem; }

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
    font-size: 0.875rem; border: 1px solid var(--line);
    border-radius: var(--radius); padding: 0.3rem 0.75rem; cursor: pointer;
  }
  .import:hover { border-color: var(--gold-bright); }
  .import input { display: none; }

  .notice { margin: 0.7rem 0 0; font-size: 0.8125rem; color: var(--gold); }
  .warn { color: var(--s3); font-size: 0.8125rem; margin: 0 0 0.8rem; }
  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.7; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
