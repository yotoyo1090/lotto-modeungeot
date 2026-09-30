<script>
  // 모양 닮은꼴 — deux tirages dessinent-ils la même figure ?
  //
  // 용지 마킹 montre le motif d'un 회차 ; cet écran le compare à tous les
  // autres. La mesure est celle qu'on ferait à la main : poser une feuille
  // sur l'autre, la faire glisser, et compter les marques qui se
  // superposent au meilleur glissement — de 0 à 6.
  //
  // C'est une autre question que 중복, qui compte les numéros communs. Deux
  // tirages sans un seul numéro en commun peuvent dessiner exactement la
  // même figure, dix cases plus loin.
  import { PICK } from '@core/draws.js'
  import { COLS, ROWS, cellOf, shapeGroups, similarTo, similarityLaw } from '@core/shape.js'

  import Compare from '../components/Compare.svelte'
  import RangPick from '../components/RangPick.svelte'
  import Sheet from '../components/Sheet.svelte'
  import { day, num, rang as fmt } from '../lib/format.js'

  let { draws } = $props()

  let picked = $state(null)
  let top = $state(6)
  const current = $derived.by(() => {
    const last = draws.rangs[draws.n - 1]
    if (picked === null) return last
    return picked < draws.rangs[0] || picked > last ? last : picked
  })
  const index = $derived(draws.indexOf(current))
  const seq = $derived([...draws.sequenceAt(index)])
  const six = $derived([...seq.slice(0, PICK)].sort((a, b) => a - b))
  const bonus = $derived(seq[PICK])

  // Une dizaine de millisecondes pour les 1 240 comparaisons : on peut le
  // refaire à chaque clic sans y penser.
  const found = $derived(similarTo(draws, current, { top: 24 }))
  const law = similarityLaw()

  // Les scores observés contre ceux du hasard, sur le même nombre de
  // comparaisons — la ligne qui dit si la ressemblance veut dire quelque
  // chose.
  const rows = $derived(Array.from({ length: PICK + 1 }, (_, k) => ({
    key: `${k}점`,
    obs: found.spread[k],
    exp: law[k] * found.compared,
  })))

  // Les figures rigoureusement identiques, sur tout l'historique : même
  // dessin, à un décalage près. Un seul passage, indépendant du 회차 choisi.
  const same = $derived(shapeGroups(draws))

  // L'exemple de la démonstration : le meilleur match, déroulé marque par
  // marque. Calculé et non écrit à la main — il suit le 회차 choisi, donc
  // il ne peut pas mentir ni se démoder.
  const demo = $derived.by(() => {
    const r = found.rows[0]
    if (!r) return null
    const his = new Set(r.numbers)
    const marks = six.map((n) => {
      const [rr, cc] = cellOf(n)
      const nr = rr + r.dr
      const nc = cc + r.dc
      const target = nr * COLS + nc + 1
      const inside = nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && target <= 45
      return { n, target: inside ? target : null, hit: inside && his.has(target) }
    })
    return { r, marks, common: six.filter((n) => his.has(n)).length }
  })

  const best = $derived(found.rows.length ? found.rows[0].score : 0)
  const shown = $derived(found.rows.slice(0, top))
  const shift = (r) => {
    if (!r.dr && !r.dc) return '그대로'
    const v = r.dr ? `${Math.abs(r.dr)}줄 ${r.dr > 0 ? '아래' : '위'}` : ''
    const h = r.dc ? `${Math.abs(r.dc)}칸 ${r.dc > 0 ? '오른쪽' : '왼쪽'}` : ''
    return [v, h].filter(Boolean).join(' · ')
  }
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>모양 닮은꼴</h2>
    <span class="gloss">두 회차가 같은 모양을 그리는가?</span>
  </div>
  <RangPick {draws} value={current} onpick={(r) => (picked = r)} />
</section>

<section class="panel">
  <div class="head">
    <h2>{fmt(current)}</h2>
    <span class="gloss">{day(draws.dates[index])} · 기준 회차</span>
    <span class="right">{six.join(' · ')} <span class="dim">+ {bonus}</span></span>
  </div>

  <div class="two">
    <div class="ref">
      <Sheet numbers={six} {bonus} />
    </div>
    <div class="say">
      <p class="lede">
        이 모양을 나머지 <strong>{num(found.compared)}회차</strong> 위에 하나씩 올려놓고,
        가장 잘 겹치도록 밀어 봅니다. 겹친 표시 개수가 점수입니다 — 0점부터 6점까지.
      </p>
      <div class="facts">
        <div class="fact">
          <span class="k">가장 높은 점수</span>
          <b class="figure">{best}점</b>
          <span class="dim small">/ 6점</span>
        </div>
        <div class="fact">
          <span class="k">6점 (완전히 같은 모양)</span>
          <b class="figure">{num(found.spread[PICK])}</b>
          <span class="dim small">회차</span>
        </div>
        <div class="fact">
          <span class="k">서로 다른 모양</span>
          <b class="figure">{num(same.distinct)}</b>
          <span class="dim small">/ {num(same.draws)}회차</span>
        </div>
      </div>
    </div>
  </div>
</section>


<section class="panel">
  <div class="head">
    <h2>닮은꼴 {num(shown.length)}회차</h2>
    <span class="gloss">점수가 높은 순 · 금색 동그라미가 겹친 표시</span>
    <span class="right">
      {#each [6, 12, 24] as k (k)}
        <button class="pick" aria-pressed={top === k} onclick={() => (top = k)}>{k}장</button>
      {/each}
    </span>
  </div>

  <div class="wall">
    {#each shown as r (r.rang)}
      <figure class="card">
        <figcaption>
          <b>{fmt(r.rang)}</b>
          <span class="score">{r.score}점</span>
          <span class="dim">{shift(r)}</span>
        </figcaption>
        <Sheet numbers={r.numbers} steps={false}
               ghost={{ numbers: six, dr: r.dr, dc: r.dc }} />
        <p class="line">{[...r.numbers].sort((a, b) => a - b).join(' · ')}</p>
      </figure>
    {/each}
  </div>

  <p class="note dim">
    검은 칸은 <strong>그 회차</strong>의 당첨번호, 금색 동그라미는 기준 회차
    {fmt(current)}의 모양을 밀어서 올려놓은 것입니다. 동그라미가 검은 칸 위에
    있으면 겹친 것(점수 1점), 빈 칸 위에 있으면 빗나간 것입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>점수 분포</h2>
    <span class="gloss">관측 대 기대</span>
    <span class="right">{num(found.compared)}회차 비교</span>
  </div>

  <Compare {rows} keyWidth="3rem" suffix="회차"
           obsLabel="관측" expLabel="기대 (무작위 두 장)" />

  <p class="note dim">
    기대치는 <strong>무작위로 뽑은 두 장</strong>을 같은 방법으로 겹쳐 본 결과입니다
    (2만 번 모의). 두 장을 밀어서 맞추면 어차피 2~3개는 겹칩니다 — 45칸 중 6칸을
    칠하고 13 × 13가지로 밀어 보기 때문입니다. 그래서 「2점」이 가장 흔하고,
    그것은 닮음이 아니라 <strong>종이의 크기</strong>가 만드는 숫자입니다.
  </p>
</section>

<section class="panel">
  <div class="head">
    <h2>똑같은 모양</h2>
    <span class="gloss">같은 그림이 두 번 나온 적이 있나</span>
    <span class="right">{num(same.draws)}회차</span>
  </div>

  {#if same.groups.length === 0}
    <p class="lede big">
      한 번도 없습니다 — {num(same.draws)}회차가 모두
      <strong>서로 다른 {num(same.distinct)}개의 모양</strong>을 그렸습니다.
    </p>
  {:else}
    <div class="scroll">
      <table>
        <thead><tr><th>회차</th><th>몇 번</th></tr></thead>
        <tbody>
          {#each same.groups.slice(0, 20) as g (g.key)}
            <tr><td>{g.rangs.map((r) => fmt(r)).join(' · ')}</td><td>{g.n}회</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <p class="note dim">
    같은 모양이란 여섯 표시의 배치가 완전히 같다는 뜻입니다 — 자리는 달라도
    됩니다. 45칸에 6칸을 칠하는 배치는 수백만 가지라, 스물세 해 동안 한 번도
    겹치지 않은 것이 <strong>정상</strong>입니다. 이 표가 비어 있다는 사실 자체가
    「모양이 돌아온다」는 생각에 대한 답입니다.
  </p>
</section>

<section class="panel how">
  <div class="head">
    <h2>어떻게 재는가</h2>
    <span class="gloss">번호가 아니라 그림을 비교합니다</span>
  </div>

  <ol class="steps">
    <li>
      <b>① 용지는 7 × 7 판입니다.</b>
      번호마다 자리가 정해져 있습니다 — <code>줄 = (번호−1) ÷ 7</code>,
      <code>칸 = (번호−1) mod 7</code>. 그래서 7번은 (0줄, 6칸), 13번은 (1줄, 5칸),
      43번은 (6줄, 0칸). 한 회차는 이 판 위의 <strong>표시 여섯 개</strong>일 뿐입니다.
    </li>
    <li>
      <b>② 한 장을 다른 장 위에 놓고 밉니다.</b>
      위아래 −6~+6줄, 좌우 −6~+6칸 — 모두 <strong>169가지</strong>로 밀어 보고,
      그때마다 겹친 표시를 셉니다. <strong>가장 잘 겹친 값</strong>이 점수입니다.
    </li>
    <li>
      <b>③ 번호가 겹치는 것과는 다릅니다.</b>
      같은 번호를 세는 건 <strong>중복</strong>이 하는 일입니다. 여기서는 번호가
      하나도 같지 않아도 그림이 같을 수 있습니다 — 자리만 옮기면 되니까요.
    </li>
    <li>
      <b>④ 기준은 무작위입니다.</b>
      짧은 공식이 없으므로(가장 좋은 밀기는 그림마다 다릅니다)
      <strong>무작위 두 장을 2만 번</strong> 같은 방법으로 겹쳐 본 결과를 씁니다.
      그것이 아래 분포의 회색 숫자입니다.
    </li>
  </ol>

  {#if demo}
    <div class="demo">
      <p class="lede">
        예를 들어 <b>{fmt(current)}</b>를 <b>{fmt(demo.r.rang)}</b> 위에 올려놓고
        <b>{shift(demo.r)}</b>로 밀면 — 이것이 169가지 중 가장 잘 맞는 밀기입니다 :
      </p>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>{fmt(current)}의 표시</th>
              <th>밀면 이 칸</th>
              <th>{fmt(demo.r.rang)}에 있나</th>
            </tr>
          </thead>
          <tbody>
            {#each demo.marks as m (m.n)}
              <tr class:hit={m.hit}>
                <td><b>{m.n}</b>번</td>
                <td>{m.target === null ? '용지 밖' : `${m.target}번`}</td>
                <td>{m.hit ? '✓ 겹침' : '✗'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="note dim">
        여섯 중 <b>{demo.r.score}개</b>가 겹칩니다 — 그래서 {fmt(demo.r.rang)}의 점수는
        <b>{demo.r.score}점</b>입니다. 나머지 168가지 밀기는 이보다 낫지 않습니다.
        두 회차의 <strong>같은 번호는 {demo.common}개</strong>뿐인데도 그림은 이만큼
        겹친다는 점이, 이 페이지가 중복과 다른 것을 재고 있다는 증거입니다.
      </p>
    </div>
  {/if}
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

  /* La feuille de référence à gauche, ce qu'elle veut dire à droite. */
  .two {
    display: grid; grid-template-columns: minmax(12rem, 18rem) 1fr;
    gap: 1.5rem; align-items: start;
  }
  @media (max-width: 40rem) { .two { grid-template-columns: 1fr; } }
  .lede { margin: 0 0 1rem; color: var(--ink-soft); max-width: 60ch; }
  .lede strong { color: var(--ink); font-weight: 600; }
  .lede.big { font-size: 1rem; margin-bottom: 0; }

  .facts {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 1rem 1.5rem;
  }
  .fact { display: flex; flex-direction: column; gap: 0.15rem; }
  .fact .k {
    font-size: 0.6875rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--muted);
  }
  .small { font-size: 0.75rem; }

  .wall {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 1.25rem 1rem;
  }
  .card { margin: 0; }
  .card figcaption {
    display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap;
    margin-bottom: 0.3rem; font-size: 0.8125rem;
  }
  .card figcaption .dim { font-size: 0.6875rem; }
  .score {
    font-family: var(--figure); font-weight: 700; color: var(--gold-deep);
    border: 1px solid var(--gold); border-radius: 0.25rem;
    padding: 0 0.3rem; font-size: 0.6875rem;
  }
  .line { margin: 0.3rem 0 0; font-size: 0.75rem; font-family: var(--figure); }

  .pick { font-size: 0.6875rem; padding: 0.1rem 0.45rem; margin-left: 0.2rem; }

  /* La méthode, en quatre pas numérotés puis un exemple calculé. */
  .steps { margin: 0; padding-left: 1.1rem; max-width: 76ch; }
  .steps li { margin-bottom: 0.7rem; font-size: 0.8125rem; line-height: 1.7; color: var(--ink-soft); }
  .steps li:last-child { margin-bottom: 0; }
  .steps b { color: var(--ink); font-weight: 600; }
  .steps strong { color: var(--ink); font-weight: 600; }
  .steps code {
    font-family: var(--figure); font-size: 0.75rem;
    background: var(--gold-wash); border-radius: 0.2rem; padding: 0.05rem 0.3rem;
  }
  .demo {
    margin-top: 1.25rem; padding-top: 1.1rem;
    border-top: 1px solid var(--line-soft);
  }
  .demo table { width: auto; min-width: 22rem; font-size: 0.8125rem; }
  .demo tr.hit td { background: var(--gold-wash); color: var(--gold-deep); }
  .demo .lede { margin-bottom: 0.7rem; }
  .note { margin: 1rem 0 0; font-size: 0.8125rem; line-height: 1.65; max-width: 76ch; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
