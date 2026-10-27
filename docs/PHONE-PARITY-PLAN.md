# MOHIVX Island phone parity plan

## Goal

Bring the useful TwinDesk phone workflows into the existing MOHIVX Island desktop app and Android companion. TwinDesk is a behavior and reliability reference only; no application code is copied. Device traffic stays direct and local, with no cloud relay or external pairing service. Preserve certificate-pinned pairing, encrypted messages, per-device capabilities, and explicit Android consent.

## Stages

1. **Phone notifications and quick replies** — mirror Android notifications in the phone panel and island feed; expose only notification actions that support free-text replies. Keep SMS alerts clearly labeled as alerts, not conversation history. Revalidate that a notification and its reply action are still current before sending.
2. **Messages and calls** — real SMS/MMS threads and replies, call/contact/history actions where Android permits them, with narrowly scoped permissions and a clear consent step.
3. **Phone desk** — bidirectional file transfer and folder operations, share-sheet handoff, clipboard, and phone media controls with metadata and working previous/play/pause/next/seek.
4. **Screen, apps, and multiple phones** — reliable screen control and Arabic/other keyboard layouts, remote app windows, camera/microphone routes, phone-as-display workflows, and independently placed devices.
5. **Direct transports and reliability** — local Wi-Fi plus USB/Bluetooth options where the OS exposes a supported direct link; pairing/reconnect behavior, permissions lifecycle, multi-device limits, and regression coverage.

A stage is ready for user testing only after its focused build and regression checks pass. Version and release numbering remain unchanged until an actual release is requested.

## TwinDesk pitfalls tracked for MOHIVX

- Remote keyboard language switching and non-Latin text must work; test Arabic input explicitly.
- Fast cursor movement must not trigger accidental device switching; use edge dwell and hysteresis.
- Multi-display layouts must not steal the primary display or make pointer targets overlap.
- Screen controls need an obvious, stable entry point and must report the actual sharing state.
- Phone screen/file streams must not starve low-latency control input.
- Android permissions and APK signing/install behavior must be predictable; never request broad access for an unrelated feature.
- All service operations must stop or reject promptly when a phone disconnects or a capability is revoked.

## Current stage status

Stage 1 adds end-to-end quick reply through Android notification actions that accept free text. It does not yet provide full SMS/MMS history or calls; those are Stage 2. The notification list continues to use the existing phone content capability and Android notification access.
