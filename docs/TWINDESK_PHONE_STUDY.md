# TwinDesk phone research for MOHIVX Island

## Purpose / الهدف

Use TwinDesk as a source of product and architecture ideas for improving the existing **Phone** area in MOHIVX Island. This is a design study, not a code port. Do not copy source, assets, visual text, or protocol details. Implement features with MOHIVX's own code and existing direct, encrypted pairing. No cloud relay, rendezvous service, or separate app.

استخدم TwinDesk لفهم أفكار المنتج والبنية فقط، ثم حسّن قسم **الهاتف** الموجود في MOHIVX Island. هذه مراجعة تصميم وليست نقلًا للكود. لا تنسخ الشيفرة أو الأصول أو نصوص الواجهة أو البروتوكول. نفّذ الميزات بشيفرة MOHIVX الحالية وبالاقتران المباشر المشفّر، من دون خدمة سحابية أو وسيط أو تطبيق منفصل.

## What TwinDesk demonstrates / ما توضحه TwinDesk

- Each paired device has its own identity and state; the computer can switch among phones without confusing their permissions or active sessions.
- Its multi-device design treats placement as a persistent device map. A drag is an explicit layout edit, and edge routing is derived from the saved arrangement. MOHIVX now has a draggable, locally persisted multi-phone map; the remaining gap is routing real pointer movement through that map, not adding another static device list.
- Phone metadata is sent separately from the screen stream, so identity, battery, display dimensions and stream state need not be inferred from a thumbnail.
- Remote keyboard input distinguishes physical key events from committed text. A phone's text field and active input method are the right boundary for Unicode input; a fixed PC-key-to-Android-character table is not a reliable multilingual solution.
- As checked on 2026-10-28, upstream issue [#10](https://github.com/InukaAsith/TwinDesk/issues/10) is still open. Commit [2a4b68a](https://github.com/InukaAsith/TwinDesk/commit/2a4b68a402bc4aae2a09c9a84c1e6efc1267157b) adds a Unicode text path for characters without a key on the sending layout, but the issue page does not mark the layout-switching report resolved. Issue [#22](https://github.com/InukaAsith/TwinDesk/issues/22) is also still open: its Linux KDE report describes the virtual monitor taking primary status and competing with phone routing on a shared edge. Issue [#66](https://github.com/InukaAsith/TwinDesk/issues/66) is closed after the maintainer said the fast-pointer bug was fixed in the next update; the issue does not identify a fixing commit or release. Treat all three as test cases, not as proof that an upstream fix is complete.

## MOHIVX status found during review / وضع MOHIVX الذي ظهر في المراجعة

- Pairing is already multi-device: the gateway stores device IDs and per-device capabilities; `PhoneDeviceMap` draws every paired phone, saves draggable positions in `phoneDeviceLayout`, and selects the active phone through `phoneSelectedDevice`.
- Screen and camera frames, sync status, battery, permissions, and active selection are keyed by phone ID. Android status separately reports original display width, height, density and rotation; the screen stream is downscaled to a maximum dimension of 960 pixels.
- The PC PhoneViewer already forwards committed Unicode text and IME composition through Android Accessibility `ACTION_SET_TEXT`, and has a bounded ordered queue for taps, swipes, scroll, keys and text. It does not yet forward ordinary pointer hover/movement as a visible phone cursor: pointer interaction currently starts on mouse-down, with mouse-up becoming a tap or swipe.
- The Android companion already has screens for notifications, SMS, calls, photos/files, app launch, clipboard/share, screen/camera/microphone and a phone-as-PC touchpad. These features are not equivalent to TwinDesk's whole set: MOHIVX does not yet provide Android apps as separate PC windows, a phone/tablet as an extended PC display, continuous cursor movement across the PC/phone boundary, phone gamepad input, full call answering/headset routing, phone audio playback on PC, image clipboard sync, mounted shared folders, confirmed two-way OS notification mirroring, or automatic USB/Bluetooth/Wi-Fi Direct transport switching.
- Pairing and media are local/direct and encrypted. Keep certificate pinning, authenticated pairing, device-specific permissions and replay protection unchanged.

## Current upstream scope / نطاق TwinDesk الحالي

The upstream README currently advertises download 2.4 and describes the Android phone as a peer with calls and texts, photos and files, camera, phone-as-remote/gamepad, media control and phone audio, screen/app windows, tablet-as-second-display, clipboard and notifications in both directions, plus mouse and keyboard. It lists same-Wi-Fi, USB, Bluetooth, and Wi-Fi Direct/hotspot links, with no cloud relay. This is the feature scope to compare against; README claims do not prove every path works on every OS/device.

MOHIVX already covers several of those workflows in its existing app: notification mirroring/replies, SMS threads and sending, contacts and call history plus dial handoff, photos and shared-folder files, phone camera and microphone routes, media metadata/control, text clipboard/share-sheet transfer, screen view/touch control, phone-as-PC-touchpad, device-specific permissions and multi-phone placement. The remaining work must extend those existing sections rather than create another phone app or a parallel pairing system.

## Current implementation direction / اتجاه التنفيذ الحالي

1. **Finish pointer handoff / إكمال انتقال المؤشر**
   - Do not call the current edge behavior complete merely because it opens and focuses a viewer. The goal is continuous mouse movement onto the selected phone screen, visible cursor feedback, reliable click/drag/scroll, keyboard text in the active Android field, and a predictable way back to the PC.
   - Define one per-device input stream for move, button down/up, wheel, physical keys, committed Unicode text and cancellation. Coalesce high-rate pointer movement without reordering button/key events or starving control behind video/file traffic.
   - Preserve the actual Windows primary display and normal travel across shared monitor edges. Only route at the phone's selected exposed edge after a deliberate dwell; fast flicks, overlapping phone/virtual-display edges, rotations, stale frames, lock, disconnect, permission revocation, and stop-sharing must not trap or steal the pointer. Escape and a visible release control must restore PC control immediately.
   - Android accessibility gestures can tap/swipe but do not create a system hardware cursor. Investigate the available Windows display/input and Android input paths for genuine pointer continuity. A MOHIVX-drawn pointer may improve feedback, but a viewer overlay alone is not proof of TwinDesk-level cursor handoff; report its limits and leave hardware-cursor parity open unless verified. Retain the existing local encrypted pairing and explicit phone-control switch.

2. **Preserve multilingual keyboard / الحفاظ على تعدد اللغات**
   - Keep committed Unicode text separate from physical key events. Preserve Android's active IME, Arabic/Latin switching, composition, emoji, edit keys and system shortcuts. Test both PC-to-phone typing and the opposite phone-remote-to-PC direction; upstream issue #10 is not proven resolved.
   - Preserve password-field protection and report when Android does not expose a text-editable accessibility node instead of claiming delivery.

3. **Keep the multi-phone map authoritative / اعتماد مخطط الهواتف**
   - Keep per-phone frame, battery, permissions, notifications, layout and errors isolated. Rotation and screen-size updates must not reset a user's saved position. Resolve phones and monitors without changing the OS primary display or letting two edge routes claim the same boundary.

4. **Continue the remaining parity work / إكمال بقية المزايا**
   - Add and verify the missing phone flows in stages: phone apps in PC windows, phone/tablet display extension, gamepad input, call handling/audio, image clipboard, two-way notification mirroring, mounted/shared folders, and direct transport choices/fallback. Keep each permission explicit, each device independently revocable, and all device traffic local and encrypted.

## Focused verification / قائمة تحقق مركّزة

- Move the pointer slowly and quickly at every selected edge; check that only a deliberate edge entry switches to the phone, shared monitor travel remains normal, the Android cursor is visible when supported, and Escape/release immediately restores the PC.
- Click, drag, scroll and type Arabic, English, emoji and composed text in multiple Android apps; verify text lands once, in the focused field, RTL content is preserved, and password fields are untouched.
- Verify backspace/delete and cursor movement around Arabic, combining marks and emoji; verify password fields are not changed.
- Pair two or more phones. Selecting one must never show another phone's notifications, frames, battery, permissions, or control responses.
- Drag cards to distinct positions, restart MOHIVX, resize the panel, reconnect a phone, and confirm placement remains usable and stable.
- Rotate a phone. Confirm reported original dimensions, density, rotation and preview aspect ratio update while the image stream may remain downscaled and the saved phone placement remains stable.
- With two or more PC displays and two or more phones, verify primary-display identity, each saved placement, edge-route priority and switch/release behavior; repeat with screen sharing stopped, phone locked, disconnected, or control permission revoked.
- Verify the remaining advertised TwinDesk-class workflows individually before marking them present: app windows, phone/tablet extended display, gamepad, call answer/decline/audio, phone audio to PC, image clipboard, two-way notifications, mounted shared folders, and USB/Bluetooth/Wi-Fi Direct transport and fallback.
- Disconnect/revoke one phone and confirm other cards, sessions and permissions remain intact; confirm reconnection restores that phone by ID.

## Upstream files to study, not reuse / ملفات مرجعية للدراسة فقط

TwinDesk's Android input and phone metadata: `android/.../Input.kt`, `android/.../PhoneInfo.kt`; computer key mapping: `windows/android-keys.js`; phone input transport: `shared/phoneinput.js`; multi-device layout rules and sync: `shared/layout.js`, `windows/mesh/layout-sync.js`, `docs/mesh.md`. Read them for the problems they solve and their limitations; do not copy implementations into MOHIVX.
