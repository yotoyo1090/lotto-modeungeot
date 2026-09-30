<script>
  // L'enveloppe : l'en-tête, les onglets, la période, le pied de page.
  //
  // C'est aussi le seul endroit qui découpe l'historique. Un `Draws`
  // découpé rend un `Draws` — les blocs en dessous ne savent pas qu'ils
  // regardent une tranche, ce qui les garde interchangeables.
  import { combos, hogi, load, order, prizes } from './lib/data.js'
  import { seed, seeded } from './lib/store.js'
  import { day, num, rang } from './lib/format.js'
  import Range from './components/Range.svelte'
  import Home from './views/Home.svelte'
  import WinningDraws from './views/WinningDraws.svelte'
  import Flow from './views/Flow.svelte'
  import Places from './views/Places.svelte'
  import Filters from './views/Filters.svelte'
  import Sections from './views/Sections.svelte'
  import Tables from './views/Tables.svelte'
  import Lists from './views/Lists.svelte'
  import HotCold from './views/HotCold.svelte'
  import Friends from './views/Friends.svelte'
  import Patterns from './views/Patterns.svelte'
  import Excluded from './views/Excluded.svelte'
  import General from './views/General.svelte'
  import Auto from './views/Auto.svelte'
  import Manual from './views/Manual.svelte'
  import Results from './views/Results.svelte'
  import Pension from './views/Pension.svelte'
  import PensionHome from './views/PensionHome.svelte'
  import PensionFlow from './views/PensionFlow.svelte'
  import PensionLists from './views/PensionLists.svelte'
  import PensionAuto from './views/PensionAuto.svelte'
  import PensionManual from './views/PensionManual.svelte'
  import PensionResults from './views/PensionResults.svelte'
  import Basics from './views/Basics.svelte'
  import Tip from './views/Tip.svelte'
  import Machine from './views/Machine.svelte'
  import Order from './views/Order.svelte'
  import Paper from './views/Paper.svelte'
  import Shape from './views/Shape.svelte'
  import Watch from './views/Watch.svelte'
  import Pool from './views/Pool.svelte'
  import Family from './views/Family.svelte'
  import FilterTest from './views/FilterTest.svelte'
  import SectionTest from './views/SectionTest.svelte'
  import TableTest from './views/TableTest.svelte'
  import SweepTest from './views/SweepTest.svelte'
  import Wheel from './views/Wheel.svelte'
  import SandTest from './views/SandTest.svelte'
  import Report from './views/Report.svelte'
  import Guide from './views/Guide.svelte'

  // Le menu a deux étages. 조합 est une **catégorie** : elle ne montre rien
  // par elle-même, elle ouvre ses trois sous-catégories — c'est ainsi que
  // l'ancien menu les rangeait, et c'est ce qui rend visible qu'elles sont
  // trois façons de faire la même chose.
  const TABS = [
    { key: 'home', label: '분석', gloss: '홈' },
    {
      key: 'wins',
      label: '당첨번호',
      gloss: '지난 당첨 조합, 조합 화면과 같은 표로',
      children: [
        { key: 'win1', label: '당첨번호 1등', gloss: '회차마다 여섯 번호' },
        { key: 'win2', label: '당첨번호 2등', gloss: '다섯 번호 + 보너스, 회차마다 여섯 조합' },
      ],
    },
    { key: 'flow', label: '흐름 · 차뜨', gloss: '미출현 간격과 온도' },
    { key: 'places', label: '당첨 위치', gloss: '어느 번호가 어느 자리에 오나' },
    { key: 'filters', label: '필터', gloss: '여섯 지표, 세 가지 집단' },
    { key: 'sections', label: '구간', gloss: '10단위 다섯 구간' },
    { key: 'tables', label: '테이블', gloss: '일곱 패턴, 자리별로' },
    { key: 'lists', label: '리스트', gloss: '열한 가족, 개수와 합' },
    { key: 'hotcold', label: '차가운번호/뜨거운번호', gloss: '네 가지 온도' },
    { key: 'friends', label: '친구 · 중복', gloss: '함께 나온 번호' },
    { key: 'patterns', label: '패턴', gloss: '과거 출현' },
    { key: 'excluded', label: '제외번호', gloss: '최근 10회차' },
    { key: 'family', label: '패밀리', gloss: '상황별로 나눈 과거 기록' },
    { key: 'machine', label: '추첨기별', gloss: '세 추첨기는 같은 결과를 내는가' },
    { key: 'order', label: '공나온 순서', gloss: '공이 실제로 나온 순서' },
    { key: 'paper', label: '용지 마킹', gloss: '용지와, 당첨번호가 그리는 모양' },
    { key: 'shape', label: '모양 닮은꼴', gloss: '두 회차가 같은 모양을 그리는가' },
    { key: 'watch', label: '감시', gloss: '추첨기가 이번 주에도 공정했는가' },
    {
      key: 'combi',
      label: '조합',
      gloss: '세 가지 조합 방법',
      children: [
        { key: 'general', label: '일반조합', gloss: '두 가지 표' },
        { key: 'auto', label: '자동조합', gloss: '조건으로 찾기' },
        { key: 'manual', label: '수동조합', gloss: '직접 고른 조합' },
        { key: 'results', label: '조합결과', gloss: '만든 조합과 그 결과' },
      ],
    },
    { key: 'basics', label: '기본상식', gloss: '규칙과 당첨금' },
    {
      key: 'tip',
      label: '팁',
      gloss: '고른 번호의 실제 가치',
      children: [
        { key: 'fixed', label: '고정수', gloss: '두 번호를 미리 안다면' },
        { key: 'ftest', label: '필터 검정', gloss: '필터 조건이 결과를 바꾸는가' },
        { key: 'stest', label: '구간 검정', gloss: '구간을 통째로 지우면, 그 대가는' },
        { key: 'ttest', label: '테이블 검정', gloss: '테이블 › 당첨이월에서 뽑은 두 리스트' },
        { key: 'pool', label: '풀 검정', gloss: '이 묶음은 우연보다 나은가' },
        { key: 'sand', label: '사(沙) 검정', gloss: '화면의 28가지 묶음, 회차마다 다시 계산' },
        { key: 'sweep', label: '전체 검정', gloss: '167가지 방법을 한 번에, 대조군 포함' },
        { key: 'wheel', label: '휠', gloss: '무언가를 보장하는 유일한 화면' },
      ],
    },
    // R&D : les rapports de recherche, figés à la date où ils ont été
    // rendus. Ce ne sont pas des écrans qui recalculent — c'est ce qu'on a
    // cherché, ce qu'on a mesuré, et ce qu'on en a conclu ce jour-là.
    {
      key: 'rnd',
      label: 'R&D',
      gloss: '연구 보고서',
      children: [
        { key: 'rfixed', label: '고정수 보고서', gloss: '고정수 두 개 : 달라지는 것과 그 대가' },
        { key: 'rlines', label: '이월 · 라인 보고서', gloss: '이월번호와 번호 패턴 라인 — 정면 대결' },
        { key: 'rmeth', label: '고정수 방법', gloss: '고정수를 고르는 일곱 가지 방법의 경쟁' },
        { key: 'rrandom', label: '무작위성 보고서', gloss: '다섯 검정, 다섯 번 같은 답 — 그 답이 배제하는 것' },
        { key: 'rshape', label: '패턴 닮은꼴 간격 보고서', gloss: '같은 모양이 일정한 간격으로 돌아오는가' },
        { key: 'rdist', label: '거리 보고서', gloss: '당첨된 라인은 특정 거리에서 오는가' },
        { key: 'rsect', label: '구간 보고서', gloss: '814만 조합을 나누는 다섯 가지 방법 — 조각마다 크기가 있다' },
        { key: 'rcross', label: '교차 검정 보고서', gloss: '다섯 분할의 교차 : 규칙 32개, 칸 229개, 절반-절반 검정' },
      ],
    },
    {
      key: 'pension',
      label: '연금복권',
      gloss: '두 번째 복권',
      children: [
        { key: 'phome', label: '분석', gloss: '연금복권 홈' },
        { key: 'pflow', label: '흐름 · 차뜨', gloss: '자리별 미출현 간격' },
        { key: 'plists', label: '리스트', gloss: '열한 가족' },
        { key: 'ppages', label: '당첨번호', gloss: '원래 메뉴의 스무 페이지' },
        { key: 'pauto', label: '자동조합', gloss: '찾을 복권' },
        { key: 'pmanual', label: '수동조합', gloss: '산 복권' },
        { key: 'presults', label: '조합결과', gloss: '그 결과' },
        { key: 'pbasics', label: '기본상식', gloss: '규칙과 당첨금' },
      ],
    },
    // La page Update de `tools/admin.js`, servie par `npm run web` lui-même
    // (voir le plugin de `vite.config.js`) : plus besoin d'un second serveur.
    { key: 'update', label: '업데이트', gloss: '새 회차 가져오기 · 직접 입력' },
    { key: 'guide', label: '사용법', gloss: '모든 화면의 읽는 법과 활용법' },
  ]

  // Les écrans qui ne se découpent pas : ils ont leur propre sélecteur.
  const NO_RANGE = new Set(['guide', 'update', 'basics', 'fixed', 'pool', 'ftest', 'stest', 'ttest',
                            'sweep', 'wheel', 'sand', 'rfixed', 'rlines', 'rmeth', 'rrandom', 'rshape', 'rdist', 'rsect', 'rcross',
                            'phome', 'pflow', 'plists', 'ppages', 'pbasics',
                            'pauto', 'pmanual', 'presults',
                            'patterns', 'excluded', 'tables', 'hotcold', 'family', 'machine', 'order',
                            'paper', 'shape', 'watch',
                            'general', 'auto', 'manual', 'results'])

  /** Les écrans du second produit — l'en-tête doit y montrer son 회차. */
  const PENSION = new Set(['phome', 'pflow', 'plists', 'ppages', 'pbasics',
                          'pauto', 'pmanual', 'presults'])

  let state = $state({ status: 'loading', data: null, error: null })
  let tab = $state('home')
  // La sous-catégorie retenue par catégorie : revenir sur 조합 rouvre
  // l'écran qu'on y avait laissé, pas systématiquement le premier.
  let sub = $state({ wins: 'win1', combi: 'general', pension: 'phome', tip: 'fixed', rnd: 'rfixed' })

  const category = $derived(TABS.find((t) => t.key === tab) ?? null)
  const children = $derived(category?.children ?? null)
  const screen = $derived(children ? (sub[tab] ?? children[0].key) : tab)

  function open(item) {
    tab = item.key
  }

  // Ouvre un écran par sa clé, qu'il soit un onglet ou une sous-catégorie —
  // c'est ce que fait le bouton 「이 화면 열기」 du 사용법.
  function go(key) {
    const parent = TABS.find((t) => t.children?.some((c) => c.key === key))
    if (parent) {
      sub = { ...sub, [parent.key]: key }
      tab = parent.key
    } else if (TABS.some((t) => t.key === key)) {
      tab = key
    }
    window.scrollTo({ top: 0 })
  }
  let span = $state('all')

  // Les montants distribués vivent dans leur propre fichier — 123 Ko qu'on
  // ne charge qu'à la première ouverture de 기본상식.
  let prizeRows = $state(null)
  $effect(() => {
    if ((screen === 'basics' || screen === 'results' || screen === 'fixed')
        && prizeRows === null) {
      prizes().then((p) => { prizeRows = p })
    }
  })

  // La reprise des 조합 de l'ancienne base, au tout premier lancement et
  // jamais ensuite. Sans témoin, un enregistrement supprimé reviendrait au
  // rechargement suivant — la pire façon de perdre confiance en un carnet.
  // Les étiquettes 추첨기, chargées à la première ouverture de l'onglet.
  let hogiRows = $state(null)
  $effect(() => {
    if ((screen === 'machine' || screen === 'watch') && hogiRows === null) {
      hogi().then((h) => { hogiRows = h })
    }
  })
  let orderRows = $state(null)
  $effect(() => {
    if ((screen === 'order' || screen === 'watch') && orderRows === null) {
      order().then((o) => { orderRows = o })
    }
  })

  if (!seeded()) combos().then((bundle) => { if (bundle) seed(bundle) })

  // Une recherche ouverte depuis 조합결과 : on bascule sur 자동조합 et on la
  // lui passe. Il la consomme une fois, puis rend la main.
  let pendingSearch = $state(null)
  let pendingPension = $state(null)
  function replay(entry) {
    pendingSearch = entry
    sub = { ...sub, combi: 'auto' }
    tab = 'combi'
  }
  // Même chose côté 연금복권 : 조합결과 → 자동조합.
  function replayPension(entry) {
    pendingPension = entry
    sub = { ...sub, pension: 'pauto' }
    tab = 'pension'
  }

  load()
    .then((data) => { state = { status: 'ready', data, error: null } })
    .catch((error) => { state = { status: 'failed', data: null, error } })

  // Après une mise à jour dans l'onglet 업데이트, la page Update (dans son
  // iframe) prévient ici : on relit les fichiers sans recharger la page, et
  // on oublie ce qui avait été chargé à la demande pour qu'il soit relu.
  let reloaded = $state(null)
  function reload() {
    load()
      .then((data) => {
        state = { status: 'ready', data, error: null }
        prizeRows = null
        hogiRows = null
        orderRows = null
        const d = data.draws
        reloaded = `데이터를 새로 불러왔습니다 · 로또 ${d.rangs[d.n - 1]}회`
      })
      .catch((error) => { reloaded = `다시 불러오지 못했습니다 : ${error.message}` })
  }
  $effect(() => {
    const onMessage = (e) => {
      if (e.origin === location.origin && e.data?.type === 'lotto:data-updated') reload()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })

  const all = $derived(state.data?.draws ?? null)

  const view = $derived.by(() => {
    if (!all) return null
    if (span === 'all') return all
    if (Array.isArray(span)) return all.window(span[0], span[1])
    return all.last(span)
  })
</script>

<header>
  <div class="wrap bar">
    <div class="brand">
      <span class="mark">로또</span>
      <span class="sub">6/45 · 연금복권 720+</span>
    </div>
    {#if state.data}
      {@const shown = PENSION.has(screen) ? state.data.meta.pension : state.data.meta.lotto}
      <div class="freshness">
        <span>{rang(shown.rang)}</span>
        <span class="dim">{day(shown.date)}</span>
      </div>
    {/if}
  </div>

  <!-- La barre est coupée en deux : le 로또 6/45 à gauche, le 연금복권 à
       droite. Ce sont deux produits, pas deux rubriques d'un même produit —
       les mettre à la suite laissait croire que le dernier onglet était la
       fin d'une liste, alors qu'il ouvre un jeu de vingt pages à lui. -->
  <nav class="wrap">
    {#each TABS.filter((t) => t.key !== 'pension') as item (item.key)}
      <button class="tab" class:on={tab === item.key} class:group={item.children}
              onclick={() => open(item)} title={item.gloss}>
        {item.label}{#if item.children}<span class="caret">›</span>{/if}
      </button>
    {/each}

    <span class="gap" aria-hidden="true"></span>

    {#each TABS.filter((t) => t.key === 'pension') as item (item.key)}
      <button class="tab side" class:on={tab === item.key} class:group={item.children}
              onclick={() => open(item)} title={item.gloss}>
        {item.label}{#if item.children}<span class="caret">›</span>{/if}
      </button>
    {/each}
  </nav>

  {#if children}
    <!-- La bande va d'un bord à l'autre, son contenu reste dans la colonne :
         un fond qui s'arrête au milieu de l'écran se lit comme un bloc
         posé là, pas comme le prolongement de l'onglet ouvert. -->
    <div class="subband">
      <nav class="wrap subnav">
        {#each children as child (child.key)}
          <button class="sub" class:on={screen === child.key}
                  onclick={() => (sub = { ...sub, [tab]: child.key })}
                  title={child.gloss}>
            {child.label}
          </button>
        {/each}
      </nav>
    </div>
  {/if}
</header>

<main class="wrap">
  {#if state.status === 'loading'}
    <div class="panel"><p class="dim">불러오는 중…</p></div>

  {:else if state.status === 'failed'}
    <div class="panel">
      <h2>데이터를 불러오지 못했습니다</h2>
      <p class="soft">{state.error.message}</p>
      <pre>node --experimental-sqlite tools/build.js</pre>
    </div>

  {:else}
    {#if !NO_RANGE.has(screen)}
      <!-- Le sélecteur découpe l'historique 6/45 ; l'onglet 연금복권 a le sien,
           et l'afficher là ferait croire qu'il agit. 패턴 et 제외번호 ont leur
           propre sélecteur de 회차 et travaillent sur tout l'historique :
           un 패턴 tronqué à cinquante tirages ne veut rien dire. -->
      <div class="controls">
        <Range total={view.n} first={all.rangs[0]} last={all.rangs[all.n - 1]}
               bind:span />
      </div>
    {/if}

    {#if screen === 'home'}
      <Home draws={view} />
    {:else if screen === 'win1'}
      <WinningDraws draws={view} {all} rank={1} />
    {:else if screen === 'win2'}
      <WinningDraws draws={view} {all} rank={2} />
    {:else if screen === 'flow'}
      <Flow draws={view} base={all} />

    {:else if screen === 'places'}
      <Places draws={view} base={all} />
    {:else if screen === 'filters'}
      <Filters draws={view} base={all} />
    {:else if screen === 'sections'}
      <Sections draws={view} base={all} />
    {:else if screen === 'tables'}
      <Tables draws={all} />
    {:else if screen === 'lists'}
      <Lists draws={view} base={all} />
    {:else if screen === 'hotcold'}
      <HotCold draws={all} />
    {:else if screen === 'friends'}
      <Friends draws={view} />
    {:else if screen === 'patterns'}
      <Patterns draws={all} />
    {:else if screen === 'excluded'}
      <Excluded draws={all} />
    {:else if screen === 'family'}
      <Family draws={all} />
    {:else if screen === 'machine'}
      <Machine draws={all} hogi={hogiRows} />
    {:else if screen === 'order'}
      <Order order={orderRows} />
    {:else if screen === 'paper'}
      <Paper draws={all} />
    {:else if screen === 'shape'}
      <Shape draws={all} />
    {:else if screen === 'watch'}
      <Watch draws={all} order={orderRows} hogi={hogiRows} />
    {:else if screen === 'general'}
      <General draws={all} />
    {:else if screen === 'auto'}
      <Auto draws={all} pending={pendingSearch}
            onconsumed={() => { pendingSearch = null }} />
    {:else if screen === 'manual'}
      <Manual draws={all} />
    {:else if screen === 'results'}
      <Results draws={all} prizes={prizeRows} onreplay={replay} />
    {:else if screen === 'basics'}
      <Basics product="lotto" draws={all} prizes={prizeRows} />
    {:else if screen === 'fixed'}
      <Tip prizes={prizeRows} />
    {:else if screen === 'pool'}
      <Pool draws={all} />
    {:else if screen === 'ftest'}
      <FilterTest draws={all} />
    {:else if screen === 'stest'}
      <SectionTest />
    {:else if screen === 'ttest'}
      <TableTest draws={all} />
    {:else if screen === 'sweep'}
      <SweepTest />
    {:else if screen === 'wheel'}
      <Wheel />
    {:else if screen === 'sand'}
      <SandTest draws={all} />
    {:else if screen === 'rfixed'}
      <Report src="/rapport-fixe.html"
              title="고정수 보고서"
              date="1,240회 기준"
              note="당첨 2개를 고정하면 무엇이 달라지는가 — 오라클 기준선, 실제로 쓸 수 있는 규칙 6개, 그리고 1/66의 대가." />
    {:else if screen === 'rlines'}
      <Report src="/rapport-lignes.html"
              title="이월 · 라인 보고서"
              date="301~1,240회 · 940회차"
              note="이월번호와 「번호 패턴 라인」은 같은 표의 두 이름이다 — 라인 1~7이 곧 이월. 940회차 walk-forward로 정면 대결." />
    {:else if screen === 'rmeth'}
      <Report src="/rapport-methode.html"
              title="고정수 방법"
              date="401~1,240회 · 840회차"
              note="고정수를 무엇으로 고를 것인가 — 화면의 세 방법, 회차마다 상황을 분석하는 네 방법, 그리고 대조군. 1개·2개 각각." />
    {:else if screen === 'rrandom'}
      <Report src="/rapport-hasard.html"
              title="무작위성 보고서"
              date="1~1,240회 · 검정 5종"
              note="빈도를 보지 않는 다섯 검정 — 대기시간·압축·스펙트럼·추첨기·공 순서 — 그리고 이 「없음」이 배제하는 편향의 크기." />
    {:else if screen === 'rshape'}
      <Report src="/rapport-similarite.html"
              title="패턴 닮은꼴 간격 보고서"
              date="1~1,241회 · 7,757쌍"
              note="용지에 같은 그림을 그리는 회차들은 규칙적인 간격으로 돌아오는가 — 거리 분포·연속 간격·배수 구조·등차 사슬, 네 번 물었다." />
    {:else if screen === 'rdist'}
      <Report src="/rapport-distance.html"
              title="거리 보고서"
              date="기준 200~1,240회 · 줄 539,740개"
              note="맞히는 줄은 당첨 회차로부터 특정한 거리에서 오는가 — 거리별 비율, 앞뒤 절반 교차 검증, 무작위 대조군, 그리고 수동·자동으로 본 사람 쪽." />
    {:else if screen === 'rsect'}
      <Report src="/rapport-sections.html"
              title="구간 보고서"
              date="1~1,242회 · 8,145,060 조합"
              note="분배·총합·저고·홀짝·AC값으로 나눈 칸마다 조합 수와 1등 횟수 — 어느 칸도 자기 크기보다 많이 받지 않는다. 표 읽는 법 포함." />
    {:else if screen === 'rcross'}
      <Report src="/rapport-croise.html"
              title="교차 검정 보고서"
              date="1~1,242회 · 1등 1,242 · 2등 7,452 · 3등 283,176"
              note="다섯 지표를 동시에 걸면 1·2·3등이 크기보다 많이 떨어지는 칸이 있나 — 32가지 규칙, 229칸, 그리고 앞뒤 절반 검정. 가장 좋은 교차도 ×1.03, 뒤 절반에서는 ×1.03." />
    {:else if screen === 'update'}
      {#if reloaded}<p class="panel reloaded">{reloaded}</p>{/if}
      <Report src="/admin"
              title="업데이트"
              note="새 회차 가져오기 · 빠진 회차 · 검증 · 직접 입력. npm run web으로 연 경우에만 작동합니다 — 새 회차가 들어오면 사이트 데이터가 자동으로 다시 불러와집니다." />
    {:else if screen === 'guide'}
      <Guide onopen={go} />
    {:else if screen === 'pbasics'}
      <Basics product="pension" />
    {:else if screen === 'phome'}
      <PensionHome pension={state.data.pension} />
    {:else if screen === 'pflow'}
      <PensionFlow pension={state.data.pension} />
    {:else if screen === 'plists'}
      <PensionLists pension={state.data.pension} />
    {:else if screen === 'pauto'}
      <PensionAuto pension={state.data.pension} pending={pendingPension}
                   onconsumed={() => { pendingPension = null }} />
    {:else if screen === 'pmanual'}
      <PensionManual pension={state.data.pension} />
    {:else if screen === 'presults'}
      <PensionResults pension={state.data.pension} onreplay={replayPension} />
    {:else if screen === 'ppages'}
      <Pension pension={state.data.pension} />
    {/if}
  {/if}
</main>

<footer class="wrap">
  <p>
    통계 분석과 번호 선택을 돕는 도구입니다. <strong>당첨을 예측하지 않습니다.</strong>
    과거 결과는 다음 회차와 무관합니다.
  </p>
  {#if state.data}
    <p class="dim">
      로또 {rang(state.data.meta.lotto.n)} · 연금복권 {rang(state.data.meta.pension.n)} ·
      데이터 {state.data.meta.fingerprint}
    </p>
  {/if}
</footer>

<style>
  header {
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .bar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.35rem 1rem;
    padding-top: 1.1rem;
    padding-bottom: 0.9rem;
  }

  .brand { display: flex; align-items: baseline; gap: 0.6rem; white-space: nowrap; }
  .mark {
    font-family: var(--figure);
    font-size: 1.375rem;
    letter-spacing: 0.01em;
    color: var(--gold);
  }
  .sub { font-size: 0.75rem; color: var(--muted); letter-spacing: 0.04em; white-space: nowrap; }

  .freshness { display: flex; gap: 0.5rem; font-size: 0.8125rem; white-space: nowrap; }

  nav { display: flex; gap: 0.25rem; overflow-x: auto; align-items: stretch; }

  /* Ce qui pousse le 연금복권 au bout. `margin-left: auto` sur l'onglet
     lui-même le collerait au bord dès que la barre déborde ; une cale qui
     peut se réduire à zéro le laisse suivre les autres sur un écran étroit,
     et le trait de séparation reste visible dans les deux cas. */
  .gap {
    flex: 1 1 auto;
    min-width: 1.25rem;
    align-self: center;
    height: 1.1rem;
    border-right: 1px solid var(--line);
  }
  .tab.side { margin-left: 0.5rem; }

  /* La catégorie ouverte porte un fond, pas seulement un trait : avec un
     menu à deux étages il faut voir d'un coup d'œil dans quelle branche on
     se trouve, sans avoir à lire. Le fond est la teinte claire de l'or —
     jamais un aplat sombre, qui écraserait le texte. */
  .tab {
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: var(--radius) var(--radius) 0 0;
    padding: 0.5rem 0.85rem 0.7rem;
    font-size: 0.875rem;
    color: var(--ink-soft);
    white-space: nowrap;
    background: none;
  }
  .tab:hover { color: var(--ink); background: var(--paper); }
  .tab.on {
    color: var(--gold);
    border-color: var(--gold);
    background: var(--gold-wash);
    font-weight: 600;
  }
  .caret {
    margin-left: 0.3rem;
    font-size: 0.75rem;
    color: var(--muted);
    display: inline-block;
    transition: transform .12s;
  }
  .tab.on .caret { color: var(--gold); transform: rotate(90deg); }

  /* La barre des sous-catégories : elle prolonge le fond de la catégorie,
     ce qui la rattache visuellement à l'onglet ouvert au lieu de flotter. */
  .subband {
    background: var(--gold-wash);
    border-top: 1px solid var(--gold-soft);
  }
  .subnav {
    display: flex;
    gap: 0.35rem;
    padding-top: 0.55rem;
    padding-bottom: 0.55rem;
    overflow-x: auto;
  }
  .sub {
    border: 1px solid transparent;
    border-radius: 999px;
    padding: 0.3rem 0.9rem;
    font-size: 0.8125rem;
    color: var(--gold-deep);
    background: var(--surface);
    white-space: nowrap;
  }
  .sub:hover { border-color: var(--gold); }
  /* La sous-catégorie choisie : un aplat plein, en or, texte clair. C'est
     le seul aplat coloré du site, et il ne porte aucun chiffre. */
  .sub.on {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--surface);
    font-weight: 600;
  }

  main { padding: 1.75rem 0 3rem; }
  .reloaded { margin: 0 0 1rem; padding: 0.6rem 1rem; font-size: 0.8125rem; border-color: var(--gold); color: var(--gold-deep); }

  .controls {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1.25rem;
  }

  pre {
    margin: 0.75rem 0 0;
    padding: 0.6rem 0.75rem;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-size: 0.75rem;
    overflow-x: auto;
  }

  footer {
    border-top: 1px solid var(--line);
    padding: 1.5rem 0 3rem;
    font-size: 0.75rem;
    color: var(--ink-soft);
    line-height: 1.6;
  }
  footer p { margin: 0 0 0.35rem; }
  footer strong { color: var(--ink); font-weight: 600; }
</style>
