import {createClient} from './vendor/supabase.js';
import {authConfig} from './auth-config.js';
import {changesBetween} from './sync.js';
import {validate} from './model.js';
export const authCallbackIssue=typeof location!=='undefined'&&new URLSearchParams(location.hash.slice(1)).has('error');
export const arrivingFromLink=typeof location!=='undefined'&&new URLSearchParams(location.hash.slice(1)).has('access_token');
export const configured=Boolean(authConfig.url&&authConfig.publishableKey);
export const emailReady=configured&&authConfig.emailReady;
export const client=configured?createClient(authConfig.url,authConfig.publishableKey,{auth:{flowType:'implicit',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
export const redirectUrl=()=>authConfig.redirectUrl||new URL('./',location.href).href;
export async function checked(promise){const {data,error}=await promise;if(error)throw error;return data;}
export async function sendLink(email){if(!emailReady)throw Error('Email sign-in is not connected in this preview.');return checked(client.auth.signInWithOtp({email:email.trim().toLowerCase(),options:{emailRedirectTo:redirectUrl()}}));}
export async function findHome(){const {data:{user},error}=await client.auth.getUser();if(error)throw error;if(!user)return null;const membership=await checked(client.from('paws_members').select('*').eq('user_id',user.id).maybeSingle());if(!membership)return {user,home:null};const home=await checked(client.from('paws_households').select('*').eq('id',membership.household_id).single());return {user,home,membership};}
export async function loadHome(h){const [pets,events,members]=await Promise.all([checked(client.from('paws_pets').select('*').eq('household_id',h)),checked(client.from('paws_care').select('*').eq('household_id',h).order('at',{ascending:false})),checked(client.from('paws_members').select('*').eq('household_id',h))]);const data={version:1,pets:pets.map(x=>x.data),events:events.map(e=>({id:e.id,petId:e.pet_id,care:e.care,day:e.day,slot:e.slot,at:e.at,by:members.find(m=>m.user_id===e.actor_id)?.display_name||'Household member'}))};if(!validate(data))throw Error('The household data could not be read safely.');return {data,members};}
// The cache and pending operations are saved together, scoped to verified user + household.
export class HouseholdSync{
 constructor(home,user,onData,onStatus){this.home=home;this.user=user;this.onData=onData;this.onStatus=onStatus;this.key=`paws.shared.${user.id}.${home.id}`;this.pending=[];this.baseline=null;this.running=false;this.stopped=false;this.timer=null;this.retry=2000;}
 async start(){try{const cache=JSON.parse(localStorage.getItem(this.key)||'null');if(cache&&validate(cache.data)&&Array.isArray(cache.pending)){this.pending=cache.pending;this.baseline=cache.data;this.onData(cache.data);}}catch{}await this.flush();this.timer=setInterval(()=>this.flush(),8000);this.online=()=>this.flush();window.addEventListener('online',this.online);}
 save(data){localStorage.setItem(this.key,JSON.stringify({data,pending:this.pending}));}
 record(data){if(!this.baseline)throw Error('Your household is still loading.');const changes=changesBetween(this.baseline,data);this.pending.push(...changes);this.baseline=structuredClone(data);try{this.save(data);}catch(e){this.onStatus('Storage full · changes are only in memory');throw e;}this.onStatus(this.pending.length?'Saving…':'All changes saved');this.flush();}
 async flush(){if(this.running||this.stopped||!navigator.onLine){if(!navigator.onLine)this.onStatus('Offline · changes stay on this device');return;}this.running=true;try{
  // Auth and membership are verified on every pull, including after access has been removed.
  const current=await findHome();if(!current?.home||current.home.id!==this.home.id)throw Error('Household access changed. Sign in again.');
  while(this.pending.length){const batch=this.pending.slice(0,200),ids=new Set(await checked(client.rpc('paws_apply',{h:this.home.id,operations:batch})));this.pending=this.pending.filter(o=>!ids.has(o.id));this.save(this.baseline);if(!ids.size)throw Error('Changes could not be saved.');}
  const {data}=await loadHome(this.home.id);if(this.stopped)return;
  // Edits made while the request was in flight remain optimistic and queued for the next pass.
  if(!this.pending.length){this.baseline=data;this.save(data);this.onData(data);}
  this.onStatus(this.pending.length?'Saving…':'Shared · all changes saved');
 }catch(e){this.onStatus(e.message?.includes('access changed')?'Access changed · sign in again':'Couldn’t sync · your changes are saved here');}finally{this.running=false;}}
 stop(){this.stopped=true;clearInterval(this.timer);window.removeEventListener('online',this.online);}
}
export async function invitePerson(home,email){const id=await checked(client.rpc('paws_invite',{h:home.id,recipient:email}));try{
 // A separate non-persistent client requests the invitee’s magic link without changing the inviter’s session.
 const sender=createClient(authConfig.url,authConfig.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:'implicit'}});
 if(!emailReady)throw Error('Email delivery is not configured.');
 await checked(sender.auth.signInWithOtp({email:email.trim().toLowerCase(),options:{emailRedirectTo:redirectUrl()}}));return id;
 }catch(e){throw Error('Invitation saved, but the email could not be sent. '+e.message);}}
