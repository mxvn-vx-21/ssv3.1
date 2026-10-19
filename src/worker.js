import{clean,o,norm,csvCell,diff,refCat,devCat,imgNameOk,sniffImage}from'./lib.js';
const CSP="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'";
const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...h}});
const enc=s=>new TextEncoder().encode(s),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',enc(s))),rand=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const E=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q=(env,sql,...a)=>env.DB.prepare(sql).bind(...a);
const audit=(env,a,d='')=>q(env,'INSERT INTO audit(at,action,detail) VALUES(?,?,?)',Date.now(),a,String(d).slice(0,300)).run();
const STATUS=['Draft','Ready for Review','Changes Requested','Approved','Archived'],LEAD=['New','Reviewing','Replied','In Progress','Completed','Archived'];
const safeJ=(s,d={})=>{try{return JSON.parse(s)}catch{return d}},cut=v=>typeof v==='string'?v.slice(0,120):v;

const wrap=(type,c)=>({schemaVersion:1,siteId:'stencyl',exportType:type,exportedAt:new Date().toISOString(),...c});

// ---------- data ----------
let SEED;
async function seed(env){if(!SEED){const t=await(await env.ASSETS.fetch('https://x/index.tpl')).text();SEED=clean(JSON.parse(t.match(/id="site-config">([\s\S]*?)<\/script>/)[1])).c}return structuredClone(SEED)}
async function getSite(env,id){let r=await q(env,'SELECT json,updated,version FROM site WHERE id=?',id).first();
 if(!r){await q(env,'INSERT OR IGNORE INTO site VALUES(?,?,?,1)',id,JSON.stringify(await seed(env)),Date.now()).run();r=await q(env,'SELECT json,updated,version FROM site WHERE id=?',id).first()}
 return{c:norm(JSON.parse(r.json)),updated:r.updated,version:r.version}}
async function rl(env,key,max,win,ip){const k=key+':'+ip,now=Date.now(),r=await q(env,'SELECT count,reset FROM rl WHERE k=?',k).first();
 if(!r||r.reset<now){await q(env,'INSERT OR REPLACE INTO rl VALUES(?,?,?)',k,1,now+win).run();return true}
 if(r.count>=max)return false;await q(env,'UPDATE rl SET count=count+1 WHERE k=?',k).run();return true}
const SEC={'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=()','x-frame-options':'SAMEORIGIN'};
const NF='<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>404 — $TENCYL</title><link rel="icon" href="/favicon.png"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080808;color:#fff;font:16px system-ui,sans-serif;text-align:center}h1{font-size:96px;margin:0}a{color:#fff;border:1px solid #333;padding:10px 18px;text-decoration:none;display:inline-block;margin-top:14px;background:rgba(255,255,255,.06)}</style></head><body><div><h1>404</h1><p style="color:#8d8d8d">This page doesn’t exist.</p><a href="/">Back to $TENCYL</a></div></body></html>';
function render(env,url,c0,priv){const c=norm(c0);return env.ASSETS.fetch('https://x/index.tpl').then(async r=>{let h=await r.text();const se=c.site.seo||{},origin=url.origin,title=se.title||c.site.brand,desc=se.description||c.site.tagline;
 h=h.replace(/<script type="application\/json" id="site-config">[\s\S]*?<\/script>/,()=>`<script type="application/json" id="site-config">${JSON.stringify(c).replace(/</g,'\\u003c')}</script>`);
 h=h.replace(/<title>[^<]*<\/title>/,()=>`<title>${E(title)}</title>`).replace(/(<meta name="description" content=")[^"]*"/,(m,a)=>a+E(desc)+'"');
 const meta=`<meta property="og:type" content="website"><meta property="og:title" content="${E(title)}"><meta property="og:description" content="${E(desc)}"><meta property="og:image" content="${origin}/og.png"><meta name="twitter:card" content="summary_large_image">`+(priv?'<meta name="robots" content="noindex,nofollow">':`<link rel="canonical" href="${origin}/"><meta property="og:url" content="${origin}/"><script>window.TN_LIVE=1</script>`);
 h=h.replace('</head>',()=>meta+'</head>');
 return new Response(h,{headers:{'content-type':'text/html;charset=utf-8','content-security-policy':CSP,...SEC,'cache-control':priv?'no-store':'public, max-age=60',...(priv?{'x-robots-tag':'noindex'}:{})}})})}

// ---------- auth ----------
const cookie=(req,n)=>(req.headers.get('cookie')||'').split(/;\s*/).map(x=>x.split('=')).find(x=>x[0]===n)?.[1];
async function sess(req,env){const t=cookie(req,'__Host-sid');if(!t)return null;const r=await q(env,'SELECT csrf,expires FROM sessions WHERE hash=?',await sha(t)).first();return r&&r.expires>Date.now()?r:null}
async function login(req,env,ip){
 if(!(await rl(env,'login',5,15*60e3,ip)))return J({error:'Too many attempts. Try again in 15 minutes.'},429);
 const b=await req.json().catch(()=>({}));if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)return J({error:'Server not configured: set ADMIN_PASSWORD (12+ chars).'},503);
 const A=await crypto.subtle.digest('SHA-256',enc(String(b.password||''))),B=await crypto.subtle.digest('SHA-256',enc(env.ADMIN_PASSWORD));
 if(!crypto.subtle.timingSafeEqual(A,B)){await audit(env,'login.fail',ip);return J({error:'Invalid password'},401)}
 const t=rand(),csrf=rand();await q(env,'DELETE FROM sessions WHERE expires<?',Date.now()).run();
 await q(env,'INSERT INTO sessions VALUES(?,?,?)',await sha(t),csrf,Date.now()+8*3600e3).run();await audit(env,'login.ok',ip);
 return J({ok:true},200,{'set-cookie':`__Host-sid=${t}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`})}

// ---------- inquiries, notifications, analytics ----------
const ICOLS='id,json,delivery,created,status,tags,notes_internal,client_id,email_status,discord_status';
async function inqSel(env,where='',args=[],tail=''){try{return(await q(env,`SELECT ${ICOLS} FROM inquiries ${where} ${tail}`,...args).all()).results}catch(e){if(where)throw e;return(await q(env,`SELECT id,json,delivery,created FROM inquiries ${tail}`).all()).results}}
const inqFmt=r=>({id:r.id,ref:r.id.slice(0,8).toUpperCase(),created:r.created,delivery:safeJ(r.delivery),status:r.status||'New',tags:safeJ(r.tags,[]),internalNotes:r.notes_internal||'',clientId:r.client_id||null,emailStatus:r.email_status||'unknown',discordStatus:r.discord_status||'unknown',...safeJ(r.json)});
async function linkedInq(env,cid){try{return(await q(env,'SELECT id,json FROM inquiries WHERE client_id=?',cid).all()).results.map(r=>({ref:r.id.slice(0,8).toUpperCase(),name:safeJ(r.json).name}))}catch{return[]}}
async function snap(env,c,action,prev){try{const ver=(await q(env,'SELECT version FROM site WHERE id=?','live').first()).version,n=prev?diff(prev,c).length:0;await q(env,'INSERT INTO versions(version,at,action,summary,json) VALUES(?,?,?,?,?)',ver,Date.now(),action,`${n} field change${n===1?'':'s'}`,JSON.stringify(c)).run();await q(env,'DELETE FROM versions WHERE id NOT IN (SELECT id FROM versions ORDER BY id DESC LIMIT 50)').run()}catch(e){console.error('snapshot failed (migration applied?)',e.message)}}
async function deliver(env,id,d,only){
 const ref=id.slice(0,8).toUpperCase(),text=`New inquiry [${ref}]\nName: ${d.name}\nEmail: ${d.email}\nBusiness: ${d.business}\nType: ${d.type}\nBudget: ${d.budget}\nDeadline: ${d.deadline}\nURL: ${d.url}\nFeatures: ${(d.features||[]).join(', ')}\n\n${d.desc}\n\nNotes: ${d.notes}`,job={};
 if(!only||only.includes('email'))job.email=env.RESEND_API_KEY?fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json','idempotency-key':id+'-email'},body:JSON.stringify({from:'$TENCYL <no-reply@stencylstudio.com>',to:['bmw@marvel.wtf'],reply_to:d.email,subject:`[${ref}] New inquiry: ${d.type} — ${d.name}`.slice(0,150),text})}).then(r=>{if(!r.ok)throw new Error('resend '+r.status)}):Promise.reject(new Error('not configured'));
 if(!only||only.includes('discord'))job.discord=env.DISCORD_WEBHOOK_URL?fetch(env.DISCORD_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({allowed_mentions:{parse:[]},content:('```\n'+text.replace(/`/g,"'")).slice(0,1900)+'\n```'})}).then(r=>{if(!r.ok)throw new Error('discord '+r.status)}):Promise.reject(new Error('not configured'));
 const ks=Object.keys(job),res=await Promise.allSettled(ks.map(k=>job[k])),st={},er={};
 ks.forEach((k,i)=>{const ok=res[i].status==='fulfilled';st[k]=ok?'sent':'failed';er[k]=ok?'sent':'failed: '+res[i].reason.message});return{st,er}}
async function inquiry(req,env,ip){
 const t=await req.text();if(t.length>20000)return J({error:'Too large'},413);let b;try{b=JSON.parse(t)}catch{return J({error:'Invalid request'},400)}
 const s=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
 const d={name:s(b.name,100),email:s(b.email,200),business:s(b.business,120),type:s(b.type,60),budget:s(b.budget,20),deadline:s(b.deadline,20),url:s(b.url,300),desc:s(b.desc,1000),notes:s(b.notes,500),features:Array.isArray(b.features)?b.features.slice(0,12).map(f=>s(f,60)):[]};
 if(!d.name||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)||!d.type||d.desc.length<10)return J({error:'Please complete name, valid email, project type and description.'},422);
 if(d.url&&!/^https?:\/\/\S+$/.test(d.url))return J({error:'Website URL must start with http(s)://'},422);
 if(!(await rl(env,'inq',5,3600e3,ip)))return J({error:'Too many submissions. Please try again later.'},429);
 if(!(await rl(env,'dup',1,600e3,await sha(d.email+d.desc))))return J({error:'This inquiry was already received.'},409);
 const id=crypto.randomUUID(),ref=id.slice(0,8).toUpperCase();
 await q(env,'INSERT INTO inquiries(id,json,delivery,created) VALUES(?,?,?,?)',id,JSON.stringify(d),'{}',Date.now()).run();
 await q(env,"UPDATE inquiries SET email_status='pending',discord_status='pending' WHERE id=?",id).run().catch(()=>{});
 const{st,er}=await deliver(env,id,d);
 await q(env,'UPDATE inquiries SET delivery=? WHERE id=?',JSON.stringify(er),id).run();
 await q(env,'UPDATE inquiries SET email_status=?,discord_status=? WHERE id=?',st.email,st.discord,id).run().catch(()=>{});
 if(st.email==='failed'||st.discord==='failed')console.error('inquiry delivery',id,JSON.stringify(er));
 if(st.email==='failed'&&st.discord==='failed')return J({error:`Your message was saved (reference ${ref}) but notifications could not be sent yet. Please try again later.`,ref},502);
 return J({ok:true,ref})}
async function events(req,env){const no=s=>new Response(null,{status:s});if(req.headers.get('dnt')==='1')return no(204);if(!(await rl(env,'ev',600,60e3,'all')))return no(204);
 let b;try{const t=await req.text();if(t.length>500)return no(413);b=JSON.parse(t)}catch{return no(400)}
 if(!['view','cta','project','form_start','form_submit'].includes(b.t))return no(400);
 const p=typeof b.p==='string'?b.p.replace(/[^\w.\- :]/g,'').slice(0,60):'',ref=refCat(typeof b.r==='string'?b.r.slice(0,100):'',new URL(req.url).hostname);
 try{await q(env,'INSERT INTO events(day,t,p,ref,dev,n) VALUES(?,?,?,?,?,1) ON CONFLICT(day,t,p,ref,dev) DO UPDATE SET n=n+1',new Date().toISOString().slice(0,10),b.t,p,ref,devCat(req.headers.get('user-agent'))).run()}catch{}
 return no(204)}

// ---------- image host: R2 if bound as IMAGES, otherwise D1 (base64, ~1.3 MB cap) ----------
const IMG_MAX_R2=5*1024*1024,IMG_MAX_D1=1300*1024;
const b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)},unb64=s=>{const t=atob(s),u=new Uint8Array(t.length);for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u};
const imgStore={
 async get(env,n){if(env.IMAGES){const x=await env.IMAGES.get('img/'+n);return x?{body:x.body,type:x.httpMetadata?.contentType,size:x.size,created:+(x.customMetadata?.created||0)}:null}const r=await q(env,'SELECT type,size,created,data FROM images WHERE name=?',n).first();return r?{body:unb64(r.data),type:r.type,size:r.size,created:r.created}:null},
 async has(env,n){if(env.IMAGES)return!!(await env.IMAGES.head('img/'+n));return!!(await q(env,'SELECT 1 x FROM images WHERE name=?',n).first())},
 async put(env,n,buf,type,label){if(env.IMAGES)return env.IMAGES.put('img/'+n,buf,{httpMetadata:{contentType:type},customMetadata:{label,created:String(Date.now())}});await q(env,'INSERT OR REPLACE INTO images(name,type,size,label,data,created) VALUES(?,?,?,?,?,?)',n,type,buf.length,label,b64(buf),Date.now()).run()},
 async list(env){if(env.IMAGES){const l=await env.IMAGES.list({prefix:'img/',limit:1000,include:['customMetadata','httpMetadata']});return l.objects.map(x=>({name:x.key.slice(4),type:x.httpMetadata?.contentType,size:x.size,label:x.customMetadata?.label||'',created:+(x.customMetadata?.created||0)||new Date(x.uploaded).getTime()})).sort((a,b)=>b.created-a.created)}return(await q(env,'SELECT name,type,size,label,created FROM images ORDER BY created DESC LIMIT 1000').all()).results},
 async del(env,n){if(env.IMAGES)return env.IMAGES.delete('img/'+n);await q(env,'DELETE FROM images WHERE name=?',n).run()}};
async function imagesApi(req,env,url,seg){const m=req.method,name=seg[1],mode=env.IMAGES?'r2':'d1',max=mode==='r2'?IMG_MAX_R2:IMG_MAX_D1;
 try{
  if(m==='GET'&&!name)return J({storage:mode,max,items:await imgStore.list(env)});
  if(m==='POST'&&!name){const n=(req.headers.get('x-name')||'').toLowerCase(),label=(()=>{try{return decodeURIComponent(req.headers.get('x-label')||'').slice(0,100)}catch{return''}})();
   if(!imgNameOk(n))return J({error:'Name: 1–60 characters, a–z, 0–9, dash or underscore, and not a reserved word.'},422);
   if((+req.headers.get('content-length')||0)>max+4096)return J({error:`Image too large (max ${Math.round(max/1024)} KB on this storage).`},413);
   const buf=new Uint8Array(await req.arrayBuffer());if(!buf.length)return J({error:'Empty file'},422);if(buf.length>max)return J({error:`Image too large (max ${Math.round(max/1024)} KB on this storage).`},413);
   const type=sniffImage(buf);if(!type)return J({error:'Only PNG, JPEG, GIF, WebP or AVIF images are accepted (checked by file content).'},415);
   if(req.headers.get('x-overwrite')!=='1'&&await imgStore.has(env,n))return J({error:'An image with that name already exists.',exists:true},409);
   await imgStore.put(env,n,buf,type,label);await audit(env,'image.upload',n);return J({ok:true,name:n,url:`${url.origin}/${n}`,type,size:buf.length})}
  if(m==='DELETE'&&name){if(!imgNameOk(name))return J({error:'Invalid name'},400);const usedIn=[];for(const k of['live','draft']){const j=JSON.stringify((await getSite(env,k)).c);if(j.includes('/'+name+'"')||j.includes('/'+name+'.'))usedIn.push(k)}
   if(usedIn.length&&url.searchParams.get('force')!=='1')return J({error:`“${name}” is referenced by your ${usedIn.join(' and ')} website content. Deleting it will break those images.`,usedIn},409);
   await imgStore.del(env,name);await audit(env,'image.delete',name);return J({ok:true})}
  return J({error:'Not found'},404)
 }catch(e){if(/no such table/i.test(e.message))return J({error:'Image storage is not set up. Run migrations/0003_images.sql (or bind an R2 bucket as IMAGES).'},503);throw e}}

// ---------- admin API ----------
async function admin(req,env,url,p){
 const s=await sess(req,env);if(!s)return J({error:'Unauthorized'},401);const m=req.method;
 if(m!=='GET'){const og=req.headers.get('origin');if(req.headers.get('x-csrf')!==s.csrf||(og&&new URL(og).host!==url.host))return J({error:'CSRF check failed'},403)}
 if(p.split('/')[3]==='images')return imagesApi(req,env,url,p.split('/').slice(3));
 let b={};if(['POST','PUT','PATCH'].includes(m)){const t=await req.text();if(t.length>1e6)return J({error:'Payload too large'},413);try{b=t?JSON.parse(t):{}}catch{return J({error:'Invalid JSON'},400)}}
 const[a,id,x]=p.split('/').slice(3),V=clean,bad=v=>J({error:'Validation failed',errors:v.E},422);
 if(a==='me')return J({csrf:s.csrf});
 if(a==='stats'){const[l,d]=await Promise.all([getSite(env,'live'),getSite(env,'draft')]),n=async(sql,...p)=>(await q(env,sql,...p).first()).n,t=async f=>{try{return await f()}catch{return null}};
  const nw=await t(()=>n("SELECT COUNT(*) n FROM inquiries WHERE status='New'")),aw=await t(()=>n("SELECT COUNT(*) n FROM inquiries WHERE status IN('New','Reviewing')")),fl=await t(()=>n("SELECT COUNT(*) n FROM inquiries WHERE email_status='failed' OR discord_status='failed'"));
  const pb=await q(env,"SELECT at FROM audit WHERE action IN('publish','restore') ORDER BY id DESC LIMIT 1").first(),ex=await q(env,"SELECT at FROM audit WHERE action LIKE 'export%' ORDER BY id DESC LIMIT 1").first(),rc=(await q(env,"SELECT at,action,detail FROM audit WHERE action NOT LIKE 'login.%' AND action<>'error' ORDER BY id DESC LIMIT 12").all()).results;
  return J({totalProjects:d.c.projects.length,published:l.c.projects.filter(x=>x.visible).length,draftProjects:d.c.projects.filter(x=>!x.visible).length,clients:await n('SELECT COUNT(*) n FROM clients'),inquiries:await n('SELECT COUNT(*) n FROM inquiries'),newInquiries:nw,awaiting:aw,failedDeliveries:fl,liveVersion:l.version,liveUpdated:l.updated,lastPublish:pb?.at||null,draftUpdated:d.updated,lastExport:ex?.at||null,draftDiffersFromLive:JSON.stringify(l.c)!==JSON.stringify(d.c),recent:rc,migrated:nw!==null})}
 if(a==='site'&&m==='GET'){const[d,l]=await Promise.all([getSite(env,'draft'),getSite(env,'live')]);return J({draft:d.c,draftUpdated:d.updated,liveVersion:l.version})}
 if(a==='site'&&m==='PUT'){const v=V(b.config);if(v.E.length)return bad(v);const cu=await getSite(env,'draft');if(b.baseUpdated&&b.baseUpdated!==cu.updated)return J({error:'This draft was changed elsewhere since you loaded it. Reload before saving.'},409);const u=Math.max(Date.now(),cu.updated+1),r=await q(env,'UPDATE site SET json=?,updated=? WHERE id=? AND updated=?',JSON.stringify(v.c),u,'draft',cu.updated).run();if(!r.meta.changes)return J({error:'Concurrent change detected. Reload and retry.'},409);await audit(env,'draft.save');return J({ok:true,config:v.c,updated:u})}
 if(a==='publish'&&m==='POST'){if(b.confirm!==true)return J({error:'Confirmation required'},400);const d=await getSite(env,'draft'),v=V(d.c);if(v.E.length)return bad(v);const prev=(await getSite(env,'live')).c;
  await q(env,'UPDATE site SET json=?,updated=?,version=version+1 WHERE id=?',JSON.stringify(v.c),Date.now(),'live').run();await snap(env,v.c,'publish',prev);await audit(env,'publish');return J({ok:true,note:'The live site now serves this configuration from D1. Git source files are unchanged; export JSON if you also want it in the repo.'})}
 if(a==='export'&&m==='GET'){let out,name;const day=new Date().toISOString().slice(0,10);
  if(id==='live'){out=wrap('public',(await getSite(env,'live')).c);name=`stencyl-public-${day}.json`}
  else if(id==='draft'){out=wrap('draft',(await getSite(env,'draft')).c);name=`stencyl-draft-${day}.json`}
  else if(id==='client'){const r=await q(env,'SELECT * FROM clients WHERE id=?',x).first();if(!r)return J({error:'Not found'},404);out={...wrap('client-draft',norm(JSON.parse(r.json))),client:{label:r.label,name:r.name,status:r.status}};name=`stencyl-client-${r.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'draft'}.json`}
  else if(id==='bundle'||id==='backup'){const cl=(await q(env,'SELECT * FROM clients').all()).results.map(r=>({label:r.label,name:r.name,status:r.status,notes:r.notes,config:norm(JSON.parse(r.json))}));
   out={schemaVersion:1,siteId:'stencyl',exportType:id,exportedAt:new Date().toISOString(),live:(await getSite(env,'live')).c,draft:(await getSite(env,'draft')).c,clients:cl};
   if(id==='backup')out.inquiries=(await inqSel(env)).map(inqFmt);name=`stencyl-${id}-${day}.json`}
  else return J({error:'Unknown export'},404);
  const chk=id==='bundle'||id==='backup'?[out.live,out.draft,...out.clients.map(c=>c.config)].map(clean):[clean(out)];if(chk.some(v=>v.E.length))return J({error:'Export failed validation',errors:chk.flatMap(v=>v.E)},500);
  await audit(env,'export.'+id);return J(out,200,{'content-disposition':`attachment; filename="${name}"`})}
 if(a==='import'&&m==='POST'){const d=o(b.data);if(!['public','draft','client-draft'].includes(d.exportType))return J({error:'Unsupported file. Import single-config exports (public, draft or client-draft).'},422);
  const v=V(d);if(v.E.length)return bad(v);let before=null,tgt=b.target;
  if(tgt==='draft')before=(await getSite(env,'draft')).c;else if(String(tgt).startsWith('client:')){const r=await q(env,'SELECT json FROM clients WHERE id=?',tgt.slice(7)).first();if(!r)return J({error:'Target client not found'},404);before=JSON.parse(r.json)}else if(tgt!=='client-new')return J({error:'Invalid target'},400);
  const sum={brand:v.c.site.brand,projects:v.c.projects.length,pricing:v.c.pricing.length,replaces:before?{projects:before.projects.length,pricing:before.pricing.length,brand:before.site.brand}:'creates a new client draft; nothing is overwritten'};
  if(b.dryRun!==false)return J({ok:true,dryRun:true,summary:sum});if(b.confirm!==true)return J({error:'Confirmation required'},400);
  if(tgt==='draft'){await getSite(env,'draft');await q(env,'UPDATE site SET json=?,updated=? WHERE id=?',JSON.stringify(v.c),Date.now(),'draft').run()}
  else if(tgt==='client-new'){const l=String(b.label||'Imported client').slice(0,80),cid=crypto.randomUUID(),n=Date.now();await q(env,'INSERT INTO clients VALUES(?,?,?,?,?,?,?,?)',cid,l,String(d.client?.name||l).slice(0,80),'Draft','',JSON.stringify(v.c),n,n).run();sum.id=cid}
  else await q(env,'UPDATE clients SET json=?,updated=? WHERE id=?',JSON.stringify(v.c),Date.now(),tgt.slice(7)).run();
  await audit(env,'import',tgt);return J({ok:true,summary:sum})}
 if(a==='versions'){
  if(!id)return J({items:(await q(env,'SELECT id,version,at,action,summary FROM versions ORDER BY id DESC LIMIT 50').all()).results});
  if(id==='diff'){const g=async i=>i===0?(await getSite(env,'live')).c:safeJ((await q(env,'SELECT json FROM versions WHERE id=?',i).first())?.json,null),A=await g(+url.searchParams.get('a')),B=await g(+url.searchParams.get('b'));if(!A||!B)return J({error:'Version not found'},404);return J({changes:diff(A,B).map(x=>({path:x.path,from:cut(x.from),to:cut(x.to)}))})}
  if(x==='restore'&&m==='POST'){if(b.confirm!==true)return J({error:'Confirmation required'},400);const r=await q(env,'SELECT json,version FROM versions WHERE id=?',id).first();if(!r)return J({error:'Not found'},404);const v=V(safeJ(r.json,null));if(v.E.length)return bad(v);const prev=(await getSite(env,'live')).c;await getSite(env,'draft');const u=Date.now();
   await q(env,'UPDATE site SET json=?,updated=?,version=version+1 WHERE id=?',JSON.stringify(v.c),u,'live').run();await q(env,'UPDATE site SET json=?,updated=? WHERE id=?',JSON.stringify(v.c),u+1,'draft').run();await snap(env,v.c,'restore v'+r.version,prev);await audit(env,'restore','v'+r.version);return J({ok:true,note:'Restored as a NEW published version. The draft now matches it.'})}
  return J({error:'Not found'},404)}
 if(a==='health'){const t0=Date.now();let d1='ok',mig=true;try{await q(env,'SELECT 1').first()}catch{d1='error'}const ms=Date.now()-t0;try{await q(env,'SELECT status,email_status FROM inquiries LIMIT 1').first();await q(env,'SELECT 1 FROM versions LIMIT 1').first();await q(env,'SELECT 1 FROM events LIMIT 1').first()}catch{mig=false}
  return J({worker:'ok',d1,d1Ms:ms,migrated:mig,email:{configured:!!env.RESEND_API_KEY},discord:{configured:!!env.DISCORD_WEBHOOK_URL},imageStorage:env.IMAGES?'r2':'d1',adminPassword:{configured:!!env.ADMIN_PASSWORD&&env.ADMIN_PASSWORD.length>=12},contentVersion:(await getSite(env,'live')).version,errors:(await q(env,"SELECT at,detail FROM audit WHERE action='error' ORDER BY id DESC LIMIT 10").all()).results,note:'Read-only checks. Email/Discord show configured or not; no test message is sent.'})}
 if(a==='analytics'){const days=Math.min(Math.max(+url.searchParams.get('days')||30,1),90),since=new Date(Date.now()-days*864e5).toISOString().slice(0,10);let rows;try{rows=(await q(env,'SELECT day,t,p,ref,dev,n FROM events WHERE day>=? LIMIT 5000',since).all()).results}catch{return J({configured:false,note:'Analytics tables missing. Apply migrations/0002_v2.sql.'})}
  return J({configured:true,days,rows,inquiryDays:(await q(env,'SELECT created FROM inquiries WHERE created>=?',Date.now()-days*864e5).all()).results.map(r=>new Date(r.created).toISOString().slice(0,10))})}
 if(a==='inquiries'){const sp=url.searchParams;
  if(id==='export'&&m==='GET'){const ids=(sp.get('ids')||'').split(',').filter(x=>/^[\w-]{8,40}$/.test(x)).slice(0,500);if(!ids.length)return J({error:'No inquiries selected'},400);
   const notes=sp.get('notes')==='1',L=(await inqSel(env,`WHERE id IN (${ids.map(()=>'?').join(',')})`,ids,'ORDER BY created DESC')).map(inqFmt).map(r=>({ref:r.ref,submitted:new Date(r.created).toISOString(),name:r.name,email:r.email,business:r.business,type:r.type,budget:r.budget,deadline:r.deadline,website:r.url,features:(r.features||[]).join('; '),description:r.desc,clientNotes:r.notes,status:r.status,tags:r.tags.join('; '),emailStatus:r.emailStatus,discordStatus:r.discordStatus,...(notes?{internalNotes:r.internalNotes}:{})})),day=new Date().toISOString().slice(0,10);await audit(env,'export.inquiries',L.length);
   if(sp.get('format')==='json')return J({schemaVersion:1,exportType:'inquiries',exportedAt:new Date().toISOString(),includesInternalNotes:notes,items:L},200,{'content-disposition':`attachment; filename="stencyl-inquiries-${day}.json"`});
   const cols=Object.keys(L[0]||{});return new Response([cols.map(csvCell).join(','),...L.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\r\n'),{headers:{'content-type':'text/csv;charset=utf-8','content-disposition':`attachment; filename="stencyl-inquiries-${day}.csv"`,'cache-control':'no-store'}})}
  if(!id&&m==='GET'){const w=[],ar=[];if(sp.get('status')){w.push('status=?');ar.push(sp.get('status'))}if(sp.get('type')){w.push("json_extract(json,'$.type')=?");ar.push(sp.get('type'))}if(sp.get('budget')){w.push("json_extract(json,'$.budget')=?");ar.push(sp.get('budget'))}if(sp.get('q')){w.push('json LIKE ?');ar.push('%'+sp.get('q').replace(/[%_\\]/g,'').slice(0,60)+'%')}if(+sp.get('from')){w.push('created>=?');ar.push(+sp.get('from'))}if(+sp.get('to')){w.push('created<=?');ar.push(+sp.get('to'))}
   return J({items:(await inqSel(env,w.length?'WHERE '+w.join(' AND '):'',ar,`ORDER BY created ${sp.get('sort')==='old'?'ASC':'DESC'} LIMIT 300`)).map(inqFmt)})}
  const r0=(await inqSel(env,'WHERE id=?',[id]))[0];if(!r0)return J({error:'Not found'},404);
  if(!x&&m==='PATCH'){const st=LEAD.includes(b.status)?b.status:(r0.status||'New'),tags=Array.isArray(b.tags)?b.tags.slice(0,10).map(t=>String(t).trim().slice(0,30)).filter(Boolean):safeJ(r0.tags,[]),notes=typeof b.notes==='string'?b.notes.slice(0,5000):(r0.notes_internal||'');let cid=r0.client_id||null;
   if('clientId'in b){cid=b.clientId||null;if(cid&&!(await q(env,'SELECT 1 x FROM clients WHERE id=?',cid).first()))return J({error:'Client not found'},404)}
   await q(env,'UPDATE inquiries SET status=?,tags=?,notes_internal=?,client_id=? WHERE id=?',st,JSON.stringify(tags),notes,cid,id).run();return J({ok:true})}
  if(!x&&m==='DELETE'){if(sp.get('confirm')!=='yes')return J({error:'Confirmation required'},400);await q(env,'DELETE FROM inquiries WHERE id=?',id).run();await audit(env,'inquiry.delete',id);return J({ok:true})}
  if(x==='retry'&&m==='POST'){const want=[];if(['failed','pending'].includes(r0.email_status))want.push('email');if(['failed','pending'].includes(r0.discord_status))want.push('discord');const claimed=[];
   for(const c of want){const col=c==='email'?'email_status':'discord_status',rr=await q(env,`UPDATE inquiries SET ${col}='sending' WHERE id=? AND ${col} IN ('failed','pending')`,id).run();if(rr.meta.changes)claimed.push(c)}
   if(!claimed.length)return J({error:'Nothing to retry (already sent, in progress, or status unknown).'},409);
   const{st,er}=await deliver(env,id,safeJ(r0.json),claimed);for(const c of claimed)await q(env,`UPDATE inquiries SET ${c==='email'?'email_status':'discord_status'}=? WHERE id=?`,st[c],id).run();
   await q(env,'UPDATE inquiries SET delivery=? WHERE id=?',JSON.stringify({...safeJ(r0.delivery),...er}),id).run();await audit(env,'inquiry.retry',id);return J({ok:true,result:st})}
  return J({error:'Not found'},404)}
 if(a==='clients'){
  if(!id&&m==='GET')return J({items:(await q(env,'SELECT id,label,name,status,created,updated FROM clients ORDER BY updated DESC').all()).results});
  if(!id&&m==='POST'){const label=String(b.label||'').trim().slice(0,80),name=String(b.name||label).trim().slice(0,80);if(!label)return J({error:'Client label required'},422);
   let src;if(b.from&&b.from!=='live'){const r=await q(env,'SELECT json FROM clients WHERE id=?',b.from).first();if(!r)return J({error:'Source not found'},404);src=JSON.parse(r.json)}else src=(await getSite(env,'live')).c;
   const cid=crypto.randomUUID(),n=Date.now();await q(env,'INSERT INTO clients VALUES(?,?,?,?,?,?,?,?)',cid,label,name,'Draft','',JSON.stringify(src),n,n).run();await audit(env,'client.create',cid);return J({id:cid})}
  const r=await q(env,'SELECT * FROM clients WHERE id=?',id).first();if(!r)return J({error:'Not found'},404);
  if(!x&&m==='GET'){const sh=(await q(env,'SELECT id,expires,revoked,created FROM shares WHERE client_id=?',id).all()).results;return J({client:{id:r.id,label:r.label,name:r.name,status:r.status,notes:r.notes,created:r.created,updated:r.updated},config:norm(JSON.parse(r.json)),shares:sh,linked:await linkedInq(env,id)})}
  if(!x&&m==='PUT'){const v=V(b.config);if(v.E.length)return bad(v);if(b.baseUpdated&&b.baseUpdated!==r.updated)return J({error:'This client draft was changed elsewhere. Reload before saving.'},409);const u=Math.max(Date.now(),r.updated+1),rr=await q(env,'UPDATE clients SET json=?,updated=? WHERE id=? AND updated=?',JSON.stringify(v.c),u,id,r.updated).run();if(!rr.meta.changes)return J({error:'Concurrent change detected. Reload and retry.'},409);return J({ok:true,config:v.c,updated:u})}
  if(!x&&m==='PATCH'){const st=STATUS.includes(b.status)?b.status:r.status;await q(env,'UPDATE clients SET label=?,name=?,status=?,notes=?,updated=? WHERE id=?',String(b.label??r.label).slice(0,80)||r.label,String(b.name??r.name).slice(0,80)||r.name,st,String(b.notes??r.notes).slice(0,2000),Date.now(),id).run();return J({ok:true})}
  if(!x&&m==='DELETE'){await q(env,'DELETE FROM shares WHERE client_id=?',id).run();await q(env,'DELETE FROM clients WHERE id=?',id).run();await audit(env,'client.delete',id);return J({ok:true})}
  if(x==='duplicate'&&m==='POST'){const cid=crypto.randomUUID(),n=Date.now();await q(env,'INSERT INTO clients VALUES(?,?,?,?,?,?,?,?)',cid,(r.label+' (copy)').slice(0,80),r.name,'Draft',r.notes,r.json,n,n).run();return J({id:cid})}
  if(x==='share'&&m==='POST'){const hrs=Math.min(Math.max(parseInt(b.hours)||72,1),720),t=rand();await q(env,'INSERT INTO shares VALUES(?,?,?,?,0,?)',crypto.randomUUID(),id,await sha(t),Date.now()+hrs*3600e3,Date.now()).run();await audit(env,'share.create',id);return J({url:`${url.origin}/p/${t}`,hours:hrs,note:'Shown once. Read-only; expires automatically.'})}
  if(x==='revoke'&&m==='POST'){await q(env,'UPDATE shares SET revoked=1 WHERE id=? AND client_id=?',String(b.shareId||''),id).run();return J({ok:true})}
 }
 return J({error:'Not found'},404)}

export default{async fetch(req,env){try{
 const url=new URL(req.url),p=url.pathname,ip=req.headers.get('cf-connecting-ip')||'local';
 if(!env.DB)return J({error:'D1 binding missing'},500);
 if(p==='/api/e'&&req.method==='POST')return events(req,env);
 if(p==='/robots.txt')return new Response(`User-agent: *\nDisallow: /dashboard\nDisallow: /preview/\nDisallow: /p/\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`,{headers:{'content-type':'text/plain'}});
 if(p==='/sitemap.xml')return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc><lastmod>${new Date((await getSite(env,'live')).updated).toISOString().slice(0,10)}</lastmod></url></urlset>`,{headers:{'content-type':'application/xml'}});
 if(['/favicon.png','/apple-touch-icon.png','/og.png'].includes(p))return env.ASSETS.fetch(req);
 if(p==='/favicon.ico')return env.ASSETS.fetch(new Request(url.origin+'/favicon.png'));
 if(p==='/api/public')return J((await getSite(env,'live')).c,200,{'cache-control':'public, max-age=60'});
 if(p==='/api/inquiry'&&req.method==='POST')return inquiry(req,env,ip);
 if(p==='/api/login'&&req.method==='POST')return login(req,env,ip);
 if(p==='/api/logout'&&req.method==='POST'){const t=cookie(req,'__Host-sid');if(t)await q(env,'DELETE FROM sessions WHERE hash=?',await sha(t)).run();return J({ok:true},200,{'set-cookie':'__Host-sid=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})}
 if(p.startsWith('/api/admin/'))return admin(req,env,url,p);
 if(p==='/imghost'||p==='/imghost/'){const h=await(await env.ASSETS.fetch('https://x/imghost.tpl')).text();return new Response(h,{headers:{'content-type':'text/html;charset=utf-8','content-security-policy':CSP,...SEC,'cache-control':'no-store','x-robots-tag':'noindex'}})}
 if(p==='/dashboard'||p==='/dashboard/'){const h=await(await env.ASSETS.fetch('https://x/dashboard.tpl')).text();return new Response(h,{headers:{'content-type':'text/html;charset=utf-8','content-security-policy':CSP,'cache-control':'no-store','x-robots-tag':'noindex'}})}
 if(p.startsWith('/preview/')){if(!(await sess(req,env)))return new Response('Unauthorized',{status:401});
  if(p==='/preview/draft')return render(env,url,(await getSite(env,'draft')).c,true);
  const vm=p.match(/^\/preview\/version\/(\d+)$/);if(vm){const r=await q(env,'SELECT json FROM versions WHERE id=?',+vm[1]).first();if(r)return render(env,url,safeJ(r.json),true)}
  const m=p.match(/^\/preview\/client\/([\w-]+)$/),r=m&&await q(env,'SELECT json FROM clients WHERE id=?',m[1]).first();if(r)return render(env,url,JSON.parse(r.json),true)}
 if(p.startsWith('/p/')){const r=await q(env,'SELECT c.json FROM shares s JOIN clients c ON c.id=s.client_id WHERE s.token_hash=? AND s.revoked=0 AND s.expires>?',await sha(p.slice(3)),Date.now()).first();if(r)return render(env,url,JSON.parse(r.json),true);return new Response('Not found',{status:404})}
 if(p==='/')return render(env,url,(await getSite(env,'live')).c,false);
 const im=(req.method==='GET'||req.method==='HEAD')&&p.match(/^\/([a-z0-9][a-z0-9_-]{0,59})(?:\.(?:png|jpe?g|gif|webp|avif))?$/i);
 if(im&&imgNameOk(im[1].toLowerCase())){let o=null;try{o=await imgStore.get(env,im[1].toLowerCase())}catch{}
  if(o){const et=`"${o.size}-${o.created}"`,hd={'content-type':o.type||'application/octet-stream','cache-control':'public, max-age=3600',etag:et,'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'cross-origin-resource-policy':'cross-origin','access-control-allow-origin':'*'};
   if(req.headers.get('if-none-match')===et)return new Response(null,{status:304,headers:hd});return new Response(req.method==='HEAD'?null:o.body,{headers:hd})}}
 return new Response(NF,{status:404,headers:{'content-type':'text/html;charset=utf-8',...SEC,'content-security-policy':CSP}});
}catch(e){console.error(e);try{await audit(env,'error',String(e&&e.message||e).slice(0,120))}catch{}return J({error:'Server error'},500)}}};
