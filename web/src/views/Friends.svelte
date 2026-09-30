<script>
  // L'onglet 친구 · 중복.
  //
  // 친구 — la matrice 45 × 45 des co-occurrences. L'ancien code refaisait une
  // boucle par numéro, quarante-cinq fois. Ici un seul passage construit la
  // matrice entière, et le reste n'est que de la lecture.
  //
  // 중복 — combien des six numéros d'un tirage figuraient déjà dans les `k`
  // tirages précédents. L'ancienne plateforme posait 15 652 requêtes SQL
  // pour ce chiffre ; c'est une somme cumulée, donc un seul passage.
  //
  // Le repère est 6 × T / 45, où T est la taille du pool des `k` derniers
  // tirages. Mesuré sur 1 239 회차, l'observé colle : 1.000× à k = 10,
  // 1.002× à k = 14, 1.003× à k = 20. Le seul écart notable, k = 2 à
  // 1.042× (z = 2.22), se scinde en +3.91 sur la première moitié et −0.76
  // sur la seconde — il n'existe que dans les vieux tirages. Et le 중복
  // d'un tirage n'annonce pas celui du suivant : r = −0.014.
  //
  // Comme partout ailleurs, la colonne « 기대 » est ce qui rend le reste
  // lisible. Deux numéros sortent ensemble environ 19 fois sur 1 239 tirages
  // — non pas parce qu'ils s'attirent, mais parce que C(43,4)/C(45,6) vaut
  // à peu près ça. Sans ce repère, n'importe quelle paire paraît remarquable.
  //
  // L'écart-type d'une paire est de 4.3 tirages, et on en regarde 990 d'un
  // coup : le maximum de la carte doit se situer vers 32 sans que rien ne se
  // passe. La paire la plus forte de l'histoire, 11·21, en compte 34 — dans
  // la marge. Mesuré : chi² = 940.1 pour 989 ddl, z = −1.10 ; et les vingt
  // meilleures paires de la première moitié tombent à 1.29 % sur la seconde,
  // sous les 1.52 % attendus. La carte ne prédit rien, et c'est justement ce
  // que l'échelle centrée sur l'attendu donne à voir.
  import {
    companions, companionsOf, distribution, overlap, overlapExpected, overlapLaw,
  } from '@core/analysis.js'
  import { NMAX, PICK } from '@core/draws.js'
  import { periodogram } from '@core/spectrum.js'

  import Compare from '../components/Compare.svelte'
  import Periodogram from '../components/Periodogram.svelte'
  import Stat from '../components/Stat.svelte'
  import { num, rang, sectionOf, SECTION_VARS } from '../lib/format.js'

  let { draws } = $props()

  const WIDTH = NMAX + 1
  const numbers = Array.from({ length: NMAX }, (_, k) => k + 1)

  let picked = $state(null)
  let window = $state(14)
  let hover = $state(null)

  const matrix = $derived(companions(draws))

  // Combien de fois deux numéros donnés devraient sortir ensemble : la part
  // des tirages qui contiennent une paire fixée, C(43,4)/C(45,6).
  const expectedPair = $derived(draws.n * (5 * 6) / (44 * 45))

  // Une échelle partant de zéro ne montrait rien : toutes les paires
  // tournent autour de l'attendu, si bien que la carte entière prenait la
  // même teinte moyenne. L'échelle est donc **centrée sur l'attendu** —
  // au-dessus en or, en dessous en ardoise — et graduée par l'écart le plus
  // fort observé. Ce que la carte montre alors est la vérité de l'affaire :
  // un moucheté sans structure.
  const spread = $derived.by(() => {
    let worst = 1
    for (let a = 1; a <= NMAX; a++) {
      for (let b = 1; b <= NMAX; b++) {
        if (a !== b) worst = Math.max(worst, Math.abs(matrix[a * WIDTH + b] - expectedPair))
      }
    }
    return worst
  })

  const friends = $derived(picked === null ? null : companionsOf(draws, picked, 12))
  const strangers = $derived.by(() => {
    if (picked === null) return []
    const list = []
    for (let k = 1; k <= NMAX; k++) {
      if (k !== picked) list.push({ number: k, together: matrix[picked * WIDTH + k] })
    }
    return list.sort((a, b) => a.together - b.together || a.number - b.number).slice(0, 6)
  })

  const repeats = $derived(overlap(draws, window))
  const repeatSpread = $derived(distribution(repeats.subarray(1)))
  const repeatMean = $derived(draws.n > 1
    ? repeats.subarray(1).reduce((a, b) => a + b, 0) / (draws.n - 1) : 0)

  // Le repère, comme dans 친구 juste au-dessus : sans lui, « 5.19개 » sur
  // 14회 paraît énorme et « 0.83개 » sur 1회 paraît maigre, alors que les
  // deux sont la même absence d'effet vue à deux tailles de pool.
  const repeatExpected = $derived(overlapExpected(draws, window))
  const repeatRatio = $derived(repeatExpected ? repeatMean / repeatExpected : 0)

  // La loi entière, 0…6, face au comptage : la moyenne seule cacherait un
  // histogramme déformé de même moyenne.
  const repeatLaw = $derived(overlapLaw(draws, window))
  const repeatRows = $derived(Array.from({ length: PICK + 1 }, (_, k) => ({
    key: k, obs: repeatSpread[k] ?? 0, exp: repeatLaw[k] ?? 0,
  })))

  // Le 중복 a-t-il un rythme — des semaines « à répétition » qui reviennent
  // à intervalle fixe ? Même test de Fisher que pour un numéro.
  const repeatSpec = $derived(periodogram(Array.from(repeats.subarray(1))))

  // Les compagnons du numéro choisi, les 12 plus fréquents et les 6 plus
  // rares, contre le même repère plat : C'est le tableau, en barres.
  const friendRows = $derived(friends === null ? [] : [
    ...friends.pairs.map((f) => ({ key: f.number, obs: f.together, exp: friends.expected })),
    ...strangers.map((s) => ({ key: s.number, obs: s.together, exp: friends.expected })),
  ])
</script>

{#if draws.n < 2}
  <section class="panel"><p class="dim">이 구간에는 분석할 만한 회차가 없습니다.</p></section>
{:else}
  <section class="panel">
    <div class="head">
      <h2>친구</h2>
      <span class="gloss">어떤 번호가 함께 나오나</span>
      <span class="right">
        {#if hover}
          {hover.a}번 · {hover.b}번 — {num(hover.n)}회 동반
          <span class="dim">(기대 {expectedPair.toFixed(1)})</span>
        {:else}
          기대값 {expectedPair.toFixed(1)}회
        {/if}
      </span>
    </div>

    <div class="scroll">
      <div class="grid45" style="--cols: {NMAX}">
        <div class="corner"></div>
        {#each numbers as b (b)}
          <button class="colhead" class:picked={picked === b}
                  style="color: var({SECTION_VARS[sectionOf(b)]})"
                  onclick={() => (picked = picked === b ? null : b)}>{b}</button>
        {/each}

        {#each numbers as a (a)}
          <button class="rowhead" class:picked={picked === a}
                  style="color: var({SECTION_VARS[sectionOf(a)]})"
                  onclick={() => (picked = picked === a ? null : a)}>{a}</button>
          {#each numbers as b (b)}
            {@const together = a === b ? -1 : matrix[a * WIDTH + b]}
            {@const dev = a === b ? 0 : (together - expectedPair) / spread}
            <div class="cell" class:self={a === b}
                 class:up={dev > 0} class:down={dev < 0}
                 class:lit={picked === a || picked === b}
                 style="--fill: {Math.abs(dev)}"
                 onmouseenter={() => (hover = { a, b, n: together })}
                 onmouseleave={() => (hover = null)}
                 role="presentation"></div>
          {/each}
        {/each}
      </div>
    </div>

    <div class="scale">
      <span class="ramp down"></span>
      <span class="cap">기대보다 적게</span>
      <span class="mid">기대 {expectedPair.toFixed(1)}회</span>
      <span class="cap">기대보다 많게</span>
      <span class="ramp up"></span>
    </div>

    <p class="foot">
      색은 <strong>기대값과의 차이</strong>입니다 — 동반 횟수 자체가 아닙니다.
      어떤 두 번호든 평균 {expectedPair.toFixed(1)}회는 함께 나오기 때문에, 횟수만 칠하면
      판 전체가 같은 색이 되어 아무것도 보이지 않습니다. 차이로 칠하면 보이는 것은
      <strong>구조 없는 얼룩</strong>입니다 — 그것이 사실입니다.
    </p>
  </section>

  {#if picked !== null}
    <section class="panel chosen">
      <div class="head">
        <h2>
          <span class="badge" style="--tone: var({SECTION_VARS[sectionOf(picked)]})">{picked}</span>
          번호의 친구
        </h2>
        <span class="gloss">가장 자주, 가장 드물게 함께 나온 번호</span>
        <button class="close" onclick={() => (picked = null)} aria-label="닫기">✕</button>
      </div>

      <!-- Le dénominateur, dit une fois pour les deux tableaux : sans lui,
           « 27회 동반 » ne se juge pas. -->
      <p class="lead denom">
        {picked}번은 {num(friends.hits)}회 나왔습니다 —
        번호당 기대값 약 {friends.expected.toFixed(1)}회
      </p>

      <div class="grid two">
        <div>
          <p class="lead">가장 자주 — 상위 12</p>
          <table>
            <thead><tr><th>번호</th><th>동반</th><th>비율</th><th>기대 대비</th></tr></thead>
            <tbody>
              {#each friends.pairs as friend (friend.number)}
                {@const gap = friend.together - friends.expected}
                <tr>
                  <td><span class="tag"
                    style="color: var({SECTION_VARS[sectionOf(friend.number)]})">{friend.number}</span></td>
                  <td>{num(friend.together)}회</td>
                  <td class="dim">{(friend.share * 100).toFixed(0)}%</td>
                  <td class:over={gap > 0}>{gap >= 0 ? '+' : '−'}{Math.abs(gap).toFixed(1)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div>
          <p class="lead">가장 드물게 — 하위 6</p>
          <table>
            <thead><tr><th>번호</th><th>동반</th><th>비율</th><th>기대 대비</th></tr></thead>
            <tbody>
              {#each strangers as stranger (stranger.number)}
                {@const gap = stranger.together - friends.expected}
                <tr>
                  <td><span class="tag"
                    style="color: var({SECTION_VARS[sectionOf(stranger.number)]})">{stranger.number}</span></td>
                  <td>{num(stranger.together)}회</td>
                  <td class="dim">
                    {friends.hits ? (stranger.together / friends.hits * 100).toFixed(0) : 0}%
                  </td>
                  <td class:over={gap > 0}>{gap >= 0 ? '+' : '−'}{Math.abs(gap).toFixed(1)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <div class="block">
        <Compare rows={friendRows} showTotal={false} keyWidth="2.5rem" suffix="번"
                 obsLabel="동반" expLabel={`기대 ${friends.expected.toFixed(1)}회`} />
      </div>
    </section>
  {/if}

  <section class="panel">
    <div class="head">
      <h2>중복</h2>
      <span class="gloss">이전 회차와 겹친 번호</span>
      <span class="right">
        평균 {repeatMean.toFixed(2)}개 · 기대 {repeatExpected.toFixed(2)}개
      </span>
    </div>

    <div class="window">
      <span class="label">직전</span>
      {#each [7, 14, 30, 50] as k (k)}
        <button aria-pressed={window === k} onclick={() => (window = k)}>{k}회</button>
      {/each}
    </div>

    <div class="stats">
      <Stat label="최근 회차" value={repeats[draws.n - 1]}
            note={`${rang(draws.rangs[draws.n - 1])} · 6개 중`} />
      <Stat label="평균" value={repeatMean.toFixed(2)} note="개" />
      <Stat label="기대" value={repeatExpected.toFixed(2)}
            note={`개 · 관측/기대 ${repeatRatio.toFixed(3)}배`} />
      <Stat label="최대" value={Math.max(...repeats.subarray(1))} note="개" />
      <Stat label="전부 새 번호" value={num(repeatSpread[0] ?? 0)} note="회" />
    </div>

    <Compare rows={repeatRows} mark={repeats[draws.n - 1]} suffix="개"
             keyWidth="2.5rem" obsLabel="관측" expLabel="기대 (초기하)" />

    <p class="foot">
      직전 {window}회에 이미 나왔던 번호가 이번 여섯 개 중 몇 개였는지.
      {PICK}개 모두가 새 번호인 경우는 {num(repeatSpread[0] ?? 0)}회뿐입니다.
      <br />
      직전 {window}회는 서로 다른 번호 약 <strong>{(repeatExpected * NMAX / PICK).toFixed(1)}개</strong>를
      남깁니다. 다음 회차가 이 무리를 <em>전혀 기억하지 못한다</em> 해도
      {PICK} × {(repeatExpected * NMAX / PICK).toFixed(1)} / {NMAX} =
      <strong>{repeatExpected.toFixed(2)}개</strong>는 그냥 겹칩니다 — 지금 관측은
      그 <strong>{repeatRatio.toFixed(3)}배</strong>입니다. 창을 넓히면 중복이 커지는 것은
      무리가 커지기 때문이지, 번호가 서로를 부르기 때문이 아닙니다.
    </p>

    <div class="block">
      <Periodogram result={repeatSpec} label="중복 주기도"
                   gloss="겹침에 리듬이 있는가?" />
    </div>
  </section>
{/if}

<style>
  .block { margin-top: 1rem; }

  .grid45 {
    display: grid;
    grid-template-columns: 1.75rem repeat(var(--cols), minmax(15px, 1fr));
    gap: 1px;
    min-width: 46rem;
  }

  .corner { }

  .colhead, .rowhead {
    border: 0;
    border-radius: 0;
    background: none;
    padding: 0;
    font-size: 0.5625rem;
    line-height: 1;
    text-align: center;
  }
  .colhead { padding-bottom: 3px; }
  .rowhead { text-align: right; padding-right: 0.35rem; font-size: 0.625rem; }
  .colhead:hover, .rowhead:hover { border: 0; text-decoration: underline; }
  .colhead.picked, .rowhead.picked { font-weight: 700; color: var(--ink) !important; }

  /* La seule surface teintée de la page ne porte aucun chiffre : c'est une
     carte d'écarts, lue par l'intensité et interrogée au survol. */
  .cell { height: 14px; background: var(--surface); }
  .cell.up { background: color-mix(in srgb, var(--gold) calc(var(--fill) * 100%), var(--surface)); }
  .cell.down { background: color-mix(in srgb, var(--t-dead) calc(var(--fill) * 100%), var(--surface)); }
  .cell.self { background: repeating-linear-gradient(45deg,
      var(--line-soft) 0 2px, var(--surface) 2px 4px); }
  .cell.lit { box-shadow: inset 0 0 0 1px var(--ink); }
  .cell:hover { outline: 1.5px solid var(--ink); outline-offset: -1px; }

  .scale {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    font-size: 0.6875rem;
    color: var(--muted);
  }
  .ramp { width: 4rem; height: 8px; border-radius: 1px; }
  .ramp.down { background: linear-gradient(90deg, var(--t-dead), var(--surface)); }
  .ramp.up { background: linear-gradient(90deg, var(--surface), var(--gold)); }
  .mid { color: var(--ink-soft); }

  .panel.chosen { border-color: var(--gold); }

  h2 { display: flex; align-items: center; gap: 0.5rem; }
  .badge {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    border: 1.5px solid var(--tone);
    color: var(--tone);
    font-family: var(--figure);
    font-size: 0.9375rem;
  }
  .tag { font-family: var(--figure); font-size: 0.9375rem; }

  .close { margin-left: auto; border: 0; color: var(--muted); padding: 0 0.35rem; }
  .close:hover { border: 0; color: var(--ink); }

  .lead { margin: 0 0 0.75rem; font-size: 0.8125rem; color: var(--muted); }
  .denom {
    margin-bottom: 1.1rem; color: var(--ink-soft);
    border-left: 2px solid var(--gold); padding-left: 0.6rem;
  }

  td.over { color: var(--gold); }

  .window { display: flex; align-items: center; gap: 0.35rem; margin-bottom: 1.5rem; }
  .window .label { margin-right: 0.25rem; }
  .window button { font-size: 0.75rem; }

  .stats {
    display: grid;
    gap: 1.25rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    margin-bottom: 1.75rem;
  }

  .foot {
    margin: 1.1rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-soft);
    line-height: 1.6;
  }
  .foot strong { color: var(--ink); font-weight: 600; }
  .foot em { font-style: normal; color: var(--gold-deep); }
</style>
