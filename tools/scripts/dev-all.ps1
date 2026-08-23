# ============================================================
# 布谷（Cuckoo）一键启动 + 打开浏览器人工验证
# 用法：右键"使用 PowerShell 运行"，或
#      powershell -ExecutionPolicy Bypass -File tools/scripts/dev-all.ps1
# 效果：清理占用端口 → 启动后端(3000) → 启动前端(5173) → 等待就绪 → 打开浏览器
# ============================================================
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot   # tools/scripts → 仓库根
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'

function Stop-Port($Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    Write-Host "[布谷] 停止占用端口 $Port 的进程 (PID $($conn.OwningProcess))"
    $conn.OwningProcess | Select-Object -Unique | ForEach-Object {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
  }
}

Write-Host "=== 布谷 Cuckoo 一键启动 ==="

# 1. 清理端口占用（避免"旧进程服务旧代码"假象）
Stop-Port 3000
Stop-Port 5173

# 2. 启动后端（若 dist 不存在或比 src 旧，先构建）
if (-not (Test-Path (Join-Path $Backend 'dist\main.js'))) {
  Write-Host "[布谷] 构建后端……"
  Push-Location $Backend; npm run build; Pop-Location
}
Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $Backend -WindowStyle Hidden
Write-Host "[布谷] 后端启动中 (http://localhost:3000) ……"

# 3. 启动前端（dev server）
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--port','5173','--strictPort' -WorkingDirectory $Frontend -WindowStyle Hidden
Write-Host "[布谷] 前端启动中 (http://localhost:5173) ……"

# 4. 等待就绪并打开浏览器
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $null = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2
    $null = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/health' -UseBasicParsing -TimeoutSec 2
    $ready = $true
    break
  } catch { }
}
if ($ready) {
  Write-Host "[布谷] 前后端已就绪，正在打开浏览器……"
  Start-Process 'http://localhost:5173'
  Write-Host ""
  Write-Host "  App:     http://localhost:5173  （注册/登录验证）"
  Write-Host "  Swagger: http://localhost:3000/api"
  Write-Host "  Health:  http://localhost:3000/api/v1/health"
  Write-Host ""
  Write-Host "  停止服务：重新运行本脚本（会自动重启），或手动结束 3000/5173 端口进程。"
} else {
  Write-Host "[布谷] 服务未在 30 秒内就绪，请检查 backend/.env 与 npm install。"
}
