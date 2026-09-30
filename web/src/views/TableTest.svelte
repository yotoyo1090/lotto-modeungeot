<script>
  // 팁 › 테이블 검정 — les deux listes tirées de 테이블 › 당첨이월.
  //
  // Le nom dit d'où viennent les données. Il ne dit pas « 리스트 » : cet
  // écran-là existe déjà dans la barre du haut, il est d'origine, et rien
  // ici ne le concerne.
  //
  // La page 테이블 › 당첨이월 montre sept colonnes, une par position. Chaque
  // ligne d'une colonne est un ancien 회차 qui contenait le numéro que ce
  // 회차-ci a mis à cette place : sept numéros, donc une combinaison.
  //
  // L'idée mise à l'épreuve ici : prendre quelques combinaisons dans la
  // colonne, les fondre en retirant les doublons — 리스트 1 — puis prendre
  // tout ce qui n'y est pas — 리스트 2. Sept positions, deux listes chacune,
  // quatorze viviers.
  //
  // Le haut de l'écran fait la construction en direct sur le dernier 회차
  // connu : on voit les lignes retenues, les deux listes qui en sortent, et
  // ce qu'elles ont donné sur mille 회차. Le reste est mesuré.
  //
  // Marche avant stricte dans tous les backtests : pour jouer le 회차 i on
  // lit la page du 회차 i−1. `patternLines` ne remonte que les 회차 antérieurs.
  import { NMAX, PICK } from '@core/draws.js'
  import { PATTERN_POSITIONS, patternLines } from '@core/table.js'
  import { num } from '../lib/format.js'

  let { draws } = $props()

  const BASE = PICK / NMAX               // 13,333 % par numéro
  const WINDOW = 100                     // les cent dernières lignes
  const pct = (v, d = 2) => `${(v * 100).toFixed(d)}%`

  let position = $state(0)
  let size = $state(5)
  const SIZES = [5, 10]

  const at = $derived(draws.n - 1)
  const rang = $derived(draws.rangs[at])
  const target = $derived(draws.sequenceAt(at)[position])

  // La colonne entière, puis la fenêtre, puis les lignes retenues : les trois
  // étapes de la procédure, dans l'ordre où on les fait.
  const column = $derived(patternLines(draws, at, position))
  // Surtout pas `window` : ce nom masquerait l'objet global du navigateur.
  const recent = $derived(column.slice(Math.max(0, column.length - WINDOW)))
  const picked = $derived.by(() => {
    const n = recent.length
    if (n < 2) return []
    const s = Math.min(size, n)
    return Array.from({ length: s }, (_, k) =>
      Math.round((k * (n - 1)) / (s - 1)))
  })
  const taken = $derived(picked.map((i) => recent[i]))

  const listOne = $derived.by(() => {
    const inside = new Set()
    for (const l of taken) for (const n of l.numbers) inside.add(n)
    return inside
  })
  const one = $derived([...listOne].sort((a, b) => a - b))
  const two = $derived.by(() => {
    const out = []
    for (let n = 1; n <= NMAX; n++) if (!listOne.has(n)) out.push(n)
    return out
  })
  const CELLS = Array.from({ length: NMAX }, (_, i) => i + 1)

  // Le nombre de numéros distincts est prévisible : le numéro de la position
  // est dans toutes les lignes, les six autres de chaque ligne se disputent
  // les 44 restants. 1 + 44·(1 − (38/44)^S).
  const expectOne = $derived(1 + (NMAX - 1) * (1 - ((NMAX - 1 - (PICK)) / (NMAX - 1)) ** size))

  // ── ce que les listes attrapent, sur mille 회차 ─────────────────────────
  //
  // Mesuré sans grilles : à chaque 회차 on compte combien des six sortis
  // tombent dans chaque liste. Les deux listes se partagent les 45 numéros,
  // donc leurs deux comptes font toujours six.
  const CATCH = {
    5: {
      one: [[23.9, 3.181, 3.188], [23.9, 3.175, 3.186], [23.8, 3.152, 3.171],
        [23.8, 3.157, 3.179], [23.9, 3.127, 3.184], [24.0, 3.205, 3.194], [23.9, 3.227, 3.186]],
      two: [[21.1, 2.819, 2.812], [21.1, 2.825, 2.814], [21.2, 2.848, 2.829],
        [21.2, 2.843, 2.821], [21.1, 2.873, 2.816], [21.0, 2.795, 2.806], [21.1, 2.773, 2.814]],
    },
    10: {
      one: [[34.8, 4.631, 4.640], [34.8, 4.634, 4.636], [34.6, 4.600, 4.619],
        [34.7, 4.652, 4.629], [34.9, 4.656, 4.648], [34.8, 4.623, 4.643], [34.8, 4.637, 4.635]],
      two: [[10.2, 1.369, 1.360], [10.2, 1.366, 1.364], [10.4, 1.400, 1.381],
        [10.3, 1.348, 1.371], [10.1, 1.344, 1.352], [10.2, 1.377, 1.357], [10.2, 1.363, 1.365]],
    },
  }
  const catchOne = $derived(CATCH[size].one[position])
  const catchTwo = $derived(CATCH[size].two[position])

  // 조합 10개 · 리스트 2 — combien de gagnants elle contenait, semaine par
  // semaine. La colonne « 6개 » est vide partout : c'est là qu'est le 1등.
  const DIST = [
    [177, 404, 307, 98, 13, 1, 0], [196, 395, 282, 104, 20, 3, 0],
    [184, 396, 281, 114, 25, 0, 0], [204, 394, 269, 118, 13, 2, 0],
    [193, 409, 275, 107, 16, 0, 0], [185, 397, 300, 95, 20, 3, 0],
    [201, 379, 298, 103, 16, 3, 0],
  ]

  // ── le backtest par rang ───────────────────────────────────────────────
  //
  // 1040회 → 1239회, 200 회차, 100 조합 par 회차, 58 configurations : les
  // sept positions × deux listes × deux tailles, chacune seule puis avec
  // toutes les cases du formulaire cochées, plus deux témoins.
  const RANKS = [
    { label: '조합 5개 · 필터 없음', n: 14, draws: 2800, grids: 280000, r: [0, 1, 6, 367, 6243], ret: 0.386, clean: 0.205 },
    { label: '조합 5개 · 전부 체크', n: 14, draws: 2800, grids: 280000, r: [0, 0, 5, 335, 5723], ret: 0.188, clean: 0.188 },
    { label: '조합 10개 · 필터 없음', n: 14, draws: 2788, grids: 278800, r: [0, 1, 3, 364, 6772], ret: 0.306, clean: 0.198 },
    { label: '조합 10개 · 전부 체크', n: 14, draws: 2442, grids: 244200, r: [0, 0, 4, 285, 5755], ret: 0.201, clean: 0.201 },
    { label: '대조군 — 45개 전부', n: 2, draws: 400, grids: 40000, r: [0, 0, 1, 44, 850], ret: 0.203, clean: 0.203 },
  ]
  const TOTAL = { grids: 1123000, r: [0, 2, 19, 1395, 25343], e: [0.14, 0.83, 31.44, 1532.48, 25200.79] }

  // Les deux seuls 2등 des 1 123 000 조합, et le 회차 qui les a produits.
  const TWO_WINS = [
    { cfg: '조합 5개 · 3번 · 리스트 2', rang: 1092, grid: [7, 18, 19, 33, 37, 45],
      draw: [7, 18, 19, 26, 33, 45], bonus: 37, won: 50_263_170, ret: 2.742, clean: 0.229 },
    { cfg: '조합 10개 · 1번 · 리스트 1', rang: 1189, grid: [9, 19, 29, 31, 35, 38],
      draw: [9, 19, 29, 35, 37, 38], bonus: 31, won: 29_368_730, ret: 1.706, clean: 0.237 },
  ]

  // ── le balayage : toutes les façons de prendre les lignes ──────────────
  //
  // 44 règles — fenêtres de 10 lignes à la colonne entière, 2 à 20 lignes
  // réparties dedans, et chaque ligne prise seule de la 1re à la 20e en
  // remontant — × 7 positions × 2 listes = 616 configurations.
  const SWEEP = {
    rules: 44, configs: 616, over: 4, expected: 31, max: 2.41, min: -2.16,
    best: [
      { label: '1번 · 리스트 1 · 아래에서 14번째 줄', pool: 7.0, rate: 0.14314, z: 2.41, a: 0.14057, b: 0.14571 },
      { label: '5번 · 리스트 1 · 아래에서 5번째 줄', pool: 7.0, rate: 0.14157, z: 2.03, a: 0.14143, b: 0.14171 },
      { label: '5번 · 리스트 1 · 최근 10줄 · 3개', pool: 16.7, rate: 0.13863, z: 2.01, a: 0.13682, b: 0.14044 },
      { label: '2번 · 리스트 1 · 아래에서 10번째 줄', pool: 7.0, rate: 0.14129, z: 1.96, a: 0.14400, b: 0.13857 },
      { label: '6번 · 리스트 1 · 아래에서 15번째 줄', pool: 7.0, rate: 0.14129, z: 1.96, a: 0.14114, b: 0.14143 },
    ],
    worst: { label: '6번 · 리스트 1 · 아래에서 20번째 줄', rate: 0.12457, z: -2.16 },
    topA: { learn: 0.14677, judge: 0.13043, kept: 2 },
  }

  // ── le test en vrai : choisi sur 240–739회, joué des deux côtés ────────
  //
  // Le vainqueur brut du balayage — 3번 · 리스트 2 · 전체 · 20개 — n'a que
  // 2,4 numéros : on ne peut pas en faire une grille, et sur 500 회차 il
  // n'était jouable que douze fois. On ne garde donc que les listes d'au
  // moins douze numéros : 413 des 616.
  const PICKED_BY_HALF = [
    { pos: '1번', rule: '리스트 1 · 최근 10줄 · 10개', rate: 0.13533 },
    { pos: '2번', rule: '리스트 1 · 최근 10줄 · 2개', rate: 0.13795 },
    { pos: '3번', rule: '리스트 2 · 최근 50줄 · 5개', rate: 0.13883 },
    { pos: '4번', rule: '리스트 1 · 최근 20줄 · 2개', rate: 0.13580 },
    { pos: '5번', rule: '리스트 1 · 최근 50줄 · 5개', rate: 0.13863 },
    { pos: '6번', rule: '리스트 1 · 최근 100줄 · 3개', rate: 0.13782 },
    { pos: '7번', rule: '리스트 1 · 최근 20줄 · 2개', rate: 0.14215 },
  ]

  const OUT = [
    { label: '대조군 — 45개 전부',
      a: { pool: 45.0, r: [1, 57, 1130], ret: 0.196, mean: 0.7993, rate: 0.13322 },
      b: { pool: 45.0, r: [3, 52, 1096], ret: 0.242, mean: 0.7954, rate: 0.13257 } },
    { label: '전반부 1위 하나', star: true,
      a: { pool: 12.1, r: [7, 122, 1360], ret: 0.463, mean: 0.8481, rate: 0.14135 },
      b: { pool: 12.1, r: [1, 65, 1181], ret: 0.211, mean: 0.7988, rate: 0.13313 } },
    { label: '일곱 위치 최고 · 합집합',
      a: { pool: 44.3, r: [0, 49, 1115], ret: 0.161, mean: 0.7985, rate: 0.13308 },
      b: { pool: 44.3, r: [2, 60, 1109], ret: 0.221, mean: 0.7924, rate: 0.13206 } },
    { label: '일곱 위치 최고 · 3곳 이상 겹침', star: true,
      a: { pool: 28.3, r: [0, 94, 1281], ret: 0.222, mean: 0.8365, rate: 0.13942 },
      b: { pool: 28.5, r: [4, 60, 1104], ret: 0.293, mean: 0.8015, rate: 0.13359 } },
  ]
</script>

<section class="panel">
  <div class="head">
    <h2>당첨이월에서 두 리스트를 만든다</h2>
    <span class="gloss">{num(rang)}회 페이지에서 지금 만들어 봅니다</span>
  </div>

  <p class="lede">
    테이블 › 당첨이월 은 일곱 칸을 나란히 보여줍니다. 한 칸의 각 줄은
    <strong>그 자리의 번호를 갖고 있던 옛 회차</strong>이고, 줄마다 일곱
    개의 번호가 있습니다 — 즉 <strong>조합 하나</strong>입니다. 여기서 몇
    줄을 골라 합치고 중복을 빼면 <strong>리스트 1</strong>, 거기에 없는
    번호를 모으면 <strong>리스트 2</strong>가 됩니다.
  </p>

  <div class="picker" role="group" aria-label="자리">
    {#each PATTERN_POSITIONS as p (p.key)}
      <button class:on={position === p.key} onclick={() => (position = p.key)}>{p.label}</button>
    {/each}
    <span class="sep" aria-hidden="true"></span>
    {#each SIZES as s (s)}
      <button class="wide" class:on={size === s} onclick={() => (size = s)}>조합 {s}개</button>
    {/each}
  </div>

  <ol class="proto">
    <li>
      <b>칸을 연다</b> — {PATTERN_POSITIONS[position].label} 자리의 번호는
      <b class="rk">{target}</b>. 이 번호를 갖고 있던 옛 회차는
      <b>{num(column.length)}줄</b>입니다.
    </li>
    <li>
      <b>창을 자른다</b> — 가장 최근 <b>{recent.length}줄</b>만 씁니다
      {#if recent.length && column.length > recent.length}
        (페이지의 {num(column.length - recent.length + 1)}줄 … {num(column.length)}줄)
      {/if}.
    </li>
    <li>
      <b>{size}줄을 고른다</b> — 창을 균등하게 나눠 처음, 중간, 끝을 잡습니다 :
      창 안의 {picked.join(' · ')}번.
    </li>
  </ol>

  <div class="scroll">
    <table class="lines">
      <thead>
        <tr><th>창 위치</th><th>회차</th><th>일곱 번호</th></tr>
      </thead>
      <tbody>
        {#each taken as l, i (l.rang)}
          <tr>
            <td class="dim">{picked[i]}번</td>
            <td>{num(l.rang)}회</td>
            <td class="mono">
              {#each l.numbers as n, k (k)}<span class:hit={n === target}>{String(n).padStart(2, ' ')}</span>{k < 6 ? ' ' : ''}{/each}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    번호 <b class="rk">{target}</b> 이 모든 줄에 들어 있습니다 — 이 칸은 그
    번호를 가진 회차만 모으기 때문입니다. 첫 중복은 거기서 나옵니다.
    {size}줄 × 7 = <strong>{size * 7}칸</strong>을 채우지만 번호는 45개뿐이니,
    서로 다른 번호는 <strong>{expectOne.toFixed(1)}개</strong> 정도가 됩니다.
  </p>

  <div class="lists">
    <div class="listbox">
      <span class="tag">리스트 1 — 조합에 나온 번호</span>
      <span class="figure">{one.length}개</span>
      <div class="board">
        {#each CELLS as n (n)}
          <div class="cell" class:keep={listOne.has(n)} class:out={!listOne.has(n)}>{n}</div>
        {/each}
      </div>
      <dl>
        <div><dt>1000회차 평균 크기</dt><dd>{catchOne[0].toFixed(1)}개</dd></div>
        <div><dt>회차당 당첨 번호</dt><dd><b>{catchOne[1].toFixed(3)}</b> <span class="dim">/ {catchOne[2].toFixed(3)}</span></dd></div>
      </dl>
    </div>

    <div class="listbox">
      <span class="tag">리스트 2 — 나머지</span>
      <span class="figure">{two.length}개</span>
      <div class="board">
        {#each CELLS as n (n)}
          <div class="cell" class:keep={!listOne.has(n)} class:out={listOne.has(n)}>{n}</div>
        {/each}
      </div>
      <dl>
        <div><dt>1000회차 평균 크기</dt><dd>{catchTwo[0].toFixed(1)}개</dd></div>
        <div><dt>회차당 당첨 번호</dt><dd><b>{catchTwo[1].toFixed(3)}</b> <span class="dim">/ {catchTwo[2].toFixed(3)}</span></dd></div>
      </dl>
    </div>
  </div>

  <p class="note dim">
    두 리스트는 45개를 나눠 가지므로 <strong>당첨 번호 합은 언제나 6</strong>
    입니다 — {catchOne[1].toFixed(3)} + {catchTwo[1].toFixed(3)} =
    {(catchOne[1] + catchTwo[1]).toFixed(3)}. 그리고 각 리스트가 담은 당첨
    번호는 <strong>제 크기가 주는 몫과 같습니다</strong>. 일곱 자리를 통틀어
    가장 큰 차이가 0.057개입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>작은 리스트는 1등을 담을 수 없다</h2>
    <span class="gloss">조합 10개 · 리스트 2 (약 10개) · 1000회차</span>
  </div>

  <p class="lede small">
    회차마다 그 리스트 안에 당첨 번호가 몇 개 들어 있었는지를 센 것입니다.
    1등을 맞히려면 여섯 개가 <strong>전부</strong> 안에 있어야 합니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr><th>자리</th><th class="v">0개</th><th class="v">1개</th><th class="v">2개</th>
          <th class="v">3개</th><th class="v">4개</th><th class="v">5개</th><th class="v">6개</th></tr>
      </thead>
      <tbody>
        {#each DIST as row, i (i)}
          <tr class:on={i === position}>
            <td>{PATTERN_POSITIONS[i].label}</td>
            {#each row as c, k (k)}
              <td class="val" class:dead={k === 6}>{c}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    마지막 칸이 <strong>일곱 자리 모두 0</strong>입니다. 1000회차 동안 열 개짜리
    리스트가 여섯 당첨 번호를 전부 담은 적은 <strong>한 번도 없습니다</strong>.
    하이퍼기하 분포가 예측하는 값은 0.03번 — 그러니 정상입니다. 이것이
    작은 리스트로 1등이 나오지 않는 이유입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>백테스트 — 등수별</h2>
    <span class="gloss">1040회 → 1239회 · 200회차 · 회차당 100조합 · 58 설정</span>
  </div>

  <p class="lede small">
    일곱 자리 × 두 리스트 × 두 크기 = 28개 풀, 각각 <strong>그대로</strong>와
    <strong>전부 체크를 얹어서</strong>, 그리고 두 개의 대조군. 회차마다
    직전 회차의 당첨이월 페이지에서 리스트를 다시 만듭니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>그룹</th><th class="v">설정</th><th class="v">조합</th>
          <th class="v">1등</th><th class="v">2등</th><th class="v">3등</th>
          <th class="v">4등</th><th class="v">5등</th><th class="v">회수율</th>
          <th class="v">2등 빼면</th>
        </tr>
      </thead>
      <tbody>
        {#each RANKS as g (g.label)}
          <tr class:sep={g.label.startsWith('대조')}>
            <td>{g.label}</td>
            <td class="val dim">{g.n}</td>
            <td class="val dim">{num(g.grids)}</td>
            <td class="val"><b>{g.r[0]}</b></td>
            <td class="val" class:rk={g.r[1] > 0}>{g.r[1]}</td>
            <td class="val dim">{g.r[2]}</td>
            <td class="val dim">{g.r[3]}</td>
            <td class="val dim">{num(g.r[4])}</td>
            <td class="val" class:over={g.ret > 0.3}>{pct(g.ret, 1)}</td>
            <td class="val"><b>{pct(g.clean, 1)}</b></td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td>전체</td>
          <td class="val dim">58</td>
          <td class="val">{num(TOTAL.grids)}</td>
          {#each TOTAL.r as v, k (k)}
            <td class="val">{num(v)}</td>
          {/each}
          <td class="val dim">—</td>
          <td class="val dim">—</td>
        </tr>
        <tr>
          <td class="dim">우연이라면</td>
          <td class="val dim">—</td>
          <td class="val dim">—</td>
          {#each TOTAL.e as v, k (k)}
            <td class="val dim">{k < 3 ? v.toFixed(2) : Math.round(v).toLocaleString('ko-KR')}</td>
          {/each}
          <td class="val dim">—</td>
          <td class="val dim">—</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    <strong>1등 0회</strong>, 1,123,000조합에서. 2등은 두 번이고 둘 다
    <strong>단 한 회차</strong>가 만든 것입니다 — 빼면 네 그룹 전부
    18.8%에서 20.5% 사이, 대조군의 20.3%와 같습니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr><th>2등을 맞힌 설정</th><th>회차</th><th>조합</th><th>추첨</th>
          <th class="v">당첨금</th><th class="v">회수율</th><th class="v">그 회차를 빼면</th></tr>
      </thead>
      <tbody>
        {#each TWO_WINS as w (w.rang)}
          <tr>
            <td>{w.cfg}</td>
            <td class="dim">{num(w.rang)}회</td>
            <td class="mono">{w.grid.join(' ')}</td>
            <td class="mono dim">{w.draw.join(' ')} <span class="rk">+{w.bonus}</span></td>
            <td class="val">{num(w.won)}원</td>
            <td class="val over">{pct(w.ret, 1)}</td>
            <td class="val"><b>{pct(w.clean, 1)}</b></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    3등과 4등이 기댓값보다 조금 낮게 나옵니다. 이것은 리스트 탓이 아닙니다 —
    같은 회차의 100장은 같은 풀에서 나오므로 <strong>함께 이기고 함께
    집니다</strong>. 독립된 100만 장으로 계산한 기댓값은 그래서 오차 막대가
    너무 좁습니다. 증거는 표 안에 있습니다: 리스트를 전혀 쓰지 않는
    <strong>대조군도 4등이 44개로 기댓값 55개보다 낮습니다</strong>.
  </p>
</section>

<section class="panel edge">
  <div class="head">
    <h2>줄을 고르는 모든 방법을 훑으면</h2>
    <span class="gloss">{SWEEP.rules}가지 규칙 × 7 자리 × 2 리스트 = {SWEEP.configs} 설정</span>
  </div>

  <p class="lede small">
    창을 10줄에서 칸 전체까지, 그 안에서 2줄부터 20줄까지 균등하게, 그리고
    <strong>각 줄을 하나씩 따로</strong> — 아래에서 첫 줄부터 스무 번째까지.
    1000회차에서 전부 재봤습니다.
  </p>

  <div class="figures">
    <div><span class="tag">|z| &gt; 1.96 인 설정</span><span class="figure">{SWEEP.over}개</span>
      <span class="unit dim">우연이라면 {SWEEP.expected}개</span></div>
    <div><span class="tag">가장 큰 z</span><span class="figure">+{SWEEP.max}</span>
      <span class="unit dim">가장 작은 {SWEEP.min}</span></div>
  </div>

  <p class="note dim">
    616번 재서 임계값을 넘은 것이 <strong>{SWEEP.over}개</strong>입니다. 순전한
    우연이라면 {SWEEP.expected}개가 나옵니다. <strong>잡음보다도 구조가
    적습니다.</strong>
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr><th>가장 좋았던 설정</th><th class="v">풀</th><th class="v">전체</th>
          <th class="v">z</th><th class="v">전반부</th><th class="v">후반부</th></tr>
      </thead>
      <tbody>
        {#each SWEEP.best as b (b.label)}
          <tr>
            <td>{b.label}</td>
            <td class="val dim">{b.pool.toFixed(1)}</td>
            <td class="val over">{pct(b.rate, 3)}</td>
            <td class="val">+{b.z.toFixed(2)}</td>
            <td class="val dim">{pct(b.a, 3)}</td>
            <td class="val dim">{pct(b.b, 3)}</td>
          </tr>
        {/each}
        <tr class="sep">
          <td>{SWEEP.worst.label} <span class="dim">— 가장 나쁨</span></td>
          <td class="val dim">7.0</td>
          <td class="val under">{pct(SWEEP.worst.rate, 3)}</td>
          <td class="val">{SWEEP.worst.z.toFixed(2)}</td>
          <td class="val dim">—</td>
          <td class="val dim">—</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="keep">
          <td colspan="2">우연이라면</td>
          <td class="val"><b>{pct(BASE, 3)}</b></td>
          <td class="val dim">0</td>
          <td class="val dim">{pct(BASE, 3)}</td>
          <td class="val dim">{pct(BASE, 3)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    가장 좋은 것이 {pct(SWEEP.best[0].rate, 3)}, 가장 나쁜 것이
    {pct(SWEEP.worst.rate, 3)}. 이것은 참값이 {pct(BASE, 3)}인 616번의 측정이
    자연스럽게 벌어지는 폭입니다. 616번 뽑으면 최대값은 원래 14.2–14.4%
    근처에 떨어집니다 — <strong>있어야 할 자리에 있습니다.</strong>
  </p>
</section>

<section class="panel edge">
  <div class="head">
    <h2>가장 좋은 줄을 실제로 사보면</h2>
    <span class="gloss">240–739회에서 고르고, 740–1239회에서 심판한다</span>
  </div>

  <p class="lede small">
    훑기의 <em>진짜</em> 1위는 3번 · 리스트 2 · 전체 · 20개, 15.615%였습니다.
    그런데 그 리스트는 <strong>2.4개</strong>뿐이라 여섯 개짜리 조합을 만들
    수 없고, 500회차 중 <strong>12번</strong>밖에 살 수 없었습니다. 그래서
    실제로 살 수 있는 것 — 평균 12개 이상 — 만 남겼습니다: 616개 중 413개.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr><th>자리</th><th>전반부에서 고른 규칙</th><th class="v">전반부 적중률</th></tr>
      </thead>
      <tbody>
        {#each PICKED_BY_HALF as p (p.pos)}
          <tr><td>{p.pos}</td><td class="dim">{p.rule}</td>
            <td class="val over">{pct(p.rate, 3)}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr><th>전략</th><th>구간</th><th class="v">풀</th><th class="v">3등</th>
          <th class="v">4등</th><th class="v">5등</th><th class="v">회수율</th>
          <th class="v">평균맞춤</th><th class="v">번호 적중</th></tr>
      </thead>
      <tbody>
        {#each OUT as s (s.label)}
          <tr class="sep" class:top={s.star}>
            <td>{s.label}</td>
            <td class="dim">전반부</td>
            <td class="val dim">{s.a.pool.toFixed(1)}</td>
            <td class="val dim">{s.a.r[0]}</td>
            <td class="val" class:over={s.star}>{s.a.r[1]}</td>
            <td class="val dim">{num(s.a.r[2])}</td>
            <td class="val" class:over={s.star}>{pct(s.a.ret, 1)}</td>
            <td class="val" class:over={s.star}>{s.a.mean.toFixed(4)}</td>
            <td class="val" class:over={s.star}>{pct(s.a.rate, 3)}</td>
          </tr>
          <tr class:top={s.star}>
            <td></td>
            <td class="dim">후반부</td>
            <td class="val dim">{s.b.pool.toFixed(1)}</td>
            <td class="val dim">{s.b.r[0]}</td>
            <td class="val">{s.b.r[1]}</td>
            <td class="val dim">{num(s.b.r[2])}</td>
            <td class="val">{pct(s.b.ret, 1)}</td>
            <td class="val">{s.b.mean.toFixed(4)}</td>
            <td class="val">{pct(s.b.rate, 3)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="keep">
          <td colspan="6">우연이라면</td>
          <td class="val dim">—</td>
          <td class="val"><b>{(PICK * BASE).toFixed(4)}</b></td>
          <td class="val"><b>{pct(BASE, 3)}</b></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="note dim">
    전반부 1위를 보십시오. 고른 쪽에서는 4등 <strong>122개</strong>, 회수율
    46.3%, 적중률 14.135%. 한 번도 안 본 쪽에서는 4등
    <strong>65개</strong> — 절반 — 회수율 21.1%, 적중률
    <strong>13.313%</strong>. 즉 {pct(BASE, 3)}입니다. 세 곳 이상 겹침도
    13.942% → 13.359%로 같은 길을 갑니다.
  </p>

  <p class="note dim">
    그리고 아무것도 고르지 않는 <strong>대조군이 후반부에서 24.2%</strong>로,
    세상에서 가장 좋은 줄(21.1%)보다 낫습니다.
  </p>

  <p class="note dim">
    전반부 상위 10개의 평균은 <strong>{pct(SWEEP.topA.learn, 3)} →
    {pct(SWEEP.topA.judge, 3)}</strong>. 기준
    {pct(BASE, 3)}보다 <em>아래</em>로 내려가고, 기준을 넘긴 것은
    <strong>{SWEEP.topA.kept}/10</strong>입니다 — 우연이라면 5/10입니다.
    잡음 위에서 고르면 이렇게 됩니다: 가장 운이 좋았던 것을 고르고, 운은 떠납니다.
  </p>
</section>

<section class="panel plain">
  <p class="close">
    당첨이월의 열네 리스트는 <strong>제 크기가 주는 몫만큼</strong> 당첨
    번호를 담습니다. 리스트 1이 45개 중 34.8개를 가지면 여섯 중 4.63개를
    담고, 리스트 2가 10.2개를 가지면 1.37개를 담습니다. 일곱 자리를 통틀어
    가장 큰 어긋남이 <strong>0.057개</strong>입니다.
  </p>
  <p class="close">
    줄을 고르는 616가지를 전부 훑어도 답은 같습니다. 가장 좋아 보이는 줄은
    <strong>616번 재서 가장 운이 좋았던 줄</strong>일 뿐이고, 처음 보는
    회차에 데려가면 {pct(BASE, 3)}로 돌아옵니다.
  </p>
</section>

<style>
  .lede { margin: 0 0 1rem; color: var(--ink-soft); max-width: 62ch; }
  .lede.small { font-size: 0.875rem; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 74ch; }
  .note strong, .lede strong { color: var(--ink); font-weight: 600; }

  /* Le sélecteur : les sept positions, puis la taille — séparées par un
     filet parce qu'elles ne sont pas de même nature. */
  .picker { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; margin-bottom: 1.25rem; }
  .picker button { border-radius: 999px; padding: 0.3rem 0.95rem; font-size: 0.8125rem; }
  .picker button.wide { padding-inline: 1.1rem; }
  .picker button.on {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--surface);
    font-weight: 600;
  }
  .picker .sep { width: 1px; align-self: stretch; background: var(--line); margin-inline: 0.5rem; }

  /* La procédure, numérotée : on doit pouvoir dire « à l'étape 2 ». */
  .proto { margin: 0 0 1.25rem; padding-left: 1.35rem; max-width: 74ch; }
  .proto li { font-size: 0.8125rem; line-height: 1.7; margin-bottom: 0.4rem; color: var(--ink-soft); }
  .proto b { color: var(--ink); font-weight: 600; }

  table.lines td.mono { font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
  table.lines span.hit { color: var(--gold-deep); font-weight: 600; }

  /* Les deux listes côte à côte : c'est en les voyant se compléter qu'on
     comprend que leur somme fait toujours 45. */
  .lists { display: grid; gap: 1.5rem; margin-top: 1.5rem; }
  @media (min-width: 860px) { .lists { grid-template-columns: 1fr 1fr; } }
  .listbox { display: flex; flex-direction: column; gap: 0.2rem; }
  .listbox .tag {
    font-size: 0.6875rem;
    letter-spacing: 0.09em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .listbox .figure { color: var(--gold); font-size: 1.5rem; line-height: 1.2; margin-bottom: 0.6rem; }

  .board {
    display: grid;
    grid-template-columns: repeat(15, minmax(0, 1fr));
    gap: 2px;
    margin-bottom: 0.9rem;
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
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .figures { display: flex; flex-wrap: wrap; gap: 1.25rem 3rem; margin-bottom: 0.5rem; }
  .figures > div { display: flex; flex-direction: column; gap: 0.15rem; }
  .figures .tag {
    font-size: 0.6875rem;
    letter-spacing: 0.09em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .figures .figure { color: var(--gold); font-size: 1.5rem; line-height: 1.2; }
  .figures .unit { font-size: 0.75rem; }

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

  th.v, td.val { text-align: right; }
  .rk { color: var(--gold-deep); }
  tfoot td {
    border-top: 1px solid var(--line);
    font-size: 0.8125rem;
    padding-top: 0.5rem;
  }
  tfoot tr.keep td { font-weight: 600; color: var(--ink); }
  tbody tr.sep td { border-top: 1px solid var(--line); }
  /* Les deux stratégies qui montrent l'effondrement — c'est là qu'il faut
     que l'œil tombe. */
  tbody tr.top td { font-weight: 600; color: var(--ink); }
  /* La ligne que le sélecteur du haut désigne. */
  tbody tr.on td { background: var(--gold-wash); }
  td.over { color: var(--gold-deep); }
  td.under { color: var(--muted); }
  td.dead { color: var(--line); }
  td.mono { font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

  .edge { border-color: var(--gold-soft); }
  .plain { background: var(--gold-wash); border-color: var(--gold-soft); }
  .close { margin: 0; font-size: 0.9375rem; line-height: 1.7; max-width: 70ch; }
  .close + .close { margin-top: 0.9rem; }
  .close strong { color: var(--gold-deep); font-weight: 600; }
</style>
