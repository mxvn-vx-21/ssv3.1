import fs from 'node:fs';import nodeCrypto from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
crypto.subtle.timingSafeEqual??=(a,b)=>nodeCrypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
process.chdir(new URL('../..',import.meta.url).pathname);
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('schema.sql','utf8'));db.exec(fs.readFileSync('migrations/0002_v2.sql','utf8'));
const D1={prepare(sql){let a=[];const st={bind(...x){a=x;return st},async first(){return db.prepare(sql).get(...a)??null},async all(){return{results:db.prepare(sql).all(...a)}},async run(){const r=db.prepare(sql).run(...a);return{meta:{changes:Number(r.changes)}}}};return st}};
const ASSETS={fetch:async u=>{const p=new URL(typeof u==='string'?u:u.url).pathname.slice(1);return new Response(fs.readFileSync('public/'+p))}};
const {default:W}=await import('./src/worker.js');
const seed=JSON.parse(fs.readFileSync('public/index.tpl','utf8').match(/id="site-config">([\s\S]*?)<\/script>/)[1]);
const real=seed;
const c={...real,site:{...real.site,contactEmail:'hello@example.com'},
 services:[{title:'Minimalist websites',description:'Clean focused sites.',features:['Responsive layout'],projects:['MARVEL.WTF'],visible:true,order:1}],
 process:[{title:'Tell us your idea',text:'Share it via the form.',visible:true,order:1},{title:'Review the result',text:'',visible:true,order:2}],
 faq:[{q:'What does a website cost?',a:'Fixed ₹250–₹1,000.',visible:true,order:1}]};
db.prepare("INSERT INTO site VALUES('live',?,?,1)").run(JSON.stringify(c),Date.now());
const r=await W.fetch(new Request('https://t.test/'),{DB:D1,ASSETS});
fs.writeFileSync('/tmp/site.html',await r.text());console.log('rendered',r.status);
