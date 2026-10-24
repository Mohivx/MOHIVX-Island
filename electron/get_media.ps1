param(
    [ValidateSet('get', 'play-pause', 'next', 'prev', 'seek')][string]$Action = 'get',
    [double]$SeekSec = 0
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    function Await-WinRT($operation, [Type]$resultType) {
        $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
        if (-not $task.Wait(10000)) { throw 'Windows media operation timed out.' }
        return $task.Result
    }
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
    $manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $session = $manager.GetCurrentSession()
    # Prefer an actively playing session over a stale paused browser/player.
    if (-not $session -or $session.GetPlaybackInfo().PlaybackStatus.ToString() -ne 'Playing') {
        foreach ($candidate in $manager.GetSessions()) {
            if ($candidate.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { $session = $candidate; break }
        }
    }
    if (-not $session) { Write-Output 'NO_MEDIA'; exit 0 }

    if ($Action -ne 'get') {
        $operation = switch ($Action) {
            'play-pause' { $session.TryTogglePlayPauseAsync() }
            'next' { $session.TrySkipNextAsync() }
            'prev' { $session.TrySkipPreviousAsync() }
            'seek' { $session.TryChangePlaybackPositionAsync([long]([Math]::Max(0, $SeekSec) * [TimeSpan]::TicksPerSecond)) }
        }
        if (-not (Await-WinRT $operation ([bool]))) { throw 'The media player did not accept the control request.' }
        Write-Output 'CONTROL_OK'
        exit 0
    }
    $properties = Await-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $playback = $session.GetPlaybackInfo()
    $timeline = $session.GetTimelineProperties()
    $status = if ($playback) { $playback.PlaybackStatus.ToString() } else { 'Unknown' }
    $title = $properties.Title
    $artist = $properties.Artist
    $position = [Math]::Max(0, [Math]::Floor($timeline.Position.TotalSeconds))
    $duration = [Math]::Max(0, [Math]::Floor($timeline.EndTime.TotalSeconds))
    $artwork = ''
    $stream = $null
    $reader = $null
    try {
        if ($properties.Thumbnail) {
            $stream = Await-WinRT ($properties.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime])
            $mime = $stream.ContentType
            if ($stream.Size -gt 0 -and $stream.Size -le 262144 -and $mime -match '^image/(jpeg|png|webp)$') {
                $reader = [Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]::new($stream.GetInputStreamAt(0))
                $loaded = Await-WinRT ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
                $bytes = New-Object byte[] $loaded
                $reader.ReadBytes($bytes)
                $artwork = 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes)
            }
        }
    } catch { $artwork = '' } finally { if ($reader) { $reader.Dispose() }; if ($stream) { $stream.Dispose() } }
    @{title=$title;artist=$artist;isPlaying=($status -eq 'Playing');position=$position;duration=$duration;artwork=$artwork;sourceApp=$session.SourceAppUserModelId} | ConvertTo-Json -Compress -Depth 3
} catch {
    if ($Action -eq 'get') { Write-Output 'NO_MEDIA' }
    else { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
}
