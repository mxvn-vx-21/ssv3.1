import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import nodeCrypto from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
crypto.subtle.timingSafeEqual??=(a,b)=>nodeCrypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('schema.sql','utf8'));db.exec(fs.readFileSync('migrations/0002_v2.sql','utf8'));db.exec(fs.readFileSync('migrations/0003_images.sql','utf8'));
const D1={prepare(sql){let a=[];const st={bind(...x){a=x;return st},async first(){return db.prepare(sql).get(...a)??null},async all(){return{results:db.prepare(sql).all(...a)}},async run(){const r=db.prepare(sql).run(...a);return{meta:{changes:Number(r.changes)}}}};return st}};
const ASSETS={fetch:async u=>{const p=new URL(typeof u==='string'?u:u.url).pathname.slice(1);return new Response(fs.readFileSync('public/'+p))}};
const env={DB:D1,ASSETS,ADMIN_PASSWORD:'correct horse battery staple',RESEND_API_KEY:'re_SECRETKEY_123',DISCORD_WEBHOOK_URL:'https://discord.test/hook/SECRETHOOK'};
const {default:W}=await import('../src/worker.js');
let fail=false;const calls=[];globalThis.fetch=async(u,o)=>{calls.push(String(u));return new Response('{}',{status:fail&&String(u).includes('resend')?500:200})};
const O='https://t.test',call=(p,o={},ip='1.1.1.1')=>W.fetch(new Request(O+p,{...o,headers:{'cf-connecting-ip':ip,...(o.headers||{})}}),env);
let cookie='',csrf='';const A=(p,m='GET',b,x={})=>call('/api/admin/'+p,{method:m,body:b?JSON.stringify(b):undefined,headers:{cookie,'x-csrf':csrf,'content-type':'application/json',...x}});
const jj=async r=>({s:r.status,...await r.json()});
test('admin API requires a session',async()=>{assert.equal((await A('stats')).status,401);assert.equal((await call('/preview/draft')).status,401)});
test('login: wrong password fails, rate limited after 5',async()=>{for(let i=0;i<5;i++)assert.equal((await call('/api/login',{method:'POST',body:JSON.stringify({password:'bad'+i})},'9.9.9.9')).status,401);assert.equal((await call('/api/login',{method:'POST',body:JSON.stringify({password:'x'})},'9.9.9.9')).status,429)});
test('login ok sets HttpOnly session; CSRF enforced on mutations',async()=>{const r=await call('/api/login',{method:'POST',body:JSON.stringify({password:env.ADMIN_PASSWORD})});assert.equal(r.status,200);const sc=r.headers.get('set-cookie');assert.match(sc,/HttpOnly/);cookie=sc.split(';')[0];csrf=(await jj(await A('me'))).csrf;
 assert.equal((await A('site','PUT',{config:{}},{'x-csrf':'wrong'})).status,403)});
let draft,rev;
test('draft save: validation, pricing limit, optimistic concurrency',async()=>{const g=await jj(await A('site'));draft=g.draft;rev=g.draftUpdated;
 const bad=structuredClone(draft);bad.pricing[0].price=1500;assert.equal((await A('site','PUT',{config:bad,baseUpdated:rev})).status,422);
 draft.site.tagline='Changed';const ok=await jj(await A('site','PUT',{config:draft,baseUpdated:rev}));assert.equal(ok.s,200);
 assert.equal((await A('site','PUT',{config:draft,baseUpdated:rev})).status,409,'stale revision must be rejected');rev=ok.updated});
test('public site unchanged until publish; publish snapshots; restore creates new version',async()=>{
 assert.ok(!(await (await call('/')).text()).includes('Changed'));
 assert.equal((await A('publish','POST',{})).status,400);assert.equal((await A('publish','POST',{confirm:true})).status,200);
 assert.ok((await (await call('/')).text()).includes('Changed'));
 const v=(await jj(await A('versions'))).items;assert.equal(v.length,1);
 draft.site.tagline='Second';const u=await jj(await A('site','PUT',{config:draft,baseUpdated:rev}));rev=u.updated;await A('publish','POST',{confirm:true});
 const vs=(await jj(await A('versions'))).items;assert.equal(vs.length,2);
 const old=vs[vs.length-1];const d=await jj(await A(`versions/diff?a=${old.id}&b=0`));assert.ok(d.changes.some(c=>c.path==='site.tagline'));
 assert.equal((await A(`versions/${old.id}/restore`,'POST',{})).status,400);assert.equal((await A(`versions/${old.id}/restore`,'POST',{confirm:true})).status,200);
 assert.equal((await jj(await A('versions'))).items.length,3,'restore adds a version, history not rewritten');assert.ok((await (await call('/')).text()).includes('Changed'))});
let cid;
test('client drafts are isolated; review links are hashed, read-only, revocable',async()=>{
 cid=(await jj(await A('clients','POST',{label:'Acme'}))).id;const c=await jj(await A('clients/'+cid));c.config.site.brand='ACME-ONLY';
 assert.equal((await A('clients/'+cid,'PUT',{config:c.config,baseUpdated:c.client.updated})).status,200);
 assert.ok(!(await (await call('/')).text()).includes('ACME-ONLY'));assert.ok(!JSON.stringify(await (await call('/api/public')).json()).includes('ACME-ONLY'));
 assert.equal((await call('/preview/client/'+cid)).status,401);
 const sh=await jj(await A(`clients/${cid}/share`,'POST',{hours:1}));const tok=sh.url.split('/p/')[1];assert.ok(tok.length>=60);
 const pv=await call('/p/'+tok);assert.equal(pv.status,200);assert.match(await pv.text(),/ACME-ONLY/);assert.equal(pv.headers.get('x-robots-tag'),'noindex');
 const stored=db.prepare('SELECT token_hash FROM shares').get().token_hash;assert.notEqual(stored,tok);
 assert.equal((await call('/p/'+tok,{method:'POST',headers:{'x-csrf':csrf}})).status,200);assert.equal((await call('/api/admin/stats',{headers:{}})).status,401,'review link grants no admin access');
 const sid=db.prepare('SELECT id FROM shares').get().id;await A(`clients/${cid}/revoke`,'POST',{shareId:sid});assert.equal((await call('/p/'+tok)).status,404);
 assert.equal((await call('/p/'+'0'.repeat(64))).status,404)});
const body=(o={})=>JSON.stringify({name:'Ada',email:'ada@example.com',type:'Landing page',budget:'₹250',desc:'A landing page for my shop.',features:['Animations'],...o});
test('inquiry: validation, success returns reference, duplicate blocked',async()=>{
 assert.equal((await call('/api/inquiry',{method:'POST',body:body({email:'bad'})},'2.2.2.2')).status,422);
 const r=await jj(await call('/api/inquiry',{method:'POST',body:body()},'2.2.2.2'));assert.equal(r.s,200);assert.match(r.ref,/^[0-9A-F]{8}$/);
 assert.equal((await call('/api/inquiry',{method:'POST',body:body()},'3.3.3.3')).status,409);
 const row=db.prepare('SELECT email_status e,discord_status d FROM inquiries').get();assert.deepEqual([row.e,row.d],['sent','sent'])});
test('failed email is tracked, retry sends only the failed channel, never duplicates the record',async()=>{
 fail=true;calls.length=0;const r=await jj(await call('/api/inquiry',{method:'POST',body:body({email:'b@example.com',desc:'Second project description'})},'4.4.4.4'));assert.equal(r.s,200,'discord still delivered');
 const row=db.prepare("SELECT id,email_status e,discord_status d FROM inquiries WHERE email_status='failed'").get();assert.equal(row.d,'sent');fail=false;calls.length=0;
 assert.equal((await jj(await A(`inquiries/${row.id}/retry`,'POST'))).s,200);assert.equal(calls.length,1);assert.match(calls[0],/resend/);assert.equal(db.prepare('SELECT COUNT(*) n FROM inquiries').get().n,2);
 assert.equal((await A(`inquiries/${row.id}/retry`,'POST')).status,409,'nothing left to retry')});
test('CRM: status/tags/notes, filters, CSV is injection-safe, internal notes excluded by default',async()=>{
 const id=db.prepare('SELECT id FROM inquiries LIMIT 1').get().id;assert.equal((await A('inquiries/'+id,'PATCH',{status:'Reviewing',tags:['hot'],notes:'private note',clientId:cid})).status,200);
 const l=await jj(await A('inquiries?status=Reviewing'));assert.equal(l.items.length,1);assert.equal(l.items[0].internalNotes,'private note');
 db.prepare("UPDATE inquiries SET json=json_set(json,'$.name','=cmd|calc')").run();
 const csv=await (await A(`inquiries/export?format=csv&ids=${id}`)).text();assert.ok(csv.includes(`"'=cmd|calc"`));assert.ok(!csv.includes('private note'));
 assert.ok((await (await A(`inquiries/export?format=csv&ids=${id}&notes=1`)).text()).includes('private note'));
 assert.equal((await A('inquiries/'+id,'DELETE')).status,400);assert.equal((await A('inquiries/'+id+'?confirm=yes','DELETE')).status,200)});
test('exports: valid JSON, versioned, no secrets, no inquiries (except explicit backup)',async()=>{
 const pub=await (await A('export/live')).text();const j=JSON.parse(pub);assert.equal(j.schemaVersion,1);for(const s of['re_SECRETKEY_123','SECRETHOOK','correct horse',csrf])assert.ok(!pub.includes(s));assert.equal(j.inquiries,undefined);
 const bk=JSON.parse(await (await A('export/backup')).text());assert.ok(Array.isArray(bk.inquiries))});
test('import: dry-run summary, confirmation required, invalid files change nothing',async()=>{
 const pub=JSON.parse(await (await A('export/live')).text());const before=db.prepare("SELECT json FROM site WHERE id='draft'").get().json;
 const bad=structuredClone(pub);bad.pricing[0].price=5000;assert.equal((await A('import','POST',{data:bad,target:'draft'})).status,422);
 const dry=await jj(await A('import','POST',{data:pub,target:'draft'}));assert.ok(dry.dryRun);assert.equal((await A('import','POST',{data:pub,target:'draft',dryRun:false})).status,400);
 assert.equal(db.prepare("SELECT json FROM site WHERE id='draft'").get().json,before);
 assert.equal((await A('import','POST',{data:{exportType:'backup',schemaVersion:1},target:'draft'})).status,422)});
test('analytics: privacy-safe counters, DNT respected, unknown events rejected',async()=>{
 const ev=(b,h={})=>call('/api/e',{method:'POST',body:JSON.stringify(b),headers:h});assert.equal((await ev({t:'view',r:'google.com'})).status,204);assert.equal((await ev({t:'evil'})).status,400);await ev({t:'view'},{dnt:'1'});
 const rows=db.prepare('SELECT * FROM events').all();assert.equal(rows.length,1);assert.equal(rows[0].ref,'search');assert.ok(!JSON.stringify(rows).includes('1.1.1.1'));
 const an=await jj(await A('analytics?days=7'));assert.ok(an.configured)});
test('public pages: 404, robots, sitemap, no private paths indexed',async()=>{assert.equal((await call('/nope')).status,404);const rb=await (await call('/robots.txt')).text();assert.match(rb,/Disallow: \/dashboard/);assert.match(await (await call('/sitemap.xml')).text(),/<loc>https:\/\/t\.test\/<\/loc>/);
 const h=await (await call('/')).text();assert.match(h,/rel="canonical"/);assert.match(h,/og:image/);assert.equal((await A('health')).status,200)});

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const up=(name,buf,h={},e=env)=>W.fetch(new Request(O+'/api/admin/images',{method:'POST',body:buf,headers:{cookie,'x-csrf':csrf,'x-name':name,'content-type':'application/octet-stream',...h}}),e);
test('image host: auth + CSRF required for upload and listing',async()=>{assert.equal((await W.fetch(new Request(O+'/api/admin/images',{method:'POST',body:PNG,headers:{'x-name':'a1'}}),env)).status,401);
 assert.equal((await W.fetch(new Request(O+'/api/admin/images',{method:'POST',body:PNG,headers:{cookie,'x-name':'a1'}}),env)).status,403);assert.equal((await call('/api/admin/images')).status,401)});
test('image host: content sniffing, reserved names, SVG blocked, size cap',async()=>{
 assert.equal((await up('fake',Buffer.from('not an image at all'))).status,415,'text renamed as image');
 assert.equal((await up('vec',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).status,415,'SVG refused');
 for(const n of['dashboard','imghost','api','p','Bad Name','../x','x.png',''])assert.equal((await up(n,PNG)).status,422,n);
 assert.equal((await up('huge',Buffer.concat([PNG,Buffer.alloc(1400*1024)]))).status,413)});
test('image host: upload, public serving headers, extension alias, 404, conflict/overwrite',async()=>{
 const r=await jj(await up('my-thumb',PNG,{'x-label':encodeURIComponent('Test thumb')}));assert.equal(r.s,200);assert.equal(r.url,O+'/my-thumb');
 const g=await call('/my-thumb');assert.equal(g.status,200);assert.equal(g.headers.get('content-type'),'image/png');assert.equal(g.headers.get('x-content-type-options'),'nosniff');assert.match(g.headers.get('content-security-policy'),/sandbox/);assert.deepEqual(Buffer.from(await g.arrayBuffer()),PNG);
 assert.equal((await call('/my-thumb.png')).status,200);assert.equal((await call('/my-thumb',{headers:{'if-none-match':g.headers.get('etag')}})).status,304);assert.equal((await call('/nope-img')).status,404);
 assert.equal((await up('my-thumb',PNG)).status,409);assert.equal((await up('my-thumb',PNG,{'x-overwrite':'1'})).status,200);
 assert.equal((await jj(await A('images'))).items[0].name,'my-thumb')});
test('image host: deleting an image used by published content warns first',async()=>{
 const d=(await jj(await A('site'))).draft,u=(await jj(await A('site'))).draftUpdated;d.projects[0].thumb=O+'/my-thumb';const sv=await jj(await A('site','PUT',{config:d,baseUpdated:u}));assert.equal(sv.s,200);await A('publish','POST',{confirm:true});
 const del=await jj(await A('images/my-thumb','DELETE'));assert.equal(del.s,409);assert.ok(del.usedIn.includes('live'));assert.equal((await call('/my-thumb')).status,200);
 assert.equal((await A('images/my-thumb?force=1','DELETE')).status,200);assert.equal((await call('/my-thumb')).status,404)});
test('image host: R2 storage path works when IMAGES is bound',async()=>{const m=new Map(),R2={async put(k,b,o){m.set(k,{b,o:o||{}})},async get(k){const x=m.get(k);return x?{body:x.b,size:x.b.length,httpMetadata:x.o.httpMetadata,customMetadata:x.o.customMetadata}:null},async head(k){return m.get(k)?{}:null},async delete(k){m.delete(k)},async list(){return{objects:[...m].map(([k,x])=>({key:k,size:x.b.length,httpMetadata:x.o.httpMetadata,customMetadata:x.o.customMetadata,uploaded:new Date()}))}}};
 const e2={...env,IMAGES:R2};assert.equal((await up('r2-pic',PNG,{},e2)).status,200);const g=await W.fetch(new Request(O+'/r2-pic'),e2);assert.equal(g.status,200);assert.equal(g.headers.get('content-type'),'image/png');
 assert.equal((await up('big',Buffer.concat([PNG,Buffer.alloc(2*1024*1024)]),{},e2)).status,200,'R2 allows up to 5 MB');assert.equal(db.prepare("SELECT COUNT(*) n FROM images WHERE name='r2-pic'").get().n,0,'nothing written to D1')});
