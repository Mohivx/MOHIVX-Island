# MOHIVX Island

رفيق سطح مكتب لنظام Windows مع تطبيق Android مرافق. يجمع الجزيرة العائمة والتحكم بالوسائط والإشعارات والوكلاء وميزات الاتصال المباشر بالهاتف.

A Windows desktop companion with an Android app. It brings together the floating island, media controls, notifications, agents, and direct phone connectivity.

## الإصدار | Version

الإصدار الحالي: **1.1.4**. التنزيلات الرسمية في [GitHub Releases](https://github.com/Mohivx/MOHIVX-Island/releases).

Current version: **1.1.4**. Official downloads are published on [GitHub Releases](https://github.com/Mohivx/MOHIVX-Island/releases).

## المكونات | Components

- **Windows:** الجزيرة، التطبيقات، الوسائط، الإشعارات، الوكلاء، وإعدادات التخصيص.
- **Android:** اقتران مباشر مشفّر مع الكمبيوتر، ومشاركة الهاتف بحسب الأذونات التي يمنحها المستخدم.
- لا يتطلب ربط الهاتف خادمًا وسيطًا؛ يجب أن تسمح الشبكة باتصال الجهازين مباشرة.

- **Windows:** Island, apps, media, notifications, agents, and customization settings.
- **Android:** Encrypted direct pairing with the PC and phone sharing controlled by user-granted permissions.
- Phone pairing uses no relay server; the network must allow the two devices to connect directly.

## البناء من المصدر | Build from source

### Windows

ثبّت Node.js وأدوات بناء Windows المطلوبة للمكونات الأصلية، ثم من مجلد المشروع:

Install Node.js and the Windows build tools required by the native components, then run from the project folder:

    npm install
    npm run build
    npm run package:win

ينتج البناء النسخة المحمولة والمثبّت داخل مجلد release.

This creates the portable app and installer in the release folder.

### Android

يلزم JDK 17 وAndroid SDK platform 34:

JDK 17 and Android SDK platform 34 are required:

    cd android
    .\gradlew.bat --no-daemon --max-workers=2 "-Pkotlin.compiler.execution.strategy=in-process" :app:assembleDebug

ينتج APK التجربة في android/app/build/outputs/apk/debug/app-debug.apk. التحديث فوق نسخة منشورة يتطلب شهادة التوقيع نفسها.

The debug APK is written to android/app/build/outputs/apk/debug/app-debug.apk. Updating an installed release requires the same signing certificate.

## الترخيص | License

كود MOHIVX Island الأصلي مرخص وفق **GNU GPL-3.0-only**؛ راجع ملف LICENSE. تحتفظ المكونات الخارجية بتراخيصها وإشعاراتها الخاصة. تعريف VB-CABLE من VB-Audio له شروط مستقلة موضحة في drivers/mohiv-mic/VB-CABLE/readme.txt.

The original MOHIVX Island code is licensed under **GNU GPL-3.0-only**; see LICENSE. Third-party components retain their own licenses and notices. The VB-Audio VB-CABLE driver has separate terms described in drivers/mohiv-mic/VB-CABLE/readme.txt.
