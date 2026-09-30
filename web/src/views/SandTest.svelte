<script>
  // 사(沙) 검정 — le rapport, mais vivant.
  //
  // Le fichier rapport.html portait des chiffres figés au 1239회차. Ici tout
  // se recalcule depuis `draws` : un tirage de plus et chaque colonne bouge,
  // chaque courbe s'allonge d'un point. C'est la raison d'être de l'écran.
  //
  // Le spectre de couleur d'une ligne est sa distribution 0~7개 : sept
  // segments dont la largeur est le nombre de 회차. Cliquer ouvre la modale
  // et son graphe, du premier 회차 mesuré au dernier.
  import {
    sandSeries, sandExpectedAtLeast, sandKillValue, sandWindow, sandNoise, sandNext, KILL_BASE,
  } from '../../../src/core/sand.js'
  import { crossReport } from '../../../src/core/cross.js'

  const WINDOWS = [100, 200, 300, 500]
  const choose = (n, k) => {
    if (k < 0 || k > n) return 0
    let out = 1
    for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1)
    return out
  }
  const SPACE = choose(45, 6)

  let { draws } = $props()

  const FROM = 401
  let open = $state(null)
  // Le croisement coûte une seconde ou deux : on ne le lance qu'à la demande,
  // sinon le tableau principal attendrait pour rien.
  let cross = $state(null)
  let working = $state(false)

  function runCross() {
    working = true
    setTimeout(() => {
      cross = crossReport(draws, { from: FROM })
      working = false
    }, 20)
  }

  const rows = $derived(sandSeries(draws, { from: FROM }))
  const byWindow = $derived([...rows]
    .map((r) => ({ row: r, cells: [...WINDOWS.map((w) => sandWindow(r, w)), sandWindow(r)] }))
    .sort((a, b) => b.cells[0].ratio - a.cells[0].ratio))
  const byKill = $derived([...rows]
    .map((r) => ({ row: r, kill: sandKillValue(r) }))
    .sort((a, b) => (a.row.oracle === b.row.oracle
      ? b.kill.value - a.kill.value
      : a.row.oracle ? 1 : -1)))
  const noise = $derived([...WINDOWS, rows[0]?.used ?? 0].map((w) => sandNoise(w)))
  const next = $derived(sandNext(draws))
  // Le total des dix derniers — un `{@const}` ne peut vivre que sous un bloc,
  // pas sous un <tbody>, alors il se calcule ici.
  const tenSum = $derived((cross?.eliminate.at(-1).detail ?? [])
    .reduce((a, d) => ({ size: a.size + d.size, hit: a.hit + d.hit }), { size: 0, hit: 0 }))
  const last = $derived(draws.rangs[draws.n - 1])
  const ceiling = $derived(ceilingFor(rows.length))

  // Le plafond du bruit : en mesurant K choses, le plus grand |z| qu'on
  // obtient **sans qu'il se passe rien** vaut à peu près ceci.
  function ceilingFor(k) {
    if (k < 2) return 2
    const l = Math.sqrt(2 * Math.log(k))
    return l - (Math.log(Math.log(k)) + Math.log(4 * Math.PI)) / (2 * l)
  }

  const HITS = ['#cfd6db', '#b9c6cf', '#9fb6c4', '#d8b96a', '#c99a33', '#b4432f', '#8a2f20', '#5c1d14']
  const one = (v) => v.toFixed(3)
  const pct = (v) => `${(v * 100).toFixed(1)} %`
</script>

<div class="wrap">
  <header>
    <h2>사(沙) 검정</h2>
    <p>
      열한 화면이 만드는 <strong>{rows.length}개의 사</strong>를
      {FROM}~{last}회차, <strong>{rows[0]?.used ?? 0}회차</strong>에 걸쳐 다시 잰 것.
      <em>회차가 늘면 이 표는 저절로 바뀝니다.</em>
    </p>
  </header>

  <div class="cards">
    <div class="card hero">
      <span class="v">{pct(7 / 45)}</span>
      <span class="k">어떤 사를 만들어도, 그 안의 당첨번호 비율</span>
    </div>
    <div class="card">
      <span class="v">{KILL_BASE.toFixed(2)}</span>
      <span class="k">꽝 하나를 지우는 값 — 38 ÷ 7</span>
    </div>
    <div class="card">
      <span class="v">{ceiling.toFixed(2)}</span>
      <span class="k">{rows.length}개를 재면 저절로 나오는 |z| 최댓값</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>사<span class="unit">크기 순 · 줄을 누르면 그래프</span></th>
        <th class="n">회차당 크기<span class="unit">평균 (최소~최대)</span></th>
        <th class="n">회차당 적중<span class="unit">평균 (최소~최대)</span></th>
        <th class="n">기대<span class="unit">7 × 크기 / 45</span></th>
        <th class="n">비율<span class="unit">관측 ÷ 기대</span></th>
        <th class="n">z</th>
        <th>담은 개수별 회차<span class="unit">0개 ▸ 7개, 색이 진할수록 많이 담음</span></th>
        <th class="n">3개 이상<span class="unit">관측 / 확률법</span></th>
        <th class="n">꽝/당첨<span class="unit">이 사를 버리면</span></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.key)}
        {@const kill = sandKillValue(row)}
        <tr class:oracle={row.oracle} class:witness={row.witness} class:comp={row.complement}
            onclick={() => (open = row)}>
          <td class="name">{row.label}<span class="src">{row.screen}</span></td>
          <td class="n">{row.size.toFixed(1)} <span class="sub">({row.sizeMin}~{row.sizeMax})</span></td>
          <td class="n">{row.mean.toFixed(3)} <span class="sub">({row.hitMin}~{row.hitMax})</span></td>
          <td class="n sub">{row.expectedMean.toFixed(3)}</td>
          <td class="n big">{one(row.ratio)}</td>
          <td class="n" class:loud={Math.abs(row.z) > ceiling}>{row.z.toFixed(2)}</td>
          <td>
            <div class="spectrum" title="0개 → 7개">
              {#each row.spread as count, hit}
                {#if count}
                  <i style="flex:{count};background:{HITS[hit]}" title="{hit}개 — {count}회차"></i>
                {/if}
              {/each}
            </div>
          </td>
          <td class="n">{row.three} <span class="sub">/ {sandExpectedAtLeast(row, 3).toFixed(0)}</span></td>
          <td class="n" class:loud={Math.abs(kill.value - KILL_BASE) > 1}>{kill.value.toFixed(2)}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <p class="foot">
    막대의 일곱 칸은 <strong>담은 개수</strong>입니다 — 왼쪽이 0개, 오른쪽이 7개.
    큰 사일수록 색이 오른쪽으로 몰립니다. 그것은 재주가 아니라 크기입니다.
    <strong>줄끼리 비교할 수 있는 것은 «비율»뿐입니다.</strong>
  </p>

  <h3>제외의 값 — 꽝 하나를 지우는 데 당첨 몇 개를 버리나</h3>
  <p class="lead">
    어떤 사를 버리면 그 안에는 꽝번호도 당첨번호도 들어 있습니다.
    <strong>버린 꽝 ÷ 잃은 당첨</strong> — 높을수록 좋습니다. 값 순으로 정렬했습니다.
  </p>
  <table class="mini">
    <thead><tr>
      <th>제외한 사</th><th class="n">제외 개수</th><th class="n">잃은 당첨</th>
      <th class="n">없앤 꽝</th><th class="n">꽝 / 당첨<span class="unit">기준 {KILL_BASE.toFixed(2)}</span></th>
    </tr></thead>
    <tbody>
      {#each byKill as { row, kill } (row.key)}
        <tr class:oracle={row.oracle} class:witness={row.witness} class:comp={row.complement}>
          <td class="name">{row.label}</td>
          <td class="n">{kill.removed.toFixed(1)}</td>
          <td class="n">{kill.lostWinners.toFixed(2)}</td>
          <td class="n">{kill.removedLosers.toFixed(2)}</td>
          <td class="n big" class:loud={Math.abs(kill.value - KILL_BASE) > 1}>{kill.value.toFixed(2)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="foot">
    정직한 {byKill.filter((k) => !k.row.oracle).length}줄이
    <strong>{Math.min(...byKill.filter((k) => !k.row.oracle).map((k) => k.kill.value)).toFixed(2)}</strong>에서
    <strong>{Math.max(...byKill.filter((k) => !k.row.oracle).map((k) => k.kill.value)).toFixed(2)}</strong> 사이에
    전부 들어 있습니다. 제외 개수는 스무 배 차이가 나는데 값은 같습니다 — 화면의
    성질이 아니라 나눗셈이기 때문입니다 : <strong>꽝 38 ÷ 당첨 7 = {KILL_BASE.toFixed(2)}</strong>.
    대조군은 {byKill.filter((k) => !k.row.oracle).findIndex((k) => k.row.witness) + 1}위입니다.
  </p>

  <h3>최근 회차만 보면 달라지는가</h3>
  <p class="lead">
    같은 {rows.length}개 사를 다섯 개의 창으로 다시 쟀습니다. 최근100 비율 순.
  </p>
  <table class="mini">
    <thead><tr>
      <th>사</th>
      {#each WINDOWS as w}<th class="n">최근{w}</th><th class="n">z</th>{/each}
      <th class="n">전체{rows[0]?.used ?? 0}</th><th class="n">z</th>
    </tr></thead>
    <tbody>
      {#each byWindow as { row, cells } (row.key)}
        <tr class:oracle={row.oracle} class:witness={row.witness} class:comp={row.complement}>
          <td class="name">{row.label}</td>
          {#each cells as c}
            <td class="n">{c.ratio.toFixed(3)}</td>
            <td class="n" class:loud={Math.abs(c.z) > 2}>{c.z.toFixed(1)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <h4>짧은 창의 함정</h4>
  <table class="mini">
    <thead><tr><th class="n">창</th><th class="n">±잡음 (사 20개 기준)</th><th class="n">z = 2 가 되려면</th></tr></thead>
    <tbody>
      {#each noise as n}
        <tr><td class="n">최근 {n.count}회차</td>
          <td class="n">±{(n.noise * 100).toFixed(1)} %</td>
          <td class="n big">비율 {n.needed.toFixed(3)}</td></tr>
      {/each}
    </tbody>
  </table>
  <p class="foot">
    <strong>창이 짧을수록 숫자는 화려해지고, 뜻하는 바는 줄어듭니다.</strong>
    대조군 줄을 보세요 — 아무 화면도 읽지 않는 무작위 사가 창을 바꾸며 «좋아지거나
    나빠집니다». 성질이 바뀐 게 아니라 잡음이 가라앉을 뿐입니다.
  </p>

  <h3>교차 검정 — 사끼리 겹치면 달라지는가</h3>
  <p class="lead">
    여기까지는 사를 하나씩 쟀습니다. 아홉 개를 겹쳐 <strong>중복도 · 129가지 교차 ·
    번호의 성격</strong>을 재고, 마지막에 <strong>전반에서 배운 규칙으로 후반을
    제외</strong>해 봅니다. 계산에 1~2초 걸립니다.
  </p>
  {#if !cross}
    <button class="run" onclick={runCross} disabled={working}>
      {working ? '계산 중…' : '교차 검정 계산하기'}
    </button>
  {:else}
    <h4>① 중복도 — 여러 사에 동시에 든 번호</h4>
    <table class="mini">
      <thead><tr>
        <th class="n">들어 있는 사</th><th class="n">칸 수</th><th class="n">그중 당첨</th>
        <th class="n">당첨률</th><th class="n">비율</th><th class="n">z</th>
      </tr></thead>
      <tbody>
        {#each cross.overlap as o}
          <tr>
            <td class="n">{o.degree}개</td>
            <td class="n">{o.cells.toLocaleString()}</td>
            <td class="n">{o.hit.toLocaleString()}</td>
            <td class="n">{(o.rate * 100).toFixed(2)} %</td>
            <td class="n big">{o.ratio.toFixed(3)}</td>
            <td class="n">{o.z.toFixed(2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="foot">기준 7 ÷ 45 = <strong>{((7 / 45) * 100).toFixed(2)} %</strong>. 겹칠수록 오르지도 내리지도 않습니다.</p>

    <h4>② {cross.cross.length}가지 교차 — 단일 · 쌍 · 삼중</h4>
    <table class="mini">
      <thead><tr><th>교차</th><th class="n">차수</th><th class="n">평균 크기</th><th class="n">비율</th><th class="n">z</th></tr></thead>
      <tbody>
        {#each [...cross.cross.slice(0, 3), null, ...cross.cross.slice(-3)] as c}
          {#if c}
            <tr><td>{c.label}</td><td class="n">{c.degree}</td><td class="n">{c.size.toFixed(1)}</td>
              <td class="n big">{c.ratio.toFixed(3)}</td>
              <td class="n" class:loud={Math.abs(c.z) > cross.crossCeiling}>{c.z.toFixed(2)}</td></tr>
          {:else}
            <tr><td colspan="5" class="sub">…</td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <p class="foot">
      |z| 최대 <strong>{Math.max(...cross.cross.map((c) => Math.abs(c.z))).toFixed(2)}</strong> ·
      {cross.cross.length}가지를 재면 저절로 나오는 최댓값 <strong>{cross.crossCeiling.toFixed(2)}</strong> ·
      한계를 넘은 교차 <strong>{cross.cross.filter((c) => Math.abs(c.z) > cross.crossCeiling).length}가지</strong>.
    </p>

    <h4>③ 성격 — 당첨번호와 같은 캐릭터를 가진 번호는 몇 개인가</h4>
    <div class="cards">
      <div class="card"><span class="v">{cross.winnerGroupMean.toFixed(2)}개</span><span class="k">당첨번호와 같은 성격을 가진 번호 수</span></div>
      <div class="card"><span class="v">{cross.groupMean.toFixed(2)}개</span><span class="k">아무 번호나 골랐을 때의 무리 크기</span></div>
      <div class="card"><span class="v">{cross.signCount}가지</span><span class="k">실제로 나타난 성격 (512 중)</span></div>
    </div>
    <table class="mini">
      <thead><tr><th>성격</th><th class="n">칸수</th><th class="n">당첨</th><th class="n">당첨률</th><th class="n">비율</th><th class="n">z</th></tr></thead>
      <tbody>
        {#each [...cross.signatures.slice(0, 2), null, ...cross.signatures.slice(-2)] as s}
          {#if s}
            <tr><td>{s.name}</td><td class="n">{s.cells}</td><td class="n">{s.hit}</td>
              <td class="n">{(s.rate * 100).toFixed(2)} %</td>
              <td class="n big">{s.ratio.toFixed(3)}</td>
              <td class="n" class:loud={Math.abs(s.z) > cross.signCeiling}>{s.z.toFixed(2)}</td></tr>
          {:else}
            <tr><td colspan="6" class="sub">…</td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <p class="foot">
      200칸 이상인 <strong>{cross.signatures.length}가지</strong> · 자연 한계 |z| =
      <strong>{cross.signCeiling.toFixed(2)}</strong>.
    </p>

    {#if cross.halves}
      <h4>④ 가장 높은 성격을 반으로 잘라보면</h4>
      <p class="lead"><code>{cross.best.name}</code></p>
      <table class="mini">
        <thead><tr><th>구간</th><th class="n">칸수</th><th class="n">당첨</th><th class="n">당첨률</th><th class="n">비율</th><th class="n">z</th></tr></thead>
        <tbody>
          {#each cross.halves as h}
            <tr><td>{h.label}</td><td class="n">{h.cells}</td><td class="n">{h.hit}</td>
              <td class="n">{(h.rate * 100).toFixed(2)} %</td>
              <td class="n big">{h.ratio.toFixed(3)}</td><td class="n">{h.z.toFixed(2)}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <h4>⑤ 진짜 시험 — 전반에서 배워 후반에 제외</h4>
    <p class="lead">
      {cross.from}~{cross.midRang}회차에서만 성격별 당첨률을 배우고, 비율이 1 미만인
      성격 <strong>{cross.badCount}가지</strong>를 «나쁜 성격»으로 정한 뒤 그것으로 제외합니다.
    </p>
    <table class="mini">
      <thead><tr>
        <th>구간</th><th class="n">회차</th><th class="n">제외</th><th class="n">잃은 당첨</th>
        <th class="n">없앤 꽝</th><th class="n">꽝 / 당첨</th>
        <th class="n">같은 크기 무작위</th><th class="n">당첨 0개</th>
      </tr></thead>
      <tbody>
        {#each cross.eliminate as e}
          <tr class:witness={e.label.startsWith('후반')}>
            <td>{e.label}</td><td class="n">{e.used}</td>
            <td class="n">{e.removed.toFixed(1)}개</td>
            <td class="n">{e.lost.toFixed(2)}</td>
            <td class="n">{e.losers.toFixed(2)}</td>
            <td class="n big">{e.value.toFixed(2)}</td>
            <td class="n sub">{e.witnessValue.toFixed(2)}</td>
            <td class="n">{(e.cleanRate * 100).toFixed(1)} %</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="foot">
      기준은 <strong>{KILL_BASE.toFixed(2)}</strong> (꽝 38 ÷ 당첨 7). 규칙을 고른 반쪽에서
      넘고, 처음 보는 반쪽에서 기준으로 돌아오면 — 그 이득은 지식이 아니라 암기였습니다.
    </p>

    <h4>⑥ 최근 10회차, 회차별</h4>
    <table class="mini">
      <thead><tr><th class="n">회차</th><th class="n">제외</th><th class="n">그중 당첨</th><th class="n">없앤 꽝</th><th>버린 당첨번호</th></tr></thead>
      <tbody>
        {#each cross.eliminate.at(-1).detail as d}
          <tr><td class="n">{d.rang}</td><td class="n">{d.size}</td><td class="n">{d.hit}</td>
            <td class="n">{d.size - d.hit}</td>
            <td class="nums">{d.lost.length ? d.lost.join(' ') : '없음'}</td></tr>
        {/each}
        <tr class="witness">
          <td class="n">합계</td><td class="n">{tenSum.size}</td><td class="n">{tenSum.hit}</td>
          <td class="n">{tenSum.size - tenSum.hit}</td>
          <td><strong>꽝/당첨 = {((tenSum.size - tenSum.hit) / tenSum.hit).toFixed(2)}</strong>
            <span class="sub">· 기준 {KILL_BASE.toFixed(2)} · 419회차로 재면 {cross.eliminate[1].value.toFixed(2)}</span></td>
        </tr>
      </tbody>
    </table>
    <p class="foot">
      10회차만 보면 값이 크게 튑니다. 잃은 당첨번호가 서른 개 남짓일 때 이 숫자는
      5.4에서 7.0 사이를 아무렇지 않게 오갑니다 — <strong>«최근 10회차에서 잘 됐다»는
      문장은 아무것도 말해주지 않습니다.</strong> 그리고 오른쪽 열 : 열 회차 전부에서
      최소 한 개의 당첨번호를 버렸습니다.
    </p>

    <h4>⑦ {cross.nextRang}회에 이 규칙을 적용하면</h4>
    <div class="note">
      <strong>제외 {cross.killed.length}개</strong>
      <div class="nums">{cross.killed.join(' ')}</div>
      <br>
      <strong>남는 풀 {cross.kept.length}개</strong>
      <div class="nums">{cross.kept.join(' ')}</div>
    </div>

    <h4>오늘 잰 것 전부</h4>
    <table class="mini">
      <thead><tr><th>무엇을</th><th class="n">규모</th><th>결과</th></tr></thead>
      <tbody>
        <tr><td>화면별 사와 그 여집합</td><td class="n">{rows.length}가지</td>
          <td>{Math.min(...rows.filter((r) => !r.oracle).map((r) => r.ratio)).toFixed(3)} ~
              {Math.max(...rows.filter((r) => !r.oracle).map((r) => r.ratio)).toFixed(3)} ·
              |z| 최대 {Math.max(...rows.filter((r) => !r.oracle).map((r) => Math.abs(r.z))).toFixed(2)}
              (한계 {ceiling.toFixed(2)})</td></tr>
        <tr><td>사 × 최근 창 5개</td><td class="n">{rows.length * 5}칸</td>
          <td>2를 넘은 칸 <strong>{byWindow.reduce((a, b) => a + b.cells.filter((c) => Math.abs(c.z) > 2).length, 0)}개</strong></td></tr>
        <tr><td>중복도</td><td class="n">{(cross.used * 45).toLocaleString()}칸</td>
          <td>{Math.min(...cross.overlap.map((o) => o.ratio)).toFixed(3)} ~
              {Math.max(...cross.overlap.map((o) => o.ratio)).toFixed(3)} · 방향 없음</td></tr>
        <tr><td>사끼리 교차 (단일·쌍·삼중)</td><td class="n">{cross.cross.length}가지</td>
          <td>|z| 최대 {Math.max(...cross.cross.map((c) => Math.abs(c.z))).toFixed(2)}
              (한계 {cross.crossCeiling.toFixed(2)}) · 넘은 것
              <strong>{cross.cross.filter((c) => Math.abs(c.z) > cross.crossCeiling).length}가지</strong></td></tr>
        <tr><td>번호의 «성격»</td><td class="n">{cross.signatures.length}가지</td>
          <td>|z| 최대 {Math.abs(cross.signatures[0].z).toFixed(2)} (한계 {cross.signCeiling.toFixed(2)})
              {#if cross.halves}· 전반 {cross.halves[0].ratio.toFixed(3)} / 후반 {cross.halves[1].ratio.toFixed(3)}{/if}</td></tr>
        <tr class="witness"><td>성격으로 제외 — 전반에서 배워 후반에</td><td class="n">{cross.badCount}가지</td>
          <td>꽝/당첨 {cross.eliminate[0].value.toFixed(2)} →
              <strong>{cross.eliminate[1].value.toFixed(2)}</strong> ·
              무작위는 {cross.eliminate[1].witnessValue.toFixed(2)} · 기준 {KILL_BASE.toFixed(2)}</td></tr>
      </tbody>
    </table>
    <p class="foot">
      매번 <strong>대조군</strong>(아무 정보도 쓰지 않는 무작위)을 함께 넣었습니다.
      매번 한가운데나 그 위에 자리 잡았습니다.
      <br><br>
      이 표는 <em>이 화면이 방금 계산한 것</em>만 담습니다. 같은 결론에 이른 다른
      측정은 각자의 화면에 있습니다 — 앱의 방법 167가지와 그 21,304가지 교차는
      <strong>팁 › 전체 검정</strong>, 고정수 2개는 <strong>팁 › 고정수</strong>,
      휠의 보장은 <strong>팁 › 휠</strong>. 휠은 조합 계산이라 그때그때 다시 계산되지만,
      전체 검정과 고정수의 백테스트 숫자는 한 번 돌린 결과를 그대로 적은 것입니다.
    </p>
  {/if}

  <h3>사를 좁혀도 소용없는 이유 — 산수 한 줄</h3>
  <table class="mini">
    <thead><tr>
      <th class="n">T</th><th class="n">조합 C(T,6)</th><th class="n">전부 사면</th>
      <th class="n">6개가 안에 들 확률</th><th class="n">1등 1회당 비용</th>
    </tr></thead>
    <tbody>
      {#each [45, 20, 14, 9, 6] as t}
        {@const combos = choose(t, 6)}
        <tr>
          <td class="n">{t}</td>
          <td class="n">{combos.toLocaleString()}</td>
          <td class="n">{(combos * 1000).toLocaleString()}원</td>
          <td class="n">1 / {Math.round(SPACE / combos).toLocaleString()}</td>
          <td class="n big">{(SPACE / 1e8).toFixed(1)}억</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="foot">
    <strong>마지막 열이 모든 줄에서 같습니다.</strong> 사를 좁히면 비용이 줄지만,
    확률이 <em>정확히 같은 비율로</em> 줄어듭니다.
  </p>

  <h3>{next.rang}회를 위한 각 화면의 사</h3>
  <table class="mini">
    <thead><tr><th>화면</th><th>사</th><th class="n">개수</th><th>번호</th></tr></thead>
    <tbody>
      {#each next.bags as bag (bag.key)}
        <tr class:witness={bag.witness}>
          <td class="sub">{bag.screen}</td>
          <td>{bag.label}</td>
          <td class="n">{bag.numbers.length}</td>
          <td class="nums">{bag.numbers.join(' ')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="foot">
    번호를 내놓지 않는 화면 : <strong>필터</strong> (총합·AC값 같은 «값»만 냄) ·
    <strong>패밀리</strong> (평균만 돌려줌) · <strong>패턴</strong> (마지막 회차에서는 전부 0).
    <em>당첨 2개 + 채움</em> 두 줄은 당첨번호를 필요로 하므로 여기에 없습니다.
  </p>
</div>

{#if open}
  {@const pts = open.series}
  {@const W = 860}
  {@const H = 190}
  {@const lo = Math.min(0.85, ...pts.slice(20).map((p) => p.ratio))}
  {@const hi = Math.max(1.15, ...pts.slice(20).map((p) => p.ratio))}
  {@const x = (i) => (i / (pts.length - 1)) * W}
  {@const y = (v) => H - ((v - lo) / (hi - lo)) * H}
  <div class="veil" onclick={() => (open = null)} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="presentation">
      <button class="close" onclick={() => (open = null)}>✕</button>
      <h3>{open.label}</h3>
      <p class="sub">
        {open.screen} · 크기 {open.size.toFixed(1)}개 ({open.sizeMin}~{open.sizeMax}) ·
        {open.used}회차 · 총 적중 {open.total}개
      </p>

      <div class="chart">
        <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none">
          <!-- La ligne du hasard : 1.00. Tout le graphe se lit par rapport à elle. -->
          <line x1="0" x2={W} y1={y(1)} y2={y(1)} class="par" />
          <!-- Le ratio **cumulé** : il part en tremblant et se pose. -->
          <polyline points={pts.map((p, i) => `${x(i)},${y(p.ratio)}`).join(' ')} class="line" />
        </svg>
        <div class="axis">
          <span>{pts[0]?.rang}회</span>
          <span class="mid">누적 비율 — 1.00 이 우연</span>
          <span>{pts.at(-1)?.rang}회</span>
        </div>
        <div class="ends">
          <span>{hi.toFixed(2)}</span><span>{lo.toFixed(2)}</span>
        </div>
      </div>

      <div class="bars">
        {#each open.spread as count, hit}
          <div class="bar">
            <b style="height:{(count / Math.max(...open.spread)) * 100}%;background:{HITS[hit]}"></b>
            <span class="c">{count || '—'}</span>
            <span class="l">{hit}개</span>
          </div>
        {/each}
      </div>

      <dl class="facts">
        <dt>비율</dt><dd>{one(open.ratio)} — 1.00이면 정확히 우연</dd>
        <dt>z</dt><dd>{open.z.toFixed(2)} · {Math.abs(open.z) > ceiling ? '한계 초과' : `한계 ${ceiling.toFixed(2)} 이내`}</dd>
        <dt>3개 이상</dt><dd>{open.three}회차 · 확률법 {sandExpectedAtLeast(open, 3).toFixed(0)}회차</dd>
        <dt>이 사를 버리면</dt><dd>
          {sandKillValue(open).removedLosers.toFixed(2)}개의 꽝을 지우고
          {sandKillValue(open).lostWinners.toFixed(2)}개의 당첨번호를 잃음 —
          <strong>{sandKillValue(open).value.toFixed(2)}</strong> (기준 {KILL_BASE.toFixed(2)})
        </dd>
        <dt>마지막 회차</dt><dd>{pts.at(-1)?.rang}회 — 크기 {pts.at(-1)?.size}개, 적중 {pts.at(-1)?.hit}개</dd>
      </dl>

      <p class="note">
        곡선은 <strong>누적</strong> 비율입니다. 초반에는 크게 흔들리다가
        회차가 쌓이면 자리를 잡습니다 — 짧은 창의 화려한 숫자가 왜 아무것도
        뜻하지 않는지가 이 모양에 그대로 있습니다.
      </p>
    </div>
  </div>
{/if}

<style>
  .wrap { padding: 1rem 1.2rem 3rem; }
  header h2 { margin: 0 0 .3rem; font-size: 1.15rem; }
  header p { margin: 0 0 1.2rem; color: #6b6558; font-size: .88rem; max-width: 60ch; }
  em { font-style: normal; color: #8a6a1c; }

  .cards { display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); margin-bottom: 1.4rem; }
  .card { border: 1px solid #e3ddd1; border-radius: 6px; padding: .8rem .9rem; background: #fff; }
  .card .v { display: block; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 1.5rem; }
  .card .k { font-size: .74rem; color: #8b8375; }
  .card.hero { background: #fdf6e3; border-color: #b8912f; }
  .card.hero .v { color: #8a6a1c; }

  table { width: 100%; border-collapse: collapse; font-size: .82rem; }
  th { text-align: left; font-size: .74rem; font-weight: 600; vertical-align: bottom;
       border-bottom: 1px solid #e3ddd1; padding: .4rem .5rem; white-space: nowrap; }
  th .unit { display: block; font-weight: 400; color: #8b8375; font-size: .68rem; margin-top: .15rem; }
  td { padding: .3rem .5rem; border-bottom: 1px solid #f0ebe1; white-space: nowrap; }
  .n { font-family: ui-monospace, Menlo, Consolas, monospace; text-align: right; }
  .sub { color: #a49a88; font-size: .74rem; }
  .big { font-size: .92rem; }
  .loud { color: #b4432f; font-weight: 700; }
  .name { min-width: 15rem; }
  .src { display: block; font-size: .66rem; color: #a49a88; }

  tbody tr { cursor: pointer; }
  tbody tr:hover td { background: #fbf7ee; }
  tr.oracle td { background: #eef3f6; }
  tr.oracle td:first-child { color: #3a6b8a; font-weight: 600; }
  tr.witness td { background: #fdf6e3; }
  tr.witness td:first-child { color: #8a6a1c; font-weight: 600; }
  tr.comp td:first-child { color: #8b8375; }

  /* Le spectre : sept segments, largeur = nombre de 회차. */
  .spectrum { display: flex; height: 13px; width: 190px; border-radius: 2px; overflow: hidden; }
  .spectrum i { display: block; }

  .foot { margin-top: .6rem; font-size: .82rem; color: #6b6558; max-width: 74ch; }
  h3 { margin: 2.4rem 0 .3rem; font-size: 1rem; padding-top: 1.4rem; border-top: 1px solid #e3ddd1; }
  h4 { margin: 1.8rem 0 .4rem; font-size: .88rem; color: #8a6a1c; }
  .lead { margin: 0 0 .8rem; font-size: .86rem; color: #6b6558; max-width: 74ch; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; background: #f0ebe1;
         padding: .1rem .3rem; border-radius: 3px; font-size: .82rem; }
  .run { border: 1px solid #b8912f; background: #fdf6e3; color: #8a6a1c;
         padding: .5rem 1.1rem; border-radius: 5px; font-size: .86rem; cursor: pointer; }
  .run:disabled { opacity: .6; cursor: progress; }
  table.mini { margin: .5rem 0 0; }
  table.mini td { padding: .25rem .5rem; }
  .note { background: #fff; border-left: 3px solid #b8912f; padding: .7rem 1rem;
          margin: .6rem 0 0; font-size: .86rem; }
  .nums { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .8rem;
          color: #4a453c; letter-spacing: .02em; white-space: normal; }

  .veil { position: fixed; inset: 0; background: rgba(28, 26, 22, .55);
          display: grid; place-items: center; padding: 1.5rem; z-index: 60; }
  .modal { background: #faf8f4; border-radius: 8px; padding: 1.4rem 1.6rem 1.6rem;
           max-width: 62rem; width: 100%; max-height: 90vh; overflow: auto; position: relative; }
  .close { position: absolute; top: .8rem; right: .9rem; border: 0; background: none;
           font-size: 1rem; cursor: pointer; color: #8b8375; }
  .modal h3 { margin: 0 0 .2rem; font-size: 1.05rem; padding-top: 0; border-top: 0; }
  .modal .sub { display: block; margin-bottom: 1rem; }

  .chart { position: relative; margin-bottom: 1.2rem; }
  .chart svg { width: 100%; height: 190px; display: block; background: #fff;
               border: 1px solid #e3ddd1; border-radius: 4px; }
  .line { fill: none; stroke: #b8912f; stroke-width: 2; vector-effect: non-scaling-stroke; }
  .par { stroke: #b4432f; stroke-width: 1; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
  .axis { display: flex; justify-content: space-between; font-size: .72rem; color: #8b8375; margin-top: .3rem; }
  .axis .mid { color: #b4432f; }
  .ends { position: absolute; top: 0; left: .4rem; height: 190px; display: flex;
          flex-direction: column; justify-content: space-between; font-size: .68rem;
          color: #a49a88; font-family: ui-monospace, monospace; pointer-events: none; }

  .bars { display: flex; gap: .5rem; align-items: flex-end; height: 110px; margin-bottom: 1.2rem; }
  .bar { flex: 1; display: flex; flex-direction: column; justify-content: flex-end;
         align-items: center; height: 100%; }
  .bar b { display: block; width: 100%; border-radius: 2px 2px 0 0; min-height: 1px; }
  .bar .c { font-size: .7rem; font-family: ui-monospace, monospace; color: #4a453c; margin-top: .2rem; }
  .bar .l { font-size: .68rem; color: #8b8375; }

  .facts { display: grid; grid-template-columns: 9rem 1fr; gap: .25rem .9rem; font-size: .84rem; margin: 0 0 1rem; }
  .facts dt { color: #8a6a1c; font-family: ui-monospace, monospace; font-size: .78rem; }
  .facts dd { margin: 0; color: #4a453c; }

  .note { font-size: .82rem; color: #6b6558; border-left: 3px solid #b8912f;
          padding: .6rem .9rem; background: #fff; margin: 0; }
</style>
