param(
    [ValidateSet('status', 'request-access', 'get-notifications')][string]$Action = 'status'
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

try {
    # Resolve WinRT types and WindowsRuntime extension helpers
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications.Management, ContentType=WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.UserNotification, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

    function Await-WinRT($operation, [Type]$resultType) {
        $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
        if (-not $task.Wait(12000)) { throw 'Windows notification operation timed out.' }
        return $task.Result
    }

    $listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current

    if ($Action -eq 'status') {
        $status = $listener.GetAccessStatus().ToString()
        $result = @{
            success = $true
            supported = $true
            accessStatus = $status
            allowed = ($status -eq 'Allowed')
        }
        Write-Output (ConvertTo-Json -Compress $result)
        exit 0
    }

    if ($Action -eq 'request-access') {
        $op = $listener.RequestAccessAsync()
        $status = Await-WinRT $op ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
        $statusStr = $status.ToString()
        $result = @{
            success = $true
            supported = $true
            accessStatus = $statusStr
            allowed = ($statusStr -eq 'Allowed')
        }
        Write-Output (ConvertTo-Json -Compress $result)
        exit 0
    }

    if ($Action -eq 'get-notifications') {
        $status = $listener.GetAccessStatus().ToString()
        if ($status -ne 'Allowed') {
            $result = @{
                success = $true
                allowed = $false
                accessStatus = $status
                notifications = @()
            }
            Write-Output (ConvertTo-Json -Compress $result)
            exit 0
        }

        # Query Toast notifications
        $toastKind = [Windows.UI.Notifications.NotificationKinds]::Toast
        $op = $listener.GetNotificationsAsync($toastKind)
        $listType = [System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]]
        $notifications = Await-WinRT $op $listType

        $items = @()
        if ($notifications) {
            foreach ($notif in ($notifications | Sort-Object CreationTime -Descending | Select-Object -First 200)) {
                try {
                    $id = $notif.Id
                    $creationTime = $notif.CreationTime.ToString('o')
                    $appName = ''
                    try {
                        if ($notif.AppInfo -and $notif.AppInfo.DisplayInfo) {
                            $appName = $notif.AppInfo.DisplayInfo.DisplayName
                        }
                    } catch {}

                    $title = ''
                    $body = ''
                    try {
                        $binding = $notif.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
                        if ($binding) {
                            $textElements = $binding.GetTextElements()
                            $idx = 0
                            foreach ($el in $textElements) {
                                if ($idx -eq 0) { $title = $el.Text }
                                elseif ($idx -eq 1) { $body = $el.Text }
                                else { $body = $body + "`n" + $el.Text }
                                $idx++
                            }
                        }
                    } catch {}

                    # Limit text lengths for privacy and sanitization
                    if ($title -and $title.Length -gt 250) { $title = $title.Substring(0, 250) }
                    if ($body -and $body.Length -gt 1000) { $body = $body.Substring(0, 1000) }

                    $items += @{
                        id = $id
                        app = $appName
                        title = $title
                        body = $body
                        createdAt = $creationTime
                    }
                } catch {}
            }
        }

        $result = @{
            success = $true
            allowed = $true
            accessStatus = 'Allowed'
            notifications = $items
        }
        Write-Output (ConvertTo-Json -Compress $result)
        exit 0
    }
} catch {
    $err = @{
        success = $false
        supported = $false
        error = $_.Exception.Message
    }
    Write-Output (ConvertTo-Json -Compress $err)
    exit 0
}
