<script>
  // 분석, côté 연금복권 — la page d'accueil du produit.
  //
  // Le pendant du 분석 du 6/45 : le dernier tirage, les indicateurs, et
  // l'état des six places. Ce qui change, c'est ce qu'on met en avant. Au
  // 6/45 on regarde d'abord la répartition en dizaines ; ici il n'y a pas de
  // dizaines, et la première question du produit est **où en est chaque
  // place** — dix chiffres, chacun avec son attente.
  import { compute } from '@core/pension.js'
  import {
    PENSION_BANDS, PENSION_SECTION_LABELS, pensionBandOf, pensionCells,
    pensionSectionOf,
  } from '@core/pension-analysis.js'
  import { digitFrequency } from '@core/pension-pages.js'

  import Bars from '../components/Bars.svelte'
  import Stat from '../components/Stat.svelte'
  import { day, num, rang as fmt } from '../lib/format.js'

  let { pension } = $props()

  const PLACES = ['일', '이', '삼', '사', '오', '육']
  const SECTION_VARS = ['--s1', '--s3', '--s5']
  const TONE = { hot: '--t-hot', midle: '--t-mid', cold: '--t-cold', dead: '--t-dead' }
  const TEXT = {
    hot: '--t-hot-text', midle: '--t-mid-text',
    cold: '--t-cold-text', dead: '--t-dead-text',
  }

  const last = $derived(pension.n - 1)
  const m = $derived(compute(pension))
  const now = $derived([...pension.digitsAt(last)])
  const bonusNow = $derived([...pension.bonusAt(last)])

  // Les six places, chacune avec son état : le chiffre sorti, depuis combien
  // de temps il attendait, et le chiffre qui attend le plus à cette place.
  const places = $derived.by(() => {
    const out = []
    for (let place = 0; place < 6; place++) {
      const cells = pensionCells(pension, place)
      const row = cells[last]
      const hit = row.find((c) => c.drawn)
      const coldest = [...row].sort((a, b) => b.gap - a.gap)[0]
      const counts = {}
      for (let d = 0; d < 10; d++) counts[d] = 0
      for (let i = 0; i < pension.n; i++) counts[pension.digitsAt(i)[place]]++
      out.push({ place, row, hit, coldest, counts })
    }
    return out
  })

  // 구간 — trois tranches, 0–3 · 4–6 · 7–9. Le 6/45 en a cinq, par dizaines ;
  // un chiffre n'a pas de dizaine, la coupure est donc arbitraire et assumée.
  const sections = $derived.by(() => {
    const out = { '0–3': 0, '4–6': 0, '7–9': 0 }
    for (let i = 0; i < pension.n; i++) {
      for (const d of pension.digitsAt(i)) out[PENSION_SECTION_LABELS[pensionSectionOf(d)]]++
    }
    return out
  })
  const sectionNow = $derived.by(() => {
    const out = [0, 0, 0]
    for (const d of now) out[pensionSectionOf(d)]++
    return out
  })

  const digits = $derived(digitFrequency(pension, 'digits'))

  const mean = (arr) => [...arr].reduce((a, b) => a + b, 0) / pension.n
</script>

<section class="panel">
  <div class="head">
    <h2>{fmt(pension.rangs[last])}</h2>
    <span class="gloss">{day(pension.dates[last])} · 연금복권 720+</span>
    <span class="right">{num(pension.n)}회 기록</span>
  </div>

  <div class="draw">
    <div class="grp">
      <span class="lead">조</span>
      <b class="gv">{pension.groups[last]}</b>
    </div>
    <div class="digits">
      <span class="lead">당첨번호</span>
      <span class="row">
        {#each now as d, k (k)}
          <span class="d" style="--tone: var({SECTION_VARS[pensionSectionOf(d)]})">{d}</span>
        {/each}
      </span>
    </div>
    <div class="digits">
      <span class="lead">보너스</span>
      <span class="row">
        {#each bonusNow as d, k (k)}
          <span class="d bo">{d}</span>
        {/each}
      </span>
    </div>
  </div>

  <div class="stats">
    <Stat label="총합" value={m.total[last]} note={`평균 ${mean(m.total).toFixed(1)}`} />
    <Stat label="저 : 고" value={m.lowHigh(last)} note="0–4 대 5–9" />
    <Stat label="홀 : 짝" value={m.oddEven(last)} note="0은 짝" />
    <Stat label="AC값" value={m.ac[last]} note={`평균 ${mean(m.ac).toFixed(2)}`} />
    <Stat label="서로 다른 숫자" value={m.distinct[last]} note={`평균 ${mean(m.distinct).toFixed(2)} / 6`} />
    <Stat label="이월" value={m.carryCount[last]} note="전 회차에서" />
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>자리별 상태</h2>
    <span class="gloss">여섯 자리 · 지금 무엇이 기다리는지</span>
  </div>

  <div class="scroll">
    <table class="places">
      <thead>
        <tr>
          <th>자리</th><th class="v">나온 숫자</th><th class="v">기다림</th>
          <th>온도</th><th class="v">가장 오래</th><th class="v">그 기다림</th>
        </tr>
      </thead>
      <tbody>
        {#each places as p (p.place)}
          {@const band = PENSION_BANDS.find((b) => b.key === pensionBandOf(p.hit.gap))}
          <tr>
            <td>{PLACES[p.place]}</td>
            <td class="val">
              <span class="d" style="--tone: var({SECTION_VARS[pensionSectionOf(p.hit.digit)]})">{p.hit.digit}</span>
            </td>
            <td class="val">{p.hit.gap}회</td>
            <td>
              <span class="tag" style="--tone: var({TONE[band.key]}); --text: var({TEXT[band.key]})">
                {band.label}
              </span>
            </td>
            <td class="val">
              <span class="d" style="--tone: var({SECTION_VARS[pensionSectionOf(p.coldest.digit)]})">{p.coldest.digit}</span>
            </td>
            <td class="val cold">{p.coldest.gap}회</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="note dim">
    이 제품의 <strong>기대 간격은 10회</strong>입니다 — 자리마다 열 개의 숫자가
    있기 때문입니다. 로또 6/45는 6.4회였고, 그래서 온도의 경계도 다릅니다.
  </p>
</section>

<section class="panel two">
  <div class="half">
    <div class="head">
      <h2>숫자 통계</h2>
      <span class="gloss">여섯 자리를 한꺼번에 · {num(pension.n * 6)}개</span>
    </div>
    <Bars data={digits} />
  </div>

  <div class="half">
    <div class="head">
      <h2>구간</h2>
      <span class="gloss">0–3 · 4–6 · 7–9</span>
      <span class="right">이번 회차 {sectionNow.join(' : ')}</span>
    </div>
    <Bars data={sections} />
    <p class="note dim">
      로또 6/45의 구간은 <strong>1–45의 십의 자리</strong>였습니다. 0–9 숫자에는
      십의 자리가 없어, 세 토막으로 나눴습니다 — 임의의 경계입니다.
    </p>
  </div>
</section>

<section class="panel six">
  {#each places as p (p.place)}
    <div class="sixth">
      <div class="head">
        <h2>{PLACES[p.place]}번째 자리</h2>
        <span class="gloss">숫자마다 몇 번</span>
      </div>
      <Bars data={p.counts} />
    </div>
  {/each}
</section>

<style>
  .gloss { color: var(--muted); font-size: 0.8125rem; }

  .draw {
    display: flex; gap: 2rem; flex-wrap: wrap; align-items: center;
    margin-bottom: 1.1rem;
  }
  .grp, .digits { display: flex; align-items: center; gap: 0.55rem; }
  .lead { color: var(--muted); font-size: 0.75rem; }
  .gv { font-family: var(--figure); font-size: 1.5rem; color: var(--gold-deep); }
  .row { display: inline-flex; gap: 0.4rem; }
  .d {
    font-family: var(--figure); color: var(--tone);
    min-width: 1.3rem; text-align: center; font-size: 1.05rem;
  }
  .digits .d { font-size: 1.35rem; }
  .d.bo { color: var(--t-dead-text); font-size: 1.05rem; }

  .stats {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }

  .two { display: grid; gap: 1.5rem 2rem; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); }
  .six { display: grid; gap: 1.3rem 2rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
  .half, .sixth { min-width: 0; }
  .sixth h2 { font-size: 0.9375rem; }

  table { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  th, td { padding: 0.3rem 0.6rem; text-align: left; white-space: nowrap; }
  th {
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  th.v, td.val { text-align: right; }
  td { border-bottom: 1px solid var(--line-soft); }
  .val { font-family: var(--figure); }
  .cold { color: var(--t-dead-text); }
  .tag {
    font-size: 0.6875rem; color: var(--text); border: 1px solid var(--tone);
    border-radius: 0.25rem; padding: 0.05rem 0.4rem;
  }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.7; }
  .note strong { color: var(--ink); font-weight: 600; }
</style>
