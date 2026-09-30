<script>
  // L'onglet 차가운번호/뜨거운번호.
  //
  // L'ancien site en faisait **onze pages** — 모든번호 et les dix familles —
  // toutes bâties sur le même moule. Une rangée de onze boutons, et les
  // blocs suivent, comme pour 구간, 테이블 et 리스트.
  //
  // Ce que la page demande : les numéros qui sortent, ils venaient de quelle
  // température ? Chaque numéro est rangé dans une des quatre bandes selon
  // le temps écoulé depuis sa dernière sortie, et on regarde d'où viennent
  // les sept du tirage.
  import {
    BANDS, HOTCOLD_FAMILIES, familyNumbers, hotColdLineCarry, hotColdLineStats,
    hotColdRow, hotColdSameLine, hotColdSeries, hotColdShare,
  } from '@core/hotcold.js'
  import { REFERENCE_LISTS, allCells, nextCells, nextRang, repeatTally }
    from '@core/tablelist.js'

  import { placeCarry } from '@core/analysis.js'
  import { periodogram, spectrum } from '@core/spectrum.js'

  import Compare from '../components/Compare.svelte'
  import Periodogram from '../components/Periodogram.svelte'
  import { num, POSITION_LABELS, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'

  let { draws } = $props()

  let family = $state('all')
  const fam = $derived(HOTCOLD_FAMILIES.find((f) => f.key === family))
  const members = $derived(familyNumbers(family))

  // Les 45 cellules de chaque 회차 — une seule passe pour tout l'historique,
  // partagée par les cinq blocs.
  const cellRows = $derived(allCells(draws))
  const series = $derived(hotColdSeries(draws, family, cellRows))

  // Les deux références de la page : ce que valent les colonnes du tableau,
  // et ce que valent les bandes une fois leur taille retirée.
  const lineStats = $derived(hotColdLineStats(draws, family, cellRows))
  const bandShare = $derived(hotColdShare(draws, family, cellRows))
  const pc = (v) => (v * 100).toFixed(1)
  const p1 = (v) => (v * 100).toFixed(1)

  // ───────────────────────────────────────────────────────── 이월 주기도
  //
  // Les sept numéros du dernier 회차 — les candidats 이월 — chacun avec son
  // périodogramme sur tout l'historique. Classés par p croissant : le plus
  // « rythmé » en tête. Le seuil de Fisher dit si ce rythme dépasse ce
  // qu'un tirage au sort produit ; en dessous, l'ordre n'a pas de sens.
  const carryNumbers = $derived([...draws.sequenceAt(draws.n - 1)])
  const carrySpectra = $derived(carryNumbers
    .map((n) => spectrum(draws, n))
    .sort((a, b) => a.p - b.p || a.number - b.number))
  const carryOver = $derived(carrySpectra.filter((s) => s.g > s.gStar).length)
  let carryOpen = $state(null)

  // ───────────────────────────────────────────────────── 위치별 이월 여부
  //
  // Le numéro d'une position (일 par défaut — le n1 de l'API) devient-il
  // 이월 au 회차 suivant ? Une série 0/1, son taux face à 7/45, et le
  // périodogramme de la série : le « oui » revient-il à intervalle fixe ?
  let carryPlace = $state(0)
  const placeStat = $derived(placeCarry(draws, carryPlace))
  const placeRows = $derived([
    { key: '이월 됨', obs: placeStat.hits, exp: placeStat.expected },
    { key: '안 됨', obs: placeStat.rounds - placeStat.hits, exp: placeStat.rounds - placeStat.expected },
  ])
  const placeSpec = $derived(periodogram(Array.from(placeStat.series)))
  const placeLatest = $derived(placeStat.rounds ? placeStat.series[placeStat.rounds - 1] : null)

  // ───────────────────────────────────────────────────── 라인별 당첨 여부
  //
  // La même question pour une 라인 du tableau : la carte étant classée
  // avant le tirage, « le numéro de la 라인 k sort-il ce 회차 ? » regarde
  // devant exactement comme 위치 — c'est la règle « 같은 라인 ».
  let carryLine = $state(1)
  // Autant de 라인 que de numéros dans la famille — les colonnes qu'une
  // bande vide occupe ne sont pas des 라인 où choisir.
  const lineCount = $derived(Math.min(members.length,
    lineStats.length ? lineStats[lineStats.length - 1].line : 0))
  const lineStat = $derived(hotColdLineCarry(draws, family, carryLine, cellRows))
  const lineRows = $derived([
    { key: '당첨 됨', obs: lineStat.hits, exp: lineStat.expected },
    { key: '안 됨', obs: lineStat.rounds - lineStat.hits, exp: lineStat.rounds - lineStat.expected },
  ])
  const lineSpec = $derived(periodogram(Array.from(lineStat.series)))
  const lineLatest = $derived(lineStat.rounds ? lineStat.series[lineStat.rounds - 1] : null)

  // ──────────────────────────────────────────────────────── 같은 라인
  //
  // La règle « même 라인 » : le gagnant 일 (이, …) du 회차 i était à la
  // 라인 L ; dans la carte i + 1 on prend le numéro à la 라인 L. Sept séries
  // 0/1, une par position, et pour la carte à venir les sept candidats.
  const sameLine = $derived(hotColdSameLine(draws, family, cellRows, nextCells(draws)))
  let samePlace = $state(0)
  const sameStat = $derived(sameLine[samePlace])
  const sameRows = $derived([
    { key: '당첨 됨', obs: sameStat.hits, exp: sameStat.expected },
    { key: '안 됨', obs: sameStat.rounds - sameStat.hits, exp: sameStat.rounds - sameStat.expected },
  ])
  const sameSpec = $derived(periodogram(Array.from(sameStat.series)))
  const sameLatest = $derived(sameStat.rounds ? sameStat.series[sameStat.rounds - 1] : null)

  const TONE = { hot: '--t-hot', midle: '--t-mid', cold: '--t-cold', dead: '--t-dead' }
  const TEXT = {
    hot: '--t-hot-text', midle: '--t-mid-text',
    cold: '--t-cold-text', dead: '--t-dead-text',
  }

  // ───────────────────────────────────────────────────────── 라인흐름

  // L'ancien déclarait un graphique à quarante-cinq courbes — « 1라인흐름 »
  // jusqu'à « 45라인흐름 » — mais n'en écrivait que deux valeurs par ligne.
  // Le graphique ne se dessinait donc jamais. Ici, ce que le bloc voulait
  // dire : combien de numéros peuplent chaque bande,회차 après 회차.
  const WINDOWS = [60, 120, 240, 0]
  let win = $state(120)
  const curve = $derived(win ? series.flow.slice(-win) : series.flow)

  const CW = 720
  const CH = 150
  const CPAD = { l: 4, r: 4, t: 6, b: 16 }

  // Quatre aires empilées. On accumule de la bande la plus chaude vers la
  // plus froide, et chaque aire est le ruban entre deux cumuls.
  const areas = $derived.by(() => {
    const n = curve.length
    if (n < 2) return []
    const total = members.length
    const x = (i) => CPAD.l + (i / (n - 1)) * (CW - CPAD.l - CPAD.r)
    const y = (v) => CPAD.t + (1 - v / total) * (CH - CPAD.t - CPAD.b)

    const out = []
    const below = new Array(n).fill(0)
    for (const b of BANDS) {
      const top = curve.map((f, i) => below[i] + f[b.key])
      let d = `M ${x(0)} ${y(top[0])}`
      for (let i = 1; i < n; i++) d += ` L ${x(i)} ${y(top[i])}`
      for (let i = n - 1; i >= 0; i--) d += ` L ${x(i)} ${y(below[i])}`
      out.push({ key: b.key, label: b.label, d: `${d} Z` })
      for (let i = 0; i < n; i++) below[i] = top[i]
    }
    return out
  })

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

  // ────────────────────────────────────────────────────────── 번호 패턴

  // L'ancienne page déroulait ses 회차 par paquets de vingt, du plus récent
  // vers le passé, avec un bouton 더 보기.
  const LSTEP = 10
  let lcount = $state(LSTEP)
  $effect(() => { family; lcount = LSTEP })

  // La carte du 회차 **à venir**, toujours en tête. Les autres disent ce qui
  // était en attente ; celle-ci dit ce qui l'est maintenant — c'est la seule
  // qui serve à préparer le tirage. Elle n'a ni 당첨 ni 이월 : rien n'est
  // sorti.
  const upcoming = $derived.by(() => {
    const row = nextCells(draws)
    return {
      rang: nextRang(draws),
      upcoming: true,
      now: null,
      after: null,
      row: hotColdRow(row, family, null),
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
        rang: draws.rangs[i],
        now: [...draws.sequenceAt(i)],
        after: nxt ? [...draws.sequenceAt(i + 1)] : null,
        row: hotColdRow(cellRows[i], family, nxt),
        repeats: repeatTally(cellRows[i]),
      })
    }
    return out
  })
</script>

{#if draws.n < 2}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}
  <section class="panel bar">
    <div class="head-inline">
      <h2>{fam.label} 통계 및 패턴</h2>
      <span class="gloss">{fam.gloss} · {num(members.length)}개 번호</span>
    </div>

    <div class="picker">
      {#each HOTCOLD_FAMILIES as f (f.key)}
        <button aria-pressed={family === f.key}
                onclick={() => (family = f.key)}>{f.label}</button>
      {/each}
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>온도</h2>
      <span class="gloss">마지막 출현 이후 지난 회차 수</span>
    </div>
    <div class="legend">
      {#each BANDS as b (b.key)}
        <span class="key" style="--tone: var({TONE[b.key]}); --text: var({TEXT[b.key]})">
          <i></i><b>{b.label}</b>
          <em>{b.max === Infinity ? `${b.min} 이상` : `${b.min}–${b.max}`}</em>
        </span>
      {/each}
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>라인흐름</h2>
      <span class="gloss">회차별 온도 인원</span>
      <span class="right">
        {#each WINDOWS as w (w)}
          <button class="win" aria-pressed={win === w} onclick={() => (win = w)}>
            {w ? `${w}` : '전체'}
          </button>
        {/each}
      </span>
    </div>

    <div class="scroll">
      <svg viewBox="0 0 {CW} {CH}" preserveAspectRatio="none" class="flow"
           role="img" aria-label="{fam.label} 라인흐름">
        {#each areas as a (a.key)}
          <path d={a.d} fill="var({TONE[a.key]})" opacity="0.85" />
        {/each}
      </svg>
    </div>
    <div class="axis">
      <span>{fmt(curve[0]?.rang ?? 0)}</span>
      <span class="dim">{num(curve.length)}회차 · 전체 {num(members.length)}개</span>
      <span>{fmt(curve.at(-1)?.rang ?? 0)}</span>
    </div>

    <p class="note dim">
      옛 페이지는 이 자리에 <strong>45개 선</strong>의 그래프를 선언했지만 한
      줄에 두 값만 넘겨주어 끝내 그려지지 않았습니다. 여기서는 그 블록이
      말하려던 것 — 네 온도의 인원 변화 — 을 그립니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>라인통계</h2>
      <span class="gloss">번호마다 당첨 · 이월 · 꽝</span>
      <span class="right">{num(draws.n)}회</span>
    </div>

    <div class="scroll linebox">
      <table class="lines">
        <thead>
          <tr>
            <th>라인</th><th class="v">당첨</th><th class="v">이월</th>
            <th class="v">꽝</th><th>비율</th>
          </tr>
        </thead>
        <tbody>
          {#each series.lines as l (l.number)}
            <tr>
              <td>
                <span class="n" style="--tone: var({SECTION_VARS[sectionOf(l.number)]})"
                      >{l.number}</span>번
              </td>
              <td class="val hit">{num(l.won)}</td>
              <td class="val carry">{num(l.carried)}</td>
              <td class="val dim">{num(l.blank)}</td>
              <td>
                <span class="mix">
                  <i class="a" style="width: {(l.won / draws.n) * 100}%"></i>
                  <i class="b" style="width: {(l.carried / draws.n) * 100}%"></i>
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Les mêmes 45 lignes en barres : sorties (당첨 + 이월) contre les
         7/45 de chaque 회차. Chaque numéro sort 15,6 % du temps, quel qu'il
         soit — ce filet-là, à la même hauteur partout, est la réponse. -->
    <div class="block">
      <Compare showTotal={false} keyWidth="2.5rem"
               rows={series.lines.map((l) => ({ key: l.number, obs: l.won + l.carried, exp: draws.n * 7 / 45 }))}
               obsLabel="당첨 + 이월" expLabel="기대 회차 × 7 ÷ 45" />
    </div>
  </section>

  <section class="panel four">
    {#each series.bands as b (b.key)}
      <div class="quarter">
        <div class="head">
          <h2 style="--tone: var({TEXT[b.key]})">{b.label} 라인통계</h2>
          <span class="gloss">{b.range}회 기다린 번호 중 몇 개가 나왔나</span>
        </div>
        <!-- 기대 : la bande avait tel effectif à chaque 회차, sept numéros
             sortent — une loi hypergéométrique par 회차, additionnées. -->
        <Compare suffix="개" keyWidth="2.5rem" showTotal={false}
                 rows={[...new Set([...Object.keys(b.counts), ...Object.keys(b.law)])]
                   .map(Number).sort((x, y) => x - y)
                   .map((k) => ({ key: k, obs: b.counts[k] ?? 0, exp: b.law[k] ?? 0 }))
                   .filter((r) => r.obs > 0 || r.exp >= 0.5)} />
      </div>
    {/each}
  </section>

  <!-- La seule question qui vaille sur ces quatre histogrammes : 뜨거운 gagne
       plus que 사망, mais est-ce parce qu'elle sort mieux, ou seulement
       parce qu'elle est plus grande ? -->
  <section class="panel">
    <div class="head">
      <h2>전체 회차 검증</h2>
      <span class="gloss">당첨번호가 어느 온도에서 나왔는가</span>
      <span class="right">{num(draws.n)}회차 · {fam.label}</span>
    </div>

    <div class="verdict">
      <table>
        <thead>
          <tr>
            <th>온도</th>
            {#each bandShare as s (s.key)}
              <th class="v" style="color: var({TEXT[s.key]})">{s.label}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>실제</td>
            {#each bandShare as s (s.key)}<td class="val">{pc(s.share)}%</td>{/each}
          </tr>
          <tr>
            <td>기대</td>
            {#each bandShare as s (s.key)}
              <td class="val soft">{pc(s.expectedShare)}%</td>
            {/each}
          </tr>
          <tr>
            <td>차이</td>
            {#each bandShare as s (s.key)}
              <td class="val" class:over={s.share > s.expectedShare}
                >{s.share - s.expectedShare >= 0 ? '+' : ''}{pc(s.share - s.expectedShare)}</td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>

    <div class="block">
      <Compare pct showTotal={false} keyWidth="3.5rem"
               rows={bandShare.map((s) => ({ key: s.label, obs: s.share, exp: s.expectedShare }))}
               obsLabel="실제 비중" expLabel="기대 (인원 비례)" />
    </div>

    <p class="note dim tight">
      <strong>기대</strong>는 각 온도의 <strong>인원</strong>만으로 계산한
      값입니다 — 회차마다 그 온도에 몇 개가 있었는지에 비례해서 나눈 것.
      「실제」와 「기대」가 같다면, 뜨거운 번호가 더 많이 당첨되는 것은 뜨거운
      번호의 <strong>수가 더 많기 때문</strong>이지 더 잘 나오기 때문이
      아닙니다. 판단은 여러분의 몫입니다.
    </p>
  </section>

  <!-- Les listes de référence, posées une fois au-dessus : l'ancien les
       réécrivait dans chacune des cartes. -->
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

  <!-- Les sept candidats 이월, chacun avec son périodogramme. -->
  <section class="panel">
    <div class="head">
      <h2>이월 7개 주기도</h2>
      <span class="gloss">{fmt(draws.rangs[draws.n - 1])}의 일곱 번호 — 리듬이 있는 번호가 있나</span>
      <span class="right">문턱 넘은 번호 {carryOver}개 · 우연이라면 {(7 * 0.05).toFixed(2)}개</span>
    </div>

    <div class="scroll">
      <table class="spectra">
        <thead>
          <tr><th>순위</th><th>번호</th><th>출현</th><th>최고 봉우리 주기</th><th>g</th><th>문턱</th><th>p</th><th></th></tr>
        </thead>
        <tbody>
          {#each carrySpectra as s, k (s.number)}
            <tr class:over={s.g > s.gStar} class:picked={carryOpen === s.number}
                onclick={() => (carryOpen = carryOpen === s.number ? null : s.number)}>
              <td class="dim">{k + 1}</td>
              <td><span class="n" style="--tone: var({SECTION_VARS[sectionOf(s.number)]})">{s.number}</span></td>
              <td>{num(s.drawn)}</td>
              <td>{s.peak ? `${s.peak.period.toFixed(1)}회` : '—'}</td>
              <td>{(s.g * 100).toFixed(2)}%</td>
              <td class="dim">{(s.gStar * 100).toFixed(2)}%</td>
              <td>{s.p < 0.001 ? '< 0.001' : s.p.toFixed(3)}</td>
              <td class="dim">{s.g > s.gStar ? '문턱 위' : '잡음'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="spectra-grid">
      {#each carrySpectra as s (s.number)}
        <div class="spectrum" class:open={carryOpen === s.number}>
          <Periodogram result={s} label={`${s.number}번`}
                       gloss={s.g > s.gStar ? '문턱 위' : '문턱 아래 — 잡음'} />
        </div>
      {/each}
    </div>

    <p class="note dim tight">
      순위는 p가 작은 순서 — 「가장 리듬이 뚜렷한」 번호가 위입니다. 그러나 문턱(Fisher 5%)
      아래라면 그 리듬은 무작위 수열도 늘 만들어내는 크기이고, 순위는 의미가 없습니다.
      7개를 검정하면 우연으로도 0.35개가 문턱을 넘습니다. 주기도는 <strong>어느 번호가
      다음에 나올지</strong>를 말하지 않습니다 — 이월 규칙의 walk-forward 검증에서 lift는
      1에 머물렀습니다.
    </p>
  </section>

  <!-- Ce que vaut chaque colonne du tableau, en barres : la ligne 당첨률
       des cartes, lue d'un coup sur les 45 (ou moins) colonnes. -->
  <section class="panel">
    <div class="head">
      <h2>라인별 당첨률</h2>
      <span class="gloss">표의 몇 번째 자리가 당첨번호를 담았나</span>
      <span class="right">{num(draws.n)}회차 · 기대 {pc(7 / 45)}%</span>
    </div>
    <Compare pct showTotal={false} keyWidth="2.5rem"
             rows={lineStats.map((l) => ({ key: l.line, obs: l.wonRate, exp: 7 / 45 }))}
             obsLabel="당첨률" expLabel="기대 7 ÷ 45" />
    <p class="note dim tight">
      자리(라인)는 번호가 아니라 <strong>순서</strong>입니다 — 9번째 자리는 「9번째로
      덜 기다린 번호」이고, 회차마다 다른 번호입니다. 45칸 중 7칸이 나오니 어느
      자리든 기대는 같은 {pc(7 / 45)}%입니다. 카드의 첫당첨 줄이 왼쪽에서 오른쪽으로
      내려가는 것은 「가장 왼쪽」의 정의가 만드는 모양이지, 추첨의 성질이 아닙니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>번호 패턴</h2>
      <span class="gloss">{fmt(nextRang(draws))}(다음 회차)부터 아래로</span>
      <span class="right">{num(boards.length)}회차</span>
    </div>
    <p class="note dim tight">
      번호마다 그 회차까지 <strong>몇 회를 기다렸는지</strong>를 적고, 네
      온도로 나눕니다. 색이 들어간 칸은 그 회차에 <strong>나온 번호</strong>
      입니다 — 괄호 안은 당첨인지 이월인지.
      <br />
      아래 작은 두 줄은 이 회차가 아니라 <strong>전체 회차</strong>의 것입니다.
      <strong>당첨률</strong>은 그 자리(라인)가 지금까지 몇 %의 회차에서
      당첨번호를 담았는지, <strong>첫당첨</strong>은 그 자리가 그 회차의
      <strong>가장 왼쪽 당첨번호</strong>였던 비율입니다. 칸에 마우스를 올리면
      실제 횟수가 나옵니다.
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

      <!-- Quatre lignes, et une colonne d'étiquettes à gauche pour les
           nommer. L'ancien avait bien ces trois en-têtes, mais son `colspan`
           de 뜨거운 avalait la colonne de gauche : les bandes tombaient une
           case trop à gauche, et la ligne du bas n'avait pas de nom. -->
      <div class="scroll">
        <table class="board">
          <thead>
            <tr class="bands">
              <th class="stub"></th>
              {#each b.row.groups as g (g.key)}
                <th colspan={Math.max(1, g.entries.length)}
                    style="--tone: var({TONE[g.key]}); --text: var({TEXT[g.key]})">
                  {g.label} <span class="rng">{g.range}</span>
                </th>
              {/each}
            </tr>
            <tr class="lines">
              <th class="stub">라인</th>
              {#each b.row.slots as slot (slot)}
                <th>{slot}</th>
              {/each}
            </tr>
            <tr class="nums">
              <th class="stub">번호</th>
              {#each b.row.groups as g (g.key)}
                {#if g.entries.length}
                  {#each g.entries as e (e.number)}
                    <th class:lit={paint[e.number]}
                        style="--tone: var({SECTION_VARS[sectionOf(e.number)]}); {paint[e.number]
                          ? `--pick: var(${paint[e.number]})` : ''}">{e.number}</th>
                  {/each}
                {:else}
                  <th class="empty">·</th>
                {/if}
              {/each}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th class="stub">대기</th>
              {#each b.row.groups as g (g.key)}
                {#if g.entries.length}
                  {#each g.entries as e (e.number)}
                    <td class:drawn={e.flag} class:next={e.hit}
                        style="--tone: var({TONE[g.key]})">
                      {e.gap}{#if e.flag}<b>{e.flag}</b>{/if}
                    </td>
                  {/each}
                {:else}
                  <td class="empty">·</td>
                {/if}
              {/each}
            </tr>

            <!-- Les deux seules lignes de ce tableau qui portent sur tout
                 l'historique et non sur ce 회차-ci. 당첨률 : à quelle
                 fréquence cette colonne a porté un sortant. 첫당첨 : à
                 quelle fréquence elle a porté le **premier** — le sortant le
                 plus chaud du 회차. La seconde s'effondre vers la droite,
                 forcément : plus on va vers le froid, moins on a de chances
                 d'être le premier. La première, elle, est plate — c'est ce
                 qu'il faut regarder. -->
            <tr class="rate">
              <th class="stub">당첨률</th>
              {#each b.row.flat as c, k (k)}
                <td title={lineStats[k]
                  ? `라인 ${k + 1} : 과거 ${num(lineStats[k].won)}회 당첨 (${p1(lineStats[k].wonRate)}%)`
                  : null}>{lineStats[k] ? p1(lineStats[k].wonRate) : '·'}</td>
              {/each}
            </tr>
            <tr class="rate">
              <th class="stub">첫당첨</th>
              {#each b.row.flat as c, k (k)}
                <td title={lineStats[k]
                  ? `라인 ${k + 1} : 과거 ${num(lineStats[k].first)}회 첫 당첨 (${p1(lineStats[k].firstRate)}%)`
                  : null}>{lineStats[k] ? p1(lineStats[k].firstRate) : '·'}</td>
              {/each}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  {/each}

  {#if lcount < draws.n}
    <div class="more">
      <button onclick={() => (lcount += LSTEP)}>
        더 보기 <span class="dim">{num(lcount)} / {num(draws.n)}</span>
      </button>
    </div>
  {/if}

  <!-- Le numéro d'une position devient-il 이월 ? -->
  <section class="panel">
    <div class="head">
      <h2>{POSITION_LABELS[carryPlace]} 번호는 이월이 되는가</h2>
      <span class="gloss">이 자리의 번호가 다음 회차에 다시 나오는가?</span>
      <span class="right">
        {num(placeStat.hits)} / {num(placeStat.rounds)}회차 · {pc(placeStat.rate)}% ·
        기대 {pc(placeStat.expectedRate)}%
      </span>
    </div>

    <div class="pick">
      <span class="label">위치</span>
      {#each POSITION_LABELS as label, p (label)}
        <button aria-pressed={carryPlace === p} onclick={() => (carryPlace = p)}>{label}</button>
      {/each}
    </div>

    <div class="block">
      <Compare rows={placeRows} keyWidth="4rem"
               mark={placeLatest === null ? undefined : (placeLatest ? '이월 됨' : '안 됨')}
               obsLabel="관측 회차" expLabel="기대 (7 ÷ 45)" />
    </div>

    <div class="block">
      <Periodogram result={placeSpec} label={`${POSITION_LABELS[carryPlace]} 이월 주기도`}
                   gloss="「이월이 됨」이 일정한 간격으로 돌아오는가?" />
    </div>

    <p class="note dim tight">
      회차마다 {POSITION_LABELS[carryPlace]} 자리의 번호(API의 정렬된 번호)가
      다음 회차의 7개 안에 다시 나왔으면 1, 아니면 0입니다. 다음 회차가 직전을
      전혀 모른다면 어느 번호든 7 ÷ 45 = {pc(7 / 45)}%로 다시 나옵니다 — 자리는
      그 확률을 바꾸지 않습니다. 위 막대는 그 비율을, 주기도는 그 0/1 수열에
      리듬이 있는지를 봅니다. 문턱 아래면 「다음에 이월이 될 차례」 같은 것은 없습니다.
    </p>
  </section>

  <!-- La même question pour une 라인 du tableau. -->
  <section class="panel">
    <div class="head">
      <h2>라인 {carryLine} 번호는 당첨이 되는가</h2>
      <span class="gloss">표의 이 라인에 있는 번호가 이번 회차에 나오는가?</span>
      <span class="right">
        {num(lineStat.hits)} / {num(lineStat.rounds)}회차 · {pc(lineStat.rate)}% ·
        기대 {pc(lineStat.expectedRate)}%
      </span>
    </div>

    <div class="pick">
      <span class="label">라인</span>
      {#each Array.from({ length: lineCount }, (_, k) => k + 1) as k (k)}
        <button aria-pressed={carryLine === k} onclick={() => (carryLine = k)}>{k}</button>
      {/each}
    </div>

    <div class="block">
      <Compare rows={lineRows} keyWidth="4rem"
               mark={lineLatest === null ? undefined : (lineLatest ? '당첨 됨' : '안 됨')}
               obsLabel="관측 회차" expLabel="기대 (7 ÷ 45)" />
    </div>

    <div class="block">
      <Periodogram result={lineSpec} label={`라인 ${carryLine} 당첨 주기도`}
                   gloss="이 라인의 「당첨」이 일정한 간격으로 돌아오는가?" />
    </div>

    <p class="note dim tight">
      카드는 추첨 <strong>전</strong>의 기다림으로 정렬되므로, 라인 {carryLine}에 어떤 번호가
      있는지는 미리 압니다 — 「지난 회차 당첨 라인의 번호를 다음 카드에서 고른다」는
      규칙이 바로 이것입니다. 그 번호가 이번 7개에 들면 1, 아니면 0. 라인이 비어 있는
      회차(가족이 좁을 때)는 세지 않습니다. 기대는 어느 라인이든 7 ÷ 45 =
      {pc(7 / 45)}% — 라인은 번호의 확률을 바꾸지 않습니다.
    </p>
  </section>

  <!-- La règle « 같은 라인 » : la 라인 du gagnant, reprise dans la carte suivante. -->
  <section class="panel">
    <div class="head">
      <h2>같은 라인 — 당첨 라인의 번호는 다음 회차에도 당첨되는가</h2>
      <span class="gloss">당첨 라인이 다음 표에서도 이어지는가</span>
      <span class="right">{num(sameStat.rounds)}회차 · 기대 {pc(sameStat.expectedRate)}%</span>
    </div>

    <div class="scroll">
      <table class="same">
        <thead>
          <tr>
            <th>위치</th><th>{fmt(draws.rangs[draws.n - 1])} 당첨</th><th>라인</th>
            <th>{fmt(nextRang(draws))} 후보</th><th>당첨 됨</th><th>비율</th><th>기대</th>
          </tr>
        </thead>
        <tbody>
          {#each sameLine as s (s.place)}
            <tr class:picked={samePlace === s.place} onclick={() => (samePlace = s.place)}>
              <td>{POSITION_LABELS[s.place]}</td>
              <td><span class="n" style="--tone: var({SECTION_VARS[sectionOf(carryNumbers[s.place])]})">{carryNumbers[s.place]}</span></td>
              <td>{s.line ?? '—'}</td>
              <td>
                {#if s.candidate}
                  <span class="n" style="--tone: var({SECTION_VARS[sectionOf(s.candidate)]})">{s.candidate}</span>
                {:else}—{/if}
              </td>
              <td>{num(s.hits)} / {num(s.rounds)}</td>
              <td>{pc(s.rate)}%</td>
              <td class="dim">{s.expected.toFixed(1)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="block">
      <Compare rows={sameRows} keyWidth="4rem"
               mark={sameLatest === null ? undefined : (sameLatest ? '당첨 됨' : '안 됨')}
               obsLabel={`${POSITION_LABELS[samePlace]} 라인 · 관측 회차`} expLabel="기대 (7 ÷ 45)" />
    </div>

    <div class="block">
      <Periodogram result={sameSpec} label={`${POSITION_LABELS[samePlace]} 같은 라인 주기도`}
                   gloss="이 라인의 이어짐이 일정한 간격으로 돌아오는가?" />
    </div>

    <p class="note dim tight">
      회차 i의 {POSITION_LABELS[samePlace]} 당첨번호가 카드 i에서 있던 라인 L을 기억해 두고,
      카드 i+1의 라인 L에 있는 번호가 회차 i+1에 나오면 1, 아니면 0입니다. 표의
      「{fmt(nextRang(draws))} 후보」가 지금 이 규칙이 고르는 일곱 번호입니다. 행을
      누르면 그 위치의 막대와 주기도가 바뀝니다. 카드 i+1은 추첨 전에 정렬되므로 그
      번호도 다른 번호처럼 7 ÷ 45의 확률을 가질 뿐입니다 — 관측이 그 근처면 규칙은
      번호를 고를 뿐, 맞히지는 않습니다.
    </p>
  </section>
{/if}

<style>
  .block { margin-top: 1rem; }
  .pick { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin-top: 0.25rem; }
  .pick .label { margin-right: 0.25rem; font-size: 0.75rem; color: var(--muted); }
  .pick button { font-size: 0.75rem; }

  /* 이월 7개 주기도 — la même table que 흐름 → 주기도, et les sept graphes
     en grille ; la ligne cliquée met son graphe en avant. */
  .spectra tbody tr, .same tbody tr { cursor: pointer; }
  .spectra tbody tr:hover td, .same tbody tr:hover td { background: var(--gold-wash); }
  .spectra tr.over td { color: var(--hit-bg); }
  .spectra tr.picked td, .same tr.picked td { background: var(--gold-wash); }
  .spectra .n, .same .n {
    display: inline-grid; place-items: center;
    min-width: 1.6rem; height: 1.6rem; padding: 0 0.3rem;
    border-radius: 999px; font-family: var(--figure); font-weight: 600;
    background: color-mix(in srgb, var(--tone) 18%, transparent); color: var(--ink);
  }
  .spectra-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: 1rem 1.5rem;
    margin-top: 1rem;
  }
  .spectrum { border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 0.6rem 0.8rem; }
  .spectrum.open { border-color: var(--gold); background: var(--gold-wash); }

  /* Les deux lignes d'historique sous 대기 : elles ne parlent pas du même
     objet que le reste du tableau, donc elles ne doivent pas peser autant. */
  .rate td, .rate .stub {
    font-size: 0.5rem; color: var(--muted);
    font-family: var(--figure); font-weight: 400;
    padding-top: 0; padding-bottom: 0;
  }

  /* La barre du hasard : ce qu'on a compté, ce que la taille des bandes
     imposait, et l'écart. */
  .verdict { overflow-x: auto; margin-bottom: 0.6rem; }
  .verdict table { width: auto; min-width: 100%; font-size: 0.8125rem; }
  .verdict td, .verdict th { padding: 0.2rem 0.9rem; white-space: nowrap; text-align: right; }
  .verdict td:first-child, .verdict th:first-child { text-align: left; color: var(--muted); }
  .verdict .val { font-family: var(--figure); }
  .verdict .soft { color: var(--muted); }
  .verdict .over { color: var(--gold-deep); font-weight: 600; }

  /* Le 회차 à venir : doré, et dit en toutes lettres qu'il n'est pas tiré.
     Sans ça on lirait ses 대기 comme un résultat. */
  .rg.soon { color: var(--gold-deep); }
  .soonnote { color: var(--muted); font-size: 0.75rem; }

  .bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.75rem;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .picker { display: flex; gap: 0.3rem; flex-wrap: wrap; justify-content: flex-end; }
  .picker button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }

  .win { font-size: 0.6875rem; padding: 0.1rem 0.4rem; margin-left: 0.2rem; }

  /* La légende des quatre bandes — posée une fois, elle sert à tout l'onglet. */
  .legend { display: flex; gap: 1.1rem; flex-wrap: wrap; }
  .key { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem; }
  .key i {
    width: 0.85rem; height: 0.85rem; border-radius: 0.2rem;
    background: var(--tone); display: inline-block;
  }
  .key b { color: var(--text); font-weight: 600; }
  .key em { color: var(--muted); font-style: normal; font-family: var(--figure); }

  .flow { width: 100%; min-width: 22rem; height: 9.5rem; display: block; }
  .axis {
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: var(--figure); font-size: 0.6875rem;
    color: var(--muted); margin-top: 0.25rem;
  }

  .linebox { max-height: 28rem; overflow-y: auto; }
  table { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  th, td { padding: 0.22rem 0.5rem; text-align: left; }
  .lines th {
    position: sticky; top: 0; background: var(--surface); z-index: 1;
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  .lines th.v, .lines td.val { text-align: right; }
  .lines td { border-bottom: 1px solid var(--line-soft); }
  .val { font-family: var(--figure); white-space: nowrap; }
  .val.hit { color: var(--gold-deep); }
  .val.carry { color: var(--t-dead-text); }

  .mix {
    display: flex; height: 0.5rem; min-width: 6rem;
    background: var(--line-soft); border-radius: 0.25rem; overflow: hidden;
  }
  .mix .a { background: var(--gold); }
  .mix .b { background: var(--t-dead); }

  .four {
    display: grid; gap: 1.5rem 2rem;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  }
  .quarter { min-width: 0; }
  .quarter h2 { color: var(--tone); }

  /* Les listes de référence. */
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

  /* Une carte par 회차. */
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
    border: 1px solid var(--line-soft); border-radius: 0.25rem;
    padding: 0 0.3rem;
  }
  .chip.flag { color: var(--gold-deep); border-color: var(--gold-soft); }
  .chip i { opacity: 0.45; font-style: normal; margin: 0 0.15rem; }

  .board { font-size: 0.75rem; }
  .board th, .board td {
    text-align: center; padding: 0.18rem 0.3rem;
    border: 1px solid var(--line-soft); white-space: nowrap;
  }
  .board .bands th {
    background: var(--tone); color: #fff; font-weight: 600;
    letter-spacing: 0.02em;
  }
  .board .bands .rng {
    font-family: var(--figure); font-weight: 400; opacity: 0.75;
    font-size: 0.6875rem;
  }
  .board .nums th {
    font-family: var(--figure); font-weight: 400; color: var(--tone);
    background: var(--surface);
  }
  /* La règle des positions : « le 34 est le 4ᵉ plus chaud » se lit sans
     compter les cases. Elle s'arrête au nombre réel de colonnes — l'ancien
     écrivait toujours 1 à 45, même sur une famille qui n'en a que 22. */
  .board .lines th {
    font-family: var(--figure); font-weight: 400; font-size: 0.6875rem;
    color: var(--muted); background: var(--surface);
  }
  .board .stub {
    background: var(--surface); color: var(--muted); font-weight: 400;
    font-size: 0.6875rem; position: sticky; left: 0; z-index: 1;
    white-space: nowrap; text-align: right;
  }
  .board .bands .stub { background: var(--surface); }
  .board .nums th.lit { background: var(--pick); color: #fff; }
  .board td { font-family: var(--figure); color: var(--muted); }
  .board td.drawn { background: var(--tone); color: #fff; font-weight: 600; }
  .board td.drawn b { font-weight: 400; opacity: 0.8; margin-left: 0.15rem; }
  .board td.next { outline: 2px solid var(--gold); outline-offset: -2px; }
  .board .empty { color: var(--line); }

  .more { display: flex; gap: 0.35rem; margin-top: 0.6rem; }
  .more button { font-size: 0.75rem; padding: 0.2rem 0.7rem; }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
  .note.tight { margin-top: 0.4rem; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
