'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const router = express.Router();
const mutationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
router.use((req, res, next) => req.method === 'GET' || req.method === 'HEAD' ? next() : mutationLimiter(req, res, next));
// Override Ãºtil para tests aislados; producciÃ³n usa el directorio data del proyecto.
const DATA = process.env.RESUELVO_DATA_DIR || path.join(__dirname, 'data');
const FILES = {
  leads: path.join(DATA, 'solicitudes.json'),
  pros: path.join(DATA, 'profesionales.json'),
  ledger: path.join(DATA, 'creditos-ledger.json'),
  audit: path.join(DATA, 'marketplace-audit.json')
};
const provincias = ['A Coruña','Álava','Albacete','Alicante','Almería','Asturias','Ávila','Badajoz','Baleares','Barcelona','Burgos','Cáceres','Cádiz','Cantabria','Castellón','Ciudad Real','Córdoba','Cuenca','Girona','Granada','Guadalajara','Gipuzkoa','Huelva','Huesca','Jaén','León','Lleida','La Rioja','Lugo','Madrid','Málaga','Murcia','Navarra','Ourense','Palencia','Las Palmas','Pontevedra','Santa Cruz de Tenerife','Segovia','Sevilla','Soria','Tarragona','Teruel','Toledo','Valencia','Valladolid','Bizkaia','Zamora','Zaragoza','Ceuta','Melilla'];
const categorias = [
 ['fontaneria','Fontanería',7],['electricidad','Electricidad',7],['climatizacion','Climatización',10],['cerrajeria','Cerrajería',9],['reformas','Reformas y albañilería',20],['pintura','Pintura',10],['limpieza','Limpieza',3],['mudanzas','Mudanzas y portes',8],['jardineria','Jardinería',5],['montajes','Montaje de muebles',4],['electrodomesticos','Reparación de electrodomésticos',7],['informatica','Informática y reparación',5],['mascotas','Cuidado de mascotas',4],['fotografia','Fotografía y eventos',8],['belleza','Belleza a domicilio',4],['clases','Clases particulares',4],['otros','Otros servicios',5]
];
const money = n => Math.max(0, Number(n) || 0);
function read(key) { try { const x=JSON.parse(fs.readFileSync(FILES[key],'utf8')); return Array.isArray(x)?x:[]; } catch { return []; } }
function write(key, rows) { fs.mkdirSync(DATA,{recursive:true}); const tmp=FILES[key]+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(rows,null,2),{mode:0o600}); fs.renameSync(tmp,FILES[key]); }
function audit(action, actor, details={}) { const rows=read('audit'); rows.push({id:crypto.randomUUID(),action,actor:actor||'anonymous',details,at:new Date().toISOString()}); write('audit',rows.slice(-10000)); }
function esc(s) { return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function page(title,body,user=null) { return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#102f2b"><meta name="description" content="Encuentra profesionales de confianza para resolver lo que necesitas en tu zona."><title>'+esc(title)+' | Ayuda en el Barrio</title><style>:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#142f2b;background:#f7f8f4;font-synthesis:none;text-rendering:optimizeLegibility;--ink:#142f2b;--muted:#687974;--green:#16745f;--lime:#c9f36b;--line:#e2e8df;--paper:#fff}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}a{color:var(--green)}header{position:sticky;top:0;z-index:10;background:rgba(247,248,244,.92);backdrop-filter:blur(14px);padding:16px max(22px,calc((100% - 1160px)/2));border-bottom:1px solid rgba(20,47,43,.08);display:flex;justify-content:space-between;gap:18px;align-items:center}header>a{display:flex;align-items:center;gap:10px;color:var(--ink);font-size:1.02rem;font-weight:900;letter-spacing:-.04em;text-decoration:none}header>a:before{content:"a";display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--lime);color:var(--ink);font-size:1.3rem;font-weight:950}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}header nav a{padding:9px 12px;color:var(--ink);font-size:.9rem;text-decoration:none;font-weight:750;border-radius:999px}header nav a:hover{background:#e8eee5}.wrap{max-width:1160px;margin:34px auto 72px;padding:0 22px}.card{background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:24px;margin:14px 0;box-shadow:0 12px 36px rgba(20,47,43,.045)}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(2.5rem,6vw,5.3rem);line-height:.99;letter-spacing:-.075em;font-weight:900;max-width:720px;margin-bottom:22px}h2{font-size:clamp(1.25rem,2.4vw,1.8rem);letter-spacing:-.045em;margin-bottom:12px}h3{letter-spacing:-.03em}.muted{color:var(--muted);line-height:1.65}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.field{margin:0 0 14px}label{font-size:.88rem;font-weight:750;display:block;margin-bottom:7px}input,select,textarea{width:100%;padding:14px 15px;border:1px solid #d5ded5;border-radius:12px;background:#fbfcf9;color:var(--ink);font:inherit;outline:none;transition:border-color .15s,box-shadow .15s}input:focus,select:focus,textarea:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(22,116,95,.12)}textarea{min-height:105px;resize:vertical}button,.btn{border:0;border-radius:999px;padding:14px 19px;background:var(--green);color:#fff;font-weight:850;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,background .15s}button:hover,.btn:hover{transform:translateY(-1px);background:#105744}.btn.alt,button.alt{background:#edf3e9;color:var(--ink)}.danger{color:#a32626}.pill{display:inline-flex;align-items:center;gap:7px;background:#e9f1e5;color:#31564b;border-radius:999px;padding:7px 11px;font-size:.78rem;font-weight:800;letter-spacing:.01em}.item{border-top:1px solid var(--line);padding:16px 0}.full{grid-column:1/-1}small{color:var(--muted);line-height:1.5}.hero{position:relative;overflow:hidden;background:var(--ink);color:#fff;border-radius:30px;padding:clamp(28px,6vw,70px);display:grid;grid-template-columns:1.05fr .95fr;gap:34px;align-items:center;isolation:isolate}.hero:after{content:"";position:absolute;width:380px;height:380px;border-radius:50%;background:var(--lime);right:-150px;top:-190px;opacity:.95;z-index:-1}.hero .pill{background:rgba(201,243,107,.14);color:var(--lime)}.hero h1{font-size:clamp(2.7rem,6vw,5.6rem)}.hero .muted{color:#c2d1ca;font-size:1.08rem;max-width:490px}.hero-form{background:#fff;color:var(--ink);border-radius:24px;padding:clamp(20px,3vw,30px);box-shadow:0 24px 60px rgba(0,0,0,.18)}.hero-form h2{font-size:1.65rem}.hero-form .muted{font-size:.92rem;color:var(--muted)}.hero-form button{width:100%;border-radius:12px}.hero-stats{display:flex;gap:20px;flex-wrap:wrap;margin-top:28px;color:#d5e1da;font-size:.82rem}.hero-stats strong{color:var(--lime)}.section-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin:52px 0 18px}.section-head h2{font-size:clamp(1.8rem,3vw,2.6rem);max-width:580px;margin:0}.category-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.category{min-height:120px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:19px;text-decoration:none;color:var(--ink);display:flex;flex-direction:column;justify-content:space-between;gap:18px;transition:transform .18s,border-color .18s,box-shadow .18s}.category:hover{transform:translateY(-3px);border-color:#b8d2c2;box-shadow:0 12px 30px rgba(20,47,43,.07)}.category .glyph{width:38px;height:38px;display:grid;place-items:center;background:#eef4e8;border-radius:12px;font-size:1.15rem}.category strong{font-size:.97rem}.category span:last-child{color:var(--green);font-size:.8rem;font-weight:800}.trust-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.trust{padding:24px;border-radius:20px;background:#edf2e9}.trust b{display:block;margin-bottom:8px;font-size:1.03rem}.trust p{margin:0;color:var(--muted);line-height:1.6;font-size:.93rem}.field input[type=checkbox],label input[type=checkbox]{width:auto;accent-color:var(--green)}@media(max-width:850px){.hero{grid-template-columns:1fr}.hero:after{right:-240px;top:-230px}.category-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.trust-grid{grid-template-columns:1fr}.section-head{margin-top:38px}}@media(max-width:560px){header{padding:12px 16px}header>a{font-size:.93rem}header>a:before{width:32px;height:32px}header nav{gap:2px}header nav a{padding:8px 9px;font-size:.78rem}.wrap{margin:18px auto 42px;padding:0 14px}.hero{padding:25px 19px;border-radius:23px;gap:20px}.hero h1{font-size:clamp(2.65rem,13vw,4.2rem)}.hero-stats{gap:10px}.grid{grid-template-columns:1fr}.full{grid-column:auto}.card{padding:18px;border-radius:18px}.category-grid{gap:9px}.category{padding:14px;min-height:112px}.section-head{display:block}.section-head .muted{margin-top:8px}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important}}</style></head><body><header><a href="/servicios">Ayuda en el Barrio</a><nav class="row"><a href="/servicios/profesionales">Soy profesional</a>'+(user?'<a href="/servicios/profesionales/panel">Mi panel</a><a href="/servicios/profesionales/salir">Salir</a>':'<a href="/servicios/profesionales/entrar">Entrar</a>')+'</nav></header><main class="wrap">'+body+'</main></body></html>'; }
function redirectMessage(res, title, message, status=200) { return res.status(status).type('html').send(page(title,'<section class="card"><h1>'+esc(title)+'</h1><p>'+esc(message)+'</p><p><a class="btn alt" href="/servicios">Volver a Ayuda en el Barrio</a></p></section>')); }
function currentPro(req) { if(!req.session || !req.session.marketplaceProId) return null; return read('pros').find(p=>p.id===req.session.marketplaceProId && p.status==='approved')||null; }
function requirePro(req,res,next) { const p=currentPro(req); if(!p) return res.redirect('/servicios/profesionales/entrar'); req.marketplacePro=p; next(); }
function requireAdmin(req,res,next) { if(req.session && req.session.resuelvoAdmin===true) return next(); return res.redirect('/servicios/admin/login'); }
function creditCost(lead) { return money(lead.precio_referencia_lead_eur); }
function balance(proId) { return read('ledger').filter(x=>x.proId===proId).reduce((s,x)=>s+x.amount,0); }
function htmlFormField(name,label,type='text',required=true,extra='') { return '<div class="field"><label for="'+name+'">'+label+(required?' *':'')+'</label><input id="'+name+'" name="'+name+'" type="'+type+'" '+(required?'required':'')+' '+extra+'></div>'; }

router.get('/',(req,res)=>{
 const opts=categorias.map(c=>'<option value="'+c[0]+'">'+c[1]+'</option>').join('');
 const prov=provincias.map(p=>'<option>'+esc(p)+'</option>').join('');
 const body='<section class="hero"><div><p class="pill">Tu barrio, más fácil</p><h1>Lo necesitas.<br>Lo encuentras.</h1><p class="muted">Profesionales de confianza para las cosas que hacen tu día a día más sencillo. Cuéntanos qué necesitas y te ayudamos a encontrar a quién puede hacerlo.</p><div class="hero-stats"><span><strong>01</strong> Cuéntanos qué necesitas</span><span><strong>02</strong> Te conectamos</span><span><strong>03</strong> Tú decides</span></div></div><div class="hero-form"><h2>¿Qué necesitas resolver?</h2><p class="muted">Cuéntanos el trabajo. Enviar tu solicitud es gratis.</p><form method="post" action="/servicios/solicitud"><div class="field"><label>Servicio que buscas *</label><select name="servicio" required><option value="">Elige una categoría</option>'+opts+'</select></div><div class="grid"><div class="field"><label>Provincia *</label><select name="provincia" required><option value="">Selecciona</option>'+prov+'</select></div><div class="field"><label>Municipio *</label><input name="municipio" maxlength="80" placeholder="Tu localidad" required></div></div><div class="field"><label>¿Para cuándo? *</label><select name="urgencia"><option value="esta_semana">Esta semana</option><option value="manana">Mañana</option><option value="hoy">Hoy / urgente</option><option value="flexible">Sin prisa</option></select></div><div class="field"><label>Describe lo que necesitas *</label><textarea name="descripcion" maxlength="2000" minlength="8" placeholder="Por ejemplo: reparar un grifo que gotea…" required></textarea></div><div class="grid">'+htmlFormField('nombre','Tu nombre','text',true,'maxlength="80" autocomplete="name"')+htmlFormField('telefono','Teléfono de contacto','tel',true,'maxlength="24" inputmode="tel" autocomplete="tel"')+htmlFormField('email','Correo electrónico','email',false,'maxlength="160" autocomplete="email"')+'</div><div class="field"><label style="font-weight:500"><input type="checkbox" name="consentimiento" value="si" required> Acepto que mis datos se compartan con un máximo de 3 profesionales compatibles para responder a esta solicitud. *</label></div><button>Encontrar profesionales <span aria-hidden="true">→</span></button><small>Tu teléfono no se publica en abierto. Enviar no garantiza disponibilidad ni presupuesto.</small></form></div></section><section class="section-head"><h2>Encuentra ayuda para lo que sea</h2><p class="muted">Servicios para casa, familia y día a día.</p></section><section class="category-grid">'+categorias.slice(0,8).map((c,i)=>'<a class="category" href="#solicitud" onclick="document.querySelector(\'select[name=servicio]\').value=\''+c[0]+'\';document.querySelector(\'select[name=servicio]\').focus();return false"><span class="glyph" aria-hidden="true">'+['⌂','ϟ','❄','⌑','↗','✳','✦','⇄'][i]+'</span><strong>'+c[1]+'</strong><span>Solicitar ayuda →</span></a>').join('')+'</section><section class="section-head"><h2>Una forma más sencilla de resolverlo</h2></section><section class="trust-grid"><article class="trust"><b>Tu solicitud, bajo control</b><p>Compartimos tus datos solo con un máximo de tres profesionales compatibles y con tu consentimiento.</p></article><article class="trust"><b>Profesionales revisados</b><p>Las cuentas se revisan antes de acceder a las solicitudes de clientes.</p></article><article class="trust"><b>Tú tienes la última palabra</b><p>Recibir una respuesta no te obliga a contratar. Decide con tranquilidad y sin compromiso.</p></article></section><div id="solicitud"></div>';
 res.type('html').send(page('Ayuda en el Barrio',body,!!currentPro(req)));
});

router.post('/solicitud',(req,res)=>{
 const b=req.body||{}, servicio=String(b.servicio||''), provincia=String(b.provincia||''), municipio=String(b.municipio||'').trim(), nombre=String(b.nombre||'').trim(), telefono=String(b.telefono||'').replace(/[^+\d ()-]/g,'').trim(), descripcion=String(b.descripcion||'').trim(), cat=categorias.find(c=>c[0]===servicio);
 if(!cat||!provincias.includes(provincia)||!municipio||!nombre||telefono.replace(/\D/g,'').length<9||descripcion.length<8||b.consentimiento!=='si') return redirectMessage(res,'Revisa la solicitud','Faltan campos obligatorios o alguno no es vÃ¡lido.',400);
 const leads=read('leads'); const now=new Date().toISOString();
 const lead={id:'LEAD-'+crypto.randomBytes(5).toString('hex').toUpperCase(),servicio,nombre_categoria:cat[1],precio_referencia_lead_eur:cat[2],provincia,municipio:municipio.slice(0,80),urgencia:['hoy','manana','esta_semana','flexible'].includes(b.urgencia)?b.urgencia:'esta_semana',descripcion:descripcion.slice(0,2000),cliente:{nombre:nombre.slice(0,80),telefono,email:String(b.email||'').slice(0,160)},consentimiento_contacto:true,estado:'nuevo',asignaciones:[],created_at:now,updated_at:now,retention_until:new Date(Date.now()+180*86400000).toISOString()};
 leads.push(lead); write('leads',leads); audit('lead.created','customer',{leadId:lead.id,category:servicio,province:provincia});
 res.status(201).type('html').send(page('Solicitud recibida','<section class="card"><h1>âœ“ Solicitud recibida</h1><p>Referencia <b>'+esc(lead.id)+'</b>. Hemos guardado tu solicitud de '+esc(cat[1].toLowerCase())+' en '+esc(municipio)+' ('+esc(provincia)+').</p><p>Los profesionales deben ser aprobados antes de acceder a las solicitudes. Esta versiÃ³n no cobra pagos ni envÃ­a mensajes automÃ¡ticos.</p><a class="btn alt" href="/servicios">Volver</a></section>'));
});

router.get('/profesionales',(req,res)=>res.redirect('/servicios/profesionales/registro'));
router.get('/profesionales/registro',(req,res)=>{
 const body='<section class="card"><h1>Alta de profesional</h1><p class="muted">La cuenta necesita aprobaciÃ³n antes de acceder a oportunidades de clientes.</p><form method="post" action="/servicios/profesionales/registro"><div class="grid">'+htmlFormField('empresa','Nombre comercial / empresa','text',true,'maxlength="100"')+htmlFormField('nombre_contacto','Persona de contacto','text',true,'maxlength="80"')+htmlFormField('email','Email','email',true,'maxlength="160"')+htmlFormField('telefono','TelÃ©fono','tel',true,'maxlength="24"')+htmlFormField('password','ContraseÃ±a (mÃ­nimo 12 caracteres)','password',true,'minlength="12" autocomplete="new-password"')+'</div><div class="field"><label>Servicios *</label><div class="grid">'+categorias.map(c=>'<label style="font-weight:500"><input style="width:auto" type="checkbox" name="categorias" value="'+c[0]+'"> '+esc(c[1])+'</label>').join('')+'</div></div><div class="field"><label>Provincias donde trabajas *</label><div class="grid">'+provincias.map(p=>'<label style="font-weight:500"><input style="width:auto" type="checkbox" name="provincias" value="'+esc(p)+'"> '+esc(p)+'</label>').join('')+'</div></div><div class="field"><label><input style="width:auto" type="checkbox" name="acepta" value="si" required> Acepto las condiciones del servicio y el tratamiento de los datos necesarios para gestionar la cuenta. *</label></div><button>Enviar para revisiÃ³n</button></form></section>';
 res.type('html').send(page('Alta profesional',body));
});
router.post('/profesionales/registro',authLimiter,async(req,res)=>{
 const b=req.body||{}, email=String(b.email||'').trim().toLowerCase(), empresa=String(b.empresa||'').trim(), nombre=String(b.nombre_contacto||'').trim(), telefono=String(b.telefono||'').trim(), password=String(b.password||''), cats=[].concat(b.categorias||[]).filter(x=>categorias.some(c=>c[0]===x)), provs=[].concat(b.provincias||[]).filter(x=>provincias.includes(x));
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!empresa||!nombre||telefono.replace(/\D/g,'').length<9||password.length<12||cats.length===0||provs.length===0||b.acepta!=='si') return redirectMessage(res,'Datos incompletos','Revisa email, telÃ©fono, contraseÃ±a (mÃ­nimo 12 caracteres), servicios, provincias y consentimiento.',400);
 const pros=read('pros'); if(pros.some(p=>p.email===email)) return redirectMessage(res,'Cuenta existente','Ya hay una cuenta registrada con ese email. Prueba a iniciar sesiÃ³n.',409);
 const password_hash=await bcrypt.hash(password,12);
 // Releer despuÃ©s del hash: evita que dos registros concurrentes sobrescriban la misma lista.
 const latestPros=read('pros'); if(latestPros.some(p=>p.email===email)) return redirectMessage(res,'Cuenta existente','Ya hay una cuenta registrada con ese email. Prueba a iniciar sesiÃ³n.',409);
 const pro={id:'PRO-'+crypto.randomBytes(6).toString('hex').toUpperCase(),empresa:empresa.slice(0,100),nombre_contacto:nombre.slice(0,80),email,telefono:telefono.slice(0,24),password_hash,categorias:cats,provincias:provs,status:'pending',credits:0,verified:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),consentimiento_at:new Date().toISOString()};
 latestPros.push(pro);write('pros',latestPros);audit('professional.registered',pro.id,{categories:cats.length,provinces:provs.length});
 return redirectMessage(res,'Solicitud enviada','Tu cuenta estÃ¡ pendiente de revisiÃ³n. PodrÃ¡s iniciar sesiÃ³n cuando el equipo la apruebe.');
});
router.get('/profesionales/entrar',(req,res)=>{
 const body='<section class="card" style="max-width:540px;margin:auto"><h1>Acceso profesional</h1><form method="post" action="/servicios/profesionales/entrar">'+htmlFormField('email','Email','email')+htmlFormField('password','ContraseÃ±a','password',true,'autocomplete="current-password"')+'<button>Entrar</button></form><p><a href="/servicios/profesionales/registro">Crear cuenta profesional</a></p></section>';
 res.type('html').send(page('Acceso profesional',body));
});
router.post('/profesionales/entrar',authLimiter,async(req,res)=>{
 const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||''), pro=read('pros').find(p=>p.email===email);
 if(!pro||!(await bcrypt.compare(password,pro.password_hash||''))) { audit('professional.login_failed','anonymous'); return redirectMessage(res,'No se pudo iniciar sesiÃ³n','Email o contraseÃ±a incorrectos.',401); }
 if(pro.status!=='approved') return redirectMessage(res,'Cuenta pendiente',pro.status==='rejected'?'La solicitud no ha sido aprobada. Contacta con soporte.':'La cuenta estÃ¡ pendiente de aprobaciÃ³n. No se ha habilitado el acceso a leads.',403);
 req.session.marketplaceProId=pro.id; audit('professional.login',pro.id); res.redirect('/servicios/profesionales/panel');
});
router.get('/profesionales/salir',(req,res)=>{if(req.session)delete req.session.marketplaceProId;res.redirect('/servicios');});
router.get('/profesionales/panel',requirePro,(req,res)=>{
 const pro=req.marketplacePro, leads=read('leads'), available=leads.filter(l=>l.estado!=='eliminado'&&l.provincia&&pro.provincias.includes(l.provincia)&&pro.categorias.includes(l.servicio)&&!(l.asignaciones||[]).some(a=>a.proId===pro.id)&&((l.asignaciones||[]).length<3));
 const unlocked=leads.filter(l=>(l.asignaciones||[]).some(a=>a.proId===pro.id));
 const body='<h1>Panel profesional</h1><p class="muted">'+esc(pro.empresa)+' Â· <span class="pill">Cuenta aprobada</span> '+(pro.verified?'<span class="pill">Verificada</span>':'')+'</p><section class="grid"><div class="card"><small>CrÃ©ditos disponibles</small><h2>'+balance(pro.id).toFixed(2)+' â‚¬</h2><p class="muted">No hay recarga automÃ¡tica ni pagos habilitados.</p></div><div class="card"><small>Solicitudes desbloqueadas</small><h2>'+unlocked.length+'</h2><p class="muted">Solo se comparte contacto con consentimiento del cliente.</p></div></section><section class="card"><h2>Oportunidades compatibles</h2><p class="muted">El precio es orientativo. Desbloquear consume crÃ©ditos internos; aÃºn no hay pagos reales integrados.</p>'+(available.length?available.map(l=>'<article class="item"><div class="row"><b>'+esc(l.nombre_categoria)+'</b><span class="pill">'+esc(l.provincia)+' Â· '+esc(l.municipio)+'</span><span class="pill">'+esc(l.urgencia)+'</span></div><p>'+esc(l.descripcion)+'</p><p><b>Coste de desbloqueo: '+creditCost(l).toFixed(2)+' â‚¬ en crÃ©ditos</b></p><form method="post" action="/servicios/profesionales/leads/'+encodeURIComponent(l.id)+'/desbloquear"><button '+(balance(pro.id)<creditCost(l)?'disabled title="Saldo insuficiente"':'')+'>Desbloquear contacto</button></form></article>').join(''):'<p>No hay solicitudes nuevas compatibles con tus servicios y provincias. Vuelve mÃ¡s tarde.</p>')+'</section><section class="card"><h2>Contactos desbloqueados</h2>'+(unlocked.length?unlocked.map(l=>{const a=(l.asignaciones||[]).find(x=>x.proId===pro.id);return '<article class="item"><b>'+esc(l.id)+' Â· '+esc(l.nombre_categoria)+'</b><p>'+esc(l.provincia)+' / '+esc(l.municipio)+' â€” '+esc(l.descripcion)+'</p><p><b>'+esc(l.cliente.nombre)+'</b> Â· '+esc(l.cliente.telefono)+' Â· '+esc(l.cliente.email||'Sin email')+'</p><small>Desbloqueado el '+esc(a&&a.at||'')+'</small></article>';}).join(''):'<p>AÃºn no has desbloqueado contactos.</p>')+'</section><section class="card"><h2>Mi perfil</h2><p><b>Servicios:</b> '+pro.categorias.map(x=>esc((categorias.find(c=>c[0]===x)||[,x])[1])).join(', ')+'</p><p><b>Zonas:</b> '+pro.provincias.map(esc).join(', ')+'</p><p><b>Contacto:</b> '+esc(pro.email)+' Â· '+esc(pro.telefono)+'</p><p class="muted">Para cambiar servicios, zonas o datos de empresa, contacta con soporte. La verificaciÃ³n se concede manualmente.</p></section>';
 res.type('html').send(page('Panel profesional',body,pro));
});
router.post('/profesionales/leads/:id/desbloquear',requirePro,(req,res)=>{
 const pro=req.marketplacePro, leads=read('leads'), lead=leads.find(l=>l.id===req.params.id);
 if(!lead||lead.estado==='eliminado') return redirectMessage(res,'Solicitud no disponible','No se ha encontrado la solicitud.',404);
 if(!pro.provincias.includes(lead.provincia)||!pro.categorias.includes(lead.servicio)) return redirectMessage(res,'No compatible','Esta solicitud no coincide con tus zonas y servicios.',403);
 lead.asignaciones=lead.asignaciones||[];
 if(lead.asignaciones.some(a=>a.proId===pro.id)) return res.redirect('/servicios/profesionales/panel');
 if(lead.asignaciones.length>=3) return redirectMessage(res,'Cupo completo','Esta solicitud ya ha alcanzado el lÃ­mite de profesionales.',409);
 const cost=creditCost(lead), bal=balance(pro.id);
 if(bal<cost) return redirectMessage(res,'Saldo insuficiente','No tienes crÃ©ditos suficientes. La recarga se habilitarÃ¡ cuando se integre un proveedor de pagos.',402);
 const ledger=read('ledger'); const previousLedger=ledger.slice(); ledger.push({id:crypto.randomUUID(),proId:pro.id,leadId:lead.id,amount:-cost,type:'lead_unlock',at:new Date().toISOString()});
 lead.asignaciones.push({proId:pro.id,at:new Date().toISOString(),cost}); lead.estado='asignado';lead.updated_at=new Date().toISOString();
 // Si falla la segunda escritura, revertimos el dÃ©bito para no cobrar sin asignar el contacto.
 try { write('ledger',ledger); write('leads',leads); }
 catch (err) { try { write('ledger',previousLedger); } catch (rollbackErr) { console.error('[RESUELVO] FallÃ³ la reversiÃ³n de crÃ©dito:',rollbackErr.message); } throw err; }
 audit('lead.unlocked',pro.id,{leadId:lead.id,cost});
 res.redirect('/servicios/profesionales/panel');
});

router.get('/admin/login',(req,res)=>{
 if(req.session && req.session.resuelvoAdmin===true) return res.redirect('/servicios/admin/leads');
 const body='<section class="card" style="max-width:460px;margin:8vh auto"><p class="pill">Ayuda en el Barrio Â· AdministraciÃ³n</p><h1>Acceso de administraciÃ³n</h1><p class="muted">Introduce la contraseÃ±a administrativa para gestionar solicitudes y profesionales.</p>'+(req.query.error==='1'?'<p class="danger" role="alert">ContraseÃ±a incorrecta o acceso no configurado.</p>':'')+'<form method="post" action="/servicios/admin/login"><div class="field"><label for="password">ContraseÃ±a</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button type="submit">Entrar al panel</button></form></section>';
 res.type('html').send(page('Acceso de administraciÃ³n',body));
});
router.post('/admin/login',authLimiter,(req,res)=>{
 const expected=process.env.ADMIN_PASSWORD;
 if(!expected || typeof req.body.password!=='string' || !req.body.password || req.body.password!==expected){ audit('admin.login_failed','anonymous'); return res.redirect('/servicios/admin/login?error=1'); }
 req.session.regenerate(err=>{
  if(err) return res.status(500).type('text').send('No se pudo iniciar sesiÃ³n. IntÃ©ntalo de nuevo.');
  req.session.resuelvoAdmin=true;
  req.session.user={id:'resuelvo-admin',rol:'admin'};
  req.session.save(saveErr=>{
   if(saveErr) return res.status(500).type('text').send('No se pudo guardar la sesiÃ³n.');
   audit('admin.login','resuelvo-admin');
   res.redirect('/servicios/admin/leads');
  });
 });
});
router.get('/admin/logout',(req,res)=>{
 if(!req.session) return res.redirect('/servicios/admin/login');
 delete req.session.resuelvoAdmin;
 delete req.session.user;
 req.session.save(()=>res.redirect('/servicios/admin/login'));
});
router.get('/admin/leads',requireAdmin,(req,res)=>{
 const leads=read('leads'), pros=read('pros');
 const body='<h1>AdministraciÃ³n de Resuelvo</h1><p class="muted">Solicitudes: '+leads.length+' Â· Profesionales: '+pros.length+' Â· Pendientes: '+pros.filter(p=>p.status==='pending').length+'</p><section class="card"><h2>Profesionales pendientes</h2>'+(pros.filter(p=>p.status==='pending').map(p=>'<article class="item"><b>'+esc(p.empresa)+'</b> Â· '+esc(p.email)+' Â· '+esc(p.telefono)+'<p>'+esc(p.categorias.join(', '))+' â€” '+esc(p.provincias.join(', '))+'</p><div class="row"><form method="post" action="/servicios/admin/profesionales/'+encodeURIComponent(p.id)+'/estado"><input type="hidden" name="estado" value="approved"><button>Aprobar</button></form><form method="post" action="/servicios/admin/profesionales/'+encodeURIComponent(p.id)+'/estado"><input type="hidden" name="estado" value="rejected"><button class="alt">Rechazar</button></form></div></article>').join('')||'<p>No hay cuentas pendientes.</p>')+'</section><section class="card"><h2>Solicitudes de clientes</h2>'+(leads.slice().reverse().map(l=>'<article class="item"><b>'+esc(l.id)+' Â· '+esc(l.nombre_categoria)+'</b> Â· <span class="pill">'+esc(l.estado)+'</span><p>'+esc(l.provincia)+' / '+esc(l.municipio)+' Â· '+esc(l.urgencia)+'</p><p>'+esc(l.descripcion)+'</p><p>Contacto: '+esc(l.cliente.nombre)+' Â· '+esc(l.cliente.telefono)+' Â· '+esc(l.cliente.email||'Sin email')+'</p><p>Asignados: '+(l.asignaciones||[]).length+'/3</p><div class="row"><form method="post" action="/servicios/admin/leads/'+encodeURIComponent(l.id)+'/estado"><select name="estado"><option value="nuevo">Nuevo</option><option value="asignado">Asignado</option><option value="cerrado">Cerrado</option><option value="eliminado">Eliminar / suprimir</option></select><button class="alt">Actualizar estado</button></form></div></article>').join('')||'<p>No hay solicitudes.</p>')+'</section><section class="card"><h2>CrÃ©ditos manuales</h2><p class="muted">Solo para pruebas y ajustes administrativos; esto no es un cobro real.</p><form method="post" action="/servicios/admin/creditos"><div class="grid">'+htmlFormField('proId','ID profesional','text')+htmlFormField('amount','Importe de crÃ©dito (â‚¬)','number',true,'min="0.01" step="0.01"')+'</div><button>Conceder crÃ©dito de prueba</button></form></section>';
 res.type('html').send(page('AdministraciÃ³n de leads',body));
});
router.post('/admin/profesionales/:id/estado',requireAdmin,(req,res)=>{
 const pros=read('pros'), pro=pros.find(p=>p.id===req.params.id), estado=String(req.body.estado||'');
 if(!pro||!['approved','rejected','pending'].includes(estado)) return redirectMessage(res,'No se pudo actualizar','Profesional o estado no vÃ¡lido.',400);
 pro.status=estado;pro.updated_at=new Date().toISOString();write('pros',pros);audit('professional.status_changed','admin',{proId:pro.id,status:estado});res.redirect('/servicios/admin/leads');
});
router.post('/admin/leads/:id/estado',requireAdmin,(req,res)=>{
 const leads=read('leads'), lead=leads.find(l=>l.id===req.params.id), estado=String(req.body.estado||'');
 if(!lead||!['nuevo','asignado','cerrado','eliminado'].includes(estado)) return redirectMessage(res,'No se pudo actualizar','Solicitud o estado no vÃ¡lido.',400);
 lead.estado=estado;lead.updated_at=new Date().toISOString();write('leads',leads);audit('lead.status_changed','admin',{leadId:lead.id,status:estado});res.redirect('/servicios/admin/leads');
});
router.post('/admin/creditos',requireAdmin,(req,res)=>{
 const proId=String(req.body.proId||''), amount=Number(req.body.amount), pro=read('pros').find(p=>p.id===proId);
 if(!pro||!Number.isFinite(amount)||amount<=0||amount>10000) return redirectMessage(res,'CrÃ©dito no aplicado','Comprueba el ID y el importe (mÃ¡ximo 10.000 â‚¬).',400);
 const ledger=read('ledger');ledger.push({id:crypto.randomUUID(),proId,amount,type:'admin_test_credit',at:new Date().toISOString()});write('ledger',ledger);audit('credits.manual_grant','admin',{proId,amount});res.redirect('/servicios/admin/leads');
});

router.get('/api/catalogo',(req,res)=>res.json({provincias,categorias:categorias.map(c=>({id:c[0],nombre:c[1],precio_referencia_lead_eur:c[2]})),max_profesionales_por_solicitud:3}));
router.get('/api/health',(req,res)=>res.json({ok:true,service:'ayuda-en-el-barrio',version:2}));
router.get('/api/admin/summary',requireAdmin,(req,res)=>res.json({leads:read('leads').length,professionals:read('pros').length,pending:read('pros').filter(p=>p.status==='pending').length,auditEvents:read('audit').length}));
router.post('/privacidad/solicitud',(req,res)=>{
 const email=String(req.body.email||'').trim().toLowerCase(), type=String(req.body.tipo||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['acceso','supresion','rectificacion'].includes(type)) return redirectMessage(res,'Solicitud no vÃ¡lida','Indica un email vÃ¡lido y el tipo de peticiÃ³n.',400);
 const requests=read('audit');requests.push({id:crypto.randomUUID(),action:'privacy.request',actor:'customer',details:{email,type},at:new Date().toISOString()});write('audit',requests.slice(-10000));return redirectMessage(res,'Solicitud registrada','Se ha registrado la peticiÃ³n para revisiÃ³n manual. La identidad y el alcance deberÃ¡n verificarse antes de actuar.');
});

// Purga diaria de solicitudes cuyo plazo de conservaciÃ³n ha vencido.
// Solo se elimina cuando retention_until contiene una fecha vÃ¡lida y vencida;
// registros antiguos o con fecha invÃ¡lida se conservan para revisiÃ³n manual.
function purgeExpiredLeads(now = Date.now()) {
 try {
  const leads = read('leads');
  const kept = [];
  let purged = 0;
  for (const lead of leads) {
   const expiresAt = Date.parse(lead.retention_until || '');
   if (Number.isFinite(expiresAt) && expiresAt <= now) purged += 1;
   else kept.push(lead);
  }
  if (purged > 0) {
   write('leads', kept);
   audit('leads.retention_purged', 'system', { count: purged });
  }
  return { purged, remaining: kept.length };
 } catch (err) {
  console.error('[RESUELVO] Error al purgar solicitudes caducadas:', err.message);
  return { purged: 0, error: true };
 }
}
purgeExpiredLeads();
cron.schedule('30 5 * * *', () => purgeExpiredLeads());

module.exports={router,provincias,categorias,purgeExpiredLeads};

