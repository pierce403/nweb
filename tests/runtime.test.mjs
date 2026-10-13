import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Wallet} from 'ethers';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {issue,session,wallet} from '../worker/auth.mjs';
import {SignJWT} from 'jose';
test('wallet identity and legacy JWT interface reject wrong signers, domains, expiry and tampering',async()=>{
 const owner=Wallet.createRandom(),other=Wallet.createRandom(),now=Math.floor(Date.now()/1000),bucket=now-now%600,domain='nweb.test';
 const sign=(w,d,t)=>w.signMessage(`Signing in to ${d} at ${t}`);
 assert.equal(wallet([owner.address,await sign(owner,domain,bucket)],domain,now),owner.address);
 for(const [w,d,t] of [[other,domain,bucket],[owner,'wrong.test',bucket],[owner,domain,bucket-600]])assert.equal(wallet([owner.address,await sign(w,d,t)],domain,now),null);
 const secret='synthetic-test-session-only-32-bytes';const cookies=await issue(owner.address,secret);assert.match(cookies[0],/Secure; HttpOnly; SameSite=Lax/);assert.match(cookies[1],/^csrf_access_token=/);
 const request=cookie=>new Request('https://nweb.test/authtest',{headers:{Cookie:cookie}});const valid=await session(request(cookies[0]),secret);assert.equal(valid.identity,owner.address);assert.equal(valid.type,'access');
 assert.equal(await session(request(cookies[0].replace('access_token_cookie=','access_token_cookie=broken')),secret),null);
 const expired=await new SignJWT({identity:owner.address,type:'access'}).setProtectedHeader({alg:'HS256'}).setExpirationTime(now-1).sign(new TextEncoder().encode(secret));assert.equal(await session(request('access_token_cookie='+expired),secret),null);
});
test('actual Nweb Worker preserves query formats, private token identity, retry accounting and frozen state',async()=>{
 execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--env','','--outdir','build/worker'],{stdio:'pipe'});
 let failIndex=false;const calls=[];
 const base={name:'nweb-test',modules:true,scriptPath:'build/worker/index.js',compatibilityDate:'2026-10-13',bindings:{STAGING:'false',READ_ONLY:'false',AUTH_DOMAIN:'nweb.test',JWT_SECRET_KEY:'synthetic-test-session-only-32-bytes',ELASTIC:'https://fixture-user:fixture-pass@elastic.test',CSP_POLICY:"default-src 'self' 'unsafe-inline'; img-src 'self' data:",HSTS_POLICY:'max-age=31556926; includeSubDomains'},d1Databases:{DB:'synthetic-users'},assets:{directory:'build/assets',binding:'ASSETS',run_worker_first:true,html_handling:'none'},outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'elastic.test');assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(request.headers.get('Authorization'),'Basic '+btoa('fixture-user:fixture-pass'));const body=request.method==='GET'?null:await request.json();calls.push({path:url.pathname,method:request.method,body});
  if(failIndex)return new Response('{}',{status:503,headers:{'Content-Type':'application/json'}});
  if(url.pathname.startsWith('/masscan_services/'))return Response.json({hits:{hits:[{_source:{port:443}}]}});
  if(request.method==='PUT'){assert.equal(body.submit_token,undefined);return Response.json({result:'created'});}
  const doc={ip:'203.0.113.10',hostname:'<script>fixture</script>',ports:'[443]',timestamp:'2026-10-13T00:00:00',nmap_data:Array.from({length:105},(_,i)=>'line '+i).join('\n')+'\n<script>fixture</script>',submit_token:'legacy-token-must-not-leak',custom_field:'retained'};
  return Response.json(url.pathname.includes('/_doc/')?{_source:doc}:{hits:{total:{value:41},hits:[{_source:doc}]}});
 }};
 const convert=options=>{const result=convertV4MiniflareOptions(options);result.workers[0].config.assets.hasUserWorker=true;result.workers[0].config.assets.htmlHandling='none';return result;};
 const mf=new Miniflare(convert(base));
 try{
  let db=await mf.getD1Database('DB');for(const sql of fs.readFileSync('migrations/0001_users.sql','utf8').split(';').filter(x=>x.trim()))await db.prepare(sql).run();
  let r=await mf.dispatchFetch('https://nweb.test/?q=synthetic&p=2');assert.equal(r.status,200,'Synthetic index calls: '+JSON.stringify(calls));assert.equal(r.headers.get('Content-Security-Policy'),base.bindings.CSP_POLICY);assert.equal(r.headers.get('Strict-Transport-Security'),base.bindings.HSTS_POLICY);let html=await r.text();assert.match(html,/nweb.io/);assert.match(html,/&lt;script&gt;fixture/);assert.doesNotMatch(html,/<script>fixture/);assert.match(html,/line 99/);assert.doesNotMatch(html,/line 100/);assert.equal(calls.at(-1).body.from,20);assert.equal(calls.at(-1).body.query.query_string.query,'synthetic');
  r=await mf.dispatchFetch('https://nweb.test/search?q=synthetic&f=json');const results=await r.json();assert.equal(results[0].custom_field,'retained');assert.equal(results[0].submit_token,undefined);assert.equal(results[0].nmap_preview,undefined);
  r=await mf.dispatchFetch('https://nweb.test/?f=hostlist');assert.match(await r.text(),/203.0.113.10/);
  r=await mf.dispatchFetch('https://nweb.test/getwork');assert.deepEqual(JSON.parse(await r.text()),{type:'nmap',target:'203.0.113.10',ports:[443]});
  r=await mf.dispatchFetch('https://nweb.test/host?h=203.0.113.10');assert.match(await r.text(),/&lt;script&gt;fixture/);
  r=await mf.dispatchFetch('https://nweb.test/login',{headers:{'X-Wallet-Address':Wallet.createRandom().address}});assert.match(await r.text(),/id="wallet-login"/);assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').first()).n,0);
  const owner=Wallet.createRandom(),now=Math.floor(Date.now()/1000),epoch=now-now%600,signature=await owner.signMessage(`Signing in to nweb.test at ${epoch}`);
  r=await mf.dispatchFetch('https://nweb.test/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([owner.address,signature])});assert.equal(r.status,200);assert.deepEqual(await r.json(),{login:true});const cookie=r.headers.getSetCookie()[0].split(';')[0];
  r=await mf.dispatchFetch('https://nweb.test/login',{headers:{Cookie:cookie}});html=await r.text();const user=await db.prepare('SELECT * FROM users WHERE address=?').bind(owner.address).first();assert.match(user.submit_token,/^[a-z]{22}$/);assert.ok(html.includes(user.submit_token));
  r=await mf.dispatchFetch('https://nweb.test/authtest',{headers:{Cookie:cookie}});assert.equal(await r.text(),'HELLO '+owner.address);
  const scan='Nmap scan report for synthetic.example (203.0.113.10)\n443/tcp open https\nSynthetic report only.';
  const send=(report=scan)=>mf.dispatchFetch('https://nweb.test/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({submit_token:user.submit_token,nmap_data:report}))});
  const submits=await Promise.all(Array.from({length:4},async()=>{const response=await send();assert.equal(response.status,200);await response.text();}));
  assert.equal((await db.prepare('SELECT points_earned FROM users WHERE address=?').bind(owner.address).first()).points_earned,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM submissions').first()).n,1);
  failIndex=true;r=await send(scan+'\nSecond controlled fixture.');assert.equal(r.status,503);await r.text();assert.equal((await db.prepare('SELECT points_earned FROM users WHERE address=?').bind(owner.address).first()).points_earned,1);
  r=await mf.dispatchFetch('https://nweb.test/');assert.equal(r.status,503);assert.match(await r.text(),/search index is currently unavailable/);failIndex=false;
  r=await send(scan+'\nSecond controlled fixture.');assert.equal(r.status,200);await r.text();assert.equal((await db.prepare('SELECT points_earned FROM users WHERE address=?').bind(owner.address).first()).points_earned,2);
  r=await mf.dispatchFetch('https://nweb.test/leaderboard');assert.match(await r.text(),new RegExp(owner.address));assert.match(await mf.dispatchFetch('https://nweb.test/static/css/bootstrap.min.css').then(x=>x.text()),/Bootstrap/);
  r=await mf.dispatchFetch('https://nweb.test/beta',{redirect:'manual'});assert.equal(r.status,200);assert.match(await r.text(),/nweb/i);
  r=await mf.dispatchFetch('https://nweb.test/missing');assert.equal(r.status,404);await r.text();r=await mf.dispatchFetch('http://nweb.test/search?q=x',{redirect:'manual'});assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://nweb.test/search?q=x');await r.text();
  const snapshot=async()=>JSON.stringify((await db.prepare('SELECT * FROM users ORDER BY address').all()).results);const before=await snapshot();const headOwner=Wallet.createRandom(),headCookies=await issue(headOwner.address,base.bindings.JWT_SECRET_KEY);r=await mf.dispatchFetch('https://nweb.test/login',{method:'HEAD',headers:{Cookie:headCookies[0].split(';')[0]}});assert.equal(r.status,200);assert.equal(await snapshot(),before);await mf.setOptions(convert({...base,bindings:{...base.bindings,READ_ONLY:'true'}}));db=await mf.getD1Database('DB');
  r=await mf.dispatchFetch('https://nweb.test/getwork');assert.equal(r.status,503);assert.equal(await r.text(),'ERROR');r=await send();assert.equal(r.status,503);await r.text();r=await mf.dispatchFetch('https://nweb.test/login',{headers:{Cookie:cookie}});assert.match(await r.text(),/temporarily read-only/);assert.equal(await snapshot(),before);
  const missing=Wallet.createRandom(),missingCookies=await issue(missing.address,base.bindings.JWT_SECRET_KEY);r=await mf.dispatchFetch('https://nweb.test/login',{headers:{Cookie:missingCookies[0].split(';')[0]}});assert.match(await r.text(),/Unavailable during maintenance/);assert.equal(await snapshot(),before);
 }finally{await mf.dispose();}
});
