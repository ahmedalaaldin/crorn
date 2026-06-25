// Embedded single-page console served at "/". Vanilla JS, no build step.
// Kept free of template literals so it sits safely inside this TS string.
export const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>crorn DMS</title>
<style>
:root{
  /* ===== Aconex brand palette ===== */
  --acx-orange:#EE7203;          /* signature Aconex orange */
  --acx-orange-bright:#F58220;   /* lighter orange */
  --acx-orange-d:#D9650A;        /* hover / active darker */
  --acx-orange-soft:#FDF1E6;     /* light orange tint */
  --acx-orange-soft-2:#FBE3CC;

  --nav:#21384d;                 /* dark slate-blue module nav */
  --nav-2:#1a2c3d;               /* deeper slate (foot / switch) */
  --nav-line:#33485c;            /* nav dividers */
  --nav-text:#c4d0db;            /* nav idle text */
  --nav-text-dim:#8ba0b3;        /* nav secondary text */

  --bg:#f4f5f7;                  /* light app background */
  --panel:#ffffff;               /* white cards */
  --panel-alt:#f7f8fa;           /* subtle fills */
  --line:#dce0e6;                /* neutral borders */
  --line-strong:#c7cdd6;         /* stronger borders */
  --line-soft:#eef1f4;           /* table header / faint */
  --head:#f2f4f7;                /* register header row */
  --zebra:#fafbfc;               /* zebra striping */

  --text:#1f2a36;                /* dark slate body text */
  --text-2:#3d4b5a;              /* slightly softer */
  --muted:#6b7785;               /* secondary grey */

  --link:#0b6cbf;                /* hyperlink blue */
  --link-d:#08538f;
  --accent:var(--acx-orange);

  --good:#1e8e3e;  --good-bg:#e6f4ea;  --good-bd:#bbdfc6;
  --warn:#b5710a;  --warn-bg:#fbefd6;  --warn-bd:#efd49a;
  --bad:#c5221f;   --bad-bg:#fce8e6;   --bad-bd:#f3c2c0;
  --info-bg:#e7f1fb; --info-bd:#bfd9f2;
  --draft-bg:#eef1f4; --draft-text:#5c6b7a;

  --radius:4px;
  --radius-sm:3px;
  --shadow:0 1px 2px rgba(33,56,77,.10);
  --shadow-card:0 1px 2px rgba(33,56,77,.08), 0 0 0 1px rgba(33,56,77,.02);
}

*{ box-sizing:border-box; }

body{
  margin:0;
  font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:var(--bg);
  color:var(--text);
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}

/* ===================== Layout ===================== */
.layout{ display:flex; min-height:100vh; }

.sidebar{
  width:236px; flex:0 0 236px;
  background:var(--nav);
  color:var(--nav-text);
  border-right:1px solid var(--nav-2);
  display:flex; flex-direction:column;
  padding:0;
  position:sticky; top:0; height:100vh; overflow-y:auto;
}

/* ===================== Brand ===================== */
.brand{
  font-size:18px; font-weight:800; letter-spacing:.3px;
  color:#fff;
  padding:16px 16px 14px;
  border-bottom:1px solid var(--nav-line);
  border-left:4px solid var(--acx-orange);
  text-transform:lowercase;
}
.brand small{
  color:var(--acx-orange);
  font-weight:700; font-size:11px;
  text-transform:uppercase; letter-spacing:1px;
  margin-left:4px;
}

/* ===================== Project switcher ===================== */
.proj-switch{
  padding:12px 14px 14px;
  border-bottom:1px solid var(--nav-line);
  background:var(--nav-2);
}
.proj-switch label{
  margin:0 0 5px;
  color:var(--nav-text-dim);
  text-transform:uppercase; font-size:10.5px; letter-spacing:.6px; font-weight:700;
}
.proj-switch select{
  background:#fff; color:var(--text);
  border:1px solid var(--nav-line);
  border-radius:var(--radius-sm);
  padding:7px 9px;
}
.proj-switch select:focus{ outline:none; border-color:var(--acx-orange); box-shadow:0 0 0 2px rgba(238,114,3,.25); }

/* ===================== Left module nav ===================== */
nav{ display:flex; flex-direction:column; gap:1px; padding:10px 8px 4px; }
nav button{
  display:flex; align-items:center; justify-content:space-between; gap:8px;
  text-align:left; width:100%;
  background:none; border:none;
  border-left:3px solid transparent;
  color:var(--nav-text);
  padding:9px 12px 9px 13px;
  border-radius:0 var(--radius) var(--radius) 0;
  cursor:pointer;
  font-size:13px; font-weight:500;
  transition:background .12s ease, color .12s ease, border-color .12s ease;
}
nav button:hover{
  color:#fff;
  background:rgba(255,255,255,.07);
}
nav button.active{
  color:#fff;
  background:rgba(238,114,3,.16);
  border-left:3px solid var(--acx-orange);
  font-weight:700;
}
nav button.active:hover{ background:rgba(238,114,3,.22); }
nav button.active span:first-child{ color:#fff; }

/* ===================== Sidebar footer ===================== */
.side-foot{
  margin-top:auto;
  border-top:1px solid var(--nav-line);
  padding:14px;
  font-size:12px;
  background:var(--nav-2);
}
.side-foot .who{ color:#fff; line-height:1.45; margin-bottom:10px; font-weight:600; }
.side-foot .who .muted{ color:var(--nav-text-dim); font-weight:400; }
/* ghost Logout sitting in the dark foot stays readable */
.side-foot button.ghost,
.side-foot .btn.ghost{
  background:transparent;
  color:var(--nav-text);
  border:1px solid var(--nav-line);
}
.side-foot button.ghost:hover,
.side-foot .btn.ghost:hover{
  background:rgba(255,255,255,.10);
  color:#fff;
  border-color:#4a5866;
}

/* ===================== Content ===================== */
.content-area{ flex:1; min-width:0; }
main{ max-width:1160px; margin:0 auto; padding:24px; }

/* ===================== Notification badge ===================== */
.badge{
  background:var(--bad);
  color:#fff;
  border-radius:10px;
  padding:1px 7px;
  min-width:18px; text-align:center;
  font-size:11px; font-weight:700; line-height:1.4;
  margin-left:6px;
}

/* ===================== Cards ===================== */
.card{
  background:var(--panel);
  border:1px solid var(--line);
  border-radius:var(--radius);
  box-shadow:var(--shadow-card);
  padding:18px;
  margin-bottom:18px;
}
.card h2{
  margin:0 0 14px;
  font-size:15px; font-weight:700;
  color:var(--text);
  padding-bottom:10px;
  border-bottom:1px solid var(--line-soft);
  letter-spacing:.2px;
}

/* ===================== Register table ===================== */
table{
  width:100%;
  border-collapse:collapse;
  font-size:13px;
  border:1px solid var(--line);
}
th,td{
  text-align:left;
  padding:7px 10px;
  border-bottom:1px solid var(--line-soft);
  border-right:1px solid var(--line-soft);   /* crisp vertical column separators */
  vertical-align:top;
}
th:last-child, td:last-child{ border-right:none; }
thead th, th{
  color:var(--text-2);
  font-weight:700;
  font-size:11.5px;
  text-transform:uppercase; letter-spacing:.4px;
  background:var(--head);
  border-bottom:2px solid var(--line-strong);
  white-space:nowrap;
}
tbody tr:nth-child(even){ background:var(--zebra); }
tbody tr:hover{ background:var(--acx-orange-soft); }
td a{ color:var(--link); font-weight:600; }

/* ===================== Form fields (light, on white cards) ===================== */
input,select,textarea{
  width:100%;
  background:#fff;
  border:1px solid var(--line-strong);
  color:var(--text);
  border-radius:var(--radius);
  padding:8px 10px;
  font:inherit;
  transition:border-color .12s ease, box-shadow .12s ease;
}
input:focus,select:focus,textarea:focus{
  outline:none;
  border-color:var(--acx-orange);
  box-shadow:0 0 0 3px rgba(238,114,3,.15);
}
input::placeholder,textarea::placeholder{ color:var(--muted); }
label{
  display:block;
  font-size:12px; font-weight:600;
  color:var(--text-2);
  margin:10px 0 4px;
}

/* ===================== Buttons ===================== */
button.btn{
  background:var(--acx-orange);
  color:#fff;
  border:1px solid var(--acx-orange);
  border-radius:var(--radius);
  padding:8px 14px;
  font-weight:600; font-size:13px;
  cursor:pointer;
  box-shadow:var(--shadow);
  transition:background .12s ease, border-color .12s ease, box-shadow .12s ease;
}
button.btn:hover{ background:var(--acx-orange-bright); border-color:var(--acx-orange-bright); }
button.btn:active{ background:var(--acx-orange-d); border-color:var(--acx-orange-d); }
button.btn:focus-visible{ outline:none; box-shadow:0 0 0 3px rgba(238,114,3,.3); }
button.btn.sm{ padding:4px 10px; font-size:12px; }

/* secondary / outline */
button.ghost{
  background:#fff;
  border:1px solid var(--line-strong);
  color:var(--text-2);
  box-shadow:none;
}
button.ghost:hover{ background:var(--panel-alt); border-color:var(--muted); color:var(--text); }
/* ghost wins when combined with btn */
button.btn.ghost{
  background:#fff;
  color:var(--text-2);
  border:1px solid var(--line-strong);
  box-shadow:none;
}
button.btn.ghost:hover{ background:var(--panel-alt); border-color:var(--muted); color:var(--text); }

/* ===================== Layout helpers ===================== */
.grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; }
.row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

/* ===================== Status pills ===================== */
.pill{
  display:inline-block;
  padding:2px 9px;
  border-radius:11px;
  font-size:11px; font-weight:600; line-height:1.5;
  letter-spacing:.2px;
  border:1px solid var(--line-strong);
  background:var(--draft-bg);
  color:var(--draft-text);
  white-space:nowrap;
}
.pill.ok, .pill.good, .pill.closed{ background:var(--good-bg); color:var(--good); border-color:var(--good-bd); }
.pill.warn, .pill.review, .pill.pending{ background:var(--warn-bg); color:var(--warn); border-color:var(--warn-bd); }
.pill.err, .pill.bad, .pill.overdue, .pill.rejected{ background:var(--bad-bg); color:var(--bad); border-color:var(--bad-bd); }
.pill.draft, .pill.muted{ background:var(--draft-bg); color:var(--draft-text); border-color:var(--line-strong); }
.pill.info, .pill.role{ background:var(--info-bg); color:var(--link); border-color:var(--info-bd); }

/* ===================== KPI stats & utility text ===================== */
.stat{
  font-size:28px; font-weight:700;
  color:var(--nav);
  line-height:1.1; letter-spacing:-.5px;
}
.stat.ok{ color:var(--good); }
.stat.err{ color:var(--bad); }
.stat.warn{ color:var(--warn); }
.stat.muted{ color:var(--muted); }

.muted{ color:var(--muted); }
.err{ color:var(--bad); }
.ok{ color:var(--good); }
.hide{ display:none; }

a{ color:var(--link); text-decoration:none; }
a:hover{ color:var(--link-d); text-decoration:underline; }

/* ===================== Mobile: sidebar collapses ===================== */
@media (max-width:760px){
  .layout{ flex-direction:column; }
  .sidebar{
    width:auto; flex:none; height:auto; position:static;
    border-right:none; border-bottom:2px solid var(--acx-orange);
  }
  .brand{ border-bottom:1px solid var(--nav-line); }
  .proj-switch{ background:var(--nav-2); }
  nav{ flex-direction:row; flex-wrap:wrap; gap:4px; padding:10px 12px; }
  nav button{
    width:auto;
    border-left:none;
    border-bottom:3px solid transparent;
    border-radius:var(--radius-sm);
  }
  nav button.active{
    border-left:none;
    border-bottom:3px solid var(--acx-orange);
    border-radius:var(--radius-sm);
  }
  .side-foot{
    margin-top:0;
    display:flex; align-items:center; justify-content:space-between; gap:12px;
  }
  .side-foot .who{ margin-bottom:0; }
  main{ padding:16px; }
  table{ font-size:12.5px; }
  th,td{ padding:6px 8px; }
}
</style>
</head>
<body>
<div id="auth" class="hide"></div>
<div id="app" class="hide">
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">crorn <small>DMS</small></div>
      <div class="proj-switch" id="projSwitch"></div>
      <nav id="nav"></nav>
      <div class="side-foot">
        <div class="who" id="who"></div>
        <button class="btn ghost sm" style="width:100%;margin-bottom:6px" onclick="changePassword()">Change password</button>
        <button class="btn ghost sm" style="width:100%" onclick="logout()">Logout</button>
      </div>
    </aside>
    <div class="content-area"><main id="content"></main></div>
  </div>
</div>

<script>
var ref = {}, me = null, projects = [], currentProjectId = '', tplSteps = [], tplRoles = [], docFStatus = '', docFType = '';
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
function changePassword(){
  current=''; renderNav();
  el('content').innerHTML = '<div class="card" style="max-width:440px"><h2>Change password</h2>'+
    '<label>Current password</label><input id="cpc" type="password" autocomplete="current-password">'+
    '<label>New password (min 8 characters)</label><input id="cpn" type="password" autocomplete="new-password">'+
    '<label>Confirm new password</label><input id="cpn2" type="password" autocomplete="new-password">'+
    '<div class="row" style="margin-top:14px"><button class="btn" onclick="doChangePassword()">Update password</button>'+
    '<button class="btn ghost" onclick="go(\\'Dashboard\\')">Cancel</button><span id="cperr" class="err"></span></div></div>';
}
async function doChangePassword(){
  var a=el('cpc').value, b=el('cpn').value, c2=el('cpn2').value;
  if(b!==c2){ el('cperr').textContent='New passwords do not match'; return; }
  try{ await api('/auth/change-password',{method:'POST',body:{current_password:a,new_password:b}}); alert('Password updated successfully.'); go('Dashboard'); }
  catch(e){ el('cperr').textContent=e.message; }
}

/* ----------------------------- Shell ---------------------------- */
var TABS = ['Dashboard','Projects','Documents','Tasks','Reports','Templates','Mail','Transmittals','Distribution','Admin','Notifications'];
var current = 'Dashboard';
function canManage(){ return !!(me && (me.role==='Admin'||me.role==='Document Controller'||me.role==='Project Manager')); }
function visibleTabs(){ return TABS.filter(function(t){ if(t==='Admin') return canManage(); return true; }); }
function renderNav(unread){
  el('nav').innerHTML = visibleTabs().map(function(t){
    var b = unread && t==='Notifications' && unread>0 ? '<span class="badge">'+unread+'</span>' : '';
    return '<button class="'+(t===current?'active':'')+'" onclick="go(\\''+t+'\\')"><span>'+t+'</span>'+b+'</button>';
  }).join('');
}
function renderProjectSwitch(){
  var sw = el('projSwitch'); if(!sw) return;
  var opts = '<option value="">All my projects</option>' + projects.map(function(p){
    return '<option value="'+esc(p.id)+'"'+(p.id===currentProjectId?' selected':'')+'>'+esc(p.code+' — '+p.name)+'</option>';
  }).join('');
  sw.innerHTML = '<label>Project</label><select id="projsel" onchange="switchProject(this.value)">'+opts+'</select>';
}
function switchProject(id){ currentProjectId = id; tplSteps = []; renderProjectSwitch(); go(current); }
function selectedProjectCode(){ if(!currentProjectId) return ''; var p = projects.filter(function(x){return x.id===currentProjectId;})[0]; return p?p.code:''; }
function byProjectCode(list){ var code = selectedProjectCode(); return code ? list.filter(function(x){return x.project_code===code;}) : list; }
async function go(tab){ if(tab==='Admin' && !canManage()) tab='Dashboard'; current = tab; renderNav(); el('content').innerHTML='<p class="muted">Loading…</p>';
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
  await loadProjects();
  var admin = me.role==='Admin';
  var html = '';
  if (admin) {
    html += '<div class="card"><h2>New project</h2><div class="grid">'+
      '<div><label>Code</label><input id="pcode" placeholder="R03"></div>'+
      '<div><label>Name</label><input id="pname" placeholder="Tower A"></div>'+
      '<div><label>Client</label><input id="pclient"></div>'+
      '<div><label>Location</label><input id="ploc"></div>'+
      '</div><div class="row" style="margin-top:10px"><button class="btn" onclick="createProject()">Create project</button><span id="perr" class="err"></span></div>'+
      '<p class="muted" style="margin-top:8px">Each project is private. After creating it, add members to grant them access — they will only see this project\\'s documents, workflows, mail and reports.</p></div>';
  }
  html += '<div class="card"><h2>Projects</h2>'+
    (projects.length? '<table><tr><th>Code</th><th>Name</th><th>Client</th><th>Docs</th><th>Members</th>'+(admin?'<th></th>':'')+'</tr>'+
    projects.map(function(p){ return '<tr><td>'+esc(p.code)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.client||'')+'</td><td>'+p.document_count+'</td><td>'+(p.member_count==null?'—':p.member_count)+'</td>'+
      (admin?'<td><button class="btn ghost sm" onclick="manageMembers(\\''+p.id+'\\')">Members</button></td>':'')+'</tr>'; }).join('')+'</table>'
    : '<p class="muted">No projects yet'+(admin?' — create one above.':'. Ask an administrator to add you to a project.')+'</p>')+'</div>'+
    '<div id="memberPanel"></div>';
  el('content').innerHTML = html;
};
async function createProject(){
  try { await api('/projects',{method:'POST',body:{code:el('pcode').value,name:el('pname').value,client:el('pclient').value,location:el('ploc').value}}); go('Projects'); }
  catch(e){ el('perr').textContent=e.message; }
}
async function manageMembers(pid){
  var m = await api('/projects/'+pid+'/members');
  var us = []; try { us = (await api('/users')).users; } catch(e){}
  var p = projects.filter(function(x){return x.id===pid;})[0] || {};
  var have = {}; m.members.forEach(function(x){ have[x.user_id]=true; });
  var addable = us.filter(function(u){ return !have[u.id]; });
  el('memberPanel').innerHTML = '<div class="card"><h2>Members — '+esc(p.code||'')+' '+esc(p.name||'')+'</h2>'+
    (m.members.length? '<table><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>'+
      m.members.map(function(x){ return '<tr><td>'+esc(x.name)+'</td><td>'+esc(x.email)+'</td><td><span class="pill">'+esc(x.role)+'</span></td>'+
        '<td><button class="btn ghost sm" onclick="removeProjectMember(\\''+pid+'\\',\\''+x.user_id+'\\')">Remove</button></td></tr>'; }).join('')+'</table>'
      : '<p class="muted">No members yet.</p>')+
    '<div class="row" style="margin-top:10px">'+sel('addmem', addable.length?addable.map(function(u){return [u.id,u.name+' ('+u.role+')'];}):[['','— all users already members —']])+
    '<button class="btn sm" onclick="addProjectMember(\\''+pid+'\\')">Add member</button><span id="amerr" class="err"></span></div></div>';
  el('memberPanel').scrollIntoView({behavior:'smooth'});
}
async function addProjectMember(pid){ var uid=el('addmem').value; if(!uid) return; try{ await api('/projects/'+pid+'/members',{method:'POST',body:{user_id:uid}}); await loadProjects(); manageMembers(pid); }catch(e){ el('amerr').textContent=e.message; } }
async function removeProjectMember(pid,uid){ try{ await api('/projects/'+pid+'/members/'+uid,{method:'DELETE'}); await loadProjects(); manageMembers(pid); }catch(e){ alert(e.message); } }

VIEWS['Documents'] = async function(){
  await loadProjects();
  var qp=[]; if(currentProjectId) qp.push('project_id='+encodeURIComponent(currentProjectId));
  if(docFStatus) qp.push('status='+encodeURIComponent(docFStatus));
  if(docFType) qp.push('doc_type='+encodeURIComponent(docFType));
  var d = await api('/documents'+(qp.length?('?'+qp.join('&')):''));
  if (!projects.length) { el('content').innerHTML='<div class="card"><p class="muted">You are not a member of any project yet. Ask an administrator to add you to a project.</p></div>'; return; }
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
    '<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-end"><h2 style="margin:0">Documents</h2>'+docFilterBar()+'</div><table style="margin-top:12px"><tr><th>Number</th><th>Title</th><th>Rev</th><th>Status</th><th></th></tr>'+
    d.documents.map(function(x){ return '<tr><td style="font-family:monospace">'+esc(x.document_no)+'</td><td>'+esc(x.title)+'</td><td>'+esc(x.current_revision)+'</td><td>'+statusPill(x.workflow_status)+'</td>'+
      '<td><button class="btn ghost sm" onclick="openDoc(\\''+x.id+'\\')">Open</button></td></tr>'; }).join('')+'</table></div>'+
    '<div id="docdetail"></div>';
  if(currentProjectId && el('dproj')) el('dproj').value=currentProjectId;
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
    (canAct ? '' : ' <button class="btn sm" onclick="submitDoc(\\''+id+'\\')">Submit (auto-route)</button>')+
    '<span id="uerr" class="err"></span></div>'+
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
async function submitDoc(id){ try { var r = await api('/documents/'+id+'/submit',{method:'POST'}); alert('Submitted — workflow started'+(r.transmittalId?' and transmittal auto-issued to the distribution group.':'.')); openDoc(id); } catch(e){ el('uerr').textContent=e.message; } }
async function act(wfid, outcome){
  var c = el('wfcomment') ? el('wfcomment').value : '';
  try { await api('/workflows/'+wfid+'/act',{method:'POST',body:{outcome:outcome,comments:c}}); go('Documents'); } catch(e){ alert(e.message); }
}

VIEWS['Tasks'] = async function(){
  var d = await api('/workflows/tasks');
  var code = selectedProjectCode();
  var tasks = code ? d.tasks.filter(function(t){ return (t.document_no||'').indexOf(code+'-')===0; }) : d.tasks;
  el('content').innerHTML = '<div class="card"><h2>My tasks ('+esc(me.role)+')</h2>'+
    (tasks.length?'<table><tr><th>Document</th><th>Step</th><th>Action</th><th>Due</th><th></th></tr>'+
    tasks.map(function(t){ return '<tr><td style="font-family:monospace">'+esc(t.document_no)+'</td><td>'+esc(t.step_name)+'</td><td>'+esc(t.action_type)+'</td><td class="muted">'+esc((t.due_date||'').slice(0,10))+'</td>'+
      '<td><button class="btn ghost sm" onclick="openDoc(\\''+t.document_id+'\\');current=\\'Documents\\';renderNav();">Open</button></td></tr>'; }).join('')+'</table>':'<p class="muted">No pending tasks for your role'+(code?' in this project':'')+'.</p>')+
    '<div id="docdetail" style="margin-top:14px"></div></div>';
};

function roleSelectInline(i, val){ return '<select style="max-width:170px" onchange="tplSteps['+i+'].role=this.value">'+tplRoles.map(function(r){return '<option'+(r===val?' selected':'')+'>'+esc(r)+'</option>';}).join('')+'</select>'; }
function actionSelectInline(i, val){ return '<select style="max-width:110px" onchange="tplSteps['+i+'].action_type=this.value">'+['Review','Approve','Notify'].map(function(a){return '<option'+(a===val?' selected':'')+'>'+a+'</option>';}).join('')+'</select>'; }
function renderTplSteps(){ var box=el('tplStepsBox'); if(!box) return;
  box.innerHTML = tplSteps.length ? tplSteps.map(function(s,i){
    return '<div class="row" style="margin-bottom:6px"><span class="muted" style="width:18px">'+(i+1)+'</span>'+
      '<input style="max-width:200px" placeholder="Step name" value="'+esc(s.name)+'" onchange="tplSteps['+i+'].name=this.value">'+
      roleSelectInline(i,s.role)+actionSelectInline(i,s.action_type)+
      '<input type="number" min="0" step="0.5" style="max-width:80px" value="'+s.sla_days+'" title="SLA days" onchange="tplSteps['+i+'].sla_days=parseFloat(this.value)||0">'+
      '<button class="btn ghost sm" onclick="removeTplStep('+i+')">✕</button></div>';
  }).join('') : '<p class="muted">No steps yet — add at least one.</p>';
}
function addTplStep(){ tplSteps.push({name:'',role:(tplRoles[0]||'Contractor QA/QC'),action_type:'Review',sla_days:2}); renderTplSteps(); }
function removeTplStep(i){ tplSteps.splice(i,1); renderTplSteps(); }
async function createTemplate(){
  if(!tplSteps.length){ el('terr2').textContent='Add at least one step'; return; }
  var body={name:el('tname').value,type:el('ttype').value,doc_type_code:el('tdoc').value||undefined,steps:tplSteps};
  if(currentProjectId) body.project_id=currentProjectId;
  try{ await api('/templates',{method:'POST',body:body}); tplSteps=[]; go('Templates'); }catch(e){ el('terr2').textContent=e.message; }
}
VIEWS['Templates'] = async function(){
  await loadProjects();
  var d = await api('/templates'+(currentProjectId?('?project_id='+encodeURIComponent(currentProjectId)):''));
  var canEdit = (me.role==='Admin'||me.role==='Document Controller'||me.role==='Project Manager');
  if (canEdit && !tplRoles.length){ try{ tplRoles=(await api('/reference/roles')).roles; }catch(e){ tplRoles=[]; } }
  var html='';
  if (canEdit){
    if (currentProjectId){
      html += '<div class="card"><h2>New template — '+esc(selectedProjectCode())+'</h2><div class="grid">'+
        '<div><label>Name</label><input id="tname" placeholder="SUB — Submittal Approval"></div>'+
        '<div><label>Workflow for</label>'+sel('ttype',[['document','document'],['mail','mail']])+'</div>'+
        '<div><label>Doc type</label>'+sel('tdoc',[['','— any —']].concat(ref.doc_types.map(function(x){return [x.code,x.code+' '+x.name];})))+'</div>'+
        '</div><label style="margin-top:10px">Steps</label><div id="tplStepsBox"></div>'+
        '<div class="row" style="margin-top:6px"><button class="btn ghost sm" onclick="addTplStep()">+ Add step</button>'+
        '<button class="btn" onclick="createTemplate()">Create template</button><span id="terr2" class="err"></span></div>'+
        '<p class="muted" style="margin-top:6px">This workflow belongs to '+esc(selectedProjectCode())+' only.</p></div>';
    } else {
      html += '<div class="card"><p class="muted">Select a project in the sidebar to add a workflow template for it.</p></div>';
    }
  }
  html += '<div class="card"><h2>Workflow templates</h2>'+
    (d.templates.length? d.templates.map(function(t){
      var tag = t.project_id ? '<span class="pill" style="border-color:var(--accent);color:var(--accent)">'+esc(t.project_code||'project')+'</span>' : '<span class="pill">Standard · all projects</span>';
      return '<div class="card" style="background:var(--bg)"><b>'+esc(t.name)+'</b> '+tag+' <span class="pill">'+esc(t.type)+'</span> <span class="muted">'+esc(t.doc_type_code||'')+'</span>'+
        '<table style="margin-top:8px"><tr><th>#</th><th>Step</th><th>Role</th><th>Action</th><th>SLA</th></tr>'+
        t.steps.map(function(s){ return '<tr><td>'+s.step_order+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.role)+'</td><td>'+esc(s.action_type)+'</td><td>'+s.sla_days+'d</td></tr>'; }).join('')+'</table></div>';
    }).join('') : '<p class="muted">No templates.</p>')+'</div>';
  el('content').innerHTML = html;
  if (canEdit && currentProjectId) renderTplSteps();
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
    '<div class="card"><h2>Correspondence log</h2><table><tr><th>No</th><th>Type</th><th>Subject</th><th>Date</th><th></th></tr>'+
    byProjectCode(d.mail).map(function(m){ return '<tr><td style="font-family:monospace">'+esc(m.mail_no)+'</td><td>'+esc(m.type)+'</td><td>'+esc(m.subject)+'</td><td class="muted">'+esc((m.created_at||'').slice(0,10))+'</td><td><button class="btn ghost sm" onclick="openMail(\\''+m.id+'\\')">Open</button></td></tr>'; }).join('')+'</table></div>'+
    '<div id="maildetail"></div>';
  if(currentProjectId && el('mproj')) el('mproj').value=currentProjectId;
};
async function openMail(id){
  var d = await api('/mail/'+id); var m = d.mail;
  var recips = (d.recipients||[]).map(function(r){ return '<span class="pill '+(r.kind==='cc'?'info':'role')+'">'+esc(r.kind.toUpperCase())+': '+esc(r.role||r.user_id||'')+'</span>'; }).join(' ') || '<span class="muted">—</span>';
  el('maildetail').innerHTML = '<div class="card"><h2>'+esc(m.mail_no)+' — '+esc(m.type)+'</h2>'+
    '<p><b>'+esc(m.subject)+'</b></p>'+
    '<p style="white-space:pre-wrap">'+esc(m.body||'(no body)')+'</p>'+
    '<h3 style="font-size:13px;margin:12px 0 6px" class="muted">Recipients</h3><div class="row">'+recips+'</div>'+
    '<p class="muted" style="margin-top:10px">'+esc((m.created_at||'').slice(0,16).replace('T',' '))+'</p></div>';
  el('maildetail').scrollIntoView({behavior:'smooth'});
}
async function sendMail(){
  try { var r = await api('/mail',{method:'POST',body:{project_id:el('mproj').value,type:el('mtype').value,subject:el('msubj').value,body:el('mbody').value}});
    alert('Sent '+r.mail.mail_no+' — routed to: '+(r.mail.routed_to.join(', ')||'(no rule)')); go('Mail'); }
  catch(e){ el('merr').textContent=e.message; }
}

VIEWS['Transmittals'] = async function(){
  await loadProjects();
  var d = await api('/transmittals'); var docs = await api('/documents'+(currentProjectId?('?project_id='+encodeURIComponent(currentProjectId)):''));
  el('content').innerHTML =
    '<div class="card"><h2>New transmittal</h2>'+
    '<label>Project</label>'+sel('tproj', projects.map(function(p){return [p.id,p.code];}))+
    '<label>Subject</label><input id="tsubj">'+
    '<label>Documents</label><select id="tdocs" multiple size="6">'+docs.documents.map(function(x){return '<option value="'+x.id+'">'+esc(x.document_no)+' — '+esc(x.title)+'</option>';}).join('')+'</select>'+
    '<div class="row" style="margin-top:10px"><button class="btn" onclick="createTrn()">Issue transmittal</button><span id="terr" class="err"></span></div></div>'+
    '<div class="card"><h2>Transmittals</h2><table><tr><th>No</th><th>Subject</th><th>Docs</th><th>Date</th><th></th></tr>'+
    byProjectCode(d.transmittals).map(function(t){ return '<tr><td style="font-family:monospace">'+esc(t.transmittal_no)+'</td><td>'+esc(t.subject)+'</td><td>'+t.document_count+'</td><td class="muted">'+esc((t.created_at||'').slice(0,10))+'</td><td><button class="btn ghost sm" onclick="openTrn(\\''+t.id+'\\')">Open</button></td></tr>'; }).join('')+'</table></div>'+
    '<div id="trndetail"></div>';
  if(currentProjectId && el('tproj')) el('tproj').value=currentProjectId;
};
async function openTrn(id){
  var d = await api('/transmittals/'+id); var t = d.transmittal;
  el('trndetail').innerHTML = '<div class="card"><h2>'+esc(t.transmittal_no)+'</h2>'+
    '<p><b>'+esc(t.subject)+'</b> <span class="pill">'+esc(t.status)+'</span></p>'+
    '<h3 style="font-size:13px;margin:12px 0 6px" class="muted">Documents ('+(d.documents||[]).length+')</h3>'+
    ((d.documents||[]).length? '<table><tr><th>Number</th><th>Title</th><th>Rev</th></tr>'+
      d.documents.map(function(x){ return '<tr><td style="font-family:monospace">'+esc(x.document_no)+'</td><td>'+esc(x.title)+'</td><td>'+esc(x.revision_code)+'</td></tr>'; }).join('')+'</table>'
      : '<p class="muted">No documents.</p>')+
    '<p class="muted" style="margin-top:10px">'+esc((t.created_at||'').slice(0,16).replace('T',' '))+'</p></div>';
  el('trndetail').scrollIntoView({behavior:'smooth'});
}
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

VIEWS['Reports'] = async function(){
  await loadProjects();
  var pq = currentProjectId?('?project_id='+encodeURIComponent(currentProjectId)):'';
  var o = await api('/reports/overview'); var sla = await api('/reports/sla'); var reg = await api('/reports/register'+pq);
  var t = o.totals;
  el('content').innerHTML =
    '<div class="card"><h2>Overview</h2><div class="grid">'+
     stat('Documents', t.documents||0)+ stat('Active workflows', t.active_workflows||0)+
     stat('Overdue steps', t.overdue?('<span class="err">'+t.overdue+'</span>'):'0')+
     stat('Transmittals', t.transmittals||0)+ stat('Correspondence', t.mail||0)+'</div>'+
     '<p style="margin-top:10px">'+ o.by_status.map(function(s){return '<span class="'+pcls(s.workflow_status)+'">'+esc(s.workflow_status)+': '+s.n+'</span>';}).join(' ')+'</p></div>'+
    '<div class="card"><h2>SLA — overdue ('+sla.overdue.length+') &amp; due soon ('+sla.due_soon.length+')</h2>'+
     ((sla.overdue.length||sla.due_soon.length)?
      '<table><tr><th>Document</th><th>Step</th><th>Role</th><th>Due</th><th>Days overdue</th></tr>'+
      sla.overdue.concat(sla.due_soon).map(function(r){ var od=r.days_overdue>0?'<span class="err">'+r.days_overdue+'</span>':r.days_overdue; return '<tr><td style="font-family:monospace">'+esc(r.document_no)+'</td><td>'+esc(r.step_name)+'</td><td>'+esc(r.role)+'</td><td class="muted">'+esc((r.due_date||'').slice(0,10))+'</td><td>'+od+'</td></tr>'; }).join('')+'</table>'
      : '<p class="muted">No open workflow steps.</p>')+'</div>'+
    '<div class="card"><div class="row" style="justify-content:space-between"><h2>Document register ('+reg.count+')</h2><a class="btn ghost sm" href="/api/reports/register?format=csv'+(currentProjectId?('&project_id='+encodeURIComponent(currentProjectId)):'')+'">Download CSV</a></div>'+
     '<table><tr><th>Number</th><th>Title</th><th>Disc</th><th>Type</th><th>Status</th><th>Rev</th><th>Workflow</th></tr>'+
     reg.register.map(function(d){ return '<tr><td style="font-family:monospace">'+esc(d.document_no)+'</td><td>'+esc(d.title)+'</td><td>'+esc(d.discipline||'')+'</td><td>'+esc(d.type||'')+'</td><td>'+esc(d.status||'')+'</td><td>'+esc(d.revision||'')+'</td><td>'+statusPill(d.workflow_status)+'</td></tr>'; }).join('')+'</table></div>';
};

VIEWS['Distribution'] = async function(){
  var d = await api('/distribution-groups');
  var manage = canManage();
  var userOpts = [];
  if (manage) { try { userOpts = (await api('/users')).users.map(function(u){return [u.id, u.name+' ('+u.role+')'];}); } catch(e){} }
  var html = '';
  if (manage) {
    html += '<div class="card"><h2>New distribution group</h2><div class="grid">'+
      '<div><label>Name</label><input id="gname" placeholder="SUB-Consultant-Team"></div>'+
      '<div><label>Doc type</label>'+sel('gtype',[['','— any —']].concat(ref.doc_types.map(function(x){return [x.code,x.code];})))+'</div>'+
      '</div><div class="row" style="margin-top:10px"><button class="btn" onclick="createGroup()">Create</button><span id="gerr" class="err"></span></div>'+
      '<p class="muted" style="margin-top:8px">Groups matched by document type are auto-notified when a document is submitted.</p></div>';
  }
  html += '<div class="card"><h2>Distribution groups</h2>'+ (d.groups.length? d.groups.map(function(g){
      return '<div class="card" style="background:var(--panel-alt)"><b>'+esc(g.name)+'</b> <span class="pill">'+esc(g.doc_type_code||'any')+'</span> <span class="muted">'+g.member_count+' members</span>'+
        (manage ? '<div class="row" style="margin-top:8px">'+sel('mem_'+g.id, userOpts.length?userOpts:[['','(no users yet)']])+
          '<button class="btn sm" onclick="addMember(\\''+g.id+'\\')">Add member</button><span id="ge_'+g.id+'" class="muted"></span></div>' : '')+'</div>';
    }).join('') : '<p class="muted">No distribution groups.</p>')+'</div>';
  el('content').innerHTML = html;
};
async function createGroup(){ try { await api('/distribution-groups',{method:'POST',body:{name:el('gname').value,doc_type_code:el('gtype').value||undefined}}); go('Distribution'); } catch(e){ el('gerr').textContent=e.message; } }
async function addMember(gid){ var uid=el('mem_'+gid).value; if(!uid) return; try { await api('/distribution-groups/'+gid+'/members',{method:'POST',body:{user_id:uid}}); go('Distribution'); } catch(e){ el('ge_'+gid).textContent=e.message; } }

VIEWS['Admin'] = async function(){
  var u = await api('/users'); var co = await api('/companies'); var roles=(await api('/reference/roles')).roles;
  el('content').innerHTML =
    '<div class="card"><h2>Invite user</h2><div class="grid">'+
    '<div><label>Name</label><input id="un"></div>'+
    '<div><label>Email</label><input id="ue"></div>'+
    '<div><label>Password</label><input id="up" type="password"></div>'+
    '<div><label>Role</label>'+sel('ur', roles.map(function(r){return [r,r];}))+'</div>'+
    '<div><label>Company</label>'+sel('uc',[['','—']].concat(co.companies.map(function(x){return [x.id,x.code];})))+'</div>'+
    '</div><div class="row" style="margin-top:10px"><button class="btn" onclick="createUser()">Create user</button><span id="ue2" class="err"></span></div></div>'+
    '<div class="card"><h2>Users</h2><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th></tr>'+
     u.users.map(function(x){return '<tr><td>'+esc(x.name)+'</td><td>'+esc(x.email)+'</td><td><span class="pill">'+esc(x.role)+'</span></td><td>'+esc(x.company_code||'')+'</td></tr>';}).join('')+'</table></div>'+
    '<div class="card"><h2>Companies</h2><div class="grid">'+
    '<div><label>Code</label><input id="cc" placeholder="ABC"></div>'+
    '<div><label>Name</label><input id="cn"></div>'+
    '<div><label>Type</label>'+sel('ct',[['Contractor','Contractor'],['Consultant','Consultant'],['Client','Client'],['Subcontractor','Subcontractor'],['Supplier','Supplier']])+'</div>'+
    '</div><div class="row" style="margin-top:10px"><button class="btn" onclick="createCompany()">Add company</button><span id="ce" class="err"></span></div>'+
    '<table style="margin-top:12px"><tr><th>Code</th><th>Name</th><th>Type</th></tr>'+co.companies.map(function(x){return '<tr><td>'+esc(x.code)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.type)+'</td></tr>';}).join('')+'</table></div>';
};
async function createUser(){ try{ await api('/users',{method:'POST',body:{name:el('un').value,email:el('ue').value,password:el('up').value,role:el('ur').value,company_id:el('uc').value||undefined}}); go('Admin'); }catch(e){ el('ue2').textContent=e.message; } }
async function createCompany(){ try{ await api('/companies',{method:'POST',body:{code:el('cc').value,name:el('cn').value,type:el('ct').value}}); go('Admin'); }catch(e){ el('ce').textContent=e.message; } }

/* --------------------------- helpers ---------------------------- */
function pcls(s){ s=String(s==null?'':s).toLowerCase();
  if(/closed|approved|complete/.test(s)) return 'pill ok';
  if(/revise|resubmit|reject|overdue|archiv/.test(s)) return 'pill err';
  if(/review|await|pending|progress/.test(s)) return 'pill review';
  if(/draft/.test(s)) return 'pill draft';
  return 'pill'; }
function statusPill(s){ return '<span class="'+pcls(s)+'">'+esc(s)+'</span>'; }
function docFilterBar(){
  var statuses=['Draft','Under Review','Awaiting Response','Revise & Resubmit','Closed','Archived'];
  var s='<select onchange="docFStatus=this.value;go(\\'Documents\\')" style="max-width:180px"><option value="">All statuses</option>';
  statuses.forEach(function(x){ s+='<option'+(x===docFStatus?' selected':'')+'>'+esc(x)+'</option>'; }); s+='</select>';
  var t='<select onchange="docFType=this.value;go(\\'Documents\\')" style="max-width:180px"><option value="">All types</option>';
  (ref.doc_types||[]).forEach(function(x){ t+='<option value="'+esc(x.code)+'"'+(x.code===docFType?' selected':'')+'>'+esc(x.code+' '+x.name)+'</option>'; }); t+='</select>';
  return '<div class="row" style="gap:6px">'+s+t+'</div>';
}
function sel(id, pairs){ return '<select id="'+id+'">'+pairs.map(function(p){return '<option value="'+esc(p[0])+'">'+esc(p[1])+'</option>';}).join('')+'</select>'; }
async function loadProjects(){
  projects = (await api('/projects')).projects;
  // If the selected project is no longer accessible, fall back to "all".
  if (currentProjectId && !projects.some(function(p){return p.id===currentProjectId;})) currentProjectId = '';
  renderProjectSwitch();
}

/* ------------------------------ boot ---------------------------- */
async function boot(){
  try { var m = await api('/auth/me'); me = m.user; }
  catch(e){
    var bootstrap = false;
    try { bootstrap = (await api('/auth/status')).needs_setup; } catch(e2){}
    showAuth(bootstrap); return;
  }
  el('auth').classList.add('hide'); el('app').classList.remove('hide');
  el('who').innerHTML = esc(me.name) + '<br><span class="muted">' + esc(me.role) + '</span>';
  try { ref.disciplines = (await api('/reference/disciplines')).disciplines;
        ref.doc_types = (await api('/reference/doc-types')).doc_types;
        ref.statuses = (await api('/reference/statuses')).statuses;
        ref.levels = (await api('/reference/levels')).levels; } catch(e){}
  try { await loadProjects(); } catch(e){}
  renderNav(); go('Dashboard');
}
boot();
</script>
</body>
</html>`;
