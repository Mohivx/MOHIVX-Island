const loopback = host => ['127.0.0.1','localhost','[::1]'].includes(host);
async function routePrompt({prompt,history=[],settings,gemini,hermes,fetcher=fetch}) {
  const fail = error => ({success:false,reply:error,toolsExecuted:[]});
  if (settings.aiEnabled === false) return fail(settings.appLang==='ar'?'الذكاء الاصطناعي معطّل.':'AI is disabled.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length>30000) return fail('Enter a question under 30000 characters.');
  const provider=settings.aiProvider || 'gemini-cloud';
  if (provider==='gemini-cloud') {
    if (settings.localOnlyMode) return fail(settings.appLang==='ar'?'الوضع المحلي يمنع الاتصال السحابي.':'Local-only mode blocks cloud requests.');
    return gemini.runPrompt(prompt,settings,history);
  }
  if (provider==='hermes-local') {
    // A local CLI may still use a cloud model, so it must not bypass local-only privacy.
    if (settings.localOnlyMode) return fail(settings.appLang==='ar'?'قد يتصل Hermes بنموذج سحابي. اختر خادمًا محليًا للوضع المحلي.':'Hermes may use cloud models. Choose a loopback API for local-only mode.');
    const r=await hermes.runOneShot(`${settings.customDirectives || ''}\n${history.slice(-12).map(m=>`${m.role}: ${m.text}`).join('\n')}\nUser: ${prompt}`);
    return {success:r.success,reply:r.response || r.error,toolsExecuted:[]};
  }
  if (!['hermes-remote','custom-openai'].includes(provider)) return fail('Unknown provider.');
  try {
    const url=new URL(settings.providerUrl || `http://${settings.hermesServerHost || '127.0.0.1'}:${settings.hermesServerPort || 9119}/v1/chat/completions`);
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || (url.protocol==='http:' && !loopback(url.hostname))) throw new Error('Remote providers require HTTPS. HTTP is supported on loopback only.');
    if (settings.localOnlyMode && !loopback(url.hostname)) throw new Error('Local-only mode blocks remote providers.');
    const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',...(settings.providerKey?{Authorization:`Bearer ${settings.providerKey}`}:{})},body:JSON.stringify({model:settings.hermesModel || 'default',messages:[{role:'system',content:settings.customDirectives || 'Be helpful and concise.'},...history.slice(-12).map(m=>({role:m.role==='user'?'user':'assistant',content:String(m.text).slice(0,12000)})),{role:'user',content:prompt}]}),signal:AbortSignal.timeout(60000),redirect:'error'});
    const body=await response.json(); if (!response.ok) throw new Error(`Provider HTTP ${response.status}`); const reply=body.choices?.[0]?.message?.content; if (typeof reply!=='string' || !reply.trim()) throw new Error('Provider returned no text.');
    return {success:true,reply,toolsExecuted:[]};
  } catch(e) {return fail(e.message);}
}
module.exports={routePrompt};
