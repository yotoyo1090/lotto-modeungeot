<script>
  // Un indicateur : son nom coréen en petites capitales, sa valeur en gros.
  let { label, value, note = null, tone = null } = $props()
</script>

<div class="stat">
  <div class="label">{label}</div>
  <div class="figure" style={tone ? `color: ${tone}` : ''}>{value}</div>
  {#if note}<div class="note">{note}</div>{/if}
</div>

<style>
  .stat { min-width: 0; }
  .note {
    margin-top: 0.15rem;
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
