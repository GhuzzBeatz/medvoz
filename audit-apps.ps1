param(
  [switch]$CheckGitDiff
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$apps = Get-ChildItem -LiteralPath $root -Directory | Where-Object {
  (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json')) -or
  (Test-Path -LiteralPath (Join-Path $_.FullName 'main.js')) -or
  (Test-Path -LiteralPath (Join-Path $_.FullName 'electron\main.js'))
}

foreach ($appDir in $apps) {
  $mainCandidates = @('main.js', 'electron\main.js')
  $main = $mainCandidates | ForEach-Object { Join-Path $appDir.FullName $_ } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $main) { continue }

  $source = Get-Content -LiteralPath $main -Raw
  $packagePath = Join-Path $appDir.FullName 'package.json'
  $package = $null
  if (Test-Path -LiteralPath $packagePath) {
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  }

  $scanDirs = @('', 'pages', 'js', 'components', 'services', 'electron') |
    ForEach-Object { Join-Path $appDir.FullName $_ } |
    Where-Object { Test-Path -LiteralPath $_ }
  $htmlFiles = foreach ($dir in $scanDirs) {
    Get-ChildItem -LiteralPath $dir -File -Filter '*.html' -ErrorAction SilentlyContinue
  }
  $jsFiles = foreach ($dir in $scanDirs) {
    Get-ChildItem -LiteralPath $dir -File -Filter '*.js' -ErrorAction SilentlyContinue
  }
  $textSources = @($source)
  foreach ($file in @($htmlFiles) + @($jsFiles)) {
    try { $textSources += (Get-Content -LiteralPath $file.FullName -Raw) } catch {}
  }
  $allText = $textSources -join "`n"

  $single = $source -match 'requestSingleInstanceLock'
  $licenseFirst = $source -match 'licenca\.html'
  $mainGate = $source -match 'isSessionAuthorized|licenseSessionAuthorized|licenseGate|sessionAuthorized'
  $frameFalse = $source -match 'frame\s*:\s*false'
  $secureRenderer = $source -match 'contextIsolation\s*:\s*true' -and $source -match 'nodeIntegration\s*:\s*false'
  $sandbox = $source -match 'sandbox\s*:\s*true'
  $ghzSupport = $allText -match 'ghz-support'
  $ghzWindowBar = $allText -match 'ghz-window-bar|ghz-winbar'
  $updateSurface = $allText -match 'atualiza|update|download|manifest|baixar'
  $supportUrls = $allText -match 'wa\.me/5511948981459' -and $allText -match 'ghzplugin\.com\.br'
  $changedUrls = @()
  if ($CheckGitDiff -and (Test-Path -LiteralPath (Join-Path $appDir.FullName '.git'))) {
    $changedUrls = git -C $appDir.FullName diff HEAD -U0 | Select-String -Pattern '^[+-].*https?://'
  }
  $urlDiff = $changedUrls | Where-Object {
    $_.Line -notmatch 'https://wa\.me/5511948981459' -and
    $_.Line -notmatch 'https://ghzplugin\.com\.br["'']'
  }

  [pscustomobject]@{
    App = $appDir.Name
    Package = $package.name
    Version = $package.version
    ProductName = $package.build.productName
    SingleInstance = $single
    FrameFalse = $frameFalse
    SecureRenderer = $secureRenderer
    Sandbox = $sandbox
    LicenseFirst = $licenseFirst
    MainProcessGate = $mainGate
    GHZWindowBar = $ghzWindowBar
    GHZSupport = $ghzSupport
    OfficialSupportUrls = $supportUrls
    UpdateOrDownloadSurface = $updateSurface
    ProtectedUrlDiff = [bool]$urlDiff
  }
}
