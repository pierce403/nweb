import {verifyMessage} from 'ethers';
import {SignJWT,jwtVerify} from 'jose';
const key=secret=>new TextEncoder().encode(secret);
export async function session(request,secret){
 const cookie=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('access_token_cookie='));
 if(!cookie||!secret)return null;
 try{const {payload}=await jwtVerify(decodeURIComponent(cookie.slice(20)),key(secret),{algorithms:['HS256']});return payload.type==='access'&&typeof payload.identity==='string'?payload:null;}catch{return null;}
}
export function wallet(body,domain,now=Math.floor(Date.now()/1000)){
 if(!Array.isArray(body)||body.length!==2||typeof body[0]!=='string'||typeof body[1]!=='string')return null;
 try{const recovered=verifyMessage(`Signing in to ${domain} at ${now-now%600}`,body[1]);return recovered===body[0]?recovered:null;}catch{return null;}
}
export async function issue(address,secret){
 const now=Math.floor(Date.now()/1000),csrf=crypto.randomUUID();
 const token=await new SignJWT({identity:address,type:'access',fresh:false,csrf,jti:crypto.randomUUID()}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuedAt(now).setNotBefore(now).setExpirationTime(now+900).sign(key(secret));
 return [`access_token_cookie=${token}; Path=/; Secure; HttpOnly; SameSite=Lax`,`csrf_access_token=${csrf}; Path=/; Secure; SameSite=Lax`];
}
export function clear(){return ['access_token_cookie=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax','csrf_access_token=; Path=/; Max-Age=0; Secure; SameSite=Lax'];}
