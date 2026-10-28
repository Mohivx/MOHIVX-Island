# MOHIVX Island 1.1.9

## What's new

- AI replies now stream into the companion as Gemini produces them. Tool calls show a readable live progress state, can be canceled with the same request ID, and keep tool results correlated to the active conversation.
- Typed replies can be read aloud from the reply card, while the existing Live Conversation continues to stream speech and tool activity in real time.

- Stream Android media audio to the paired Windows PC after Android's explicit screen-capture consent.
- Audio capture is a separate phone permission, uses Android playback capture rather than the phone microphone, and stops when sharing is stopped or permission is revoked.
- The phone page now exposes playback-audio start/stop status and a live level indicator. Android 10+ is required; protected apps and calls may not provide capturable audio.
- The Android companion version advances to 1.1.8 (code 167); its launcher art is generated from the same Windows app icon source.

## الجديد

- تظهر ردود الذكاء الاصطناعي تدريجيًا أثناء وصولها من Gemini، مع عرض حالة مفهومة للأداة الجارية وإيقاف الطلب بنفس المعرّف دون خلطه مع محادثة أخرى.
- يمكن قراءة الرد المكتوب بصوت من بطاقة الرد، بينما تستمر المحادثة المباشرة في بث الكلام ونشاط الأدوات لحظيًا.

- بث صوت الوسائط من أندرويد إلى كمبيوتر ويندوز المقترن بعد موافقة أندرويد الصريحة على التقاط الشاشة.
- التقاط الصوت صلاحية مستقلة، ويستخدم صوت تشغيل الوسائط في أندرويد لا مايك الهاتف، ويتوقف عند إيقاف المشاركة أو سحب الصلاحية.
- يعرض قسم الهاتف حالة تشغيل/إيقاف الصوت ومؤشر مستوى مباشر. يتطلب أندرويد 10 أو أحدث؛ وقد تمنع التطبيقات المحمية أو المكالمات التقاط الصوت.
- تحديث نسخة مرافق أندرويد إلى 1.1.8 (رقم البناء 167)، مع توليد الأيقونة من مصدر أيقونة تطبيق ويندوز نفسه.

## Downloads | ملفات التحميل

- **Windows installer:** MOHIVX-Island-Setup-1.1.8.exe
- **Windows portable:** MOHIVX Island 1.1.9.exe
- **Android companion preview (debug-signed, separate app ID):** MOHIVX-Island-Companion-1.1.9-preview.apk
- **Public Android update APK:** requires the release signing key; it is not part of this preview build.

- **مثبّت Windows:** MOHIVX-Island-Setup-1.1.8.exe
- **نسخة Windows المحمولة:** MOHIVX Island 1.1.9.exe
- **معاينة تطبيق Android (بتوقيع التطوير وتُثبّت كتطبيق منفصل):** MOHIVX-Island-Companion-1.1.9-preview.apk
- **حزمة تحديث Android العامة:** تتطلب مفتاح توقيع الإصدار، ولم تُبنَ ضمن هذه المعاينة.

## License | الترخيص

MOHIVX Island is licensed under GNU GPL-3.0-only. Third-party components retain their own licenses and notices.

كود MOHIVX Island مرخص وفق GNU GPL-3.0-only. تحتفظ مكونات الطرف الثالث بتراخيصها وإشعاراتها الخاصة.

---

# MOHIVX Island 1.1.7

## What's new

- Phone notifications that support text replies now offer a quick-reply control directly in the Island notification card.
- Replies are sent through the paired phone and checked against the active notification again before delivery. Stale notifications are refused.
- English and Arabic reply controls follow the selected app language.

## الجديد

- تظهر ميزة الرد السريع داخل إشعار الجزيرة لإشعارات الهاتف التي تدعم الرد النصي.
- يُرسل الرد عبر الهاتف المقترن، مع إعادة التحقق من أن الإشعار ما زال نشطًا قبل إرساله؛ وتُرفض الإشعارات القديمة.
- تتبع أزرار الرد اللغة المحددة في التطبيق، العربية أو الإنجليزية.

## Downloads | ملفات التحميل

- **Windows installer:** MOHIVX-Island-Setup-1.1.7.exe
- **Windows portable:** MOHIVX Island 1.1.7.exe
- **Android:** unchanged in this Windows-only update; the current companion is 1.1.5.

- **مثبّت Windows:** MOHIVX-Island-Setup-1.1.7.exe
- **نسخة Windows المحمولة:** MOHIVX Island 1.1.7.exe
- **Android:** لم يتغير في هذا التحديث الخاص بويندوز؛ النسخة الحالية للمرافق 1.1.5.

## License | الترخيص

MOHIVX Island is licensed under GNU GPL-3.0-only. Third-party components retain their own licenses and notices.

كود MOHIVX Island مرخص وفق GNU GPL-3.0-only. تحتفظ مكونات الطرف الثالث بتراخيصها وإشعاراتها الخاصة.

---

# MOHIVX Island 1.1.3

## What's new

- Keep the selected Windows media session when paused, so the island reports the real Playing, Paused, or Stopped state instead of switching to another stale player.
- Play/Pause now uses the session's explicit Play or Pause command and refreshes the displayed state after the action.
- Previous and Next use the active session when supported and fall back to Windows media keys when that session does not expose those controls.

## الجديد

- تثبيت جلسة الوسائط المحددة حتى عند الإيقاف المؤقت، ليعرض التطبيق حالة التشغيل أو الإيقاف المؤقت أو التوقف الحقيقية بدل الانتقال إلى مشغّل قديم آخر.
- استخدام أمر تشغيل أو إيقاف مؤقت صريح، ثم تحديث الحالة المعروضة بعد تنفيذ الأمر.
- تشغيل السابق والتالي من الجلسة النشطة، مع الرجوع إلى مفاتيح الوسائط في ويندوز إذا لم يدعم المشغّل تلك الأوامر.

## Downloads | ملفات التحميل

- **Windows portable:** MOHIVX Island 1.1.3.exe
- **Windows installer:** MOHIVX-Island-Setup-1.1.3.exe
- **Android:** MOHIVX Island 1.1.3.apk

- **نسخة Windows المحمولة:** MOHIVX Island 1.1.3.exe
- **مثبّت Windows:** MOHIVX-Island-Setup-1.1.3.exe
- **Android:** MOHIVX Island 1.1.3.apk

## License | الترخيص

MOHIVX Island is licensed under GNU GPL-3.0-only. Third-party components retain their own licenses and notices.

كود MOHIVX Island مرخص وفق GNU GPL-3.0-only. تحتفظ مكونات الطرف الثالث بتراخيصها وإشعاراتها الخاصة.
