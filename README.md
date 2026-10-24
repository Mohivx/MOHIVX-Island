# MOHIVX Island

رفيق سطح مكتب لنظام Windows مع تطبيق Android مرافق. يجمع الجزيرة العائمة والتحكم بالوسائط والإشعارات والوكلاء وميزات الاتصال المباشر بالهاتف.

## الإصدار

V1.0.0 هو الإصدار العام الأول. ملفات الكمبيوتر وAndroid تُنشر في [GitHub Releases](https://github.com/Mohivx/MOHIVX-Island/releases) بعد اعتماد مسودتها.

## المكونات

- تطبيق Windows: الجزيرة، التطبيقات، الوسائط، الإشعارات، الوكلاء، والإعدادات.
- تطبيق Android: الاقتران المباشر المشفر مع الكمبيوتر، ومشاركة الهاتف بحسب الأذونات التي يمنحها المستخدم.
- لا يتطلب ربط الهاتف خادمًا وسيطًا. يجب أن يكون الجهازان على شبكة تسمح باتصالهما المباشر.

## البناء من المصدر

### Windows

ثبّت Node.js وأدوات بناء Windows المطلوبة للمكونات الأصلية، ثم من مجلد المشروع:

```powershell
npm install
npm run build
npm run package:win
```

ينتج بناء Windows النسخة المحمولة والمثبّت داخل `release/`.

### Android

يلزم JDK 17 وAndroid SDK platform 34. من مجلد المشروع:

```powershell
cd android
.\gradlew.bat --no-daemon --max-workers=2 '-Pkotlin.compiler.execution.strategy=in-process' :app:assembleDebug
```

ينتج APK التجربة في `android/app/build/outputs/apk/debug/app-debug.apk`. التحديث فوق نسخة مثبتة يحتاج شهادة التوقيع نفسها.

## التراخيص

كود MOHIVX Island الأصلي مرخص وفق GNU GPL-3.0-only؛ راجع ملف `LICENSE`. المكونات الخارجية تحتفظ بتراخيصها وإشعاراتها الخاصة. ملف تعريف VB-CABLE من VB-Audio له شروط مستقلة موضحة في `drivers/mohiv-mic/VB-CABLE/readme.txt`، ولا يغطيه ترخيص GPL الخاص بكود MOHIVX.