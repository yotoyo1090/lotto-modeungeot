<script>
  // Le tableau de 42 colonnes, commun au 일반조합, au 자동조합 et au 수동조합.
  //
  // L'ancien site l'avait écrit trois fois, à la main, en HTML. Ici l'en-tête
  // vient de `COLUMNS` et les cellules de `toCells()` : les trois écrans ne
  // peuvent plus diverger.
  import { COLUMNS, toCells } from '@core/row.js'
  import { sharing } from '@core/sharing.js'

  import { num } from '../lib/format.js'

  // Deux colonnes de plus, juste après 당첨번호 총합 — les mêmes que dans le
  // tableau du 자동조합 : la bande 분배 de la grille (ce qu'on toucherait
  // le jour du 1등) et sa popularité chez ceux qui choisissent. Elles ne
  // viennent pas de `COLUMNS` parce qu'elles ne décrivent pas le tirage :
  // elles décrivent les joueurs.
  const AFTER = 7   // l'indice de 당첨번호 총합 dans `toCells`
  const shareOf = (cells) => {
    try { return sharing(cells.slice(1, 7).map(Number)) } catch { return null }
  }

  // `draw` : le tirage réel (6 numéros + 보너스) quand il existe — les
  // cellules de numéros qui y figurent sont marquées. Sans lui, rien ne change.
  // Une ligne peut porter son propre tirage dans `_draw` (당첨번호 2등, où
  // chaque ligne vient d'un 회차 différent) : il passe alors avant `draw`.
  // `checked` + `ontoggle` : une case par ligne, seulement si l'écran les
  // passe (일반조합). Sans eux — 수동조합 — le tableau ne change pas. La
  // ligne porte alors `_i` (sa position dans le résultat) et `_pos` (son
  // rang dans la liste, toutes pages confondues).
  // `counted` : une colonne 당첨 de plus (자동조합) — combien des sept
  // numéros de `draw` la grille contient ; « — » tant que le 회차 n'est pas tiré.
  let {
    rows = [], limit = 200, onpick = null, picked = null, draw = null,
    checked = null, ontoggle = null, counted = false,
  } = $props()
  const wonOf = (cells) => (draw ? cells.slice(1, 7).filter((c) => draw.includes(Number(c))).length : null)
  const main = $derived(draw ? draw.slice(0, 6) : [])
  const bonus = $derived(draw ? draw[6] : null)

  const shown = $derived(rows.slice(0, limit))
</script>

<div class="scroll tall">
  <table>
    <thead>
      <tr>
        <th class="idx">#</th>
        {#if counted}<th title="고른 회차의 당첨번호 7개(보너스 포함)와 겹치는 개수">당첨</th>{/if}
        {#each COLUMNS as name, k (name)}
          <th>{name}</th>
          {#if k === AFTER}
            <th title="당첨 시 나눌 사람 — 적게 팔린 모양일수록 1인당 금액이 크다">분배</th>
            <th title="번호를 직접 고르는 사람들 사이에서 이 모양이 얼마나 자주 선택되는가 (1 = 평균)">수동</th>
          {/if}
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each shown as r, i (i)}
        {@const cells = toCells(r)}
        {@const sh = shareOf(cells)}
        {@const ticked = checked?.has(r._i) ?? false}
        {@const own = r._draw ?? null}
        {@const rowMain = own ? own.slice(0, 6) : main}
        {@const rowBonus = own ? own[6] : bonus}
        <tr class:pickable={onpick !== null} class:on={picked === i || ticked}
            onclick={() => onpick?.(i)}>
          <td class="idx dim">
            {#if checked}
              <label class="tick">
                <input type="checkbox" checked={ticked} onchange={() => ontoggle?.(r._i)} />{r._pos ?? i + 1}
              </label>
            {:else}{r._pos ?? i + 1}{/if}
          </td>
          {#if counted}
            {@const won = wonOf(cells)}
            <td class:hit={won !== null && won >= 3}>{won ?? '—'}</td>
          {/if}
          {#each cells as cell, k (k)}
            <td class:num={k >= 1 && k <= 7}
                class:hit={k >= 1 && k <= 6 && !own && rowMain.includes(Number(cell))}
                class:bonus={k >= 1 && k <= 6 && Number(cell) === rowBonus}>{cell || '·'}</td>
            {#if k === AFTER}
              {#if sh}
                <td class="share" class:rare={sh.band === 'rare'}
                    title={`지표 ${sh.index.toFixed(3)} · 평균 대비 ${sh.share.toFixed(2)}배`}>{sh.label}</td>
                <td class="pop">{sh.popularity.toFixed(1)}×</td>
              {:else}
                <td>·</td><td>·</td>
              {/if}
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if rows.length > shown.length}
  <p class="note dim">
    {num(rows.length)}개 중 {num(shown.length)}개만 표시합니다.
  </p>
{/if}

<style>
  .tall { max-height: 30rem; overflow-y: auto; }
  table { font-size: 0.75rem; }
  thead th {
    position: sticky; top: 0; background: var(--surface); z-index: 1;
    font-size: 0.625rem;
  }
  th, td { padding: 0.25rem 0.4rem; text-align: right; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  td.num { font-family: var(--figure); color: var(--ink); }
  td.hit { color: var(--gold-deep); font-weight: 700; background: var(--gold-wash); }
  td.bonus { color: var(--gold-deep); font-weight: 700; outline: 1px solid var(--gold); outline-offset: -1px; }
  .idx { width: 2rem; }
  .tick { display: inline-flex; align-items: center; gap: 0.3rem; cursor: pointer; }
  /* Les deux colonnes 분배 · 수동, comme dans le tableau du 자동조합. */
  td.share { color: var(--ink-soft); }
  td.share.rare { color: var(--ink); font-weight: 600; }
  td.pop { font-family: var(--figure); color: var(--muted); }

  tr.pickable { cursor: pointer; }
  tr.pickable:hover td { background: var(--gold-wash); }
  tr.on td { background: var(--gold-wash); }

  .note { margin: 0.6rem 0 0; font-size: 0.75rem; }
</style>
