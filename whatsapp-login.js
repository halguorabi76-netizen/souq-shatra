// Free WhatsApp sign-in: the customer sends a short code from their own WhatsApp; the
// whatsapp-login edge function confirms the sender and hands this browser a session.
const messages={rate_limited:'محاولات كثيرة؛ انتظر قليلًا ثم أعد المحاولة',not_configured:'الدخول عبر واتساب لم يُفعّل بعد من إدارة التطبيق',expired:'انتهت مهلة الرمز؛ اطلب رمزًا جديدًا'};
const failure=code=>({data:null,error:{code,message:messages[code]||'تعذّر الاتصال بخدمة الدخول؛ أعد المحاولة'}});
async function call(db,body){
 if(db.preview)return body.action==='start'?{data:{code:'482913',secret:'0'.repeat(64),number:'9647837271707',preview:true}}:{data:{status:'pending'}};
 if(!db.functions)return failure('not_configured');
 const response=await db.functions.invoke('whatsapp-login',{body});
 if(response.error){let code=response.data?.code;try{code=(await response.error.context?.json())?.code||code}catch{}return failure(code||'temporarily_unavailable')}
 return {data:response.data,error:null};
}
export const whatsappLink=(number,code)=>'https://wa.me/'+number+'?text='+encodeURIComponent('رمز الدخول إلى سوق الشطرة: '+code);
export async function startWhatsappLogin(db){
 const result=await call(db,{action:'start'});
 if(result.error)return result;
 if(!/^[0-9]{6}$/.test(result.data?.code||'')||!/^[0-9]{8,15}$/.test(result.data?.number||''))return failure('temporarily_unavailable');
 return result;
}
// Returns {status:'pending'|'expired'} or the signed-in session result from Supabase Auth.
export async function claimWhatsappLogin(db,code,secret){
 const result=await call(db,{action:'claim',code,secret});
 if(result.error)return result;
 if(result.data?.status!=='verified')return {data:{status:result.data?.status==='expired'?'expired':'pending'},error:null};
 if(!result.data.access_token||!result.data.refresh_token)return failure('temporarily_unavailable');
 return db.auth.setSession({access_token:result.data.access_token,refresh_token:result.data.refresh_token});
}
