[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
# Fast system telemetry collector for MOHIVX Island
try {
    # 1. Active Network Route & Adapter
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    $adapter = $null
    $isWifi = $false
    $netType = "unknown"
    $adapterName = ""
    $linkSpeed = ""
    $rxBytes = 0
    $txBytes = 0

    if ($route) {
        $adapter = Get-NetAdapter -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue
        if ($adapter) {
            $adapterName = $adapter.Name.Trim()
            $linkSpeed = $adapter.LinkSpeed
            $isWifi = ($adapter.MediaType -like "*802.11*") -or ($adapter.PhysicalMediaType -like "*Native 802.11*")
            $netType = if ($isWifi) { "wifi" } else { "ethernet" }
        }
    }

    # Wi-Fi details if active
    $wifiSsid = ""
    $wifiSignal = ""
    if ($isWifi) {
        $wlanOut = netsh wlan show interfaces
        if ($wlanOut) {
            $mSsid = [regex]::Match($wlanOut, '^\s*SSID\s*:\s*(.+)$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
            if ($mSsid.Success) { $wifiSsid = $mSsid.Groups[1].Value.Trim() }
            $mSig = [regex]::Match($wlanOut, '^\s*Signal\s*:\s*(.+)$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
            if ($mSig.Success) { $wifiSignal = $mSig.Groups[1].Value.Trim() }
        }
    }

    # Network Adapter Statistics for live throughput
    try {
        $stats = Get-NetAdapterStatistics -Name $adapterName -ErrorAction SilentlyContinue
        if ($stats) {
            $rxBytes = $stats.ReceivedBytes
            $txBytes = $stats.SentBytes
        }
    } catch {}

    # 2. Bluetooth Adapter & Connected Devices
    $btAdapter = ""
    $btDevices = @()
    try {
        $bth = Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue
        foreach ($d in $bth) {
            if ($d.InstanceId -like "*USB\VID_*" -or $d.FriendlyName -like "*Adapter*") {
                $btAdapter = $d.FriendlyName
            } elseif ($d.InstanceId -like "*DEV_*" -and $d.FriendlyName -notlike "*Transport*" -and $d.FriendlyName -notlike "*Service*" -and $d.FriendlyName -notlike "*Profile*") {
                if (-not ($btDevices -contains $d.FriendlyName)) {
                    $btDevices += $d.FriendlyName
                }
            }
        }
    } catch {}

    # 3. Disk C:
    $diskC = Get-PSDrive C -ErrorAction SilentlyContinue
    $diskUsedGB = 0
    $diskTotalGB = 0
    if ($diskC) {
        $diskUsedGB = [math]::Round($diskC.Used / 1GB, 1)
        $diskTotalGB = [math]::Round(($diskC.Used + $diskC.Free) / 1GB, 1)
    }

    [PSCustomObject]@{
        processes = @(Get-Process -ErrorAction SilentlyContinue).Count
        network = [PSCustomObject]@{
            type = $netType
            adapterName = $adapterName
            linkSpeed = $linkSpeed
            isWifi = $isWifi
            wifiSsid = $wifiSsid
            wifiSignal = $wifiSignal
            rxBytes = $rxBytes
            txBytes = $txBytes
        }
        bluetooth = [PSCustomObject]@{
            adapter = $btAdapter
            connectedDevices = $btDevices
            hasDevices = ($btDevices.Count -gt 0)
        }
        disk = [PSCustomObject]@{
            usedGB = $diskUsedGB
            totalGB = $diskTotalGB
            text = "$diskUsedGB / $diskTotalGB GB"
        }
    } | ConvertTo-Json -Compress
} catch {
    [PSCustomObject]@{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
