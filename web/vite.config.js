import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// La page Update (`tools/admin.js`) branchée sur le serveur de développement :
// `npm run web` suffit, sans lancer `npm run admin` à côté. On réutilise son
// `handler()` tel quel — `/admin` sert la page, `/api/*` ses boutons. Le
// module est chargé par Node au démarrage (import dynamique, non empaqueté
// dans la config) et seulement en `serve` : le site construit reste statique.
function update() {
  return {
    name: 'lotto-update',
    apply: 'serve',
    async configureServer(server) {
      const admin = new URL('../tools/admin.js', import.meta.url).href
      const { handler } = await import(/* @vite-ignore */ admin)
      const handle = handler()
      server.middlewares.use((req, res, next) => {
        const path = req.url.split('?')[0]
        if (path === '/admin' || path === '/admin/') {
          req.url = '/'
          return handle(req, res)
        }
        if (path.startsWith('/api/')) return handle(req, res)
        next()
      })
    },
  }
}

// `base: './'` — le site doit pouvoir être ouvert depuis n'importe quel
// dossier, y compris un simple double-clic sur le fichier après `build`.
export default defineConfig({
  base: './',
  plugins: [svelte(), update()],
  resolve: {
    // Le noyau vit hors de `web/` : c'est le même code que celui vérifié
    // par les 168 tests, importé tel quel plutôt que recopié.
    alias: { '@core': fileURLToPath(new URL('../src/core', import.meta.url)) },
  },
  server: { fs: { allow: ['..'] } },
})
