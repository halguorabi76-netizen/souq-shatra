export async function signInProfessional(db,username,password,role){
 const failure=code=>({data:null,error:{code,message:code==='rate_limited'?'محاولات كثيرة؛ انتظر قليلًا ثم أعد المحاولة':code==='invalid_credentials'?'تأكد من اسم المستخدم وكلمة المرور':'تعذّر الاتصال بخدمة الدخول؛ أعد المحاولة'}});
 const response=await db.functions.invoke('professional-login',{body:{username:username.trim().replace(/^@/,'').toLowerCase(),password,role}});
 if(response.error){let code=response.data?.code;try{code=(await response.error.context?.json())?.code||code}catch{}return failure(code||'temporarily_unavailable')}
 if(!response.data?.access_token||!response.data?.refresh_token)return failure(response.data?.code||'temporarily_unavailable');
 return db.auth.setSession({access_token:response.data.access_token,refresh_token:response.data.refresh_token});
}
export async function signInWithPhone(db,phone,password,role){
 const failure=code=>({data:null,error:{code,message:code==='rate_limited'?'محاولات كثيرة؛ انتظر قليلًا ثم أعد المحاولة':code==='professional_account'?'هذا حساب بائع أو توصيل؛ اختر نوعه من الشريط أعلاه، أو أنشئ حساب زبون من «حساب جديد»':code==='invalid_credentials'?'تأكد من رقم الهاتف وكلمة السر ونوع الحساب':'تعذّر الاتصال بخدمة الدخول؛ أعد المحاولة'}});
 if(db.preview)return failure('invalid_credentials');
 const response=await db.functions.invoke('professional-login',{body:{phone:String(phone||'').trim(),password,role}});
 if(response.error){let code=response.data?.code;try{code=(await response.error.context?.json())?.code||code}catch{}return failure(code||'temporarily_unavailable')}
 if(!response.data?.access_token||!response.data?.refresh_token)return failure(response.data?.code||'temporarily_unavailable');
 return db.auth.setSession({access_token:response.data.access_token,refresh_token:response.data.refresh_token});
}
