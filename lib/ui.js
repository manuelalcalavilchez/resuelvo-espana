'use strict';
// Plantilla HTML, estilos e iconos compartidos. Todo el texto dinámico debe pasar por esc().

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICON_PATHS = {
  fontaneria: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  electricidad: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  climatizacion: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  cerrajeria: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M18 5l2 2"/>',
  reformas: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.3h18M3 14.7h18M9 4v5.3M15 9.3v5.4M9 14.7V20"/>',
  pintura: '<rect x="4" y="3" width="14" height="6" rx="1.5"/><path d="M18 6h2v5h-8v3"/><rect x="10.5" y="14" width="3" height="7" rx="1"/>',
  limpieza: '<path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  mudanzas: '<path d="M2 6h12v10H2zM14 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  jardineria: '<path d="M5 19C5 11 10 5 20 4c-1 10-7 15-15 15z"/><path d="M5 19l8-8"/>',
  montajes: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  electrodomesticos: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M8 6h2"/>',
  informatica: '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  mascotas: '<circle cx="7" cy="9" r="1.8"/><circle cx="12" cy="6" r="1.8"/><circle cx="17" cy="9" r="1.8"/><path d="M12 12c-3 0-5.5 3.5-5.5 5.5 0 1.7 1.5 2.5 3 2.2 1-.2 1.6-.7 2.5-.7s1.5.5 2.5.7c1.5.3 3-.5 3-2.2 0-2-2.5-5.5-5.5-5.5z"/>',
  fotografia: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.5" r="3.5"/>',
  belleza: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/>',
  clases: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  otros: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
};
function icon(name, size = 22) {
  return '<svg class="ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[name] || ICON_PATHS.otros) + '</svg>';
}

const LOGO = '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="10" fill="#c9f36b"/><path d="M8 17.5 17 10l9 7.5V25a1 1 0 0 1-1 1h-5v-5.5h-6V26H9a1 1 0 0 1-1-1z" fill="#142f2b"/></svg>';
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><rect width="34" height="34" rx="10" fill="#c9f36b"/><path d="M8 17.5 17 10l9 7.5V25a1 1 0 0 1-1 1h-5v-5.5h-6V26H9a1 1 0 0 1-1-1z" fill="#142f2b"/></svg>';

const CSS = `
:root{--ink:#142f2b;--ink-2:#29453f;--muted:#5f716c;--green:#16745f;--green-d:#0f5847;--lime:#c9f36b;--lime-d:#a9d84a;--line:#e1e7de;--paper:#fff;--bg:#f6f7f2;--soft:#edf2e8;--warn:#9a5b00;--warn-bg:#fff4dd;--bad:#a32626;--bad-bg:#fdeceb;--ok-bg:#e4f4e9;--r:18px;
font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--green);text-underline-offset:3px}a:hover{color:var(--green-d)}
:focus-visible{outline:3px solid var(--lime-d);outline-offset:2px;border-radius:6px}
.skip{position:absolute;left:-999px;top:8px;background:var(--ink);color:#fff;padding:10px 14px;border-radius:10px;z-index:50}.skip:focus{left:12px}
.ic{flex:none;vertical-align:middle}
header.top{position:sticky;top:0;z-index:20;background:rgba(246,247,242,.9);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid rgba(20,47,43,.07)}
.top .in{max-width:1180px;margin:auto;padding:12px 22px;display:flex;justify-content:space-between;align-items:center;gap:16px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-weight:900;letter-spacing:-.04em;text-decoration:none;font-size:1.05rem;white-space:nowrap}
.top nav{display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.top nav a,.top nav button{padding:9px 13px;color:var(--ink);font-size:.9rem;text-decoration:none;font-weight:700;border-radius:999px;background:none;border:0;cursor:pointer;font-family:inherit}
.top nav a:hover,.top nav button:hover{background:#e6ece2;color:var(--ink);transform:none}
.top nav a[aria-current=page]{background:var(--ink);color:#fff}
.top nav .cta{background:var(--ink);color:#fff}.top nav .cta:hover{background:var(--ink-2);color:#fff}
.top nav form{margin:0}
main.wrap{flex:1;width:100%;max-width:1180px;margin:0 auto;padding:30px 22px 72px}
footer.foot{background:var(--ink);color:#b9c9c2;margin-top:auto}
.foot .in{max-width:1180px;margin:auto;padding:40px 22px 34px;display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:28px}
.foot b{color:#fff;display:block;margin-bottom:10px}.foot a{color:#dfe9e4;text-decoration:none;display:block;padding:4px 0;font-size:.92rem}.foot a:hover{color:var(--lime)}
.foot p{margin:0;font-size:.9rem;line-height:1.6}.foot .legal{grid-column:1/-1;border-top:1px solid rgba(255,255,255,.1);padding-top:18px;font-size:.82rem;color:#8fa59d}
h1,h2,h3,p{margin-top:0}
h1{font-size:clamp(2rem,4.6vw,3.4rem);line-height:1.02;letter-spacing:-.055em;font-weight:900;margin-bottom:14px}
h2{font-size:clamp(1.25rem,2.2vw,1.65rem);letter-spacing:-.04em;margin-bottom:12px;line-height:1.15}
h3{font-size:1.05rem;letter-spacing:-.02em;margin-bottom:6px}
.lead{font-size:1.08rem;color:var(--muted);line-height:1.6;max-width:640px}
.muted{color:var(--muted);line-height:1.6}small,.small{color:var(--muted);font-size:.84rem;line-height:1.5}
.card{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:24px;margin:0 0 16px;box-shadow:0 10px 30px rgba(20,47,43,.04)}
.card.narrow{max-width:520px;margin:5vh auto}
.card>h2:first-child{margin-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.full{grid-column:1/-1}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.between{justify-content:space-between}
.stack>*+*{margin-top:12px}
.field{margin:0 0 14px}
label,.label{font-size:.88rem;font-weight:750;display:block;margin-bottom:7px}
.hint{font-weight:500;color:var(--muted);font-size:.8rem}
input,select,textarea{width:100%;padding:13px 14px;border:1px solid #d3ddd2;border-radius:12px;background:#fbfcf9;color:var(--ink);font:inherit;font-size:1rem;outline:none;transition:border-color .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(22,116,95,.14);background:#fff}
textarea{min-height:110px;resize:vertical}
input[type=checkbox],input[type=radio]{width:18px;height:18px;padding:0;accent-color:var(--green);margin:0;flex:none}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:500;font-size:.92rem;line-height:1.45;margin:0}
.check input{margin-top:2px}
.choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px 14px;max-height:260px;overflow:auto;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fbfcf9}
.choices label{display:flex;gap:8px;align-items:center;font-weight:500;font-size:.9rem;margin:0;padding:4px 0;cursor:pointer}
fieldset{border:0;padding:0;margin:0 0 18px}legend{font-weight:800;margin-bottom:8px;padding:0}
.hp{position:absolute!important;left:-10000px!important;width:1px;height:1px;overflow:hidden}
button,.btn{border:0;border-radius:999px;padding:13px 20px;background:var(--green);color:#fff;font:inherit;font-weight:800;font-size:.95rem;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,background .15s,box-shadow .15s;line-height:1.2}
button:hover,.btn:hover{transform:translateY(-1px);background:var(--green-d);color:#fff}
button:disabled{opacity:.5;cursor:not-allowed;transform:none}
.btn.alt,button.alt{background:var(--soft);color:var(--ink)}.btn.alt:hover,button.alt:hover{background:#e0e9da;color:var(--ink)}
.btn.dark,button.dark{background:var(--ink)}.btn.dark:hover,button.dark:hover{background:var(--ink-2)}
.btn.lime,button.lime{background:var(--lime);color:var(--ink)}.btn.lime:hover,button.lime:hover{background:var(--lime-d);color:var(--ink)}
button.danger,.btn.danger{background:var(--bad-bg);color:var(--bad)}button.danger:hover{background:#f8d9d7;color:var(--bad)}
.btn.sm,button.sm{padding:8px 13px;font-size:.84rem}
.btn.block,button.block{width:100%;border-radius:12px}
.inline{display:inline}
.pill{display:inline-flex;align-items:center;gap:6px;background:var(--soft);color:#31564b;border-radius:999px;padding:5px 11px;font-size:.78rem;font-weight:800;white-space:nowrap}
.pill.ok{background:var(--ok-bg);color:#17603f}.pill.warn{background:var(--warn-bg);color:var(--warn)}.pill.bad{background:var(--bad-bg);color:var(--bad)}.pill.dark{background:var(--ink);color:#fff}.pill.lime{background:var(--lime);color:var(--ink)}
.notice{border-radius:14px;padding:14px 16px;margin:0 0 16px;background:var(--soft);line-height:1.55;font-size:.95rem;overflow-wrap:anywhere}.notice .ic{vertical-align:-4px;margin-right:4px}
.meta{margin:0 0 10px}.meta .ic{vertical-align:-3px;margin-right:3px}
.notice.ok{background:var(--ok-bg)}.notice.warn{background:var(--warn-bg);color:#5d3a00}.notice.bad{background:var(--bad-bg);color:#7b1d1d}
.item{border-top:1px solid var(--line);padding:18px 0}.item:first-of-type{border-top:0}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;font-size:.93rem}.kv dt{color:var(--muted)}.kv dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.stat{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px}
.stat small{display:block;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:.7rem;margin-bottom:6px}
.stat strong{font-size:1.9rem;letter-spacing:-.05em;display:block;line-height:1.1}
.stat.dark{background:var(--ink);color:#fff;border-color:var(--ink)}.stat.dark small{color:#a9bdb5}.stat.dark strong{color:var(--lime)}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 18px}.tabs a{padding:8px 14px;border-radius:999px;text-decoration:none;font-weight:750;font-size:.88rem;color:var(--ink);background:#fff;border:1px solid var(--line)}.tabs a[aria-current=page]{background:var(--ink);color:#fff;border-color:var(--ink)}
.empty{text-align:center;padding:34px 16px;color:var(--muted)}.empty .ic{color:var(--green);margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:.92rem}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.tbl{overflow-x:auto;-webkit-overflow-scrolling:touch}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.85em}
.opp{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:start}
.opp .tile{width:46px;height:46px;border-radius:14px;background:var(--soft);display:grid;place-items:center;color:var(--green)}
.price{font-size:1.4rem;font-weight:900;letter-spacing:-.04em;white-space:nowrap}
.contact{background:#f3f8ef;border-radius:14px;padding:14px 16px;display:flex;flex-wrap:wrap;gap:8px 20px;font-weight:650}
.contact a{display:inline-flex;gap:6px;align-items:center;text-decoration:none}
details{border-top:1px solid var(--line);padding:16px 0}details:first-of-type{border-top:0}summary{cursor:pointer;font-weight:800;list-style:none;display:flex;justify-content:space-between;gap:12px}summary::-webkit-details-marker{display:none}summary:after{content:"+";font-size:1.3rem;line-height:1;color:var(--green)}details[open] summary:after{content:"–"}details p{margin:10px 0 0}
.hero{position:relative;overflow:hidden;background:var(--ink);color:#fff;border-radius:30px;padding:clamp(26px,5.5vw,64px);display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center;isolation:isolate}
.hero:before{content:"";position:absolute;width:420px;height:420px;border-radius:50%;background:var(--lime);right:-170px;top:-210px;z-index:-1}
.hero:after{content:"";position:absolute;width:260px;height:260px;border-radius:50%;border:42px solid rgba(201,243,107,.08);left:-120px;bottom:-140px;z-index:-1}
.hero .pill{background:rgba(201,243,107,.14);color:var(--lime)}
.hero h1{font-size:clamp(2.6rem,6vw,5.2rem);line-height:.98;letter-spacing:-.07em;margin:16px 0 18px}
.hero h1 em{font-style:normal;color:var(--lime)}
.hero .lead{color:#c4d3cc}
.steps{display:flex;gap:18px;flex-wrap:wrap;margin-top:30px;padding:0;list-style:none}
.steps li{display:flex;gap:10px;align-items:center;color:#d5e1da;font-size:.88rem;font-weight:650}
.steps b{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:rgba(201,243,107,.16);color:var(--lime);font-size:.78rem}
.hero-form{background:#fff;color:var(--ink);border-radius:24px;padding:clamp(20px,3vw,30px);box-shadow:0 30px 70px rgba(0,0,0,.25);scroll-margin-top:90px}
.hero-form h2{font-size:1.55rem;margin-bottom:4px}
.section-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin:60px 0 20px}
.section-head h2{font-size:clamp(1.7rem,3vw,2.4rem);max-width:600px;margin:0;letter-spacing:-.05em}
.section-head p{margin:0;max-width:380px}
.cats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.cat{min-height:128px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px;text-decoration:none;color:var(--ink);display:flex;flex-direction:column;justify-content:space-between;gap:16px;transition:transform .18s,border-color .18s,box-shadow .18s;font:inherit;text-align:left;cursor:pointer}
.cat:hover{transform:translateY(-3px);border-color:#b6d1c0;box-shadow:0 14px 30px rgba(20,47,43,.08);background:#fff;color:var(--ink)}
.cat .tile{width:42px;height:42px;display:grid;place-items:center;background:var(--soft);border-radius:13px;color:var(--green)}
.cat strong{font-size:.98rem;display:block;font-weight:800}.cat span.go{color:var(--green);font-size:.8rem;font-weight:800;display:flex;align-items:center;gap:4px}
.trust{padding:24px;border-radius:20px;background:var(--soft)}.trust .ic{color:var(--green);margin-bottom:12px}.trust b{display:block;margin-bottom:8px;font-size:1.03rem}.trust p{margin:0;color:var(--muted);line-height:1.6;font-size:.93rem}
.pro-band{margin-top:60px;border-radius:28px;background:linear-gradient(120deg,var(--lime),#e3f9a9);padding:clamp(24px,4.5vw,52px);display:grid;grid-template-columns:1.2fr .8fr;gap:30px;align-items:center}
.pro-band h2{font-size:clamp(1.7rem,3.4vw,2.6rem);letter-spacing:-.055em}
.pro-band ul{list-style:none;padding:0;margin:0 0 22px}.pro-band li{display:flex;gap:10px;align-items:flex-start;padding:5px 0;font-weight:650}
.pro-band .price-card{background:var(--ink);color:#fff;border-radius:22px;padding:24px}.pro-band .price-card small{color:#a9bdb5}
.pack{border:2px solid var(--line);border-radius:18px;padding:20px;background:#fff;display:flex;flex-direction:column;gap:6px}
.pack.best{border-color:var(--green);box-shadow:0 12px 30px rgba(22,116,95,.12)}
.pack .amount{font-size:2rem;font-weight:900;letter-spacing:-.05em}
.prose{max-width:760px}.prose h2{margin-top:30px}.prose p,.prose li{line-height:1.7;color:var(--ink-2)}
.success{text-align:center;max-width:620px;margin:6vh auto}.success .badge{width:72px;height:72px;border-radius:50%;background:var(--lime);display:grid;place-items:center;margin:0 auto 20px;color:var(--ink)}
.ref{display:inline-block;font-family:ui-monospace,Menlo,Consolas,monospace;background:var(--soft);padding:6px 12px;border-radius:10px;font-weight:700;letter-spacing:.04em}
@media(max-width:900px){.hero,.pro-band{grid-template-columns:1fr}.hero:before{right:-260px;top:-250px}.cats,.grid4{grid-template-columns:repeat(2,minmax(0,1fr))}.grid3{grid-template-columns:1fr}.foot .in{grid-template-columns:1fr 1fr}.foot .in>div:first-child{grid-column:1/-1}.section-head{display:block}.section-head p{margin-top:8px}}
@media(max-width:600px){.top .in{padding:10px 14px}.brand span{display:none}.top nav a,.top nav button{padding:8px 10px;font-size:.84rem}main.wrap{padding:16px 14px 48px}.hero{padding:26px 18px 20px;border-radius:24px;gap:24px}.hero:before{width:260px;height:260px;right:-170px;top:-190px}.hero h1{font-size:clamp(2.2rem,10.5vw,3.4rem)}.steps{gap:10px}.grid{grid-template-columns:1fr}.full{grid-column:auto}.card{padding:18px;border-radius:16px}.cats{gap:9px}.cat{padding:14px;min-height:118px}.opp{grid-template-columns:1fr}.opp .tile{display:none}.foot .in{grid-template-columns:1fr}.kv{grid-template-columns:1fr}.kv dt{margin-top:6px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important}}
`;

function navLink(href, label, current) { return '<a href="' + href + '"' + (current === href ? ' aria-current="page"' : '') + '>' + label + '</a>'; }

function nav(ctx, current) {
  if (ctx === 'admin') {
    return navLink('/servicios/admin/leads', 'Solicitudes', current) + navLink('/servicios/admin/profesionales', 'Profesionales', current)
      + navLink('/servicios/admin/reembolsos', 'Reembolsos', current) + navLink('/servicios/admin/privacidad', 'Privacidad', current)
      + navLink('/servicios/admin/pagos', 'Pagos', current)
      + '<form method="post" action="/servicios/admin/logout"><button type="submit">Salir</button></form>';
  }
  if (ctx === 'pro') {
    return navLink('/servicios/profesionales/panel', 'Oportunidades', current) + navLink('/servicios/profesionales/creditos', 'Créditos', current)
      + navLink('/servicios/profesionales/perfil', 'Perfil', current)
      + '<form method="post" action="/servicios/profesionales/salir"><button type="submit">Salir</button></form>';
  }
  return navLink('/servicios/profesionales/registro', 'Soy profesional', current) + '<a class="cta" href="/servicios/profesionales/entrar">Entrar</a>';
}

// opts: { ctx: 'public'|'pro'|'admin', current, description, noindex, canonical }
function page(title, body, opts = {}) {
  if (opts === true || (opts && opts.id)) opts = { ctx: 'pro' }; // compatibilidad con la firma antigua page(title, body, user)
  const ctx = opts.ctx || 'public';
  const desc = opts.description || 'Encuentra profesionales de confianza en tu zona: fontanería, electricidad, reformas, limpieza y más. Pide ayuda gratis y sin compromiso.';
  const noindex = opts.noindex || ctx !== 'public';
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(title) + ' | Ayuda en el Barrio</title>'
    + '<meta name="description" content="' + esc(desc) + '">'
    + (noindex ? '<meta name="robots" content="noindex,nofollow">' : '')
    + (base && opts.canonical ? '<link rel="canonical" href="' + esc(base + opts.canonical) + '">' : '')
    + '<meta property="og:title" content="' + esc(title) + ' | Ayuda en el Barrio"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:type" content="website"><meta property="og:locale" content="es_ES">'
    + '<meta name="theme-color" content="#142f2b"><link rel="icon" href="/favicon.svg" type="image/svg+xml">'
    + '<style>' + CSS + '</style></head><body>'
    + '<a class="skip" href="#contenido">Saltar al contenido</a>'
    + '<header class="top"><div class="in"><a class="brand" href="/servicios">' + LOGO + '<span>Ayuda en el Barrio</span></a><nav aria-label="Principal">' + nav(ctx, opts.current) + '</nav></div></header>'
    + '<main class="wrap" id="contenido">' + body + '</main>'
    + '<footer class="foot"><div class="in"><div><b>Ayuda en el Barrio</b><p>Conectamos a vecinos que necesitan resolver algo con profesionales de su zona. Pedir ayuda es gratis.</p></div>'
    + '<div><b>Servicio</b><a href="/servicios#pedir">Pedir ayuda</a><a href="/servicios/profesionales/registro">Alta de profesionales</a><a href="/servicios/profesionales/entrar">Acceso profesional</a></div>'
    + '<div><b>Legal</b><a href="/servicios/legal/aviso-legal">Aviso legal</a><a href="/servicios/legal/privacidad">Privacidad</a><a href="/servicios/legal/cookies">Cookies</a><a href="/servicios/legal/condiciones">Condiciones para profesionales</a><a href="/servicios/privacidad/derechos">Ejercer tus derechos</a></div>'
    + '<div class="legal">© ' + new Date().getFullYear() + ' Ayuda en el Barrio. Los profesionales son independientes; Ayuda en el Barrio facilita el contacto y no presta los servicios.</div></div></footer>'
    + '</body></html>';
}

function notice(type, html) { return '<div class="notice ' + type + '" role="' + (type === 'bad' ? 'alert' : 'status') + '">' + html + '</div>'; }

const STATUS = {
  nuevo: ['Nueva', 'lime'], asignado: ['Asignada', 'ok'], cerrado: ['Cerrada', ''], eliminado: ['Suprimida', 'bad'],
  pending: ['Pendiente', 'warn'], approved: ['Aprobado', 'ok'], rejected: ['Rechazado', 'bad'], suspended: ['Suspendido', 'bad'],
  pendiente: ['Pendiente', 'warn'], aprobado: ['Aprobado', 'ok'], rechazado: ['Rechazado', 'bad'], atendida: ['Atendida', 'ok'],
  pagado: ['Pagado', 'ok']
};
function badge(estado) { const s = STATUS[estado] || [estado, '']; return '<span class="pill ' + s[1] + '">' + esc(s[0]) + '</span>'; }

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
function eur(n) { return eurFmt.format(Number(n) || 0); }
const dateFmt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' });
function fecha(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d); }
function hace(iso, now = Date.now()) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return 'ahora mismo'; if (m < 60) return 'hace ' + m + ' min';
  const h = Math.round(m / 60); if (h < 24) return 'hace ' + h + ' h';
  const d = Math.round(h / 24); return 'hace ' + d + (d === 1 ? ' día' : ' días');
}

module.exports = { esc, icon, page, notice, badge, eur, fecha, hace, FAVICON };
