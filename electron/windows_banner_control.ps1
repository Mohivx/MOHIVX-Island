<#
.SYNOPSIS
    Windows 11 Do Not Disturb automation helper using UI Automation TogglePattern.
    Designed for PowerShell 5.1+.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('read', 'on', 'off')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'

function Write-OutputJson([hashtable]$obj) {
    $json = $obj | ConvertTo-Json -Compress
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::WriteLine($json)
}

function Exit-WithError([string]$code, [string]$message) {
    Write-OutputJson @{
        success = $false
        code    = $code
        error   = $message
    }
    exit 0
}

# Ensure UI Automation assemblies
try {
    Add-Type -AssemblyName "UIAutomationClient" -ErrorAction Stop
    Add-Type -AssemblyName "UIAutomationTypes" -ErrorAction Stop
} catch {
    Exit-WithError 'unsupported' 'UI Automation assemblies could not be loaded.'
}

# Normalization helper for labels: strips bidi control characters, normalizes whitespace and casing
function Normalize-Text([string]$text) {
    if ([string]::IsNullOrEmpty($text)) { return '' }
    # Remove unicode bidi control characters: \u200E, \u200F, \u202A-\u202E, \u2066-\u2069
    $clean = [regex]::Replace($text, "[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]", "")
    $clean = [regex]::Replace($clean, "\s+", " ").Trim()
    return $clean
}

function Find-SettingsWindowElement() {
    $processes = Get-Process -Name "SystemSettings" -ErrorAction SilentlyContinue
    if (-not $processes) {
        return $null
    }

    $root = [System.Windows.Automation.AutomationElement]::RootElement
    if ($null -eq $root) { return $null }

    # Find direct desktop children only (TreeScope::Children)
    $childCondition = [System.Windows.Automation.Condition]::TrueCondition
    $children = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $childCondition)
    if ($null -eq $children) { return $null }

    $pids = @($processes | ForEach-Object { $_.Id })
    foreach ($child in $children) {
        try {
            $childPid = $child.Current.ProcessId
            if ($pids -contains $childPid) {
                return $child
            }
        } catch {
            # Window might have closed or changed; continue
        }
    }
    return $null
}

function Get-DndControl($windowElement) {
    if ($null -eq $windowElement) { return $null }

    # Find toggle-enabled controls within the SystemSettings window only
    $togglePatternAvailCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::IsTogglePatternAvailableProperty,
        $true
    )

    $toggleControls = $windowElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $togglePatternAvailCond)
    if ($null -eq $toggleControls -or $toggleControls.Count -eq 0) {
        return @{ Status = 'None'; Control = $null }
    }

    $matched = New-Object System.Collections.ArrayList

    foreach ($ctl in $toggleControls) {
        try {
            if (-not $ctl.Current.IsEnabled) {
                continue
            }

            $rawName = $ctl.Current.Name
            $normName = Normalize-Text $rawName
            $lowerNorm = $normName.ToLowerInvariant()

            # Disallow any "automatically" / "تلقائي" automatic rules toggle
            if ($lowerNorm.Contains("automatically") -or $lowerNorm.Contains("automatic") -or $normName.Contains("تلقائي") -or $normName.Contains("تلقائياً")) {
                continue
            }

            # Exact normalized English 'do not disturb' or Arabic 'عدم الإزعاج'
            $isEnglishExact = ($lowerNorm -eq "do not disturb")
            $isArabicExact = ($normName -eq "عدم الإزعاج" -or $normName -eq "عدم الازعاج")

            if ($isEnglishExact -or $isArabicExact) {
                [void]$matched.Add($ctl)
            }
        } catch {
            # Element may have become invalid
        }
    }

    if ($matched.Count -eq 1) {
        return @{ Status = 'Single'; Control = $matched[0] }
    } elseif ($matched.Count -gt 1) {
        return @{ Status = 'Ambiguous'; Control = $null }
    } else {
        return @{ Status = 'None'; Control = $null }
    }
}

function Get-ToggleStateString($ctl) {
    try {
        $patternObj = $null
        if ($ctl.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$patternObj)) {
            $togglePattern = [System.Windows.Automation.TogglePattern]$patternObj
            $state = $togglePattern.Current.ToggleState
            if ($state -eq [System.Windows.Automation.ToggleState]::On) {
                return 'On'
            } elseif ($state -eq [System.Windows.Automation.ToggleState]::Off) {
                return 'Off'
            }
        }
    } catch {
        return $null
    }
    return $null
}

# Discovery with retry up to 12s
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$dndControl = $null
$lastStatus = 'None'

while ($stopwatch.ElapsedMilliseconds -lt 12000) {
    $win = Find-SettingsWindowElement
    if ($null -ne $win) {
        $res = Get-DndControl $win
        $lastStatus = $res.Status
        if ($res.Status -eq 'Single') {
            $dndControl = $res.Control
            break
        } elseif ($res.Status -eq 'Ambiguous') {
            Exit-WithError 'ambiguous-control' 'Multiple matching Do Not Disturb controls found.'
        }
    }
    Start-Sleep -Milliseconds 300
}

if ($null -eq $dndControl) {
    if ($lastStatus -eq 'Ambiguous') {
        Exit-WithError 'ambiguous-control' 'Multiple matching Do Not Disturb controls found.'
    }
    Exit-WithError 'control-unavailable' 'Do Not Disturb toggle control could not be located in Settings.'
}

# Read initial state
$initialState = Get-ToggleStateString $dndControl
if ($null -eq $initialState) {
    Exit-WithError 'control-unavailable' 'Unable to read toggle state of Do Not Disturb control.'
}

if ($Action -eq 'read') {
    Write-OutputJson @{
        success = $true
        state   = $initialState
        before  = $initialState
        changed = $false
    }
    exit 0
}

$desiredState = if ($Action -eq 'on') { 'On' } else { 'Off' }

if ($initialState -eq $desiredState) {
    Write-OutputJson @{
        success = $true
        state   = $initialState
        before  = $initialState
        changed = $false
    }
    exit 0
}

# Perform exactly one Toggle
try {
    $patternObj = $null
    if (-not $dndControl.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$patternObj)) {
        Exit-WithError 'control-unavailable' 'TogglePattern is not available on control.'
    }
    $togglePattern = [System.Windows.Automation.TogglePattern]$patternObj
    $togglePattern.Toggle()
} catch {
    Exit-WithError 'control-unavailable' 'Failed to execute toggle action.'
}

# Re-read and verify for up to 2 seconds
$verifyWatch = [System.Diagnostics.Stopwatch]::StartNew()
$verifiedState = $null
while ($verifyWatch.ElapsedMilliseconds -lt 2000) {
    Start-Sleep -Milliseconds 150
    $curState = Get-ToggleStateString $dndControl
    if ($curState -eq $desiredState) {
        $verifiedState = $curState
        break
    }
}

if ($verifiedState -eq $desiredState) {
    Write-OutputJson @{
        success = $true
        state   = $verifiedState
        before  = $initialState
        changed = $true
    }
    exit 0
} else {
    Exit-WithError 'unverified' 'Toggle was invoked but desired state could not be verified.'
}
