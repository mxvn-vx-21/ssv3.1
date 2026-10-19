<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Image host — $TENCYL</title><link rel="icon" href="/favicon.png">
<style>
*{box-sizing:border-box;margin:0}body{background:#080808;color:#fff;font:14px/1.5 system-ui,sans-serif;padding:24px;max-width:1100px;margin:0 auto}[hidden]{display:none!important}
h1{font-size:22px;margin-bottom:4px}.mono,button,label{font-family:ui-monospace,Menlo,monospace}.mut{color:#8d8d8d;font-size:13px}
.card{border:1px solid #222;background:#0c0c0c;padding:16px;margin:16px 0}
input,select{width:100%;background:#0e0e0e;border:1px solid #2a2a2a;color:#fff;padding:9px;font:inherit}label{display:grid;gap:4px;font-size:11px;color:#999;text-transform:uppercase}
.b{background:#151515;color:#fff;border:1px solid #333;padding:8px 12px;cursor:pointer;font-size:12px}.b:hover{border-color:#777}.b.p{background:#fff;color:#080808}.b.d{color:#ff8a8a}.b:disabled{opacity:.4;cursor:not-allowed}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}.it{border:1px solid #222;background:#0e0e0e;display:grid}
.it .th{aspect-ratio:16/9;background:#050505 center/contain no-repeat;border-bottom:1px solid #222;display:grid;place-items:center}.it .th img{max-width:100%;max-height:100%;object-fit:contain}
.it .in{padding:10px;display:grid;gap:6px}.url{word-break:break-all;color:#9bb8ff;font-size:12px}
#drop{border:1px dashed #444;padding:22px;text-align:center;color:#999;cursor:pointer}#drop.on{border-color:#fff;color:#fff}#pv{max-width:240px;aspect-ratio:16/9;object-fit:contain;background:#050505;margin-top:10px;border:1px solid #222}
#msg{margin-top:10px;font-size:13px;min-height:20px}#msg.bad{color:#ff8a8a}#msg.ok{color:#7fe0a6}
</style></head><body>
<form id="login" class="card" hidden style="max-width:340px;margin:18vh auto;display:grid;gap:10px"><h1>Image host</h1><p class="mut">Sign in with your dashboard password.</p><input id="pw" type="password" placeholder="Admin password" autocomplete="current-password" required><button class="b p">Sign in</button><div id="le" style="color:#ff8a8a"></div></form>
<main id="app" hidden>
<h1>Image host</h1><p class="mut" id="info"></p><p class="mut"><a href="/dashboard" style="color:#9bb8ff">← Dashboard</a></p>
<div class="card"><div id="drop" tabindex="0" role="button">Drop an image here or click to choose<br><span class="mut">PNG, JPEG, GIF, WebP or AVIF</span></div><input id="f" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden>
<img id="pv" alt="Preview" hidden>
<div class="g" style="margin-top:12px"><label>Name → <span id="pu" class="mono" style="text-transform:none"></span><input id="nm" placeholder="my-thumbnail" maxlength="60" autocomplete="off"></label><label>Label (optional)<input id="lb" maxlength="100"></label></div>
<div class="row"><button class="b p" id="up" disabled>Upload</button><span class="mut" id="sz"></span></div><div id="msg" role="status"></div></div>
<div class="card"><label>Search<input id="q" placeholder="Filter by name or label"></label><div id="grid" style="margin-top:12px"></div><p class="mut" id="empty" hidden>No images yet.</p></div>
</main><input id="rf" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden>
<script>
const $=s=>document.querySelector(s);let csrf='',MAX=0,ITEMS=[],file=null,replaceName=null;
const mk=(t,a={},k=[])=>{const e=document.createElement(t);for(const x in a){x==='text'?e.textContent=a[x]:e.setAttribute(x,a[x])}k.forEach(c=>e.append(c));return e};
const fmt=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const msg=(t,c)=>{$('#msg').textContent=t;$('#msg').className=c||''};
async function api(p,o={}){const r=await fetch('/api/admin/'+p,{...o,headers:{'x-csrf':csrf,...(o.headers||{})}});const j=await r.json().catch(()=>({}));if(r.status===401){showLogin();throw new Error('Signed out')}if(!r.ok){const e=new Error(j.error||'Request failed');e.status=r.status;e.data=j;throw e}return j}
const slug=n=>n.toLowerCase().replace(/\.[a-z0-9]+$/,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^[-_]+|[-_]+$/g,'').slice(0,60);
const showLogin=()=>{$('#app').hidden=true;$('#login').hidden=false};
$('#login').onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:$('#pw').value})});const j=await r.json().catch(()=>({}));if(!r.ok){$('#le').textContent=j.error||'Sign-in failed';return}init()};
async function init(){const r=await fetch('/api/admin/me');if(!r.ok){showLogin();return}csrf=(await r.json()).csrf;$('#login').hidden=true;$('#app').hidden=false;await load()}
async function load(){try{const j=await api('images');MAX=j.max;ITEMS=j.items;$('#info').textContent=`Storage: ${j.storage==='r2'?'Cloudflare R2':'D1 database (bind R2 for larger files)'} · max ${fmt(MAX)} per image · public URL: ${location.origin}/{name}`;draw()}catch(e){$('#info').textContent=e.message;$('#info').style.color='#ff8a8a'}}
function draw(){const q=$('#q').value.toLowerCase(),L=ITEMS.filter(i=>(i.name+' '+i.label).toLowerCase().includes(q));$('#empty').hidden=!!L.length;$('#empty').textContent=ITEMS.length?'No images match.':'No images yet.';
 $('#grid').replaceChildren(...L.map(i=>{const url=location.origin+'/'+i.name,cp=mk('button',{class:'b',type:'button',text:'Copy URL'}),rp=mk('button',{class:'b',type:'button',text:'Replace'}),dl=mk('button',{class:'b d',type:'button',text:'Delete'});
  cp.onclick=async()=>{await navigator.clipboard.writeText(url);cp.textContent='Copied ✓';setTimeout(()=>cp.textContent='Copy URL',1400)};
  rp.onclick=()=>{replaceName=i.name;$('#rf').click()};
  dl.onclick=async()=>{if(!confirm(`Delete “${i.name}”? Its public URL will stop working.`))return;try{await api('images/'+i.name,{method:'DELETE'})}catch(e){if(e.status===409&&e.data.usedIn){if(!confirm(e.data.error+'\n\nDelete anyway?'))return;await api('images/'+i.name+'?force=1',{method:'DELETE'})}else{alert(e.message);return}}await load()};
  return mk('div',{class:'it'},[mk('div',{class:'th'},[mk('img',{src:'/'+i.name+'?v='+i.created,alt:i.label||i.name,loading:'lazy'})]),mk('div',{class:'in'},[mk('b',{text:i.name}),...(i.label?[mk('span',{class:'mut',text:i.label})]:[]),mk('a',{class:'url',href:url,target:'_blank',rel:'noopener',text:url}),mk('span',{class:'mut',text:fmt(i.size)+' · '+(i.type||'').replace('image/','')}),mk('div',{class:'row'},[cp,rp,dl])])])}))}
async function send(f,name,label,overwrite){const r=await fetch('/api/admin/images',{method:'POST',headers:{'x-csrf':csrf,'x-name':name,'x-label':encodeURIComponent(label||''),'x-overwrite':overwrite?'1':'0','content-type':f.type||'application/octet-stream'},body:f});const j=await r.json().catch(()=>({}));if(r.status===401){showLogin();throw new Error('Signed out')}if(!r.ok){const e=new Error(j.error||'Upload failed');e.status=r.status;throw e}return j}
function pick(f){if(!f)return;if(f.size>MAX){msg(`That file is ${fmt(f.size)}; the limit is ${fmt(MAX)}.`,'bad');return}file=f;if(!$('#nm').value)$('#nm').value=slug(f.name);const rd=new FileReader();rd.onload=()=>{$('#pv').src=rd.result;$('#pv').hidden=false};rd.readAsDataURL(f);$('#sz').textContent=f.name+' · '+fmt(f.size);msg('');upd()}
const upd=()=>{$('#pu').textContent=location.origin+'/'+($('#nm').value||'{name}');$('#up').disabled=!(file&&$('#nm').value)};
$('#nm').oninput=()=>{$('#nm').value=$('#nm').value.toLowerCase().replace(/[^a-z0-9_-]/g,'-');upd()};
$('#drop').onclick=()=>$('#f').click();$('#drop').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#f').click()}};
$('#f').onchange=e=>pick(e.target.files[0]);['dragenter','dragover'].forEach(t=>$('#drop').addEventListener(t,e=>{e.preventDefault();$('#drop').classList.add('on')}));['dragleave','drop'].forEach(t=>$('#drop').addEventListener(t,e=>{e.preventDefault();$('#drop').classList.remove('on')}));$('#drop').addEventListener('drop',e=>pick(e.dataTransfer.files[0]));
$('#up').onclick=async()=>{$('#up').disabled=true;msg('Uploading…');const name=$('#nm').value;try{let j;try{j=await send(file,name,$('#lb').value,false)}catch(e){if(e.status===409){if(!confirm(`“${name}” already exists. Replace it?`)){msg('Cancelled.');upd();return}j=await send(file,name,$('#lb').value,true)}else throw e}
  msg('Uploaded: '+j.url,'ok');file=null;$('#nm').value='';$('#lb').value='';$('#pv').hidden=true;$('#sz').textContent='';$('#f').value='';await load();upd()}catch(e){msg(e.message,'bad');upd()}};
$('#rf').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||!replaceName)return;if(f.size>MAX)return alert('File too large: limit is '+fmt(MAX));if(!confirm(`Replace “${replaceName}” with this file?`))return;try{await send(f,replaceName,(ITEMS.find(i=>i.name===replaceName)||{}).label||'',true);await load()}catch(err){alert(err.message)}};
$('#q').oninput=draw;init();
</script></body></html>
