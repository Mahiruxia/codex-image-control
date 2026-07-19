[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$LegacyRoot,

  [Parameter(Mandatory = $true)]
  [string]$ProjectsRoot,

  [string]$StateRoot,

  # Kept only so old commands fail with a useful explanation instead of
  # silently falling back to PowerShell's unknown-parameter handling.
  [switch]$Merge,

  [switch]$SkipEnvironment
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathValue
  )

  if ([string]::IsNullOrWhiteSpace($PathValue)) { throw "A required path is empty." }
  $expanded = [Environment]::ExpandEnvironmentVariables($PathValue.Trim())
  if ($expanded -match '[\x00-\x1F]') { throw "Paths containing control characters are not supported." }
  if (-not [System.IO.Path]::IsPathRooted($expanded)) { throw "Migration paths must be absolute: $expanded" }
  $fullPath = [System.IO.Path]::GetFullPath($expanded)
  $pathRoot = [System.IO.Path]::GetPathRoot($fullPath)
  if ($fullPath.Length -gt $pathRoot.Length) { $fullPath = $fullPath.TrimEnd("\", "/") }
  # Expand legacy 8.3 aliases on the nearest existing ancestor before doing
  # overlap comparisons. GetFullPath alone keeps names such as PROGRA~1.
  $missingSegments = [System.Collections.Generic.Stack[string]]::new()
  $existingPath = $fullPath
  while (-not (Test-Path -LiteralPath $existingPath)) {
    $leaf = [System.IO.Path]::GetFileName($existingPath)
    if ([string]::IsNullOrEmpty($leaf)) { break }
    $missingSegments.Push($leaf)
    $parent = [System.IO.Directory]::GetParent($existingPath)
    if (-not $parent) { break }
    $existingPath = $parent.FullName
  }
  if (Test-Path -LiteralPath $existingPath) {
    $fullPath = (Get-Item -LiteralPath $existingPath -Force).FullName
    while ($missingSegments.Count -gt 0) { $fullPath = Join-Path $fullPath $missingSegments.Pop() }
    $fullPath = [System.IO.Path]::GetFullPath($fullPath)
  }
  $pathRoot = [System.IO.Path]::GetPathRoot($fullPath)
  if ($fullPath.Length -gt $pathRoot.Length) { $fullPath = $fullPath.TrimEnd("\", "/") }
  return $fullPath
}

function Test-SamePath {
  param([string]$Left, [string]$Right)
  return $Left.Equals($Right, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-SameOrInside {
  param([string]$Candidate, [string]$Root)
  if (Test-SamePath $Candidate $Root) { return $true }
  $prefix = $Root.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
  return $Candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-PathsOverlap {
  param([string]$Left, [string]$Right)
  return (Test-SameOrInside $Left $Right) -or (Test-SameOrInside $Right $Left)
}

function Get-FileSha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  # Use the CLR implementation directly. Get-FileHash normally exists on
  # Windows PowerShell 5.1, but it can disappear when module auto-loading is
  # restricted by the host running an offline migration.
  $stream = [System.IO.File]::OpenRead($FilePath)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      return -join ($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") })
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-NoReparseComponents {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FullPath,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $cursor = $FullPath
  while ($cursor -and -not (Test-Path -LiteralPath $cursor)) {
    $parent = [System.IO.Directory]::GetParent($cursor)
    $cursor = if ($parent) { $parent.FullName } else { $null }
  }
  if (-not $cursor) { throw "$Label has no existing filesystem ancestor: $FullPath" }

  while ($cursor) {
    $item = Get-Item -LiteralPath $cursor -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Label contains a symbolic link, junction, mount point, or other reparse component: $($item.FullName)"
    }
    if (-not $item.PSIsContainer) {
      throw "$Label passes through a file instead of a directory: $($item.FullName)"
    }
    $parent = [System.IO.Directory]::GetParent($item.FullName)
    $cursor = if ($parent) { $parent.FullName } else { $null }
  }
}

function Assert-SafeManagedRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FullPath,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if ($FullPath.StartsWith("\\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label must be on a local filesystem, not a UNC or shared path: $FullPath"
  }
  $volumeRoot = Resolve-FullPath ([System.IO.Path]::GetPathRoot($FullPath))
  if (Test-SamePath $FullPath $volumeRoot) { throw "$Label cannot be a drive root: $FullPath" }
  try { $drive = [System.IO.DriveInfo]::new($volumeRoot) } catch { throw "$Label drive could not be validated safely: $FullPath" }
  if ($drive.DriveType -eq [System.IO.DriveType]::Network) {
    throw "$Label must not use a mapped network or shared drive: $FullPath"
  }

  $broadRoots = @(
    [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile),
    [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData),
    [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData),
    [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop),
    [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { Resolve-FullPath $_ }
  foreach ($broadRoot in $broadRoots) {
    if (Test-SamePath $FullPath $broadRoot) { throw "$Label is too broad and cannot be a user or system folder: $FullPath" }
  }

  $normalized = $FullPath.Replace("/", "\")
  if ($normalized -match '(?i)\\\.(?:codex|agents)\\plugins(?:\\|$)') {
    throw "$Label cannot be inside a Codex plugin directory or cache: $FullPath"
  }
  Assert-NoReparseComponents -FullPath $FullPath -Label $Label
}

function Assert-NoReparseTree {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Root)) { return }
  Assert-NoReparseComponents -FullPath $Root -Label $Label
  $pending = [System.Collections.Generic.Stack[string]]::new()
  $pending.Push($Root)
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
      if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$Label contains a symbolic link, junction, mount point, or other reparse entry: $($entry.FullName)"
      }
      if ($entry.PSIsContainer) { $pending.Push($entry.FullName) }
    }
  }
}

function Get-FilesNoReparse {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $files = [System.Collections.Generic.List[object]]::new()
  if (-not (Test-Path -LiteralPath $Root)) { return [object[]]$files.ToArray() }
  $pending = [System.Collections.Generic.Stack[string]]::new()
  $pending.Push($Root)
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
      if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$Label contains a symbolic link, junction, mount point, or other reparse entry: $($entry.FullName)"
      }
      if ($entry.PSIsContainer) { $pending.Push($entry.FullName) } else { $files.Add($entry) }
    }
  }
  return [object[]]$files.ToArray()
}

function Get-RelativeChildPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string]$Child
  )

  $prefix = $Root.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
  if (-not $Child.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escaped the migration source: $Child"
  }
  return $Child.Substring($prefix.Length).Replace("\", "/")
}

function Read-JsonFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [long]$MaximumBytes = 2MB
  )

  $item = Get-Item -LiteralPath $FilePath -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$Label must be a regular file: $FilePath"
  }
  if ($item.Length -gt $MaximumBytes) { throw "$Label exceeds the migration size limit: $FilePath" }
  try {
    return [System.IO.File]::ReadAllText($item.FullName, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  } catch {
    throw "$Label is not valid JSON: $FilePath"
  }
}

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Content,
    [switch]$WithBom
  )

  [System.IO.File]::WriteAllText($FilePath, $Content, [System.Text.UTF8Encoding]::new([bool]$WithBom))
}

function ConvertTo-PowerShellLiteral {
  param([AllowNull()][string]$Value)
  if ($null -eq $Value) { return '$null' }
  return "'" + $Value.Replace("'", "''") + "'"
}

if ($Merge) {
  throw "-Merge has been removed because recursive overwrite is unsafe. Migrate only into a new target state directory and resolve profile conflicts explicitly in the app."
}

$repoRoot = Resolve-FullPath (Join-Path $PSScriptRoot "..")
$legacyRootPath = Resolve-FullPath $LegacyRoot
if (-not (Test-Path -LiteralPath $legacyRootPath -PathType Container)) {
  throw "Legacy project root does not exist: $legacyRootPath"
}
Assert-NoReparseComponents -FullPath $legacyRootPath -Label "LegacyRoot"
if (Test-PathsOverlap $legacyRootPath $repoRoot) {
  throw "LegacyRoot must be different from the current source repository: $legacyRootPath"
}

if (-not $StateRoot) {
  $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if (-not $localAppData) { $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile) }
  $StateRoot = Join-Path $localAppData "CodexImageControl"
}
$stateRootPath = Resolve-FullPath $StateRoot
$projectsRootPath = Resolve-FullPath $ProjectsRoot
Assert-SafeManagedRoot -FullPath $stateRootPath -Label "StateRoot"
Assert-SafeManagedRoot -FullPath $projectsRootPath -Label "ProjectsRoot"

if (-not (Test-Path -LiteralPath $projectsRootPath -PathType Container)) {
  throw "ProjectsRoot must already exist so a typo cannot create a second, empty project library: $projectsRootPath"
}
foreach ($comparison in @(
  @{ Label = "StateRoot and LegacyRoot"; Left = $stateRootPath; Right = $legacyRootPath },
  @{ Label = "StateRoot and the current source repository"; Left = $stateRootPath; Right = $repoRoot },
  @{ Label = "ProjectsRoot and LegacyRoot"; Left = $projectsRootPath; Right = $legacyRootPath },
  @{ Label = "ProjectsRoot and the current source repository"; Left = $projectsRootPath; Right = $repoRoot }
)) {
  if (Test-PathsOverlap $comparison.Left $comparison.Right) {
    throw "$($comparison.Label) must be separate, non-overlapping directories."
  }
}

$defaultProjectsRoot = Resolve-FullPath (Join-Path $stateRootPath "data\projects")
if (-not (Test-SamePath $projectsRootPath $defaultProjectsRoot) -and (Test-PathsOverlap $stateRootPath $projectsRootPath)) {
  throw "ProjectsRoot and StateRoot may overlap only when ProjectsRoot is exactly StateRoot\data\projects."
}
$privateStateRoot = Resolve-FullPath (Join-Path $stateRootPath "data\local")
$runtimeRoot = Resolve-FullPath (Join-Path $stateRootPath ".runtime")
if ((Test-PathsOverlap $projectsRootPath $privateStateRoot) -or (Test-PathsOverlap $projectsRootPath $runtimeRoot)) {
  throw "ProjectsRoot cannot overlap private connector state or runtime queues."
}

# Project queue records live in project.json, not only in .runtime. Refuse the
# migration unless every project is quiescent, so the new worker cannot resume a
# paid request merely because it inherited the same project directory.
$activeStatuses = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($status in @("queued", "uploading", "submitting", "running", "downloading", "waiting_remote")) {
  $activeStatuses.Add($status) | Out-Null
}
$terminalStatuses = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($status in @("completed", "failed", "cancelled")) { $terminalStatuses.Add($status) | Out-Null }
$activeRequests = [System.Collections.Generic.List[string]]::new()
foreach ($entry in Get-ChildItem -LiteralPath $projectsRootPath -Force) {
  if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "ProjectsRoot contains a direct symbolic link or junction and cannot be audited safely: $($entry.FullName)"
  }
  if (-not $entry.PSIsContainer) { continue }
  $projectFile = Join-Path $entry.FullName "project.json"
  if (-not (Test-Path -LiteralPath $projectFile -PathType Leaf)) { continue }
  $project = Read-JsonFile -FilePath $projectFile -Label "Project record" -MaximumBytes 32MB
  foreach ($request in @($project.videoRequests)) {
    if ($null -eq $request -or $request -is [string] -or $request -is [ValueType]) {
      throw "Project videoRequests contains a malformed record and cannot be audited safely: $projectFile"
    }
    $status = [string]$request.status
    if ([string]::IsNullOrWhiteSpace($status) -or (-not $activeStatuses.Contains($status) -and -not $terminalStatuses.Contains($status))) {
      throw "Project videoRequests contains an unknown status and cannot be audited safely: $projectFile"
    }
    if ($activeStatuses.Contains($status)) {
      $requestId = if ($request.id) { [string]$request.id } else { "unknown-request" }
      $activeRequests.Add("$($entry.Name)/$requestId ($status)")
    }
  }
}
if ($activeRequests.Count -gt 0) {
  $sample = ($activeRequests | Select-Object -First 8) -join ", "
  throw "ProjectsRoot contains $($activeRequests.Count) active video request(s). Finish or cancel them in the old version before migration. Examples: $sample"
}

$sourceLocal = Resolve-FullPath (Join-Path $legacyRootPath "data\local")
$targetLocal = $privateStateRoot
$existingTarget = Get-Item -LiteralPath $targetLocal -Force -ErrorAction SilentlyContinue
if ($null -ne $existingTarget) {
  throw "Target local state already exists. Recursive merge and overwrite are not supported: $targetLocal"
}

$allowlistedFiles = [System.Collections.Generic.List[object]]::new()
$allowlistedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
function Add-AllowlistedFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [Parameter(Mandatory = $true)]
    [string]$RelativePath,
    [long]$MaximumBytes
  )

  $item = Get-Item -LiteralPath $SourcePath -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Allowlisted migration input must be a regular file: $SourcePath"
  }
  if ($item.Length -gt $MaximumBytes) { throw "Allowlisted migration input is unexpectedly large: $SourcePath" }
  $portablePath = $RelativePath.Replace("\", "/")
  if (-not $allowlistedPaths.Add($portablePath)) { throw "Duplicate migration path: $portablePath" }
  $allowlistedFiles.Add([pscustomobject]@{
    SourcePath = $item.FullName
    RelativePath = $portablePath
    Length = [int64]$item.Length
    Sha256 = Get-FileSha256Hex -FilePath $item.FullName
  })
}

$settings = $null
$includedProfileIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$sourceLocalItem = Get-Item -LiteralPath $sourceLocal -Force -ErrorAction SilentlyContinue
if ($sourceLocalItem -and (-not $sourceLocalItem.PSIsContainer -or ($sourceLocalItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
  throw "Legacy data/local must be a regular directory: $sourceLocal"
}
if ($sourceLocalItem) {
  Assert-NoReparseTree -Root $sourceLocal -Label "Legacy data/local"
  $sourceProviders = Join-Path $sourceLocal "video-providers"
  $sourceProvidersItem = Get-Item -LiteralPath $sourceProviders -Force -ErrorAction SilentlyContinue
  if ($sourceProvidersItem -and -not $sourceProvidersItem.PSIsContainer) {
    throw "Legacy video-providers path must be a directory: $sourceProviders"
  }
  if ($sourceProvidersItem) {
    $settingsPath = Join-Path $sourceProviders "settings.json"
    $settingsItem = Get-Item -LiteralPath $settingsPath -Force -ErrorAction SilentlyContinue
    if ($settingsItem -and $settingsItem.PSIsContainer) {
      throw "Video provider settings path must be a regular file: $settingsPath"
    }
    if ($settingsItem) {
      $settings = Read-JsonFile -FilePath $settingsPath -Label "Video provider settings"
      if ($null -eq $settings -or $settings -is [System.Array] -or $settings -is [string]) {
        throw "Video provider settings must contain a JSON object: $settingsPath"
      }
      Add-AllowlistedFile -SourcePath $settingsPath -RelativePath "video-providers/settings.json" -MaximumBytes 2MB
    }

    foreach ($providerEntry in Get-ChildItem -LiteralPath $sourceProviders -Directory -Force) {
      if ($providerEntry.Name -cnotmatch '^[a-z0-9][a-z0-9_-]{1,63}$') { continue }
      $profilePath = Join-Path $providerEntry.FullName "profile.json"
      if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) { continue }
      $profile = Read-JsonFile -FilePath $profilePath -Label "Video provider profile"
      if ($null -eq $profile -or $profile -is [System.Array] -or $profile -is [string]) {
        throw "Video provider profile must contain a JSON object: $profilePath"
      }
      if ([string]$profile.id -cne $providerEntry.Name) {
        throw "Video provider profile ID does not match its directory: $profilePath"
      }
      if ([string]$profile.kind -cnotin @("generic-http", "comfyui-workflow")) {
        throw "Video provider profile kind is unsupported: $profilePath"
      }
      Add-AllowlistedFile -SourcePath $profilePath -RelativePath "video-providers/$($providerEntry.Name)/profile.json" -MaximumBytes 2MB
      $includedProfileIds.Add($providerEntry.Name) | Out-Null

      if ([string]$profile.kind -eq "comfyui-workflow") {
        $workflowFile = [string]$profile.comfyui.workflowFile
        if ([string]::IsNullOrWhiteSpace($workflowFile) -or
            [System.IO.Path]::GetFileName($workflowFile) -cne $workflowFile -or
            $workflowFile.Equals("profile.json", [System.StringComparison]::OrdinalIgnoreCase)) {
          throw "ComfyUI profile contains an unsafe workflow filename: $profilePath"
        }
        $workflowPath = Join-Path $providerEntry.FullName $workflowFile
        if (-not (Test-Path -LiteralPath $workflowPath -PathType Leaf)) {
          throw "ComfyUI profile is missing its workflow file: $workflowPath"
        }
        $workflow = Read-JsonFile -FilePath $workflowPath -Label "ComfyUI workflow" -MaximumBytes 64MB
        if ($null -eq $workflow -or $workflow -is [string]) {
          throw "ComfyUI workflow must contain a JSON object or array: $workflowPath"
        }
        Add-AllowlistedFile -SourcePath $workflowPath -RelativePath "video-providers/$($providerEntry.Name)/$workflowFile" -MaximumBytes 64MB
      }
    }
  }
}

if ($settings -and $settings.defaultProfileId) {
  $defaultProfileId = [string]$settings.defaultProfileId
  if ($defaultProfileId -cnotmatch '^[a-z0-9][a-z0-9_-]{1,63}$' -or -not $includedProfileIds.Contains($defaultProfileId)) {
    throw "Video provider settings reference a profile that was not eligible for migration: $defaultProfileId"
  }
}

$sourceFiles = @(Get-FilesNoReparse -Root $sourceLocal -Label "Legacy data/local")
$excludedPaths = [System.Collections.Generic.List[string]]::new()
foreach ($sourceFile in $sourceFiles) {
  $relativePath = Get-RelativeChildPath -Root $sourceLocal -Child $sourceFile.FullName
  if (-not $allowlistedPaths.Contains($relativePath)) { $excludedPaths.Add($relativePath) }
}

$migrationId = "{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), ([guid]::NewGuid().ToString("N").Substring(0, 12))
$dataRoot = Resolve-FullPath (Join-Path $stateRootPath "data")
Assert-NoReparseComponents -FullPath $dataRoot -Label "State data directory"
[System.IO.Directory]::CreateDirectory($dataRoot) | Out-Null
Assert-NoReparseComponents -FullPath $dataRoot -Label "State data directory"
$stagingRoot = Resolve-FullPath (Join-Path $dataRoot ".local-migration-$migrationId")
$recordsRoot = Resolve-FullPath (Join-Path $dataRoot "migration-records")
$recordRoot = Resolve-FullPath (Join-Path $recordsRoot $migrationId)
Assert-NoReparseComponents -FullPath $stagingRoot -Label "Migration staging directory"
Assert-NoReparseComponents -FullPath $recordRoot -Label "Migration record directory"
[System.IO.Directory]::CreateDirectory($stagingRoot) | Out-Null
[System.IO.Directory]::CreateDirectory($recordRoot) | Out-Null
Assert-NoReparseComponents -FullPath $stagingRoot -Label "Migration staging directory"
Assert-NoReparseComponents -FullPath $recordRoot -Label "Migration record directory"

$installedTarget = $false
$oldStateEnvironment = [Environment]::GetEnvironmentVariable("IMAGE_CONTROL_STATE_ROOT", "User")
$oldProjectsEnvironment = [Environment]::GetEnvironmentVariable("IMAGE_CONTROL_PROJECTS_ROOT", "User")
$failedCopyPath = Join-Path $recordRoot "failed-local"

try {
  foreach ($file in $allowlistedFiles) {
    $destination = Resolve-FullPath (Join-Path $stagingRoot $file.RelativePath.Replace("/", "\"))
    if (-not (Test-SameOrInside $destination $stagingRoot) -or (Test-SamePath $destination $stagingRoot)) {
      throw "Migration destination escaped staging: $destination"
    }
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destination)) | Out-Null
    [System.IO.File]::Copy([string]$file.SourcePath, $destination, $false)
    $copied = Get-Item -LiteralPath $destination -Force
    $copiedHash = Get-FileSha256Hex -FilePath $destination
    if ($copied.Length -ne $file.Length -or $copiedHash -ne $file.Sha256) {
      throw "Migration verification failed: $($file.RelativePath)"
    }
  }

  $stagedFiles = @(Get-FilesNoReparse -Root $stagingRoot -Label "Migration staging directory")
  if ($stagedFiles.Count -ne $allowlistedFiles.Count) {
    throw "Migration staging contains an unexpected file count."
  }

  $rollbackScriptPath = Join-Path $recordRoot "rollback.ps1"
  $oldStateLiteral = ConvertTo-PowerShellLiteral $oldStateEnvironment
  $oldProjectsLiteral = ConvertTo-PowerShellLiteral $oldProjectsEnvironment
  $newStateLiteral = ConvertTo-PowerShellLiteral $stateRootPath
  $newProjectsLiteral = ConvertTo-PowerShellLiteral $projectsRootPath
  $targetLiteral = ConvertTo-PowerShellLiteral $targetLocal
  $rollbackTargetLiteral = ConvertTo-PowerShellLiteral (Join-Path $recordRoot "rolled-back-local")
  $skipEnvironmentLiteral = if ($SkipEnvironment) { '$true' } else { '$false' }
  $rollbackScript = @"
`$ErrorActionPreference = "Stop"
`$targetLocal = $targetLiteral
`$preservedLocal = $rollbackTargetLiteral
`$skipEnvironment = $skipEnvironmentLiteral
function Assert-NoReparsePath([string]`$pathValue) {
  `$cursor = [System.IO.Path]::GetFullPath(`$pathValue)
  while (`$cursor -and -not (Test-Path -LiteralPath `$cursor)) {
    `$parent = [System.IO.Directory]::GetParent(`$cursor)
    `$cursor = if (`$parent) { `$parent.FullName } else { `$null }
  }
  while (`$cursor) {
    `$item = Get-Item -LiteralPath `$cursor -Force
    if ((`$item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing to roll back through a symbolic link, junction, mount point, or other reparse component: `$(`$item.FullName)"
    }
    `$parent = [System.IO.Directory]::GetParent(`$item.FullName)
    `$cursor = if (`$parent) { `$parent.FullName } else { `$null }
  }
}
if (-not `$skipEnvironment) {
  `$expectedState = $newStateLiteral
  `$expectedProjects = $newProjectsLiteral
  `$currentState = [Environment]::GetEnvironmentVariable("IMAGE_CONTROL_STATE_ROOT", "User")
  `$currentProjects = [Environment]::GetEnvironmentVariable("IMAGE_CONTROL_PROJECTS_ROOT", "User")
  if (`$currentState -ne `$expectedState -or `$currentProjects -ne `$expectedProjects) {
    throw "Environment variables changed after migration; review them manually instead of overwriting newer values."
  }
}
Assert-NoReparsePath `$targetLocal
Assert-NoReparsePath `$preservedLocal
if (Get-Item -LiteralPath `$preservedLocal -Force -ErrorAction SilentlyContinue) {
  throw "Rollback preservation path already exists: `$preservedLocal"
}
if (Test-Path -LiteralPath `$targetLocal) {
  `$targetItem = Get-Item -LiteralPath `$targetLocal -Force
  if (-not `$targetItem.PSIsContainer) { throw "Rollback target is not a directory." }
  [System.IO.Directory]::Move(`$targetLocal, `$preservedLocal)
}
if (-not `$skipEnvironment) {
  [Environment]::SetEnvironmentVariable("IMAGE_CONTROL_STATE_ROOT", $oldStateLiteral, "User")
  [Environment]::SetEnvironmentVariable("IMAGE_CONTROL_PROJECTS_ROOT", $oldProjectsLiteral, "User")
}
Write-Output "Rollback complete. Migrated local state was preserved at: `$preservedLocal"
"@
  # Windows PowerShell 5.1 needs the BOM to decode non-ASCII paths embedded in
  # the generated rollback script correctly.
  Write-Utf8File -FilePath $rollbackScriptPath -Content $rollbackScript -WithBom

  $record = [ordered]@{
    version = 1
    migrationId = $migrationId
    createdAt = [DateTimeOffset]::Now.ToString("o")
    legacyRoot = $legacyRootPath
    stateRoot = $stateRootPath
    projectsRoot = $projectsRootPath
    targetLocal = $targetLocal
    environmentUpdateRequested = -not [bool]$SkipEnvironment
    previousEnvironment = [ordered]@{
      IMAGE_CONTROL_STATE_ROOT = $oldStateEnvironment
      IMAGE_CONTROL_PROJECTS_ROOT = $oldProjectsEnvironment
    }
    files = @($allowlistedFiles | Sort-Object RelativePath | ForEach-Object {
      [ordered]@{ path = $_.RelativePath; length = $_.Length; sha256 = $_.Sha256 }
    })
    excludedPaths = @($excludedPaths | Sort-Object)
    rollbackScript = $rollbackScriptPath
  }
  Write-Utf8File -FilePath (Join-Path $recordRoot "migration-record.json") -Content (($record | ConvertTo-Json -Depth 8) + [Environment]::NewLine)

  # The staging and final directories share a parent, making this rename the
  # only point at which migrated state becomes visible to the application.
  [System.IO.Directory]::Move($stagingRoot, $targetLocal)
  $installedTarget = $true

  if (-not $SkipEnvironment) {
    $currentStateEnvironment = [Environment]::GetEnvironmentVariable("IMAGE_CONTROL_STATE_ROOT", "User")
    $currentProjectsEnvironment = [Environment]::GetEnvironmentVariable("IMAGE_CONTROL_PROJECTS_ROOT", "User")
    if ($currentStateEnvironment -ne $oldStateEnvironment -or $currentProjectsEnvironment -ne $oldProjectsEnvironment) {
      if (-not (Test-Path -LiteralPath $failedCopyPath)) {
        [System.IO.Directory]::Move($targetLocal, $failedCopyPath)
        $installedTarget = $false
      }
      throw "User environment variables changed during migration. No environment values were overwritten; migrated files were preserved for review."
    }
    try {
      # Environment mutation deliberately happens only after copy, JSON checks,
      # SHA-256 verification, record creation, and the atomic directory switch.
      [Environment]::SetEnvironmentVariable("IMAGE_CONTROL_STATE_ROOT", $stateRootPath, "User")
      [Environment]::SetEnvironmentVariable("IMAGE_CONTROL_PROJECTS_ROOT", $projectsRootPath, "User")
    } catch {
      [Environment]::SetEnvironmentVariable("IMAGE_CONTROL_STATE_ROOT", $oldStateEnvironment, "User")
      [Environment]::SetEnvironmentVariable("IMAGE_CONTROL_PROJECTS_ROOT", $oldProjectsEnvironment, "User")
      if ($installedTarget -and (Test-Path -LiteralPath $targetLocal) -and -not (Test-Path -LiteralPath $failedCopyPath)) {
        [System.IO.Directory]::Move($targetLocal, $failedCopyPath)
        $installedTarget = $false
      }
      throw
    }
  }
} catch {
  if (-not $installedTarget -and (Test-Path -LiteralPath $stagingRoot)) {
    $preservedStaging = Join-Path $recordRoot "failed-staging"
    if (-not (Test-Path -LiteralPath $preservedStaging)) {
      [System.IO.Directory]::Move($stagingRoot, $preservedStaging)
    }
  }
  throw
}

Write-Output "Legacy connector state migrated through a verified atomic switch."
Write-Output "State root: $stateRootPath"
Write-Output "Projects root (reused, not copied): $projectsRootPath"
Write-Output "Allowlisted provider files copied: $($allowlistedFiles.Count)"
Write-Output "Excluded local-state files: $($excludedPaths.Count)"
Write-Output "Migration record and rollback script: $recordRoot"
Write-Output "Setup requests, project-migration backups, runtime queues, temporary files, and media were not copied."
if (-not $SkipEnvironment) {
  Write-Output "User environment variables were updated after verification. Restart Codex before testing the new plugin."
} else {
  Write-Output "User environment variables were not changed because -SkipEnvironment was supplied."
}
