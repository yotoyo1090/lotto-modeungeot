<script>
  // L'onglet 테이블.
  //
  // Sept pages dans l'ancien menu — 1번 패턴 … 7번 패턴 — la même question
  // posée aux sept positions du tirage :
  //
  //   le numéro que ce 회차 a mis à cette place, quels tirages passés le
  //   contenaient, et combien de leurs numéros sont ressortis **au 회차
  //   suivant**.
  //
  // Tout ce qui suit le sélecteur de 회차 se lit sur ce 회차-là : c'est ainsi
  // que l'ancienne page fonctionnait — son tableau restait vide tant qu'on
  // n'avait pas choisi. Seul le premier bloc porte sur tout l'historique.
  import {
    BUCKETS, DISTANCE_SPLIT, DISTANCE_WINDOW, DISTANCE_WINDOW_LOST, HITS_MEAN, MAX_HITS,
    PATTERN_POSITIONS, bucketNumbers,
    familyDistance, familyLines, hitsVerdict, lineFlow, lineMean, lineTally,
    parseExcluded, patternDigest, patternLines, patternTally, tallyVerdict,
  } from '@core/table.js'
  import {
    REFERENCE_LISTS, allCells, boardColumns, nextCells, nextRang, repeatTally,
    numberStats, sampleLists, tableListCellStats, tableListStats,
  } from '@core/tablelist.js'
  import { deletedRows, deletedTallies, peakCount } from '@core/deleted.js'

  import Bars from '../components/Bars.svelte'
  import Compare from '../components/Compare.svelte'
  import HlBoard from './HlBoard.svelte'
  import FlowChart from '../components/FlowChart.svelte'
  import { num, rang as fmt, sectionOf, SECTION_VARS } from '../lib/format.js'

  let { draws } = $props()

  // Les deux dernières entrées du groupe ne regardent pas une position mais
  // les sept à la fois. `null` = une des sept pages 패턴.
  const FAMILY = [
    { key: 'family', label: '당첨이월', sort: false },
    { key: 'familysort', label: '당첨이월정렬', sort: true },
    { key: 'hl', label: '테이블리스트 HL', hl: true },
    { key: 'list', label: '테이블리스트', board: true },
    { key: 'deleted', label: '제외번호', deleted: true },
  ]
  let family = $state(null)
  const fam = $derived(family ? FAMILY.find((f) => f.key === family) : null)

  let position = $state(0)
  const pos = $derived(PATTERN_POSITIONS[position])

  // Une passe quadratique par position, et tout le reste s'en déduit. Elle
  // ne sert qu'aux sept pages 패턴 — inutile de la payer sur 당첨이월.
  const digest = $derived(family ? null : patternDigest(draws, position))
  const tally = $derived(digest ? patternTally(digest) : {})

  // Ce que le hasard seul aurait donné. Sans elle, le 당첨여부 est un
  // chiffre nu : on ne sait pas si 2 est beaucoup.
  const verdict = $derived(digest ? tallyVerdict(tally) : null)
  const pc = (v) => (v * 100).toFixed(1)
  const signed = (v) => (v >= 0 ? `+${v.toFixed(3)}` : v.toFixed(3))

  // Le 회차 choisi. On ouvre sur l'**avant-dernier** : le dernier n'a pas de
  // 회차 suivant, donc aucun 당첨여부 mesurable, et la page s'afficherait
  // toute à zéro. Il reste choisissable — c'est même le cas qui sert à
  // préparer le tirage à venir.
  let picked = $state(null)
  $effect(() => {
    if (picked === null) picked = draws.rangs[Math.max(0, draws.n - 2)]
  })
  const found = $derived(picked === null ? -1 : draws.indexOf(picked))
  const at = $derived(found < 0 ? Math.max(0, draws.n - 2) : found)
  const rang = $derived(draws.rangs[at])

  const target = $derived(draws.sequenceAt(at)[position])
  const now = $derived([...draws.sequenceAt(at)])
  const after = $derived(at + 1 < draws.n ? [...draws.sequenceAt(at + 1)] : null)

  const lines = $derived(family ? [] : patternLines(draws, at, position))
  const byLine = $derived(digest ? lineTally(digest, at) : [])
  const buckets = $derived(family ? [] : bucketNumbers(lines))

  // 제외번호 — la liste saisie à la main, comme l'ancien champ `#dellnumber`.
  let dellnumber = $state('')
  const excluded = $derived(parseExcluded(dellnumber))
  // Le 회차 de la sous-page 제외번호 — le sien, indépendant de `picked`, pour
  // ne rien changer aux quatre autres sous-pages. Par défaut le dernier.
  let delPicked = $state(null)
  const delAt = $derived.by(() => {
    const i = delPicked === null ? -1 : draws.indexOf(delPicked)
    return i < 0 ? draws.n - 1 : i
  })
  const delRang = $derived(draws.rangs[delAt])
  // Sur la sous-page 제외번호 les sept colonnes suivent son propre 회차
  // (`delAt`, plus bas) ; ailleurs celui du sélecteur commun.
  const famAt = $derived(fam?.deleted ? delAt : at)
  const famRang = $derived(draws.rangs[famAt])
  const famAfter = $derived(famAt + 1 < draws.n ? [...draws.sequenceAt(famAt + 1)] : null)
  const famNow = $derived([...draws.sequenceAt(famAt)])
  // Le même comptage que 당첨여부, mais contre le 회차 choisi lui-même :
  // combien de lignes partagent 0, 1, 2… numéros avec lui.
  const nowSet = $derived(new Set(famNow))
  const nowOverlap = (l) => l.numbers.reduce((t, n) => t + (nowSet.has(n) ? 1 : 0), 0)
  function nowTally(col) {
    const tally = Array.from({ length: MAX_HITS + 1 }, () => 0)
    let sum = 0
    for (const l of col.lines) { const v = nowOverlap(l); tally[v]++; sum += v }
    return { tally, sum }
  }
  const columns = $derived(family && !fam.board && !fam.hl
    ? familyLines(draws, famAt, excluded, { sort: fam.sort }) : [])

  // 거리 — d'où viennent les lignes qui touchent, et celles qui ratent.
  // Le même vivier que les sept colonnes, dédoublonné, rangé par distance au
  // tirage gagnant. C'est la question posée à l'envers : la page montre
  // *quelles* lignes ont touché, ce bloc montre *d'où* elles venaient.
  const dist = $derived(family && !fam.board && !fam.hl && !fam.deleted
    ? familyDistance(draws, famAt) : null)
  const dmax = $derived(dist
    ? Math.max(0.0001, ...dist.bins.map((b) => b.won / b.pool)) : 1)
  const lmax = $derived(dist
    ? Math.max(0.0001, ...dist.bins.map((b) => b.lost / b.pool)) : 1)
  const pmax = $derived(dist ? Math.max(1, ...dist.bins.map((b) => b.pool)) : 1)

  // La tranche dépliée sous le graphe — `null` tant qu'on n'a rien cliqué.
  // Elle se referme dès qu'on change de 회차 ou de sous-page.
  let dpick = $state(null)
  $effect(() => { famAt; family; dpick = null })
  const dbin = $derived(dist && dpick !== null
    ? dist.bins.find((b) => b.lo === dpick) ?? null : null)

  // La fenêtre 127~151 ne tombe pas sur les bords des tranches de 25 : elle
  // est à cheval sur deux barres. On marque les deux, sinon le chiffre du
  // paragraphe ne se retrouve nulle part sur le graphe.
  const inWindow = (b) => b.hi >= DISTANCE_WINDOW.lo && b.lo <= DISTANCE_WINDOW.hi

  // Deux décimales : à une seule, 6.98 et 6.99 deviennent le même « 7.0 » et
  // le tableau ne dit plus rien. Le z aussi se lit à deux décimales.
  const pc2 = (v) => (v * 100).toFixed(2)
  const z2 = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2)

  // La fenêtre 127~151, traduite en 회차 pour le 회차 courant : les lignes de
  // 회차별 번호 qui tombent dedans portent la même marque que les barres du
  // graphe, si bien qu'on passe de l'un à l'autre sans compter.
  const asRang = (w) => (dist?.target ? { lo: dist.target - w.hi, hi: dist.target - w.lo } : null)
  const winRang = $derived(asRang(DISTANCE_WINDOW))
  const lostRang = $derived(asRang(DISTANCE_WINDOW_LOST))
  const inRange = (w, r) => !!w && r >= w.lo && r <= w.hi
  const inWinRang = (r) => inRange(winRang, r)
  const inLostRang = (r) => inRange(lostRang, r)

  // 테이블리스트 — le 차뜨 pivoté, et les cinq comptages du haut de page.
  // 제외번호 — combien de fois chaque numéro est sorti dans les dix 회차
  // d'avant, et ce que ce chiffre valait chez les sortants.
  // Borné au 회차 choisi : comptages, 검증 et tableau se lisent comme si l'on
  // était ce samedi-là.
  const delRows = $derived(fam?.deleted ? deletedRows(draws).filter((r) => r.index <= delAt) : null)
  const delTally = $derived(delRows ? deletedTallies(draws, delRows) : null)
  const delPeak = $derived(delRows ? peakCount(delRows) : 0)
  const DSTEP = 120
  let dshow = $state(DSTEP)
  $effect(() => { family; delPicked; dshow = DSTEP })
  const delShown = $derived(delRows ? [...delRows].reverse().slice(0, dshow) : [])

  // La question que pose 제외번호 : un numéro très sorti ces dix derniers
  // 회차 a-t-il moins de chances de ressortir ? Si oui, les sept gagnants
  // doivent avoir un comptage plus bas que les 45. On met les deux côte à
  // côte, valeur par valeur.
  const delVerdict = $derived.by(() => {
    if (!delTally) return null
    const totals = (o) => Object.values(o).reduce((a, c) => a + c, 0)
    const mean = (o) => {
      const t = totals(o)
      if (!t) return 0
      let s = 0
      for (const [v, c] of Object.entries(o)) s += Number(v) * c
      return s / t
    }
    const allT = totals(delTally.all)
    const wonT = totals(delTally.won)
    const keys = Object.keys(delTally.all).map(Number).sort((a, b) => a - b)
    return {
      keys,
      rows: keys.map((v) => ({
        v,
        // La part de ce comptage chez les gagnants, et chez les 45. Si le
        // tirage ignore le passé, les deux sont égales.
        won: wonT ? (delTally.won[v] ?? 0) / wonT : 0,
        all: allT ? (delTally.all[v] ?? 0) / allT : 0,
      })),
      wonMean: mean(delTally.won),
      allMean: mean(delTally.all),
      lostMean: mean(delTally.lost),
      wonT,
    }
  })
  const delDrawn = (i) => new Set(draws.fullAt(i))

  const cellRows = $derived(fam?.board ? allCells(draws) : null)
  const stats = $derived(cellRows ? tableListStats(draws, cellRows) : null)

  // Les deux marges de la grille : ce que vaut chaque ligne, ce que vaut
  // chaque colonne. Toutes deux se comparent au même 7/45.
  const cellStats = $derived(cellRows ? tableListCellStats(draws, cellRows) : null)
  // Retrouver le taux d'une colonne par sa clé — les colonnes d'un 회차 ne
  // sont pas toutes celles de l'historique.
  const colRate = $derived.by(() => {
    const m = new Map()
    for (const c of cellStats?.columns ?? []) m.set(c.key, c)
    return m
  })

  // La troisième marge : le numéro lui-même. Indexé par sa valeur pour que
  // chaque case du tableau puisse porter son taux.
  const numStats = $derived(fam?.board ? numberStats(draws) : null)
  const numRate = $derived(numStats ? numStats.numbers : null)
  // Les listes qu'on a allumées, dans l'ordre où on les a cliquées. Chacune
  // prend une teinte du thème ; un numéro qui tombe dans plusieurs listes
  // porte celle de la première allumée.
  const PICK_TONES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--gold']
  let picks = $state([])
  function togglePick(key) {
    picks = picks.includes(key) ? picks.filter((k) => k !== key) : [...picks, key]
  }
  const toneOf = (key) => PICK_TONES[picks.indexOf(key) % PICK_TONES.length]

  // Un tableau de 46 cases : pour chaque numéro, la teinte de la première
  // liste allumée qui le contient — recalculé une fois par changement, pas
  // une fois par cellule.
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

  // L'ancienne page déroulait ses 회차 par paquets, du plus récent vers le
  // passé, avec un bouton 더 보기. Le sélecteur dit d'où l'on part.
  const LSTEP = 10
  let lcount = $state(LSTEP)
  $effect(() => { family; picked; lcount = LSTEP })

  // La carte du 회차 **à venir**, toujours en tête. Les autres disent ce qui
  // était en attente ; celle-ci dit ce qui l'est maintenant — c'est la seule
  // qui serve à préparer le tirage, et elle ne dépend donc pas du 회차 choisi
  // au-dessus, qui ne gouverne que la pile du passé. L'en-tête le dit.
  const upcoming = $derived.by(() => {
    if (!cellRows) return null
    const row = nextCells(draws)
    const rg = nextRang(draws)
    return {
      i: draws.n,
      rang: rg,
      upcoming: true,
      now: null,
      after: null,
      board: boardColumns(row, null),
      repeats: repeatTally(row),
      sample: sampleLists(rg),
    }
  })

  const boards = $derived.by(() => {
    if (!cellRows) return []
    const out = upcoming ? [upcoming] : []
    for (let k = 0; k < lcount && at - k >= 0; k++) {
      const i = at - k
      const nxt = i + 1 < draws.n ? draws.fullAt(i + 1) : null
      out.push({
        i,
        rang: draws.rangs[i],
        now: [...draws.sequenceAt(i)],
        after: nxt ? [...draws.sequenceAt(i + 1)] : null,
        board: boardColumns(cellRows[i], nxt),
        repeats: repeatTally(cellRows[i]),
        sample: sampleLists(draws.rangs[i]),
      })
    }
    return out
  })

  // Sept colonnes de deux cents lignes font quatorze cents lignes de sept
  // numéros. On en montre cent par colonne, le reste sur demande.
  const FSTEP = 100
  let deep = $state(FSTEP)
  $effect(() => { family; picked; deep = FSTEP })

  // 라인 흐름 : une ligne suivie d'un 회차 à l'autre.
  let line = $state(0)
  $effect(() => { position; if (digest && line >= digest.widest) line = 0 })
  const flow = $derived(digest ? lineFlow(draws, digest, line) : [])

  // Onze cents points sur sept cents pixels font un mur de traits. La
  // fenêtre par défaut en montre cent vingt — l'ancien affichait tout.
  const WINDOWS = [60, 120, 240, 0]
  let win = $state(120)
  const curve = $derived(win ? flow.slice(-win) : flow)

  // Le fond d'une case du ruban : plus le 당첨여부 est haut, plus l'or est
  // dense. Zéro ne se peint pas — c'est le cas ordinaire.
  const tone = (h) => h === 0 ? 'transparent'
    : `color-mix(in srgb, var(--gold) ${12 + h * 13}%, transparent)`
</script>

{#if draws.n < 3}
  <section class="panel">
    <p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p>
  </section>
{:else}
  <section class="panel bar">
    <div class="head-inline">
      <h2>{fam ? fam.label : `${pos.label} 통계 및 패턴`}</h2>
      <span class="gloss">
        {#if fam?.hl}칸마다 그 번호의 과거 — 미래위치와 위치합
        {:else if fam?.deleted}앞 10회차에 몇 번 나왔나
        {:else if fam?.board}45개 번호를 미출현 간격으로 세로로 쌓아
        {:else if fam}일곱 자리를 한 회차에서 나란히{#if fam.sort} · 제외번호가 적은 줄부터{/if}
        {:else}{pos.column} · 앞 회차에서 이 번호를 품었던 조합{/if}
      </span>
    </div>

    <div class="picker">
      {#each PATTERN_POSITIONS as p (p.key)}
        <button aria-pressed={!family && position === p.key}
                onclick={() => { family = null; position = p.key }}>{p.label}</button>
      {/each}
      <!-- Les deux pages qui montrent les sept positions d'un coup. -->
      <span class="split" aria-hidden="true"></span>
      {#each FAMILY as f (f.key)}
        <button aria-pressed={family === f.key}
                onclick={() => (family = f.key)}>{f.label}</button>
      {/each}
    </div>
  </section>

  {#if !family}
  <section class="panel">
    <div class="head">
      <h2>모든 리스트 통계</h2>
      <span class="gloss">당첨여부의 분포</span>
      <span class="right">{num(digest.entries)}줄 · 전체 회차</span>
    </div>

    {#if verdict}
      <Compare suffix="개"
               rows={verdict.rows.filter((r) => r.count > 0 || r.expected >= 0.5)
                 .map((r) => ({ key: r.hits, obs: r.count, exp: r.expected }))}
               obsLabel="관측" expLabel="기대 (초기하분포)" />
    {:else}
      <Bars data={tally} suffix="개" />
    {/if}

    <!-- La barre à battre. Sept numéros d'un vieux tirage, sept numéros
         retirés parmi 45 : le nombre de numéros communs suit une loi
         connue. On la pose à côté du compte réel. -->
    {#if verdict}
    <div class="verdict">
      <table>
        <thead>
          <tr>
            <th>당첨여부</th>
            {#each verdict.rows as r (r.hits)}<th class="v">{r.hits}</th>{/each}
            <th class="v">평균</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>실제</td>
            {#each verdict.rows as r (r.hits)}
              <td class="val">{pc(r.share)}%</td>
            {/each}
            <td class="val sum">{verdict.mean.toFixed(3)}</td>
          </tr>
          <tr>
            <td>기대</td>
            {#each verdict.rows as r (r.hits)}
              <td class="val soft">{pc(r.p)}%</td>
            {/each}
            <td class="val soft">{verdict.expected.toFixed(3)}</td>
          </tr>
          <tr>
            <td>차이</td>
            {#each verdict.rows as r (r.hits)}
              <td class="val soft">{pc(r.share - r.p)}</td>
            {/each}
            <td class="val" class:over={verdict.gap > 0}>{signed(verdict.gap)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="note dim tight">
      <strong>기대</strong>는 무작위 추첨이 줄 값입니다 — 45개 중 7개를
      뽑는 초기하분포. 평균은 언제나 7 × 7 ÷ 45 =
      <strong>{HITS_MEAN.toFixed(3)}</strong>개입니다.
      실제 평균이 이 값과 거의 같다면, 이 목록은 아무것도 예측하지 않습니다 —
      {num(verdict.total)}줄에서 차이는 <strong>{signed(verdict.gap)}</strong>개입니다.
    </p>
    {/if}

    <p class="note dim">
      한 회차마다, 그 회차의 <strong>{pos.column}</strong>를 품었던 앞 회차를
      모두 모읍니다. 각 줄의 <strong>당첨여부</strong>는 그 앞 회차의 일곱
      번호 중 몇 개가 <strong>다음 회차</strong>에 다시 나왔는지입니다.
      <br />
      이 블록만 전체 회차를 봅니다. 아래는 모두 고른 회차의 것입니다.
      판단은 여러분의 몫입니다.
    </p>
  </section>

  {/if}

  <!-- Le sélecteur, et ce qu'il commande : le tirage choisi, et celui qui
       l'a suivi — le seul contre lequel le 당첨여부 se mesure. -->
  {#if !fam?.deleted}
  <section class="panel pickbar">
    <label>
      회차 선택
      <select bind:value={picked}>
        {#each { length: draws.n } as _, k (k)}
          {@const r = draws.rangs[draws.n - 1 - k]}
          <option value={r}>{fmt(r)}</option>
        {/each}
      </select>
    </label>

    <div class="two-draws">
      <div class="draw">
        <span class="lead">현재 회차 <b>{fmt(rang)}</b></span>
        <span class="grid">
          {#each now as n, j (j)}
            <span class="n" class:bonus={j === 6} class:target={n === target}
                  style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
          {/each}
        </span>
      </div>
      <div class="draw">
        <span class="lead">당첨 회차 <b>{after ? fmt(draws.rangs[at + 1]) : '—'}</b></span>
        {#if after}
          <span class="grid">
            {#each after as n, j (j)}
              <span class="n" class:bonus={j === 6}
                    style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
            {/each}
          </span>
        {:else}
          <span class="dim">아직 없습니다 — 마지막 회차입니다.</span>
        {/if}
      </div>
    </div>
  </section>
  {/if}

  {#if !family}
  <section class="panel">
    <div class="head">
      <h2>라인 통계</h2>
      <span class="gloss">{fmt(rang)}까지 쌓인 줄별 당첨여부</span>
      <span class="right">{num(byLine.length)}줄</span>
    </div>

    <div class="scroll tablebox">
      <table>
        <thead>
          <tr>
            <th>라인</th>
            {#each { length: MAX_HITS + 1 } as _, v (v)}<th class="v">{v}</th>{/each}
            <th class="v">합계</th>
            <th class="v">평균</th>
            <th class="v">기대차</th>
          </tr>
        </thead>
        <tbody>
          {#each byLine as r (r.line)}
            {@const m = lineMean(r.counts, r.total)}
            <tr>
              <td>{r.line}</td>
              {#each r.counts as c, v (v)}
                <td class="val" class:zero={c === 0}>{c ? num(c) : '·'}</td>
              {/each}
              <td class="val sum">{num(r.total)}</td>
              <td class="val">{m.mean.toFixed(3)}</td>
              <td class="val soft" class:over={m.gap > 0}>{signed(m.gap)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- La même chose en barres : la moyenne de chaque ligne contre 1,089.
         Les lignes du bas ont peu de 회차 — c'est `합계` qui dit combien. -->
    <div class="block">
      <Compare digits={3} keyWidth="3.5rem" showTotal={false}
               rows={byLine.map((r) => ({ key: r.line, obs: lineMean(r.counts, r.total).mean, exp: HITS_MEAN }))}
               obsLabel="줄의 평균 당첨여부" expLabel="기대 7 × 7 ÷ 45" />
    </div>

    <p class="note dim">
      1회차부터 고른 회차까지 쌓은 값입니다 — 고른 회차 한 줄만이 아닙니다.
      <br />
      <strong>기대차</strong>는 그 줄의 평균에서 {HITS_MEAN.toFixed(3)}을 뺀
      값입니다. 어떤 줄이 다른 줄보다 낫다면 이 칸이 꾸준히 양수여야 합니다 —
      줄 수가 적은 아래쪽은 흔들리니 <strong>합계</strong>와 함께 읽으세요.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>라인 흐름</h2>
      <span class="gloss">한 줄을 회차별로</span>
      <span class="right">
        <label class="inline">
          라인
          <select bind:value={line}>
            {#each { length: digest.widest } as _, k (k)}
              <option value={k}>{k + 1}</option>
            {/each}
          </select>
        </label>
        {#each WINDOWS as w (w)}
          <button class="win" aria-pressed={win === w} onclick={() => (win = w)}>
            {w ? `${w}` : '전체'}
          </button>
        {/each}
      </span>
    </div>

    <FlowChart series={curve} heat={false} legend={false}
               label="{pos.label} · 라인 {line + 1}" gloss="회차별 당첨여부"
               unit="개" />
  </section>

  <section class="panel">
    <div class="head">
      <h2>회차별 흐름</h2>
      <span class="gloss">{fmt(rang)}의 줄을 순서대로</span>
      <span class="right">{num(lines.length)}줄</span>
    </div>

    <!-- L'ancien traçait une courbe de deux cents points larges de trois
         pixels. Une case par ligne, teintée par le 당첨여부 : la même suite,
         et on voit où les fortes se groupent. -->
    <div class="strip">
      {#each lines as l, k (k)}
        <span class="cell" style="background: {tone(l.hits)}"
              title="라인 {k + 1} · {fmt(l.rang)} · 당첨여부 {l.hits}">{l.hits}</span>
      {/each}
    </div>

    <div class="legend">
      {#each { length: MAX_HITS + 1 } as _, h (h)}
        <span class="cell" style="background: {tone(h)}">{h}</span>
      {/each}
      <span class="name dim">당첨여부</span>
    </div>
  </section>

  <section class="panel">
    <div class="head">
      <h2>회차별 번호</h2>
      <span class="gloss">고른 회차의 줄과 번호</span>
      <span class="right">{num(lines.length)}줄</span>
    </div>

    <!-- Les cinq paniers de l'ancien bas de page. Le total annoncé est le
         nombre de numéros **distincts** du panier, pas le nombre de lignes. -->
    {#if !after}
      <p class="note dim warn">
        이 회차 다음이 아직 없습니다 — 당첨여부를 잴 수 없어 모두 0입니다.
        아래는 <strong>후보 목록</strong>으로 읽으세요.
      </p>
    {:else}
    <div class="buckets">
      {#each buckets as b (b.label)}
        <div class="bucket">
          <div class="btitle">
            <span class="key">"{b.label}"</span> 필터결과 합계 :
            <strong>{num(b.distinct)}</strong> 개
          </div>
          {#if !b.numbers.length}
            <span class="dim">없음</span>
          {:else}
            <div class="chips">
              {#each b.numbers as x (x.number)}
                <span class="chip" style="--tone: var({SECTION_VARS[sectionOf(x.number)]})">
                  {x.number}번호<span class="rep">{num(x.count)}반복수</span>
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {/if}

    <div class="scroll tablebox tall">
      <table>
        <thead>
          <tr>
            <th>라인</th>
            <th>1번호</th><th>2번호</th><th>3번호</th><th>4번호</th>
            <th>5번호</th><th>6번호</th><th>보너스번호</th>
            <th class="v">당첨여부</th>
            <th>회차</th>
          </tr>
        </thead>
        <tbody>
          {#each lines as l, k (k)}
            <tr class:hot={l.hits >= 4}>
              <td>{k + 1}</td>
              {#each l.numbers as n, j (j)}
                <td class="num" class:bonus={j === 6} class:hit={after?.includes(n)}
                    style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</td>
              {/each}
              <td class="val sum">{l.hits}</td>
              <td class="dim">{fmt(l.rang)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="note dim">
      패턴 선택을 통해 최근 흐름 및 통계의 효율을 판단하는 데 많은 도움이 됩니다.
      {#if after}
        <br />밑줄 친 번호는 <strong>당첨 회차</strong>에 다시 나온 번호입니다.
      {/if}
    </p>
  </section>
  {/if}

  <!-- ────────────────────────────────── 당첨이월 · 당첨이월정렬 -->
  {#if family && fam.hl}
    <HlBoard {draws} />
  {/if}

  {#if family && !fam.board && !fam.hl}
  {#if fam.deleted}
  <section class="panel pickbar">
    <label>
      회차 선택
      <select bind:value={delPicked}>
        {#each { length: draws.n } as _, k (k)}
          {@const r = draws.rangs[draws.n - 1 - k]}
          <option value={r}>{fmt(r)}</option>
        {/each}
      </select>
    </label>
    <div class="two-draws">
      <div class="draw">
        <span class="lead">현재 회차 <b>{fmt(famRang)}</b></span>
        <span class="grid">
          {#each famNow as n, j (j)}
            <span class="n" class:bonus={j === 6}
                  style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
          {/each}
        </span>
      </div>
      <div class="draw">
        <span class="lead">당첨 회차 <b>{famAfter ? fmt(draws.rangs[famAt + 1]) : '—'}</b></span>
        {#if famAfter}
          <span class="grid">
            {#each famAfter as n, j (j)}
              <span class="n" class:bonus={j === 6}
                    style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
            {/each}
          </span>
        {:else}
          <span class="dim">아직 없습니다 — 마지막 회차입니다.</span>
        {/if}
      </div>
    </div>
    <span class="inline">{fmt(delRang)}까지 · {num(delRows.length)}회차</span>
  </section>
  {/if}
  <section class="panel dellbar">
    <label class="grow">
      제외번호 리스트
      <input type="text" bind:value={dellnumber}
             placeholder="예 : 3, 13, 40" />
    </label>
    {#if excluded.length}
      <span class="chips">
        {#each excluded as n (n)}
          <span class="chip out">{n}</span>
        {/each}
        <button class="clear" onclick={() => (dellnumber = '')}>지우기</button>
      </span>
    {:else}
      <span class="dim">번호를 쉼표로 나눠 적으면 줄마다 제외여부를 셉니다.</span>
    {/if}
  </section>

  <!-- ────────────────────────────────── 거리 -->
  {#if dist}
  <section class="panel">
    <div class="head">
      <h2>거리</h2>
      <span class="gloss">
        {fmt(dist.target)}{dist.upcoming ? '(다음 회차)까지 — 아직 추첨 전' : '(당첨 회차)까지'} ·
        줄이 몇 회차 전에 있는가
      </span>
      <span class="right">{num(dist.lines)}회차</span>
    </div>
    <p class="note dim tight">
      아래 일곱 칸의 줄은 저마다 과거의 한 회차입니다. 그 회차에서
      <strong>당첨 회차</strong>까지의 거리를 재고, <strong>3개 이상 맞힌 줄</strong>과
      <strong>하나도 못 맞힌 줄</strong>이 서로 다른 거리에서 오는지 봅니다.
      같은 회차가 여러 칸에 나와도 한 번만 셉니다.
    </p>

    <!-- La tranche dépliée : le même bloc avant et après le tirage, à ceci
         près qu'avant, il n'y a pas de 당첨여부 à montrer. -->
    {#snippet opened()}
      {#if dbin}
        <div class="dopen">
          <div class="dohead">
            <b>{dbin.lo}~{dbin.hi}회차 전</b>
            <span class="dim">
              {fmt(dist.target - dbin.hi)} ~ {fmt(dist.target - dbin.lo)}
            </span>
            <span class="dim">
              {num(dbin.pool)}줄{#if !dist.upcoming} · 3개 이상 {num(dbin.won)} · 꽝 {num(dbin.lost)}{/if}
            </span>
            <button class="doclose" onclick={() => (dpick = null)}>닫기</button>
          </div>
          <div class="scroll">
            <table class="dotable">
              <thead>
                <tr>
                  <th>회차</th><th>거리</th><th>일곱 번호</th>
                  {#if !dist.upcoming}<th class="val">당첨여부</th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each dbin.rows as r (r.rang)}
                  <tr class:won={!dist.upcoming && r.hits >= 3}
                      class:lost={!dist.upcoming && r.hits === 0}>
                    <td class="dim">{fmt(r.rang)}</td>
                    <td class="val">{num(r.distance)}</td>
                    <td>
                      <span class="grid tight">
                        {#each r.numbers as n, j (j)}
                          <span class="n" class:bonus={j === 6}
                                style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
                        {/each}
                      </span>
                    </td>
                    {#if !dist.upcoming}<td class="val sum">{r.hits}</td>{/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/snippet}

    {#if !dist.upcoming}
      <div class="dsides">
        <div class="dside won">
          <span class="dlabel">당첨 줄 <i>3개 이상</i></span>
          <span class="dbig">{num(dist.won.lines)}<b>줄</b></span>
          <span class="dgrid">
            <span>가까움<b>{num(dist.won.near)}</b></span>
            <span>중앙<b>{num(dist.won.median)}</b></span>
            <span>멀리<b>{num(dist.won.far)}</b></span>
          </span>
        </div>
        <div class="dside lost">
          <span class="dlabel">꽝 줄 <i>0개</i></span>
          <span class="dbig">{num(dist.lost.lines)}<b>줄</b></span>
          <span class="dgrid">
            <span>가까움<b>{num(dist.lost.near)}</b></span>
            <span>중앙<b>{num(dist.lost.median)}</b></span>
            <span>멀리<b>{num(dist.lost.far)}</b></span>
          </span>
        </div>
      </div>

      <div class="scroll">
        <div class="dbars">
          <span class="drow-lead won">당첨 줄 비율 <i>막대를 누르면 그 회차들이 펼쳐집니다</i></span>
          <div class="drow">
            {#each dist.bins as b (b.lo)}
              <button class="dbar won" class:picked={dpick === b.lo} class:win={inWindow(b)}
                      title="{b.lo}~{b.hi}회차 전 · {b.won}/{b.pool}{inWindow(b) ? ' · 127~151 구간' : ''}"
                      onclick={() => (dpick = dpick === b.lo ? null : b.lo)}>
                <i style="height: {(b.won / b.pool / dmax) * 100}%"></i>
              </button>
            {/each}
          </div>
          <span class="drow-lead lost">꽝 줄 비율</span>
          <div class="drow">
            {#each dist.bins as b (b.lo)}
              <button class="dbar lost" class:picked={dpick === b.lo} class:win={inWindow(b)}
                      title="{b.lo}~{b.hi}회차 전 · {b.lost}/{b.pool}{inWindow(b) ? ' · 127~151 구간' : ''}"
                      onclick={() => (dpick = dpick === b.lo ? null : b.lo)}>
                <i style="height: {(b.lost / b.pool / lmax) * 100}%"></i>
              </button>
            {/each}
          </div>
          <div class="drow axis">
            {#each dist.bins as b, k (b.lo)}
              <span class="dtick" class:win={inWindow(b)}>{k % 4 === 0 ? b.lo : ''}</span>
            {/each}
          </div>
          <div class="drow mark">
            {#each dist.bins as b (b.lo)}
              <span class="dmark" class:win={inWindow(b)}>
                {#if b.lo === DISTANCE_WINDOW.lo - ((DISTANCE_WINDOW.lo - 1) % 25)}
                  <em>{DISTANCE_WINDOW.lo}~{DISTANCE_WINDOW.hi} 구간</em>
                {/if}
              </span>
            {/each}
          </div>
        </div>
      </div>
      <p class="note dim tight">
        가로 : 당첨 회차로부터 몇 회차 전 (25회차 단위) · 세로 : 그 구간 줄 중의 비율.
      </p>

      {@render opened()}

      <p class="note">
        <strong>{DISTANCE_WINDOW.lo}~{DISTANCE_WINDOW.hi}회차 전</strong> 구간 — 이 회차에서는
        {num(dist.window.pool)}줄 중 {num(dist.window.won)}줄이 3개 이상
        ({dist.window.pool ? pc(dist.window.won / dist.window.pool) : '—'} %).
        1,039개 회차 전체로 보면 이 구간만 {pc(DISTANCE_WINDOW.rate)} %로,
        전체 평균 {pc(DISTANCE_WINDOW.base)} %보다 높습니다 — 앞 절반에서 골라 뒤 절반에서
        확인해도 남은 <strong>유일한</strong> 구간입니다. 다만 차이는 작습니다 (약 1.09배).
        한 회차만으로는 아무것도 말할 수 없습니다.
      </p>

      <!-- Le test hors échantillon : choisir sur la première moitié, vérifier
           sur la seconde. C'est le seul garde-fou contre « j'ai trouvé une
           fenêtre » — une fenêtre trouvée se trouve toujours. -->
      <div class="halves">
        <div class="shead">
          <b>앞에서 고르고, 뒤에서 확인</b>
          <span class="dim">
            기준 {num(DISTANCE_SPLIT.rounds[0])}~{num(DISTANCE_SPLIT.mid - 1)}회에서 고른 구간을,
            {num(DISTANCE_SPLIT.mid)}~{num(DISTANCE_SPLIT.rounds[1])}회에서 다시 잽니다
          </span>
        </div>
        {#each [DISTANCE_SPLIT.won, DISTANCE_SPLIT.lost] as fam2, fi (fi)}
          <div class="scroll">
            <table class="stable">
              <thead>
                <tr>
                  <th>{fam2.label}</th>
                  <th class="val">앞 절반</th><th class="val">z</th>
                  <th class="val">뒤 절반</th><th class="val">z</th>
                </tr>
              </thead>
              <tbody>
                {#each fam2.rows as r, ri (r.lo)}
                  <tr class:kept={ri === 0 && fi === 0}>
                    <td>{r.lo}~{r.hi}회차 전</td>
                    <td class="val">{pc2(r.a)} %</td>
                    <td class="val" class:up={r.za > 0}>{z2(r.za)}</td>
                    <td class="val">{pc2(r.b)} %</td>
                    <td class="val" class:up={r.zb > 0} class:down={r.zb < 0}>{z2(r.zb)}</td>
                  </tr>
                {/each}
                <tr class="law">
                  <td>전체 평균</td>
                  <td class="val">{pc2(fam2.base[0])} %</td><td></td>
                  <td class="val">{pc2(fam2.base[1])} %</td><td></td>
                </tr>
              </tbody>
            </table>
          </div>
        {/each}
        <p class="note dim tight">
          앞 절반에서 z가 높았던 구간은 뒤 절반에서 거의 모두 0 근처로 내려앉습니다 —
          고르는 행위 자체가 만들어낸 것이기 때문입니다.
          <strong>{DISTANCE_WINDOW.lo}~{DISTANCE_WINDOW.hi}만 버팁니다</strong> (6.98 % → 6.99 %).
          꽝 쪽에서도 같은 구간이 평균보다 낮아, 방향이 맞습니다.
        </p>
      </div>
    {:else}
      <!-- Avant le tirage, on ne sait pas qui touchera. Mais on sait déjà
           combien de lignes se tiennent à chaque distance, et où tombent les
           deux fenêtres — c'est ce qu'on veut avoir sous les yeux le samedi
           matin, plutôt qu'un bloc vide. -->
      <p class="note">
        <strong>{fmt(dist.target)}는 아직 추첨 전입니다.</strong>
        누가 맞힐지는 모르지만, 각 거리에 <em>몇 줄이 있는지</em>와
        두 구간이 <em>어느 회차에 걸리는지</em>는 이미 정해져 있습니다.
      </p>
      <div class="scroll">
        <div class="dbars">
          <span class="drow-lead">거리별 줄 수 <i>{num(dist.lines)}회차</i></span>
          <div class="drow">
            {#each dist.bins as b (b.lo)}
              <button class="dbar pool" class:picked={dpick === b.lo} class:win={inWindow(b)}
                      title="{b.lo}~{b.hi}회차 전 · {b.pool}줄"
                      onclick={() => (dpick = dpick === b.lo ? null : b.lo)}>
                <i style="height: {(b.pool / pmax) * 100}%"></i>
              </button>
            {/each}
          </div>
          <div class="drow axis">
            {#each dist.bins as b, k (b.lo)}
              <span class="dtick" class:win={inWindow(b)}>{k % 4 === 0 ? b.lo : ''}</span>
            {/each}
          </div>
        </div>
      </div>

      <div class="dsides">
        <div class="dside won">
          <span class="dlabel">3개 이상 구간 <i>버틴 쪽</i></span>
          <span class="dbig">{fmt(winRang.lo)} ~ {fmt(winRang.hi)}</span>
          <span class="dgrid">
            <span>거리<b>{DISTANCE_WINDOW.lo}~{DISTANCE_WINDOW.hi}</b></span>
            <span>줄<b>{num(dist.window.pool)}</b></span>
            <span>과거 비율<b>{pc2(DISTANCE_WINDOW.rate)} %</b></span>
          </span>
        </div>
        <div class="dside lost">
          <span class="dlabel">꽝 구간 <i>무너진 쪽</i></span>
          <span class="dbig">{fmt(lostRang.lo)} ~ {fmt(lostRang.hi)}</span>
          <span class="dgrid">
            <span>거리<b>{DISTANCE_WINDOW_LOST.lo}~{DISTANCE_WINDOW_LOST.hi}</b></span>
            <span>z<b>+2.07 → +0.07</b></span>
          </span>
        </div>
      </div>

      {@render opened()}

      <p class="note dim tight">
        아래 <strong>회차별 번호</strong>에서 이 회차들은 금색·푸른 점선으로 표시됩니다.
        추첨이 끝나면 여기에 당첨 줄과 꽝 줄이 채워집니다.
      </p>
    {/if}
  </section>
  {/if}

  <section class="panel">
    <div class="head">
      <h2>회차별 번호</h2>
      <span class="gloss">{fmt(famRang)} · 일곱 자리</span>
      <span class="right">
        {num(columns.reduce((a, c) => a + c.lines.length, 0))}줄
      </span>
    </div>

    <!-- Sept colonnes côte à côte : c'est le propos de la page — voir d'un
         seul coup ce que les sept positions ramènent du même 회차. Le cadre
         défile de côté plutôt que d'écraser les chiffres. -->
    <div class="scroll fam">
      {#each columns as col (col.key)}
        {@const cv = hitsVerdict(col.hitTally)}
        {@const nt = nowTally(col)}
        <div class="col">
          <div class="ctitle">
            <span class="clabel">{col.column}</span>
            <span class="n target"
                  style="--tone: var({SECTION_VARS[sectionOf(col.target)]})"
                  >{col.target}</span>
            <span class="dim">{num(col.lines.length)}줄</span>
          </div>

          <div class="tallies">
            <div class="trow">
              <span class="tlead now">{fmt(famRang)}</span>
              {#each nt.tally as c, v (v)}
                <span class="tcell" class:zero={c === 0}>{v}<b>{c}</b></span>
              {/each}
              <span class="tcell sum">합<b>{num(nt.sum)}</b></span>
            </div>
            <div class="trow">
              <span class="tlead">당첨여부 <i>{famAfter ? fmt(draws.rangs[famAt + 1]) : '—'}</i></span>
              {#each col.hitTally as c, v (v)}
                <span class="tcell" class:zero={c === 0}>{v}<b>{c}</b></span>
              {/each}
              <span class="tcell sum">합<b>{num(col.hitSum)}</b></span>
            </div>
            <div class="trow">
              <span class="tlead">제외여부</span>
              {#each col.outTally as c, v (v)}
                <span class="tcell" class:zero={c === 0}>{v}<b>{c}</b></span>
              {/each}
              <span class="tcell sum">제외<b>{num(col.outSum)}</b></span>
            </div>
            <!-- La seule ligne qui dise si cette colonne vaut mieux qu'une
                 autre : sa moyenne, et celle du hasard. -->
            {#if cv}
              <div class="trow">
                <span class="tlead">평균</span>
                <span class="tcell wide">실제<b>{cv.mean.toFixed(3)}</b></span>
                <span class="tcell wide">기대<b>{cv.expected.toFixed(3)}</b></span>
                <span class="tcell wide" class:sum={cv.gap > 0}
                      >차이<b>{signed(cv.gap)}</b></span>
              </div>
            {/if}
          </div>

          <div class="lines">
            <!-- L'en-tête des trois badges : à quel 회차 chaque marque renvoie. -->
            <div class="fline lhead">
              <span class="lno"></span>
              <span class="lrang">회차</span>
              <span class="grow"></span>
              <span class="badge now" title="바탕이 칠해진 번호 · 현재 회차">{fmt(famRang)}</span>
              <span class="badge" title="밑줄 친 번호 · 당첨 회차">{famAfter ? fmt(draws.rangs[famAt + 1]) : '—'}</span>
              <span class="badge out">제외</span>
            </div>
            {#each col.lines.slice(0, deep) as l, k (k)}
              <div class="fline" class:hot={l.hits >= 4}
                   class:win={inWinRang(l.rang)} class:winl={inLostRang(l.rang)}
                   title={inWinRang(l.rang) || inLostRang(l.rang)
                     ? `${dist.target - l.rang}회차 전 — ${inWinRang(l.rang)
                         ? `${DISTANCE_WINDOW.lo}~${DISTANCE_WINDOW.hi} (3개 이상 구간)`
                         : `${DISTANCE_WINDOW_LOST.lo}~${DISTANCE_WINDOW_LOST.hi} (꽝 구간)`}`
                     : undefined}>
                <span class="lno">{k + 1}</span>
                <span class="lrang">{fmt(l.rang)}</span>
                {#each l.shown as n, j (j)}
                  <span class="n"
                        class:cut={excluded.includes(n)}
                        class:now={famNow.includes(n)}
                        class:hit={famAfter?.includes(n)}
                        class:lead={fam.sort && j === 0}
                        style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
                {/each}
                <span class="badge now" title="현재 회차와 겹치는 번호"
                      >{nowOverlap(l)}</span>
                <span class="badge" title="당첨 회차에 다시 나온 번호">{l.hits}</span>
                <span class="badge out" class:zero={l.out === 0}>{l.out}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    {#if columns.some((c) => c.lines.length > deep)}
      <div class="more">
        <button onclick={() => (deep += FSTEP)}>
          더 보기 <span class="dim">{num(deep)}줄까지</span>
        </button>
        <button class="all"
                onclick={() => (deep = Math.max(...columns.map((c) => c.lines.length)))}
          >전부</button>
      </div>
    {/if}

    <p class="note dim">
      각 줄의 두 숫자는 <strong>당첨여부</strong>(다음 회차에 다시 나온 개수)와
      <strong>제외여부</strong>(제외번호 리스트에 든 개수)입니다.
      {#if fam.sort}
        <br />제외여부가 적은 줄이 위로 옵니다. 각 줄은 그 자리의 번호가 맨
        앞에 오고, 제외된 번호는 뒤로 밀립니다.
      {/if}
      <br />바탕이 칠해진 번호는 <strong>현재 회차</strong>의 당첨번호,
      빗금 친 번호는 <strong>제외번호</strong>입니다. 줄 끝의 세 숫자는
      <strong>현재 회차</strong>와 겹친 수 · <strong>당첨여부</strong> · <strong>제외여부</strong>입니다.
      {#if famAfter}
        <br />밑줄 친 번호는 <strong>당첨 회차</strong>에 다시 나온 번호입니다.
      {/if}
      {#if winRang && lostRang}
          <br />줄 왼쪽의 <strong>금색 점선</strong>은 위 <strong>거리</strong> 칸의
          {DISTANCE_WINDOW.lo}~{DISTANCE_WINDOW.hi}회차 전 구간 —
          여기서는 <strong>{fmt(winRang.lo)} ~ {fmt(winRang.hi)}</strong>,
          모두 {num(dist.window.pool)}회차입니다.
          <br /><strong class="cold">푸른 점선</strong>은 꽝 쪽에서 가장 높았던
          {DISTANCE_WINDOW_LOST.lo}~{DISTANCE_WINDOW_LOST.hi}회차 전 구간 —
          여기서는 <strong>{fmt(lostRang.lo)} ~ {fmt(lostRang.hi)}</strong>입니다.
          이 구간은 <strong>뒤 절반에서 무너졌습니다</strong> (z +2.07 → +0.07) —
          비교해 보라고 놓은 것이지, 규칙이라서가 아닙니다.
          <br />점선은 <strong>거리</strong>만 뜻합니다. 그 줄이 맞혔는지는
          줄 끝의 <strong>당첨여부</strong> 숫자로 읽습니다.
          줄은 오래된 회차부터 나오므로 두 구간 모두 목록 끝쪽에 있습니다 —
          <strong>전부</strong>를 누르면 보입니다.
      {/if}
      <br />판단은 여러분의 몫입니다.
    </p>
  </section>
  {/if}

  <!-- ────────────────────────────────────────────── 테이블리스트 -->
  {#if family && fam.board}
  <section class="panel five">
    {#each [['up', 'up 1-3 vertical', '같은 값의 앞 세 자리 안'],
            ['down', 'down 4-7 vertical', '그 아래'],
            ['start', '1-5 horizontal', '당첨·이월 또는 6회 미만'],
            ['middle', '5-10 horizontal', '6~10회'],
            ['end', '10-@ horizontal', '10회 초과']] as [key, title, gloss] (key)}
      <!-- Chaque groupe occupe une part du tableau ; sept numéros tirés
           au hasard s'y répartiraient au prorata. Voilà cette part. -->
      {@const obs = stats.observed[key] / stats.n}
      {@const exp = stats.expected[key] / stats.n}
      <div class="fifth">
        <div class="head">
          <h2>{title} 라인 통계</h2>
          <span class="gloss">{gloss}</span>
        </div>
        <Compare suffix="개" keyWidth="2.5rem" showTotal={false}
                 rows={[...new Set([...Object.keys(stats[key]), ...Object.keys(stats.law[key])])]
                   .map(Number).sort((a, b) => a - b)
                   .map((k) => ({ key: k, obs: stats[key][k] ?? 0, exp: stats.law[key][k] ?? 0 }))
                   .filter((r) => r.obs > 0 || r.exp >= 0.5)} />
        <div class="ref-line">
          <span>회차당 실제 <b>{obs.toFixed(3)}</b></span>
          <span class="soft">기대 <b>{exp.toFixed(3)}</b></span>
          <span class:over={obs > exp}>차이 <b>{signed(obs - exp)}</b></span>
        </div>
      </div>
    {/each}
  </section>

  <section class="panel">
    <p class="note dim tight">
      다섯 통계는 <strong>다음 회차</strong>에 나온 일곱 번호가, 이 회차의
      표에서 <strong>어디에 있었는지</strong>를 셉니다. 가로는 미출현 간격,
      세로는 같은 값 안에서의 자리입니다.
      <br />
      <strong>5-10 horizontal</strong>은 옛 페이지에서 실수로 up 통계를
      다시 그리고 있었습니다 — 여기서는 제 값을 보여줍니다.
      <br />
      각 통계 밑의 <strong>기대</strong>는 그 자리가 표에서 차지하는 몫입니다 —
      45칸 중 몇 칸이냐에 일곱을 곱한 값. 어떤 자리가 정말 유리하다면 실제가
      이 값을 넘어야 하고, {num(stats.n)}회차를 다 더한 <strong>차이</strong>가
      0에서 멀어야 합니다. 판단은 여러분의 몫입니다.
    </p>
  </section>

  <!-- Les deux marges de la grille. C'est la question que la page pose sans
       jamais y répondre : une ligne, une colonne valent-elles mieux qu'une
       autre ? Le tableau a 45 cases, sept sortent — chaque case vaut 7/45,
       où qu'elle soit. Reste à voir ce que l'histoire en dit. -->
  {#if cellStats}
  <section class="panel">
    <div class="head">
      <h2>라인 · 위치별 당첨률</h2>
      <span class="gloss">다음 회차 당첨번호가 이 표의 어디에 있었나</span>
      <span class="right">
        {num(cellStats.n)}회차 · {num(cellStats.cells)}칸 · {num(cellStats.hits)}당첨
      </span>
    </div>

    <div class="margins">
      <div class="margin">
        <h3>세로 — 라인별</h3>
        <div class="verdict">
          <table>
            <thead>
              <tr>
                <th>라인</th>
                {#each cellStats.lines as l (l.key)}<th class="v">{l.label}</th>{/each}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>당첨률 %</td>
                {#each cellStats.lines as l (l.key)}
                  <td class="val" class:over={l.gap > 0}>{pc(l.rate)}</td>
                {/each}
              </tr>
              <tr>
                <td>기대 %</td>
                {#each cellStats.lines as l (l.key)}
                  <td class="val soft">{pc(cellStats.expected)}</td>
                {/each}
              </tr>
              <tr>
                <td>칸 수</td>
                {#each cellStats.lines as l (l.key)}
                  <td class="val soft">{num(l.seen)}</td>
                {/each}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="margin">
        <h3>가로 — 미출현 간격별</h3>
        <div class="verdict">
          <table>
            <thead>
              <tr>
                <th>간격</th>
                {#each cellStats.columns as c (c.key)}
                  <th class="v" class:won={c.key === 'won'}>{c.label}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>당첨률 %</td>
                {#each cellStats.columns as c (c.key)}
                  <td class="val" class:over={c.gap > 0}>{pc(c.rate)}</td>
                {/each}
              </tr>
              <tr>
                <td>기대 %</td>
                {#each cellStats.columns as c (c.key)}
                  <td class="val soft">{pc(cellStats.expected)}</td>
                {/each}
              </tr>
              <tr>
                <td>칸 수</td>
                {#each cellStats.columns as c (c.key)}
                  <td class="val soft">{num(c.seen)}</td>
                {/each}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Les deux marges en barres, sur la même règle 7/45 : une ligne ou une
         colonne « favorable » dépasserait le filet, et pas d'un cheveu. -->
    <div class="margins">
      <div class="margin">
        <Compare pct showTotal={false} keyWidth="3rem"
                 rows={cellStats.lines.map((l) => ({ key: l.label, obs: l.rate, exp: cellStats.expected }))}
                 obsLabel="라인별 당첨률" expLabel="기대 7 ÷ 45" />
      </div>
      <div class="margin">
        <Compare pct showTotal={false} keyWidth="3.5rem"
                 rows={cellStats.columns.map((c) => ({ key: c.label, obs: c.rate, exp: cellStats.expected }))}
                 obsLabel="간격별 당첨률" expLabel="기대 7 ÷ 45" />
      </div>
    </div>

    <p class="note dim tight">
      표에는 45개 번호가 한 칸씩 놓입니다. 다음 회차에는 그중
      <strong>정확히 7칸</strong>이 나옵니다 — 그러니 어느 칸이든, 어느
      라인이든, 어느 간격이든 나올 확률은 똑같이
      <strong>7 ÷ 45 = {pc(cellStats.expected)}%</strong>입니다. 라인이나 위치가
      정말 유리하다면 그 칸의 당첨률이 이 값에서 뚜렷이 벗어나야 합니다.
      <br />
      <strong>칸 수</strong>가 작은 줄·열은 크게 흔들립니다 — 몇 백 칸밖에
      없는 곳의 3~4%p 차이는 아무 뜻이 없습니다. 판단은 여러분의 몫입니다.
    </p>
  </section>
  {/if}

  <!-- La troisième marge : le numéro. C'est celle que tout le monde cherche
       en premier, et la seule où un classement trompe vraiment — 45 nombres
       ont toujours un premier et un dernier. -->
  {#if numStats}
  <section class="panel">
    <div class="head">
      <h2>번호별 당첨률</h2>
      <span class="gloss">45개 번호 각각이 얼마나 나왔나</span>
      <span class="right">{num(numStats.seen)}회차 · 기대 {pc(numStats.expectedRate)}%</span>
    </div>

    <div class="verdict">
      <table>
        <thead>
          <tr>
            <th>번호</th>
            {#each numStats.numbers as x (x.number)}
              <th class="v" style="--tone: var({SECTION_VARS[sectionOf(x.number)]})"
                >{x.number}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>당첨 수</td>
            {#each numStats.numbers as x (x.number)}<td class="val">{num(x.hit)}</td>{/each}
          </tr>
          <tr>
            <td>당첨률 %</td>
            {#each numStats.numbers as x (x.number)}
              <td class="val" class:over={x.gap > 0}>{pc(x.rate)}</td>
            {/each}
          </tr>
          <tr>
            <td>기대 %</td>
            {#each numStats.numbers as x (x.number)}
              <td class="val soft">{pc(numStats.expectedRate)}</td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>

    <div class="block">
      <Compare pct showTotal={false} keyWidth="2.5rem"
               rows={numStats.numbers.map((x) => ({ key: x.number, obs: x.rate, exp: numStats.expectedRate }))}
               obsLabel="번호별 당첨률" expLabel="기대 7 ÷ 45" />
    </div>

    <p class="note dim tight">
      가장 많이 나온 번호는 <strong>{numStats.top.number}번</strong>
      ({num(numStats.top.hit)}회 · {pc(numStats.top.rate)}%), 가장 적게 나온
      번호는 <strong>{numStats.bottom.number}번</strong>
      ({num(numStats.bottom.hit)}회 · {pc(numStats.bottom.rate)}%)입니다.
      차이는 {num(numStats.top.hit - numStats.bottom.hit)}회.
      <br />
      <strong>하지만 이 차이는 신호가 아닙니다.</strong> 45개 숫자를 줄 세우면
      언제나 1등과 꼴찌가 생깁니다 — 문제는 그 폭이 우연으로 설명되는지입니다.
      45개 전체를 한 번에 검정하면
      <strong>χ² = {numStats.chi2.toFixed(1)}</strong> (자유도 {numStats.df}),
      <strong>p = {numStats.p.toFixed(3)}</strong>.
      {#if numStats.p > 0.05}
        p가 크다는 것은 <strong>완전히 평범하다</strong>는 뜻입니다 — 공평한
        45개 번호를 {num(numStats.seen)}번 뽑았을 때 흔히 나오는 정도의
        들쭉날쭉함입니다. 어떤 번호도 다른 번호보다 잘 나오지 않습니다.
      {:else}
        p가 작습니다 — 이 정도의 불균형은 우연으로 설명하기 어렵습니다.
        추첨기나 데이터를 살펴볼 이유가 됩니다.
      {/if}
    </p>
  </section>
  {/if}

  <!-- Les listes de référence : les familles de numéros, une fois pour
       toutes. L'ancien les réécrivait dans chaque carte. -->
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
    <p class="note dim">
      옛 페이지는 <strong>홀수</strong>에 짝수를, <strong>짝수</strong>에
      홀수를 넣고 있었습니다 — 여기서는 제자리에 있습니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>회차별 번호</h2>
      <span class="gloss">
        {fmt(nextRang(draws))}(다음 회차) · 그리고 {fmt(rang)}부터 아래로
      </span>
      <span class="right">{num(boards.length)}회차</span>
    </div>
    <p class="note dim tight">
      첫 칸 <strong>당첨</strong>은 그 회차에 나온 일곱 번호입니다 — 괄호 안은
      당첨인지 이월인지. 나머지 칸은 미출현 회차 수입니다.
      밑줄 친 번호는 <strong>당첨 회차</strong>에 나온 번호입니다.
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
        <!-- Pas de « 당첨 회차 » sur la carte à venir : le 회차 lui-même
             n'est pas tiré, parler de son suivant n'aurait pas de sens. -->
        <div class="pair" class:hidden={b.upcoming}>
          <span class="lead">당첨 회차</span>
          {#if b.after}
            <b class="rg">{fmt(b.rang + 1)}</b>
            <span class="grid">
              {#each b.after as n, j (j)}
                <span class="n hit" class:bonus={j === 6}
                      style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
              {/each}
            </span>
          {:else}
            <span class="dim">아직 없습니다</span>
          {/if}
        </div>
        <div class="pair wide">
          <span class="lead">반복 수</span>
          <span class="grid">
            {#each b.repeats as r (r.label)}
              <span class="rep" class:flag={r.flag}>{r.label}<i>:</i><b>{r.count}</b></span>
            {/each}
          </span>
        </div>
        <div class="pair">
          <span class="lead">리스트 I</span>
          <span class="grid">
            {#each b.sample.five as n (n)}
              <span class="n" style="--tone: var({SECTION_VARS[sectionOf(n)]})">{n}</span>
            {/each}
          </span>
        </div>
        <div class="pair wide">
          <span class="lead">리스트 II</span>
          <span class="rnums">{b.sample.thirtyFive.join(', ')}</span>
        </div>
      </div>

      <div class="scroll">
        <table class="board">
          <thead>
            <tr>
              <th>라인</th>
              {#each b.board.columns as c (c.key)}
                <th class="v" class:won={c.key === 'won'}>{c.label}</th>
              {/each}
            </tr>
            <!-- Sous chaque en-tête, ce que cette colonne a donné sur toute
                 l'histoire ; dans la colonne 라인, ce qu'a donné la ligne.
                 Les deux se lisent contre 15,6 %. -->
            <tr class="rate">
              <th>당첨률</th>
              {#each b.board.columns as c (c.key)}
                {@const s = colRate.get(c.key)}
                <th class="v" title={s
                  ? `간격 ${c.label} : 과거 ${num(s.seen)}칸 중 ${num(s.hit)}칸이 다음 회차에 당첨`
                  : null}>{s ? pc(s.rate) : '·'}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each { length: b.board.height } as _, r (r)}
              {@const ls = cellStats?.lines[r]}
              <tr>
                <td class="lno">{r + 1}
                  {#if ls}<i class="rate" title="라인 {r + 1} : 과거 {num(ls.seen)}칸 중 {num(ls.hit)}칸이 다음 회차에 당첨">{pc(ls.rate)}</i>{/if}
                </td>
                {#each b.board.columns as c (c.key)}
                  {@const e = c.entries[r]}
                  <td class="slot" class:won={c.key === 'won'}
                      class:lit={e && paint[e.number]}
                      style={e && paint[e.number]
                        ? `--pick: var(${paint[e.number]})` : null}>
                    {#if e}
                      <span class="n" class:hit={e.hit}
                            style="--tone: var({SECTION_VARS[sectionOf(e.number)]})"
                            >{e.number}{#if c.key === 'won'}<span class="tag">{e.label}</span>{/if}</span>
                      <!-- Le taux du numéro lui-même : la troisième marge,
                           celle qu'on cherche quand on regarde une case. -->
                      {#if numRate}
                        {@const ns = numRate[e.number - 1]}
                        <i class="nrate" class:over={ns.gap > 0}
                           title="{e.number}번 : 과거 {num(cellStats.n)}회차 중 {num(ns.hit)}회 당첨 ({pc(ns.rate)}%) · 기대 {pc(numStats.expectedRate)}%"
                          >{pc(ns.rate)}</i>
                      {/if}
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/each}

  {#if at + 1 > boards.length}
    <div class="more wide">
      <button onclick={() => (lcount += LSTEP)}>
        더 보기 <span class="dim">{num(boards.length)} / {num(at + 1)}회차</span>
      </button>
      <button class="all" onclick={() => (lcount += LSTEP * 5)}>+50</button>
    </div>
  {/if}
  {/if}

  <!-- ──────────────────────────────────────────────── 제외번호 -->
  {#if family && fam.deleted}
  <section class="panel three">
    {#each [['all', '제외번호 전부 통계', '45개 번호 모두'],
            ['won', '제외번호에서 당첨번호 통계', '나온 일곱 번호'],
            ['lost', '제외번호만 통계', '나오지 않은 서른여덟']] as [key, title, gloss] (key)}
      <div class="third">
        <div class="head">
          <h2>{title}</h2>
          <span class="gloss">{gloss}</span>
        </div>
        {#if key === 'all' || !delVerdict}
          <Bars data={delTally[key]} suffix="번" />
        {:else}
          <!-- Les gagnants et les absents contre la référence des 45 : si le
               passé ne compte pas, chaque tiers reprend la forme du tout. -->
          {@const total = Object.values(delTally[key]).reduce((a, c) => a + c, 0)}
          <Compare suffix="번" showTotal={false}
                   rows={delVerdict.rows.map((r) => ({ key: r.v, obs: delTally[key][r.v] ?? 0, exp: r.all * total }))
                     .filter((r) => r.obs > 0 || r.exp >= 0.5)}
                   obsLabel={key === 'won' ? '당첨번호' : '나오지 않은 번호'} expLabel="기대 (45개 전부의 비율)" />
        {/if}
      </div>
    {/each}
  </section>

  {#if delVerdict}
  <section class="panel">
    <div class="head">
      <h2>제외번호 검증</h2>
      <span class="gloss">당첨번호와 45개 번호를 나란히</span>
      <span class="right">{num(delVerdict.wonT)}개 당첨번호</span>
    </div>

    <div class="verdict">
      <table>
        <thead>
          <tr>
            <th>앞 10회 출현</th>
            {#each delVerdict.keys as v (v)}<th class="v">{v}</th>{/each}
            <th class="v">평균</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>당첨번호</td>
            {#each delVerdict.rows as r (r.v)}<td class="val">{pc(r.won)}%</td>{/each}
            <td class="val sum">{delVerdict.wonMean.toFixed(3)}</td>
          </tr>
          <tr>
            <td>45개 전부</td>
            {#each delVerdict.rows as r (r.v)}<td class="val soft">{pc(r.all)}%</td>{/each}
            <td class="val soft">{delVerdict.allMean.toFixed(3)}</td>
          </tr>
          <tr>
            <td>차이</td>
            {#each delVerdict.rows as r (r.v)}
              <td class="val soft">{pc(r.won - r.all)}</td>
            {/each}
            <td class="val" class:over={delVerdict.wonMean < delVerdict.allMean}
              >{signed(delVerdict.wonMean - delVerdict.allMean)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="note dim tight">
      제외번호가 뜻이 있으려면, <strong>당첨번호</strong> 줄이
      <strong>45개 전부</strong> 줄보다 왼쪽으로 — 적게 나온 쪽으로 — 쏠려야
      합니다. 두 줄이 겹친다면 앞 10회차의 출현 횟수는 다음 회차와 아무
      관계가 없다는 뜻입니다.
      <br />
      나오지 않은 서른여덟의 평균은
      <strong>{delVerdict.lostMean.toFixed(3)}</strong>입니다.
    </p>
  </section>
  {/if}

  <section class="panel">
    <p class="note dim tight">
      각 회차마다, 45개 번호가 <strong>앞 10회차</strong>에 몇 번 나왔는지
      셉니다 — 보너스 포함, 그 회차 자신은 빼고. 열 번의 추첨에 일곱
      번호씩이니 한 회차의 45칸을 다 더하면 언제나 70입니다.
      <br />
      가운데 통계는 그 회차에 <strong>실제로 나온</strong> 일곱 번호만,
      오른쪽은 나오지 않은 서른여덟만 봅니다.
      <br />
      옛 페이지는 <strong>45번</strong>을 이 나눔에서 빠뜨리고 있었습니다 —
      늘 '나오지 않은' 쪽에 있었습니다. 여기서는 제자리입니다.
      판단은 여러분의 몫입니다.
    </p>
  </section>

  <section class="panel">
    <div class="head">
      <h2>제외번호 패턴</h2>
      <span class="gloss">회차별 · 번호별 · {fmt(delRang)}까지</span>
      <span class="right">{num(delRows.length)}회차</span>
    </div>

    <div class="scroll tablebox tall">
      <table class="del">
        <thead>
          <tr>
            <th>회차</th>
            {#each { length: 45 } as _, k (k)}
              <th class="v" style="--tone: var({SECTION_VARS[sectionOf(k + 1)]})"
                >{k + 1}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each delShown as row (row.rang)}
            {@const drawn = delDrawn(row.index)}
            <tr>
              <td>{fmt(row.rang)}</td>
              {#each { length: 45 } as _, k (k)}
                {@const v = row.counts[k + 1]}
                <td class="dcell" class:won={drawn.has(k + 1)}
                    style={v ? `background: color-mix(in srgb, var(--gold) ${v * 90 / (delPeak + 1)}%, transparent)` : null}
                    >{v || ''}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if dshow < delRows.length}
      <div class="more">
        <button onclick={() => (dshow += DSTEP)}>
          더 보기 <span class="dim">{num(dshow)} / {num(delRows.length)}</span>
        </button>
        <button class="all" onclick={() => (dshow = delRows.length)}>전부</button>
      </div>
    {/if}

    <p class="note dim">
      진한 칸일수록 앞 10회차에 자주 나온 번호입니다. 테두리가 있는 칸은 그
      회차에 <strong>실제로 나온</strong> 번호입니다.
    </p>
  </section>
  {/if}
{/if}

<style>
  /* La barre du hasard, partout la même forme : ce qu'on a compté, ce que
     le hasard aurait donné, et l'écart. Elle se lit après le chiffre, pas
     à sa place — d'où le petit corps et le gris. */
  .verdict { margin-top: 0.9rem; overflow-x: auto; }
  .verdict table { width: auto; min-width: 100%; font-size: 0.75rem; }
  .verdict td, .verdict th { padding: 0.15rem 0.5rem; white-space: nowrap; }
  .verdict tbody td:first-child { color: var(--muted); }
  .soft { color: var(--muted); }
  /* Au-dessus de la barre — le seul cas qui mérite qu'on s'arrête. */
  .over { color: var(--gold-deep); font-weight: 600; }

  /* Les deux marges côte à côte quand la place le permet, l'une sous
     l'autre sinon — chacune défile de son côté. */
  .margins { display: grid; gap: 1.5rem; }
  .margins + .margins, .block { margin-top: 1rem; }
  .margin h3 {
    font-size: 0.8125rem; font-weight: 600; color: var(--ink-soft);
    margin: 0 0 0.4rem;
  }
  .margin .verdict { margin-top: 0; }

  /* Les taux d'historique dans la carte d'un 회차 : ils ne parlent pas de
     ce tirage-ci, donc ils s'effacent derrière lui. */
  .board tr.rate th {
    font-size: 0.5625rem; color: var(--muted); font-weight: 400;
    padding-top: 0; padding-bottom: 0.2rem;
    border-bottom: 1px solid var(--line-soft);
  }
  .lno i.rate {
    display: block; font-style: normal;
    font-size: 0.5625rem; color: var(--muted); line-height: 1.1;
  }
  /* Le taux du numéro, sous le numéro. Il ne dit rien de ce 회차-ci — il
     reste donc au second plan, mais il est là où l'œil le cherche. */
  .slot i.nrate {
    display: block; font-style: normal;
    font-size: 0.5rem; color: var(--muted); line-height: 1.1;
  }
  .slot i.nrate.over { color: var(--gold-deep); }

  .ref-line {
    display: flex; gap: 0.9rem; flex-wrap: wrap;
    margin-top: 0.5rem; font-size: 0.6875rem; color: var(--muted);
  }
  .ref-line b { font-family: var(--figure); color: var(--ink-soft); margin-left: 0.2rem; }
  .ref-line .over b { color: var(--gold-deep); }

  .tcell.wide { min-width: 3.9rem; }

  /* Le 회차 à venir : doré, et dit en toutes lettres qu'il n'est pas tiré.
     Sans ça on lirait ses 대기 comme un résultat. */
  .rg.soon { color: var(--gold-deep); }
  .pair.hidden { display: none; }
  .soonnote { color: var(--muted); font-size: 0.75rem; }

  .bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.75rem;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .picker { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .picker button { font-size: 0.8125rem; padding: 0.25rem 0.7rem; }

  /* Le sélecteur commande tout ce qui suit : il a son propre bandeau, avec
     les deux tirages qu'il met face à face. */
  .pickbar {
    display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .pickbar label, .inline {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.8125rem; color: var(--muted);
  }
  select {
    font: inherit; font-size: 0.8125rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--surface); color: var(--ink);
  }
  select:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 1px; }

  .two-draws { display: flex; gap: 1.75rem; flex-wrap: wrap; }
  .draw .lead b { font-family: var(--figure); font-weight: 600; color: var(--ink); margin-left: 0.25rem; }
  .draw { display: flex; align-items: center; gap: 0.6rem; }
  .lead { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }

  .grid { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .n { font-family: var(--figure); color: var(--tone); min-width: 1.4rem; text-align: center; }
  .n.bonus { border-bottom: 1px dashed var(--gold); color: var(--gold); }
  /* Le numéro par lequel tout passe — celui de la position choisie. */
  .n.target { font-weight: 700; box-shadow: inset 0 -2px 0 var(--gold); }

  .tablebox { max-height: 24rem; overflow-y: auto; }
  .tablebox.tall { max-height: 34rem; }
  table { width: 100%; font-size: 0.8125rem; }
  th, td { padding: 0.25rem 0.5rem; text-align: left; }
  th {
    position: sticky; top: 0; background: var(--surface);
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  th.v, td.val { text-align: right; }
  td { border-bottom: 1px solid var(--line-soft); }
  tbody tr { content-visibility: auto; contain-intrinsic-size: auto 1.6rem; }
  .val { font-family: var(--figure); white-space: nowrap; }
  .val.zero { color: var(--line); }
  .sum { color: var(--gold-deep); font-weight: 600; }

  .num { font-family: var(--figure); color: var(--tone); text-align: center; }
  .num.bonus { color: var(--gold); }
  /* Ressorti au 회차 suivant — c'est ce que compte le 당첨여부. */
  .num.hit { box-shadow: inset 0 -2px 0 var(--gold); font-weight: 600; }
  tr.hot td { background: var(--gold-wash); }

  /* Le ruban : une case par ligne, dans l'ordre du tableau. */
  .strip { display: flex; flex-wrap: wrap; gap: 2px; }
  .cell {
    width: 1.15rem; height: 1.15rem; border-radius: 2px;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--figure); font-size: 0.6875rem; color: var(--ink-soft);
    border: 1px solid var(--line-soft);
  }
  .legend {
    display: flex; align-items: center; gap: 0.25rem;
    margin-top: 0.7rem; font-size: 0.75rem; flex-wrap: wrap;
  }
  .legend .name { margin-left: 0.5rem; color: var(--ink-soft); }

  .buckets { display: grid; gap: 0.9rem; margin-bottom: 1.1rem; }
  .bucket { border-left: 2px solid var(--line); padding-left: 0.75rem; }
  .btitle { font-size: 0.8125rem; color: var(--ink-soft); margin-bottom: 0.35rem; }
  .btitle .key { color: var(--gold-deep); font-family: var(--figure); }
  .btitle strong { color: var(--ink); font-family: var(--figure); }
  .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .chip {
    font-size: 0.75rem; font-family: var(--figure); color: var(--tone);
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 0.05rem 0.35rem; white-space: nowrap;
  }
  .chip .rep { color: var(--muted); margin-left: 0.3rem; }

  .win { font-size: 0.6875rem; padding: 0.1rem 0.4rem; margin-left: 0.2rem; }
  .warn { margin: 0 0 1rem; border-left: 2px solid var(--gold); padding-left: 0.75rem; }

  /* Le blanc qui sépare les sept positions des deux pages d'ensemble. */
  .split { width: 0.6rem; }

  .dellbar {
    display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .dellbar label { display: flex; align-items: center; gap: 0.5rem;
                   font-size: 0.8125rem; color: var(--muted); }
  .dellbar .grow { flex: 1 1 18rem; }
  input[type="text"] {
    font: inherit; font-size: 0.8125rem; flex: 1;
    padding: 0.25rem 0.5rem; min-width: 8rem;
    border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--surface); color: var(--ink);
  }
  input:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 1px; }
  .chips { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
  .chip {
    font-size: 0.75rem; font-family: var(--figure);
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 0.05rem 0.35rem;
  }
  .chip.out { color: var(--muted); text-decoration: line-through; }

  /* 거리 — les deux familles, puis les deux rangées de barres. */
  .dsides {
    display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.9rem;
  }
  .dside {
    flex: 1 1 15rem; border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--surface); padding: 0.7rem 0.9rem;
    border-left: 3px solid var(--line);
  }
  /* Deux couleurs, et les mêmes partout : l'or pour les lignes qui touchent,
     le froid de 차가운번호 pour celles qui ratent. */
  .dside.won { border-left-color: var(--gold); }
  .dside.lost { border-left-color: var(--t-dead); }
  .dside.won .dlabel { color: var(--gold-deep); }
  .dside.lost .dlabel { color: var(--t-dead-text); }
  .dlabel { display: block; font-size: 0.8125rem; color: var(--ink-soft); }
  .dlabel i { font-style: normal; color: var(--muted); font-size: 0.75rem; }
  .dbig {
    display: block; font-family: var(--figure); font-size: 1.5rem;
    line-height: 1.2; margin: 0.15rem 0 0.35rem;
  }
  .dbig b { font-size: 0.8125rem; font-weight: 400; color: var(--muted); margin-left: 0.15rem; }
  .dgrid { display: flex; gap: 0.9rem; font-size: 0.75rem; color: var(--muted); }
  .dgrid b {
    display: block; font-family: var(--figure); font-size: 0.875rem;
    font-weight: 500; color: var(--ink);
  }

  .dbars { min-width: 34rem; margin-top: 1rem; padding-bottom: 1.1rem; }
  .drow-lead {
    display: flex; align-items: center; gap: 0.35rem;
    font-size: 0.75rem; color: var(--muted); margin-bottom: 0.2rem;
  }
  .drow-lead::before {
    content: ''; width: 0.6rem; height: 0.6rem; border-radius: 2px;
    background: var(--swatch, var(--line));
  }
  .drow-lead.won { color: var(--gold-deep); --swatch: var(--gold); }
  .drow-lead.lost { color: var(--t-dead-text); --swatch: var(--t-cold); }
  .drow {
    display: flex; gap: 2px; align-items: flex-end; height: 3.25rem;
    border-bottom: 1px solid var(--line); margin-bottom: 0.75rem;
  }
  .dbar {
    flex: 1 1 0; display: flex; align-items: flex-end; height: 100%;
    padding: 0; border: 0; background: none; cursor: pointer;
    border-radius: 2px 2px 0 0;
  }
  .dbar:hover { background: var(--gold-wash); }
  .dbar.picked { background: var(--gold-wash); box-shadow: inset 0 -2px 0 var(--gold-deep); }
  .dbar:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 1px; }
  .dbar i { display: block; width: 100%; min-height: 1px; border-radius: 1px 1px 0 0; }
  .dbar.won i { background: var(--gold); }
  .dbar.lost i { background: var(--t-cold); }
  /* Avant le tirage : le vivier seul, sans couleur de résultat. */
  .dbar.pool i { background: var(--gold-soft); }

  .dopen {
    margin-top: 0.9rem; border: 1px solid var(--line);
    border-radius: var(--radius); background: var(--surface); overflow: hidden;
  }
  .dohead {
    display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap;
    padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line);
    font-size: 0.8125rem;
  }
  .dohead b { font-family: var(--figure); }
  .dohead .dim { font-size: 0.75rem; }
  .doclose {
    margin-left: auto; border: 1px solid var(--line); border-radius: 999px;
    background: none; color: var(--ink-soft); cursor: pointer;
    font-size: 0.75rem; padding: 0.1rem 0.6rem;
  }
  .doclose:hover { background: var(--gold-wash); }
  .dotable { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .dotable th {
    text-align: left; font-weight: 500; color: var(--muted);
    font-size: 0.75rem; padding: 0.3rem 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  .dotable td { padding: 0.2rem 0.75rem; border-bottom: 1px solid var(--line-soft); }
  .dotable tr.won { background: var(--gold-wash); }
  .dotable tr.won td:first-child { box-shadow: inset 3px 0 0 var(--gold); }
  .dotable tr.lost td:first-child { box-shadow: inset 3px 0 0 var(--t-cold); }
  .dotable tr.lost td { color: var(--t-dead-text); }
  .grid.tight { gap: 2px; }
  .drow.axis {
    height: auto; border-bottom: 0; margin-bottom: 0;
    font-family: var(--figure); font-size: 0.6875rem; color: var(--muted);
  }
  .dtick { flex: 1 1 0; text-align: left; }
  .dtick.win { color: var(--gold-deep); }

  /* Le test hors échantillon, sous le graphe. Surtout pas `.split` : ce nom
     est déjà pris plus haut par le blanc du menu (width: 0.6rem). */
  .halves {
    margin-top: 1rem; border: 1px solid var(--line);
    border-radius: var(--radius); background: var(--surface); padding: 0.75rem 0.9rem;
  }
  .shead { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; font-size: 0.8125rem; }
  .shead .dim { font-size: 0.75rem; }
  .stable { width: 100%; border-collapse: collapse; font-size: 0.8125rem; margin-top: 0.6rem; min-width: 26rem; }
  .stable th {
    text-align: left; font-weight: 500; color: var(--muted); font-size: 0.75rem;
    padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--line);
  }
  .stable td { padding: 0.2rem 0.5rem; border-bottom: 1px solid var(--line-soft); }
  .stable td.val { font-family: var(--figure); text-align: right; }
  .stable td.up { color: var(--gold-deep); }
  .stable td.down { color: var(--hit-bg); }
  .stable tr.kept { background: var(--gold-wash); }
  .stable tr.kept td:first-child { box-shadow: inset 3px 0 0 var(--gold); }
  .stable tr.law td { color: var(--muted); border-bottom: 0; }

  /* La fenêtre 127~151 : un liseré sur les deux barres qu'elle chevauche,
     et son nom sous l'axe. */
  .dbar.win { background: var(--gold-wash); }
  .dbar.win::after {
    content: ''; position: absolute; inset: 0;
    border-left: 1px dashed var(--gold); border-right: 1px dashed var(--gold);
    pointer-events: none;
  }
  .dbar { position: relative; }
  .drow.mark { height: auto; border-bottom: 0; margin: 0.1rem 0 0; }
  .dmark { flex: 1 1 0; position: relative; }
  .dmark.win { border-top: 2px solid var(--gold); }
  .dmark em {
    position: absolute; top: 0.2rem; left: 0; white-space: nowrap;
    font-style: normal; font-size: 0.6875rem; color: var(--gold-deep);
  }

  /* Les sept colonnes. */
  .fam { display: flex; gap: 1rem; align-items: flex-start; padding-bottom: 0.4rem; }
  .col { flex: none; width: 25rem; }
  .ctitle {
    display: flex; align-items: baseline; gap: 0.4rem;
    padding-bottom: 0.35rem; border-bottom: 1px solid var(--line);
    font-size: 0.8125rem;
  }
  .clabel { color: var(--muted); }
  .ctitle .dim { margin-left: auto; font-size: 0.75rem; }

  .tallies { margin: 0.4rem 0 0.5rem; display: grid; gap: 2px; }
  .trow { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
  .tlead { font-size: 0.6875rem; color: var(--muted); width: 3.4rem; flex: none; }
  .tcell {
    font-family: var(--figure); font-size: 0.625rem; color: var(--muted);
    border: 1px solid var(--line-soft); border-radius: 2px;
    padding: 0 0.15rem; min-width: 1.5rem; text-align: center;
  }
  .tcell b { color: var(--ink-soft); font-weight: 600; margin-left: 0.15rem; }
  .tcell.zero { color: var(--line); }
  .tcell.zero b { color: var(--line); }
  .tcell.sum { border-color: var(--gold-soft); }
  .tcell.sum b { color: var(--gold-deep); }

  .lines { display: grid; gap: 1px; }
  .fline {
    display: flex; align-items: center; gap: 0.15rem;
    font-size: 0.75rem; padding: 1px 0;
    border-bottom: 1px solid var(--line-soft);
  }
  .fline.hot { background: var(--gold-wash); }
  /* La fenêtre 127~151 — même langage que le graphe : un pointillé or.
     Il se superpose au fond doré de .hot sans le remplacer. */
  .fline { border-left: 2px solid transparent; }
  .fline.win { border-left-style: dashed; border-left-color: var(--gold); }
  .fline.win .lrang { color: var(--gold-deep); }
  /* La meilleure fenêtre du côté 꽝 — en bleu-gris, pour qu'on ne la
     confonde jamais avec celle du côté 당첨. Elle n'a pas tenu au test. */
  .fline.winl { border-left-style: dashed; border-left-color: var(--t-dead); }
  .fline.winl .lrang { color: var(--t-dead-text); }
  .note .cold { color: var(--t-dead-text); }
  .fline .lrang { font-family: var(--figure); font-size: 0.6875rem; color: var(--muted); width: 3.2rem; flex: none; text-align: right; margin-right: 0.3rem; }
  .lno {
    font-family: var(--figure); color: var(--muted);
    width: 1.9rem; text-align: right; flex: none; font-size: 0.6875rem;
  }
  .fline .n {
    font-family: var(--figure); color: var(--tone);
    min-width: 1.35rem; text-align: center; flex: none;
  }
  /* Rejeté par la liste 제외번호. */
  .fline .n.cut { color: var(--muted); text-decoration: line-through; }
  /* Ressorti au 회차 suivant. */
  .fline .n.now { font-weight: 700; background: var(--gold-wash); border-radius: 3px; }
  .fline .n.hit { box-shadow: inset 0 -2px 0 var(--gold); font-weight: 600; }
  /* Le numéro de la position, remonté en tête par le tri. */
  .fline .n.lead { font-weight: 700; }
  /* Trois colonnes de largeur fixe, les mêmes dans l'en-tête et dans les
     lignes, pour que « 1,239회 » et le « 4 » qu'il coiffe tombent l'un sous
     l'autre. */
  .badge {
    font-family: var(--figure); font-size: 0.6875rem;
    color: var(--gold-deep); width: 2.7rem; text-align: right; flex: none;
    box-sizing: border-box; padding: 0 0.25rem; white-space: nowrap;
  }
  .badge.now { margin-left: auto; background: var(--gold-wash); border-radius: 3px; }
  .fline .n + .badge.now { margin-left: auto; }
  .tlead.now { background: var(--gold-wash); color: var(--gold-deep); border-radius: 3px; padding: 0 0.2rem; }
  .tlead i { font-style: normal; font-family: var(--figure); color: var(--muted); font-size: 0.625rem; margin-left: 0.2rem; }
  .fline.lhead { color: var(--muted); font-size: 0.625rem; border-bottom: 1px solid var(--line); }
  .fline.lhead .grow { flex: 1 1 auto; }
  .fline.lhead .badge.now { background: var(--gold-wash); }
  .fline.lhead .badge:not(.now):not(.out) { box-shadow: inset 0 -2px 0 var(--gold); }
  .badge.out { color: var(--muted); }
  .badge.out.zero { color: var(--line); }

  /* Les cinq comptages, en grille — ils se lisent ensemble. */
  .five {
    display: grid; gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  }
  .fifth { min-width: 0; }
  .fifth h2 { font-size: 0.9375rem; }

  /* Le bandeau de listes : quinze familles, une par ligne. */
  .refs { display: grid; gap: 1px; }
  /* Chaque ligne est un bouton : on l'allume, ses numéros s'allument dans
     tous les tableaux en dessous. */
  .ref {
    display: flex; gap: 0.5rem; font-size: 0.75rem; align-items: baseline;
    background: none; border: 0; border-radius: var(--radius);
    padding: 0.15rem 0.4rem; text-align: left; width: 100%;
    cursor: pointer;
  }
  .ref:hover { background: var(--paper); }
  .ref[aria-pressed="true"] {
    background: color-mix(in srgb, var(--pick) 10%, transparent);
  }
  .ref .dot {
    width: 8px; height: 8px; border-radius: 2px; flex: none;
    box-shadow: inset 0 0 0 1px var(--line);
    align-self: center;
  }
  .ref[aria-pressed="true"] .dot { background: var(--pick); box-shadow: none; }
  .ref[aria-pressed="true"] .rlabel { color: var(--ink); font-weight: 600; }
  .rlabel { color: var(--muted); width: 4.5rem; flex: none; }
  .rnums { font-family: var(--figure); color: var(--ink-soft); }
  .head .clear { font-size: 0.6875rem; padding: 0.12rem 0.45rem; margin-left: 0.4rem; }

  /* Un numéro allumé par une liste : un lavis de sa teinte, le chiffre
     garde sa couleur de 구간. */
  .lit { background: color-mix(in srgb, var(--pick) 20%, transparent); }
  .pair .n.lit { border-radius: 2px; padding: 0 0.15rem; }

  /* Une carte par 회차. */
  .card { padding-top: 0.9rem; padding-bottom: 0.9rem; }
  .cardhead {
    display: grid; gap: 0.3rem 1.25rem;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    padding-bottom: 0.6rem; margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  .pair { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
  .pair.wide { grid-column: 1 / -1; }
  .pair .lead { font-size: 0.6875rem; color: var(--muted); width: 4rem; flex: none; }
  .pair .rg { font-family: var(--figure); color: var(--gold-deep); font-size: 0.8125rem; }
  .pair .grid { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .pair .n { font-family: var(--figure); color: var(--tone); font-size: 0.8125rem; }
  .pair .n.bonus { border-bottom: 1px dashed var(--gold); }
  .rep {
    font-family: var(--figure); font-size: 0.6875rem; color: var(--muted);
    border: 1px solid var(--line-soft); border-radius: 2px; padding: 0 0.2rem;
  }
  .rep i { color: var(--line); font-style: normal; margin: 0 0.15rem; }
  .rep b { color: var(--ink-soft); }
  .rep.flag { border-color: var(--gold-soft); }
  .rep.flag b { color: var(--gold-deep); }

  .more.wide { justify-content: center; margin: 0 0 1.25rem; }

  /* Le 차뜨 pivoté : des colonnes étroites, une pile de numéros dedans. */
  table.board th.v, table.board td.slot { text-align: center; }
  table.board th.won, table.board td.won { border-right: 1px solid var(--line); }
  table.board th.won { color: var(--gold-deep); }
  table.board td.slot { padding: 0.15rem 0.35rem; }
  table.board .lno {
    font-family: var(--figure); color: var(--muted);
    font-size: 0.6875rem; text-align: right;
  }
  table.board .n {
    font-family: var(--figure); color: var(--tone);
    display: inline-flex; align-items: baseline; gap: 0.2rem;
  }
  table.board .n.hit { box-shadow: inset 0 -2px 0 var(--gold); font-weight: 600; }
  table.board .tag { font-size: 0.625rem; color: var(--muted); }

  /* Les trois comptages de 제외번호. */
  .three {
    display: grid; gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  }
  .third { min-width: 0; }
  .third h2 { font-size: 0.9375rem; }

  /* La grille 회차 × 45 : des cases étroites, teintées par le comptage. */
  table.del th.v {
    color: var(--tone); text-align: center;
    font-size: 0.6875rem; padding: 0.2rem 0.1rem;
  }
  table.del td.dcell {
    text-align: center; font-family: var(--figure);
    font-size: 0.6875rem; padding: 0.1rem 0.15rem;
    color: var(--ink-soft); min-width: 1.15rem;
  }
  /* Sorti à ce 회차 — le cadre le dit sans changer la teinte du comptage. */
  table.del td.dcell.won {
    box-shadow: inset 0 0 0 1px var(--gold);
    color: var(--gold-deep); font-weight: 600;
  }

  .note.tight { margin: 0; }
  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
