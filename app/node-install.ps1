# Installe Node.js (version LTS) — appelé par install.bat quand Node manque
# ou qu'il est trop ancien pour node:sqlite (il faut 22.5 au moins).
#
# D'abord winget, présent sur Windows 10 et 11 à jour. Sinon le paquet MSI
# officiel de nodejs.org. Dans les deux cas Windows demande une seule fois
# l'accord administrateur. install.bat revérifie la version ensuite : ce
# script n'a pas à juger lui-même de la réussite.

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (Get-Command winget -ErrorAction SilentlyContinue) {
  winget install -e --id OpenJS.NodeJS.LTS --source winget --silent `
    --accept-source-agreements --accept-package-agreements
  if (Test-Path "$env:ProgramFiles\nodejs\node.exe") { exit 0 }
}

# Sans winget : le MSI. Sous Windows PowerShell 5.1, Invoke-RestMethod rend
# le tableau JSON d'un seul bloc — il faut le parcourir à la main.
try {
  $lts = $null
  foreach ($release in (Invoke-RestMethod 'https://nodejs.org/dist/index.json')) {
    if ($release.lts) { $lts = $release.version; break }
  }
  if (-not $lts) { exit 1 }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $msi = Join-Path $env:TEMP "node-$lts-$arch.msi"
  Invoke-WebRequest "https://nodejs.org/dist/$lts/node-$lts-$arch.msi" -OutFile $msi -UseBasicParsing
  $p = Start-Process msiexec.exe -ArgumentList '/i', "`"$msi`"", '/passive', '/norestart' `
    -Verb RunAs -Wait -PassThru
  exit $p.ExitCode
} catch {
  Write-Host $_.Exception.Message
  exit 1
}
