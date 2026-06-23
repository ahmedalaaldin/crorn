// Embedded single-page console served at "/". Vanilla JS, no build step.
// Kept free of template literals so it sits safely inside this TS string.
export const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>crorn DMS</title>
<style>
  :root { --bg:#0f172a; --panel:#1e293b; --line:#334155; --text:#e2e8f0; --muted:#94a3b8;
          --accent:#38bdf8; --good:#22c55e; --warn:#f59e0b; --bad:#ef4444; }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
         background:var(--bg); color:var(--text); }
  header { display:flex; align-items:center; gap:16px; padding:12px 20px;
           background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; }
  header h1 { font-size:16px; margin:0; letter-spacing:.5px; }
  header h1 small { color:var(--muted); font-weight:400; }
  nav { display:flex; gap:4px; flex-wrap:wrap; flex:1; }
  nav button { background:none; border:none; color:var(--muted); padding:6px 10px; border-radius:6px;
               cursor:pointer; font-size:13px; }
  nav button:hover { color:var(--text); background:#0b1220; }
  nav button.active { color:var(--bg); background:var(--accent); }
  .badge { background:var(--bad); color:#fff; border-radius:10px; padding:0 6px; font-size:11px; margin-left:4px; }
  main { max-width:1100px; margin:0 auto; padding:20px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:16px; }
  .card h2 { margin:0 0 12px; font-size:15px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:8px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:600; }
  input,select,textarea { width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text);
                          border-radius:6px; padding:8px; font:inherit; }
  label { display:block; font-size:12px; color:var(--muted); margin:8px 0 4px; }
  button.btn { background:var(--accent); color:var(--bg); border:none; border-radius:6px; padding:8px 12px;
               font-weight:600; cursor:pointer; }
  button.btn.sm { padding:4px 8px; font-size:12px; }
  button.ghost { background:none; border:1px solid var(--line); color:var(--text); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .pill { display:inline-block; padding:1px 8px; border-radius:10px; font-size:11px; border:1px solid var(--line); }
  .muted { color:var(--muted); }
  .err { color:var(--bad); }
  .ok { color:var(--good); }
  .stat { font-size:24px; font-weight:700; }
  .hide { display:none; }
  a { color:var(--accent); }
</style>
</head>
<body>
<div id="auth" class="hide"></div>
<div id="app" class="hide">
  <header>
    <h1>crorn <small>DMS</small></h1>
    <nav id="nav"></nav>
    <span id="who" class="muted"></span>
    <button class="btn ghost sm" onclick="logout()">Logout</button>
  </header>
  <main id="content"></main>
</div>

<script>
var ref = {}, me = null, projects = [];
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function el(id){ return document.getElementById(id); }

async function api(path, opts){
  opts = opts || {};
  opts.credentials = 'same-origin';
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    opts.body = JSON.stringify(opts.body);
  }
  var r = await fetch('/api'+path, opts);
  var ct = r.headers.get('content-type')||'';
  var data = ct.indexOf('json')>=0 ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || ('HTTP '+r.status));
  return data;
}

/* ----------------------------- Auth ----------------------------- */
function showAuth(bootstrap){
  el('app').classList.add('hide');
  var a = el('auth'); a.classList.remove('hide');
  a.innerHTML =
    '<main><div class="card" style="max-width:380px;margin:60px auto">'+
    '<h2>crorn DMS</h2>'+
    '<p class="muted">'+(bootstrap?'Create the first administrator account.':'Sign in to continue.')+'</p>'+
    (bootstrap?'<label>Name</label><input id="aname">':'')+
    '<label>Email</label><input id="aemail" autocomplete="username">'+
    '<label>Password</label><input id="apass" type="password" autocomplete="current-password">'+
    '<div id="aerr" class="err" style="margin-top:8px"></div>'+
    '<div class="row" style="margin-top:12px">'+
    '<button class="btn" onclick="'+(bootstrap?'doSignup()':'doLogin()')+'">'+(bootstrap?'Create admin':'Sign in')+'</button>'+
    '</div></div></main>';
}
async function doLogin(){
  try { await api('/auth/login',{method:'POST',body:{email:el('aemail').value,password:el('apass').value}}); await boot(); }
  catch(e){ el('aerr').textContent = e.message; }
}
async function doSignup(){
  try { await api('/auth/signup',{method:'POST',body:{name:el('aname').value,email:el('aemail').value,password:el('apass').value}}); await boot(); }
  catch(e){ el('aerr').textContent = e.message; }
}
async function logout(){ await api('/auth/logout',{method:'POST'}); location.reload(); }

/* ----------------------------- Shell ---------------------------- */
var TABS = ['Dashboard','Projects','Documents','Tasks','Templates','Mail','Transmittals','Notifications'];
var current = 'Dashboard';
function renderNav(unread){
  el('nav').innerHTML = TABS.map(function(t){
    var b = unread && t==='Notifications' && unread>0 ? '<span class="badge">'+unread+'</span>' : '';
    return '<button class="'+(t===current?'active':'')+'" onclick="go(\\''+t+'\\')">'+t+b+'</button>';
  }).join('');
}
async function go(tab){ current = tab; renderNav(); el('content').innerHTML='<p class="muted">Loading…</p>';
  try { await VIEWS[tab](); } catch(e){ el('content').innerHTML='<div class="card err">'+esc(e.message)+'</div>'; }
  refreshUnread();
}
async function refreshUnread(){ try { var d = await api('/notifications/unread-count'); renderNav(d.count); } catch(e){} }

/* ----------------------------- Views ---------------------------- */
var VIEWS = {};

VIEWS['Dashboard'] = async function(){
  var h = await api('/health').catch(function(){return {status:'?',checks:{}};});
  var docs = await api('/documents'); var tasks = await api('/workflows/tasks'); var tpls = await api('/templates');
  el('content').innerHTML =
    '<div class="card"><h2>System</h2><div class="grid">'+
    stat('Status', h.status==='healthy'?'<span class="ok">healthy</span>':'<span class="err">'+esc(h.status)+'</span>')+
    stat('Documents', docs.documents.length)+
    stat('My open tasks', tasks.tasks.length)+
    stat('Workflow templates', tpls.templates.length)+
    '</div><p class="muted" style="margin-top:10px">Bindings — D1: '+esc(h.checks.d1)+' · R2: '+esc(h.checks.r2)+' · KV: '+esc(h.checks.kv_sessions)+'</p></div>'+
    '<div class="card"><h2>Standard workflows</h2>'+ tpls.templates.map(function(t){
      return '<div style="margin-bottom:8px"><b>'+esc(t.name)+'</b> <span class="muted">'+esc(t.doc_type_code||'')+'</span><br>'+
        t.steps.map(function(s){ return '<span class="pill">'+s.step_order+'. '+esc(s.role)+' · '+esc(s.action_type)+' ('+s.sla_days+'d)</span>'; }).join(' ')+'</div>';
    }).join('') + '</div>';
};
function stat(label,val){ return '<div><div class="muted">'+label+'</div><div class="stat">'+val+'</div></div>'; }

VIEWS['Projects'] = async function(){
  var d = await api('/projects');
  el('content').innerHTML =
    '<div class="card"><h2>New project</h2><div class="grid">'+
    '<div><label>Code</label><input id="pcode" placeholder="R03"></div>'+
    '<div><label>Name</label><input id="pname" placeholder="Tower A"></div>'+
    '<div><label>Client</label><input id="pclient"></div>'+
    '<div><label>Location</label><input id="ploc"></div>'+
    '</div><div class="row" style="margin-top:10px"><button class="btn" onclick="createProject()">Create</button><span id="perr" class="err"></span></div></div>'+
    '<div class="card"><h2>Projects</h2><table><tr><th>Code</th><th>Name</th><th>Client</th><th>Docs</th></tr>'+
    d.projects.map(function(p){ return '<tr><td>'+esc(p.code)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.client||'')+'</td><td>'+p.document_count+'</td></tr>'; }).join('')+'</table></div>';
};
async function createProject(){
  try { await api('/projects',{method:'POST',body:{code:el('pcode').value,name:el('pname').value,client:el('pclient').value,location:el('ploc').value}}); await loadProjects(); go('Projects'); }
  catch(e){ el('perr').textContent=e.message; }
}

VIEWS['Documents'] = async function(){
  await loadProjects();
  var d = await api('/documents');
  el('content').innerHTML =
    '<div class="card"><h2>Register document</h2><div class="grid">'+
    '<div><label>Project</label>'+sel('dproj', projects.map(function(p){return [p.id,p.code+' — '+p.name];}))+'</div>'+
    '<div><label>Title</label><input id="dtitle"></div>'+
    '<div><label>Discipline</label>'+sel('ddisc', ref.disciplines.map(function(x){return [x.code,x.code+' '+x.name];}))+'</div>'+
    '<div><label>Doc type</label>'+sel('dtype', ref.doc_types.map(function(x){return [x.code,x.code+' '+x.name];}))+'</div>'+
    '<div><label>Status</label>'+sel('dstat', ref.statuses.map(function(x){return [x.code,x.code+' '+x.name];}))+'</div>'+
    '<div><label>Level</label>'+sel('dloc', [['','—']].concat(ref.levels.map(function(x){return [x.code,x.code+' '+x.name];})))+'</div>'+
    '<div><label>Package/Area</label><input id="darea" placeholder="FOUND"></div>'+
    '</div><div class="row" style="margin-top:10px"><button class="btn" onclick="createDoc()">Create</button><span id="derr" class="err"></span></div></div>'+
    '<div class="card"><h2>Documents</h2><table><tr><th>Number</th><th>Title</th><th>Rev</th><th>Status</th><th></th></tr>'+
    d.documents.map(function(x){ return '<tr><td style="font-family:monospace">'+esc(x.document_no)+'</td><td>'+esc(x.title)+'</td><td>'+esc(x.current_revision)+'</td><td><span class="pill">'+esc(x.workflow_status)+'</span></td>'+
      '<td><button class="btn ghost sm" onclick="openDoc(\\''+x.id+'\\')">Open</button></td></tr>'; }).join('')+'</table></div>'+
    '<div id="docdetail"></div>';
};
async function createDoc(){
  try {
    var b = {project_id:el('dproj').value,title:el('dtitle').value,discipline_code:el('ddisc').value,
             doc_type_code:el('dtype').value,status_code:el('dstat').value,location_code:el('dloc').value,package_area:el('darea').value};
    var r = await api('/documents',{method:'POST',body:b});
    go('Documents'); setTimeout(function(){ openDoc(r.document.id); }, 200);
  } catch(e){ el('derr').textContent=e.message; }
}
async function openDoc(id){
  var d = await api('/documents/'+id);
  var doc = d.document;
  var canAct = d.workflow && d.workflow.status==='active';
  var html = '<div class="card"><h2>'+esc(doc.document_no)+' — '+esc(doc.title)+'</h2>'+
    '<p class="muted">Status: '+esc(doc.workflow_status)+' · Revision: '+esc(doc.current_revision)+'</p>'+
    '<div class="row"><input type="file" id="dfile" style="max-width:280px"><button class="btn sm" onclick="upload(\\''+id+'\\')">Upload to '+esc(doc.current_revision)+'</button>'+
    ' <button class="btn sm ghost" onclick="startWf(\\''+id+'\\')">Start workflow</button><span id="uerr" class="err"></span></div>'+
    '<h3 style="font-size:13px;margin:14px 0 6px" class="muted">Revisions</h3><table><tr><th>Rev</th><th>File</th><th>Notes</th></tr>'+
    d.revisions.map(function(r){ var f = r.filename ? '<a href="/api/documents/'+id+'/revisions/'+r.revision_code+'/view" target="_blank">'+esc(r.filename)+'</a>' : '<span class="muted">— no file —</span>'; return '<tr><td>'+esc(r.revision_code)+'</td><td>'+f+'</td><td>'+esc(r.notes||'')+'</td></tr>'; }).join('')+'</table>';
  if (d.workflow) {
    html += '<h3 style="font-size:13px;margin:14px 0 6px" class="muted">Workflow ('+esc(d.workflow.status)+')</h3><table><tr><th>#</th><th>Step</th><th>Role</th><th>State</th><th>Outcome</th></tr>'+
      d.steps.map(function(s){ var st = s.status==='in_progress'?'<span class="ok">in progress</span>':esc(s.status); return '<tr><td>'+s.step_order+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.role)+'</td><td>'+st+'</td><td>'+esc(s.outcome||'')+'</td></tr>'; }).join('')+'</table>';
    if (canAct) {
      var step = d.steps.filter(function(s){return s.status==='in_progress';})[0];
      if (step && (step.role===me.role || me.role==='Admin')) {
        html += '<div class="row" style="margin-top:10px"><input id="wfcomment" placeholder="Comments (optional)" style="max-width:320px">'+
          '<button class="btn sm" onclick="act(\\''+d.workflow.id+'\\',\\'Approve\\')">Approve</button>'+
          '<button class="btn sm ghost" onclick="act(\\''+d.workflow.id+'\\',\\'Approve with Comments\\')">Approve w/ comments</button>'+
          '<button class="btn sm ghost" onclick="act(\\''+d.workflow.id+'\\',\\'Revise &amp; Resubmit\\')">Revise &amp; Resubmit</button>'+
          '<button class="btn sm ghost" onclick="act(\\''+d.workflow.id+'\\',\\'Reject\\')">Reject</button></div>';
      } else if (step) {
        html += '<p class="muted">Awaiting <b>'+esc(step.role)+'</b> (your role: '+esc(me.role)+').</p>';
      }
    }
  }
  html += '</div>';
  el('docdetail').innerHTML = html;
  el('docdetail').scrollIntoView({behavior:'smooth'});
}
async function upload(id){
  var f = el('dfile').files[0]; if(!f){ el('uerr').textContent='Choose a file'; return; }
  var fd = new FormData(); fd.append('file', f);
  try { await api('/documents/'+id+'/upload',{method:'POST',body:fd}); openDoc(id); } catch(e){ el('uerr').textContent=e.message; }
}
async function startWf(id){ try { await api('/workflows/start',{method:'POST',body:{document_id:id}}); openDoc(id); } catch(e){ el('uerr').textContent=e.message; } }
async function act(wfid, outcome){
  var c = el('wfcomment') ? el('wfcomment').value : '';
  try { await api('/workflows/'+wfid+'/act',{method:'POST',body:{outcome:outcome,comments:c}}); go('Documents'); } catch(e){ alert(e.message); }
}

VIEWS['Tasks'] = async function(){
  var d = await api('/workflows/tasks');
  el('content').innerHTML = '<div class="card"><h2>My tasks ('+esc(me.role)+')</h2>'+
    (d.tasks.length?'<table><tr><th>Document</th><th>Step</th><th>Action</th><th>Due</th><th></th></tr>'+
    d.tasks.map(function(t){ return '<tr><td style="font-family:monospace">'+esc(t.document_no)+'</td><td>'+esc(t.step_name)+'</td><td>'+esc(t.action_type)+'</td><td class="muted">'+esc((t.due_date||'').slice(0,10))+'</td>'+
      '<td><button class="btn ghost sm" onclick="openDoc(\\''+t.document_id+'\\');current=\\'Documents\\';renderNav();">Open</button></td></tr>'; }).join('')+'</table>':'<p class="muted">No pending tasks for your role.</p>')+
    '<div id="docdetail" style="margin-top:14px"></div></div>';
};

VIEWS['Templates'] = async function(){
  var d = await api('/templates');
  el('content').innerHTML = '<div class="card"><h2>Workflow templates</h2>'+
    d.templates.map(function(t){ return '<div class="card" style="background:var(--bg)"><b>'+esc(t.name)+'</b> <span class="pill">'+esc(t.type)+'</span> <span class="muted">'+esc(t.doc_type_code||'')+'</span>'+
      '<table style="margin-top:8px"><tr><th>#</th><th>Step</th><th>Role</th><th>Action</th><th>SLA</th></tr>'+
      t.steps.map(function(s){ return '<tr><td>'+s.step_order+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.role)+'</td><td>'+esc(s.action_type)+'</td><td>'+s.sla_days+'d</td></tr>'; }).join('')+'</table></div>'; }).join('')+'</div>';
};

VIEWS['Mail'] = async function(){
  await loadProjects();
  var d = await api('/mail');
  el('content').innerHTML =
    '<div class="card"><h2>New correspondence</h2><div class="grid">'+
    '<div><label>Project</label>'+sel('mproj', projects.map(function(p){return [p.id,p.code];}))+'</div>'+
    '<div><label>Type</label>'+sel('mtype', [['Instruction','Instruction'],['Technical Query','Technical Query'],['Notice','Notice'],['Letter','Letter']])+'</div>'+
    '<div style="grid-column:1/-1"><label>Subject</label><input id="msubj"></div>'+
    '<div style="grid-column:1/-1"><label>Body</label><textarea id="mbody" rows="3"></textarea></div>'+
    '</div><div class="row" style="margin-top:10px"><button class="btn" onclick="sendMail()">Send (auto-routed)</button><span id="merr" class="err"></span></div>'+
    '<p class="muted" style="margin-top:8px">Recipients are auto-selected from the routing rule for the mail type.</p></div>'+
    '<div class="card"><h2>Correspondence log</h2><table><tr><th>No</th><th>Type</th><th>Subject</th><th>Date</th></tr>'+
    d.mail.map(function(m){ return '<tr><td style="font-family:monospace">'+esc(m.mail_no)+'</td><td>'+esc(m.type)+'</td><td>'+esc(m.subject)+'</td><td class="muted">'+esc((m.created_at||'').slice(0,10))+'</td></tr>'; }).join('')+'</table></div>';
};
async function sendMail(){
  try { var r = await api('/mail',{method:'POST',body:{project_id:el('mproj').value,type:el('mtype').value,subject:el('msubj').value,body:el('mbody').value}});
    alert('Sent '+r.mail.mail_no+' — routed to: '+(r.mail.routed_to.join(', ')||'(no rule)')); go('Mail'); }
  catch(e){ el('merr').textContent=e.message; }
}

VIEWS['Transmittals'] = async function(){
  var d = await api('/transmittals'); var docs = await api('/documents');
  el('content').innerHTML =
    '<div class="card"><h2>New transmittal</h2>'+
    '<label>Project</label>'+sel('tproj', projects.map(function(p){return [p.id,p.code];}))+
    '<label>Subject</label><input id="tsubj">'+
    '<label>Documents</label><select id="tdocs" multiple size="6">'+docs.documents.map(function(x){return '<option value="'+x.id+'">'+esc(x.document_no)+' — '+esc(x.title)+'</option>';}).join('')+'</select>'+
    '<div class="row" style="margin-top:10px"><button class="btn" onclick="createTrn()">Issue transmittal</button><span id="terr" class="err"></span></div></div>'+
    '<div class="card"><h2>Transmittals</h2><table><tr><th>No</th><th>Subject</th><th>Docs</th><th>Date</th></tr>'+
    d.transmittals.map(function(t){ return '<tr><td style="font-family:monospace">'+esc(t.transmittal_no)+'</td><td>'+esc(t.subject)+'</td><td>'+t.document_count+'</td><td class="muted">'+esc((t.created_at||'').slice(0,10))+'</td></tr>'; }).join('')+'</table></div>';
};
async function createTrn(){
  var ids = Array.prototype.slice.call(el('tdocs').selectedOptions).map(function(o){return o.value;});
  try { var r = await api('/transmittals',{method:'POST',body:{project_id:el('tproj').value,subject:el('tsubj').value,document_ids:ids}});
    alert('Issued '+r.transmittal.transmittal_no); go('Transmittals'); } catch(e){ el('terr').textContent=e.message; }
}

VIEWS['Notifications'] = async function(){
  var d = await api('/notifications');
  el('content').innerHTML = '<div class="card"><div class="row" style="justify-content:space-between"><h2>Notifications</h2><button class="btn ghost sm" onclick="markRead()">Mark all read</button></div>'+
    (d.notifications.length?'<table><tr><th></th><th>Title</th><th>Type</th><th>When</th></tr>'+
    d.notifications.map(function(n){ return '<tr><td>'+(n.read?'':'<span class="pill" style="border-color:var(--accent);color:var(--accent)">new</span>')+'</td><td>'+esc(n.title)+(n.body?'<br><span class="muted">'+esc(n.body)+'</span>':'')+'</td><td>'+esc(n.type)+'</td><td class="muted">'+esc((n.created_at||'').slice(0,16).replace('T',' '))+'</td></tr>'; }).join('')+'</table>':'<p class="muted">No notifications.</p>')+'</div>';
};
async function markRead(){ await api('/notifications/mark-read',{method:'POST'}); go('Notifications'); }

/* --------------------------- helpers ---------------------------- */
function sel(id, pairs){ return '<select id="'+id+'">'+pairs.map(function(p){return '<option value="'+esc(p[0])+'">'+esc(p[1])+'</option>';}).join('')+'</select>'; }
async function loadProjects(){ projects = (await api('/projects')).projects; }

/* ------------------------------ boot ---------------------------- */
async function boot(){
  try { var m = await api('/auth/me'); me = m.user; }
  catch(e){
    var bootstrap = false;
    try { bootstrap = (await api('/auth/status')).needs_setup; } catch(e2){}
    showAuth(bootstrap); return;
  }
  el('auth').classList.add('hide'); el('app').classList.remove('hide');
  el('who').textContent = me.name + ' · ' + me.role;
  try { ref.disciplines = (await api('/reference/disciplines')).disciplines;
        ref.doc_types = (await api('/reference/doc-types')).doc_types;
        ref.statuses = (await api('/reference/statuses')).statuses;
        ref.levels = (await api('/reference/levels')).levels; } catch(e){}
  renderNav(); go('Dashboard');
}
boot();
</script>
</body>
</html>`;
