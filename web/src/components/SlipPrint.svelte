<script>
  // 용지 인쇄 — les grilles d'un enregistrement, sur de vrais bulletins.
  //
  // Le calcul est dans `lib/slip.js` ; ce panneau ne fait que tenir le
  // réglage (gardé d'une visite à l'autre) et lancer les deux impressions :
  // la page de test sur papier ordinaire, puis les bulletins.
  import { SLIP_DEFAULTS, loadSlip, printSlips, saveSlip, toSlips } from '../lib/slip.js'
  import SlipHelp from './SlipHelp.svelte'
  import { untrack } from 'svelte'

  let { grids = [] } = $props()

  let cfg = $state(loadSlip())
  let more = $state(false)
  let notice = $state(null)
  let help = $state(false)

  // Les grilles cochées, par leur rang dans le lot. Tout est coché au
  // départ ; on décoche ce qu'on ne veut pas jouer. L'ordre d'impression
  // reste celui du lot, quel que soit l'ordre des clics.
  // Sélection initiale seulement : le lot ne change pas tant que le panneau est ouvert.
  let picked = $state(new Set(untrack(() => grids).map((_, k) => k)))
  const chosen = $derived(grids.filter((_, k) => picked.has(k)))
  const slips = $derived(toSlips(chosen).length)

  function flipOne(k) {
    const next = new Set(picked)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    picked = next
  }
  const all = () => { picked = new Set(grids.map((_, k) => k)) }
  const none = () => { picked = new Set() }

  // La liste des cases, 500 à la fois : un gros lot ne se dessine pas d'un coup.
  const STEP = 500
  let listed = $state(STEP)

  // Les champs, dans l'ordre où on les touche : d'abord le décalage fin,
  // le reste seulement si le test montre un pas faux.
  const FINE = [
    { key: 'dx', label: '가로 보정 (mm)', hint: '+ 는 E 쪽으로' },
    { key: 'dy', label: '세로 보정 (mm)', hint: '+ 는 아래(자동선택) 쪽으로' },
  ]
  const GEOMETRY = [
    { key: 'width', label: '용지 길이' },
    { key: 'height', label: '용지 폭' },
    { key: 'x1', label: 'A-1 중심 · 왼쪽에서' },
    { key: 'y1', label: 'A-1 중심 · 위에서' },
    { key: 'col', label: '칸 간격 (1→2)' },
    { key: 'row', label: '줄 간격 (1→8)' },
    { key: 'panel', label: '판 간격 (A→B)' },
    { key: 'rot', label: '회전 (°)' },
    { key: 'markW', label: '마킹 폭' },
    { key: 'markH', label: '마킹 높이' },
  ]

  function set(key, value) {
    const v = Number(value)
    if (!Number.isFinite(v)) return
    cfg = { ...cfg, [key]: v }
    saveSlip(cfg)
  }

  function setFlip(on) {
    cfg = { ...cfg, flip: on }
    saveSlip(cfg)
  }

  // Page au format du bulletin, ou A4 avec le bulletin calé d'un côté du bac.
  const SHEETS = [
    { key: 'slip', label: '용지 크기 (83×190)' },
    { key: 'left', label: 'A4 · 왼쪽에 붙임' },
    { key: 'center', label: 'A4 · 가운데' },
    { key: 'right', label: 'A4 · 오른쪽에 붙임' },
  ]
  function setSheet(key) {
    cfg = { ...cfg, sheet: key }
    saveSlip(cfg)
  }

  function reset() {
    cfg = { ...SLIP_DEFAULTS }
    saveSlip(cfg)
  }

  function go(test) {
    notice = printSlips(chosen, cfg, { test })
      ? null
      : '팝업이 차단되었습니다 — 이 사이트의 팝업을 허용해 주세요.'
  }
</script>

<div class="slip">
  <div class="row">
    <b class="tag">용지 인쇄</b>
    <button class="help" onclick={() => (help = true)}>? 설정 방법</button>
    <span class="dim small">
      선택 <b>{chosen.length}</b> / {grids.length}조합 → 용지 <b>{slips}</b>장 (A~E 5게임씩)
    </span>
    <button class="link" onclick={all}>전체 선택</button>
    <button class="link" onclick={none}>전체 해제</button>
    <span class="grow"></span>
    <button onclick={() => go(true)}>테스트 인쇄</button>
    <button class="main" onclick={() => go(false)} disabled={!chosen.length}>
      용지 {slips}장 인쇄
    </button>
  </div>

  <div class="picks">
    {#each grids.slice(0, listed) as g, k (k)}
      <label class="pick" class:on={picked.has(k)}>
        <input type="checkbox" checked={picked.has(k)} onchange={() => flipOne(k)} />
        <i>{k + 1}</i>{g.join(' ')}
      </label>
    {/each}
  </div>
  {#if grids.length > listed}
    <button class="link" onclick={() => (listed += STEP)}>
      더 보기 ({listed} / {grids.length}) — 전체 선택 · 해제와 인쇄는 목록 전체에 적용됩니다
    </button>
  {/if}

  <div class="row">
    <label>
      <span>인쇄 용지</span>
      <select value={cfg.sheet} onchange={(e) => setSheet(e.currentTarget.value)}>
        {#each SHEETS as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
      </select>
    </label>
    {#if cfg.sheet !== 'slip'}
      <label>
        <span>위쪽 여백 (mm)</span>
        <input type="number" step="1" min="0" max="107" value={cfg.top}
               onchange={(e) => set('top', e.currentTarget.value)} />
        <em>A4 위 끝 → 용지 위 끝</em>
      </label>
      <label class="check">
        <input type="checkbox" checked={cfg.dots}
               onchange={(e) => { cfg = { ...cfg, dots: e.currentTarget.checked }; saveSlip(cfg) }} />
        <span>위 모서리 점 인쇄</span>
      </label>
    {/if}
    {#each FINE as f (f.key)}
      <label>
        <span>{f.label}</span>
        <input type="number" step="0.1" value={cfg[f.key]}
               onchange={(e) => set(f.key, e.currentTarget.value)} />
        <em>{f.hint}</em>
      </label>
    {/each}
    <label class="check">
      <input type="checkbox" checked={cfg.flip}
             onchange={(e) => setFlip(e.currentTarget.checked)} />
      <span>E 쪽 끝부터 넣기 (180°)</span>
    </label>
    <button class="link" onclick={() => (more = !more)}>{more ? '치수 접기' : '치수 조정'}</button>
  </div>

  {#if more}
    <div class="row">
      {#each GEOMETRY as f (f.key)}
        <label>
          <span>{f.label}</span>
          <input type="number" step="0.05" value={cfg[f.key]}
                 onchange={(e) => set(f.key, e.currentTarget.value)} />
        </label>
      {/each}
      <button class="link" onclick={reset}>기본값</button>
    </div>
  {/if}

  <p class="note dim">
    용지는 <b>Lotto 로고 쪽 끝이 먼저</b>, 인쇄면이 <b>아래</b>로 가게 넣습니다.
    인쇄 창에서 여백 <b>없음</b>, 배율 <b>100%</b>, 머리글과 바닥글 <b>끄기</b>
    (A4 모드면 용지 크기 <b>A4</b>). 먼저 같은 크기로 자른 일반 종이에
    테스트 인쇄를 하고, 진짜 용지를 겹쳐 빛에 비춰 칸이 맞는지 확인하세요 — 단위는 모두 mm.
  </p>
  {#if notice}<p class="note warn">{notice}</p>{/if}
</div>

<SlipHelp open={help} onclose={() => (help = false)} />

<style>
  .slip {
    border: 1px solid var(--gold); border-radius: var(--radius);
    padding: 0.6rem 0.75rem; margin: 0.4rem 0 0.6rem;
    background: color-mix(in srgb, var(--gold-soft) 10%, transparent);
  }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.9rem; margin-bottom: 0.45rem; }
  .tag { font-size: 0.75rem; font-weight: 600; color: var(--gold-deep); }
  .small { font-size: 0.75rem; }
  .small b { color: var(--gold-deep); }
  .grow { flex: 1 1 auto; }
  button { font-size: 0.75rem; padding: 0.2rem 0.6rem; }
  button.main { border-color: var(--gold); color: var(--gold-deep); font-weight: 600; }
  button.help { border-color: var(--gold); color: var(--gold-deep); font-size: 0.7rem; padding: 0.1rem 0.5rem; }
  button.link { border: 0; background: none; color: var(--muted); text-decoration: underline; padding: 0; }

  .picks { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
  label.pick {
    font-family: var(--figure); font-size: 0.6875rem; color: var(--muted);
    border: 1px solid var(--line-soft); border-radius: 0.25rem;
    padding: 0.05rem 0.4rem 0.05rem 0.25rem; cursor: pointer; opacity: 0.55;
  }
  label.pick.on { opacity: 1; color: var(--ink); border-color: var(--gold); }
  label.pick i { font-style: normal; color: var(--muted); font-size: 0.6rem; min-width: 1.1rem; }
  label { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; color: var(--muted); }
  label select { font-size: 0.75rem; padding: 0.1rem 0.3rem; }
  label input[type='number'] { width: 4.5rem; font-family: var(--figure); font-size: 0.75rem; padding: 0.1rem 0.3rem; }
  label em { font-style: normal; font-size: 0.625rem; opacity: 0.8; }
  label.check { gap: 0.25rem; }

  .note { margin: 0.2rem 0 0; font-size: 0.7rem; line-height: 1.6; }
  .note b { color: var(--ink); font-weight: 600; }
  .warn { color: var(--s3, #c0392b); }
</style>
