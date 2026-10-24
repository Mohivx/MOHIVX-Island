function localizeFailure(result,settings){
 if(settings.appLang!=='ar'||result?.success!==false)return result;
 const source=String(result.error||result.reply||''); let message='تعذر تنفيذ الطلب. تحقق من الإعدادات والاتصال وحاول مجددًا.';
 if(/key|credential/i.test(source))message='أضف مفتاح الخدمة من الإعدادات ← مفاتيح API وتحقق من صلاحيته.';
 else if(/local.only|cloud.*disabled|privacy/i.test(source))message='الوضع المحلي يمنع الاتصال بالخدمات السحابية. غيّر المزود أو إعدادات الخصوصية.';
 else if(/voice.*unavailable|voice.*support/i.test(source))message='هذا الصوت غير متاح لدى خدمة الصوت الحالية.';
 else if(/AI is disabled/i.test(source))message='الذكاء الاصطناعي معطّل في الإعدادات.';
 else if(/Hermes.*not.*installed|not found/i.test(source))message='الخدمة المطلوبة غير مثبتة أو لم يُعثر عليها.';
 else if(/busy|already working/i.test(source))message='الوكيل ينفذ طلبًا حاليًا. انتظر أو ألغِ الطلب السابق.';
 else if(/timeout|timed out/i.test(source))message='انتهت مهلة الاتصال. تحقق من الشبكة والخدمة ثم أعد المحاولة.';
 return {...result,...(result.error?{error:message}:{}),...(result.reply?{reply:message}:{} )};
}
module.exports={localizeFailure};
