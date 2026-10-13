const fixture={ip:'203.0.113.10',hostname:'synthetic.example',ports:'[443]',timestamp:'2026-10-13T00:00:00',nmap_data:'Nmap scan report for synthetic.example (203.0.113.10)\n443/tcp open https\nSynthetic fixture only.'};
export async function elastic(env,path,body,method='POST'){
 if(env.STAGING==='true'){
  if(method==='PUT')return {result:'updated'};
  if(path.includes('/_doc/'))return {_source:fixture};
  if(path.startsWith('/masscan_services/'))return {hits:{hits:[{_source:{port:443}}]}};
  return {hits:{total:{value:1},hits:[{_source:fixture}]}};
 }
 if(!env.ELASTIC)throw new Error('index_unavailable');
 const url=new URL(env.ELASTIC);if(url.protocol!=='https:')throw new Error('index_tls_required');
 const headers={'Content-Type':'application/json'};
 if(url.username||url.password){const text=decodeURIComponent(url.username)+':'+decodeURIComponent(url.password);headers.Authorization='Basic '+btoa(String.fromCharCode(...new TextEncoder().encode(text)));}
 url.username='';url.password='';url.pathname=url.pathname.replace(/\/$/,'')+path;
 const response=await fetch(url,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000),redirect:'manual'});
 if(!response.ok){await response.body?.cancel();throw new Error('index_unavailable');}
 return response.json();
}
export function publicHost(value,preview=true){
 const out=Object.fromEntries(Object.entries(value).filter(([key])=>!['submit_token','__proto__','prototype','constructor'].includes(key)));
 if(preview){const lines=String(out.nmap_data||'').split('\n');out.nmap_preview=lines.slice(0,100).join('\n');out.preview_truncated=lines.length>100;}
 return out;
}
export async function search(env,query,page){
 const result=await elastic(env,'/nweb_hosts/_search',{size:20,from:20*(page-1),track_total_hits:true,query:{query_string:{query:query||'nmap',default_operator:'AND'}},sort:{timestamp:{order:'desc'}}});
 return {count:typeof result.hits.total==='number'?result.hits.total:result.hits.total?.value||0,hosts:result.hits.hits.map(x=>publicHost(x._source,false))};
}
