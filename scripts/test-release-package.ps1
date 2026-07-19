param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$artifactsRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "artifacts"))
$resolvedArchive = [System.IO.Path]::GetFullPath($ArchivePath)
$bundleEntryRoot = "codex-image-control"
$pluginEntryRoot = "$bundleEntryRoot/plugins/image-control"

if (-not $resolvedArchive.StartsWith($artifactsRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release archive must be inside the repository artifacts directory."
}
if (-not (Test-Path -LiteralPath $resolvedArchive -PathType Leaf)) {
  throw "Release archive does not exist: $resolvedArchive"
}
if ((Get-Item -LiteralPath $resolvedArchive).Length -gt 256MB) {
  throw "Release archive exceeds the 256 MB safety limit."
}

$systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $systemTemp ("image-control-release-check-" + [guid]::NewGuid().ToString("N"))))
if (-not $testRoot.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Could not establish a safe temporary extraction directory."
}
New-Item -ItemType Directory -Path $testRoot | Out-Null

$previousEntry = $env:IMAGE_CONTROL_MCP_ENTRY
$previousRoot = $env:IMAGE_CONTROL_MCP_ROOT

try {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedArchive)
  try {
    $entries = @($archive.Entries)
    if ($entries.Count -eq 0 -or $entries.Count -gt 5000) {
      throw "Release archive entry count is outside the accepted range."
    }

    $entryNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $allowedExactPaths = [System.Collections.Generic.HashSet[string]]::new(
      [string[]]@(
        "$bundleEntryRoot/.agents/plugins/marketplace.json",
        "$bundleEntryRoot/INSTALL.md",
        "$bundleEntryRoot/LICENSE",
        "$bundleEntryRoot/docs/CODEX_INSTALL_PROMPT.md",
        "$pluginEntryRoot/.mcp.json",
        "$pluginEntryRoot/app/LICENSE",
        "$pluginEntryRoot/app/NOTICE",
        "$pluginEntryRoot/LICENSE",
        "$pluginEntryRoot/MIGRATION.md",
        "$pluginEntryRoot/open-workbench.cmd",
        "$pluginEntryRoot/README.md",
        "$pluginEntryRoot/SBOM.cdx.json",
        "$pluginEntryRoot/SECURITY.md",
        "$pluginEntryRoot/docs/BACKUP_AND_RECOVERY.md",
        "$pluginEntryRoot/docs/PRIVACY_AND_DATA.md",
        "$pluginEntryRoot/docs/RELEASE_CHECKLIST.md",
        "$pluginEntryRoot/scripts/migrate-legacy-state.ps1",
        "$pluginEntryRoot/scripts/open-workbench.ps1",
        "$pluginEntryRoot/THIRD_PARTY_COMPONENTS.json",
        "$pluginEntryRoot/THIRD_PARTY_NOTICES.md"
      ),
      [System.StringComparer]::OrdinalIgnoreCase
    )
    $allowedPrefixes = @(
      "$pluginEntryRoot/.codex-plugin/",
      "$pluginEntryRoot/app/dist/",
      "$pluginEntryRoot/runtime/",
      "$pluginEntryRoot/skills/",
      "$pluginEntryRoot/templates/"
    )
    [int64]$totalLength = 0
    foreach ($entry in $entries) {
      $entryName = [string]$entry.FullName
      if (
        [string]::IsNullOrWhiteSpace($entryName) -or
        $entryName.Length -gt 512 -or
        $entryName.Contains("\") -or
        $entryName.Contains("//") -or
        $entryName.StartsWith("/") -or
        $entryName.StartsWith("//") -or
        $entryName.EndsWith("/") -or
        $entryName -match '^[A-Za-z]:' -or
        $entryName -match '[\x00-\x1F:*?"<>|]'
      ) {
        throw "Release archive contains an unsafe entry name."
      }
      $segments = @($entryName.Split("/"))
      if ($segments.Count -eq 0 -or $segments[0] -ne $bundleEntryRoot -or $segments -contains "." -or $segments -contains "..") {
        throw "Release archive contains path traversal or a path outside $bundleEntryRoot/."
      }
      foreach ($segment in $segments) {
        $deviceName = $segment.Split(".")[0]
        if ($segment.Length -gt 255 -or $segment.EndsWith(".") -or $segment.EndsWith(" ") -or
            $deviceName -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') {
          throw "Release archive contains a Windows-unsafe path segment."
        }
      }
      $allowed = $allowedExactPaths.Contains($entryName)
      foreach ($prefix in $allowedPrefixes) {
        if ($entryName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
          $allowed = $true
          break
        }
      }
      if (-not $allowed) {
        throw "Release archive contains a file outside the explicit runtime allowlist."
      }
      if (-not $entryNames.Add($entryName)) {
        throw "Release archive contains a duplicate or case-colliding path."
      }

      [int64]$rawAttributes = $entry.ExternalAttributes
      if ($rawAttributes -lt 0) { $rawAttributes += 4294967296 }
      $unixType = ($rawAttributes -shr 16) -band 0xF000
      $dosAttributes = $rawAttributes -band 0xFFFF
      if ($unixType -eq 0xA000 -or (($dosAttributes -band 0x400) -ne 0)) {
        throw "Release archive contains a symbolic link or reparse-point entry."
      }

      if ($entry.Length -gt 256MB) {
        throw "Release archive contains an oversized entry."
      }
      $totalLength += $entry.Length
      if ($totalLength -gt 1GB) {
        throw "Release archive exceeds the 1 GB expanded-size safety limit."
      }
      if ($entry.Length -gt 1MB -and $entry.CompressedLength -eq 0) {
        throw "Release archive contains a suspicious zero-length compressed entry."
      }
      if ($entry.CompressedLength -gt 0 -and ($entry.Length / $entry.CompressedLength) -gt 1000) {
        throw "Release archive contains a suspicious compression ratio."
      }

      if ($entryName -match '(^|/)(server|data/projects|data/local|\.runtime|\.codex_tmp|media)(/|$)' -or
          $entryName -match '(^|/)app/(src|node_modules)(/|$)' -or
          $entryName -match '(^|/)\.env(?:\.|$)') {
        throw "Release archive contains forbidden source, local-data, or credential paths."
      }
    }

    $required = @(
      "$bundleEntryRoot/.agents/plugins/marketplace.json",
      "$bundleEntryRoot/INSTALL.md",
      "$bundleEntryRoot/LICENSE",
      "$bundleEntryRoot/docs/CODEX_INSTALL_PROMPT.md",
      "$pluginEntryRoot/.codex-plugin/plugin.json",
      "$pluginEntryRoot/.mcp.json",
      "$pluginEntryRoot/app/LICENSE",
      "$pluginEntryRoot/app/NOTICE",
      "$pluginEntryRoot/app/dist/index.html",
      "$pluginEntryRoot/LICENSE",
      "$pluginEntryRoot/MIGRATION.md",
      "$pluginEntryRoot/README.md",
      "$pluginEntryRoot/runtime/index.js",
      "$pluginEntryRoot/SBOM.cdx.json",
      "$pluginEntryRoot/SECURITY.md",
      "$pluginEntryRoot/docs/BACKUP_AND_RECOVERY.md",
      "$pluginEntryRoot/docs/PRIVACY_AND_DATA.md",
      "$pluginEntryRoot/docs/RELEASE_CHECKLIST.md",
      "$pluginEntryRoot/scripts/migrate-legacy-state.ps1",
      "$pluginEntryRoot/scripts/open-workbench.ps1",
      "$pluginEntryRoot/THIRD_PARTY_COMPONENTS.json",
      "$pluginEntryRoot/THIRD_PARTY_NOTICES.md"
    )
    foreach ($requiredEntry in $required) {
      if (-not $entryNames.Contains($requiredEntry)) {
        throw "Release archive is missing: $requiredEntry"
      }
    }

    foreach ($entry in $entries) {
      if ([string]$entry.FullName -match '/$') { continue }
      $destination = [System.IO.Path]::GetFullPath((Join-Path $testRoot ([string]$entry.FullName).Replace("/", "\")))
      if (-not $destination.StartsWith($testRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Release extraction target escaped the temporary directory."
      }
      New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
      $inputStream = $entry.Open()
      $outputStream = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      try {
        $inputStream.CopyTo($outputStream)
      } finally {
        $outputStream.Dispose()
        $inputStream.Dispose()
      }
    }
  } finally {
    $archive.Dispose()
  }

  $bundleRoot = Join-Path $testRoot $bundleEntryRoot
  $pluginRoot = Join-Path $bundleRoot "plugins\image-control"
  $manifest = [System.IO.File]::ReadAllText((Join-Path $pluginRoot ".codex-plugin\plugin.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([string]$manifest.version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$') {
    throw "Extracted formal package contains a cache-busted or invalid version."
  }
  $marketplacePath = Join-Path $bundleRoot ".agents\plugins\marketplace.json"
  $marketplace = [System.IO.File]::ReadAllText($marketplacePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([string]$marketplace.name -ne "codex-image-control") {
    throw "Extracted marketplace has the wrong name."
  }
  $marketplacePlugins = @($marketplace.plugins)
  if ($marketplacePlugins.Count -ne 1 -or [string]$marketplacePlugins[0].name -ne "image-control") {
    throw "Extracted marketplace must expose exactly the image-control plugin."
  }
  if ([string]$marketplacePlugins[0].source.source -ne "local" -or [string]$marketplacePlugins[0].source.path -ne "./plugins/image-control") {
    throw "Extracted marketplace plugin source is not the standard relative plugin path."
  }
  $catalogPluginRoot = [System.IO.Path]::GetFullPath((Join-Path $bundleRoot ([string]$marketplacePlugins[0].source.path)))
  if (-not $catalogPluginRoot.Equals([System.IO.Path]::GetFullPath($pluginRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Extracted marketplace source does not resolve to the packaged plugin."
  }
  $installDocument = [System.IO.File]::ReadAllText((Join-Path $bundleRoot "INSTALL.md"), [System.Text.Encoding]::UTF8)
  foreach ($installCommand in @(
    "codex plugin marketplace add .",
    "codex plugin add image-control@codex-image-control",
    "docs/CODEX_INSTALL_PROMPT.md"
  )) {
    if (-not $installDocument.Contains($installCommand)) {
      throw "Packaged installation guide is missing a required Codex plugin command: $installCommand"
    }
  }
  $codexInstallPrompt = [System.IO.File]::ReadAllText((Join-Path $bundleRoot "docs\CODEX_INSTALL_PROMPT.md"), [System.Text.Encoding]::UTF8)
  foreach ($requiredPromptFragment in @(
    "Mahiruxia/codex-image-control --ref v$($manifest.version)",
    "codex plugin list --json",
    "codex plugin add image-control@codex-image-control",
    "npm install"
  )) {
    if (-not $codexInstallPrompt.Contains($requiredPromptFragment)) {
      throw "Packaged Codex installation prompt is incomplete: $requiredPromptFragment"
    }
  }

  $expectedName = "image-control-$($manifest.version)-windows-x64.zip"
  if ([System.IO.Path]::GetFileName($resolvedArchive) -ne $expectedName) {
    throw "Archive filename does not match its manifest version."
  }

  $sbom = [System.IO.File]::ReadAllText((Join-Path $pluginRoot "SBOM.cdx.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $components = [System.IO.File]::ReadAllText((Join-Path $pluginRoot "THIRD_PARTY_COMPONENTS.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ($sbom.bomFormat -ne "CycloneDX" -or [string]$sbom.metadata.component.version -ne [string]$manifest.version) {
    throw "SBOM metadata does not match the plugin manifest."
  }
  if ([string]$components.version -ne [string]$manifest.version -or @($components.components).Count -eq 0) {
    throw "Third-party component inventory is missing or inconsistent."
  }

  $offlineDocuments = @(
    "MIGRATION.md",
    "SECURITY.md",
    "docs\BACKUP_AND_RECOVERY.md",
    "docs\PRIVACY_AND_DATA.md",
    "docs\RELEASE_CHECKLIST.md"
  )
  foreach ($relativeDocument in $offlineDocuments) {
    $documentPath = Join-Path $pluginRoot $relativeDocument
    if ((Get-Item -LiteralPath $documentPath -Force).Length -lt 200 -or
        [string]::IsNullOrWhiteSpace([System.IO.File]::ReadAllText($documentPath, [System.Text.Encoding]::UTF8))) {
      throw "Offline maintenance documentation is empty or incomplete: $relativeDocument"
    }
  }
  $packagedReadme = [System.IO.File]::ReadAllText((Join-Path $pluginRoot "README.md"), [System.Text.Encoding]::UTF8)
  foreach ($offlineReference in @("INSTALL.md", "MIGRATION.md", "BACKUP_AND_RECOVERY.md", "PRIVACY_AND_DATA.md", "SECURITY.md", "RELEASE_CHECKLIST.md")) {
    if (-not $packagedReadme.Contains($offlineReference)) {
      throw "Packaged README does not link to offline maintenance documentation: $offlineReference"
    }
  }

  function Assert-PowerShellScriptSyntax {
    param(
      [Parameter(Mandatory = $true)]
      [string]$ScriptPath,
      [switch]$RequireUtf8Bom
    )

    if ($RequireUtf8Bom) {
      $bytes = [System.IO.File]::ReadAllBytes($ScriptPath)
      if ($bytes.Length -lt 3 -or $bytes[0] -ne 0xEF -or $bytes[1] -ne 0xBB -or $bytes[2] -ne 0xBF) {
        throw "Windows PowerShell launcher must retain its UTF-8 BOM: $ScriptPath"
      }
    }

    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count -gt 0) {
      throw "PowerShell syntax check failed for $ScriptPath`: $($parseErrors[0].Message)"
    }

    $previousParseTarget = $env:IMAGE_CONTROL_STATIC_PARSE_TARGET
    try {
      $env:IMAGE_CONTROL_STATIC_PARSE_TARGET = $ScriptPath
      $staticParser = @'
$ProgressPreference = "SilentlyContinue"
if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
  [Console]::Error.WriteLine("Expected Windows PowerShell 5.1 for compatibility validation.")
  exit 2
}
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($env:IMAGE_CONTROL_STATIC_PARSE_TARGET, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) {
  [Console]::Error.WriteLine($errors[0].Message)
  exit 1
}
'@
      $encodedParser = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($staticParser))
      & powershell.exe -NoProfile -NonInteractive -EncodedCommand $encodedParser
      if ($LASTEXITCODE -ne 0) { throw "Windows PowerShell 5.1 syntax check failed for: $ScriptPath" }
    } finally {
      $env:IMAGE_CONTROL_STATIC_PARSE_TARGET = $previousParseTarget
    }
  }

  $openWorkbenchScript = Join-Path $pluginRoot "scripts\open-workbench.ps1"
  $migrationScript = Join-Path $pluginRoot "scripts\migrate-legacy-state.ps1"
  Assert-PowerShellScriptSyntax -ScriptPath $openWorkbenchScript -RequireUtf8Bom
  Assert-PowerShellScriptSyntax -ScriptPath $migrationScript

  function Write-FixtureJson {
    param(
      [Parameter(Mandatory = $true)]
      [string]$FilePath,
      [Parameter(Mandatory = $true)]
      [object]$Value
    )

    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($FilePath)) | Out-Null
    [System.IO.File]::WriteAllText(
      $FilePath,
      (($Value | ConvertTo-Json -Depth 12) + [Environment]::NewLine),
      [System.Text.UTF8Encoding]::new($false)
    )
  }

  function Assert-MigrationFailure {
    param(
      [Parameter(Mandatory = $true)]
      [scriptblock]$Operation,
      [Parameter(Mandatory = $true)]
      [string]$Label,
      [Parameter(Mandatory = $true)]
      [string]$ExpectedMessage
    )

    $failed = $false
    $failureMessage = ""
    try { & $Operation | Out-Null } catch { $failed = $true; $failureMessage = $_.Exception.Message }
    if (-not $failed) { throw "Migration safety test unexpectedly succeeded: $Label" }
    if ($failureMessage -notmatch $ExpectedMessage) {
      throw "Migration safety test failed for the wrong reason ($Label): $failureMessage"
    }
  }

  $migrationFixture = Join-Path $testRoot "migration-fixture"
  $legacyRoot = Join-Path $migrationFixture "legacy"
  $projectsRoot = Join-Path $migrationFixture "projects"
  $stateRoot = Join-Path $migrationFixture "state"
  $profileRoot = Join-Path $legacyRoot "data\local\video-providers\fixture-provider"
  [System.IO.Directory]::CreateDirectory($profileRoot) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $legacyRoot "data\local\video-provider-setups\draft")) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $legacyRoot "data\local\backups\project-migrations\fixture-project")) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $projectsRoot "fixture-project")) | Out-Null
  Write-FixtureJson -FilePath (Join-Path $legacyRoot "data\local\video-providers\settings.json") -Value @{
    defaultProfileId = "fixture-provider"
  }
  Write-FixtureJson -FilePath (Join-Path $profileRoot "profile.json") -Value @{
    id = "fixture-provider"
    kind = "comfyui-workflow"
    comfyui = @{ workflowFile = "workflow.json" }
  }
  Write-FixtureJson -FilePath (Join-Path $profileRoot "workflow.json") -Value @{
    "1" = @{ class_type = "FixtureNode"; inputs = @{} }
  }
  Write-FixtureJson -FilePath (Join-Path $legacyRoot "data\local\video-provider-setups\draft\request.json") -Value @{
    status = "analyzing"
  }
  Write-FixtureJson -FilePath (Join-Path $legacyRoot "data\local\backups\project-migrations\fixture-project\schema-1.json") -Value @{
    id = "fixture-project"
  }
  Write-FixtureJson -FilePath (Join-Path $profileRoot "temporary.json") -Value @{
    excluded = $true
  }
  Write-FixtureJson -FilePath (Join-Path $projectsRoot "fixture-project\project.json") -Value @{
    id = "fixture-project"
    videoRequests = @()
  }

  & $migrationScript -LegacyRoot $legacyRoot -ProjectsRoot $projectsRoot -StateRoot $stateRoot -SkipEnvironment | Out-Null
  foreach ($relativePath in @(
    "video-providers\settings.json",
    "video-providers\fixture-provider\profile.json",
    "video-providers\fixture-provider\workflow.json"
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $stateRoot "data\local\$relativePath") -PathType Leaf)) {
      throw "Migration omitted an allowlisted provider file: $relativePath"
    }
  }
  foreach ($relativePath in @(
    "video-provider-setups",
    "backups",
    "video-providers\fixture-provider\temporary.json"
  )) {
    if (Test-Path -LiteralPath (Join-Path $stateRoot "data\local\$relativePath")) {
      throw "Migration copied an excluded local-state path: $relativePath"
    }
  }
  $migrationRecords = @(Get-ChildItem -LiteralPath (Join-Path $stateRoot "data\migration-records") -Directory -Force)
  if ($migrationRecords.Count -ne 1 -or
      -not (Test-Path -LiteralPath (Join-Path $migrationRecords[0].FullName "migration-record.json") -PathType Leaf) -or
      -not (Test-Path -LiteralPath (Join-Path $migrationRecords[0].FullName "rollback.ps1") -PathType Leaf)) {
    throw "Migration did not preserve a unique manifest and rollback script."
  }
  Assert-PowerShellScriptSyntax -ScriptPath (Join-Path $migrationRecords[0].FullName "rollback.ps1") -RequireUtf8Bom

  Assert-MigrationFailure -Label "existing target conflict" -ExpectedMessage "already exists" -Operation {
    & $migrationScript -LegacyRoot $legacyRoot -ProjectsRoot $projectsRoot -StateRoot $stateRoot -SkipEnvironment
  }
  & (Join-Path $migrationRecords[0].FullName "rollback.ps1") | Out-Null
  if ((Test-Path -LiteralPath (Join-Path $stateRoot "data\local")) -or
      -not (Test-Path -LiteralPath (Join-Path $migrationRecords[0].FullName "rolled-back-local") -PathType Container)) {
    throw "Migration rollback did not preserve and isolate the migrated local state."
  }
  Assert-MigrationFailure -Label "removed Merge switch" -ExpectedMessage "-Merge has been removed" -Operation {
    & $migrationScript -LegacyRoot $legacyRoot -ProjectsRoot $projectsRoot -StateRoot (Join-Path $migrationFixture "merge-state") -Merge -SkipEnvironment
  }

  $activeProjectsRoot = Join-Path $migrationFixture "active-projects"
  [System.IO.Directory]::CreateDirectory((Join-Path $activeProjectsRoot "active-project")) | Out-Null
  Write-FixtureJson -FilePath (Join-Path $activeProjectsRoot "active-project\project.json") -Value @{
    id = "active-project"
    videoRequests = @(@{ id = "active-request"; status = "queued" })
  }
  Assert-MigrationFailure -Label "active paid video request" -ExpectedMessage "active video request" -Operation {
    & $migrationScript -LegacyRoot $legacyRoot -ProjectsRoot $activeProjectsRoot -StateRoot (Join-Path $migrationFixture "active-state") -SkipEnvironment
  }

  $junctionTarget = Join-Path $migrationFixture "junction-target"
  $junctionPath = Join-Path $migrationFixture "junction-state"
  [System.IO.Directory]::CreateDirectory($junctionTarget) | Out-Null
  New-Item -ItemType Junction -Path $junctionPath -Target $junctionTarget | Out-Null
  Assert-MigrationFailure -Label "junction in StateRoot" -ExpectedMessage "reparse component" -Operation {
    & $migrationScript -LegacyRoot $legacyRoot -ProjectsRoot $projectsRoot -StateRoot (Join-Path $junctionPath "state") -SkipEnvironment
  }
  [System.IO.Directory]::Delete($junctionPath)

  Push-Location $repoRoot
  try {
    node scripts/scan-release.mjs --directory $bundleRoot --label release-archive
    if ($LASTEXITCODE -ne 0) { throw "Extracted release privacy scan failed." }
  } finally {
    Pop-Location
  }

  $env:IMAGE_CONTROL_MCP_ENTRY = Join-Path $pluginRoot "runtime\index.js"
  $env:IMAGE_CONTROL_MCP_ROOT = $pluginRoot
  $mcpTest = Join-Path $repoRoot "plugins\image-control\server\dist\mcp.test.js"
  node --test --test-force-exit --test-timeout=30000 $mcpTest
  if ($LASTEXITCODE -ne 0) { throw "Extracted release MCP smoke test failed." }

  Write-Output ("Release archive verified: {0} files, {1:N2} MB expanded" -f $entries.Count, ($totalLength / 1MB))
} finally {
  $env:IMAGE_CONTROL_MCP_ENTRY = $previousEntry
  $env:IMAGE_CONTROL_MCP_ROOT = $previousRoot
  if ($testRoot.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $testRoot)) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
