# 用 Edge/Chrome 把看板装成桌面应用（Windows）
#
#   pwsh -File scripts/install-shortcut.ps1                # 桌面快捷方式
#   pwsh -File scripts/install-shortcut.ps1 -Startup       # 同时加入开机启动
#   pwsh -File scripts/install-shortcut.ps1 -Port 8888 -Name "AI 钱包"
#
# 前提：看板已启动（npm start），默认 http://127.0.0.1:8787

param(
  [int]$Port = 8787,
  [string]$Name = "AI 钱包看板",
  [switch]$Startup
)

$ErrorActionPreference = "Stop"
$url = "http://127.0.0.1:$Port"

$browsers = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Error "没找到 Edge 或 Chrome，请先安装其中之一。"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "$Name.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $browser
$shortcut.Arguments = "--app=$url --window-size=1200,820"
$shortcut.WorkingDirectory = Split-Path $browser
$shortcut.IconLocation = "$browser,0"
$shortcut.Description = "AI 平台余额与消耗看板"
$shortcut.Save()

Write-Host "已创建：$lnkPath"

if ($Startup) {
  $startupDir = [Environment]::GetFolderPath("Startup")
  Copy-Item $lnkPath (Join-Path $startupDir "$Name.lnk") -Force
  Write-Host "已加入开机启动：$startupDir"
}

Write-Host "提示：先确认 $url 能打开，再双击快捷方式。"
