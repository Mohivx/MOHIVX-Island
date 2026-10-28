# MOHIVX Island 1.1.6 (Desktop) & 1.1.5 (Android Companion)

## العربية

### تحكم متواصل بمؤشر الفأرة (المرحلة 4C من خطة تكافؤ الهاتف)
- **حركة حية لمؤشر الكمبيوتر على شاشة الهاتف**: يرسل عارض الشاشة موقع المؤشر مع تسوية الإحداثيات بالنسبة للإطار المرئي ومعالجة الاقتصاص أو الحواشي (Letterbox / Crop). يتبع الإطار اتجاه شاشة الهاتف الحالي وأبعادها.
- **دمج حركات الفأرة السريعة وترتيب التدفق**: دمج عينات الحركة المتتالية لتفادي ازدحام قائمة الأوامر، مع ضمان إرسال آخر موقع مؤشر فورًا قبل أي نقرة أو سحب أو تمرير أو ضغطة مفتاح أو إدخال نصي.
- **مؤشر MOHIVX بصري على أندرويد**: إظهار مؤشر عبر طبقة إمكانية وصول غير تفاعلية (`TYPE_ACCESSIBILITY_OVERLAY`) أثناء مشاركة الشاشة ونشاط إذن التحكم. يختفي فور إيقاف المشاركة أو قفل الهاتف أو فشل المزامنة أو تعطيل التحكم محليًا؛ وينتهي بعد أربع ثوانٍ من توقف حركة المؤشر. عند توقف إطارات الشاشة، يوقف العارض إرسال الإدخال ثم ينتهي المؤشر مع مهلة الخمول.
- **توصيف دقيق لإدخال اللمس والنصوص**: الاحتفاظ بآلية اللمس البديلة (عبر `dispatchGesture`) وإدخال النصوص العربية والإنجليزية والرموز التعبيرية ومحررات IME من دون الادعاء بوجود مؤشر فأرة عتادي لنظام أندرويد.
- **أيقونة أندرويد المطابقة للكمبيوتر**: توليد أصول أندرويد من ملف أيقونة MOHIVX Island نفسه المستخدم في نسخة ويندوز (`build/icon.ico`)، مع الخلفية السوداء والعلامة بالنسب ذاتها؛ يطبق أندرويد قناع شكل المشغّل فقط.

---

## English

### Continuous Pointer Handoff (Phone Parity Stage 4C)
- **Live PC Pointer Movement on Phone Screen**: The screen viewer forwards pointer coordinates normalized to the visible frame and handles crop/letterbox. The frame follows the phone display's current orientation and dimensions.
- **High-Rate Move Coalescing & Strict Flush Ordering**: High-frequency move events coalesce into the pending move slot to eliminate queue bloat and redundant network traffic, while strictly flushing the last move position immediately before any tap, swipe, wheel, key, or text action.
- **Android Non-Interactive MOHIVX Pointer Overlay**: A visual pointer overlay (`TYPE_ACCESSIBILITY_OVERLAY`) renders on Android only while screen sharing and control permission are active. It is immediately removed when sharing stops, the phone locks, sync fails, local control is disabled, the service is interrupted, or the service is torn down; otherwise, it hides after four seconds without pointer movement. If screen frames go stale, the viewer stops accepting input and the idle timeout removes the pointer.
- **Truthful Touch-Gesture Fallback & Multilingual Typing**: Accurately reports touch-gesture fallback (via `dispatchGesture`) and Unicode text injection without claiming a native hardware mouse cursor. Full Arabic, English, IME composition, and keyboard shortcuts remain intact.
- **Android Icon Matched to Windows**: Generated Android launcher assets from the same MOHIVX Island source icon used by Windows (`build/icon.ico`), preserving its black background and centered mark; Android applies only its launcher shape mask.
