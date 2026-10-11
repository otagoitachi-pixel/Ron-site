const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json'}});
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
if(p==='/api/upload'&&req.method==='POST'){
 if(!authed())return J({error:'Wrong password'},401);
 const f=(await req.formData()).get('file');
 const ext=((f.name.split('.').pop()||'bin')).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
 const key=crypto.randomUUID()+'.'+ext;
 await env.BUCKET.put(key,f.stream(),{httpMetadata:{contentType:f.type}});
 return J({url:'/media/'+key,type:f.type.startsWith('video')?'video':'image'})}
if(p.startsWith('/media/')){
 const o=await env.BUCKET.get(p.slice(7),{range:req.headers});
 if(!o)return new Response('Not found',{status:404});
 const h=new Headers();o.writeHttpMetadata(h);h.set('cache-control','public,max-age=31536000,immutable');h.set('accept-ranges','bytes');
 let s=200;if(req.headers.get('range')&&o.range){s=206;const a=o.range.offset||0,l=o.range.length??(o.size-a);h.set('content-range',`bytes ${a}-${a+l-1}/${o.size}`)}
 return new Response(o.body,{status:s,headers:h})}
}catch(e){return J({error:String(e.message||e)},500)}
return env.ASSETS.fetch(req)}}
