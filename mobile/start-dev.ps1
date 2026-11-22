# One command to run everything for Expo Go:
#   backend -> cloudflared link -> mobile\.env -> Expo
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File C:\Users\Ayush\IdeaProjects\hackwestern26\mobile\start-dev.ps1
# Stop: close the backend and cloudflared windows it opens, and Ctrl+C in this one.

$ErrorActionPreference = "Stop"
$mobile = $PSScriptRoot
$repo = Split-Path $mobile -Parent
$backend = Join-Path $repo "backend"

# 1) backend in its own window (kills anything already on port 8000 first, an old copy caused the
#    "Gemini key missing" mess before)
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
$py = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "No backend\.venv found. Make it once: cd backend; py -m venv .venv; .venv\Scripts\pip install -r requirements.txt" }
Start-Process powershell -WorkingDirectory $backend -ArgumentList "-NoExit", "-Command", "& '$py' -m uvicorn app.main:app --port 8000"
Write-Host "Backend starting on http://127.0.0.1:8000 ..."

# wait until it answers
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  try { Invoke-RestMethod http://127.0.0.1:8000/health -TimeoutSec 2 | Out-Null; $up = $true; break } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $up) { throw "Backend didn't start. Check the backend window for the error." }
Write-Host "Backend is up."

# 2) cloudflared tunnel so the phone can reach the backend from anywhere
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) {
  $cf = @("C:\Program Files (x86)\cloudflared\cloudflared.exe", "C:\Program Files\cloudflared\cloudflared.exe",
          "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $cf) { throw "cloudflared not found. Install it once: winget install --id Cloudflare.cloudflared" }
$log = Join-Path $env:TEMP "carescout-cloudflared.log"
Remove-Item $log -ErrorAction SilentlyContinue
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process $cf -ArgumentList "tunnel", "--url", "http://127.0.0.1:8000", "--logfile", "`"$log`"" -WindowStyle Minimized
Write-Host "Opening the tunnel ..."

$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}
if (-not $url) { throw "Couldn't get a tunnel link. Look at $log" }
Write-Host "Tunnel: $url"

# 3) point the app at it (keeps any other lines in mobile\.env, like EXPO_PUBLIC_API_KEY)
$envFile = Join-Path $mobile ".env"
$lines = @()
if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch "^\s*EXPO_PUBLIC_API_URL\s*=" } }
$lines = @("EXPO_PUBLIC_API_URL=$url") + $lines
Set-Content -Path $envFile -Value $lines -Encoding ascii
Write-Host "mobile\.env updated."

# the tunnel can take a few seconds before it answers from outside
for ($i = 0; $i -lt 20; $i++) {
  try { Invoke-RestMethod "$url/health" -TimeoutSec 3 | Out-Null; Write-Host "Tunnel works."; break } catch { Start-Sleep -Seconds 1 }
}

# 4) Expo, in this window. Scan the QR with the phone (Expo Go signed in as park0z)
Set-Location $mobile
npx expo start --tunnel -c
