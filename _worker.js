const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json'}});
/* ===== Product URL importer (additive; existing routes unchanged) ===== */
class E extends Error{constructor(m,s=400){super(m);this.status=s}}
const UA='Mozilla/5.0 (compatible; RONCollectionImporter/1.0)';
const dec=s=>String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;|&#x27;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
const clean=s=>s?dec(String(s).replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'')).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim().slice(0,3000):null;
function checkUrl(raw){let u;try{u=new URL(String(raw).trim())}catch{throw new E('That is not a valid URL.')}
 if(u.protocol!=='http:'&&u.protocol!=='https:')throw new E('Only http:// and https:// URLs are allowed.');
 if(u.username||u.password)throw new E('URLs containing a username or password are not allowed.');
 if(u.port&&u.port!=='80'&&u.port!=='443')throw new E('Only standard web ports are allowed.');
 const h=u.hostname.toLowerCase().replace(/\.$/,'');
 if(!h||h.includes(':')||h.startsWith('[')||/^[\d.]+$/.test(h)||/^0x/i.test(h))throw new E('Use a normal website address, not an IP address.');
 if(!h.includes('.')||/(^|\.)(localhost|local|internal|intranet|lan|corp|home|localdomain|arpa)$/.test(h))throw new E('Internal or private addresses are not allowed.');
 return u}
async function sfetch(raw,o={}){let u=checkUrl(raw);
 for(let i=0;i<6;i++){let r;
  try{r=await fetch(u.href,{redirect:'manual',signal:AbortSignal.timeout(o.timeout||10000),headers:{'user-agent':UA,accept:o.accept||'*/*','accept-language':'en'}})}
  catch(e){throw new E(e&&e.name==='TimeoutError'?'The website took too long to respond.':'Could not reach the website.',504)}
  if([301,302,303,307,308].includes(r.status)){const l=r.headers.get('location');if(!l)throw new E('The website sent an invalid redirect.',502);u=checkUrl(new URL(l,u).href);continue}
  return {r,url:u}}
 throw new E('Too many redirects.',502)}
async function readLimited(r,max){if((+r.headers.get('content-length')||0)>max)throw new E('The file is too large.',413);
 const rd=r.body.getReader(),ch=[];let n=0;
 for(;;){const {done,value}=await rd.read();if(done)break;n+=value.length;if(n>max){try{rd.cancel()}catch{}throw new E('The file is too large.',413)}ch.push(value)}
 const out=new Uint8Array(n);let o=0;for(const c of ch){out.set(c,o);o+=c.length}return out}
const absUrl=(s,b)=>{try{if(!s)return null;const u=new URL(dec(String(s).trim()),b);return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}};
function normSrc(href){const u=new URL(href);u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid|mc_|_ga|ref$)/i.test(k))u.searchParams.delete(k);return u.href.replace(/\/$/,'')}
function metas(html){const m={};for(const t of html.match(/<meta\s[^>]*>/gi)||[]){const k=/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(t),c=/content\s*=\s*["']([^"']*)["']/i.exec(t);if(k&&c){const key=k[1].toLowerCase();(m[key]=m[key]||[]).push(dec(c[1]))}}return m}
function ldData(html){const out=[],vids=[];
 const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;const t=[].concat(n['@type']||[]).map(String);if(t.includes('Product'))out.push(n);if(t.includes('VideoObject'))vids.push(n);if(n['@graph'])walk(n['@graph']);if(n.video)walk(n.video)};
 for(const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1].trim()))}catch{}}
 return {out,vids}}
const set=(R,k,v,src)=>{if(v==null||v===''||R[k])return;R[k]=typeof v==='string'?v.trim():v;R.found[k]=src};
const imgKey=u=>u.split('#')[0].split('?')[0].replace(/[_-]\d+x\d*(?=\.\w+$)/,'').toLowerCase();
function addImg(R,u,source,verified){if(!u)return;if(/\.(svg|gif)(\?|$)/i.test(u))return;
 if(/cdn\.shopify\.com|\/cdn\/shop\//.test(u))u=u.replace(/_\d+x\d*(?=\.\w+(\?|$))/,'');
 const k=imgKey(u),ex=R.images.find(i=>imgKey(i.url)===k);
 if(ex){if(verified&&!ex.verified){ex.verified=true;ex.source=source}return}
 R.images.push({url:u,source,verified})}
function addVid(R,v){const u=absUrl(v.url);if(!u||R.videos.some(x=>x.url===u))return;
 const ok=/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)&&!v.embed;
 R.videos.push({url:u,title:v.title||null,poster:v.poster||null,duration:v.duration||null,format:(/\.(\w{3,4})(\?|#|$)/.exec(new URL(u).pathname+'?')||[])[1]||null,importable:ok,reason:ok?null:'This is a streaming player or embed. It cannot be imported as a file.',source:v.source})}
const money=v=>{if(v==null)return null;const n=parseFloat(String(v).replace(/[^\d.]/g,''));return isFinite(n)?n:null};
function extract(html,url,log){
 const R={name:null,brand:null,sku:null,description:null,price:null,currency:null,availability:null,category:null,color:null,material:null,dimensions:null,specs:{},images:[],videos:[],found:{}};
 const M=metas(html),g=k=>(M[k]||[])[0],{out,vids}=ldData(html),P=out[0],S='structured data',O='page metadata';
 if(P){log.push('Found Product structured data (JSON-LD)');
  set(R,'name',P.name&&String(P.name),S);set(R,'brand',typeof P.brand==='string'?P.brand:P.brand&&P.brand.name,S);
  set(R,'sku',P.sku||P.mpn||P.productID,S);set(R,'description',clean(P.description),S);
  set(R,'category',typeof P.category==='string'?P.category:null,S);set(R,'color',P.color&&String(P.color),S);set(R,'material',P.material&&String(P.material),S);
  const dims=['width','height','depth'].map(k=>P[k]&&(k[0].toUpperCase()+k.slice(1)+' '+(typeof P[k]==='object'?[P[k].value||P[k].name,P[k].unitText||P[k].unitCode].filter(Boolean).join(' '):P[k]))).filter(Boolean);
  if(dims.length)set(R,'dimensions',dims.join(', '),S);
  const o=[].concat(P.offers||[]).flatMap(x=>x&&x.offers?[].concat(x.offers):[x])[0]||{},ps=o.priceSpecification||{};
  set(R,'price',money(o.price??o.lowPrice??ps.price),S);set(R,'currency',o.priceCurrency||ps.priceCurrency,S);
  set(R,'availability',o.availability&&String(o.availability).split('/').pop().replace(/([a-z])([A-Z])/g,'$1 $2'),S);
  [].concat(P.image||[]).forEach(i=>addImg(R,absUrl(typeof i==='string'?i:i&&(i.url||i.contentUrl),url),S,true));
  [].concat(P.additionalProperty||[]).forEach(a=>{if(a&&a.name&&a.value!=null)R.specs[String(a.name)]=String(a.value)})}
 set(R,'name',g('og:title'),O);set(R,'description',clean(g('og:description')||g('description')),O);
 set(R,'price',money(g('product:price:amount')||g('og:price:amount')),O);set(R,'currency',g('product:price:currency')||g('og:price:currency'),O);
 set(R,'availability',g('product:availability')||g('og:availability'),O);set(R,'brand',g('product:brand'),O);set(R,'category',g('product:category'),O);
 for(const k of ['og:image','og:image:secure_url','og:image:url','twitter:image'])(M[k]||[]).forEach(i=>addImg(R,absUrl(i,url),'Open Graph',true));
 if(!R.name){const t=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);if(t)set(R,'name',clean(t[1]),'page title');}
 for(const v of vids)addVid(R,{url:v.contentUrl||v.embedUrl,embed:!v.contentUrl,title:v.name,poster:[].concat(v.thumbnailUrl||[])[0],duration:v.duration,source:'structured data'});
 for(const k of ['og:video','og:video:url','og:video:secure_url'])(M[k]||[]).forEach(v=>addVid(R,{url:v,embed:/youtube|vimeo|\/embed\//i.test(v),source:'Open Graph'}));
 for(const m of html.matchAll(/<(?:video|source)\s[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi))addVid(R,{url:absUrl(m[1],url),source:'page'});
 return R}
async function shopify(R,url,log){const m=/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\/([^/?#]+)/i.exec(url.pathname);if(!m)return;
 try{const {r}=await sfetch(url.origin+'/products/'+m[1]+'.js',{accept:'application/json',timeout:8000});if(!r.ok)return;
  const j=JSON.parse(new TextDecoder().decode(await readLimited(r,2e6)));if(!j||!j.title)return;const S='store product data';
  log.push('Found the store\'s public product data');
  set(R,'name',j.title,S);set(R,'brand',j.vendor,S);set(R,'description',clean(j.description),S);set(R,'category',j.type,S);set(R,'sku',j.variants&&j.variants[0]&&j.variants[0].sku,S);
  (j.images||[]).forEach(i=>addImg(R,absUrl(i,url),S,true));
  for(const md of j.media||[])if(md.media_type==='video')for(const s of md.sources||[])if(/mp4|webm|quicktime/i.test((s.mime_type||'')+(s.format||'')))addVid(R,{url:s.url,poster:md.preview_image&&md.preview_image.src,title:md.alt,source:S})}
 catch{}}
function gallery(R,html,url){let n=0;
 for(const t of html.match(/<img\s[^>]*>/gi)||[]){if(n>=12)break;
  if(!/(product|gallery|zoom|slide|pdp|main-image)/i.test(t)||/(logo|icon|sprite|banner|avatar|badge|payment|flag|pixel|tracking|placeholder|loader|1x1)/i.test(t))continue;
  const s=/\b(?:data-zoom-image|data-large|data-original|data-src|src)\s*=\s*["']([^"']+)["']/i.exec(t);const u=s&&absUrl(s[1],url);if(!u||u.startsWith('data:'))continue;
  const b=R.images.length;addImg(R,u,'page',false);if(R.images.length>b)n++}}
function finalize(R,log){
 const sp={};if(R.brand)sp.Brand=R.brand;if(R.sku)sp['Model / SKU']=R.sku;if(R.color)sp.Color=R.color;if(R.material)sp.Material=R.material;if(R.dimensions)sp.Dimensions=R.dimensions;
 R.specs=Object.assign(sp,R.specs);R.images=R.images.slice(0,20);
 const miss=[];[['name','name'],['brand','brand'],['sku','model / SKU'],['description','description'],['price','source price'],['currency','currency'],['availability','availability'],['category','category'],['color','color'],['material','material'],['dimensions','dimensions']].forEach(([k,l])=>{if(!R[k])miss.push(l)});
 if(!Object.keys(R.specs).length)miss.push('specifications');if(!R.images.length)miss.push('images');if(!R.videos.length)miss.push('videos');R.missing=miss;
 log.push(`Found ${R.images.length} image(s) and ${R.videos.length} video(s)`)}
/* Platform parsers: add more here without touching the rest of the importer */
function cartpe(R,html,url,log){
 const main=html.split(/related products/i)[0],S='CartPe store page';
 log.push('Recognised a CartPe store page');
 const h=/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(main),nm=h&&clean(h[1]);if(nm){R.name=nm;R.found.name=S}
 const text=clean(main.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,''))||'';
 const at=nm?text.lastIndexOf(nm):-1,after=at>=0?text.slice(at+nm.length):text;
 const pm=/(\d[\d,]*(?:\.\d+)?)\D{0,12}?(\d[\d,]*(?:\.\d+)?)\s*\(\s*(\d+)\s*%\s*off\s*\)/i.exec(after);
 if(pm){R.price=money(pm[1]);R.listPrice=money(pm[2]);R.discountPct=+pm[3];R.currency='INR';R.found.price=S;R.found.currency='CartPe stores list prices in rupees (assumed, not stated on the page)'}
 else{const sp=/(?:₹|Rs\.?)\s*(\d[\d,]*(?:\.\d+)?)/i.exec(after);if(sp){R.price=money(sp[1]);R.currency='INR';R.found.price=S;R.found.currency='CartPe stores list prices in rupees (assumed, not stated on the page)'}}
 const av=/Avail\w*\s*:\s*(in stock|out of stock|sold out|unavailable|pre-?order|[a-z]+)/i.exec(after);if(av){R.availability=av[1].replace(/\b\w/g,c=>c.toUpperCase());R.found.availability=S}
 const rank=f=>{const i=['gallery_xl','gallery_lg','gallery_org','gallery','gallery_md','gallery_sm'].indexOf(f.toLowerCase());return i<0?3.5:i},best={};
 for(const m of main.matchAll(/https?:\/\/cdn\.cartpe\.in\/images\/(gallery\w*)\/([\w.-]+\.(?:png|jpe?g|webp))/gi)){const id=m[2].toLowerCase();if(!best[id]||rank(m[1])<rank(best[id].f))best[id]={f:m[1],u:m[0]}}
 const u=Object.values(best).map(x=>x.u);if(u.length){R.images=[];u.forEach(x=>addImg(R,x,S,true))}}
const PARSERS=[{test:(u,html)=>/\.cartpe\.in$/i.test(u.hostname)||/cdn\.cartpe\.in\//i.test(html),run:cartpe,skipGallery:true}];
async function impPreview(raw,env){const log=[];
 const {r,url}=await sfetch(raw,{accept:'text/html,application/xhtml+xml',timeout:12000});
 if([401,403,429].includes(r.status)||r.headers.get('cf-mitigated'))throw new E(`The website blocked automated access (HTTP ${r.status}). Automated protections are never bypassed. Enter the product manually instead.`,422);
 if(!r.ok)throw new E(`The product page returned HTTP ${r.status}.`,422);
 if(!(r.headers.get('content-type')||'').toLowerCase().includes('html'))throw new E('That URL is not a web page.',422);
 const html=new TextDecoder().decode(await readLimited(r,3e6));
 if(/captcha|verify you are (a )?human|just a moment\.\.\./i.test(html.slice(0,20000))&&!/application\/ld\+json/i.test(html))throw new E('The website is asking for human verification, which is never bypassed.',422);
 log.push(`Page retrieved (HTTP ${r.status})`);
 const R=extract(html,url,log);await shopify(R,url,log);let skip=false;for(const P of PARSERS)if(P.test(url,html)){P.run(R,html,url,log);skip=skip||P.skipGallery}if(!skip)gallery(R,html,url);finalize(R,log);
 R.sourceUrl=normSrc(url.href);R.duplicate=null;
 const d=await env.DB.prepare("SELECT id,data FROM products WHERE json_extract(data,'$.sourceUrl')=?").bind(R.sourceUrl).first();
 if(d){let n='';try{n=JSON.parse(d.data).name}catch{}R.duplicate={id:d.id,name:n}}
 R.log=log;return R}
const MT={'image/jpeg':['image','jpg'],'image/png':['image','png'],'image/webp':['image','webp'],'image/avif':['image','avif'],'video/mp4':['video','mp4'],'video/webm':['video','webm'],'video/quicktime':['video','mov']};
const EXT={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif',mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime'};
async function impMedia(b,env){const kind=b.kind==='video'?'video':'image';
 const {r,url}=await sfetch(b.url,{accept:kind==='video'?'video/*':'image/*',timeout:40000});
 if(!r.ok)throw new E(`The source returned HTTP ${r.status} for this file.`,422);
 let ct=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!MT[ct]&&(!ct||/octet-stream/.test(ct))){const m=/\.(\w{3,4})$/.exec(url.pathname);ct=(m&&EXT[m[1].toLowerCase()])||ct}
 const t=MT[ct];if(!t||t[0]!==kind)throw new E(`Unsupported file type (${ct||'unknown'}).`,415);
 const bytes=await readLimited(r,kind==='video'?40e6:10e6);if(!bytes.length)throw new E('The file was empty.',422);
 const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=h.slice(0,40)+'.'+t[1];await sbPut(env,key,bytes,ct);
 return {url:'/media/'+key,type:kind,size:bytes.length}}
async function impPublish(P,env){
 if(!P||typeof P!=='object')throw new E('Missing product data.');
 const id=String(P.id||'').trim(),name=String(P.name||'').trim(),price=Number(P.price);
 if(!/^[\w-]{1,40}$/.test(id))throw new E('Invalid product ID.');
 if(!name||name.length>200)throw new E('Product name is required (max 200 characters).');
 if(!(price>0)||price>1e7)throw new E('Enter your selling price in ₹.');
 const okm=u=>typeof u==='string'&&/^\/media\/[\w.-]+$/.test(u);
 if([P.image,...(P.images||[])].filter(Boolean).some(u=>!okm(u))||(P.video&&!okm(P.video))||(P.poster&&!okm(P.poster)))throw new E('All media must be stored in your own storage before publishing.');
 const src=P.sourceUrl?normSrc(checkUrl(P.sourceUrl).href):'';
 if(src){const d=await env.DB.prepare("SELECT id FROM products WHERE json_extract(data,'$.sourceUrl')=? AND id<>?").bind(src,id).first();if(d)throw new E('This product URL was already imported as '+d.id+'.',409)}
 const ex=await env.DB.prepare('SELECT data FROM products WHERE id=?').bind(id).first();
 if(ex){let o={};try{o=JSON.parse(ex.data)}catch{}if(!src||o.sourceUrl!==src)throw new E('Product ID '+id+' is already used by another product.',409)}
 const specs={};for(const [k,v] of Object.entries(P.specs||{}).slice(0,40))if(k&&v)specs[String(k).slice(0,60)]=String(v).slice(0,200);
 const orig=Number(P.originalPrice);
 const d={id,name,price,originalPrice:orig>price?orig:null,discount:String(P.discount||'').slice(0,40),category:String(P.category||'').slice(0,60),isNew:!!P.isNew,image:P.image||'',images:(P.images||[]).filter(Boolean),video:P.video||'',poster:P.poster||'',description:String(P.description||'').slice(0,3000),variants:[],specs,brand:String(P.brand||'').slice(0,80),sku:String(P.sku||'').slice(0,80),sourceUrl:src,rating:null,reviewCount:0,reviews:[]};
 await env.DB.prepare('INSERT INTO products(id,data,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(id,JSON.stringify(d),Date.now()).run();
 return {ok:1,product:d}}
/* ===== Supabase Storage (media files) ===== */
async function sbPut(env,key,body,type){
 const base=(env.SUPABASE_URL||'').replace(/\/$/,'');
 if(!base||!env.SUPABASE_SERVICE_KEY)throw new E('Media storage (Supabase) is not configured yet.',503);
 const r=await fetch(base+'/storage/v1/object/'+(env.SUPABASE_BUCKET||'ron-media')+'/'+key,{method:'POST',headers:{authorization:'Bearer '+env.SUPABASE_SERVICE_KEY,apikey:env.SUPABASE_SERVICE_KEY,'content-type':type||'application/octet-stream','x-upsert':'true','cache-control':'max-age=31536000'},body});
 if(!r.ok)throw new E('Storage upload failed (HTTP '+r.status+').',502)}
/* ===== end importer ===== */
export default{async fetch(req,env){
const u=new URL(req.url),p=u.pathname;
const authed=()=>env.ADMIN_PASSWORD&&req.headers.get('x-admin-password')===env.ADMIN_PASSWORD;
try{
if(p==='/api/check')return authed()?J({ok:1}):J({error:'no'},401);
if(p==='/api/products'){
 if(req.method==='GET'){const {results}=await env.DB.prepare('SELECT data FROM products ORDER BY created DESC').all();
  return new Response('['+results.map(r=>r.data).join(',')+']',{headers:{'content-type':'application/json','cache-control':'no-store'}})}
 if(!authed())return J({error:'Wrong password'},401);
 if(req.method==='POST'){const d=await req.json();if(!d.id||!d.name)return J({error:'ID and name required'},400);
  await env.DB.prepare('INSERT INTO products(id,data,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(d.id,JSON.stringify(d),Date.now()).run();return J({ok:1})}
 if(req.method==='DELETE'){await env.DB.prepare('DELETE FROM products WHERE id=?').bind(u.searchParams.get('id')).run();return J({ok:1})}
}
if(p.startsWith('/api/import/')){
 if(!authed())return J({error:'Wrong password'},401);
 if(req.method!=='POST')return J({error:'Method not allowed'},405);
 try{const b=await req.json().catch(()=>({}));
  if(p==='/api/import/preview')return J(await impPreview(b.url,env));
  if(p==='/api/import/media')return J(await impMedia(b,env));
  if(p==='/api/import/publish')return J(await impPublish(b.product,env));
  return J({error:'Not found'},404)}
 catch(e){if(e instanceof E)return J({error:e.message},e.status||400);return J({error:'Import failed unexpectedly. Please try again.'},500)}}
if(p==='/api/upload'&&req.method==='POST'){
 if(!authed())return J({error:'Wrong password'},401);
 const f=(await req.formData()).get('file');
 const ext=((f.name.split('.').pop()||'bin')).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
 const key=crypto.randomUUID()+'.'+ext;
 if(f.size>45e6)return J({error:'File too large (max 45 MB)'},413);await sbPut(env,key,await f.arrayBuffer(),f.type);
 return J({url:'/media/'+key,type:f.type.startsWith('video')?'video':'image'})}
if(p.startsWith('/media/')){
 const base=(env.SUPABASE_URL||'').replace(/\/$/,'');
 if(!/^\/media\/[\w.-]+$/.test(p))return new Response('Not found',{status:404});
 if(!base)return new Response('Media storage is not configured',{status:503});
 const rg=req.headers.get('range');
 const up=await fetch(base+'/storage/v1/object/public/'+(env.SUPABASE_BUCKET||'ron-media')+'/'+p.slice(7),{headers:rg?{range:rg}:{}});
 if(!up.ok)return new Response('Not found',{status:404});
 const h=new Headers();for(const k of ['content-type','content-length','content-range','accept-ranges','etag'])if(up.headers.get(k))h.set(k,up.headers.get(k));
 h.set('cache-control','public,max-age=31536000,immutable');
 return new Response(up.body,{status:up.status,headers:h})}
}catch(e){if(e instanceof E)return J({error:e.message},e.status||400);return J({error:'Server error. Please try again.'},500)}
return env.ASSETS.fetch(req)}}
