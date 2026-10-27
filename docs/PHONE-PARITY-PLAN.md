# MOHIVX Island phone parity plan

## Goal

Bring the useful TwinDesk phone workflows into the existing MOHIVX Island desktop app and Android companion. TwinDesk is a behavior and reliability reference only; no application code is copied. Device traffic stays direct and local, with no cloud relay or external pairing service. Preserve certificate-pinned pairing, encrypted messages, per-device capabilities, and explicit Android consent.

## Stages

1. **Phone notifications and quick replies** — mirror Android notifications in the phone panel and island feed; expose only notification actions that support free-text replies. Revalidate that a notification and its reply action are still current before sending.
2. **Messages and calls**:
   - **Stage 2A (SMS conversations and sending)** — real SMS conversation thread list, opening conversations with paginated messages, and composing/sending text SMS from the PC through Android's native `Telephony.Sms` provider and `SmsManager`, gated by a separate per-device `phoneMessages` capability and explicit opt-in Android permissions (`READ_SMS`, `SEND_SMS`) without changing the default SMS app.
   - **Stage 2B (Contacts and calls)** — optional contact name resolution, call history/state, and call actions where Android permits them without requiring default dialer replacement.
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
- Android permissions, Play Protect, and APK signing/install behavior must be predictable; never request broad access for an unrelated feature or pretend hard-restricted permissions are granted when the installer blocks them.
- All service operations must stop or reject promptly when a phone disconnects or a capability is revoked.

## Current stage status

- **Stage 1 (implemented)**: End-to-end notification quick replies through Android notification actions that accept free text (`notifications.reply`), gated by `phoneData` and Android notification listener access.
- **Stage 2A (implemented)**: Real text SMS conversation list (`messages.threads`), conversation message history (`messages.list`), and composing/sending SMS from the PC (`messages.send`), gated by the separate `phoneMessages` desktop permission and explicit Android `READ_SMS`/`SEND_SMS` opt-in.
  - **Android permission and APK install limitation**: Android marks `READ_SMS` and `SEND_SMS` as hard-restricted permissions. When the companion APK is sideloaded/installed manually rather than through a session that allows restricted settings, Android 13+ and Play Protect / package installer policies may block granting `READ_SMS` and `SEND_SMS` unless the user explicitly enables restricted settings for the app in Android App Info (or may block them completely depending on the device/installer). Both the Android companion and PC UI report the real `messagesRead`/`messagesSend` state honestly, disable unavailable actions, and keep notification quick replies working independently.
  - **Scope boundary**: This slice is text SMS only. MMS attachments, contact lookup, call history, and placing/answering calls are not implemented yet and remain in Stage 2B+.
