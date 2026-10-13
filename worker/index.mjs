import nunjucks from 'nunjucks/browser/nunjucks-slim.js';
import templates from '../build/templates.mjs';
import {commit} from '../build/version.mjs';
import {session,wallet,issue,clear} from './auth.mjs';
import {elastic,publicHost,search} from './elastic.mjs';
const views=new nunjucks.Environment(new nunjucks.PrecompiledLoader(templates),{autoescape:true});
views.addGlobal('url_for',()=>'/');
views.addFilter('leaderSort',leaders=>Object.entries(leaders).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0)||a[0].localeCompare(b[0])));
views.addFilter('tojson',value=>new nunjucks.runtime.SafeString(JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')));
const respond=(body,status=200,type='text/html; charset=utf-8')=>new Response(body,{status,headers:{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
const text=(body,status=200)=>respond(body,status,'text/plain; charset=utf-8');
const json=(body,status=200)=>respond(JSON.stringify(body),status,'application/json');
const render=(name,context={})=>views.render(name,{...context,g:{preview_length:100}});
function notice(response,env,message){
 const statusMessage=message||(env.STAGING==='true'?'Synthetic staging only. Search and submission data are fixtures.':env.READ_ONLY==='true'?'The site is temporarily read-only during migration.':'');
 const escaped=statusMessage.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 return statusMessage?new HTMLRewriter().on('body',{element(e){e.prepend('<p role="status">'+escaped+'</p>',{html:true})}}).transform(response):response;
}
async function payload(request){
 const reader=request.body?.getReader();if(!reader)return null;let size=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw new Error('body_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}
}
function randomToken(){let out='';while(out.length<22){for(const x of crypto.getRandomValues(new Uint8Array(32)))if(x<234&&out.length<22)out+=String.fromCharCode(97+x%26);}return out;}
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
async function token(db,address,frozen){
 let user=await db.prepare('SELECT * FROM users WHERE address=?').bind(address).first();
 if(!user&&!frozen){await db.prepare('INSERT INTO users(address,submit_token,points_earned,points_rewarded,ctime) VALUES(?,?,0,0,?) ON CONFLICT(address) DO NOTHING').bind(address,randomToken(),new Date().toISOString().replace('T',' ').replace('Z','')).run();user=await db.prepare('SELECT * FROM users WHERE address=?').bind(address).first();}
 return user?.submit_token||null;
}
function scan(data){
 if(typeof data!=='string')throw new Error('invalid_scan');
 const line=data.split('\n').find(x=>x.includes('Nmap scan report for '));if(!line)throw new Error('invalid_scan');
 const value=line.split('Nmap scan report for ')[1].trim(),match=/^(.+?) \(([^)]+)\)$/.exec(value),ip=match?match[2]:value,hostname=match?match[1]:value;
 const ports=data.split('\n').map(x=>/^([0-9]+)\//.exec(x)?.[1]).filter(Boolean).map(Number).filter(x=>x>0);
 const list='['+ports.join(', ')+']';if(!ports.length)throw new Error('no_open_ports');if(list.length>500)throw new Error('too_many_ports');
 if(!/^[0-9a-fA-F:.]+$/.test(ip))throw new Error('invalid_scan');return {ip,hostname,ports:list};
}
async function submit(request,env){
 let data=await payload(request);if(typeof data==='string'){try{data=JSON.parse(data);}catch{return text("[!] Couldn't find necessary data");}}
 if(!data||typeof data!=='object'||!Object.hasOwn(data,'submit_token'))return text('no submit token supplied');
 if(typeof data.submit_token!=='string')return text('invalid submit token',400);
 const user=await env.DB.prepare('SELECT address FROM users WHERE submit_token=? ORDER BY address LIMIT 1').bind(data.submit_token).first();if(!user)return text('invalid submit token',401);
 let parsed;try{parsed=scan(data.nmap_data);}catch(error){return text(error.message==='no_open_ports'?'[!] No open ports found!':error.message==='too_many_ports'?"[!] More than 500 ports found. This is probably an IDS/IPS. We're going to throw the data out.":"[!] Couldn't find necessary data");}
 const source={...data,...parsed,user:user.address};delete source.submit_token;delete source.timestamp;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.address+'\0'+JSON.stringify(canonical(source))));const id=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const now=new Date().toISOString();
 await env.DB.prepare('INSERT INTO submissions(id,address,payload,state,created_at) VALUES(?,?,?,\'pending\',?) ON CONFLICT(id) DO NOTHING').bind(id,user.address,JSON.stringify({...source,timestamp:now}),now).run();
 const entry=await env.DB.prepare('SELECT * FROM submissions WHERE id=?').bind(id).first();
 if(entry.state!=='accepted'){
  const doc=JSON.parse(entry.payload);
  try{await elastic(env,'/nmap_history/_doc/'+id,doc,'PUT');await elastic(env,'/nweb_hosts/_doc/'+encodeURIComponent(doc.ip),doc,'PUT');}
  catch{return text('[-] Search index unavailable; submission is pending and points have not changed.',503);}
  await env.DB.batch([env.DB.prepare('UPDATE submissions SET state=\'accepted\' WHERE id=? AND state=\'pending\'').bind(id),env.DB.prepare('UPDATE users SET points_earned=COALESCE(points_earned,0)+1 WHERE address=? AND changes()=1').bind(user.address)]);
 }
 return text('[+] nmap successful and submitted for ip: '+parsed.ip+'\nhostname: '+parsed.hostname+'\nports: '+parsed.ports);
}
const worker={async fetch(request,env){
 if(request.method==='HEAD'){const r=await worker.fetch(new Request(request,{method:'GET'}),{...env,READ_ONLY:'true'});await r.body?.cancel();return new Response(null,{status:r.status,headers:r.headers});}
 const url=new URL(request.url),path=url.pathname;
 if(url.protocol!=='https:'){url.protocol='https:';return Response.redirect(url.toString(),308);}
 if(env.READ_ONLY==='true'&&!['GET','HEAD'].includes(request.method))return text('The site is temporarily read-only during migration.',503);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return text('Request origin does not match this site.',403);
 try{
  if(path==='/deployment.json')return json({repository:'pierce403/nweb',commit,originalHerokuCommit:'2af40220d49238d58cb7027892dd693aa8f4404a'});
  if(path==='/login'&&request.method==='POST'){
   if(!env.JWT_SECRET_KEY)return text('Authentication is temporarily unavailable.',503);
   const address=wallet(await payload(request),env.AUTH_DOMAIN);if(!address)return json({login:false},401);
   const response=json({login:true});for(const cookie of await issue(address,env.JWT_SECRET_KEY))response.headers.append('Set-Cookie',cookie);return response;
  }
  if(path==='/login'&&request.method==='GET'){
   const auth=await session(request,env.JWT_SECRET_KEY),submitToken=auth?await token(env.DB,auth.identity,env.READ_ONLY==='true'):null;
   return notice(respond(render('login.html',{user:auth?.identity||'None',submit_token:submitToken||'Unavailable during maintenance',auth_domain:env.AUTH_DOMAIN})),env);
  }
  if(path==='/authtest'){
   const auth=await session(request,env.JWT_SECRET_KEY);if(auth)return text('HELLO '+auth.identity);
   const response=new Response(null,{status:302,headers:{Location:'/login','Cache-Control':'no-store'}});for(const cookie of clear())response.headers.append('Set-Cookie',cookie);return response;
  }
  if(path==='/leaderboard'){
   const rows=(await env.DB.prepare('SELECT address,points_earned FROM users').all()).results;
   return notice(respond(render('leaderboard.html',{leaders:Object.fromEntries(rows.map(r=>[r.address,r.points_earned]))})),env);
  }
  if(path==='/submit'&&request.method==='POST')return await submit(request,env);
  if(path==='/getwork'){
   if(env.READ_ONLY==='true')return text('ERROR',503);
   try{
    for(let i=0;i<5;i++){
     const subnet=Math.floor(Math.random()*256)+'.'+Math.floor(Math.random()*256)+'.0.0/16';const result=await elastic(env,'/nweb_hosts/_search',{size:1000,query:{term:{ip:subnet}},sort:{timestamp:{order:'asc'}}});const hits=result.hits?.hits||[];if(!hits.length)continue;
     const ip=hits[Math.floor(Math.random()*hits.length)]._source.ip;const services=await elastic(env,'/masscan_services/_search',{size:1000,query:{match:{ip}}});const ports=[...new Set(services.hits.hits.map(x=>Number(x._source.port)))].sort((a,b)=>a-b);return text(JSON.stringify({type:'nmap',target:ip,ports}));
    }
   }catch{}return text('ERROR');
  }
  if(path==='/host'){
   try{const result=await elastic(env,'/nweb_hosts/_doc/'+encodeURIComponent(url.searchParams.get('h')||''),undefined,'GET');return notice(respond(render('host.html',publicHost(result._source))),env);}
   catch{return notice(respond(render('host.html',{hostname:url.searchParams.get('h')||'',nmap_data:''}),503),env,'The search index is currently unavailable.');}
  }
  if(path==='/'||path==='/search'){
   const q=url.searchParams.get('q')||'',page=Number(url.searchParams.get('p')||1),format=url.searchParams.get('f')||'';
   if(!Number.isSafeInteger(page)||page<1)return text('Invalid page',400);let result,unavailable=false;
   try{result=await search(env,q,page);}catch{result={count:0,hosts:[]};unavailable=true;}
   if(format==='json')return json(result.hosts,unavailable?503:200);
   const route=p=>'/?'+new URLSearchParams({q,p:String(p)}),context={query:q,page,numresults:result.count,hosts:result.hosts.map(x=>publicHost(x)),next_url:result.count>page*20?route(page+1):null,prev_url:page>1?route(page-1):null};
   return notice(respond(render(format==='hostlist'?'hostlist.html':'search.html',context),unavailable?503:200),env,unavailable?'The search index is currently unavailable.':undefined);
  }
  if(path==='/beta')return notice(await env.ASSETS.fetch(new Request(new URL('/beta.html',request.url),request)),env);
  if(path.startsWith('/static/')||path==='/favicon.ico')return env.ASSETS.fetch(request);
  return text('Page not found.',404);
 }catch(error){console.error('Nweb request failed');return text(error.message==='body_too_large'?'Request too large.':'Unable to process this request.',error.message==='body_too_large'?413:500);}
}};
export default {async fetch(request,env){
 const response=await worker.fetch(request,env),headers=new Headers(response.headers);
 if(env.CSP_POLICY)headers.set('Content-Security-Policy',env.CSP_POLICY);
 if(env.HSTS_POLICY)headers.set('Strict-Transport-Security',env.HSTS_POLICY);
 return new Response(response.body,{status:response.status,headers});
}};
