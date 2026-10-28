# TwinDesk phone research for MOHIVX Island

## Purpose / الهدف

Use TwinDesk as a source of product and architecture ideas for improving the existing **Phone** area in MOHIVX Island. This is a design study, not a code port. Do not copy source, assets, visual text, or protocol details. Implement features with MOHIVX's own code and existing direct, encrypted pairing. No cloud relay, rendezvous service, or separate app.

استخدم TwinDesk لفهم أفكار المنتج والبنية فقط، ثم حسّن قسم **الهاتف** الموجود في MOHIVX Island. هذه مراجعة تصميم وليست نقلًا للكود. لا تنسخ الشيفرة أو الأصول أو نصوص الواجهة أو البروتوكول. نفّذ الميزات بشيفرة MOHIVX الحالية وبالاقتران المباشر المشفّر، من دون خدمة سحابية أو وسيط أو تطبيق منفصل.

## What TwinDesk demonstrates / ما توضحه TwinDesk

- Each paired device has its own identity and state; the computer can switch among phones without confusing their permissions or active sessions.
- Its multi-device design treats placement as a persistent device map. A drag is an explicit layout edit, and edge routing is derived from the saved arrangement. This is useful as a model for predictable placement; MOHIVX can start with local, freely draggable phone cards without implementing cross-device mouse routing.
- Phone metadata is sent separately from the screen stream, so identity, battery, display dimensions and stream state need not be inferred from a thumbnail.
- Remote keyboard input distinguishes physical key events from committed text. A phone's text field and active input method are the right boundary for Unicode input; a fixed PC-key-to-Android-character table is not a reliable multilingual solution.
- The public TwinDesk repository currently has open reports for keyboard language switching failing in phone/tablet control mode ([issue #10](https://github.com/InukaAsith/TwinDesk/issues/10)) and primary monitor cursor conflicts ([issue #22](https://github.com/InukaAsith/TwinDesk/issues/22)). Fast cursor movements triggering unwanted device switching was reported in [issue #66](https://github.com/InukaAsith/TwinDesk/issues/66), which was closed as fixed in a subsequent release. Treat open issues #10 and #22 as active reliability warnings, and note how #66's resolution informs edge dwell and velocity thresholding.

## MOHIVX status found during review / وضع MOHIVX الذي ظهر في المراجعة

- Pairing is already multi-device: the gateway stores a list of paired device IDs and capabilities, and the Phone area can select a phone with `phoneSelectedDevice`.
- The current Phone dashboard still presents one selected phone at a time. It has no persistent, draggable overview for arranging all paired phones.
- Screen and camera streams are already keyed by phone ID. Screen frames include their encoded width and height, and the viewer displays those values.
- Android currently scales the captured phone screen to a maximum dimension of 960 pixels before sending it. Those frame dimensions are ideal for fitting the thumbnail but are not the phone's original display resolution.
- Phone control already has a Unicode text operation through Android Accessibility `ACTION_SET_TEXT`; the Windows viewer currently exposes it as a send-text box. The mirrored screen itself only handles a small set of keys, so ordinary PC typing and IME composition are not yet forwarded as committed Unicode text.
- Pairing and media are local/direct and encrypted. Keep certificate pinning, authenticated pairing, device-specific permissions and replay protection unchanged.

## Independent MOHIVX implementation direction / اتجاه تنفيذ مستقل

1. **Unicode keyboard / لوحة مفاتيح متعددة اللغات**
   - Capture committed text from the Windows input method, including composition, then send the resulting Unicode string through the already authenticated per-phone input path.
   - Keep navigation/editing keys separate from text. Support Arabic, Latin, emoji, selection, backspace and delete; do not synthesize Arabic characters from an English keycode table.
   - Preserve Android's focused editable field and reject password fields. If a field or app does not expose an editable accessibility node, show a useful limitation rather than claiming the keystroke was delivered.

2. **Many phones / عدة هواتف**
   - Render a device card for every paired phone in the existing Phone section. Select a card to make it the active target; keep frames, battery, permissions, notifications and errors keyed by that phone's ID.
   - Persist each card's position locally in MOHIVX settings. Provide a stable default layout for new phones and clamp positions after resize so cards remain reachable.

3. **Drag arrangement / ترتيب بالسحب**
   - Let the user drag cards freely within a responsive board. Use pointer capture, distinguish clicks from drags, persist normalized coordinates, and keep a keyboard-accessible way to select a phone.
   - Treat edge dwell as an explicit opt-in (`phoneEdgeHandoff`): after opt-in edge dwell, it opens/focuses a docked PC `PhoneViewer` and enables viewer input; it does NOT move Windows cursor into Android, draw cursor on glass, or route pointer movement globally. Non-overlapping card placement and shared interior monitor-boundary exclusion prevent primary monitor conflicts (open issue #22), while velocity ceiling, edge dwell, and spatial hysteresis address rapid switching issues (informed by closed issue #66). Safe release on Escape, disconnect, or revocation returns to view mode without OS cursor capture.

4. **Real display dimensions / أبعاد الشاشة الحقيقية**
   - Send the phone's display width, height, density and rotation as metadata in its existing sync status. Keep these separate from the downscaled JPEG frame dimensions.
   - Use the live frame ratio to draw the image, and original display metadata to size the phone preview/window. Recalculate on rotation or display-mode changes without continually overriding a user's manual resize.

## Focused verification / قائمة تحقق مركّزة

- Type Arabic and English using the Windows language switch, plus emoji and composed input; verify text lands once, in the focused Android field, and RTL content is preserved.
- Verify backspace/delete and cursor movement around Arabic, combining marks and emoji; verify password fields are not changed.
- Pair two or more phones. Selecting one must never show another phone's notifications, frames, battery, permissions, or control responses.
- Drag cards to distinct positions, restart MOHIVX, resize the panel, reconnect a phone, and confirm placement remains usable and stable.
- Rotate a phone and change its display mode. Confirm reported original dimensions and preview aspect ratio update while the image stream may remain downscaled.
- Disconnect/revoke one phone and confirm other cards, sessions and permissions remain intact; confirm reconnection restores that phone by ID.

## Upstream files to study, not reuse / ملفات مرجعية للدراسة فقط

TwinDesk's Android input and phone metadata: `android/.../Input.kt`, `android/.../PhoneInfo.kt`; computer key mapping: `windows/android-keys.js`; phone input transport: `shared/phoneinput.js`; multi-device layout rules and sync: `shared/layout.js`, `windows/mesh/layout-sync.js`, `docs/mesh.md`. Read them for the problems they solve and their limitations; do not copy implementations into MOHIVX.
