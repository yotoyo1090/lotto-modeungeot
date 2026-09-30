<script>
  // 팁 › 전체 검정 — le balayage complet, consigné.
  //
  // Les autres onglets de 팁 prennent chacun une idée et la mesurent. Celui-ci
  // les prend TOUTES, en même temps, et ajoute la seule chose qui manquait :
  // un témoin. Un générateur aléatoire glissé parmi les méthodes, qui ne
  // regarde rien et ne sait rien.
  //
  // Il finit 8ᵉ sur 167. C'est le résultat de l'écran, et il tient en une
  // ligne : soixante-dix pour cent de ce que fait l'application est battu par
  // un tirage au sort.
  //
  // Les chiffres viennent d'un backtest en marche avant — à chaque 회차,
  // l'ensemble est construit avec les seuls 회차 antérieurs. Le protocole est
  // écrit en entier plus bas ; sans lui ces nombres ne vaudraient rien.
  import { num } from '../lib/format.js'

  const RUN = { from: 201, to: 1239, draws: 1039, methods: 167, crosses: 21304 }
  const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`

  // ── le plafond du bruit ────────────────────────────────────────────────
  //
  // Avec K tests, le maximum de |z| a une valeur attendue ≈ √(2 ln K). C'est
  // contre celle-là qu'un résultat doit se comparer — jamais contre 1,96, qui
  // vaut pour UN test décidé à l'avance. Oublier ça est l'erreur qui fait
  // « découvrir » quelque chose dans n'importe quelle base.
  const ceiling = (k) => {
    const l = Math.sqrt(2 * Math.log(k))
    return l - (Math.log(Math.log(k)) + Math.log(4 * Math.PI)) / (2 * l)
  }

  // ── les 15 meilleures des 167 ──────────────────────────────────────────
  // rank, famille, nom, T, ratio, z, z première moitié, z seconde moitié
  const TOP = [
    [1, '구간', '구간 10', 10.0, 1.0510, 2.29, 1.01, 2.23],
    [2, '구간', '구간 10+30', 20.0, 1.0304, 2.28, 0.15, 3.07],
    [3, '빈도', '최근10 최다 10', 10.0, 1.0481, 2.16, 1.60, 1.45],
    [4, '구간', '구간 10+30+40', 26.0, 1.0192, 1.88, -0.20, 2.86],
    [5, '빈도', '전체 최다 35', 35.0, 1.0118, 1.86, 1.19, 1.43],
    [6, '빈도', '전체 최소 30', 30.0, 1.0147, 1.74, 0.48, 1.98],
    [7, '구간', '구간 10+20+30', 30.0, 1.0140, 1.66, 0.36, 1.98],
    [8, '무작위', '무작위 10', 10.0, 1.0366, 1.64, 0.23, 2.09],
    [9, '구간', '구간 10+40', 16.0, 1.0250, 1.56, 0.51, 1.69],
    [10, '온도', '뜨거운 12', 12.0, 1.0304, 1.54, 3.04, -0.86],
    [11, '빈도', '전체 최소 20', 20.0, 1.0203, 1.53, 0.61, 1.54],
    [12, '구간', '구간 10+20+30+40', 36.0, 1.0086, 1.44, -0.01, 2.04],
    [13, '빈도', '전체 최소 18', 18.0, 1.0206, 1.41, 0.87, 1.13],
    [14, '빈도', '최근10 최다 14', 14.0, 1.0250, 1.41, 1.53, 0.47],
    [15, '빈도', '최근20 최소 20', 20.0, 1.0185, 1.39, 0.23, 1.73],
  ]

  // ── par famille ────────────────────────────────────────────────────────
  const FAMILIES = [
    ['온도', 22, 1.0068, 0.21],
    ['빈도', 72, 0.9995, 0.07],
    ['이월', 6, 1.0055, 0.07],
    ['제외', 6, 1.0029, -0.07],
    ['리스트', 12, 0.9992, -0.05],
    ['구간', 30, 0.9993, -0.00],
    ['친구', 8, 0.9971, -0.10],
    ['무작위', 11, 0.9996, -0.19],
  ]

  // ── la sélection hors échantillon ──────────────────────────────────────
  // Les vingt meilleurs choisis sur la première moitié, rejugés sur la
  // seconde. C'est le seul contrôle qui ait jamais rien démasqué.
  const OOS = [
    ['교', '최근50 최다 14 × 비친구 8', 1.1241, 3.49, 0.9466, -1.52],
    ['교', '최근30 최다 25 × 비친구 8', 1.0733, 3.36, 0.9724, -1.27],
    ['교', '뜨거운 12 × 구간 1+10+20+40', 1.1104, 3.35, 1.0024, 0.07],
    ['합', '뜨거운 12 × 최근30 최다 14', 1.0603, 3.27, 0.9683, -1.73],
    ['교', '최근50 최다 20 × 비친구 8', 1.0854, 3.27, 0.9713, -1.11],
    ['교', '직전2회 합집합 × 구간 1+10+20', 1.1312, 3.27, 0.9695, -0.76],
    ['교', '뜨거운 12 × 구간 1+10+20', 1.1283, 3.22, 0.9638, -0.90],
    ['교', '최근30 최다 30 × 비친구 8', 1.0595, 3.22, 0.9740, -1.41],
  ]
  const OOS_ALL = { n: 20, first: 1.0858, second: 0.9719, kept: 1 }

  // ── le coût par 1등, à toutes les tailles ──────────────────────────────
  const SPACE = 8_145_060
  const choose = (n, k) => {
    let r = 1
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
    return r
  }
  const COSTS = [45, 35, 25, 20, 16, 14, 12, 10, 8, 6].map((T) => {
    const combos = choose(T, 6)
    return { T, combos, cost: combos * 1000, per: Math.round(SPACE / combos) }
  })

  // ── 100 grilles par 회차, la limite légale ─────────────────────────────
  const PLAY = [
    ['무작위 100', 0, 0, 1, 146, 2302, 18810000, 0.181],
    ['풀 14 무작위', 0, 0, 3, 115, 2230, 16900000, 0.163],
    ['풀 20 무작위', 0, 0, 7, 147, 2331, 19005000, 0.183],
    ['풀 10 전부(210)', 0, 1, 9, 154, 2237, 18885000, 0.182],
  ]
</script>

<section class="panel">
  <div class="head">
    <h2>전체 검정</h2>
    <span class="gloss">앱이 아는 모든 방법을, 한 번에</span>
    <span class="right">{num(RUN.draws)}회차</span>
  </div>

  <p class="lead">
    팁의 다른 탭들은 아이디어를 하나씩 재봤습니다. 이 탭은
    <strong>전부 한꺼번에</strong> 재고, 빠져 있던 한 가지를 더합니다 —
    <em>대조군</em>. 아무것도 보지 않고 아무것도 모르는 난수 발생기를
    방법 목록에 몰래 끼워 넣었습니다.
  </p>

  <div class="big">
    <div class="cell">
      <span class="v">{num(RUN.methods)}</span>
      <span class="k">단일 방법</span>
    </div>
    <div class="cell">
      <span class="v">{num(RUN.crosses)}</span>
      <span class="k">교차 검정</span>
    </div>
    <div class="cell hero">
      <span class="v">8위 / {RUN.methods}</span>
      <span class="k">난수 발생기의 순위</span>
    </div>
  </div>

  <p class="foot">
    아무 정보도 쓰지 않는 «무작위 10»이 <strong>167가지 중 8위</strong>입니다.
    앱이 하는 일의 상당 부분을 동전 던지기가 이깁니다. 이것이 이 화면의
    결론이고, 아래는 그 근거입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>상위 15</h2>
    <span class="gloss">z 순, 1,039회차 굴림 검정</span>
    <span class="right">|z| 최대 2.29 · 잡음 한계 {ceiling(RUN.methods).toFixed(2)}</span>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>#</th><th>계열</th><th>방법</th>
          <th class="v">T</th><th class="v">비율</th><th class="v">z</th>
          <th class="v">전반</th><th class="v">후반</th>
        </tr>
      </thead>
      <tbody>
        {#each TOP as [r, fam, name, T, ratio, z, za, zb] (r)}
          <tr class:witness={fam === '무작위'}>
            <td>{r}</td>
            <td class="fam">{fam}</td>
            <td>{name}</td>
            <td class="v">{T.toFixed(1)}</td>
            <td class="v">{ratio.toFixed(4)}배</td>
            <td class="v">{z.toFixed(2)}</td>
            <td class="v soft">{za.toFixed(2)}</td>
            <td class="v soft">{zb.toFixed(2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="foot">
    금색 줄이 대조군입니다. 그리고 <strong>|z| 최댓값 2.29</strong>는
    167번 검정했을 때 정상적으로 나오는 최댓값
    <strong>{ceiling(RUN.methods).toFixed(2)}</strong>보다 <em>작습니다</em> —
    잡음 수준에도 못 미칩니다. 6개 전부 포함 횟수도 관측 8,240회,
    이론 8,218.7회, <strong>1.003배</strong>였습니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>계열별 평균</h2>
    <span class="gloss">한 명이 운 좋았는지, 계열 전체가 좋은지</span>
  </div>
  <table>
    <thead>
      <tr><th>계열</th><th class="v">방법 수</th><th class="v">평균 비율</th><th class="v">평균 z</th></tr>
    </thead>
    <tbody>
      {#each FAMILIES as [f, n, ratio, z] (f)}
        <tr class:witness={f === '무작위'}>
          <td class="fam">{f}</td>
          <td class="v">{n}</td>
          <td class="v">{ratio.toFixed(4)}배</td>
          <td class="v">{z.toFixed(2)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="foot">
    여덟 계열 전부 1.000배 언저리입니다. 어떤 계열도 다른 계열보다 낫지
    않고, <strong>무작위 계열도 나머지와 구별되지 않습니다.</strong>
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>전반으로 고르고, 후반에서 채점</h2>
    <span class="gloss">지금까지 아무것도 통과하지 못한 관문</span>
    <span class="right">{num(RUN.crosses)}가지 중에서</span>
  </div>

  <p class="lead">
    21,304가지를 전 기간으로 채점하면, 최고점은 <em>그 점수 때문에</em>
    뽑힌 것입니다. 그래서 고르기는 전반 519회차만 보고 하고, 점수는
    아무도 보지 않은 후반에서 매깁니다.
  </p>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>연산</th><th>조합</th>
          <th class="v">전반 비율</th><th class="v">z</th>
          <th class="v">후반 비율</th><th class="v">z</th>
        </tr>
      </thead>
      <tbody>
        {#each OOS as [op, name, fr, fz, sr, sz] (name)}
          <tr>
            <td class="fam">{op}</td>
            <td>{name}</td>
            <td class="v">{fr.toFixed(4)}배</td>
            <td class="v">{fz.toFixed(2)}</td>
            <td class="v" class:fell={sr < 1}>{sr.toFixed(4)}배</td>
            <td class="v" class:fell={sz < 0}>{sz.toFixed(2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="verdict">
    <div>
      <span class="k">선택된 {OOS_ALL.n}가지의 평균</span>
      <span class="v">{OOS_ALL.first.toFixed(4)}배 → <b class="fell">{OOS_ALL.second.toFixed(4)}배</b></span>
    </div>
    <div>
      <span class="k">후반에도 1.0배를 넘긴 것</span>
      <span class="v"><b class="fell">{OOS_ALL.kept}</b> / {OOS_ALL.n}
        <span class="soft">(우연이면 {OOS_ALL.n / 2})</span></span>
    </div>
  </div>

  <p class="foot">
    전반에서 20개 모두 1.0배를 넘던 것이, 후반에서는
    <strong>{OOS_ALL.kept}개</strong>만 남습니다. 우연이라면 10개가 남아야
    합니다. 고르는 행위는 이득을 주지 않습니다 — <em>비용을 만듭니다.</em>
    반대 방향(후반으로 고르고 전반에서 채점)도 같습니다 : 1.0758배 → 0.9882배.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>왜 «45개보다 적게»가 도움이 안 되는가</h2>
    <span class="gloss">산수 한 줄</span>
  </div>

  <p class="lead">
    풀을 좁히면 조합이 줄고, 그래서 확률이 오른 것처럼 느껴집니다.
    실제로는 <strong>확률도 같은 비율로 줄어듭니다.</strong>
    마지막 열이 그 이야기입니다.
  </p>

  <table>
    <thead>
      <tr>
        <th class="v">T</th><th class="v">C(T,6)</th>
        <th class="v">전부 사면</th><th class="v">6개가 풀 안에</th>
        <th class="v">1등 1회당 비용</th>
      </tr>
    </thead>
    <tbody>
      {#each COSTS as c (c.T)}
        <tr class:hi={c.T === 45}>
          <td class="v">{c.T}</td>
          <td class="v">{num(c.combos)}</td>
          <td class="v">{num(c.cost)}원</td>
          <td class="v">1 / {num(c.per)}</td>
          <td class="v const">81.5억원</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <p class="foot">
    <strong>마지막 열이 모든 줄에서 똑같습니다.</strong>
    45개에서 6개까지, 어디를 골라도 «1등 한 번당 드는 돈»은 81억 4,506만 원.
    풀을 좁히는 것은 확률을 모으는 일이 아니라, <em>확률과 비용을 같이
    줄이는</em> 일입니다. 14개 풀에 6개가 다 들어오는 것은
    <strong>2,712회차에 한 번 — 52년에 한 번</strong>입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>매 회차 100조합, {num(RUN.draws)}회차</h2>
    <span class="gloss">합법 한도 100,000원으로 실제로 무슨 일이 일어나는가</span>
  </div>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>전략</th>
          <th class="v">1등</th><th class="v">2등</th><th class="v">3등</th>
          <th class="v">4등</th><th class="v">5등</th>
          <th class="v">회수액</th><th class="v">회수율</th>
        </tr>
      </thead>
      <tbody>
        {#each PLAY as [name, r1, r2, r3, r4, r5, back, rate] (name)}
          <tr>
            <td>{name}</td>
            <td class="v">{r1}</td><td class="v">{r2}</td><td class="v">{r3}</td>
            <td class="v">{num(r4)}</td><td class="v">{num(r5)}</td>
            <td class="v">{num(back)}원</td>
            <td class="v">{pct(rate)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="foot">
    네 전략 모두 <strong>16~18%</strong>입니다. 좁은 풀은 3등과 2등을 더
    자주 만듭니다 — 뭉치는 효과는 진짜입니다. 하지만 합계는 움직이지
    않습니다. 4등·5등만 금액에 셌습니다 (1~3등은 분배라 고정 금액이 없습니다).
    <br />
    매주 100조합이면 1년에 <strong>520만원</strong>을 쓰고
    약 <strong>90만원</strong>이 돌아옵니다. 검정한 어떤 방법도 이 비율을
    바꾸지 못했습니다. 이 비율을 바꾸는 결정은 하나뿐입니다 —
    <em>몇 조합을 사느냐.</em>
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>어떻게 측정했나</h2>
    <span class="gloss">검증할 수 없는 숫자는 숫자가 아닙니다</span>
  </div>
  <ol class="proto">
    <li>
      <b>기간</b> — {RUN.from}회차부터 {RUN.to}회차까지 {num(RUN.draws)}회.
      앞의 200회차는 «과거»를 만드는 데만 쓰고 채점하지 않습니다.
    </li>
    <li>
      <b>전진 방식</b> — 매 회차, 풀은 <em>그 이전 회차만</em> 보고
      만듭니다. 미래를 한 칸이라도 읽으면 모든 숫자가 무의미해집니다.
      이 프로젝트에서 실제로 두 번 일어난 사고이고, 두 번 다 이 규칙으로
      잡았습니다.
    </li>
    <li>
      <b>기준</b> — T개짜리 풀은 회차당 6 × T / 45 개를 잡아야 합니다.
      6개가 전부 들어올 확률은 C(T,6) / C(45,6). 둘 다 정확한 값이지
      추정이 아닙니다.
    </li>
    <li>
      <b>분산</b> — 한 회차의 T칸은 서로 독립이 아닙니다. 당첨은 정확히
      여섯 개뿐이니까요. 초기하 분포를 쓰고 유한모집단 보정
      (45 − T)/44 를 넣습니다. 이걸 빼면 큰 풀이 부당하게 유의해 보입니다.
    </li>
    <li>
      <b>다중성</b> — {num(RUN.methods)}가지를 재면 |z|의 최댓값은 자연히
      {ceiling(RUN.methods).toFixed(2)} 부근입니다.
      {num(RUN.crosses)}가지면 {ceiling(RUN.crosses).toFixed(2)}.
      1.96과 비교하는 것은 <em>미리 정한 하나</em>를 잴 때뿐입니다.
    </li>
    <li>
      <b>두 절반</b> — 진짜 효과는 반복됩니다. 전반으로 고르고 후반에서
      채점하는 것이 마지막 관문이고, 지금까지 아무것도 통과하지
      못했습니다 — 차가운번호도, 616개 라인 중 최고도, 280개 자리 중
      최고도, 그리고 이 21,304가지도.
    </li>
    <li>
      <b>대조군</b> — 아무 정보도 쓰지 않는 난수 풀을 같은 조건으로 함께
      돌립니다. 어떤 방법이 «좋아 보인다»는 말은, 대조군보다 낫다는
      뜻이어야 합니다.
    </li>
  </ol>
  <p class="foot dim">
    한계도 적어 둡니다. 한 회차에서 나온 100조합은 서로 독립이 아니고
    (같은 풀, 같은 추첨), 반복 사이에도 회차가 겹칩니다. 그래서 회수율
    같은 숫자의 오차는 여기 적힌 것보다 큽니다. 결론을 바꿀 만큼은
    아니지만 — 결론이 «아무 차이 없음»이니 — 밝혀 둡니다.
  </p>
</section>

<style>
  .lead { margin: 0 0 1.1rem; font-size: 0.8125rem; line-height: 1.7; color: var(--ink-soft); }
  .lead strong { color: var(--ink); font-weight: 600; }
  .lead em { font-style: normal; color: var(--gold-deep); }

  .big {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    margin: 1.2rem 0 0.3rem;
  }
  .big .cell { display: flex; flex-direction: column; gap: 0.2rem; }
  .big .v { font-family: var(--figure); font-size: 1.5rem; color: var(--ink); }
  .big .k { font-size: 0.75rem; color: var(--muted); }
  .big .hero .v { color: var(--gold-deep); }

  table { width: 100%; font-size: 0.8125rem; }
  th, td { padding: 0.28rem 0.5rem; text-align: left; white-space: nowrap; }
  th {
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  td { border-bottom: 1px solid var(--line-soft); }
  .v { font-family: var(--figure); text-align: right; }
  .fam { color: var(--muted); font-size: 0.75rem; }
  .soft { color: var(--muted); }

  /* Le témoin aléatoire : c'est la ligne que l'écran existe pour montrer. */
  tr.witness td { background: var(--gold-wash); }
  tr.witness .fam, tr.witness td:nth-child(3) { color: var(--gold-deep); font-weight: 600; }
  tr.hi td { background: var(--gold-wash); }
  .const { color: var(--gold-deep); font-weight: 600; }
  .fell { color: var(--hot, #b4432f); }

  .verdict {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--line);
  }
  .verdict > div { display: flex; flex-direction: column; gap: 0.2rem; }
  .verdict .k { font-size: 0.75rem; color: var(--muted); }
  .verdict .v { font-family: var(--figure); font-size: 1.0625rem; color: var(--ink); }

  .proto { margin: 0; padding-left: 1.2rem; font-size: 0.8125rem; line-height: 1.75; }
  .proto li { margin-bottom: 0.6rem; color: var(--ink-soft); }
  .proto b { color: var(--ink); font-weight: 600; }
  .proto em { font-style: normal; color: var(--gold-deep); }

  .foot { margin: 1rem 0 0; font-size: 0.75rem; line-height: 1.7; color: var(--ink-soft); }
  .foot strong { color: var(--ink); font-weight: 600; }
  .foot em { font-style: normal; color: var(--gold-deep); }
  .dim { color: var(--muted); }
</style>
