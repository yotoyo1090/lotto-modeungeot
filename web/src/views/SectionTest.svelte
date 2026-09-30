<script>
  // 팁 › 구간 검정 — « et si je barrais des dizaines entières ? »
  //
  // 제외구간 est la case du formulaire qui donne l'impression la plus forte
  // de faire quelque chose : on raye 10 numéros, il en reste 35, et
  // l'ensemble des combinaisons tombe de 8,1 millions à 1,6 million. Le
  // sentiment est qu'on vient de multiplier ses chances par cinq.
  //
  // On ne les a pas multipliées. On a seulement décidé DANS QUELLES SEMAINES
  // on avait le droit de gagner. Cet écran mesure les trente et une façons de
  // barrer des bandes, seules puis avec toutes les autres cases cochées, et
  // montre où passe l'argent.
  //
  // Le sélecteur en tête est la page : on coche des bandes comme on le ferait
  // dans 자동조합, et les chiffres mesurés de cette combinaison-là s'affichent.
  // Les 62 lignes viennent d'un backtest dont le protocole est écrit plus bas,
  // en entier — c'est la seule façon de rendre un chiffre vérifiable.
  import { NMAX, PICK } from '@core/draws.js'
  import { EXCLUDABLE_SECTIONS } from '@core/criteria.js'
  import { num } from '../lib/format.js'

  const BASE = (PICK * PICK) / NMAX      // 0,8 numéro attrapé par grille
  const SPACE = 8_145_060
  const pct = (v, d = 2) => `${(v * 100).toFixed(d)}%`

  // ── ce qui a été mesuré ────────────────────────────────────────────────
  //
  // Une ligne par combinaison. `k` est la liste des bandes barrées, `all` dit
  // si 전부 체크 était appliqué par-dessus. `combos` à zéro = les deux filtres
  // ensemble ne laissent plus rien : la configuration est impossible à jouer.
  //
  // `reach` — « 1등 가능 » — est la part des 1 000 회차 dont les six numéros
  // tombent tous dans le vivier. C'est la colonne qui explique tout le reste.

  const RUN = {
    from: 240, to: 1239, window: 1000, reps: 10, draws: 100, grids: 100,
  }

  const M = (k, all, pool, combos, reach, r1, r2, r3, r4, r5, ret, mean, t, beat) =>
    ({ k, all, pool, combos, reach, r1, r2, r3, r4, r5, ret, mean, t, beat })

  const ROWS = [
    M([], false, 45, 8145060, 1.000, 0, 0, 2, 141, 2172, 0.207, 0.8011, 0.50, 0),
    M([1], false, 36, 1947792, 0.264, 0, 0, 2, 154, 2226, 0.222, 0.8019, 0.30, 5),
    M([10], false, 35, 1623160, 0.169, 0, 0, 1, 112, 2100, 0.179, 0.7818, -4.76, 3),
    M([20], false, 35, 1623160, 0.204, 0, 0, 2, 129, 2286, 0.210, 0.8105, 3.23, 6),
    M([30], false, 35, 1623160, 0.209, 0, 0, 4, 115, 2255, 0.229, 0.8006, 0.10, 6),
    M([40], false, 39, 3262623, 0.399, 0, 0, 5, 128, 2247, 0.246, 0.8006, 0.11, 4),
    M([1, 10], false, 26, 230230, 0.030, 0, 0, 4, 123, 2089, 0.235, 0.7836, -3.32, 5),
    M([1, 20], false, 26, 230230, 0.027, 0, 0, 3, 144, 2331, 0.234, 0.8246, 3.50, 9),
    M([1, 30], false, 26, 230230, 0.032, 0, 0, 2, 148, 2315, 0.222, 0.8111, 1.54, 7),
    M([1, 40], false, 30, 593775, 0.079, 0, 0, 1, 109, 2231, 0.179, 0.7992, -0.13, 3),
    M([10, 20], false, 25, 177100, 0.015, 0, 0, 3, 123, 2132, 0.212, 0.7909, -1.68, 5),
    M([10, 30], false, 25, 177100, 0.020, 0, 0, 2, 128, 2030, 0.191, 0.7834, -2.25, 4),
    M([10, 40], false, 29, 475020, 0.048, 0, 0, 5, 136, 2064, 0.248, 0.7808, -2.82, 7),
    M([20, 30], false, 25, 177100, 0.022, 0, 0, 6, 145, 2428, 0.285, 0.8209, 2.46, 7),
    M([20, 40], false, 29, 475020, 0.065, 0, 0, 5, 151, 2345, 0.264, 0.8138, 2.46, 6),
    M([30, 40], false, 29, 475020, 0.057, 0, 0, 1, 127, 2317, 0.192, 0.8023, 0.44, 4),
    M([1, 10, 20], false, 16, 8008, 0.002, 0, 0, 2, 135, 2261, 0.212, 0.7982, -0.22, 5),
    M([1, 10, 30], false, 16, 8008, 0.002, 0, 0, 7, 129, 2030, 0.279, 0.7789, -2.26, 4),
    M([1, 10, 40], false, 20, 38760, 0.006, 0, 0, 5, 112, 2112, 0.241, 0.7781, -2.26, 4),
    M([1, 20, 30], false, 16, 8008, 0.001, 0, 0, 4, 170, 2645, 0.282, 0.8403, 2.87, 6),
    M([1, 20, 40], false, 20, 38760, 0.004, 0, 0, 7, 137, 2356, 0.290, 0.8233, 2.88, 7),
    M([1, 30, 40], false, 20, 38760, 0.006, 0, 0, 6, 158, 2257, 0.275, 0.8056, 0.86, 5),
    M([10, 20, 30], false, 15, 5005, 0.000, 0, 0, 7, 130, 2016, 0.260, 0.7932, -0.51, 4),
    M([10, 20, 40], false, 19, 27132, 0.005, 0, 0, 2, 120, 2121, 0.193, 0.7892, -1.12, 4),
    M([10, 30, 40], false, 19, 27132, 0.001, 0, 1, 1, 88, 1997, 0.792, 0.7715, -2.94, 1),
    M([20, 30, 40], false, 19, 27132, 0.004, 0, 0, 1, 168, 2471, 0.219, 0.8240, 2.92, 6),
    M([1, 10, 20, 30], false, 6, 1, 0.000, 0, 0, 0, 100, 2700, 0.185, 0.8020, 0.08, 1),
    M([1, 10, 20, 40], false, 10, 210, 0.001, 0, 0, 9, 152, 2132, 0.319, 0.7918, -0.51, 3),
    M([1, 10, 30, 40], false, 10, 210, 0.001, 2, 0, 20, 159, 1607, 16.847, 0.7586, -4.07, 2),
    M([1, 20, 30, 40], false, 10, 210, 0.000, 0, 0, 5, 246, 2279, 0.306, 0.8586, 4.15, 5),
    M([10, 20, 30, 40], false, 9, 84, 0.000, 0, 0, 0, 114, 1688, 0.141, 0.7868, -0.69, 3),

    // Les mêmes, avec 전부 체크 par-dessus. `combos: 0` = plus rien ne passe :
    // les deux filtres ensemble vident l'espace, et il n'y a pas de grille à
    // jouer du tout. Six combinaisons sur trente-et-une sont dans ce cas.
    M([], true, 45, 467630, 1.000, 0, 0, 3, 141, 2316, 0.231, 0.8079, 1.92, 7),
    M([1], true, 36, 73366, 0.264, 0, 0, 4, 140, 2219, 0.244, 0.8051, 1.26, 6),
    M([10], true, 35, 58877, 0.169, 0, 0, 4, 100, 2112, 0.220, 0.7815, -3.34, 3),
    M([20], true, 35, 99423, 0.204, 0, 0, 1, 165, 2380, 0.218, 0.8170, 4.31, 6),
    M([30], true, 35, 76576, 0.209, 0, 0, 1, 138, 2319, 0.204, 0.7998, -0.03, 6),
    M([40], true, 39, 143692, 0.399, 0, 2, 1, 137, 2265, 1.238, 0.7967, -0.68, 6),
    M([1, 10], true, 26, 1063, 0.030, 0, 0, 2, 111, 1958, 0.188, 0.7733, -2.74, 3),
    M([1, 20], true, 26, 10889, 0.027, 0, 0, 1, 167, 2409, 0.221, 0.8229, 3.24, 6),
    M([1, 30], true, 26, 8862, 0.032, 0, 0, 1, 155, 2244, 0.201, 0.8034, 0.51, 4),
    M([1, 40], true, 30, 6905, 0.079, 0, 1, 3, 109, 2300, 0.749, 0.7965, -0.36, 4),
    M([10, 20], true, 25, 1584, 0.015, 0, 0, 2, 117, 2304, 0.203, 0.8114, 1.38, 5),
    M([10, 30], true, 25, 6063, 0.020, 1, 0, 2, 126, 2030, 28.103, 0.7809, -2.22, 5),
    M([10, 40], true, 29, 25327, 0.048, 0, 0, 2, 126, 2087, 0.199, 0.7832, -2.43, 4),
    M([20, 30], true, 25, 5498, 0.022, 0, 0, 1, 151, 2564, 0.219, 0.8289, 2.26, 5),
    M([20, 40], true, 29, 24993, 0.065, 0, 0, 1, 163, 2366, 0.213, 0.8156, 2.34, 7),
    M([30, 40], true, 29, 2680, 0.057, 0, 0, 3, 125, 1979, 0.201, 0.7929, -0.90, 4),
    M([1, 10, 20], true, 16, 0, 0.002, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    M([1, 10, 30], true, 16, 91, 0.002, 0, 0, 17, 169, 1632, 0.384, 0.7689, -2.89, 4),
    M([1, 10, 40], true, 20, 405, 0.006, 0, 0, 0, 105, 2026, 0.154, 0.7753, -2.09, 1),
    M([1, 20, 30], true, 16, 305, 0.001, 0, 0, 1, 142, 2696, 0.221, 0.8372, 2.58, 4),
    M([1, 20, 40], true, 20, 1589, 0.004, 0, 0, 0, 158, 2304, 0.194, 0.8125, 1.08, 6),
    M([1, 30, 40], true, 20, 0, 0.006, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    M([10, 20, 30], true, 15, 0, 0.000, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    M([10, 20, 40], true, 19, 415, 0.005, 0, 0, 1, 121, 2314, 0.193, 0.8023, 0.21, 4),
    M([10, 30, 40], true, 19, 617, 0.001, 0, 0, 2, 101, 1869, 0.171, 0.7743, -2.32, 2),
    M([20, 30, 40], true, 19, 0, 0.004, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    M([1, 10, 20, 30], true, 6, 0, 0.000, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    M([1, 10, 20, 40], true, 10, 0, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    M([1, 10, 30, 40], true, 10, 0, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    M([1, 20, 30, 40], true, 10, 0, 0.000, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    M([10, 20, 30, 40], true, 9, 0, 0.000, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ]

  const idOf = (k, all) => `${[...k].sort((a, b) => a - b).join('-')}|${all ? 'A' : ''}`
  const BY_ID = new Map(ROWS.map((r) => [idOf(r.k, r.all), r]))

  // ── le sélecteur ───────────────────────────────────────────────────────

  let picked = $state(new Set())
  let withAll = $state(false)

  const toggle = (key) => {
    const next = new Set(picked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    // Barrer les cinq bandes ne laisse aucun numéro : la dernière refuse.
    if (next.size < EXCLUDABLE_SECTIONS.length) picked = next
  }

  const current = $derived(BY_ID.get(idOf([...picked], withAll)) ?? null)
  const alone = $derived(BY_ID.get(idOf([...picked], false)) ?? null)
  const kept = $derived.by(() => {
    const out = new Set()
    for (const band of EXCLUDABLE_SECTIONS) {
      if (picked.has(band.key)) continue
      for (const n of band.numbers) out.add(n)
    }
    return out
  })
  const CELLS = Array.from({ length: NMAX }, (_, i) => i + 1)

  const labelOf = (k) => (k.length === 0 ? '없음 — 45개 전부'
    : [...k].sort((a, b) => a - b)
      .map((v) => EXCLUDABLE_SECTIONS.find((b) => b.key === v).label).join(' + '))

  // Une semaine où le 1등 est possible revient tous les combien ? C'est
  // l'espace entier divisé par celui qui reste — le chiffre qui rend la
  // concentration palpable.
  const oncePer = $derived(current && current.combos
    ? Math.round(SPACE / current.combos) : null)

  // ── les sept gros lots, tracés ─────────────────────────────────────────
  //
  // Sur 6,2 millions de grilles jouées, il n'y a eu que sept 1등 ou 2등. Les
  // voici tous, avec le 회차 qui les a produits — c'est ce tableau qui
  // désamorce les 1 684,7 % et les 2 810,3 % de la ligne du dessus.
  const BIG = [
    { cfg: '풀 20–29', rep: 4, rang: 1162, rank: 1, grid: [20, 21, 22, 25, 28, 29],
      draw: [20, 21, 22, 25, 28, 29], bonus: 6, won: 823_931_021 },
    { cfg: '풀 20–29', rep: 9, rang: 1162, rank: 1, grid: [20, 21, 22, 25, 28, 29],
      draw: [20, 21, 22, 25, 28, 29], bonus: 6, won: 823_931_021 },
    { cfg: '풀 1–9+20–29', rep: 9, rang: 1162, rank: 2, grid: [6, 20, 22, 25, 28, 29],
      draw: [20, 21, 22, 25, 28, 29], bonus: 6, won: 63_379_310 },
    { cfg: '10–19+30–39 +전부', rep: 5, rang: 1106, rank: 1, grid: [1, 3, 4, 29, 42, 45],
      draw: [1, 3, 4, 29, 42, 45], bonus: 36, won: 2_790_462_819 },
    { cfg: '40–45 +전부', rep: 4, rang: 1147, rank: 2, grid: [7, 11, 24, 26, 27, 32],
      draw: [7, 11, 24, 26, 27, 37], bonus: 32, won: 53_388_307 },
    { cfg: '40–45 +전부', rep: 7, rang: 795, rank: 2, grid: [3, 10, 13, 34, 36, 38],
      draw: [3, 10, 13, 26, 34, 38], bonus: 36, won: 50_711_686 },
    { cfg: '1–9+40–45 +전부', rep: 2, rang: 577, rank: 2, grid: [17, 22, 31, 33, 34, 37],
      draw: [16, 17, 22, 31, 34, 37], bonus: 33, won: 53_386_172 },
  ]

  // Ce que le gros lot pèse dans le gain total de sa configuration.
  const SHARE = [
    { cfg: '풀 20–29 (1–9+10–19+30–39+40–45 제외)', ret: 16.847, part: 0.978 },
    { cfg: '10–19+30–39 + 전부 체크', ret: 28.103, part: 0.993 },
    { cfg: '40–45 + 전부 체크', ret: 1.238, part: 0.841 },
    { cfg: '10–19+30–39+40–45', ret: 0.792, part: 0.800 },
    { cfg: '1–9+40–45 + 전부 체크', ret: 0.749, part: 0.713 },
  ]

  // ── la fréquence réelle des cinq bandes sur la fenêtre ─────────────────
  //
  // Trente lignes de résultats, mais cinq faits seulement. Le tableau des
  // combinaisons ne fait que recopier ces cinq nombres avec des signes.
  const BANDS = [
    { label: '1–9', size: 9, per: 1.151, exp: 1.200, z: -1.58 },
    { label: '10–19', size: 10, per: 1.403, exp: 1.333, z: 2.16 },
    { label: '20–29', size: 10, per: 1.305, exp: 1.333, z: -0.88 },
    { label: '30–39', size: 10, per: 1.349, exp: 1.333, z: 0.49 },
    { label: '40–45', size: 6, per: 0.792, exp: 0.800, z: -0.30 },
  ]
</script>

<section class="panel">
  <div class="head">
    <h2>구간을 지우면 무엇이 달라지나</h2>
    <span class="gloss">지우고 싶은 구간을 눌러보십시오</span>
  </div>

  <p class="lede">
    제외구간은 폼에서 <strong>가장 강한 느낌을 주는 칸</strong>입니다. 열 개를
    지우면 서른다섯 개가 남고, 조합 수가 814만에서 162만으로 떨어집니다.
    확률이 다섯 배가 된 것 같습니다. 그런데 달라진 것은 확률이 아니라
    <strong>어느 주에 이길 자격이 있는가</strong>입니다. 아래에서 직접
    확인해 보십시오.
  </p>

  <div class="picker" role="group" aria-label="제외할 구간">
    {#each EXCLUDABLE_SECTIONS as band (band.key)}
      <button class:on={picked.has(band.key)} onclick={() => toggle(band.key)}>
        {band.label}
      </button>
    {/each}
    <span class="sep" aria-hidden="true"></span>
    <button class="wide" class:on={withAll} onclick={() => (withAll = !withAll)}>
      전부 체크
    </button>
  </div>

  <div class="spaces">
    <div class="board" aria-label="남은 번호">
      {#each CELLS as n (n)}
        <div class="cell" class:keep={kept.has(n)} class:out={!kept.has(n)}>{n}</div>
      {/each}
    </div>

    <div class="spacebox">
      <span class="tag">{labelOf([...picked])} 제외{withAll ? ' · 전부 체크' : ''}</span>
      {#if current && current.combos}
        <span class="figure h1">{pct(current.reach, 1)}</span>
        <span class="unit dim">1등이 가능한 회차 — 나머지 주에는 불가능합니다</span>
        <dl>
          <div><dt>남는 번호</dt><dd>{kept.size}개</dd></div>
          <div><dt>남는 조합</dt><dd>{num(current.combos)}</dd></div>
          <div><dt>그런 주가 오는 간격</dt><dd>{num(oncePer)}회 마다</dd></div>
          <div><dt>1등 · 2등</dt><dd>
            <b class:rk={current.r1 > 0}>{current.r1}</b> · <b class:rk={current.r2 > 0}>{current.r2}</b>
          </dd></div>
          <div><dt>회수율</dt><dd class:up={current.ret > 1}>{pct(current.ret, 1)}</dd></div>
          <div><dt>평균맞춤</dt><dd>{current.mean.toFixed(4)} <span class="dim">/ {BASE.toFixed(4)}</span></dd></div>
          <div><dt>t</dt><dd>{current.t > 0 ? '+' : ''}{current.t.toFixed(2)}</dd></div>
          <div><dt>대조군을 이긴 횟수</dt><dd>{current.beat}/{RUN.reps}</dd></div>
        </dl>
      {:else if current}
        <span class="figure h1 dead">0</span>
        <span class="unit dim">남는 조합이 없습니다</span>
        <p class="note dim">
          이 구간 조합과 전부 체크를 <strong>동시에</strong> 걸면 살아남는
          조합이 하나도 없습니다. 살 수 있는 게임이 없다는 뜻입니다.
          {#if alone && alone.combos}
            전부 체크를 끄면 {num(alone.combos)}조합이 남습니다.
          {/if}
        </p>
      {/if}
    </div>
  </div>

  {#if current && current.combos}
    <p class="note dim">
      한 게임의 1등 확률은 <strong>1 / {num(SPACE)}</strong> 그대로입니다.
      {#if current.combos < SPACE}
        여섯 당첨 번호가 모두 남은 번호 안에 들어올 확률
        {num(current.combos)}/{num(SPACE)}에, 그 안에서 내 조합이 맞을 확률
        1/{num(current.combos)}를 곱하면 <strong>{num(current.combos)}이
        약분되어</strong> 원래 값으로 돌아옵니다. 필터는 확률을 만들지 않고
        <strong>모아둘</strong> 뿐입니다 — 평소보다 큰 기회를,
        {num(oncePer)}회에 한 번 오는 주에.
      {:else}
        아무것도 지우지 않았으니 매주 이길 자격이 있습니다.
      {/if}
    </p>
  {/if}
</section>

<section class="panel">
  <div class="head">
    <h2>어떻게 측정했나</h2>
    <span class="gloss">숫자를 믿으려면 절차를 볼 수 있어야 합니다</span>
  </div>

  <p class="lede small">
    이 페이지의 모든 숫자는 계산이 아니라 <strong>측정</strong>입니다. 아래가
    그 측정의 절차 전부입니다 — 빠뜨린 단계는 없습니다.
  </p>

  <ol class="proto">
    <li>
      <b>대상</b> — {RUN.from}회부터 {RUN.to}회까지 <b>{num(RUN.window)}회차</b>.
      가장 최근의 천 회차이고, 상금은 그 회차에 <em>실제로</em> 지급된 금액을
      데이터베이스에서 읽습니다. 4등 50,000원과 5등 5,000원만 고정입니다.
    </li>
    <li>
      <b>설정</b> — 다섯 구간의 모든 부분집합 31가지(아무것도 안 지움 · 1개 ·
      2개 · 3개 · 4개)를, 각각 <b>그대로</b>와 <b>전부 체크를 얹어서</b> 두 번.
      모두 62가지입니다. 다섯 구간을 전부 지우면 번호가 남지 않으므로 제외했습니다.
    </li>
    <li>
      <b>조합 만들기</b> — 모든 조합은 <code>core/generator.js</code>가 만듭니다.
      자동조합 화면이 부르는 바로 그 엔진이고, 측정을 위해 다시 쓴 필터는
      하나도 없습니다. 설정마다 살아남은 공간에서 최대 120,000조합을
      <em>균등하게</em> 뽑아 통을 만들고, 매 회차 그 통에서 100장을 뽑습니다.
    </li>
    <li>
      <b>반복</b> — {RUN.reps}번. 매 반복마다 {num(RUN.window)}회차 중
      {RUN.draws}회차를 <em>무작위로, 중복 없이</em> 뽑고, 그 회차마다
      {RUN.grids}조합을 삽니다. 설정당
      <b>{num(RUN.reps * RUN.draws * RUN.grids)}조합 =
      {num(RUN.reps * RUN.draws * RUN.grids * 1000)}원</b>입니다.
    </li>
    <li>
      <b>공정성</b> — 한 반복 안에서는 <em>모든 설정이 같은 회차, 같은 난수
      씨앗</em>을 씁니다. 설정들을 가르는 것은 규칙이지 운이 아닙니다.
    </li>
    <li>
      <b>t 값</b> — 열 번의 반복이 각각 낸 「조합당 맞춘 번호」 평균 열 개에
      대한 스튜던트 t입니다. 자유도 9, 임계값 ±2.26. 기준은
      {BASE.toFixed(4)} — 어떤 조합이든 여섯 칸 각각이 6/45로 맞으므로,
      구간을 지워도 이 값은 변하지 않아야 합니다.
    </li>
  </ol>

  <p class="note dim">
    <b>이 측정의 한계도 적어 둡니다.</b> 열 번의 반복은 같은
    {num(RUN.window)}회차에서 뽑으므로 서로 겹칩니다 — 완전히 독립된 열 번의
    실험이 아니라, 공통의 지면 위에서 조합을 열 번 다시 뽑은 것입니다.
    그리고 31가지 구간 조합은 <strong>31개의 독립된 시험이 아닙니다</strong>:
    다섯 구간의 관측 빈도라는 <em>다섯 개의 사실</em>이 서른한 줄에 부호를
    바꿔가며 되풀이될 뿐입니다. 맨 아래 표가 그 다섯 개입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>{withAll ? '구간 제외 + 전부 체크' : '구간 제외만'}</h2>
    <span class="gloss">
      위의 「전부 체크」 단추가 이 표를 바꿉니다 · 설정당
      {num(RUN.reps * RUN.draws * RUN.grids)}조합
    </span>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>제외구간</th><th class="v">풀</th><th class="v">조합</th>
          <th class="v">1등 가능</th><th class="v">1등</th><th class="v">2등</th>
          <th class="v">4등</th><th class="v">5등</th><th class="v">회수율</th>
          <th class="v">평균맞춤</th><th class="v">t</th>
        </tr>
      </thead>
      <tbody>
        {#each ROWS.filter((r) => r.all === withAll) as r (labelOf(r.k))}
          <tr class:top={r.r1 > 0} class:dead={!r.combos}
              class:on={idOf(r.k, r.all) === idOf([...picked], withAll)}>
            <td>{labelOf(r.k)}</td>
            <td class="val dim">{r.pool}</td>
            <td class="val dim">{r.combos ? num(r.combos) : '—'}</td>
            <td class="val">{pct(r.reach, 1)}</td>
            <td class="val" class:rk={r.r1 > 0}>{r.combos ? r.r1 : '—'}</td>
            <td class="val" class:rk={r.r2 > 0}>{r.combos ? r.r2 : '—'}</td>
            <td class="val dim">{r.combos ? r.r4 : '—'}</td>
            <td class="val dim">{r.combos ? num(r.r5) : '—'}</td>
            <td class="val" class:over={r.ret > 0.5}>{r.combos ? pct(r.ret, 1) : '—'}</td>
            <td class="val dim">{r.combos ? r.mean.toFixed(4) : '—'}</td>
            <td class="val" class:over={Math.abs(r.t) > 2.262}>
              {r.combos ? `${r.t > 0 ? '+' : ''}${r.t.toFixed(2)}` : '—'}
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td>우연이라면</td>
          <td class="val dim">45</td>
          <td class="val dim">{num(SPACE)}</td>
          <td class="val">100.0%</td>
          <td class="val">0.01</td>
          <td class="val">0.07</td>
          <td class="val dim">136</td>
          <td class="val dim">2 244</td>
          <td class="val dim">—</td>
          <td class="val"><b>{BASE.toFixed(4)}</b></td>
          <td class="val dim">0</td>
        </tr>
      </tfoot>
    </table>
  </div>

  {#if withAll}
    <p class="note dim">
      여섯 조합은 <strong>아예 불가능</strong>합니다 — 구간 제외와 전부 체크를
      같이 걸면 남는 조합이 0입니다. 살 게임이 없습니다.
    </p>
  {/if}
</section>

<section class="panel edge">
  <div class="head">
    <h2>1등이 나왔다 — 그리고 그것이 전부다</h2>
    <span class="gloss">620만 조합 중 1등·2등은 일곱 번뿐</span>
  </div>

  <p class="lede small">
    62개 설정 × {num(RUN.reps * RUN.draws * RUN.grids)}조합 =
    <strong>620만 조합</strong>을 사서, 1등과 2등은 모두 <strong>일곱 번</strong>
    나왔습니다. 일곱 개를 전부 여기 적습니다. 큰 회수율이 어디서 왔는지는
    이 표만 보면 됩니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>설정</th><th class="v">반복</th><th>회차</th><th class="v">등수</th>
          <th>조합</th><th>추첨</th><th class="v">당첨금</th>
        </tr>
      </thead>
      <tbody>
        {#each BIG as b, i (b.cfg + b.rep + b.rang)}
          <tr class:top={b.rank === 1}>
            <td>{b.cfg}</td>
            <td class="val dim">{b.rep}</td>
            <td class="dim">{num(b.rang)}회</td>
            <td class="val" class:rk={b.rank === 1}>{b.rank}등</td>
            <td class="mono">{b.grid.join(' ')}</td>
            <td class="mono dim">{b.draw.join(' ')} <span class="rk">+{b.bonus}</span></td>
            <td class="val">{num(b.won)}원</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    <strong>1162회는 20 · 21 · 22 · 25 · 28 · 29를 뽑았습니다.</strong>
    여섯 개가 전부 스무 번대 한 구간 안입니다. 20–29만 남긴 설정에서 조합은
    210개뿐이고 100장을 사면 그 절반 가까이를 덮습니다 — 그래서 1등이 두 번
    나왔고, 그래서 회수율이 1,684.7%가 되었습니다. 그 한 회차가 없으면
    아무것도 없습니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr><th>설정</th><th class="v">회수율</th><th class="v">그 한 방이 차지하는 몫</th></tr>
      </thead>
      <tbody>
        {#each SHARE as s (s.cfg)}
          <tr>
            <td>{s.cfg}</td>
            <td class="val over">{pct(s.ret, 1)}</td>
            <td class="val"><b>{pct(s.part, 1)}</b></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    여섯 개가 모두 20–29에 들어오는 주는 평균
    <strong>{num(Math.round(SPACE / 210))}회에 한 번</strong> — 745년에 한 번입니다.
    역사에는 1,239회차가 있고 그런 주가 한 번 있었습니다. 기댓값은
    <strong>0.03번</strong>이었습니다. 방법이 아니라 <em>기록의 행운</em>입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>서른한 줄이 아니라 다섯 개의 사실</h2>
    <span class="gloss">이 창에서 각 구간이 실제로 나온 빈도</span>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>구간</th><th class="v">크기</th><th class="v">회차당</th>
          <th class="v">기대값</th><th class="v">차이</th><th class="v">z</th>
        </tr>
      </thead>
      <tbody>
        {#each BANDS as b (b.label)}
          <tr class:top={Math.abs(b.z) > 2}>
            <td>{b.label}</td>
            <td class="val dim">{b.size}</td>
            <td class="val">{b.per.toFixed(3)}</td>
            <td class="val dim">{b.exp.toFixed(3)}</td>
            <td class="val" class:over={b.per > b.exp} class:under={b.per < b.exp}>
              {b.per > b.exp ? '+' : '−'}{Math.abs(b.per - b.exp).toFixed(3)}
            </td>
            <td class="val" class:over={Math.abs(b.z) > 2}>
              {b.z > 0 ? '+' : ''}{b.z.toFixed(2)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    위 표에서 t가 임계값을 넘는 줄이 서른 개 중 열 개나 됩니다. 서른 개의
    발견이 아닙니다 — <strong>10–19 구간이 이 천 회차에서 조금 자주
    나왔다</strong>(회차당 1.403 대 1.333, z = +2.16)는 <em>하나의 사실</em>이
    서른 줄에 퍼진 것입니다. 그래서 10–19를 지우는 설정은 <em>전부</em> 지고,
    20–29를 지우는 설정은 <em>전부</em> 이깁니다. 다섯 구간을 살펴봤을 때
    z = 2.16은 흔한 값이고, 다음 주에 대해서는 아무것도 말하지 않습니다.
  </p>
</section>

<section class="panel plain">
  <p class="close">
    제외구간은 <strong>이길 확률을 바꾸지 않습니다</strong>. 바꾸는 것은
    <strong>어느 주에 이길 자격이 있는가</strong>입니다. 구간을 더 지울수록
    그런 주는 드물어지고 그 주 안에서의 확률은 커집니다 — 곱은 언제나
    1 / {num(SPACE)}, 소수점 끝까지 같습니다.
  </p>
  <p class="close">
    유일하게 확실한 효과는 나쁜 쪽입니다. 네 구간을 지운
    <strong>1–9 + 10–19 + 20–29 + 30–39</strong>는 조합을 <strong>단
    하나</strong> 남깁니다 — 40 · 41 · 42 · 43 · 44 · 45. 그것을 매주 100장
    사면 한 게임에 100,000원을 내는 셈입니다.
  </p>
</section>

<style>
  .lede { margin: 0 0 1rem; color: var(--ink-soft); max-width: 62ch; }
  .lede.small { font-size: 0.875rem; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 74ch; }
  .note strong, .lede strong { color: var(--ink); font-weight: 600; }

  /* Le sélecteur : cinq bandes qu'on coche comme dans 자동조합, puis le
     commutateur 전부 체크 séparé par un filet — il n'est pas de même nature
     que les cinq autres, et le montrer évite de le cocher par mégarde. */
  .picker { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; margin-bottom: 1.25rem; }
  .picker button { border-radius: 999px; padding: 0.3rem 0.95rem; font-size: 0.8125rem; }
  .picker button.wide { padding-inline: 1.15rem; }
  .picker button.on {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--surface);
    font-weight: 600;
  }
  .picker .sep {
    width: 1px;
    align-self: stretch;
    background: var(--line);
    margin-inline: 0.5rem;
  }

  .spaces { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1.5rem 2.5rem; }
  .spacebox { display: flex; flex-direction: column; gap: 0.2rem; min-width: 16rem; flex: 1 1 16rem; }
  .spacebox .tag {
    font-size: 0.6875rem;
    letter-spacing: 0.09em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .spacebox .figure.h1 { color: var(--gold); font-size: 1.75rem; line-height: 1.2; }
  .spacebox .figure.h1.dead { color: var(--muted); }
  .spacebox .unit { font-size: 0.75rem; margin-bottom: 0.7rem; }

  /* Les numéros qui restent en réserve, ceux qui partent barrés : c'est
     l'image qui dit « 1등 가능 » avant même de lire le chiffre. */
  .board {
    display: grid;
    grid-template-columns: repeat(15, minmax(0, 1fr));
    gap: 2px;
    flex: 1 1 20rem;
    max-width: 34rem;
  }
  .cell {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    font-size: 0.5625rem;
    border-radius: 2px;
  }
  .cell.keep { background: var(--gold-wash); color: var(--ink-soft); }
  .cell.out {
    background: transparent;
    color: var(--muted);
    text-decoration: line-through;
    box-shadow: inset 0 0 0 1px var(--line);
  }

  /* Le protocole : numéroté, parce qu'on doit pouvoir dire « à l'étape 4 ». */
  .proto { margin: 0; padding-left: 1.35rem; max-width: 74ch; }
  .proto li { font-size: 0.8125rem; line-height: 1.7; margin-bottom: 0.6rem; color: var(--ink-soft); }
  .proto b { color: var(--ink); font-weight: 600; }
  .proto code {
    font-size: 0.75rem;
    background: var(--paper);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  dl { margin: 0; display: grid; gap: 0.3rem; }
  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.8125rem;
    border-top: 1px solid var(--line-soft);
    padding-top: 0.3rem;
  }
  dt { color: var(--muted); }
  dd { margin: 0; white-space: nowrap; }
  dd.up { color: var(--gold-deep); font-weight: 600; }

  th.v, td.val { text-align: right; }
  .rk { color: var(--gold-deep); }
  tfoot td {
    border-top: 1px solid var(--line);
    font-size: 0.8125rem;
    padding-top: 0.5rem;
  }
  tfoot tr.keep td { font-weight: 600; color: var(--ink); }
  tbody tr.top td { font-weight: 600; color: var(--ink); }
  /* La ligne que le sélecteur désigne — sans elle on cherche dans trente. */
  tbody tr.on td { background: var(--gold-wash); }
  tbody tr.dead td { color: var(--muted); }
  td.over { color: var(--gold-deep); }
  td.under { color: var(--muted); }
  td.mono { font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

  .edge { border-color: var(--gold-soft); }
  .plain { background: var(--gold-wash); border-color: var(--gold-soft); }
  .close { margin: 0; font-size: 0.9375rem; line-height: 1.7; max-width: 70ch; }
  .close + .close { margin-top: 0.9rem; }
  .close strong { color: var(--gold-deep); font-weight: 600; }
</style>
