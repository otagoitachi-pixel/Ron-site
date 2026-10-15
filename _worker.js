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
function ldData(html){const out=[],vids=[],orgs=[];
 const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;const t=[].concat(n['@type']||[]).map(String);if(t.includes('Product'))out.push(n);if(t.includes('VideoObject'))vids.push(n);if(t.some(x=>/^(Organization|WebSite|Store|LocalBusiness|OnlineStore)$/.test(x)))orgs.push(n);if(n['@graph'])walk(n['@graph']);if(n.video)walk(n.video)};
 for(const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1].trim()))}catch{}}
 return {out,vids,orgs}}
const set=(R,k,v,src)=>{if(v==null||v===''||R[k])return;R[k]=typeof v==='string'?v.trim():v;R.found[k]=src};
const imgKey=u=>u.split('#')[0].split('?')[0].replace(/[_-]\d+x\d*(?=\.\w+$)/,'').toLowerCase();
function addImg(R,u,source,verified){if(!u)return;try{if(/(^|[\/_.-])(logo|favicon|sprite|apple-touch-icon|site-icon|watermark)([\/_.-]|$)/i.test(new URL(u).pathname))return}catch{}if(/\.(svg|gif)(\?|$)/i.test(u))return;
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
 const R=extract(html,url,log);await shopify(R,url,log);let skip=false;for(const P of PARSERS)if(P.test(url,html)){P.run(R,html,url,log);skip=skip||P.skipGallery}if(!skip)gallery(R,html,url);finalize(R,log);cleanPreview(R,url,html);
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
 const raw=await readLimited(r,kind==='video'?40e6:10e6);if(!raw.length)throw new E('The file was empty.',422);const {bytes,cleaned}=cleanMedia(raw,ct);
 const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=h.slice(0,40)+'.'+t[1];await sbPut(env,key,bytes,ct);
 return {url:'/media/'+key,type:kind,size:bytes.length,cleaned}}
async function impPublish(P,env){
 if(!P||typeof P!=='object')throw new E('Missing product data.');
 const id=String(P.id||'').trim(),price=Number(P.price);
 if(!/^[\w-]{1,40}$/.test(id))throw new E('Invalid product ID.');
 let terms=[];try{if(P.sourceUrl)terms=sourceTerms(checkUrl(P.sourceUrl),null,P.sourceTerms)}catch{}
 const C={links:0,contacts:0,names:0};
 const name=scrubText(String(P.name||'').trim(),terms,C);
 if(!name||name.length>200)throw new E('Product name is required (max 200 characters). Source website names and links are removed automatically, so the name may have become empty.');
 if(!(price>0)||price>1e7)throw new E('Enter your selling price in ₹.');
 const okm=u=>typeof u==='string'&&/^\/media\/[\w.-]+$/.test(u);
 if([P.image,...(P.images||[])].filter(Boolean).some(u=>!okm(u))||(P.video&&!okm(P.video))||(P.poster&&!okm(P.poster)))throw new E('All media must be stored in your own storage before publishing.');
 const src=P.sourceUrl?normSrc(checkUrl(P.sourceUrl).href):'';
 if(src){const d=await env.DB.prepare("SELECT id FROM products WHERE json_extract(data,'$.sourceUrl')=? AND id<>?").bind(src,id).first();if(d)throw new E('This product URL was already imported as '+d.id+'.',409)}
 const ex=await env.DB.prepare('SELECT data FROM products WHERE id=?').bind(id).first();
 if(ex){let o={};try{o=JSON.parse(ex.data)}catch{}if(!src||o.sourceUrl!==src)throw new E('Product ID '+id+' is already used by another product.',409)}
 const specs={};for(const [k,v] of Object.entries(P.specs||{}).slice(0,40)){const kk=scrubText(String(k).slice(0,60),terms,C),vv=scrubText(String(v).slice(0,200),terms,C);if(kk&&vv)specs[kk]=vv}
 const orig=Number(P.originalPrice);
 const d={id,name,price,originalPrice:orig>price?orig:null,discount:String(P.discount||'').slice(0,40),category:String(P.category||'').slice(0,60),isNew:!!P.isNew,image:P.image||'',images:(P.images||[]).filter(Boolean),video:P.video||'',poster:P.poster||'',description:scrubText(String(P.description||'').slice(0,3000),terms,C),variants:[],specs,brand:scrubText(String(P.brand||'RON COLLECTION').slice(0,80),terms,C)||'RON COLLECTION',sku:String(P.sku||'').slice(0,80),sourceUrl:src,rating:null,reviewCount:0,reviews:[]};
 await env.DB.prepare('INSERT INTO products(id,data,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(id,JSON.stringify(d),Date.now()).run();
 return {ok:1,product:d,scrubbed:C}}
/* ===== Source privacy: nothing that points to the source website is published ===== */
const PRIV=['sourceUrl','sourceTerms','sku','brand'];
const GENERIC=new Set(['www','shop','shops','store','stores','web','online','site','shopping','mall','market','official','india','watch','watches','fashion','style','luxury','gold','silver','time','clock','men','mens','women','womens','collection','collections','boutique','world','club','hub','mart','bazaar','bazar','trends','trend','the','and','new','best','top','premium','product','products','home','buy','sale']);
function sourceTerms(url,html,extra){
 const T=new Set(),add=s=>{s=String(s||'').replace(/\s+/g,' ').trim();if(s.length>=3&&s.length<=80)T.add(s)};
 const host=url.hostname.toLowerCase().replace(/^www\./,'');add(host);
 const labels=host.split('.');labels.pop();
 for(const l of labels){if(l.length<3||GENERIC.has(l))continue;
  if(/[-_]/.test(l)){add(l);add(l.replace(/[-_]+/g,' '));add(l.replace(/[-_]+/g,''))}else if(l.length>=5)add(l)}
 if(html){const M=metas(html);for(const k of ['og:site_name','application-name'])(M[k]||[]).forEach(add);
  const {out,orgs}=ldData(html);for(const o of orgs)add(o.name);
  for(const P of out)[].concat(P.offers||[]).forEach(of=>{if(of&&of.seller)add(of.seller.name)})}
 for(const x of [].concat(extra||[]).slice(0,12))if(typeof x==='string')add(x);
 for(const t of [...T]){const w=t.split(/\s+/);while(w.length>1&&/^(store|stores|shop|shops|official|online|boutique|mart|India|collection|collections)$/i.test(w[w.length-1]))w.pop();const v=w.join(' ');if(v!==t&&v.length>=3)T.add(v)}
 return [...T].filter(x=>!GENERIC.has(x.toLowerCase())).sort((a,b)=>b.length-a.length)}
const RE_ESC=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function scrubText(s,terms,C){
 if(s==null)return s;let t=String(s);
 const go=(k,re,rep)=>{t=t.replace(re,(...a)=>{C[k]++;return typeof rep==='function'?rep(...a):rep})};
 go('links',/https?:\/\/[^\s<>"')\]]+/gi,'');
 go('links',/\bwww\.[^\s<>"')\]]+/gi,'');
 go('contacts',/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,'');
 go('links',/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|in|co\.in|net|org|io|shop|store|me|co|online|site|app|biz|info)\b(?:\/[^\s<>"')\]]*)?/gi,'');
 go('contacts',/(?:\+?91[\s-]?|\b0)?[6-9]\d{4}[\s-]?\d{5}\b/g,'');
 go('contacts',/\+\d{1,3}[\s-]?\d[\d\s-]{7,}\d/g,'');
 go('contacts',/(^|[\s(])@[\w.]{3,}/g,(m,p)=>p);
 for(const term of terms||[]){const re=new RegExp('(?<![A-Za-z0-9])'+RE_ESC(term).replace(/\s+/g,'[\\s_-]*')+'(?![A-Za-z0-9])','gi');go('names',re,'')}
 return t.replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;:!?])/g,'$1').replace(/\(\s*\)|\[\s*\]/g,'').replace(/^[\s|–—:,-]+|[\s|–—:,-]+$/g,'').replace(/\s+(?:by|from|at|via|on|for|with|of|and|&|\|)\s*$/i,'').replace(/\n{3,}/g,'\n\n')}
function cleanPreview(R,url,html){
 const C={links:0,contacts:0,names:0},terms=sourceTerms(url,html);
 R.sourceTerms=terms;R.sourceBrand=R.brand||null;R.sourceSku=R.sku||null;delete R.brand;delete R.sku;
 for(const k of ['name','description','category','color','material','dimensions'])if(R[k])R[k]=scrubText(R[k],terms,C)||null;
 const sp={};for(const [k,v] of Object.entries(R.specs||{})){if(k==='Brand'||k==='Model / SKU')continue;const kk=scrubText(k,terms,C),vv=scrubText(v,terms,C);if(kk&&vv)sp[kk]=vv}
 R.specs=sp;R.scrubbed=C;R.missing=(R.missing||[]).filter(x=>x!=='brand'&&x!=='model / SKU')}
/* ----- strip hidden metadata (EXIF, XMP, IPTC, comments, text chunks, MP4 tags) from imported files ----- */
const catU8=parts=>{let n=0;for(const p of parts)n+=p.length;const o=new Uint8Array(n);let k=0;for(const p of parts){o.set(p,k);k+=p.length}return o};
function exifOrientation(seg){try{
 if(!(seg[4]===0x45&&seg[5]===0x78&&seg[6]===0x69&&seg[7]===0x66))return 1;
 const t=10,le=seg[t]===0x49,u16=o=>le?seg[o]|(seg[o+1]<<8):(seg[o]<<8)|seg[o+1],u32=o=>(le?(seg[o]|(seg[o+1]<<8)|(seg[o+2]<<16)|(seg[o+3]<<24)):((seg[o]<<24)|(seg[o+1]<<16)|(seg[o+2]<<8)|seg[o+3]))>>>0;
 const ifd=t+u32(t+4),n=u16(ifd);
 for(let i=0;i<n;i++){const e=ifd+2+i*12;if(e+12>seg.length)break;if(u16(e)===0x0112){const v=u16(e+8);return v>=1&&v<=8?v:1}}}catch{}return 1}
function miniExif(o){const body=[0x45,0x78,0x69,0x66,0,0,0x4D,0x4D,0,0x2A,0,0,0,8,0,1,0x01,0x12,0,3,0,0,0,1,0,o,0,0,0,0,0,0],len=body.length+2;return Uint8Array.from([0xFF,0xE1,len>>8,len&255,...body])}
function stripJpeg(b){
 if(b[0]!==0xFF||b[1]!==0xD8)return b;
 const out=[b.subarray(0,2)];let i=2,done=false;
 while(i<b.length){
  if(b[i]!==0xFF){out.push(b.subarray(i));break}
  const m=b[i+1];
  if(m===0xFF){i++;continue}
  if(m===0xD8||m===0x01||(m>=0xD0&&m<=0xD7)){out.push(b.subarray(i,i+2));i+=2;continue}
  if(m===0xD9){out.push(b.subarray(i,i+2));i+=2;break}
  if(m===0xDA){out.push(b.subarray(i));break}
  const len=(b[i+2]<<8)|b[i+3],seg=b.subarray(i,i+2+len);
  if(m===0xE1){const o=exifOrientation(seg);if(o>1&&!done){out.push(miniExif(o));done=true}}
  else if(m===0xE0||m===0xEE||(m===0xE2&&String.fromCharCode(...seg.subarray(4,15))==='ICC_PROFILE')||!((m>=0xE0&&m<=0xEF)||m===0xFE))out.push(seg);
  i+=2+len}
 return catU8(out)}
function stripPng(b){
 const sig=[137,80,78,71,13,10,26,10];if(b.length<8||sig.some((v,i)=>b[i]!==v))return b;
 const out=[b.subarray(0,8)],DROP=new Set(['tEXt','zTXt','iTXt','eXIf','tIME']);let i=8;
 while(i+12<=b.length){const len=((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0,type=String.fromCharCode(b[i+4],b[i+5],b[i+6],b[i+7]),end=i+12+len;
  if(end>b.length){out.push(b.subarray(i));break}
  if(!DROP.has(type))out.push(b.subarray(i,end));
  i=end;if(type==='IEND')break}
 return catU8(out)}
function stripWebp(b){
 const s4=o=>String.fromCharCode(b[o],b[o+1],b[o+2],b[o+3]);
 if(b.length<12||s4(0)!=='RIFF'||s4(8)!=='WEBP')return b;
 const out=[b.slice(0,12)];let i=12;
 while(i+8<=b.length){const type=s4(i),len=(b[i+4]|(b[i+5]<<8)|(b[i+6]<<16)|(b[i+7]<<24))>>>0,end=i+8+len+(len&1),stop=Math.min(end,b.length);
  if(type==='EXIF'||type==='XMP '){}
  else if(type==='VP8X'){const c=b.slice(i,stop);c[8]&=~0x0C;out.push(c)}
  else out.push(b.subarray(i,stop));
  i=end}
 const res=catU8(out),n=res.length-8;res[4]=n&255;res[5]=(n>>8)&255;res[6]=(n>>16)&255;res[7]=(n>>>24)&255;return res}
function blankMp4(b){
 const u32=o=>((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0,ty=o=>String.fromCharCode(b[o],b[o+1],b[o+2],b[o+3]),BLANK=new Set(['udta','meta','uuid']);let n=0;
 const walk=(s,e,depth)=>{let i=s;while(i+8<=e){let size=u32(i),hdr=8;const t=ty(i+4);
  if(size===1){if(i+16>e)break;size=u32(i+8)*4294967296+u32(i+12);hdr=16}else if(size===0)size=e-i;
  if(size<hdr||i+size>e)break;
  if(BLANK.has(t)){b[i+4]=0x66;b[i+5]=0x72;b[i+6]=0x65;b[i+7]=0x65;b.fill(0,i+hdr,i+size);n++}
  else if((t==='moov'||t==='trak')&&depth<3)walk(i+hdr,i+size,depth+1);
  i+=size}};
 walk(0,b.length,0);return n}
function cleanMedia(bytes,ct){try{
 if(ct==='image/jpeg'){const o=stripJpeg(bytes);if(o[0]===0xFF&&o[1]===0xD8&&(bytes[bytes.length-1]!==0xD9||o[o.length-1]===0xD9))return{bytes:o,cleaned:true};return{bytes,cleaned:false}}
 if(ct==='image/png'){const o=stripPng(bytes);if(o.length>12&&String.fromCharCode(...o.subarray(o.length-8,o.length-4))==='IEND')return{bytes:o,cleaned:true};return{bytes,cleaned:false}}
 if(ct==='image/webp')return{bytes:stripWebp(bytes),cleaned:true};
 if(ct==='video/mp4'||ct==='video/quicktime'){blankMp4(bytes);return{bytes,cleaned:true}}
 }catch{}return{bytes,cleaned:false}}
/* ===== end source privacy ===== */
/* ===== Supabase Storage (media files) ===== */
async function sbPut(env,key,body,type){
 const base=(env.SUPABASE_URL||'').replace(/\/$/,'');
 if(!base||!env.SUPABASE_SERVICE_KEY)throw new E('Media storage (Supabase) is not configured yet.',503);
 const r=await fetch(base+'/storage/v1/object/'+(env.SUPABASE_BUCKET||'ron-media')+'/'+key,{method:'POST',headers:{authorization:'Bearer '+env.SUPABASE_SERVICE_KEY,apikey:env.SUPABASE_SERVICE_KEY,'content-type':type||'application/octet-stream','x-upsert':'true','cache-control':'max-age=31536000'},body});
 if(!r.ok)throw new E('Storage upload failed (HTTP '+r.status+').',502)}
/* ===== end importer ===== */
export default{async fetch(req,env){
const u=new URL(req.url),p=u.pathname;
if(p==='/tryon')return Response.redirect(u.origin+'/tryon/'+u.search, 308);
const authed=()=>env.ADMIN_PASSWORD&&req.headers.get('x-admin-password')===env.ADMIN_PASSWORD;
try{
if(p==='/api/check')return authed()?J({ok:1}):J({error:'no'},401);
if(p==='/api/products'){
 if(req.method==='GET'){const {results}=await env.DB.prepare('SELECT data FROM products ORDER BY created DESC').all();
  const pub=[];for(const r of results){try{const o=JSON.parse(r.data);for(const k of PRIV)delete o[k];pub.push(o)}catch{}}
  return new Response(JSON.stringify(pub),{headers:{'content-type':'application/json','cache-control':'no-store'}})}
 if(!authed())return J({error:'Wrong password'},401);
 if(req.method==='POST'){const d=await req.json();if(!d.id||!d.name)return J({error:'ID and name required'},400);
  const prev=await env.DB.prepare('SELECT data FROM products WHERE id=?').bind(d.id).first();
  if(prev){try{const o=JSON.parse(prev.data);for(const k of PRIV)if(o[k]!==undefined&&d[k]===undefined)d[k]=o[k]}catch{}}
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
if(p==='/robots.txt')return new Response('User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: '+u.origin+'/sitemap.xml\n',{headers:{'content-type':'text/plain'}});
if(p==='/sitemap.xml'){let lm='';try{const {results}=await env.DB.prepare('SELECT MAX(created) m FROM products').all();if(results&&results[0]&&results[0].m)lm='<lastmod>'+new Date(results[0].m).toISOString().slice(0,10)+'</lastmod>'}catch{}
 return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+u.origin+'/</loc>'+lm+'<changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>',{headers:{'content-type':'application/xml'}})}
if((p==='/'||p==='/index.html')&&req.method==='GET'){
 const res=await env.ASSETS.fetch(new Request(u.origin+'/',{headers:req.headers}));
 if(res.ok&&(res.headers.get('content-type')||'').includes('html'))try{
  let html=await res.text();const O=u.origin,abs=x=>x?(/^https?:/.test(x)?x:O+(x.startsWith('/')?x:'/'+x)):undefined;
  const {results}=await env.DB.prepare('SELECT data FROM products ORDER BY created DESC').all();const L=[];
  for(const r of results){try{const o=JSON.parse(r.data);if(!o.name||!(o.price>0))continue;
   const pr={'@type':'Product',name:o.name,sku:o.id,image:[o.image,...(o.images||[])].filter(Boolean).map(abs),brand:{'@type':'Brand',name:'RON COLLECTION'},offers:{'@type':'Offer',url:O+'/',priceCurrency:'INR',price:String(o.price)}};
   if(o.description)pr.description=String(o.description).slice(0,300);L.push(pr)}catch{}}
  const ld=[{'@context':'https://schema.org','@type':'Organization',name:'RON COLLECTION',url:O+'/',logo:O+'/images/logo.png'},{'@context':'https://schema.org','@type':'WebSite',name:'RON COLLECTION',url:O+'/'}];
  if(L.length)ld.push({'@context':'https://schema.org','@type':'ItemList',itemListElement:L.slice(0,50).map((x,i)=>({'@type':'ListItem',position:i+1,item:x}))});
  const first=(L[0]&&L[0].image&&L[0].image[0])||O+'/images/logo.png';
  const inj='<link rel="canonical" href="'+O+'/"><meta property="og:url" content="'+O+'/">'+(first?'<meta property="og:image" content="'+first+'"><meta name="twitter:image" content="'+first+'">':'')+'<script type="application/ld+json">'+JSON.stringify(ld).replace(/</g,'\\u003c')+'</script>';
  const h=new Headers(res.headers);h.delete('content-length');h.delete('etag');h.set('cache-control','public,max-age=300');
  return new Response(html.replace('</head>',inj+'</head>'),{status:200,headers:h})}catch{}
 return env.ASSETS.fetch(req)}
return env.ASSETS.fetch(req)}}
