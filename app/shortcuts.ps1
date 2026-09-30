# 바탕화면에 아이콘 두 개를 만듭니다 — install.bat 이 부릅니다.
$app  = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $app
$desk = [Environment]::GetFolderPath('Desktop')
$ws   = New-Object -ComObject WScript.Shell

function New-Link($name, $script, $icon, $desc) {
  $path = Join-Path $desk "$name.lnk"
  $lnk = $ws.CreateShortcut($path)
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = '"' + (Join-Path $app $script) + '"'
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = (Join-Path $app $icon) + ',0'
  $lnk.Description = $desc
  $lnk.Save()
  Write-Host "  만듦 : $path"
}

New-Link '로또 분석' 'start.vbs' 'lotto.ico' '로또 6/45 · 연금복권 720+ 분석'
New-Link '로또 분석 종료' 'stop.vbs' 'lotto-stop.ico' '로또 분석 서버 종료'
