// Le serveur MCP, en ligne de commande.
//
//   node --experimental-sqlite tools/mcp.js [chemin/lotto.sqlite]
//
// Il parle sur l'entrée et la sortie standard : rien à afficher, rien à
// écouter sur le réseau. Dans la configuration d'un client MCP :
//
//   {
//     "mcpServers": {
//       "lotto": {
//         "command": "node",
//         "args": ["--experimental-sqlite",
//                  "C:\\chemin\\vers\\lotto-js\\tools\\mcp.js"]
//       }
//     }
//   }

import { pathToFileURL } from 'node:url'
import { DEFAULT_PATH } from '../src/node/db.js'
import { serve } from '../src/mcp/server.js'

function main() {
  // Les journaux vont sur stderr : stdout porte le protocole et rien d'autre.
  const path = process.argv[2] ?? DEFAULT_PATH
  process.stderr.write(`lotto mcp — ${path}\n`)
  serve({ path })
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (import.meta.url === entry) main()
