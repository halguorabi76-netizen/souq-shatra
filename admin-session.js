// Administration authentication is independent of the marketplace's Auth client.
// The server validates every identity; database RLS still authorizes all actions.
export function createAdminSession({url,key,storage,location,history,fetchImpl=fetch,now=()=>Date.now(),timeoutMs=12000}){
 const storageKey='sb-'+new URL(url).hostname.split('.')[0]+'-auth-token';
 let current=null,verifiedAt=0,pending=null,generation=0;
 const listeners=new Set();
 const read=()=>{try{return JSON.parse(storage.getItem(storageKey)||'null')}catch{return null}};
 const normalize=session=>session?{...session,expires_at:Number(session.expires_at)||Math.floor(now()/1000)+(Number(session.expires_in)||3600)}:null;
 const write=session=>{current=normalize(session);verifiedAt=now();if(current)storage.setItem(storageKey,JSON.stringify(current));else storage.removeItem(storageKey)};
 const announce=(event,session)=>{for(const cb of listeners)queueMicrotask(()=>cb(event,session));};
 async function request(path,{method='GET',body,token}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchImpl(url+'/auth/v1/'+path,{method,signal:controller.signal,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const data=response.status===204?null:await response.json();
   if(!response.ok)throw Object.assign(new Error(data?.msg||data?.message||data?.error_description||'تعذّر الاتصال بخدمة الحساب'),{status:response.status,code:data?.code||data?.error_code||data?.error});
   return data;
  }catch(error){if(error.name==='AbortError')throw Object.assign(new Error('تعذّر الاتصال بخدمة الحساب خلال المهلة المحددة.'),{name:'TimeoutError'});throw error;}
  finally{clearTimeout(timer)}
 }
 function callback(){
  const params=new URLSearchParams(location.hash.slice(1));
  try{sessionStorage.removeItem('souq-admin-return')}catch{}
  if(!params.has('access_token'))return null;
  const access_token=params.get('access_token'),refresh_token=params.get('refresh_token');
  if(!refresh_token)throw Error('لم تكتمل بيانات تسجيل الدخول. أعد تسجيل الدخول.');
  const session={access_token,refresh_token,token_type:'bearer',expires_at:Number(params.get('expires_at'))||Math.floor(now()/1000)+(Number(params.get('expires_in'))||3600)};
  // Remove credentials from history before loading any administration data.
  history.replaceState(null,'',location.pathname+location.search);
  return session;
 }
 async function load(){
  const version=generation;
  let session=callback()||read();
  if(!session?.access_token||!session?.refresh_token){current=null;return null;}
  // Revalidate on each page load, after storage changes, and every two minutes.
  if(current?.access_token===session.access_token&&now()-verifiedAt<120000&&session.expires_at>now()/1000+60)return current;
  try{
   let renewed=false;
   const renew=async()=>{session=normalize(await request('token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}));renewed=true;};
   if(!session.expires_at||session.expires_at<=now()/1000+60)await renew();
   let user;
   try{user=await request('user',{token:session.access_token});}
   catch(error){if(error.status!==401||renewed)throw error;await renew();user=await request('user',{token:session.access_token});}
   if(version!==generation)return null;
   if(!user?.id)throw Error('تعذّر التحقق من هوية الحساب.');
   session.user=user;write(session);return session;
  }catch(error){
   if(version!==generation)return null;
   if(error.status===400||error.status===401||error.status===403){write(null);announce('SIGNED_OUT',null);return null;}
   // A network failure keeps the saved session for a later retry.
   throw error;
  }
 }
 async function session(){if(!pending)pending=load().finally(()=>{pending=null});return pending;}
 const auth={
  async getSession(){try{return {data:{session:await session()},error:null}}catch(error){return {data:{session:null},error}}},
  async signInWithPassword(credentials){
   try{const result=normalize(await request('token?grant_type=password',{method:'POST',body:credentials}));generation++;write(result);announce('SIGNED_IN',result);return {data:{user:result.user,session:result},error:null};}
   catch(error){return {data:{user:null,session:null},error};}
  },
  async signInWithOAuth({provider,options={}}){
   const target=new URL(url+'/auth/v1/authorize');target.searchParams.set('provider',provider);target.searchParams.set('redirect_to',options.redirectTo||new URL('admin.html',location.href).href);
   for(const [k,v] of Object.entries(options.queryParams||{}))target.searchParams.set(k,v);
   location.assign(target.href);return {data:{provider,url:target.href},error:null};
  },
  async signOut({scope='local'}={}){
   const token=(current||read())?.access_token;generation++;write(null);announce('SIGNED_OUT',null);
   if(token)try{await request('logout?scope='+encodeURIComponent(scope),{method:'POST',token})}catch{}
   return {error:null};
  },
  async resetPasswordForEmail(email,{redirectTo}={}){try{await request('recover'+(redirectTo?'?redirect_to='+encodeURIComponent(redirectTo):''),{method:'POST',body:{email}});return {data:{},error:null}}catch(error){return {data:null,error}}},
  async updateUser(attributes){try{const s=await session();if(!s)throw Error('سجّل الدخول أولًا');const user=await request('user',{method:'PUT',body:attributes,token:s.access_token});write({...s,user});return {data:{user},error:null}}catch(error){return {data:null,error}}},
  async signUp(){return {data:null,error:Error('لوحة الإدارة مخصصة لحساب المالك؛ لا تحتاج إنشاء حساب جديد.')}},
  onAuthStateChange(cb){listeners.add(cb);return {data:{subscription:{unsubscribe:()=>listeners.delete(cb)}}};}
 };
 return {auth,async accessToken(){return (await session())?.access_token||null}};
}
