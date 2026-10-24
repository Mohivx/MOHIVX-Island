$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$scripts = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'electron') -Filter '*.ps1') + @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'bin') -Filter '*.ps1')
foreach ($script in $scripts) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw ($errors | Out-String) }
}
$helper = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'electron\companion_shortcuts.ps1')
$compileOnly = $helper.Replace('[CompanionKeys]::Run()', '')
& ([scriptblock]::Create($compileOnly))
'Windows scripts parsed; modifier-shortcut C# compiled without running hooks.'
