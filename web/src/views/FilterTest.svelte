<script>
  // 팁 › 필터 검정 — « les cases du formulaire changent-elles quelque chose ? »
  //
  // 고정수 répond à « et si je connaissais deux numéros ». Cet écran-ci
  // répond à la question d'à côté, celle que les onze écrans d'analyse
  // posent sans jamais y répondre : 저고, 홀짝, AC값, 총합, 제외구간,
  // 리스트추천 — est-ce que cocher ces cases fait gagner plus ?
  //
  // Comme 고정수, la page a un sélecteur vivant en haut : il montre le seul
  // écart réel que le site ait produit, et surtout ce qu'il en reste quand
  // on ne peut plus choisir ses 회차. Tout le reste est mesuré, pas calculé,
  // et chaque bloc porte son protocole.
  //
  // Les grilles de tous les backtests sortent de `core/generator.js`, le
  // moteur que 자동조합 appelle. Aucun filtre n'a été réécrit pour la mesure.
  import { NMAX, PICK } from '@core/draws.js'
  import { num } from '../lib/format.js'

  let { draws = null } = $props()

  const BASE = (PICK * PICK) / NMAX     // 0,8 numéro attrapé par grille
  const RATE = PICK / NMAX              // 13,333 % par numéro
  const BREAKEVEN = 0.1811              // le seuil calculé dans 고정수
  const pct = (v, d = 2) => `${(v * 100).toFixed(d)}%`

  // ── le sélecteur vivant ────────────────────────────────────────────────
  //
  // Deux mondes. Dans le premier on ne joue que les 회차 dont on SAIT que le
  // 이월 est nul — c'est impossible, mais c'est là que le filtre marche.
  // Dans le second on joue toutes les semaines, comme dans la vraie vie.

  const MODES = [
    {
      key: 'zero', label: '이월 0개인 회차만', gloss: '신탁이 알려준다고 치고',
      draws: 392, pool: 38, mean: 0.9311, ret: 0.328, oracle: true,
    },
    {
      key: 'all', label: '모든 회차', gloss: '고르지 않고 매주',
      draws: 1000, pool: 38, mean: 0.7952, ret: 0.196, oracle: false,
    },
  ]

  let mode = $state('zero')
  const now = $derived(MODES.find((m) => m.key === mode) ?? MODES[0])
  const perNumber = $derived(now.mean / PICK)
  const gain = $derived(now.mean - BASE)

  // Les sept numéros du dernier 회차 connu : ce sont exactement ceux que le
  // filtre met en 제외번호 pour le tirage à venir. On les lit dans les
  // données plutôt que de les inventer — la démonstration doit tenir sur le
  // 회차 que l'utilisateur a sous les yeux.
  const excluded = $derived.by(() => {
    if (!draws || !draws.n) return new Set()
    return new Set(draws.fullAt(draws.n - 1))
  })
  const lastRang = $derived(draws && draws.n ? draws.rangs[draws.n - 1] : null)
  const CELLS = Array.from({ length: NMAX }, (_, i) => i + 1)

  // ── les vingt-quatre filtres, sur tout l'historique ────────────────────
  //
  // Chaque case est réglée sur ses valeurs les plus fréquentes — celles que
  // 자동조합 affiche en « 과거 % ». 10 blocs de 100 회차 (240회 → 1239회),
  // 100 grilles par 회차, donc 100 000 grilles par filtre. `t` porte sur les
  // dix moyennes de bloc : au-delà de ±2,26 la moyenne de numéros attrapés
  // ne serait plus celle du hasard. Vingt-quatre filtres essayés — il faut
  // s'attendre à un ou deux dépassements sans qu'il se passe rien.

  const RUN = { blocks: 10, span: 100, grids: 100, from: 240, to: 1239 }

  const FILTERS = [
    { label: '조건 없음 — 대조군', space: 1, r2: 0, r3: 3, ret: 0.228, mean: 0.8002, t: 0.09 },
    { label: '저고 2·3·4', space: 0.8132, r2: 0, r3: 0, ret: 0.191, mean: 0.7978, t: -1.25 },
    { label: '홀짝 2·3·4', space: 0.8132, r2: 0, r3: 2, ret: 0.220, mean: 0.8008, t: 0.33 },
    { label: 'AC값 8·9·10', space: 0.7115, r2: 0, r3: 2, ret: 0.200, mean: 0.7941, t: -2.75 },
    { label: '이월번호수 0·1', space: 0.7703, r2: 0, r3: 4, ret: 0.239, mean: 0.7969, t: -0.75 },
    { label: '앞자리수합 14–18', space: 0.4458, r2: 0, r3: 8, ret: 0.301, mean: 0.8065, t: 2.07 },
    { label: '끝자리수합 19–28', space: 0.5253, r2: 0, r3: 2, ret: 0.208, mean: 0.7964, t: -1.58 },
    { label: '소수숫자수 1·2·3', space: 0.8445, r2: 0, r3: 1, ret: 0.201, mean: 0.7992, t: -0.30 },
    { label: '합성수숫자수 3·4·5', space: 0.8425, r2: 0, r3: 1, ret: 0.200, mean: 0.8001, t: 0.03 },
    { label: '이의배수 2·3·4', space: 0.8132, r2: 0, r3: 2, ret: 0.220, mean: 0.8008, t: 0.33 },
    { label: '삼의배수 1·2·3', space: 0.8425, r2: 0, r3: 0, ret: 0.176, mean: 0.8036, t: 1.10 },
    { label: '사의배수 0·1·2', space: 0.8541, r2: 0, r3: 2, ret: 0.218, mean: 0.8016, t: 0.65 },
    { label: '오의배수 0·1·2', space: 0.9161, r2: 0, r3: 0, ret: 0.184, mean: 0.7994, t: -0.28 },
    { label: '총합 100–175', space: 0.7896, r2: 0, r3: 2, ret: 0.200, mean: 0.7978, t: -1.22 },
    { label: '제외구간 1–9', space: 0.2391, r2: 0, r3: 7, ret: 0.299, mean: 0.8072, t: 1.39 },
    { label: '리스트추천 소수', space: 0.000369, r2: 1, r3: 1, ret: 0.634, mean: 0.7855, t: -1.28 },
    { label: '리스트추천 합성수', space: 0.0729, r2: 0, r3: 2, ret: 0.222, mean: 0.8076, t: 1.41 },
    { label: '리스트추천 이의배수', space: 0.00916, r2: 0, r3: 4, ret: 0.244, mean: 0.7988, t: -0.10 },
    { label: '리스트추천 삼의배수', space: 0.000614, r2: 0, r3: 1, ret: 0.207, mean: 0.8142, t: 0.56 },
    { label: '분배 ≤ 1.00', space: 0.5352, r2: 0, r3: 3, ret: 0.223, mean: 0.8043, t: 1.93 },
    { label: '분배 ≤ 0.90', space: 0.1171, r2: 0, r3: 2, ret: 0.226, mean: 0.8115, t: 2.43 },
    { label: '전부 체크', space: 0.0574, r2: 1, r3: 2, ret: 0.786, mean: 0.8021, t: 0.49 },
    { label: '전부 체크 + 분배 ≤ 0.90', space: 0.0051, r2: 0, r3: 3, ret: 0.223, mean: 0.8034, t: 0.46 },
    { label: '고정번호 2개 — 이월에서', space: 0.01515, r2: 0, r3: 1, ret: 0.214, mean: 0.8106, t: 0.83 },
  ]

  // Les deux seuls 2등 du backtest, et ce qu'il reste sans eux. Le 1,7
  // attendu vient de 0,07 par filtre × 24 filtres : deux est le chiffre
  // normal, pas un exploit.
  const TWO = [
    { label: '리스트추천 소수', rang: 753, grid: [2, 3, 17, 19, 37, 41],
      draw: [2, 17, 19, 24, 37, 41], bonus: 3, prize: 46_743_191, with: 0.634, without: 0.166 },
    { label: '전부 체크', rang: 637, grid: [3, 22, 23, 37, 38, 44],
      draw: [3, 16, 22, 37, 38, 44], bonus: 23, prize: 57_766_535, with: 0.786, without: 0.209 },
  ]

  // ── filtres × familles, choisis dehors ─────────────────────────────────
  //
  // 22 filtres × 19 familles = 418 cases. Chercher la meilleure et l'annoncer
  // produirait un résultat à coup sûr, et faux. La règle : on choisit le
  // filtre de chaque famille sur 240회 → 739회, on l'applique tel quel sur
  // 740회 → 1239회, et c'est la seconde moitié qu'on lit. Cadeau accordé en
  // plus : la famille du 회차 est connue avant de jouer.

  const CROSS_CONTROL = 0.243

  const CROSS = [
    { label: '이월', crit: '돈', learn: 1.467, judge: 0.210, mean: 0.8027 },
    { label: '이월', crit: '평균', learn: 0.187, judge: 0.239, mean: 0.8257 },
    { label: '패턴', crit: '돈', learn: 1.398, judge: 0.199, mean: 0.8037 },
    { label: '패턴', crit: '평균', learn: 0.212, judge: 0.226, mean: 0.7914 },
    { label: '온도', crit: '돈', learn: 1.408, judge: 0.214, mean: 0.8084 },
    { label: '온도', crit: '평균', learn: 0.223, judge: 0.264, mean: 0.7909 },
    { label: '사망', crit: '돈', learn: 1.407, judge: 0.205, mean: 0.8015 },
    { label: '사망', crit: '평균', learn: 0.216, judge: 0.237, mean: 0.7942 },
    { label: '홀짝', crit: '돈', learn: 1.513, judge: 0.380, mean: 0.8419, leak: true },
    { label: '홀짝', crit: '평균', learn: 0.301, judge: 1.377, mean: 0.9871, leak: true },
    { label: '저고', crit: '돈', learn: 1.525, judge: 0.362, mean: 0.8365, leak: true },
    { label: '저고', crit: '평균', learn: 0.303, judge: 0.336, mean: 0.8695, leak: true },
    { label: '9 이하', crit: '돈', learn: 1.511, judge: 0.387, mean: 0.8595, leak: true },
    { label: '9 이하', crit: '평균', learn: 0.295, judge: 0.287, mean: 0.9033, leak: true },
  ]

  // Le filtre que la sélection a choisi pour chaque famille — la preuve que
  // les trois dimensions « gagnantes » ne font que réciter leur définition.
  const ORACLE = [
    { family: '홀 1 : 짝 5', filter: '리스트추천 이의배수', capture: 1.371 },
    { family: '홀 2 : 짝 4', filter: '리스트추천 이의배수', capture: 1.085 },
    { family: '홀 4 : 짝 2', filter: '리스트추천 소수', capture: 0.994 },
    { family: '홀 5 : 짝 1', filter: '리스트추천 소수', capture: 1.227 },
    { family: '저 1 : 고 5', filter: '총합 145–267', capture: 0.962 },
    { family: '저 5 : 고 1', filter: '총합 37–130', capture: 1.000 },
    { family: '9 이하 0개', filter: '분배 ≤ 0.90', capture: 0.999 },
  ]

  const CELLS_SCANNED = 506
  const CELLS_SIGNIFICANT = 13

  // ── les 회차 sans 이월번호 ───────────────────────────────────────────────
  //
  // Le seul test de toute la série qui ait produit un vrai écart. Dix
  // répétitions de cent 회차 tirés au sort dans le vivier des 392, cent
  // grilles par 회차. Les répétitions se recoupent — même vivier — donc ce
  // sont dix tirages de grilles sur un terrain commun, pas dix expériences
  // indépendantes. Assez pour voir si un filtre tient.

  const ZERO_RUN = { zero: 392, share: 0.392, expected: 0.401, reps: 10, draws: 100, grids: 100 }

  const ZERO_FILTERS = [
    { label: '조건 없음 — 대조군', r4: 151, r5: 2203, ret: 0.577, mean: 0.7984, t: -0.44, beat: null, star: true },
    { label: '저고 2·3·4', r4: 131, r5: 2220, ret: 0.220, mean: 0.7963, t: -2.32, beat: 5 },
    { label: '홀짝 2·3·4', r4: 145, r5: 2149, ret: 0.211, mean: 0.7992, t: -0.26, beat: 3 },
    { label: 'AC값 8·9·10', r4: 142, r5: 2191, ret: 0.227, mean: 0.7987, t: -0.53, beat: 6 },
    { label: '앞자리수합 14–18', r4: 136, r5: 2285, ret: 0.197, mean: 0.8016, t: 0.53, beat: 4 },
    { label: '끝자리수합 19–28', r4: 136, r5: 2322, ret: 0.236, mean: 0.8044, t: 1.39, beat: 5 },
    { label: '소수숫자수 1·2·3', r4: 128, r5: 2166, ret: 0.217, mean: 0.7951, t: -2.03, beat: 2 },
    { label: '합성수숫자수 3·4·5', r4: 128, r5: 2284, ret: 0.693, mean: 0.7994, t: -0.19, beat: 4, star: true },
    { label: '이의배수 2·3·4', r4: 145, r5: 2149, ret: 0.211, mean: 0.7992, t: -0.26, beat: 3 },
    { label: '삼의배수 1·2·3', r4: 157, r5: 2316, ret: 0.266, mean: 0.7999, t: -0.03, beat: 6 },
    { label: '사의배수 0·1·2', r4: 123, r5: 2262, ret: 0.175, mean: 0.8014, t: 0.72, beat: 2 },
    { label: '오의배수 0·1·2', r4: 130, r5: 2209, ret: 0.220, mean: 0.8004, t: 0.22, beat: 3 },
    { label: '총합 100–175', r4: 150, r5: 2286, ret: 0.233, mean: 0.7979, t: -1.18, beat: 6 },
    { label: '제외구간 1–9', r4: 142, r5: 2341, ret: 0.244, mean: 0.8150, t: 4.42, beat: 4 },
    { label: '제외구간 40–45', r4: 143, r5: 2168, ret: 0.219, mean: 0.7949, t: -1.10, beat: 4 },
    { label: '리스트추천 소수', r4: 119, r5: 2155, ret: 0.649, mean: 0.8062, t: 0.50, beat: 2, star: true },
    { label: '리스트추천 합성수', r4: 132, r5: 2225, ret: 0.221, mean: 0.7962, t: -0.71, beat: 3 },
    { label: '리스트추천 이의배수', r4: 130, r5: 2279, ret: 0.278, mean: 0.8028, t: 0.19, beat: 6 },
    { label: '리스트추천 삼의배수', r4: 96, r5: 1976, ret: 0.177, mean: 0.7737, t: -2.86, beat: 4 },
    { label: '분배 ≤ 1.00', r4: 137, r5: 2226, ret: 0.253, mean: 0.8029, t: 1.30, beat: 5 },
    { label: '분배 ≤ 0.90', r4: 154, r5: 2317, ret: 0.209, mean: 0.8174, t: 5.06, beat: 5 },
    { label: '전부 체크', r4: 130, r5: 2277, ret: 0.238, mean: 0.8126, t: 3.76, beat: 4 },
    { label: '전부 체크 + 분배 ≤ 0.90', r4: 145, r5: 2442, ret: 0.209, mean: 0.8270, t: 8.81, beat: 5 },
    { label: '이월번호수 0·1', r4: 146, r5: 2485, ret: 0.252, mean: 0.8428, t: 15.20, beat: 5 },
    { label: '제외번호 = 직전 7개', r4: 253, r5: 3338, ret: 0.390, mean: 0.9200, t: 28.25, beat: 9, keep: true },
    { label: '제외번호 7개 + 전부 체크', r4: 239, r5: 3385, ret: 0.358, mean: 0.9262, t: 28.30, beat: 8, keep: true },
    { label: '고정번호 2개 — 이월에서', r4: 21, r5: 892, ret: 0.055, mean: 0.6062, t: -32.71, beat: 0, keep: true },
  ]
  const ZERO_EXPECTED = { r4: 136, r5: 2244 }

  // Le même 제외번호 = 직전 7개, mais sur les mille 회차 sans en trier aucun.
  const ZERO_ALL = [
    { carry: 0, draws: 392, mean: 0.9311, ret: 0.328 },
    { carry: 1, draws: 425, mean: 0.7599, ret: 0.142 },
    { carry: 2, draws: 160, mean: 0.6053, ret: 0.046 },
    { carry: 3, draws: 22, mean: 0.4650, ret: 0.007 },
    { carry: 4, draws: 1, mean: 0.1500, ret: 0.000 },
  ]
  const ZERO_ALL_TOTAL = { draws: 1000, mean: 0.7952, ret: 0.196, r3: 1, r4: 148, r5: 2171 }

  /** Un espace de combinaisons : lisible même quand il tombe sous le pour cent. */
  const spc = (v) => (v >= 0.01 ? `${(v * 100).toFixed(1)}%` : `${(v * 100).toFixed(3)}%`)
</script>

<section class="panel">
  <div class="head">
    <h2>폼의 조건들이 정말 무언가를 바꾸는가</h2>
    <span class="gloss">고정수의 옆 질문</span>
  </div>

  <p class="lede">
    고정수는 「두 번호를 안다면」에 답합니다. 이 화면은 그 옆의 질문에
    답합니다 — <strong>저고, 홀짝, AC값, 총합, 제외구간, 리스트추천…
    이 칸들을 체크하면 더 따는가?</strong> 자동조합 화면 아래에 이미 답이
    한 줄 적혀 있습니다. 여기서는 그 문장을 <em>측정으로</em> 보여줍니다.
  </p>

  <div class="picker" role="group" aria-label="측정 범위">
    {#each MODES as m (m.key)}
      <button class:on={mode === m.key} onclick={() => (mode = m.key)} title={m.gloss}>
        {m.label}
      </button>
    {/each}
  </div>

  <div class="spaces">
    <div class="board" aria-label="직전 회차의 일곱 번호를 지운 45칸">
      {#each CELLS as n (n)}
        <div class="cell" class:out={excluded.has(n)} class:keep={!excluded.has(n)}>{n}</div>
      {/each}
    </div>

    <div class="spacebox">
      <span class="tag">제외번호 = 직전 7개</span>
      <span class="figure h1">{now.mean.toFixed(4)}</span>
      <span class="unit dim">조합당 맞춘 번호 · 우연이라면 {BASE.toFixed(4)}</span>
      <dl>
        <div><dt>회차</dt><dd>{num(now.draws)}회</dd></div>
        <div><dt>번호 하나가 나올 비율</dt><dd>{pct(perNumber, 2)}</dd></div>
        <div><dt>본전선</dt><dd>{pct(BREAKEVEN, 2)}</dd></div>
        <div><dt>회수율</dt><dd>{pct(now.ret, 1)}</dd></div>
        <div><dt>우연 대비</dt><dd class:up={gain > 0.005} class:down={gain < -0.005}>
          {gain > 0 ? '+' : ''}{gain.toFixed(4)}
        </dd></div>
      </dl>
    </div>
  </div>

  {#if lastRang}
    <p class="note dim">
      지워진 칸은 <strong>{lastRang}회의 일곱 번호</strong>입니다 — 다음 회차를
      준비할 때 제외번호에 넣게 되는 그 번호들입니다. 남는 것은
      <strong>{NMAX - excluded.size}개</strong>.
    </p>
  {/if}

  <p class="note dim">
    {#if now.oracle}
      이월이 0개일 회차만 골라서 샀다고 가정한 값입니다. 직전 일곱 번호가
      <strong>확실히 안 나온다</strong>면 당첨 번호 여섯 개는 45개가 아니라
      38개 안에 있고, 번호 하나가 나올 비율은 13.33%에서
      <strong>{pct(perNumber, 2)}</strong>로 오릅니다. 그런데 본전선은
      {pct(BREAKEVEN, 2)}입니다 — <strong>아직 아래</strong>입니다.
    {:else}
      회차를 고르지 않고 매주 같은 필터로 샀을 때의 값입니다.
      <strong>{now.mean.toFixed(4)} 대 {BASE.toFixed(4)}</strong> — 우연과
      같습니다. 위에서 번 것을 이월이 1개·2개인 회차에서 그대로 잃기
      때문이고, 그 계산은 아래 표에 있습니다.
    {/if}
  </p>

  <p class="note dim">
    위의 두 값은 <strong>같은 한 번의 주행</strong>에서 나옵니다 — 1,000회차
    전부, 회차당 100조합, 그 결과를 실제 이월별로 나눈 것입니다. 아래 표의
    0.9200은 <strong>다른 방식</strong>입니다: 392회차 중에서 100회차를
    무작위로 뽑는 일을 열 번 되풀이한 값입니다. 표본이 다르니 소수 셋째
    자리가 다르고, 결론은 같습니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>자동조합 필터는 무엇을 바꾸나</h2>
    <span class="gloss">
      {RUN.blocks}블록 × {RUN.span}회차 × {RUN.grids}조합 · 필터당
      {num(RUN.blocks * RUN.span * RUN.grids)}조합
    </span>
  </div>

  <p class="lede small">
    각 필터는 과거에 가장 자주 나온 값으로 맞췄습니다 — 자동조합 화면의
    「과거 %」가 그 값입니다. 모든 조합은 그 화면이 부르는 같은 엔진에서
    나왔고, 어떤 필터도 측정을 위해 다시 쓰지 않았습니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>필터</th><th class="v">남는 공간</th><th class="v">2등</th><th class="v">3등</th>
          <th class="v">회수율</th><th class="v">평균맞춤</th><th class="v">t</th>
        </tr>
      </thead>
      <tbody>
        {#each FILTERS as f, i (f.label)}
          <tr class:sep={i === 1}>
            <td>{f.label}</td>
            <td class="val dim">{spc(f.space)}</td>
            <td class="val" class:rk={f.r2 > 0}>{f.r2}</td>
            <td class="val dim">{f.r3}</td>
            <td class="val" class:over={f.ret > 0.35}>{pct(f.ret, 1)}</td>
            <td class="val dim">{f.mean.toFixed(4)}</td>
            <td class="val" class:over={Math.abs(f.t) > 2.262}>
              {f.t > 0 ? '+' : ''}{f.t.toFixed(2)}
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td>우연이라면</td>
          <td class="val dim">100%</td>
          <td class="val">0.07</td>
          <td class="val dim">2.8</td>
          <td class="val dim">—</td>
          <td class="val"><b>{BASE.toFixed(4)}</b></td>
          <td class="val dim">0</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    스물네 개 필터 전부 <strong>1등 0회</strong>이고, 평균맞춤은 0.7855에서
    0.8142 사이 — 기준은 {BASE.toFixed(4)}입니다. t가 ±2.26을 넘는 것은 둘뿐이고
    그중 하나(AC값 −2.75)는 <em>우연보다 나쁜</em> 쪽입니다. 스물네 번
    시험하면 한두 개는 그냥 넘습니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>2등 두 번이 말하는 것</h2>
    <span class="gloss">회수율이 높아 보이는 두 필터를 열어보면</span>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>필터</th><th>회차</th><th>조합</th><th>추첨</th>
          <th class="v">당첨금</th><th class="v">회수율</th><th class="v">그 회차를 빼면</th>
        </tr>
      </thead>
      <tbody>
        {#each TWO as e (e.rang)}
          <tr>
            <td>{e.label}</td>
            <td class="dim">{e.rang}회</td>
            <td class="mono">{e.grid.join(' ')}</td>
            <td class="mono dim">{e.draw.join(' ')} <span class="rk">+{e.bonus}</span></td>
            <td class="val">{num(e.prize)}원</td>
            <td class="val over">{pct(e.with, 1)}</td>
            <td class="val">{pct(e.without, 1)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    2등 <strong>0.07 × 24 필터 = 1.7개</strong>가 기댓값입니다. 두 개는
    정상입니다. 그리고 그 <em>단 한 회차</em>를 빼면 두 필터 모두 대조군
    22.8%보다 <strong>아래</strong>로 떨어집니다. 좁은 필터가 실제로 바꾸는
    것은 확률이 아니라 100장 사이의 <strong>상관</strong>입니다 — 리스트추천
    소수는 조합이 3,003개뿐이라 100장이 함께 이기고 함께 집니다.
  </p>
</section>

<section class="panel edge">
  <div class="head">
    <h2>필터 × 패밀리 — 밖에서 고르기</h2>
    <span class="gloss">앞 절반에서 고르고, 뒤 절반에서 심판한다</span>
  </div>

  <p class="lede small">
    22개 필터 × 19개 패밀리 = 418칸. 가장 좋은 칸을 찾아 발표하면 결과는
    반드시 나오고, 반드시 틀립니다. 그래서 규칙은 하나뿐입니다 —
    <strong>240회 → 739회</strong>에서 패밀리마다 필터를 고르고,
    <strong>740회 → 1239회</strong>에 그대로 적용해 그 쪽만 읽습니다.
    게다가 불가능한 선물까지 줬습니다: 추첨 전에 그 회차의 패밀리를 안다고
    가정했습니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>패밀리 기준</th><th>고른 기준</th><th class="v">앞 절반</th>
          <th class="v">뒤 절반</th><th class="v">평균맞춤</th><th class="v">대조군 대비</th>
        </tr>
      </thead>
      <tbody>
        {#each CROSS as c, i (c.label + c.crit)}
          <tr class:sep={i === 8}>
            <td>{c.crit === '돈' ? c.label : ''}{#if c.leak && c.crit === '돈'} <span class="rk">*</span>{/if}</td>
            <td class="dim">{c.crit}</td>
            <td class="val dim">{pct(c.learn, 1)}</td>
            <td class="val">{pct(c.judge, 1)}</td>
            <td class="val dim">{c.mean.toFixed(4)}</td>
            <td class="val" class:over={c.judge > CROSS_CONTROL} class:under={c.judge < CROSS_CONTROL}>
              {c.judge > CROSS_CONTROL ? '+' : ''}{((c.judge - CROSS_CONTROL) * 100).toFixed(1)} pts
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td colspan="3">조건 없음 — 뒤 절반</td>
          <td class="val"><b>{pct(CROSS_CONTROL, 1)}</b></td>
          <td class="val dim">{BASE.toFixed(4)}</td>
          <td class="val dim">—</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    돈으로 고르면 앞 절반이 140~152%까지 오르고 뒤 절반에서 20% 근처로
    무너집니다. 이것이 <strong>과적합의 서명</strong>입니다. 그리고 진짜
    결과는 위 네 줄입니다 — 이월·패턴·온도·사망, 즉 번호의 정체를 누설하지
    않는 네 기준은 전부 <strong>대조군보다 아래</strong>입니다.
  </p>

  <p class="lede small mark">
    별표가 붙은 세 기준(홀짝·저고·9 이하)은 왜 이겼나. 선택이 각 패밀리에
    무엇을 골랐는지 열어보면 됩니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr><th>패밀리</th><th>고른 필터</th><th class="v">조합당 맞춘 번호</th></tr>
      </thead>
      <tbody>
        {#each ORACLE as o (o.family)}
          <tr>
            <td>{o.family}</td>
            <td class="rk">{o.filter}</td>
            <td class="val over">{o.capture.toFixed(3)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td colspan="2">우연이라면</td>
          <td class="val"><b>{BASE.toFixed(3)}</b></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    한 줄씩 읽어보십시오. 「짝수가 다섯」 패밀리에는 <em>짝수만 고르는</em>
    필터를, 「홀수가 다섯」에는 거의 다 홀수인 소수를, 「23 이상이 다섯」에는
    총합이 높은 조합을, 「9 이하가 0개」에는 <em>9 이하를 금지하는</em> 분배
    필터를 골랐습니다. 선택은 매번 <strong>패밀리의 정의를 그대로 되풀이할
    뿐</strong>입니다. 예언이 답을 건네주고 알고리즘이 그것을 받아 적습니다.
    그리고 이 세 기준은 <strong>추첨 전에는 알 수 없는</strong> 것들입니다 —
    토요일 아침에 이번 추첨이 홀 1 : 짝 5인지 아는 사람은 없습니다.
  </p>

  <p class="note dim">
    앞 절반에서 살펴본 {CELLS_SCANNED}칸 중 |z| &gt; 1.96은
    {CELLS_SIGNIFICANT}칸입니다. 순전한 우연이라면 {Math.round(0.05 * CELLS_SCANNED)}칸이
    나옵니다. <strong>잡음보다도 구조가 적습니다.</strong>
  </p>
</section>

<section class="panel edge">
  <div class="head">
    <h2>이월번호가 0개인 회차만</h2>
    <span class="gloss">
      {ZERO_RUN.reps}번 반복 × {ZERO_RUN.draws}회차 × {ZERO_RUN.grids}조합
    </span>
  </div>

  <p class="lede small">
    {RUN.from}회 → {RUN.to}회 중 <strong>{ZERO_RUN.zero}회차</strong>는 직전
    회차의 번호가 <strong>하나도</strong> 나오지 않았습니다 —
    {pct(ZERO_RUN.share, 1)}, 우연이라면 {pct(ZERO_RUN.expected, 1)}입니다. 그 회차만
    남기고 폼의 모든 필터를 다시 돌렸습니다. 그리고 이 상황이 부르는 필터를
    셋 더했습니다. 하나는 <strong>직전 회차의 일곱 번호를 제외번호에 넣는
    것</strong> — 화면이 원래 할 수 있는데 한 번도 시험하지 않았던 조합입니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>필터</th><th class="v">4등</th><th class="v">5등</th>
          <th class="v">회수율</th><th class="v">평균맞춤</th><th class="v">t</th>
          <th class="v">&gt;대조</th>
        </tr>
      </thead>
      <tbody>
        {#each ZERO_FILTERS as f, i (f.label)}
          <tr class:sep={i === 1 || f.keep} class:top={f.keep}>
            <td>{f.label}{#if f.star} <span class="rk">*</span>{/if}</td>
            <td class="val" class:over={f.r4 > 200}>{f.r4}</td>
            <td class="val" class:over={f.r5 > 3000}>{num(f.r5)}</td>
            <td class="val">{pct(f.ret, 1)}</td>
            <td class="val" class:over={f.mean > 0.85} class:under={f.mean < 0.75}>
              {f.mean.toFixed(4)}
            </td>
            <td class="val" class:over={Math.abs(f.t) > 3}>
              {f.t > 0 ? '+' : ''}{f.t.toFixed(2)}
            </td>
            <td class="val dim">{f.beat === null ? '—' : `${f.beat}/10`}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td>우연이라면</td>
          <td class="val">{ZERO_EXPECTED.r4}</td>
          <td class="val">{num(ZERO_EXPECTED.r5)}</td>
          <td class="val dim">—</td>
          <td class="val"><b>{BASE.toFixed(4)}</b></td>
          <td class="val dim">0</td>
          <td class="val dim">5/10</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    <span class="rk">*</span> 대조군의 57.7%, 합성수의 69.3%, 소수의 64.9%는
    각각 <strong>2등 한 번</strong>이 만든 숫자입니다. 그것을 빼면 대조군은
    21.7%입니다.
  </p>

  <p class="note dim">
    이 표에서 처음으로 진짜 차이가 나옵니다. <strong>제외번호 = 직전 7개</strong>는
    조합당 0.9200개를 맞히고 — 기준은 {BASE.toFixed(4)} — 4등을 151개에서
    <strong>253개</strong>로, 5등을 2,203개에서 <strong>3,338개</strong>로
    올리며, 열 번 중 <strong>아홉 번</strong> 대조군을 이깁니다. 그 거울상이
    같은 사실을 확인해 줍니다: 이월에서 고정번호 2개를 잡으면 0.6062로
    <strong>열 번 모두</strong> 집니다. 이유는 예측이 아니라 산수입니다 —
    나오지 않을 것이 확정된 일곱 개를 지우면 여섯 개의 당첨 번호가
    38개 안에 있게 됩니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>그런데 회차를 고를 수가 없다</h2>
    <span class="gloss">같은 필터를 1,000회차 전부에</span>
  </div>

  <p class="lede small">
    다음 회차의 이월이 0개일지는 <strong>토요일 아침에 알 수 없습니다</strong>.
    그래서 같은 필터를 회차를 고르지 않고 1,000회 전부에 적용했습니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr><th>실제 이월</th><th class="v">회차</th><th class="v">평균맞춤</th><th class="v">회수율</th></tr>
      </thead>
      <tbody>
        {#each ZERO_ALL as z (z.carry)}
          <tr>
            <td>{z.carry}개</td>
            <td class="val dim">{z.draws}</td>
            <td class="val" class:over={z.mean > 0.85} class:under={z.mean < 0.75}>
              {z.mean.toFixed(4)}
            </td>
            <td class="val">{pct(z.ret, 1)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td>전체</td>
          <td class="val">{num(ZERO_ALL_TOTAL.draws)}</td>
          <td class="val"><b>{ZERO_ALL_TOTAL.mean.toFixed(4)}</b></td>
          <td class="val">{pct(ZERO_ALL_TOTAL.ret, 1)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    <strong>{ZERO_ALL_TOTAL.mean.toFixed(4)} 대 {BASE.toFixed(4)}</strong>.
    이월 0개 회차 {ZERO_ALL[0].draws}개에서 번 것을 나머지
    {ZERO_ALL_TOTAL.draws - ZERO_ALL[0].draws}개에서 정확히 잃습니다. 합은
    0이고, 0일 수밖에 없습니다 — 아무 일곱 개를 빼는 것은 정의상 아무것도
    바꾸지 않기 때문입니다. 필터는 이익을 <em>만들지</em> 않고, 맞힌 회차 쪽으로
    <strong>옮길</strong> 뿐입니다.
  </p>
</section>

<section class="panel plain">
  <p class="close">
    폼의 어떤 칸도 한 장의 당첨 확률을 바꾸지 않습니다. 좁게 고르면 조합 수만
    줄고, 100장이 함께 이기고 함께 지게 될 뿐입니다. 화려한 회수율이 나올
    때마다 이유는 늘 같았습니다 — <strong>단 한 회차</strong>.
  </p>
  <p class="close">
    가장 가까이 간 것은 <strong>직전 일곱 번호를 지우는 것</strong>이었습니다.
    조합당 0.9200개 — 이 사이트가 만든 유일한 진짜 차이입니다. 그런데 그것은
    「이번 회차의 이월은 0개다」라는, 토요일 아침에는 존재하지 않는 정보를
    요구합니다. 그리고 그 정보를 받는다 해도 번호 하나가 나올 비율은
    {pct(ZERO_ALL[0].mean / PICK, 2)}, 본전선 {pct(BREAKEVEN, 2)}에는
    <strong>닿지 않습니다</strong>.
  </p>
</section>

<style>
  .lede { margin: 0 0 1rem; color: var(--ink-soft); max-width: 62ch; }
  .lede.small { font-size: 0.875rem; }
  .lede.mark { margin-top: 1.5rem; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 74ch; }
  .note strong, .lede strong { color: var(--ink); font-weight: 600; }

  /* Le sélecteur : c'est lui qui fait de cette page un écran plutôt qu'un
     rapport. Les deux boutons sont les deux mondes — celui où l'on choisit
     ses 회차 et celui où l'on joue toutes les semaines. */
  .picker { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .picker button { border-radius: 999px; padding: 0.3rem 0.95rem; font-size: 0.8125rem; }
  .picker button.on {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--surface);
    font-weight: 600;
  }

  .spaces { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1.5rem 2.5rem; }
  .spacebox { display: flex; flex-direction: column; gap: 0.2rem; min-width: 15rem; flex: 1 1 15rem; }
  .spacebox .tag {
    font-size: 0.6875rem;
    letter-spacing: 0.09em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .spacebox .figure.h1 { color: var(--gold); font-size: 1.75rem; line-height: 1.2; }
  .spacebox .unit { font-size: 0.75rem; margin-bottom: 0.7rem; }

  /* Les 45 numéros, dont sept barrés : voir le vivier rétrécir dit en une
     image ce que 6/38 contre 6/45 met un paragraphe à expliquer. */
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
    color: var(--muted);
    background: var(--paper);
    border-radius: 2px;
  }
  /* Les trente-huit qui restent sont la démonstration — ce sont eux qu'on
     doit voir en premier, pas les sept qui partent. */
  .cell.keep { background: var(--gold-wash); color: var(--ink-soft); }
  .cell.out {
    background: transparent;
    color: var(--muted);
    text-decoration: line-through;
    box-shadow: inset 0 0 0 1px var(--line);
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
  dd.down { color: var(--muted); }

  th.v, td.val { text-align: right; }
  .rk { color: var(--gold-deep); }
  tfoot td {
    border-top: 1px solid var(--line);
    font-size: 0.8125rem;
    padding-top: 0.5rem;
  }
  tfoot tr.keep td { font-weight: 600; color: var(--ink); }
  tbody tr.sep td { border-top: 1px solid var(--line); }
  /* Les trois lignes qui ne ressemblent pas aux autres — le 제외번호 et son
     miroir. Elles portent le seul écart réel de la page. */
  tbody tr.top td { font-weight: 600; color: var(--ink); }
  td.over { color: var(--gold-deep); }
  td.under { color: var(--muted); }
  td.mono { font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

  .edge { border-color: var(--gold-soft); }
  .plain { background: var(--gold-wash); border-color: var(--gold-soft); }
  .close { margin: 0; font-size: 0.9375rem; line-height: 1.7; max-width: 70ch; }
  .close + .close { margin-top: 0.9rem; }
  .close strong { color: var(--gold-deep); font-weight: 600; }
</style>
