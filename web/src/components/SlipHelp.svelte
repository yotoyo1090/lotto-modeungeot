<script>
  // Le mode d'emploi de 용지 인쇄, de A à Z — tout ce qu'il a fallu découvrir
  // en essayant (le format Windows, le bac, le sens du bulletin, le calage),
  // écrit une fois pour ne pas avoir à le redécouvrir.
  let { open = false, onclose } = $props()

  function key(e) {
    if (open && e.key === 'Escape') onclose?.()
  }
</script>

<svelte:window onkeydown={key} />

{#if open}
  <!-- Le fond ferme la fenêtre ; le clic dans la boîte ne remonte pas. -->
  <div class="backdrop" role="presentation" onclick={() => onclose?.()}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="slip-help-title"
         tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="top">
        <h2 id="slip-help-title">로또 용지 인쇄 — 설정 방법</h2>
        <button class="x" onclick={() => onclose?.()} aria-label="닫기">×</button>
      </div>

      <div class="body">
        <section>
          <h3><b>1</b> Windows에 용지 크기 만들기 <em>처음 한 번만</em></h3>
          <ol>
            <li>시작 → <strong>프린터 및 스캐너</strong> → 아래쪽 <strong>인쇄 서버 속성</strong></li>
            <li><strong>양식</strong> 탭 → <strong>새 양식 만들기</strong> 체크</li>
            <li>양식 이름 <code>LOTTO</code> · 단위 <strong>미터법</strong></li>
            <li>너비 <code>8.30cm</code> · 높이 <code>19.00cm</code> · 여백 4개 모두 <code>0.00cm</code></li>
            <li><strong>양식 저장</strong> → 닫기</li>
          </ol>
        </section>

        <section>
          <h3><b>2</b> 용지 넣기</h3>
          <ul>
            <li><strong>위쪽 용지함(1번)</strong>만 사용 — 아래 용지함은 A4 전용입니다.</li>
            <li>로또 용지를 <strong>한 장씩</strong> 넣습니다.</li>
            <li><strong>Lotto 로고 쪽 끝이 먼저</strong> (프린터 안쪽), <strong>인쇄면은 아래</strong>로.</li>
            <li>용지를 한쪽 가이드에 붙이고, 반대쪽 가이드를 <strong>꽉</strong> 조입니다. 구김·휨 없이 평평하게.</li>
            <li><strong>매번 똑같은 방식</strong>으로 넣어야 마킹 위치가 유지됩니다.</li>
          </ul>
        </section>

        <section>
          <h3><b>3</b> 이 화면에서</h3>
          <ul>
            <li><strong>인쇄 용지</strong> = <code>용지 크기 (83×190)</code></li>
            <li>인쇄할 조합을 체크합니다 (<strong>전체 선택 / 전체 해제</strong>). 5개씩 A~E 한 장.</li>
          </ul>
        </section>

        <section>
          <h3><b>4</b> 크롬 인쇄 창</h3>
          <ul>
            <li>대상 : <strong>HP OfficeJet Pro 8730</strong></li>
            <li><strong>설정 더보기</strong>를 열고 :</li>
          </ul>
          <table>
            <tbody>
              <tr><td>용지 크기</td><td><code>LOTTO</code></td></tr>
              <tr><td>여백</td><td><code>없음</code></td></tr>
              <tr><td>배율</td><td><code>기본값</code> (100%)</td></tr>
              <tr><td>머리글과 바닥글</td><td><strong>체크 해제</strong></td></tr>
            </tbody>
          </table>
          <p class="hint">매번 같은 설정이어야 합니다 — 용지 크기나 여백이 바뀌면 마킹 전체가 밀립니다.</p>
        </section>

        <section>
          <h3><b>5</b> 위치 맞추기 <em>처음 한 번 · 어긋날 때</em></h3>
          <ol>
            <li>일반 종이를 <strong>8.3 × 19 cm</strong>로 잘라 <strong>테스트 인쇄</strong>.</li>
            <li>실제 로또 용지를 위에 겹쳐 <strong>빛에 비춰</strong> 봅니다. 검은 칸(1·7·43)이 칸 가운데 와야 합니다.</li>
            <li>전체가 한쪽으로 밀렸으면 <strong>보정</strong> :
              <ul>
                <li><strong>가로 보정</strong> + → E 쪽으로 · − → A 쪽으로</li>
                <li><strong>세로 보정</strong> + → 아래(자동선택 쪽) · − → 위(1,000원 쪽)</li>
              </ul>
            </li>
            <li>A는 맞는데 E만 어긋나면 → <strong>치수 조정 → 회전 (°)</strong>. 보통은 건드리지 않습니다.</li>
            <li>설정은 자동 저장됩니다.</li>
          </ol>
        </section>

        <section>
          <h3><b>6</b> 실제 인쇄</h3>
          <ul>
            <li><strong>용지 N장 인쇄</strong> → 한 장씩 넣고 인쇄.</li>
            <li>인쇄 후 <strong>번호와 마킹 위치를 눈으로 확인</strong>한 다음 판매점에 가져갑니다.</li>
          </ul>
        </section>

        <section>
          <h3><b>7</b> 문제가 생기면</h3>
          <table class="faq">
            <tbody>
              <tr><td>「A4가 아닙니다」</td><td>인쇄 용지가 <code>용지 크기 (83×190)</code>인지, 크롬 용지 크기가 <code>LOTTO</code>인지 확인.</td></tr>
              <tr><td>인쇄 창이 안 열림</td><td>브라우저가 팝업을 막은 것 — 이 사이트의 팝업을 허용.</td></tr>
              <tr><td>용지가 걸림</td><td>한 장씩, 평평하게, 가이드 꽉. 구겨진 용지는 새것으로.</td></tr>
              <tr><td>마킹이 칸에서 밀림</td><td>넣는 방식·크롬 설정이 지난번과 같은지 확인 → 그래도 밀리면 5번 보정.</td></tr>
              <tr><td>아무것도 인쇄 안 됨</td><td>용지 앞뒤를 확인 — 인쇄면이 아래로 가야 합니다.</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 1000;
    background: color-mix(in srgb, #000 45%, transparent);
    display: flex; align-items: center; justify-content: center; padding: 1rem;
  }
  .modal {
    background: var(--surface); color: var(--ink);
    border: 1px solid var(--gold); border-radius: var(--radius);
    width: min(44rem, 100%); max-height: 88vh; display: flex; flex-direction: column;
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.25);
  }
  .top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.8rem 1rem; border-bottom: 1px solid var(--line-soft);
  }
  .top h2 { font-size: 1rem; margin: 0; }
  .x { border: 0; background: none; font-size: 1.4rem; line-height: 1; cursor: pointer; color: var(--muted); }
  .body { overflow-y: auto; padding: 0.4rem 1rem 1rem; font-size: 0.8125rem; line-height: 1.7; }

  section { padding: 0.7rem 0; border-bottom: 1px solid var(--line-soft); }
  section:last-child { border-bottom: 0; }
  h3 { font-size: 0.875rem; margin: 0 0 0.35rem; display: flex; align-items: center; gap: 0.45rem; }
  h3 b {
    display: inline-grid; place-items: center; width: 1.35rem; height: 1.35rem;
    border-radius: 999px; background: var(--gold); color: var(--surface); font-size: 0.75rem;
  }
  h3 em { font-style: normal; font-weight: 400; font-size: 0.7rem; color: var(--muted); }
  ol, ul { margin: 0; padding-left: 1.3rem; }
  li ul { margin-top: 0.15rem; }
  strong { font-weight: 600; }
  code {
    font-family: var(--figure); font-size: 0.75rem;
    background: var(--gold-wash, #fff6dc); border-radius: 0.2rem; padding: 0 0.3rem;
  }
  table { border-collapse: collapse; margin: 0.3rem 0 0 1.3rem; }
  td { padding: 0.15rem 0.8rem 0.15rem 0; vertical-align: top; }
  td:first-child { color: var(--muted); white-space: nowrap; }
  table.faq { margin-left: 0; }
  .hint { margin: 0.35rem 0 0 1.3rem; color: var(--muted); font-size: 0.75rem; }
</style>
