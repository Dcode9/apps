import {randomBytes,createHash,createCipheriv,publicEncrypt,constants,timingSafeEqual} from 'node:crypto';
const BASE='https://gmwieijbrrztukqpfwkg.supabase.co';
const ANON='sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE';
const scopes=['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'];
function eq(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('autoyt_state='))?.slice(13)}
function encrypt(data,key){const k=randomBytes(32),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv);const bytes=Buffer.concat([c.update(JSON.stringify(data),'utf8'),c.final()]);return JSON.stringify({key:publicEncrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},k).toString('base64'),iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),cipher:bytes.toString('base64')})}
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
function page(status,message){res.status(status).send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube connection</title><main style="font:18px sans-serif;max-width:600px;margin:60px auto;padding:24px"><h1>YouTube connection</h1><p>'+message+'</p></main>')}
try{
if(req.method!=='GET')return page(405,'Method not allowed.');
const c=JSON.parse(process.env.AUTOYT_OAUTH_CONFIG||'null');
if(!c||Date.now()/1000>c.expires)return page(410,'This one-time connection has expired.');
if(req.query.start==='1'){
if(!eq(req.query.gate,c.gate))return page(403,'Invalid connection link.');
res.setHeader('Set-Cookie',`autoyt_state=${c.state}; Secure; HttpOnly; SameSite=Lax; Path=/api/autoyt-oauth; Max-Age=3600`);
const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
u.search=new URLSearchParams({client_id:c.client_id,redirect_uri:c.redirect,response_type:'code',scope:scopes.join(' '),state:c.state,access_type:'offline',prompt:'consent',code_challenge:createHash('sha256').update(c.pkce).digest('base64url'),code_challenge_method:'S256'}).toString();
return res.redirect(302,u.toString());}
if(!eq(req.query.state,c.state)||!eq(cookie(req),c.state))return page(403,'Invalid or expired connection session. Open the original link again.');
if(req.query.error)return page(400,'Connection was not approved. Nothing was saved.');
if(typeof req.query.code!=='string')return page(400,'Missing authorization.');
const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:req.query.code,client_id:c.client_id,client_secret:c.client_secret,redirect_uri:c.redirect,grant_type:'authorization_code',code_verifier:c.pkce})});
if(!tokenRes.ok)return page(400,'Google could not complete the connection. Nothing was saved.');
const t=await tokenRes.json();
if(!t.refresh_token||!scopes.every(s=>(t.scope||'').split(' ').includes(s)))return page(400,'Both upload and channel-check permissions are required. Nothing was saved.');
const ch=await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers:{Authorization:'Bearer '+t.access_token}});
if(!ch.ok)return page(400,'Channel check failed. Nothing was saved.');
const items=(await ch.json()).items||[];
if(items.length!==1||items[0].id!==c.channel)return page(403,'This is not The Loop Hole channel. Nothing was saved. Open the original link and select The Loop Hole.');
const data={token:t.access_token,refresh_token:t.refresh_token,token_uri:'https://oauth2.googleapis.com/token',client_id:c.client_id,client_secret:c.client_secret,scopes,expiry:new Date(Date.now()+t.expires_in*1000).toISOString()};
const payload=encrypt(data,c.public_key);
const stored=await fetch(BASE+'/storage/v1/object/drops/'+c.path,{method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/octet-stream','x-upsert':'false'},body:payload});
if(!stored.ok)return page(409,'The connection could not be saved or has already been completed.');
res.setHeader('Set-Cookie','autoyt_state=; Secure; HttpOnly; SameSite=Lax; Path=/api/autoyt-oauth; Max-Age=0');
return page(200,'The Loop Hole connection is approved and securely saved. You can close this page. Auto-posting is not enabled yet.');
}catch{return page(500,'The connection could not be completed. No details were logged.');}}
export {eq,encrypt,cookie};
