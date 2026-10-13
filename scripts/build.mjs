import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import nunjucks from 'nunjucks';
fs.mkdirSync('build/assets',{recursive:true});fs.mkdirSync('build/worker',{recursive:true});
fs.cpSync('static','build/assets/static',{recursive:true});
fs.copyFileSync('templates/index.html','build/assets/beta.html');
const templateEnv=new nunjucks.Environment(null,{autoescape:true});
let compiled='const window={nunjucksPrecompiled:{}};\n';
for(const name of fs.readdirSync('templates').filter(n=>n.endsWith('.html'))){
 let source=fs.readFileSync(path.join('templates',name),'utf8');
 if(name==='search.html')source=source.replace(/\{% set lines = host\.nmap_data\.split[\s\S]*?<\/pre>/,`{% if host.preview_truncated %}<pre class="nmap_data">{{host.nmap_preview}}</pre>`).replace(/\{% if lines\|length > g\.preview_length %\}/,'');
 if(name==='login.html')source=source.replace("onclick='login();'",'id="wallet-login"').replace(/<script src="static\/ethers-v4.min.js"><\/script>/,'').replace('<script src="static/metamask_login.js"></script>', '<meta name="auth-domain" content="{{auth_domain}}"><script src="/static/metamask_login.js"></script>');
 if(name==='leaderboard.html')source=source.replace("leaders|dictsort(by='value',reverse=true)",'leaders|leaderSort');
 if(name==='scripts.html')source='<script src="/static/navigation.js"></script>';
 compiled+=nunjucks.precompileString(source,{name,env:templateEnv})+'\n';
}
compiled+='export default window.nunjucksPrecompiled;\n';fs.writeFileSync('build/templates.mjs',compiled);
await build({entryPoints:['client/login.mjs'],outfile:'build/assets/static/metamask_login.js',bundle:true,minify:true,platform:'browser',target:'es2022'});
fs.writeFileSync('build/assets/static/navigation.js',`document.querySelector('.navbar-toggle')?.addEventListener('click',()=>document.querySelector('#navbar')?.classList.toggle('in'));\n`);
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.writeFileSync('build/version.mjs',`export const commit=${JSON.stringify(commit)};\n`);
fs.writeFileSync('build/assets/deployment.json',JSON.stringify({repository:'pierce403/nweb',commit,originalHerokuCommit:'2af40220d49238d58cb7027892dd693aa8f4404a'})+'\n');
