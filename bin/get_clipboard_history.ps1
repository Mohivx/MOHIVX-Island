[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod
    } | Select-Object -First 1

    [Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime] > $null
    
    $isEnabled = [Windows.ApplicationModel.DataTransfer.Clipboard]::IsHistoryEnabled()
    Write-Host "HistoryEnabled: $isEnabled"
    
    if ($isEnabled) {
        $op = [Windows.ApplicationModel.DataTransfer.Clipboard]::GetHistoryItemsAsync()
        $task = $asTaskGeneric.MakeGenericMethod([Windows.ApplicationModel.DataTransfer.ClipboardHistoryItemsResult]).Invoke($null, @($op))
        $res = $task.GetAwaiter().GetResult()
        
        Write-Host "Status: $($res.Status)"
        Write-Host "Items count: $($res.Items.Count)"
        
        $outputList = @()
        foreach ($item in $res.Items) {
            if ($item.Content.Contains([Windows.ApplicationModel.DataTransfer.StandardDataFormats]::Text)) {
                $textOp = $item.Content.GetTextAsync()
                $textTask = $asTaskGeneric.MakeGenericMethod([string]).Invoke($null, @($textOp))
                $txt = $textTask.GetAwaiter().GetResult()
                $outputList += [PSCustomObject]@{
                    id = $item.Id
                    text = $txt
                    timestamp = $item.Timestamp.DateTime.ToString("o")
                }
            }
        }
        $outputList | ConvertTo-Json -Depth 5
    }
} catch {
    Write-Host "ERROR: $_"
}
