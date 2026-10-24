param(
    [string]$Action = "get",
    [double]$Volume = -1,
    [int]$Mute = -1,
    [string]$Device = ""
)

$CSharpSource = @'
using System;
using System.Runtime.InteropServices;

namespace MOHIVXAudio {
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, System.Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, System.Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, System.Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
        int GetMute(out bool pbMute);
        int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        int VolumeStepUp(System.Guid pguidEventContext);
        int VolumeStepDown(System.Guid pguidEventContext);
        int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref System.Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
        int RegisterEndpointNotificationCallback(IntPtr pClient);
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    [Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPolicyConfig {
        int GetMixFormat(string pszDeviceName, IntPtr ppFormat);
        int GetDeviceFormat(string pszDeviceName, int bDefault, IntPtr ppFormat);
        int ResetDeviceFormat(string pszDeviceName);
        int SetDeviceFormat(string pszDeviceName, IntPtr pEndpointFormat, IntPtr pMixFormat);
        int GetProcessingPeriod(string pszDeviceName, int bDefault, IntPtr pmftDefaultPeriod, IntPtr pmftMinimumPeriod);
        int SetProcessingPeriod(string pszDeviceName, IntPtr pmftPeriod);
        int GetShareMode(string pszDeviceName, IntPtr pMode);
        int SetShareMode(string pszDeviceName, IntPtr pMode);
        int GetPropertyValue(string pszDeviceName, IntPtr key, IntPtr pv);
        int SetPropertyValue(string pszDeviceName, IntPtr key, IntPtr pv);
        [PreserveSig] int SetDefaultEndpoint(string pszDeviceName, int role);
        int SetEndpointVisibility(string pszDeviceName, int bVisible);
    }

    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    public class PolicyConfigClient { }

    public class CoreAudioHelper {
        private static IAudioEndpointVolume GetMasterVolumeObject() {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice dev = null;
            int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev); // 0 = eRender, 1 = eMultimedia
            if (hr != 0 || dev == null) return null;
            var iid = typeof(IAudioEndpointVolume).GUID;
            object epvObj = null;
            dev.Activate(ref iid, 23, IntPtr.Zero, out epvObj);
            return (IAudioEndpointVolume)epvObj;
        }

        public static float GetMasterVolume() {
            var epv = GetMasterVolumeObject();
            if (epv == null) return 0f;
            float level = 0f;
            epv.GetMasterVolumeLevelScalar(out level);
            return (float)Math.Round(level * 100f);
        }

        public static bool SetMasterVolume(float level) {
            var epv = GetMasterVolumeObject();
            if (epv == null) return false;
            float scalar = Math.Max(0f, Math.Min(100f, level)) / 100f;
            int hr = epv.SetMasterVolumeLevelScalar(scalar, System.Guid.Empty);
            return hr == 0;
        }

        public static bool GetMute() {
            var epv = GetMasterVolumeObject();
            if (epv == null) return false;
            bool mute = false;
            epv.GetMute(out mute);
            return mute;
        }

        public static bool SetMute(bool mute) {
            var epv = GetMasterVolumeObject();
            if (epv == null) return false;
            int hr = epv.SetMute(mute, System.Guid.Empty);
            return hr == 0;
        }

        public static string GetDefaultDeviceId() {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                if (dev == null) return "";
                string id = "";
                dev.GetId(out id);
                return id ?? "";
            } catch {
                return "";
            }
        }

        public static bool SetDefaultDevice(string devId) {
            try {
                var policyConfig = (IPolicyConfig)(new PolicyConfigClient());
                int consoleResult = policyConfig.SetDefaultEndpoint(devId, 0);
                int mediaResult = policyConfig.SetDefaultEndpoint(devId, 1);
                int communicationsResult = policyConfig.SetDefaultEndpoint(devId, 2);
                return consoleResult == 0 && mediaResult == 0 && communicationsResult == 0;
            } catch {
                return false;
            }
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $CSharpSource -Language CSharp -ErrorAction SilentlyContinue
} catch {}

if ($Action -eq "get") {
    $vol = [MOHIVXAudio.CoreAudioHelper]::GetMasterVolume()
    $mute = [MOHIVXAudio.CoreAudioHelper]::GetMute()
    $defId = [MOHIVXAudio.CoreAudioHelper]::GetDefaultDeviceId()
    
    # Enumerate devices
    $renderDevices = @()
    try {
        $pnpDevs = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like "SWD\MMDEVAPI\{0.0.0.00000000}*" }
        foreach ($d in $pnpDevs) {
            $isDef = ($defId -ne "") -and ($d.InstanceId -like "*$defId*")
            $renderDevices += [PSCustomObject]@{
                name = $d.FriendlyName
                id = ($d.InstanceId -replace '^SWD\\MMDEVAPI\\', '')
                isDefault = $isDef
            }
        }
    } catch {}

    [PSCustomObject]@{
        volume = [int]$vol
        isMuted = $mute
        defaultDeviceId = $defId
        devices = $renderDevices
    } | ConvertTo-Json -Compress
    exit 0
}

if ($Action -eq "set-volume") {
    if ($Volume -ge 0) {
        $ok = [MOHIVXAudio.CoreAudioHelper]::SetMasterVolume([float]$Volume)
        [PSCustomObject]@{ success = $ok; volume = [int]$Volume } | ConvertTo-Json -Compress
    }
    exit 0
}

if ($Action -eq "set-mute") {
    $m = ($Mute -eq 1)
    $ok = [MOHIVXAudio.CoreAudioHelper]::SetMute($m)
    [PSCustomObject]@{ success = $ok; isMuted = $m } | ConvertTo-Json -Compress
    exit 0
}

if ($Action -eq "set-device") {
    if ($Device) {
        $ok = [MOHIVXAudio.CoreAudioHelper]::SetDefaultDevice($Device)
        [PSCustomObject]@{ success = $ok; device = $Device } | ConvertTo-Json -Compress
        if (-not $ok) { exit 1 }
    }
    exit 0
}
