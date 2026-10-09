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
// Override útil para tests aislados; producción usa el directorio data del proyecto.
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
function page(title,body,user=null) { return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' · Resuelvo España</title><style>:root{font-family:system-ui;color:#15223b;background:#f4f7fc}*{box-sizing:border-box}body{margin:0}header{background:#fff;padding:18px max(20px,calc((100% - 1080px)/2));border-bottom:1px solid #e3e9f3;display:flex;justify-content:space-between;gap:15px;align-items:center}header a{color:#2457d6;text-decoration:none;font-weight:800}.wrap{max-width:1080px;margin:32px auto;padding:0 18px}.card{background:#fff;border:1px solid #e0e7f1;border-radius:16px;padding:22px;margin:14px 0;box-shadow:0 8px 25px #15223b0a}h1{font-size:clamp(1.8rem,4vw,2.8rem);letter-spacing:-.04em}h2{margin-top:0}.muted{color:#66738a}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.field{margin:0 0 12px}label{font-size:.88rem;font-weight:700;display:block;margin-bottom:5px}input,select,textarea{width:100%;padding:12px;border:1px solid #ccd6e5;border-radius:9px;font:inherit}textarea{min-height:95px}button,.btn{border:0;border-radius:10px;padding:12px 16px;background:#2457d6;color:white;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}.btn.alt,button.alt{background:#eaf0ff;color:#2149ad}.danger{color:#a32626}.pill{display:inline-block;background:#eef3ff;border-radius:999px;padding:4px 9px;font-size:.8rem}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.item{border-top:1px solid #e6ebf3;padding:15px 0}.full{grid-column:1/-1}small{color:#68758a}@media(max-width:650px){.grid{grid-template-columns:1fr}.full{grid-column:auto}.wrap{margin:18px auto}header{padding:15px 18px}}</style></head><body><header><a href="/servicios">resuelvo.es</a><nav class="row"><a href="/servicios/profesionales">Profesionales</a>'+(user?'<a href="/servicios/profesionales/panel">Mi panel</a><a href="/servicios/profesionales/salir">Salir</a>':'<a href="/servicios/profesionales/entrar">Entrar</a>')+'</nav></header><main class="wrap">'+body+'</main></body></html>'; }
function redirectMessage(res, title, message, status=200) { return res.status(status).type('html').send(page(title,'<section class="card"><h1>'+esc(title)+'</h1><p>'+esc(message)+'</p><p><a class="btn alt" href="/servicios">Volver a Resuelvo</a></p></section>')); }
function currentPro(req) { if(!req.session || !req.session.marketplaceProId) return null; return read('pros').find(p=>p.id===req.session.marketplaceProId && p.status==='approved')||null; }
function requirePro(req,res,next) { const p=currentPro(req); if(!p) return res.redirect('/servicios/profesionales/entrar'); req.marketplacePro=p; next(); }
function requireAdmin(req,res,next) { if(req.session && req.session.isAdmin===true) return next(); return res.status(403).type('html').send(page('Acceso restringido','<section class="card"><h1>Acceso restringido</h1><p>Inicia sesión como administrador en el panel principal para gestionar solicitudes.</p><a class="btn" href="/admin/login">Entrar como administrador</a></section>')); }
function creditCost(lead) { return money(lead.precio_referencia_lead_eur); }
function balance(proId) { return read('ledger').filter(x=>x.proId===proId).reduce((s,x)=>s+x.amount,0); }
function htmlFormField(name,label,type='text',required=true,extra='') { return '<div class="field"><label for="'+name+'">'+label+(required?' *':'')+'</label><input id="'+name+'" name="'+name+'" type="'+type+'" '+(required?'required':'')+' '+extra+'></div>'; }

router.get('/',(req,res)=>{
 const opts=categorias.map(c=>'<option value="'+c[0]+'">'+c[1]+'</option>').join('');
 const prov=provincias.map(p=>'<option>'+esc(p)+'</option>').join('');
 const body='<section class="grid"><div><p class="pill">Tu problema, una solución</p><h1>Encuentra a quien lo resuelve.</h1><p class="muted">Cuéntanos qué necesitas y dónde. Conectamos tu solicitud con profesionales que trabajan en tu zona.</p><p>🇪🇸 Cobertura nacional · 🎯 Solicitudes concretas · 🔒 Tus datos no se publican en abierto</p><div class="card"><h2>¿Eres profesional?</h2><p>Regístrate gratis, define tus zonas y especialidades. Las cuentas se revisan antes de acceder a solicitudes.</p><a class="btn alt" href="/servicios/profesionales/registro">Crear cuenta profesional</a></div></div><div class="card"><h2>¿Qué necesitas resolver?</h2><p class="muted">Enviar una solicitud es gratis.</p><form method="post" action="/servicios/solicitud"><div class="field"><label>Servicio *</label><select name="servicio" required><option value="">Selecciona</option>'+opts+'</select></div><div class="grid"><div class="field"><label>Provincia *</label><select name="provincia" required><option value="">Selecciona</option>'+prov+'</select></div><div class="field"><label>Municipio *</label><input name="municipio" maxlength="80" required></div></div><div class="field"><label>¿Cuándo?</label><select name="urgencia"><option value="esta_semana">Esta semana</option><option value="manana">Mañana</option><option value="hoy">Hoy / urgente</option><option value="flexible">Sin prisa</option></select></div><div class="field"><label>Describe el trabajo *</label><textarea name="descripcion" maxlength="2000" minlength="8" required></textarea></div><div class="grid">'+htmlFormField('nombre','Nombre','text',true,'maxlength="80"')+htmlFormField('telefono','Teléfono','tel',true,'maxlength="24" inputmode="tel"')+htmlFormField('email','Email','email',false,'maxlength="160"')+'</div><div class="field"><label style="font-weight:500"><input type="checkbox" name="consentimiento" value="si" required style="width:auto"> Acepto que mis datos se compartan con un máximo de 3 profesionales compatibles para responder a esta solicitud. *</label></div><button style="width:100%">Encontrar profesionales →</button><small>El teléfono no se publica en abierto. Enviar no garantiza disponibilidad ni presupuesto.</small></form></div></section><section class="grid"><div class="card"><h2>Contactos relevantes</h2><p class="muted">Coincidencia por servicio y provincia.</p></div><div class="card"><h2>Control y transparencia</h2><p class="muted">Cuentas profesionales revisadas, acceso limitado y registro de operaciones.</p></div></section>';
 res.type('html').send(page('Marketplace nacional',body,!!currentPro(req)));
});

router.post('/solicitud',(req,res)=>{
 const b=req.body||{}, servicio=String(b.servicio||''), provincia=String(b.provincia||''), municipio=String(b.municipio||'').trim(), nombre=String(b.nombre||'').trim(), telefono=String(b.telefono||'').replace(/[^+\d ()-]/g,'').trim(), descripcion=String(b.descripcion||'').trim(), cat=categorias.find(c=>c[0]===servicio);
 if(!cat||!provincias.includes(provincia)||!municipio||!nombre||telefono.replace(/\D/g,'').length<9||descripcion.length<8||b.consentimiento!=='si') return redirectMessage(res,'Revisa la solicitud','Faltan campos obligatorios o alguno no es válido.',400);
 const leads=read('leads'); const now=new Date().toISOString();
 const lead={id:'LEAD-'+crypto.randomBytes(5).toString('hex').toUpperCase(),servicio,nombre_categoria:cat[1],precio_referencia_lead_eur:cat[2],provincia,municipio:municipio.slice(0,80),urgencia:['hoy','manana','esta_semana','flexible'].includes(b.urgencia)?b.urgencia:'esta_semana',descripcion:descripcion.slice(0,2000),cliente:{nombre:nombre.slice(0,80),telefono,email:String(b.email||'').slice(0,160)},consentimiento_contacto:true,estado:'nuevo',asignaciones:[],created_at:now,updated_at:now,retention_until:new Date(Date.now()+180*86400000).toISOString()};
 leads.push(lead); write('leads',leads); audit('lead.created','customer',{leadId:lead.id,category:servicio,province:provincia});
 res.status(201).type('html').send(page('Solicitud recibida','<section class="card"><h1>✓ Solicitud recibida</h1><p>Referencia <b>'+esc(lead.id)+'</b>. Hemos guardado tu solicitud de '+esc(cat[1].toLowerCase())+' en '+esc(municipio)+' ('+esc(provincia)+').</p><p>Los profesionales deben ser aprobados antes de acceder a las solicitudes. Esta versión no cobra pagos ni envía mensajes automáticos.</p><a class="btn alt" href="/servicios">Volver</a></section>'));
});

router.get('/profesionales',(req,res)=>res.redirect('/servicios/profesionales/registro'));
router.get('/profesionales/registro',(req,res)=>{
 const body='<section class="card"><h1>Alta de profesional</h1><p class="muted">La cuenta necesita aprobación antes de acceder a oportunidades de clientes.</p><form method="post" action="/servicios/profesionales/registro"><div class="grid">'+htmlFormField('empresa','Nombre comercial / empresa','text',true,'maxlength="100"')+htmlFormField('nombre_contacto','Persona de contacto','text',true,'maxlength="80"')+htmlFormField('email','Email','email',true,'maxlength="160"')+htmlFormField('telefono','Teléfono','tel',true,'maxlength="24"')+htmlFormField('password','Contraseña (mínimo 12 caracteres)','password',true,'minlength="12" autocomplete="new-password"')+'</div><div class="field"><label>Servicios *</label><div class="grid">'+categorias.map(c=>'<label style="font-weight:500"><input style="width:auto" type="checkbox" name="categorias" value="'+c[0]+'"> '+esc(c[1])+'</label>').join('')+'</div></div><div class="field"><label>Provincias donde trabajas *</label><div class="grid">'+provincias.map(p=>'<label style="font-weight:500"><input style="width:auto" type="checkbox" name="provincias" value="'+esc(p)+'"> '+esc(p)+'</label>').join('')+'</div></div><div class="field"><label><input style="width:auto" type="checkbox" name="acepta" value="si" required> Acepto las condiciones del servicio y el tratamiento de los datos necesarios para gestionar la cuenta. *</label></div><button>Enviar para revisión</button></form></section>';
 res.type('html').send(page('Alta profesional',body));
});
router.post('/profesionales/registro',authLimiter,async(req,res)=>{
 const b=req.body||{}, email=String(b.email||'').trim().toLowerCase(), empresa=String(b.empresa||'').trim(), nombre=String(b.nombre_contacto||'').trim(), telefono=String(b.telefono||'').trim(), password=String(b.password||''), cats=[].concat(b.categorias||[]).filter(x=>categorias.some(c=>c[0]===x)), provs=[].concat(b.provincias||[]).filter(x=>provincias.includes(x));
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!empresa||!nombre||telefono.replace(/\D/g,'').length<9||password.length<12||cats.length===0||provs.length===0||b.acepta!=='si') return redirectMessage(res,'Datos incompletos','Revisa email, teléfono, contraseña (mínimo 12 caracteres), servicios, provincias y consentimiento.',400);
 const pros=read('pros'); if(pros.some(p=>p.email===email)) return redirectMessage(res,'Cuenta existente','Ya hay una cuenta registrada con ese email. Prueba a iniciar sesión.',409);
 const pro={id:'PRO-'+crypto.randomBytes(6).toString('hex').toUpperCase(),empresa:empresa.slice(0,100),nombre_contacto:nombre.slice(0,80),email,telefono:telefono.slice(0,24),password_hash:await bcrypt.hash(password,12),categorias:cats,provincias:provs,status:'pending',credits:0,verified:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),consentimiento_at:new Date().toISOString()};
 pros.push(pro);write('pros',pros);audit('professional.registered',pro.id,{email,categories:cats.length,provinces:provs.length});
 return redirectMessage(res,'Solicitud enviada','Tu cuenta está pendiente de revisión. Podrás iniciar sesión cuando el equipo la apruebe.');
});
router.get('/profesionales/entrar',(req,res)=>{
 const body='<section class="card" style="max-width:540px;margin:auto"><h1>Acceso profesional</h1><form method="post" action="/servicios/profesionales/entrar">'+htmlFormField('email','Email','email')+htmlFormField('password','Contraseña','password',true,'autocomplete="current-password"')+'<button>Entrar</button></form><p><a href="/servicios/profesionales/registro">Crear cuenta profesional</a></p></section>';
 res.type('html').send(page('Acceso profesional',body));
});
router.post('/profesionales/entrar',authLimiter,async(req,res)=>{
 const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||''), pro=read('pros').find(p=>p.email===email);
 if(!pro||!(await bcrypt.compare(password,pro.password_hash||''))) { audit('professional.login_failed','anonymous',{email}); return redirectMessage(res,'No se pudo iniciar sesión','Email o contraseña incorrectos.',401); }
 if(pro.status!=='approved') return redirectMessage(res,'Cuenta pendiente',pro.status==='rejected'?'La solicitud no ha sido aprobada. Contacta con soporte.':'La cuenta está pendiente de aprobación. No se ha habilitado el acceso a leads.',403);
 req.session.marketplaceProId=pro.id; audit('professional.login',pro.id); res.redirect('/servicios/profesionales/panel');
});
router.get('/profesionales/salir',(req,res)=>{if(req.session)delete req.session.marketplaceProId;res.redirect('/servicios');});
router.get('/profesionales/panel',requirePro,(req,res)=>{
 const pro=req.marketplacePro, leads=read('leads'), available=leads.filter(l=>l.estado!=='eliminado'&&l.provincia&&pro.provincias.includes(l.provincia)&&pro.categorias.includes(l.servicio)&&!(l.asignaciones||[]).some(a=>a.proId===pro.id)&&((l.asignaciones||[]).length<3));
 const unlocked=leads.filter(l=>(l.asignaciones||[]).some(a=>a.proId===pro.id));
 const body='<h1>Panel profesional</h1><p class="muted">'+esc(pro.empresa)+' · <span class="pill">Cuenta aprobada</span> '+(pro.verified?'<span class="pill">Verificada</span>':'')+'</p><section class="grid"><div class="card"><small>Créditos disponibles</small><h2>'+balance(pro.id).toFixed(2)+' €</h2><p class="muted">No hay recarga automática ni pagos habilitados.</p></div><div class="card"><small>Solicitudes desbloqueadas</small><h2>'+unlocked.length+'</h2><p class="muted">Solo se comparte contacto con consentimiento del cliente.</p></div></section><section class="card"><h2>Oportunidades compatibles</h2><p class="muted">El precio es orientativo. Desbloquear consume créditos internos; aún no hay pagos reales integrados.</p>'+(available.length?available.map(l=>'<article class="item"><div class="row"><b>'+esc(l.nombre_categoria)+'</b><span class="pill">'+esc(l.provincia)+' · '+esc(l.municipio)+'</span><span class="pill">'+esc(l.urgencia)+'</span></div><p>'+esc(l.descripcion)+'</p><p><b>Coste de desbloqueo: '+creditCost(l).toFixed(2)+' € en créditos</b></p><form method="post" action="/servicios/profesionales/leads/'+encodeURIComponent(l.id)+'/desbloquear"><button '+(balance(pro.id)<creditCost(l)?'disabled title="Saldo insuficiente"':'')+'>Desbloquear contacto</button></form></article>').join(''):'<p>No hay solicitudes nuevas compatibles con tus servicios y provincias. Vuelve más tarde.</p>')+'</section><section class="card"><h2>Contactos desbloqueados</h2>'+(unlocked.length?unlocked.map(l=>{const a=(l.asignaciones||[]).find(x=>x.proId===pro.id);return '<article class="item"><b>'+esc(l.id)+' · '+esc(l.nombre_categoria)+'</b><p>'+esc(l.provincia)+' / '+esc(l.municipio)+' — '+esc(l.descripcion)+'</p><p><b>'+esc(l.cliente.nombre)+'</b> · '+esc(l.cliente.telefono)+' · '+esc(l.cliente.email||'Sin email')+'</p><small>Desbloqueado el '+esc(a&&a.at||'')+'</small></article>';}).join(''):'<p>Aún no has desbloqueado contactos.</p>')+'</section><section class="card"><h2>Mi perfil</h2><p><b>Servicios:</b> '+pro.categorias.map(x=>esc((categorias.find(c=>c[0]===x)||[,x])[1])).join(', ')+'</p><p><b>Zonas:</b> '+pro.provincias.map(esc).join(', ')+'</p><p><b>Contacto:</b> '+esc(pro.email)+' · '+esc(pro.telefono)+'</p><p class="muted">Para cambiar servicios, zonas o datos de empresa, contacta con soporte. La verificación se concede manualmente.</p></section>';
 res.type('html').send(page('Panel profesional',body,pro));
});
router.post('/profesionales/leads/:id/desbloquear',requirePro,(req,res)=>{
 const pro=req.marketplacePro, leads=read('leads'), lead=leads.find(l=>l.id===req.params.id);
 if(!lead||lead.estado==='eliminado') return redirectMessage(res,'Solicitud no disponible','No se ha encontrado la solicitud.',404);
 if(!pro.provincias.includes(lead.provincia)||!pro.categorias.includes(lead.servicio)) return redirectMessage(res,'No compatible','Esta solicitud no coincide con tus zonas y servicios.',403);
 lead.asignaciones=lead.asignaciones||[];
 if(lead.asignaciones.some(a=>a.proId===pro.id)) return res.redirect('/servicios/profesionales/panel');
 if(lead.asignaciones.length>=3) return redirectMessage(res,'Cupo completo','Esta solicitud ya ha alcanzado el límite de profesionales.',409);
 const cost=creditCost(lead), bal=balance(pro.id);
 if(bal<cost) return redirectMessage(res,'Saldo insuficiente','No tienes créditos suficientes. La recarga se habilitará cuando se integre un proveedor de pagos.',402);
 const ledger=read('ledger'); ledger.push({id:crypto.randomUUID(),proId:pro.id,leadId:lead.id,amount:-cost,type:'lead_unlock',at:new Date().toISOString()}); write('ledger',ledger);
 lead.asignaciones.push({proId:pro.id,at:new Date().toISOString(),cost}); lead.estado='asignado';lead.updated_at=new Date().toISOString();write('leads',leads);audit('lead.unlocked',pro.id,{leadId:lead.id,cost});
 res.redirect('/servicios/profesionales/panel');
});

router.get('/admin/leads',requireAdmin,(req,res)=>{
 const leads=read('leads'), pros=read('pros');
 const body='<h1>Administración de Resuelvo</h1><p class="muted">Solicitudes: '+leads.length+' · Profesionales: '+pros.length+' · Pendientes: '+pros.filter(p=>p.status==='pending').length+'</p><section class="card"><h2>Profesionales pendientes</h2>'+(pros.filter(p=>p.status==='pending').map(p=>'<article class="item"><b>'+esc(p.empresa)+'</b> · '+esc(p.email)+' · '+esc(p.telefono)+'<p>'+esc(p.categorias.join(', '))+' — '+esc(p.provincias.join(', '))+'</p><div class="row"><form method="post" action="/servicios/admin/profesionales/'+encodeURIComponent(p.id)+'/estado"><input type="hidden" name="estado" value="approved"><button>Aprobar</button></form><form method="post" action="/servicios/admin/profesionales/'+encodeURIComponent(p.id)+'/estado"><input type="hidden" name="estado" value="rejected"><button class="alt">Rechazar</button></form></div></article>').join('')||'<p>No hay cuentas pendientes.</p>')+'</section><section class="card"><h2>Solicitudes de clientes</h2>'+(leads.slice().reverse().map(l=>'<article class="item"><b>'+esc(l.id)+' · '+esc(l.nombre_categoria)+'</b> · <span class="pill">'+esc(l.estado)+'</span><p>'+esc(l.provincia)+' / '+esc(l.municipio)+' · '+esc(l.urgencia)+'</p><p>'+esc(l.descripcion)+'</p><p>Contacto: '+esc(l.cliente.nombre)+' · '+esc(l.cliente.telefono)+' · '+esc(l.cliente.email||'Sin email')+'</p><p>Asignados: '+(l.asignaciones||[]).length+'/3</p><div class="row"><form method="post" action="/servicios/admin/leads/'+encodeURIComponent(l.id)+'/estado"><select name="estado"><option value="nuevo">Nuevo</option><option value="asignado">Asignado</option><option value="cerrado">Cerrado</option><option value="eliminado">Eliminar / suprimir</option></select><button class="alt">Actualizar estado</button></form></div></article>').join('')||'<p>No hay solicitudes.</p>')+'</section><section class="card"><h2>Créditos manuales</h2><p class="muted">Solo para pruebas y ajustes administrativos; esto no es un cobro real.</p><form method="post" action="/servicios/admin/creditos"><div class="grid">'+htmlFormField('proId','ID profesional','text')+htmlFormField('amount','Importe de crédito (€)','number',true,'min="0.01" step="0.01"')+'</div><button>Conceder crédito de prueba</button></form></section>';
 res.type('html').send(page('Administración de leads',body));
});
router.post('/admin/profesionales/:id/estado',requireAdmin,(req,res)=>{
 const pros=read('pros'), pro=pros.find(p=>p.id===req.params.id), estado=String(req.body.estado||'');
 if(!pro||!['approved','rejected','pending'].includes(estado)) return redirectMessage(res,'No se pudo actualizar','Profesional o estado no válido.',400);
 pro.status=estado;pro.updated_at=new Date().toISOString();write('pros',pros);audit('professional.status_changed','admin',{proId:pro.id,status:estado});res.redirect('/servicios/admin/leads');
});
router.post('/admin/leads/:id/estado',requireAdmin,(req,res)=>{
 const leads=read('leads'), lead=leads.find(l=>l.id===req.params.id), estado=String(req.body.estado||'');
 if(!lead||!['nuevo','asignado','cerrado','eliminado'].includes(estado)) return redirectMessage(res,'No se pudo actualizar','Solicitud o estado no válido.',400);
 lead.estado=estado;lead.updated_at=new Date().toISOString();write('leads',leads);audit('lead.status_changed','admin',{leadId:lead.id,status:estado});res.redirect('/servicios/admin/leads');
});
router.post('/admin/creditos',requireAdmin,(req,res)=>{
 const proId=String(req.body.proId||''), amount=Number(req.body.amount), pro=read('pros').find(p=>p.id===proId);
 if(!pro||!Number.isFinite(amount)||amount<=0||amount>10000) return redirectMessage(res,'Crédito no aplicado','Comprueba el ID y el importe (máximo 10.000 €).',400);
 const ledger=read('ledger');ledger.push({id:crypto.randomUUID(),proId,amount,type:'admin_test_credit',at:new Date().toISOString()});write('ledger',ledger);audit('credits.manual_grant','admin',{proId,amount});res.redirect('/servicios/admin/leads');
});

router.get('/api/catalogo',(req,res)=>res.json({provincias,categorias:categorias.map(c=>({id:c[0],nombre:c[1],precio_referencia_lead_eur:c[2]})),max_profesionales_por_solicitud:3}));
router.get('/api/health',(req,res)=>res.json({ok:true,service:'resuelvo-marketplace',version:2}));
router.get('/api/admin/summary',requireAdmin,(req,res)=>res.json({leads:read('leads').length,professionals:read('pros').length,pending:read('pros').filter(p=>p.status==='pending').length,auditEvents:read('audit').length}));
router.post('/privacidad/solicitud',(req,res)=>{
 const email=String(req.body.email||'').trim().toLowerCase(), type=String(req.body.tipo||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['acceso','supresion','rectificacion'].includes(type)) return redirectMessage(res,'Solicitud no válida','Indica un email válido y el tipo de petición.',400);
 const requests=read('audit');requests.push({id:crypto.randomUUID(),action:'privacy.request',actor:'customer',details:{email,type},at:new Date().toISOString()});write('audit',requests.slice(-10000));return redirectMessage(res,'Solicitud registrada','Se ha registrado la petición para revisión manual. La identidad y el alcance deberán verificarse antes de actuar.');
});

// Purga diaria de solicitudes cuyo plazo de conservación ha vencido.
// Solo se elimina cuando retention_until contiene una fecha válida y vencida;
// registros antiguos o con fecha inválida se conservan para revisión manual.
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
