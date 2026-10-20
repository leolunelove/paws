import {authConfig} from './auth-config.js';
import {changesBetween} from './sync.js';
import {validate} from './model.js';
export const configured=Boolean(authConfig.url&&authConfig.publishableKey);
const SESSION='paws.home-session.v1';
export function savedSession(){try{const s=JSON.parse(localStorage.getItem(SESSION));return s?.token&&s?.home?.id&&s?.user?.id?s:null;}catch{return null;}}
export function remember(info){localStorage.setItem(SESSION,JSON.stringify(info));}
export function forget(){localStorage.removeItem(SESSION);}
export const formatCode=code=>String(code||'').match(/.{1,4}/g)?.join('-')||'';
export async function roomRequest(request){
 if(!configured)throw Error('Shared homes are not connected yet.');
 const response=await fetch(authConfig.url+'/rest/v1/rpc/paws_room',{method:'POST',headers:{apikey:authConfig.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({request}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok||data?.error){const err=Error(data?.error||data?.message||'Couldn’t reach your home. Try again.');err.accessLost=err.message.includes('Join your home again');throw err;}return data;
}
export async function enterHome(details){const info=await roomRequest(details);if(!validate(info.data))throw Error('This home’s data could not be read safely.');remember({...info,data:undefined,ack:undefined});return info;}
export async function leaveHome(info){await roomRequest({action:'leave',token:info.token});forget();}
export async function rotatePasscode(info,passcode){return roomRequest({action:'rotate',token:info.token,passcode});}
export class HouseholdSync{
 constructor(info,onData,onStatus,onAccessLost){this.info=info;this.onData=onData;this.onStatus=onStatus;this.onAccessLost=onAccessLost;this.key=`paws.rooms.${info.home.id}.${info.user.id}`;this.pending=[];this.baseline=null;this.running=false;this.stopped=false;this.timer=null;}
 async start(initial){try{const cache=JSON.parse(localStorage.getItem(this.key)||'null');if(cache&&validate(cache.data)&&Array.isArray(cache.pending)){this.pending=cache.pending;this.baseline=cache.data;this.onData(structuredClone(cache.data));}}catch{}if(!this.baseline&&initial&&validate(initial)){this.baseline=initial;this.save(initial);this.onData(structuredClone(initial));}await this.flush();if(this.stopped)return;this.timer=setInterval(()=>this.flush(),4000);this.online=()=>this.flush();this.visible=()=>{if(!document.hidden)this.flush();};window.addEventListener('online',this.online);document.addEventListener('visibilitychange',this.visible);}
 save(data){localStorage.setItem(this.key,JSON.stringify({data,pending:this.pending}));}
 record(data){if(!this.baseline||this.stopped)throw Error('Your home is not connected.');const changes=changesBetween(this.baseline,data);const next=[...this.pending,...changes];localStorage.setItem(this.key,JSON.stringify({data,pending:next}));this.pending=next;this.baseline=structuredClone(data);this.onStatus(this.pending.length?'Saving…':'Shared · all changes saved');this.flush();}
 async flush(){if(this.running||this.stopped)return;if(!navigator.onLine){this.onStatus('Offline · changes saved on this device');return;}this.running=true;try{
 while(this.pending.length&&!this.stopped){const batch=this.pending.slice(0,200);const result=await roomRequest({action:'apply',token:this.info.token,operations:batch});const ids=new Set(result.ack);if(!ids.size)throw Error('Changes could not be saved.');this.pending=this.pending.filter(o=>!ids.has(o.id));this.save(this.baseline);}
 if(this.stopped)return;const result=await roomRequest({action:'read',token:this.info.token});if(this.stopped)return;if(!validate(result.data))throw Error('Invalid home data');if(!this.pending.length){this.baseline=result.data;this.save(result.data);this.onData(structuredClone(result.data));}this.onStatus(this.pending.length?'Saving…':'Shared · all changes saved');
 }catch(e){if(e.accessLost){this.stop();forget();localStorage.removeItem(this.key);this.onAccessLost?.();}else this.onStatus('Couldn’t sync · retrying automatically');}finally{this.running=false;}}
 stop(){this.stopped=true;clearInterval(this.timer);window.removeEventListener('online',this.online);document.removeEventListener('visibilitychange',this.visible);}
 clear(){this.stop();localStorage.removeItem(this.key);}
}
