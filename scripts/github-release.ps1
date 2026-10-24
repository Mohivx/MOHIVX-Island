param([switch]$UploadDraft)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Only stable versions can be published from this project.' }
$remote = (& git remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $remote -notmatch 'github\.com[:/]Mohivx/MOHIVX-Island(?:\.git)?$') { throw 'Check the GitHub destination before uploading.' }
$tracked = @(& git ls-files)
$forbidden = @($tracked | Where-Object { $_ -match '(^experiments/|\.env($|\.)|\.(jks|keystore|pfx|pem|key)$|(^|/)(hook-link|credentials|app-settings)\.json$|(^|/)local\.properties$)' })
if ($forbidden.Count) { throw ('Private or Preview files are tracked: ' + ($forbidden -join ', ')) }
$releaseRoot = Join-Path $projectRoot 'release'
$assets = @(Join-Path $releaseRoot "MOHIVX Island $version.exe"; Join-Path $releaseRoot "MOHIVX Island Setup $version.exe")
$androidConfig = Get-Content -LiteralPath (Join-Path $projectRoot 'android/app/build.gradle') -Raw
$androidVersion = [regex]::Match($androidConfig, 'versionName\s+"([^"]+)"').Groups[1].Value
if (-not $androidVersion) { throw 'Android version is missing.' }
$assets += Join-Path $releaseRoot "MOHIVX Island $androidVersion.apk"
foreach ($asset in $assets) { if (-not (Test-Path -LiteralPath $asset -PathType Leaf)) { throw "Missing release file: $asset" } }
$assets | ForEach-Object { Get-FileHash -LiteralPath $_ -Algorithm SHA256 } | Format-Table -AutoSize
$changes = @(& git status --porcelain --untracked-files=all)
Write-Output "Destination: $remote | Tag: v$version | Uncommitted entries: $($changes.Count)"
if (-not $UploadDraft) { Write-Output 'Preflight only. No files, commits, tags or releases were uploaded.'; return }
if ($changes.Count) { throw 'Review and commit the stable source changes before uploading.' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI and sign in once with gh auth login.' }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Sign in to the intended GitHub account first.' }
$tag = "v$version"
& git rev-parse --verify --quiet "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) { throw 'This version already has a local tag. Review it before retrying.' }
& git tag -a $tag -m "MOHIVX Island $version"
if ($LASTEXITCODE -ne 0) { throw 'Could not create the version tag.' }
$branch = (& git branch --show-current).Trim()
& git push origin $branch $tag
if ($LASTEXITCODE -ne 0) { throw 'Push failed. The local version tag was retained for review.' }
$notes = Join-Path $projectRoot 'RELEASE_NOTES.md'
& gh release create $tag @assets --repo Mohivx/MOHIVX-Island --verify-tag --draft --title "MOHIVX Island $version" --notes-file $notes
if ($LASTEXITCODE -ne 0) { throw 'Release upload failed. The source and tag remain on GitHub; check before retrying.' }
