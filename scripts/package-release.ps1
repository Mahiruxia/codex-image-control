$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$pluginRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "plugins\image-control"))
$manifestPath = Join-Path $pluginRoot ".codex-plugin\plugin.json"
$artifactsRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "artifacts"))
$bundleArchiveRoot = "codex-image-control"
$pluginArchiveRoot = "$bundleArchiveRoot/plugins/image-control"

if ([System.IO.Path]::GetFileName($pluginRoot) -ne "image-control") {
  throw "Refusing to package an unexpected plugin root: $pluginRoot"
}
$repoRootItem = Get-Item -LiteralPath $repoRoot -Force
if (($repoRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw "Formal release repository root cannot be a symbolic link or reparse point."
}
$pluginRootItem = Get-Item -LiteralPath $pluginRoot -Force
if (($pluginRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw "Formal release input cannot be a symbolic link or reparse point."
}

Push-Location $repoRoot
try {
  npm run verify
  if ($LASTEXITCODE -ne 0) { throw "Release verification failed." }
  npm run audit:dependencies
  if ($LASTEXITCODE -ne 0) { throw "Dependency audit failed." }
} finally {
  Pop-Location
}

$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$') {
  throw "Formal packages require a pure base version. Remove any +codex.<cachebuster> suffix first: $version"
}

$rootPackage = [System.IO.File]::ReadAllText((Join-Path $repoRoot "package.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
if ([string]$rootPackage.version -ne $version) {
  throw "Root package version does not match the formal plugin version."
}

New-Item -ItemType Directory -Path $artifactsRoot -Force | Out-Null
$archivePath = Join-Path $artifactsRoot ("image-control-{0}-windows-x64.zip" -f $version)
$checksumPath = "$archivePath.sha256"
$sbomPath = Join-Path $artifactsRoot ("image-control-{0}-sbom.cdx.json" -f $version)
$componentsPath = Join-Path $artifactsRoot ("image-control-{0}-third-party-components.json" -f $version)
$reproArchivePath = Join-Path $artifactsRoot (".image-control-{0}-repro-{1}.zip" -f $version, [guid]::NewGuid().ToString("N"))

foreach ($candidate in @($archivePath, $checksumPath, $sbomPath, $componentsPath, $reproArchivePath)) {
  $resolvedCandidate = [System.IO.Path]::GetFullPath($candidate)
  if (-not $resolvedCandidate.StartsWith($artifactsRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace an artifact outside the repository artifacts directory."
  }
  if (Test-Path -LiteralPath $resolvedCandidate) {
    Remove-Item -LiteralPath $resolvedCandidate -Force
  }
}

Push-Location $repoRoot
try {
  node scripts/generate-supply-chain.mjs --output-dir $artifactsRoot --base-name ("image-control-" + $version)
  if ($LASTEXITCODE -ne 0) { throw "Supply-chain document generation failed." }
} finally {
  Pop-Location
}

foreach ($generatedPath in @($sbomPath, $componentsPath)) {
  if (-not (Test-Path -LiteralPath $generatedPath -PathType Leaf)) {
    throw "Missing generated release metadata: $generatedPath"
  }
}

$includeRoots = @(
  ".codex-plugin",
  ".mcp.json",
  "app\dist",
  "app\LICENSE",
  "app\NOTICE",
  "runtime",
  "skills",
  "templates",
  "scripts\open-workbench.ps1",
  "open-workbench.cmd",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md"
)

$archiveFiles = [System.Collections.Generic.List[object]]::new()
foreach ($relativeRoot in $includeRoots) {
  $sourcePath = Join-Path $pluginRoot $relativeRoot
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Missing release file: $relativeRoot"
  }
  $rootItem = Get-Item -LiteralPath $sourcePath -Force
  $items = if ($rootItem.PSIsContainer) {
    @($rootItem) + @(Get-ChildItem -LiteralPath $sourcePath -Recurse -Force)
  } else {
    @($rootItem)
  }
  foreach ($item in $items) {
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Release input contains a symbolic link or reparse point: $($item.FullName)"
    }
    if ($item.PSIsContainer) { continue }
    $resolvedFile = [System.IO.Path]::GetFullPath($item.FullName)
    if (-not $resolvedFile.StartsWith($pluginRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Release file escaped plugin root: $resolvedFile"
    }
    $relativePath = $resolvedFile.Substring($pluginRoot.Length).TrimStart("\", "/").Replace("\", "/")
    $archiveFiles.Add([pscustomobject]@{
      SourcePath = $resolvedFile
      TargetPath = "$pluginArchiveRoot/$relativePath"
    })
  }
}

# Release ZIP users must be able to migrate, back up, recover, and completely
# uninstall without depending on a mutable repository web page. These files
# intentionally come from the repository root and are mapped into the plugin
# archive beside its runtime README.
$offlineMaintenanceFiles = @(
  @{ SourcePath = (Join-Path $repoRoot ".agents\plugins\marketplace.json"); TargetPath = "$bundleArchiveRoot/.agents/plugins/marketplace.json" },
  @{ SourcePath = (Join-Path $repoRoot "INSTALL.md"); TargetPath = "$bundleArchiveRoot/INSTALL.md" },
  @{ SourcePath = (Join-Path $repoRoot "LICENSE"); TargetPath = "$bundleArchiveRoot/LICENSE" },
  @{ SourcePath = (Join-Path $repoRoot "docs\CODEX_INSTALL_PROMPT.md"); TargetPath = "$bundleArchiveRoot/docs/CODEX_INSTALL_PROMPT.md" },
  @{ SourcePath = (Join-Path $repoRoot "MIGRATION.md"); TargetPath = "$pluginArchiveRoot/MIGRATION.md" },
  @{ SourcePath = (Join-Path $repoRoot "SECURITY.md"); TargetPath = "$pluginArchiveRoot/SECURITY.md" },
  @{ SourcePath = (Join-Path $repoRoot "docs\BACKUP_AND_RECOVERY.md"); TargetPath = "$pluginArchiveRoot/docs/BACKUP_AND_RECOVERY.md" },
  @{ SourcePath = (Join-Path $repoRoot "docs\PRIVACY_AND_DATA.md"); TargetPath = "$pluginArchiveRoot/docs/PRIVACY_AND_DATA.md" },
  @{ SourcePath = (Join-Path $repoRoot "docs\RELEASE_CHECKLIST.md"); TargetPath = "$pluginArchiveRoot/docs/RELEASE_CHECKLIST.md" },
  @{ SourcePath = (Join-Path $repoRoot "scripts\migrate-legacy-state.ps1"); TargetPath = "$pluginArchiveRoot/scripts/migrate-legacy-state.ps1" }
)
foreach ($offlineFile in $offlineMaintenanceFiles) {
  $sourcePath = [System.IO.Path]::GetFullPath([string]$offlineFile.SourcePath)
  if (-not $sourcePath.StartsWith($repoRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Offline maintenance file escaped the repository root: $sourcePath"
  }
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Missing offline maintenance file: $sourcePath"
  }
  $cursor = Get-Item -LiteralPath $sourcePath -Force
  while ($cursor) {
    if (($cursor.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Offline maintenance path cannot contain a symbolic link or reparse point: $($cursor.FullName)"
    }
    if ($cursor.FullName.Equals($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    # Windows PowerShell 5.1 does not attach the provider-only PSIsContainer
    # property to a DirectoryInfo reached through FileInfo.Directory. Use the
    # CLR type so Unicode repository paths keep walking all the way to root.
    $cursor = if ($cursor -is [System.IO.DirectoryInfo]) { $cursor.Parent } else { $cursor.Directory }
  }
  if (-not $cursor) {
    throw "Offline maintenance path did not resolve through the repository root: $sourcePath"
  }
  $archiveFiles.Add([pscustomobject]@{ SourcePath = $sourcePath; TargetPath = [string]$offlineFile.TargetPath })
}

$archiveFiles.Add([pscustomobject]@{ SourcePath = $sbomPath; TargetPath = "$pluginArchiveRoot/SBOM.cdx.json" })
$archiveFiles.Add([pscustomobject]@{ SourcePath = $componentsPath; TargetPath = "$pluginArchiveRoot/THIRD_PARTY_COMPONENTS.json" })
$archiveFiles = [object[]]$archiveFiles.ToArray()
$ordinalComparer = [System.Collections.Generic.Comparer[object]]::Create(
  [System.Comparison[object]]{
    param($left, $right)
    return [System.StringComparer]::Ordinal.Compare([string]$left.TargetPath, [string]$right.TargetPath)
  }
)
[System.Array]::Sort($archiveFiles, $ordinalComparer)

$entryNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($file in $archiveFiles) {
  if (-not $entryNames.Add([string]$file.TargetPath)) {
    throw "Release archive contains a duplicate or case-colliding path: $($file.TargetPath)"
  }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-DeterministicArchive {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,
    [Parameter(Mandatory = $true)]
    [object[]]$Files
  )

  $stream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true, [System.Text.Encoding]::UTF8)
    try {
      $fixedTimestamp = [System.DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [System.TimeSpan]::Zero)
      foreach ($file in $Files) {
        $entry = $archive.CreateEntry([string]$file.TargetPath, [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = $fixedTimestamp
        $entry.ExternalAttributes = 0
        $entryStream = $entry.Open()
        $sourceStream = [System.IO.File]::OpenRead([string]$file.SourcePath)
        try {
          $sourceStream.CopyTo($entryStream)
        } finally {
          $sourceStream.Dispose()
          $entryStream.Dispose()
        }
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  $fileStream = [System.IO.File]::OpenRead($FilePath)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      return -join ($sha256.ComputeHash($fileStream) | ForEach-Object { $_.ToString("x2") })
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $fileStream.Dispose()
  }
}

try {
  New-DeterministicArchive -Destination $archivePath -Files $archiveFiles
  New-DeterministicArchive -Destination $reproArchivePath -Files $archiveFiles

  $archiveHash = Get-Sha256Hex -FilePath $archivePath
  $reproHash = Get-Sha256Hex -FilePath $reproArchivePath
  if ($archiveHash -ne $reproHash) {
    throw "Reproducibility check failed: identical inputs produced different archive hashes."
  }

  & (Join-Path $PSScriptRoot "test-release-package.ps1") -ArchivePath $archivePath
  if ($LASTEXITCODE -ne 0) { throw "Release package smoke test failed." }

  [System.IO.File]::WriteAllText(
    $checksumPath,
    ("$archiveHash  $([System.IO.Path]::GetFileName($archivePath))" + [System.Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )
} finally {
  if (Test-Path -LiteralPath $reproArchivePath) {
    Remove-Item -LiteralPath $reproArchivePath -Force
  }
}

Write-Output "Release package created: $archivePath"
Write-Output "Reproducible SHA256: $archiveHash"
Write-Output "Checksum: $checksumPath"
Write-Output "SBOM: $sbomPath"
Write-Output "Third-party component inventory: $componentsPath"
