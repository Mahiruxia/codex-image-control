$ErrorActionPreference = "Stop"

function ConvertTo-NodeResolvedPath([string]$Value) {
  $fullPath = [System.IO.Path]::GetFullPath($Value)
  $pathRoot = [System.IO.Path]::GetPathRoot($fullPath)
  if ($fullPath.Length -gt $pathRoot.Length) { return $fullPath.TrimEnd([char[]]"\/") }
  return $fullPath
}

$root = ConvertTo-NodeResolvedPath (Join-Path $PSScriptRoot "..")
$stateRoot = if ($env:IMAGE_CONTROL_STATE_ROOT) {
  ConvertTo-NodeResolvedPath $env:IMAGE_CONTROL_STATE_ROOT
} else {
  $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if (-not $localAppData) { $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile) }
  ConvertTo-NodeResolvedPath (Join-Path $localAppData "CodexImageControl")
}
$projectsRoot = if ($env:IMAGE_CONTROL_PROJECTS_ROOT) {
  ConvertTo-NodeResolvedPath $env:IMAGE_CONTROL_PROJECTS_ROOT
} else {
  ConvertTo-NodeResolvedPath (Join-Path $stateRoot "data\projects")
}
$healthUrl = "http://127.0.0.1:4317/health"
$workbenchUrl = "http://127.0.0.1:4317/"
$manifestPath = Join-Path $root ".codex-plugin\plugin.json"
$capabilityPath = Join-Path $stateRoot ".runtime\http-capability.json"
$serverVersion = [string](Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json).version

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Test-FixedTimeText([string]$Left, [string]$Right) {
  $leftBytes = [Text.Encoding]::UTF8.GetBytes($Left)
  $rightBytes = [Text.Encoding]::UTF8.GetBytes($Right)
  if ($leftBytes.Length -ne $rightBytes.Length) { return $false }
  $difference = 0
  for ($index = 0; $index -lt $leftBytes.Length; $index++) {
    $difference = $difference -bor ($leftBytes[$index] -bxor $rightBytes[$index])
  }
  return $difference -eq 0
}

function Test-ImageControlServer {
  try {
    $capability = Get-Content -LiteralPath $capabilityPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $secret = [string]$capability.secret
    if ($capability.version -ne 1 -or $secret -notmatch "^[A-Za-z0-9_-]{43}$") { return $false }

    $challenge = [Guid]::NewGuid().ToString("N")
    $headers = @{ Authorization = "Bearer $secret" }
    $health = Invoke-RestMethod -Uri "$healthUrl`?challenge=$challenge" -Headers $headers -TimeoutSec 2
    if (-not $health.ok -or $health.service -ne "image-control" -or [string]$health.version -ne $serverVersion) {
      return $false
    }

    $payload = [string]::Join([char]0, @($challenge, $serverVersion, $root, $stateRoot, $projectsRoot))
    $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
    try {
      $expectedProof = ConvertTo-Base64Url $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))
    } finally {
      $hmac.Dispose()
    }
    return Test-FixedTimeText ([string]$health.proof) $expectedProof
  } catch {
    return $false
  }
}

if (-not (Test-ImageControlServer)) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $entry = Join-Path $root "runtime\index.js"
  if (-not (Test-Path -LiteralPath $entry)) {
    throw "工作台尚未构建，请先在仓库根目录运行 npm run build。"
  }
  $env:IMAGE_CONTROL_ROOT = $root
  $env:IMAGE_CONTROL_STATE_ROOT = $stateRoot
  $env:IMAGE_CONTROL_PROJECTS_ROOT = $projectsRoot
  $env:IMAGE_CONTROL_PORT = "4317"
  Start-Process -FilePath $node -ArgumentList @($entry, "--http") -WorkingDirectory $root -WindowStyle Hidden
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (Test-ImageControlServer) { $ready = $true; break }
  }
  if (-not $ready) { throw "图片工作台服务未能在 4317 端口启动。" }
}

Start-Process $workbenchUrl
