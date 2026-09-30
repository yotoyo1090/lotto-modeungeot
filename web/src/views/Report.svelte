<script>
  // Un rapport de recherche, servi tel quel.
  //
  // Les rapports vivent dans `web/public/` : ce sont des pages complètes,
  // avec leur propre feuille de style, écrites une fois et figées. Les
  // réécrire en Svelte reviendrait à les maintenir deux fois, et à faire
  // dépendre une conclusion datée du code d'aujourd'hui — un rapport doit
  // rester lisible tel qu'il a été rendu. On l'encadre donc, sans y toucher.
  //
  // L'iframe est ici le bon outil et non un pis-aller : elle isole la
  // feuille de style du rapport de celle du site, dans les deux sens.
  let { src, title, note = '', date = '' } = $props()
</script>

<section class="panel">
  <div class="head">
    <div>
      <h2>{title}</h2>
      {#if note}<p class="soft">{note}</p>{/if}
    </div>
    <div class="side">
      {#if date}<span class="dim">{date}</span>{/if}
      <a class="open" href={src} target="_blank" rel="noopener">새 창에서 열기 ↗</a>
    </div>
  </div>
</section>

<div class="holder">
  <iframe {src} {title} loading="lazy"></iframe>
</div>

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  .head h2 { margin: 0; }
  .head .soft { margin: 0.25rem 0 0; font-size: 0.8125rem; color: var(--ink-soft); }

  .side { display: flex; align-items: center; gap: 0.75rem; white-space: nowrap; }
  .side .dim { font-family: var(--figure); font-size: 0.75rem; color: var(--muted); }

  .open {
    border: 1px solid var(--gold);
    border-radius: 999px;
    padding: 0.28rem 0.85rem;
    font-size: 0.8125rem;
    color: var(--gold-deep);
    text-decoration: none;
    white-space: nowrap;
  }
  .open:hover { background: var(--gold-wash); }

  /* Le cadre prend la largeur de la colonne et presque toute la hauteur de
     la fenêtre : un rapport se lit, il ne se survole pas dans une lucarne. */
  .holder {
    margin-top: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    overflow: hidden;
  }
  iframe {
    display: block;
    width: 100%;
    height: min(78vh, 1100px);
    border: 0;
  }
</style>
