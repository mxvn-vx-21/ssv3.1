// Pure, testable helpers (no Cloudflare APIs).
// ---------- validation (server is the authority) ----------
export const o=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
export function clean(c){
 const Er=[],bad=m=>Er.push(m);
 if(!c||typeof c!=='object'||c.schemaVersion!==1)return{E:['Unsupported or missing schemaVersion (expected 1)']};
 const str=(v,n,l,req)=>{if(typeof v!=='string'||v.length>n||(req&&!v.trim())){bad(`${l}: ${req?'required, ':''}text up to ${n} characters`);return''}return v};
 const url=(v,l)=>{if(v===undefined||v===null||v==='')return'';if(typeof v==='string'&&v.length<=500){try{if(/^https?:$/.test(new URL(v).protocol))return v}catch{}}bad(l+': must be a valid http(s) URL');return''};
 const arr=(v,max,l)=>{if(!Array.isArray(v)||v.length>max){bad(`${l}: list of up to ${max} items`);return[]}return v};
 const s=o(c.site),h=o(s.hero),a=o(s.about),k=o(s.contact),se=o(s.seo),av=o(s.availability);
 const ce=v=>{if(v===undefined||v==='')return'';if(typeof v==='string'&&v.length<=120&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))return v;bad('Contact email: invalid address');return''};
 const site={brand:str(s.brand,40,'Brand',1),tagline:str(s.tagline,120,'Tagline'),footer:str(s.footer,200,'Footer'),contactEmail:ce(s.contactEmail),availability:{enabled:!!av.enabled,text:str(av.text??'',80,'Availability text')},defaultTheme:['system','dark','light'].includes(s.defaultTheme)?s.defaultTheme:'system',
  seo:{title:str(se.title??'',120,'SEO title'),description:str(se.description??'',300,'Meta description')},
  nav:arr(s.nav,10,'Nav').map((n,i)=>{n=o(n);const ok=typeof n.href==='string'&&n.href.length<=300&&/^(#[\w-]*|https?:\/\/.+)$/.test(n.href);if(!ok)bad('Nav link '+(i+1)+' must start with # or http(s)://');return{label:str(n.label,30,'Nav label '+(i+1),1),href:ok?n.href:'#',visible:!!n.visible}}),
  hero:{eyebrow:str(h.eyebrow,60,'Hero eyebrow'),headline:str(h.headline,60,'Hero headline',1),sub:str(h.sub,120,'Hero subheading'),text:str(h.text,300,'Hero text'),cta1:str(h.cta1,40,'CTA 1'),cta2:str(h.cta2,40,'CTA 2')},
  about:{title:str(a.title,80,'About title'),text:str(a.text,800,'About text')},
  contact:{title:str(k.title,80,'Contact title'),text:str(k.text,400,'Contact text'),features:arr(k.features,12,'Features').map(f=>str(f,60,'Feature',1))}};
 const slg=(v,l)=>{v=str(v??'',60,l+'slug');if(!slugOk(v)){bad(l+'slug: lowercase letters, numbers and dashes only');return''}return v};
 const projects=arr(c.projects,50,'Projects').map((p,i)=>{p=o(p);const l=`Project ${i+1} `;return{name:str(p.name,60,l+'name',1),slug:slg(p.slug,l),details:str(p.details??'',3000,l+'details'),filename:str(p.filename,60,l+'filename'),status:str(p.status,30,l+'status'),category:str(p.category,60,l+'category'),date:str(p.date,30,l+'date'),description:str(p.description,300,l+'description'),
  tech:arr(p.tech,20,l+'tags').map(t=>str(t,30,l+'tag',1)),thumb:url(p.thumb,l+'thumbnail'),liveUrl:url(p.liveUrl,l+'live URL'),previewUrl:url(p.previewUrl,l+'preview URL'),githubUrl:url(p.githubUrl,l+'GitHub URL'),visible:!!p.visible,featured:!!p.featured,order:Number.isInteger(p.order)?p.order:i+1}});
 const pricing=arr(c.pricing,6,'Pricing').map((t,i)=>{t=o(t);const l=`Tier ${i+1} `;if(!Number.isInteger(t.price)||t.price<250||t.price>1000)bad(l+'price must be a whole number from 250 to 1000');
  return{name:str(t.name,30,l+'name',1),price:t.price,cta:str(t.cta,30,l+'CTA'),features:arr(t.features,12,l+'features').map(f=>str(f,100,l+'feature',1)),visible:!!t.visible,order:Number.isInteger(t.order)?t.order:i+1}});
 const opt=(v,max,l)=>v===undefined?[]:arr(v,max,l),ord=(x,i)=>Number.isInteger(x.order)?x.order:i+1;
 const services=opt(c.services,12,'Services').map((x,i)=>{x=o(x);const l=`Service ${i+1} `;return{title:str(x.title,60,l+'title',1),description:str(x.description??'',300,l+'description'),features:opt(x.features,10,l+'features').map(f=>str(f,80,l+'feature',1)),projects:opt(x.projects,10,l+'projects').map(f=>str(f,60,l+'project',1)),visible:!!x.visible,order:ord(x,i)}});
 const proc=opt(c.process,8,'Process').map((x,i)=>{x=o(x);const l=`Step ${i+1} `;return{title:str(x.title,60,l+'title',1),text:str(x.text??'',300,l+'text'),visible:!!x.visible,order:ord(x,i)}});
 const faq=opt(c.faq,20,'FAQ').map((x,i)=>{x=o(x);const l=`FAQ ${i+1} `;return{q:str(x.q,150,l+'question',1),a:str(x.a??'',800,l+'answer'),visible:!!x.visible,order:ord(x,i)}});
 return{E:Er,c:{schemaVersion:1,siteId:'stencyl',site,projects,pricing,services,process:proc,faq}};
}

export const slugOk=s=>/^[a-z0-9-]{0,60}$/.test(s);
export const norm=c=>{c=c||{};c.site=c.site||{};c.site.availability=c.site.availability||{enabled:false,text:''};c.site.contactEmail=c.site.contactEmail||'';for(const k of['services','process','faq'])c[k]=Array.isArray(c[k])?c[k]:[];c.projects=(c.projects||[]).map(p=>({slug:'',details:'',...p}));return c};
export const csvCell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
export function flat(x,p='',out={}){if(x&&typeof x==='object'){for(const k of Object.keys(x))flat(x[k],p?p+'.'+k:k,out)}else out[p]=x;return out}
export function diff(a,b,max=200){const A=flat(a),B=flat(b),r=[];for(const k of new Set([...Object.keys(A),...Object.keys(B)])){if(JSON.stringify(A[k])!==JSON.stringify(B[k]))r.push({path:k,from:A[k]===undefined?null:A[k],to:B[k]===undefined?null:B[k]});if(r.length>=max)break}return r}
export const refCat=(h,self)=>!h?'direct':h===self?'internal':/google|bing|duckduckgo|yahoo|baidu|ecosia/i.test(h)?'search':/facebook|instagram|twitter|x\.com|^t\.co|reddit|linkedin|youtube|pinterest|tiktok|discord|whatsapp|telegram/i.test(h)?'social':'other';
export const devCat=ua=>/Mobi|Android|iPhone|iPad/i.test(ua||'')?'mobile':'desktop';
export const RESERVED=new Set(['dashboard','imghost','api','preview','p','robots','sitemap','favicon','apple-touch-icon','og','index','admin','assets','static','login','logout']);
export const imgNameOk=n=>typeof n==='string'&&/^[a-z0-9][a-z0-9_-]{0,59}$/.test(n)&&!RESERVED.has(n);
// Identify an image from its bytes (never trust the filename or browser-supplied MIME). SVG is deliberately not allowed (script risk).
export function sniffImage(b){const u=b instanceof Uint8Array?b:new Uint8Array(b),h=(...a)=>a.every((v,i)=>u[i]===v),s=(o,t)=>[...t].every((c,i)=>u[o+i]===c.charCodeAt(0));
 if(h(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return'image/png';if(h(0xff,0xd8,0xff))return'image/jpeg';if(s(0,'GIF87a')||s(0,'GIF89a'))return'image/gif';
 if(s(0,'RIFF')&&s(8,'WEBP'))return'image/webp';if(s(4,'ftyp')&&(s(8,'avif')||s(8,'avis')))return'image/avif';return null}
