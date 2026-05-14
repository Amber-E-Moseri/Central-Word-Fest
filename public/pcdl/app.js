// Prototype app code from the latest HTML

// ────────────────────────────────────────────
// DATA
// ────────────────────────────────────────────
const CIRCLE_STATUS=[
  {label:'Done',        cls:'badge-green',note:'Completed Day 2 · 10 pts'},
  {label:'In progress', cls:'badge-amber',note:'Watching now · 62%'},
  {label:'Behind',      cls:'badge-red',  note:'Missed yesterday'},
];

const REFLECTIONS = [];
const ALERTS = [];

// ────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────
const S={
  user:null,
  page:'home',
  adminPage:'media',
  selectedDay:2,
  todayMedia:null,
  mediaSaveStatus:'',
  adminMessageDay:null,
  adminMessageItems:[],
  todayItemById:{},
  mediaOps: {
    loading: false,
    health: null,
    lastRun: null,
    runs: [],
    failures: [],
    warnings: { expiringSoon: [], missingPcdl: [], repeatedFailures: [] }
  },
  circle: {
    loading: false,
    error: "",
    accountableTo: [],
    accountableFrom: [],
    pending: []
  }
};
let circleDraft = [];

// ────────────────────────────────────────────
// ROOT RENDER
// ────────────────────────────────────────────
function render(){
  if(!S.user) renderSignup();
  else if(isAdminRole(S.user.role)) renderMember();
  else if(normalizeRole(S.user.role)==='Group Pastor') renderPastor();
  else renderMember();
  syncHeader();
}

// ────────────────────────────────────────────
// HEADER
// ────────────────────────────────────────────
function syncHeader(){
  const sub=document.getElementById('header-sub');
  const badgeArea=document.getElementById('user-badge-area');
  const tabs=document.getElementById('header-tabs');
  const nav=document.getElementById('bottom-nav');

  if(!S.user){
    sub.textContent='Accountability Challenge';
    badgeArea.innerHTML='';
    tabs.classList.add('hidden');
    nav.classList.add('hidden');
    return;
  }

  const ini=initials(S.user.name);
  sub.textContent=`${S.user.name} · ${S.user.fellowship} · ${cap(S.user.role)}`;
  badgeArea.innerHTML=`
    <div class="user-badge">
      <div class="avatar-sm">${ini}</div>
      <span>${cap(S.user.role)}</span>
      <button onclick="logout()" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:11px;font-weight:800;padding:0 0 0 6px">Sign out</button>
    </div>`;

  if(canAccessMemberExperience(S.user.role)){
    const pages=[
      {id:'home',  label:'Home',   icon:'🏠'},
      {id:'today', label:'Today',  icon:'▶️'},
      {id:'circle',label:'Circle', icon:'🔄'},
      {id:'fellowship',label:'People',icon:'👥'},
      {id:'community',label:'Community',icon:'💬'},
      ...(canSeeFellowshipStats(S.user.role) ? [{id:'analytics',label:'Stats',icon:'📊'}] : []),
      ...(isAdminRole(S.user.role) ? [{id:'admin',label:'Admin',icon:'\u2699\uFE0F'}] : []),
    ];
    tabs.classList.remove('hidden');
    tabs.innerHTML=pages.map(p=>`<button class="tab-btn${S.page===p.id?' active':''}" onclick="go('${p.id}')">${p.label}</button>`).join('');
    nav.classList.remove('hidden');
    nav.style.gridTemplateColumns=`repeat(${pages.length},1fr)`;
    nav.innerHTML=pages.map(p=>`<button class="nav-btn${S.page===p.id?' active':''}" onclick="go('${p.id}')"><span class="nav-icon">${p.icon}</span>${p.label}</button>`).join('');
  } else {
    tabs.classList.add('hidden');
    nav.classList.add('hidden');
  }
}

// ────────────────────────────────────────────
// SIGNUP — STEP 1
// ────────────────────────────────────────────
function renderSignup(){
  const main=el('main-content');
  if(!main) return;
  main.style.gridTemplateColumns='';
  main.innerHTML='<div class="card"><div class="notice">Loading sign in...</div></div>';
}

function roleHint(){}

function logout(){S.user=null;circleDraft=[];render()}

function renderMember(){
  if(S.page==='analytics' && !canSeeFellowshipStats(S.user.role)) S.page='home';
  const fns={home:pageHome,today:pageToday,circle:pageCircle,fellowship:pageFellowship,community:pageCommunity,analytics:pageCoordinatorAnalytics,admin:() => renderAdmin()};
  (fns[S.page]||pageHome)(el('main-content'));
}

function pageHome(m){
  m.style.gridTemplateColumns='';
  const u=S.user;
  const circle=circleMembers().slice(0,2);
  m.innerHTML=`
    <div class="home-pane">
      <div class="hero">
        <div class="hero-eyebrow">Stay consistent</div>
        <div class="hero-title">Finish<br>strong.</div>
        <div class="hero-body">Today's message is ready. Complete it and help your fellowship stay strong.</div>
        <button class="btn-gold" onclick="go('today')">Continue today →</button>
      </div>
      <div class="home-right">
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">Points</div><div class="stat-val">-</div></div>
          <div class="stat-card"><div class="stat-label">Streak</div><div class="stat-val">-</div></div>
          <div class="stat-card"><div class="stat-label">Rank</div><div class="stat-val">-</div></div>
        </div>
        <div class="card">
          <div class="card-title" style="font-size:15px">${u.role==='coordinator'?'Fellowship lead view':'Your fellowship'}</div>
          <div class="member-row" style="border:none;padding:0">
            <div class="avatar">${u.fellowship.slice(0,2).toUpperCase()}</div>
            <div class="member-info"><div class="member-name">${u.fellowship} Fellowship</div><div class="member-sub">${u.role==='coordinator'?'You are participating and leading this fellowship view':'Participation stats are loading.'}</div></div>
            <span class="badge badge-amber">-</span>
          </div>
          ${u.role==='coordinator'?`<button class="btn btn-soft btn-full" style="margin-top:12px" onclick="go('analytics')">Open fellowship stats →</button>`:''}
        </div>
        <div class="card">
          <div class="card-title" style="font-size:15px">Your circle</div>
          ${circle.map((mem,i)=>`
            <div class="member-row">
              <div class="avatar">${mem.ini}</div>
              <div class="member-info"><div class="member-name">${mem.name}</div><div class="member-sub">${CIRCLE_STATUS[i].note}</div></div>
              <span class="badge ${CIRCLE_STATUS[i].cls}">${CIRCLE_STATUS[i].label}</span>
            </div>`).join('')}
          <button class="btn btn-soft btn-full" style="margin-top:8px" onclick="go('circle')">View full circle →</button>
        </div>
      </div>
    </div>`;
}

function pageToday(m){
  m.style.gridTemplateColumns='';
  m.innerHTML=`
    <div class="two-pane">
      <div class="card">
        <div class="card-title">Today's Messages <span class="badge badge-gold">5 pts each</span></div>
        <div id="today-day-meta" class="notice" style="margin-bottom:10px;display:none"></div>
        
        <div id="today-message-items"><div class="notice">Loading today's messages...</div></div>
      </div>
      <div style="display:grid;gap:14px;align-content:start">
        <div class="card">
          <div class="card-title" style="font-size:15px">Reflection</div>
          <textarea id="today-reflection-text" style="width:100%;border:1px solid var(--line);border-radius:12px;padding:12px;font-family:inherit;font-size:13px;min-height:130px;background:#FFFCF6;resize:vertical;color:var(--text)" placeholder="What stood out to you from today's message?"></textarea>
          <div class="form-group" style="margin-top:10px"><label>Reflection visibility</label><select id="today-reflection-visibility"><option>Private</option><option>My Accountability Circle</option><option>My Fellowship</option><option>Everyone</option></select></div>
          <div class="form-group" style="margin-top:10px"><label>Reflection target</label><select id="today-reflection-target"><option value="day">Whole day</option></select></div>
          <button class="btn btn-soft btn-full" style="margin-top:10px" onclick="submitTodayReflection()">Save reflection</button>
        </div>
        <div class="card">
          <div class="card-title" style="font-size:15px">Circle today</div>
          ${circleMembers().map((mem,i)=>`
            <div class="member-row">
              <div class="avatar">${mem.ini}</div>
              <div class="member-info"><div class="member-name">${mem.name}</div><div class="member-sub">${CIRCLE_STATUS[i%3].note}</div></div>
              <span class="badge ${CIRCLE_STATUS[i%3].cls}" style="font-size:10px">${CIRCLE_STATUS[i%3].label}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  renderTodayMessageItems();
}
// Keep a single pageCircle implementation. Reassigning it later silently overrides live behavior.
function pageCircle(m){
  m.style.gridTemplateColumns='';
  const members=circleMembers();
  m.innerHTML=`
    <div class="circle-pane">
      <div class="card" style="grid-column:1/-1">
        <div class="card-title">
          My Accountability Circle
          <button class="btn btn-soft btn-sm" onclick="openOverlay()">Edit circle</button>
        </div>
        ${members.map((mem,i)=>`
          <div class="member-row">
            <div class="avatar${i===0?' gold':i===2?' bronze':''}">${mem.ini}</div>
            <div class="member-info">
              <div class="member-name">${mem.name}</div>
              <div class="member-sub">${mem.fellowship} · ${cap(mem.role)} · ${CIRCLE_STATUS[i%3].note}</div>
            </div>
            <span class="badge ${CIRCLE_STATUS[i%3].cls}">${CIRCLE_STATUS[i%3].label}</span>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title">Circle health</div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">Done</div><div class="stat-val">1</div></div>
          <div class="stat-card"><div class="stat-label">Watching</div><div class="stat-val">1</div></div>
          <div class="stat-card"><div class="stat-label">Behind</div><div class="stat-val">1</div></div>
        </div>
      </div>
    </div>`;
}


function pageCommunity(m){
  m.style.gridTemplateColumns='';
  m.innerHTML=`
    <div class="card" style="background:linear-gradient(135deg,var(--purple),var(--purple-dark));color:#fff;border:none">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px">Community Reflections</div>
          <div style="font-size:20px;font-weight:900">Shared responses from today’s message</div>
        </div>
        <span style="background:rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:900">Optional sharing</span>
      </div>
    </div>

    <div class="circle-pane">
      <div class="card">
        <div class="card-title">Share a reflection</div>
        <textarea style="width:100%;border:1px solid var(--line);border-radius:12px;padding:12px;font-family:inherit;font-size:13px;min-height:120px;background:#FFFCF6;resize:vertical;color:var(--text)" placeholder="Share what ministered to you today..."></textarea>
        <div class="form-group" style="margin-top:10px">
          <label>Who can see this?</label>
          <select>
            <option>Private</option>
            <option>My Accountability Circle</option>
            <option>My Fellowship</option>
            <option>Everyone</option>
          </select>
        </div>
        <button class="btn btn-purple btn-full" style="margin-top:12px">Post reflection</button>
      </div>

      <div class="card" style="grid-column:1/-1">
        <div class="card-title">Shared reflections</div>
        ${REFLECTIONS.map(r=>`
          <div class="member-row">
            <div class="avatar">${r.ini}</div>
            <div class="member-info">
              <div class="member-name">${r.user} <span class="badge badge-purple" style="margin-left:6px">${r.visibility}</span></div>
              <div class="member-sub">${r.fellowship} · ${cap(r.role)}</div>
              <div style="font-size:13px;line-height:1.6;margin-top:8px;color:var(--text)">${r.text}</div>
              <div style="font-size:12px;color:var(--muted);margin-top:8px">🔥 Amen · ${r.reactions} reactions</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function pageAnalytics(m){
  m.style.gridTemplateColumns='';
  m.innerHTML=`
    <div class="metrics-grid" style="margin-bottom:0">
      <div class="big-metric"><div class="metric-label">Leaders today</div><div class="metric-val">-</div></div>
      <div class="big-metric"><div class="metric-label">Participation</div><div class="metric-val">Loading...</div></div>
      <div class="big-metric"><div class="metric-label">At risk</div><div class="metric-val">-</div></div>
      <div class="big-metric"><div class="metric-label">Top fellowship</div><div class="metric-val">-</div></div>
    </div>
    <div class="circle-pane">
      <div class="card">
        <div class="card-title">By fellowship</div>
        ${[['Central','-'],['West','-'],['East','-'],['North','-'],['South','-']].map(([f,v])=>`
          <div class="bar-row">
            <div class="bar-head"><span>${f}</span><span>${v === '-' ? '-' : `${v}%`}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title">Needs attention</div>
        <table><thead><tr><th>Name</th><th>Fellowship</th><th>Status</th></tr></thead><tbody>
          <tr><td>Chisom O.</td><td>Central</td><td><span class="badge badge-red">2 missed</span></td></tr>
          <tr><td>Jide A.</td><td>West</td><td><span class="badge badge-amber">Backdated</span></td></tr>
          <tr><td>Mara K.</td><td>North</td><td><span class="badge badge-red">Inactive</span></td></tr>
        </tbody></table>
      </div>
    </div>`;
}

function pageFellowship(m){
  m.style.gridTemplateColumns='';
  const FSHIPS=[
    {name:'Central',members:[
      {n:'Grace A.',i:'GA',sub:'Leader · 10 pts · 2-day streak',s:'Done',c:'badge-green'},
      {n:'Chisom O.',i:'CO',sub:'Leader · 5 pts · missed yesterday',s:'Behind',c:'badge-red'},
      {n:'Ada M.',i:'AM',sub:'Member · 9 pts · 1 backdated',s:'Catch-up',c:'badge-amber'},
    ]},
    {name:'West',members:[
      {n:'Emeka T.',i:'ET',sub:'Leader · 8 pts · 2-day streak',s:'Done',c:'badge-green'},
      {n:'Jide A.',i:'JA',sub:'Member · 3 pts · backdated',s:'Catch-up',c:'badge-amber'},
    ]},
    {name:'East',members:[
      {n:'Sola E.',i:'SE',sub:'Leader · 12 pts · streak 3',s:'Done',c:'badge-green'},
      {n:'Kemi O.',i:'KO',sub:'Member · 7 pts',s:'Done',c:'badge-green'},
    ]},
    {name:'North',members:[
      {n:'Mara K.',i:'MK',sub:'Leader · 0 pts · inactive',s:'Behind',c:'badge-red'},
      {n:'Temi B.',i:'TB',sub:'Member · 6 pts',s:'Done',c:'badge-green'},
    ]},
  ];
  m.innerHTML=`
    <div class="circle-pane">
      <div class="card" style="grid-column:1/-1">
        <div class="card-title">Fellowship View <span class="badge badge-purple">${S.user.fellowship}</span></div>
      </div>
      ${FSHIPS.map(f=>`
        <div class="card">
          <div class="card-title" style="font-size:15px">${f.name} Fellowship</div>
          ${f.members.map(mem=>`
            <div class="member-row">
              <div class="avatar">${mem.i}</div>
              <div class="member-info"><div class="member-name">${mem.n}</div><div class="member-sub">${mem.sub}</div></div>
              <span class="badge ${mem.c}">${mem.s}</span>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;
}

// ────────────────────────────────────────────
// ADMIN VIEW
// ────────────────────────────────────────────
function renderAdmin(){
  const m=el('main-content');
  m.style.gridTemplateColumns='';
  const adminTabs=[
    {id:'media',label:'Media Manager'},
    {id:'import',label:'Import Users'},
    {id:'users',label:'User Directory'},
    {id:'analytics',label:'Analytics'},
  ];
  const tabHtml=adminTabs.map(t=>`<button class="admin-tab${S.adminPage===t.id?' active':''}" onclick="setAdminPage('${t.id}')">${t.label}</button>`).join('');

  let body='';
  if(S.adminPage==='media') body=`
    <div class="two-pane">
      <div class="card">
        <div class="card-title">Daily message setup</div>
        <div style="display:grid;gap:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:13px;font-weight:900;color:var(--muted);white-space:nowrap">Day</div>
            <input id="media-day-input" type="number" min="1" value="${S.selectedDay}" onchange="onAdminDayChange()" style="width:80px;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-family:inherit;font-size:16px;font-weight:900">
          </div>
          <div class="form-group"><label>Scheduled date</label><input id="day-scheduled-date-input" type="date" style="width:100%"></div>
          <div class="form-group"><label>Day label</label><input id="day-label-input" placeholder="e.g. Day 16" style="width:100%"></div>
          <div class="form-group"><label>Day active</label><select id="day-is-active-input"><option value="true">Active</option><option value="false">Inactive</option></select></div>
          <button class="btn btn-soft btn-full" onclick="saveMessageDay()">Save Day</button>
          <button class="btn btn-purple btn-full" onclick="addMessageItem()">+ Add Message</button>
          <div id="media-save-status" class="notice" style="display:${S.mediaSaveStatus?'block':'none'}">${S.mediaSaveStatus || ''}</div>
        </div>
      </div>
      <div style="display:grid;gap:14px;align-content:start">
        <div class="card">
          <div class="card-title" style="font-size:15px">Messages</div>
          <div id="admin-message-items"><div class="notice">Select a day to load messages.</div></div>
        </div>
        <div class="card">
          <div class="card-title" style="font-size:15px">Media Refresh Operations</div>
          <div id="admin-media-ops-panel"><div class="notice">Loading media refresh health...</div></div>
        </div>
        <div class="card">
          <div style="font-size:13px;font-weight:800;margin-bottom:10px">Source guide</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.8">
            <strong>Direct MP4 / MP3</strong> — hosted file URL<br>
            <strong>Google Drive</strong> — share link auto-converts to embed<br>
            <strong>Web Link</strong> — may open in new tab if embedding is blocked
          </div>
        </div>
      </div>
    </div>`;

  else if(S.adminPage==='import') body=`
    <div class="two-pane">
      <div class="card">
        <div class="card-title">Import from Google Sheets</div>
        <div style="display:grid;gap:12px">
          <div class="form-group"><label>Upload CSV exported from Google Sheets</label><input type="file" accept=".csv,.xlsx" style="width:100%"></div>
          <div class="notice">Required columns: <code>full_name</code>, <code>email</code>, <code>fellowship</code>, <code>role</code>. After import, users receive an invite to set their password and choose their circle.</div>
          <table><thead><tr><th>Column</th><th>Example</th><th>Required</th></tr></thead><tbody>
            <tr><td><code>full_name</code></td><td>Grace Adebayo</td><td><span class="badge badge-red">Yes</span></td></tr>
            <tr><td><code>email</code></td><td>grace@email.com</td><td><span class="badge badge-red">Yes</span></td></tr>
            <tr><td><code>fellowship</code></td><td>Central</td><td><span class="badge badge-red">Yes</span></td></tr>
            <tr><td><code>role</code></td><td>leader</td><td><span class="badge badge-red">Yes</span></td></tr>
            <tr><td><code>phone</code></td><td>+234 800…</td><td><span class="badge badge-amber">Optional</span></td></tr>
          </tbody></table>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <button class="btn btn-muted">Preview import</button>
            <button class="btn btn-purple">Import to Supabase</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px">Import tips</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.8">
          Export from Sheets via <em>File → Download → CSV</em>.<br><br>
          Role values must match exactly: <code>member</code>, <code>leader</code>, <code>bsc</code>, <code>coordinator</code>, <code>admin</code>, or <code>pastor</code>.<br><br>
          Imported users will be shown in the partner picker so others can add them to their circle during signup or via the Circle tab.
        </div>
      </div>
    </div>`;

  else if(S.adminPage==='users') body=`
    <div class="card">
      <div class="card-title">User directory</div>
      <div style="margin-bottom:14px"><input placeholder="Search name, fellowship, or role" style="width:100%;border:1px solid var(--line);border-radius:12px;padding:11px 14px;font-family:inherit;font-size:14px;background:#FFFCF6;color:var(--text)"></div>
      <table><thead><tr><th>Name</th><th>Fellowship</th><th>Role</th><th>Status</th></tr></thead><tbody>
        <tr><td colspan="4" style="color:var(--muted);font-style:italic">No users loaded.</td></tr>
      </tbody></table>
    </div>`;

  else if(S.adminPage==='analytics') body=`
    <div class="metrics-grid">
      <div class="big-metric"><div class="metric-label">Leaders today</div><div class="metric-val">-</div></div>
      <div class="big-metric"><div class="metric-label">Participation</div><div class="metric-val">Loading...</div></div>
      <div class="big-metric"><div class="metric-label">At risk</div><div class="metric-val">-</div></div>
      <div class="big-metric"><div class="metric-label">Top fellowship</div><div class="metric-val">-</div></div>
    </div>
    <div class="circle-pane">
      <div class="card">
        <div class="card-title">Participation by fellowship</div>
        ${[['Central','-'],['West','-'],['East','-'],['North','-'],['South','-']].map(([f,v])=>`
          <div class="bar-row">
            <div class="bar-head"><span>${f}</span><span>${v === '-' ? '-' : `${v}%`}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>
          </div>`).join('')}
      </div>
      
      <div class="card">
        <div class="card-title">Alerts</div>
        <table><thead><tr><th>Name</th><th>Role</th><th>Fellowship</th><th>Inactive</th></tr></thead><tbody>
          ${ALERTS.map(a=>`
            <tr>
              <td>${a.name}</td>
              <td>${cap(a.role)}</td>
              <td>${a.fellowship}</td>
              <td><span class="badge badge-red">${a.days} days</span></td>
            </tr>`).join('')}
          ${ALERTS.length ? "" : `<tr><td colspan="4">No live alerts right now.</td></tr>`}
        </tbody></table>
      </div>
    </div>`;

  m.innerHTML=`
    <div class="card" style="background:linear-gradient(135deg,var(--purple),var(--purple-dark));color:#fff;border:none">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px">Admin Panel</div>
          <div style="font-size:20px;font-weight:900">Central Summer Word Fest Control Centre</div>
        </div>
        <span style="background:rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:900">Admin only</span>
      </div>
    </div>
    <div class="admin-nav">${tabHtml}</div>
    ${body}`;
  if(S.adminPage === 'media') {
    hydrateAdminMediaForm();
    onAdminDayChange();
    loadAdminMediaOps();
  }
}

// ────────────────────────────────────────────
// PASTOR VIEW
// ────────────────────────────────────────────
function renderPastor(){
  const m=el('main-content');
  m.style.gridTemplateColumns='';
  m.innerHTML=`
    <div class="card" style="background:linear-gradient(135deg,var(--purple),var(--purple-dark));color:#fff;border:none">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px">Pastor Dashboard</div>
          <div style="font-size:20px;font-weight:900">All-Fellowship Overview</div>
        </div>
        <span style="background:rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:900">Read-only</span>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Live Oversight Data</div>
      <div class="notice">Live oversight metrics will appear as data sync completes.</div>
    </div>`;
}

// ────────────────────────────────────────────
// CIRCLE OVERLAY (post-signup editing)
// ────────────────────────────────────────────
function openOverlay(){
  circleDraft=[...(S.user?.partners || [])];
  const grid=el('overlay-grid');
  const choices = circleMembers();
  if(!choices.length){
    grid.innerHTML=`<div class="notice">No live people available yet.</div>`;
    updateOverlayCount();
    el('circle-overlay').classList.remove('hidden');
    return;
  }
  grid.innerHTML=choices.map(u=>`
    <label class="partner-card${circleDraft.includes(u.id)?' selected':''}" onclick="toggleOverlay('${u.id}',this)">
      <input type="checkbox"${circleDraft.includes(u.id)?' checked':''} style="pointer-events:none">
      <div><div class="partner-card-name">${u.name}</div><div class="partner-card-sub">${u.fellowship} · ${cap(u.role)}</div></div>
    </label>`).join('');
  updateOverlayCount();
  el('circle-overlay').classList.remove('hidden');
}
function toggleOverlay(id,lbl){
  const idx=circleDraft.indexOf(id);
  if(idx>-1){circleDraft.splice(idx,1);lbl.classList.remove('selected');lbl.querySelector('input').checked=false}
  else{
    if(circleDraft.length>=3){alert('Max 3 partners. Remove one first.');return}
    circleDraft.push(id);lbl.classList.add('selected');lbl.querySelector('input').checked=true
  }
  updateOverlayCount();
}

function updateOverlayCount(){
  const n=circleDraft.length;
  el('overlay-count').textContent = n + ' of 3 chosen' + (n<2 ? ' - choose at least 2' : '');
}

function saveCircle(){
  if(circleDraft.length<2){alert('Choose at least 2 partners.');return}
  S.user.partners=[...circleDraft];
  el('circle-overlay').classList.add('hidden');
  render();
}
function closeOverlay(e,force){
  if(force||e.target===el('circle-overlay')) el('circle-overlay').classList.add('hidden');
}


// ────────────────────────────────────────────
// COORDINATOR VIEW
// ────────────────────────────────────────────
function pageCoordinatorAnalytics(m){
  m.style.gridTemplateColumns='';
  m.innerHTML=`
    <div class="card" style="background:linear-gradient(135deg,var(--purple),var(--purple-dark));color:#fff;border:none">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px">Fellowship Lead Dashboard</div>
          <div style="font-size:20px;font-weight:900">${S.user.fellowship} Members</div>
        </div>
        <span style="background:rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:900">Fellowship members</span>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Live Fellowship Stats</div>
      <div class="notice">Live fellowship metrics will appear as data sync completes.</div>
    </div>`;
}

function toEmbeddableMediaUrl(rawUrl){
  const url = (rawUrl || "").trim();
  if(!url) return "";
  if(url.includes("youtube.com/watch?v=")){
    const id = url.split("v=")[1]?.split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : url;
  }
  if(url.includes("youtu.be/")){
    const id = url.split("youtu.be/")[1]?.split("?")[0];
    return id ? `https://www.youtube.com/embed/${id}` : url;
  }
  if(url.includes("drive.google.com/file/d/")){
    const id = url.split("/file/d/")[1]?.split("/")[0];
    return id ? `https://drive.google.com/file/d/${id}/preview` : url;
  }
  return url;
}

function hydrateAdminMediaForm(){
  if(!S.adminMessageDay) return;
  const dayInput = el("media-day-input");
  const dayDateInput = el("day-scheduled-date-input");
  const dayLabelInput = el("day-label-input");
  const isActiveInput = el("day-is-active-input");
  const status = el("media-save-status");

  if(dayInput) dayInput.value = String(S.adminMessageDay.day_number || S.selectedDay || 1);
  if(dayDateInput) dayDateInput.value = S.adminMessageDay.scheduled_date || "";
  if(dayLabelInput) dayLabelInput.value = S.adminMessageDay.day_label || "";
  if(isActiveInput) isActiveInput.value = String(S.adminMessageDay.is_active !== false);
  if(status && S.mediaSaveStatus){
    status.textContent = S.mediaSaveStatus;
    status.style.display = "block";
  }
  renderAdminMessageItems();
}

async function onAdminDayChange(){
  const selectedDay = Number(v("media-day-input") || 1);
  if(!Number.isFinite(selectedDay) || selectedDay < 1){
    alert("Enter a valid day number.");
    return;
  }
  S.selectedDay = selectedDay;
  try {
    const data = await PCDL.loadMessageDayByNumber(selectedDay);
    if(!data){
      S.adminMessageDay = null;
      S.adminMessageItems = [];
      S.mediaSaveStatus = `Day ${selectedDay} not found.`;
      renderAdminMessageItems();
      return;
    }
    S.adminMessageDay = data.day;
    S.adminMessageItems = data.items || [];
    S.mediaSaveStatus = "";
    hydrateAdminMediaForm();
  } catch (err) {
    S.adminMessageDay = null;
    S.adminMessageItems = [];
    S.mediaSaveStatus = `Could not load day ${selectedDay}: ${err.message || "not found"}`;
    renderAdminMessageItems();
  }
}

function renderAdminMessageItems(){
  const wrap = el("admin-message-items");
  if(!wrap) return;
  if(!S.adminMessageItems?.length){
    wrap.innerHTML = `<div class="notice">No messages for this day yet.</div>`;
    return;
  }
  wrap.innerHTML = S.adminMessageItems.map((item, idx) => `
    <div class="card" style="margin-bottom:10px">
      <div class="card-title" style="font-size:14px">Message ${idx + 1}</div>
      <div style="display:grid;gap:10px">
        <div class="form-group"><label>Title</label><input id="item-title-${item.id}" value="${item.title || ""}" placeholder="Title" style="width:100%"></div>
        <div class="form-group">
          <label>Source type</label>
          <select id="item-source-${item.id}">
            <option value="direct_video" ${item.source_type==="direct_video"?"selected":""}>Direct MP4</option>
            <option value="direct_audio" ${item.source_type==="direct_audio"?"selected":""}>Direct MP3</option>
            <option value="google_drive" ${item.source_type==="google_drive"?"selected":""}>Google Drive</option>
            <option value="web_link" ${item.source_type==="web_link"||!item.source_type?"selected":""}>Web link</option>
          </select>
        </div>
        <div class="form-group"><label>PCDL Source Page</label><input id="item-pcdl-url-${item.id}" value="${item.pcdl_url || ""}" placeholder="https://pcdl.co/watch/..." style="width:100%"></div>
        <div class="form-group"><label>Playback URL</label><input id="item-temp-media-${item.id}" value="${item.temporary_media_url || ""}" placeholder="Direct playback URL" style="width:100%"></div>
        <div class="form-group"><label>Thumbnail URL</label><input id="item-thumb-${item.id}" value="${item.thumbnail_url || ""}" placeholder="https://..." style="width:100%"></div>
        <div class="form-group"><label>Admin notes</label><textarea id="item-notes-${item.id}" placeholder="Admin notes" style="width:100%;min-height:60px">${item.admin_notes || ""}</textarea></div>
        <div class="two-col">
          <label><input id="item-required-${item.id}" type="checkbox" ${item.is_required !== false ? "checked" : ""}> Required</label>
          <label><input id="item-active-${item.id}" type="checkbox" ${item.is_active !== false ? "checked" : ""}> Active</label>
        </div>
        <button class="btn btn-soft btn-full" onclick="saveMessageItem('${item.id}')">Save Message</button>
        <button class="btn btn-muted btn-full" onclick="deleteOrDeactivateMessageItem('${item.id}')">Deactivate Message</button>
      </div>
    </div>
  `).join("");
}

async function saveMessageDay(){
  if(!S.adminMessageDay?.id){ alert("No day loaded."); return; }
  try{
    await PCDL.saveMessageDay(S.adminMessageDay.id,{
      scheduled_date: v("day-scheduled-date-input"),
      day_label: v("day-label-input"),
      is_active: (v("day-is-active-input") || "true") === "true"
    });
    S.mediaSaveStatus = "Day saved.";
    await onAdminDayChange();
  }catch(err){
    S.mediaSaveStatus = `Save day failed: ${err.message || "unknown error"}`;
  }
  const status = el("media-save-status");
  if(status){ status.textContent = S.mediaSaveStatus; status.style.display = "block"; }
}

async function saveMessageItem(itemId){
  try{
    const tempUrl = v(`item-temp-media-${itemId}`);
    await PCDL.saveMessageItem(itemId,{
      title: v(`item-title-${itemId}`),
      source_type: v(`item-source-${itemId}`),
      temporary_media_url: tempUrl,
      pcdl_url: v(`item-pcdl-url-${itemId}`),
      thumbnail_url: v(`item-thumb-${itemId}`),
      admin_notes: v(`item-notes-${itemId}`),
      is_required: !!el(`item-required-${itemId}`)?.checked,
      is_active: !!el(`item-active-${itemId}`)?.checked,
      ...(tempUrl ? { media_status: "active" } : {})
    });
    S.mediaSaveStatus = "Saved";
    await onAdminDayChange();
  }catch(err){
    S.mediaSaveStatus = `Save message failed: ${err.message || "unknown error"}`;
  }
  const status = el("media-save-status");
  if(status){ status.textContent = S.mediaSaveStatus; status.style.display = "block"; }
}

async function addMessageItem(){
  if(!S.adminMessageDay?.id){ alert("Load a day first."); return; }
  try{
    await PCDL.addMessageItem(S.adminMessageDay.id);
    S.mediaSaveStatus = "Message added.";
    await onAdminDayChange();
  }catch(err){
    S.mediaSaveStatus = `Add message failed: ${err.message || "unknown error"}`;
  }
  const status = el("media-save-status");
  if(status){ status.textContent = S.mediaSaveStatus; status.style.display = "block"; }
}

async function deleteOrDeactivateMessageItem(itemId){
  try{
    await PCDL.deleteOrDeactivateMessageItem(itemId);
    S.mediaSaveStatus = "Message deactivated.";
    await onAdminDayChange();
  }catch(err){
    S.mediaSaveStatus = `Deactivate failed: ${err.message || "unknown error"}`;
  }
  const status = el("media-save-status");
  if(status){ status.textContent = S.mediaSaveStatus; status.style.display = "block"; }
}

async function loadAdminMediaOps(){
  const host = el("admin-media-ops-panel");
  if(!host) return;
  S.mediaOps.loading = true;
  host.innerHTML = `<div class="notice">Loading media refresh health...</div>`;
  try{
    const [health, runs, failures, warnings] = await Promise.all([
      PCDL.getMediaRefreshHealth(),
      PCDL.getMediaRefreshRuns(12),
      PCDL.getMediaRefreshFailures(40),
      PCDL.getMediaOpsWarnings()
    ]);
    S.mediaOps.health = health || null;
    S.mediaOps.runs = runs || [];
    S.mediaOps.lastRun = S.mediaOps.runs[0] || null;
    S.mediaOps.failures = failures || [];
    S.mediaOps.warnings = warnings || { expiringSoon: [], missingPcdl: [], repeatedFailures: [] };
  }catch(err){
    host.innerHTML = `<div class="notice">Could not load media operations: ${err.message || "unknown error"}</div>`;
    return;
  }finally{
    S.mediaOps.loading = false;
  }
  renderAdminMediaOpsPanel();
}

function renderAdminMediaOpsPanel(){
  const host = el("admin-media-ops-panel");
  if(!host) return;
  const ops = S.mediaOps || {};
  const health = ops.health || {};
  const last = ops.lastRun;
  const warnings = ops.warnings || { expiringSoon: [], missingPcdl: [], repeatedFailures: [] };
  const failures = ops.failures || [];

  host.innerHTML = `
    <div style="display:grid;gap:10px">
      <div class="notice">
        Last refresh: ${
          health?.last_refresh_completed_at
            ? new Date(health.last_refresh_completed_at).toLocaleString()
            : (last?.completed_at ? new Date(last.completed_at).toLocaleString() : "No completed runs yet")
        }
        <br>Status: ${health?.last_refresh_status || last?.run_type || "n/a"}
        <br>Started: ${health?.last_refresh_started_at ? new Date(health.last_refresh_started_at).toLocaleString() : "-"}
        <br>Processed: ${health?.last_refresh_processed_count ?? last?.processed_count ?? 0}
        <br>Updated: ${health?.last_refresh_updated_count ?? last?.updated_count ?? 0}
        | Failed: ${health?.last_refresh_failed_count ?? last?.failed_count ?? 0}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="notice">Active items: ${health?.total_active_items ?? "-"}</div>
        <div class="notice">Missing pcdl_url: ${health?.missing_pcdl_url_count ?? "-"}</div>
        <div class="notice">Expired temp links: ${health?.expired_temporary_url_count ?? "-"}</div>
        <div class="notice">Expiring <6h: ${health?.expiring_within_6_hours_count ?? "-"}</div>
        <div class="notice">Status fresh: ${health?.fresh_count ?? "-"}</div>
        <div class="notice">Status error: ${health?.error_count ?? "-"}</div>
        <div class="notice">Status not_found: ${health?.not_found_count ?? "-"}</div>
        <div class="notice">Repeated failures: ${health?.repeated_failure_count ?? "-"}</div>
      </div>
      <div style="font-size:12px;color:var(--muted)">
        Warnings:
        expiring<6h (${warnings.expiringSoon.length}),
        missing pcdl_url (${warnings.missingPcdl.length}),
        repeated failures (${warnings.repeatedFailures.length})
      </div>
      <div style="max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px;background:#FFFCF6">
        <div style="font-size:12px;font-weight:800;margin-bottom:6px">Recent runs</div>
        ${(ops.runs || []).slice(0,8).map(r => `
          <div style="font-size:11px;padding:6px 0;border-top:1px solid var(--line)">
            ${new Date(r.started_at).toLocaleString()} · ${r.run_type || "run"} · ${r.updated_count || 0}/${r.processed_count || 0}
          </div>
        `).join("") || `<div style="font-size:11px;color:var(--muted)">No runs yet.</div>`}
      </div>
      <div style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px;background:#FFFCF6">
        <div style="font-size:12px;font-weight:800;margin-bottom:6px">Failed refresh queue</div>
        ${failures.slice(0,10).map(f => `
          <div style="font-size:11px;padding:6px 0;border-top:1px solid var(--line)">
            <div><strong>${f.daily_message_items?.title || f.message_item_id}</strong></div>
            <div>${f.failure_type} · retry ${f.retry_count || 0} · ${new Date(f.occurred_at).toLocaleString()}</div>
            <div style="color:var(--muted)">${(f.error || "").slice(0,90)}</div>
            <button class="btn btn-soft" style="margin-top:6px" onclick="retryMediaFailure('${f.id}')">Retry</button>
          </div>
        `).join("") || `<div style="font-size:11px;color:var(--muted)">No failed items.</div>`}
      </div>
      <button class="btn btn-muted btn-full" onclick="loadAdminMediaOps()">Refresh Status Panel</button>
    </div>
  `;
}

async function retryMediaFailure(failureId){
  const row = (S.mediaOps.failures || []).find((f) => f.id === failureId);
  if(!row){ alert("Failure row not found."); return; }
  try{
    await PCDL.retryMediaRefreshFailure(row);
    await loadAdminMediaOps();
    alert("Item queued for retry.");
  }catch(err){
    alert(err.message || "Could not queue retry.");
  }
}

// ────────────────────────────────────────────
// UTILITIES
// ────────────────────────────────────────────

async function renderTodayMessageItems(){
  const host = el("today-message-items");
  const meta = el("today-day-meta");
  const targetSelect = el("today-reflection-target");
  if(!host) return;
  const today = new Date().toISOString().slice(0,10);

  function mediaType(url){
    const u = (url || "").toLowerCase();
    if(u.endsWith(".mp3") || u.endsWith(".m4a")) return "audio";
    return "video";
  }

  function renderPlayer(item){
    const raw = item.media_url || "";
    if(!raw) return `<div class="notice">No media URL configured.</div>`;
    const type = mediaType(raw);
    if(type === "audio"){
      return `<audio id="media-player-${item.id}" controls preload="metadata" style="width:100%"><source src="${raw}" type="audio/mpeg"></audio>`;
    }
    return `<video id="media-player-${item.id}" controls playsinline preload="metadata" style="width:100%;max-height:360px;border-radius:12px;background:#000"><source src="${raw}" type="video/mp4"></video>`;
  }

  try{
    let payload = await PCDL.loadMessageDayByDate(today);
    if(!payload){
      const old = await PCDL.getTodaysMessage();
      if(old){
        console.warn("[Legacy media fallback] Using daily_messages because no daily_message_days/items were found for today.");
        host.innerHTML = `
          <div class="card">
            <div class="card-title" style="font-size:15px">${old.title || "Message"}</div>
            ${renderPlayer({ id: old.id, media_url: old.media_url || old.video_url || old.audio_url || "" })}
            <div class="notice" id="watch-progress-${old.id}">0% watched</div>
            <span class="badge badge-amber" id="watch-badge-${old.id}">In progress</span>
            <button id="replay-btn-${old.id}" class="btn btn-muted btn-full" style="margin-top:8px;display:none" onclick="document.getElementById('media-player-${old.id}')?.play()">Replay</button>
            <button class="btn btn-purple btn-full" style="margin-top:10px" onclick="markLegacyMessageComplete('${old.id}')">Mark complete</button>
          </div>`;
        const mediaEl = el(`media-player-${old.id}`);
        if(mediaEl && window.PCDLMediaTracker?.attachMediaTracking){
          window.PCDLMediaTracker.attachMediaTracking(mediaEl, { messageItemId: old.id, isScheduledDay: true });
        }
        if(meta){ meta.style.display = "none"; }
        if(targetSelect){ targetSelect.innerHTML = `<option value="day">Whole day</option>`; }
        return;
      }
      host.innerHTML = `<div class="notice">No active messages scheduled for today.</div>`;
      if(meta){ meta.style.display = "none"; }
      return;
    }

    const day = payload.day;
    const items = (payload.items || []).filter((i)=>i.is_active !== false).sort((a,b)=>(a.item_order||0)-(b.item_order||0));
    S.todayMedia = { dayId: day.id, dayNumber: day.day_number, dayLabel: day.day_label, otherLabel: day.other_label, items };
    S.todayItemById = Object.fromEntries(items.map((i) => [i.id, i]));

    if(meta){
      const label = day.day_label || `Day ${day.day_number || ""}`;
      const other = day.other_label ? ` <span class="badge badge-purple">${day.other_label}</span>` : "";
      meta.innerHTML = `${label}${other}`;
      meta.style.display = "block";
    }

    const progressRows = await PCDL.getMyMessageProgressForDay(day.id);
    const byItem = new Map((progressRows || []).map((r)=>[r.message_item_id, r]));

    if(targetSelect){
      targetSelect.innerHTML = `<option value="day">Whole day</option>` + items.map((it, idx)=>`<option value="${it.id}">Message ${idx+1}: ${it.title || "Untitled"}</option>`).join("");
    }

    if(!items.length){
      host.innerHTML = `<div class="notice">No active messages for today.</div>`;
      return;
    }

    host.innerHTML = items.map((it, idx) => renderMessageItemCard({ ...it, item_order: idx + 1, _progress: byItem.get(it.id) || null })).join("");
    attachTrackers(items);
  }catch(err){
    host.innerHTML = `<div class="notice">Could not load today's messages: ${err.message || "unknown error"}</div>`;
  }
}

async function markMessageItemComplete(dayId, messageItemId){
  await manualCompleteMessage(messageItemId || dayId);
}

async function markLegacyMessageComplete(messageId) {
  try {
    await PCDL.markComplete(messageId, null);
    alert("Marked complete.");
  } catch (err) {
    alert(err.message || "Could not mark complete.");
  }
}

async function submitTodayReflection(){
  try{
    const text = el("today-reflection-text")?.value || "";
    const visibilityRaw = el("today-reflection-visibility")?.value || "Private";
    const visibility = visibilityRaw.toLowerCase().includes("everyone")
      ? "everyone"
      : visibilityRaw.toLowerCase().includes("fellowship")
      ? "fellowship"
      : visibilityRaw.toLowerCase().includes("circle")
      ? "circle"
      : "private";
    const target = el("today-reflection-target")?.value || "day";
    const dayId = S.todayMedia?.dayId || null;
    const messageItemId = target === "day" ? null : target;
    await PCDL.saveReflection(null, text, visibility, dayId, messageItemId);
    alert("Reflection saved.");
  }catch(err){
    alert(err.message || "Could not save reflection.");
  }
}
function go(id){S.page=id;render();window.scrollTo({top:0,behavior:'smooth'})}
function setAdminPage(id){S.adminPage=id;render()}
function circleMembers(){
  if(!S.user?.partners?.length) return [];
  const choices = [
    ...(S.circle.accountableTo || []).map((x) => x?.profile).filter(Boolean),
    ...(S.circle.accountableFrom || []).map((x) => x?.profile).filter(Boolean)
  ];
  const byId = new Map(
    choices.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.full_name || "User",
        fellowship: p.fellowship?.name || "No fellowship",
        role: normalizeRole(p.role || "Member"),
        ini: initials(p.full_name || "U")
      }
    ])
  );
  return S.user.partners.map(id=>byId.get(id)).filter(Boolean);
}
function el(id){return document.getElementById(id)}
function v(id){return el(id)?.value}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):''}
function initials(name){return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}

async function loadCircleData(){
  if(!S.user || S.circle.loading) return;
  S.circle.loading=true;
  S.circle.error="";
  if(S.page==='circle') render();
  try{
    const data = await PCDL.getMyAccountabilityCircle();
    S.circle.accountableTo = data?.accountableTo || [];
    S.circle.accountableFrom = data?.accountableFrom || [];
    S.circle.pending = data?.pending || [];
  }catch(err){
    S.circle.error = err.message || "Could not load accountability circle.";
  }finally{
    S.circle.loading=false;
    if(S.page==='circle') render();
  }
}

// Boot
render();


function normalizeRole(role) {
  const map = {
    member: "Member",
    bsc: "Bible Study Class Teacher",
    leader: "Cell Leader",
    coordinator: "Coordinator",
    pastor: "Pastor",
    subgroup_pastor: "Subgroup Pastor",
    group_pastor: "Group Pastor",
    admin: "Admin",
    "Bible Study Class Teacher": "Bible Study Class Teacher",
    "Cell Leader": "Cell Leader",
    "Coordinator": "Coordinator",
    "Pastor": "Pastor",
    "Subgroup Pastor": "Subgroup Pastor",
    "Group Pastor": "Group Pastor",
    "Admin": "Admin",
    "Member": "Member"
  };
  return map[role] || role || "Member";
}

function isAdminRole(role) {
  return normalizeRole(role) === "Admin";
}

function isGroupPastorRole(role) {
  return normalizeRole(role) === "Group Pastor";
}

function isSubgroupPastorRole(role) {
  return normalizeRole(role) === "Subgroup Pastor";
}

function isPastoralOversightRole(role) {
  const r = normalizeRole(role);
  return r === "Pastor" || r === "Group Pastor" || r === "Subgroup Pastor" || r === "Admin";
}

function isCoordinatorRole(role) {
  return normalizeRole(role) === "Coordinator";
}

function canAccessMemberExperience(role) {
  return !isGroupPastorRole(role);
}

function canSeeFellowshipStats(role) {
  const r = normalizeRole(role);
  return r === "Coordinator" || r === "Pastor" || r === "Subgroup Pastor" || r === "Admin";
}


// ---- Person Detail + Scoped Oversight ----
// Pastor = coordinator-like fellowship oversight.
// Coordinator/Pastor/Subgroup Pastor/Group Pastor can click allowed people and see:
// streak, progress, completed messages, and shared reflections/comments.

function canOpenPersonDetail(viewerRole) {
  const r = normalizeRole(viewerRole);
  return [
    "Coordinator",
    "Pastor",
    "Subgroup Pastor",
    "Group Pastor",
    "Admin"
  ].includes(r);
}

function personDetailAllowedScopeLabel(role) {
  const r = normalizeRole(role);
  if (r === "Group Pastor" || r === "Admin") return "all fellowships";
  if (r === "Subgroup Pastor") return "assigned subgroup fellowships";
  return "your fellowship";
}

async function loadPersonDetail(personId) {
  try {
    if (!canOpenPersonDetail(S.user?.role)) {
      alert("You do not have permission to open person details.");
      return;
    }

    // Real backend version:
    // This RPC should enforce scope in SQL, not just frontend.
    const { data, error } = await PCDL.supabase.rpc("get_person_oversight_detail", {
      p_person_id: personId
    });

    if (error) throw error;

    renderPersonDetailOverlay(data);
  } catch (err) {
    console.warn("Could not load person detail:", err.message);
    alert("Could not load person detail right now.");
  }
}

function renderMessageItemCard(item) {
  const playableUrl = getPlayableMediaUrl(item);
  const isVideo =
    item.source_type === "direct_video" ||
    playableUrl?.toLowerCase().includes(".mp4");

  const isAudio =
    item.source_type === "direct_audio" ||
    playableUrl?.toLowerCase().includes(".mp3") ||
    playableUrl?.toLowerCase().includes(".m4a");
  const playable = canPlayDirectMedia(item);
  const progressText = item._progress?.completed ? "Completed" : `${Math.round(Number(item._progress?.watch_percent || 0))}%`;
  const badgeClass = item._progress?.completed ? "badge badge-green" : "badge badge-purple";

  return `
    <div class="card message-item-card" data-item-id="${item.id}" style="margin-bottom:12px">
      <div class="card-title">
        Message ${item.item_order}: ${item.title}
        <span class="${badgeClass}" id="progress-${item.id}">${progressText}</span>
      </div>

      ${
        playable && isVideo
          ? `<video controls playsinline preload="metadata" width="100%" id="media-${item.id}">
              <source src="${playableUrl}" type="video/mp4">
            </video>`
          : playable && isAudio
          ? `<audio controls preload="metadata" id="media-${item.id}" style="width:100%">
              <source src="${playableUrl}" type="audio/mpeg">
            </audio>`
          : renderMediaFallback(item)
      }

      <button class="btn btn-purple btn-full" onclick="manualCompleteMessage('${item.id}')" style="margin-top:10px">
        Mark complete
      </button>
    </div>
  `;
}

function attachTrackers(items) {
  items.forEach(item => {
    if (!canPlayDirectMedia(item)) return;
    const el = document.getElementById(`media-${item.id}`);
    if (!el) return;

    PCDL.createMediaTracker({
      mediaElement: el,
      messageItemId: item.id,
      onProgress: ({ watchPercent, completed }) => {
        const badge = document.getElementById(`progress-${item.id}`);
        if (badge) {
          badge.textContent = completed
            ? "Completed"
            : `${Math.round(watchPercent)}%`;
          badge.className = completed
            ? "badge badge-green"
            : "badge badge-purple";
        }
      }
    });
    el.addEventListener("error", () => handleMediaError(item.id));
  });
}

function isMediaExpired(item) {
  const raw = item?.media_url_expires_at || item?.media_expires_at || null;
  if (!raw) return false;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return false;
  return ts <= Date.now();
}

function logMediaOpsEvent(messageItemId, eventType, meta = {}) {
  if(!messageItemId || !PCDL?.logMessageWatchEvent) return;
  PCDL.logMessageWatchEvent({
    message_item_id: messageItemId,
    event_type: eventType,
    watch_seconds: 0,
    watch_percent: 0,
    session_id: null,
    device_type: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop",
    ...meta
  }).catch(() => {});
}

function getPlayableMediaUrl(item) {
  const status = item?.media_status || "unknown";
  if (status !== "active") return "";

  const tempUrl = (item?.temporary_media_url || "").trim();
  if (tempUrl && !isMediaExpired(item)) return tempUrl;

  const directUrl = (item?.media_url || "").trim();
  return directUrl;
}

function canPlayDirectMedia(item) {
  return !!getPlayableMediaUrl(item);
}

function renderMediaFallback(item) {
  const fallbackUrl = item?.pcdl_url || item?.source_page_url || "";
  if (isMediaExpired(item)) {
    logMediaOpsEvent(item?.id, "expired_link_fallback");
  }
  if (fallbackUrl) {
    return `<div class="notice">
      This direct video link is unavailable or expired.
      <br><button class="btn btn-soft btn-full" onclick="openSourcePage('${item.id}','${fallbackUrl}')">Open PCDL Link</button>
    </div>`;
  }
  return `<div class="notice">Media has not been added yet.</div>`;
}

function handleMediaError(itemId) {
  const item = S.todayItemById?.[itemId];
  const card = document.querySelector(`.message-item-card[data-item-id="${itemId}"]`);
  if (!card || !item) return;
  logMediaOpsEvent(itemId, "playback_error");
  const mediaEl = card.querySelector(`#media-${itemId}`);
  if (!mediaEl) return;
  const holder = document.createElement("div");
  holder.innerHTML = renderMediaFallback(item);
  mediaEl.replaceWith(holder);
}

function mediaExpiryWarning(item) {
  const raw = item?.media_url_expires_at || item?.media_expires_at || null;
  if (!raw) return "No expiry set.";
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return "Invalid expiry timestamp.";
  const diff = ts - Date.now();
  if (diff <= 0) return "Direct link expired. Users will be sent to the PCDL source link.";
  if (diff <= 24 * 60 * 60 * 1000) return "Direct link expires soon. Consider refreshing it.";
  return "Direct link active.";
}

async function trackSourcePageOpen(itemId) {
  const session = await PCDL.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await PCDL.supabase.from("message_watch_events").insert({
    user_id: userId,
    message_item_id: itemId,
    event_type: "source_page_opened",
    watch_seconds: 0,
    watch_percent: 0
  });
  if (error) console.warn("Could not track source page open:", error.message);
}

async function openSourcePage(itemId, url) {
  try { await trackSourcePageOpen(itemId); } catch (_) {}
  logMediaOpsEvent(itemId, "fallback_used");
  window.open(url, "_blank");
}

async function manualCompleteMessage(messageItemId) {
  const { error } = await PCDL.supabase.rpc("sync_message_watch_progress", {
    p_message_item_id: messageItemId,
    p_event_type: "manual_complete",
    p_watch_seconds: 0,
    p_watch_percent: 100,
    p_session_id: crypto.randomUUID(),
    p_device_type: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
      ? "mobile"
      : "desktop"
  });

  if (error) {
    alert(error.message);
    return;
  }

  alert("Marked complete.");
}

function renderPersonDetailOverlay(detail) {
  const old = document.getElementById("person-detail-overlay");
  if (old) old.remove();

  const profile = detail.profile || {};
  const stats = detail.stats || {};
  const progress = detail.progress || [];
  const reflections = detail.shared_reflections || [];

  const overlay = document.createElement("div");
  overlay.id = "person-detail-overlay";
  overlay.className = "overlay-backdrop";
  overlay.innerHTML = `
    <div class="overlay-panel">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px">
        <div>
          <div style="font-size:18px;font-weight:900">${profile.full_name || "Person"}</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.5">
            ${profile.role || ""} · ${profile.fellowship || ""}<br>
            ${profile.email || ""}
          </div>
        </div>
        <button onclick="document.getElementById('person-detail-overlay').remove()" style="border:none;background:none;font-size:22px;cursor:pointer;color:var(--muted);line-height:1">×</button>
      </div>

      <div class="notice" style="margin-bottom:14px">
        You are viewing this person within ${personDetailAllowedScopeLabel(S.user?.role)}.
      </div>

      <div class="stats-grid" style="margin-bottom:14px">
        <div class="stat-card"><div class="stat-label">Streak</div><div class="stat-val">${stats.current_streak || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-val">${stats.completed_count || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Missed</div><div class="stat-val">${stats.missed_count || 0}</div></div>
      </div>

      <div class="card" style="padding:14px;margin-bottom:12px">
        <div class="card-title" style="font-size:15px">Progress</div>
        <table>
          <thead><tr><th>Day</th><th>Message</th><th>Status</th><th>Watch %</th><th>Plays</th><th>Points</th></tr></thead>
          <tbody>
            ${progress.map(p => `
              <tr>
                <td>${p.day_number}</td>
                <td>${p.title}</td>
                <td><span class="badge ${p.completed ? 'badge-green' : 'badge-red'}">${p.completed ? 'Done' : 'Missed'}</span></td>
                <td>${p.watch_percent ?? 0}</td>
                <td>${p.play_count ?? 0}</td>
                <td>${p.points_earned ?? 0}</td>
              </tr>`).join("") || `<tr><td colspan="6">No progress yet.</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card" style="padding:14px">
        <div class="card-title" style="font-size:15px">Shared comments / reflections</div>
        ${reflections.map(r => `
          <div class="member-row">
            <div class="avatar">💬</div>
            <div class="member-info">
              <div class="member-name"><span class="badge badge-purple">${r.visibility}</span></div>
              <div style="font-size:13px;line-height:1.6;margin-top:8px">${r.reflection_text}</div>
              <div class="member-sub" style="margin-top:6px">${(r.created_at || "").slice(0,10)}</div>
            </div>
          </div>`).join("") || `<div class="notice">No shared comments/reflections visible to you yet.</div>`}
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function clickablePersonRow(user, statusHtml = "") {
  const canClick = canOpenPersonDetail(S.user?.role);
  return `
    <div class="member-row" ${canClick ? `onclick="loadPersonDetail('${user.id}')" style="cursor:pointer"` : ""}>
      <div class="avatar">${user.ini || initials(user.name || user.full_name || "U")}</div>
      <div class="member-info">
        <div class="member-name">${user.name || user.full_name}</div>
        <div class="member-sub">${user.fellowship || ""} · ${cap(user.role || "")}${canClick ? " · Tap to view progress" : ""}</div>
      </div>
      ${statusHtml}
    </div>`;
}









