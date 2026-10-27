# MOHIVX Island phone parity plan

## Goal

Bring the useful TwinDesk phone workflows into the existing MOHIVX Island desktop app and Android companion. TwinDesk is a behavior and reliability reference only; no application code is copied. Device traffic stays direct and local, with no cloud relay or external pairing service. Preserve certificate-pinned pairing, encrypted messages, per-device capabilities, and explicit Android consent.

## Stages

1. **Phone notifications and quick replies** — mirror Android notifications in the phone panel and island feed; expose only notification actions that support free-text replies. Revalidate that a notification and its reply action are still current before sending.
2. **Messages and calls**:
   - **Stage 2A (SMS conversations and sending)** — real SMS conversation thread list, opening conversations with paginated messages, and composing/sending text SMS from the PC through Android's native `Telephony.Sms` provider and `SmsManager`, gated by a separate per-device `phoneMessages` capability and explicit opt-in Android permissions (`READ_SMS`, `SEND_SMS`) without changing the default SMS app.
   - **Stage 2B (Contacts and calls)** — opt-in contact name resolution (`contacts.resolve`), call history (`calls.list`), and user-confirmed dialing via `Intent.ACTION_DIAL` (`calls.dial`), gated by independent `phoneContacts` and `phoneCalls` capabilities and explicit Android runtime permissions (`READ_CONTACTS`, `READ_CALL_LOG`) without default dialer replacement or answering/rejecting calls.
3. **Phone desk** — bidirectional file transfer and folder operations, share-sheet handoff, clipboard, and phone media controls with metadata and working previous/play/pause/next/seek. Stage 3A adds PC-to-phone file transfer; Stage 3B adds phone media session metadata and playback controls. Folder creation, share-sheet handoff, and clipboard remain.
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
  - **Scope boundary**: This slice is text SMS only. MMS attachments remain out of scope, and SMS stays independent of contact and call permissions.
- **Stage 2B (implemented / منفّذة)**: Opt-in contact-name resolution (`contacts.resolve` via `ContactsContract.PhoneLookup`), paginated call history (`calls.list` via `CallLog.Calls`), and user-confirmed dialing (`calls.dial` via `Intent.ACTION_DIAL`).
  - **Independent capabilities and explicit Android opt-in / صلاحيات مستقلة وموافقة صريحة في أندرويد**: `phoneContacts` (PC) + `READ_CONTACTS` (Android) gates `contacts.resolve`; `phoneCalls` (PC) + `READ_CALL_LOG` (Android) gates `calls.list`, while `phoneCalls` gates `calls.dial`. Android runtime permissions are requested only when the user explicitly taps the corresponding button in the Android Phone page. Call log queries do not read `CACHED_NAME`, so contact names are never exposed without both `phoneContacts` and `READ_CONTACTS`.
  - **Restricted `READ_CALL_LOG` limitation / قيد صلاحية `READ_CALL_LOG` المقيّدة**: Android marks `READ_CALL_LOG` as a hard-restricted permission that may be blocked for manually sideloaded APKs on Android 13+ unless restricted settings are enabled in Android App Info. When `READ_CALL_LOG` is denied (`callsRead: false`), both the Android app and PC UI report the actual permission state while keeping `ACTION_DIAL` dialer handoff available.
  - **Dialing and call control scope / حدود نطاق الاتصال والتحكم بالمكالمات**: Dialing uses `Intent.ACTION_DIAL` only so the user confirms placing the call in the Android dialer (or taps a notification when the companion is in the background). MOHIVX does not request `CALL_PHONE`, does not become the default dialer, and does not answer, reject, or end calls. SMS remains unchanged.
  - **الملخص بالعربية**: تضيف المرحلة 2B إظهار أسماء جهات الاتصال اختياريًا (`contacts.resolve`)، وسجل المكالمات (`calls.list`)، وفتح الرقم في لوحة اتصال أندرويد عبر `ACTION_DIAL` (`calls.dial`) لتأكيد المكالمة من الهاتف، بصلاحيتين مستقلتين (`phoneContacts` و`phoneCalls`) ودون استبدال تطبيق الهاتف الافتراضي أو الرد على المكالمات أو رفضها، مع إبقاء رسائل SMS دون تغيير.
- **Stage 3A (implemented; ready for user testing / منفّذة وجاهزة لتجربة المستخدم)**: PC-to-phone file uploads from the MOHIVX Files panel to the Android shared folder, in bounded authenticated chunks with progress, abort cleanup, and an independent per-device `phoneFilesWrite` permission. Android requests persistent read/write access when the user chooses a shared folder. Re-select an older read-only folder once to grant write access. The phone-to-PC download path remains available under `phoneData`.
  - **Scope still open**: This does not complete the Phone Desk stage: creating/renaming folders, Android share-sheet handoff, and clipboard sync are not implemented yet.
- **Stage 3B (implemented; ready for user testing / منفّذة وجاهزة لتجربة المستخدم)**: Android reports the active media session (app, title, artist, album, playback state, duration, position, and supported actions). The PC Phone panel can issue play/pause, previous/next, and seek commands through Android's active `MediaController`. A separate per-device `phoneMedia` permission gates both metadata visibility and commands. Android notification access is required so Android can enumerate media sessions; no audio is streamed in this stage.
  - **Scope still open**: Folder creation/renaming, Android share-sheet handoff, clipboard sync, direct phone audio to PC, and actual device-level playback verification remain.
