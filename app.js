const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = window.APP_CONFIG;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  user: null, transactions: [], categories: [], theme: localStorage.getItem('minty-theme') || 'lavender',
  periodMode: 'month', periodDate: new Date(), calendarDate: new Date(), transactionType: 'expense', chart: null, authMode: 'signin'
};

const $ = (id) => document.getElementById(id);
const els = {
  authScreen:$('authScreen'), app:$('app'), authForm:$('authForm'), authEmail:$('authEmail'), authPassword:$('authPassword'), authSubmit:$('authSubmit'), authHint:$('authHint'),
  viewTitle:$('viewTitle'), balanceStat:$('balanceStat'), incomeStat:$('incomeStat'), expenseStat:$('expenseStat'), countStat:$('countStat'), expenseTotalPill:$('expenseTotalPill'),
  recentTransactions:$('recentTransactions'), allTransactions:$('allTransactions'), transactionDialog:$('transactionDialog'), transactionForm:$('transactionForm'), transactionId:$('transactionId'),
  transactionAmount:$('transactionAmount'), transactionDate:$('transactionDate'), transactionTime:$('transactionTime'), transactionCategory:$('transactionCategory'), transactionNote:$('transactionNote'),
  deleteTransactionButton:$('deleteTransactionButton'), periodLabel:$('periodLabel'), categoryList:$('categoryList'), categoryForm:$('categoryForm'), categoryName:$('categoryName'), categoryType:$('categoryType'), categoryColor:$('categoryColor'),
  calendarTitle:$('calendarTitle'), calendarGrid:$('calendarGrid'), themeDialog:$('themeDialog'), searchTransactions:$('searchTransactions'), transactionTypeFilter:$('transactionTypeFilter'),
  transactionCategoryField:$('transactionCategoryField')
};

function money(n){ return new Intl.NumberFormat('en-TH',{style:'currency',currency:'THB'}).format(Number(n||0)); }
function localDateInput(d=new Date()){ const z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
function localTimeInput(d=new Date()){ return d.toTimeString().slice(0,5); }
function toast(message){ const t=$('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),2600); }
function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function categoryById(id){ return state.categories.find(c=>c.id===id); }
function colorWithAlpha(hex, alpha=.16){ if(!/^#[0-9a-f]{6}$/i.test(hex)) return 'var(--surface-2)'; const n=parseInt(hex.slice(1),16); return `rgba(${n>>16},${n>>8&255},${n&255},${alpha})`; }

function applyTheme(theme){ state.theme=theme; document.documentElement.dataset.theme=theme; localStorage.setItem('minty-theme',theme); document.querySelectorAll('.theme-option').forEach(x=>x.classList.toggle('active',x.dataset.theme===theme)); if(state.chart) renderOverview(); }
applyTheme(state.theme);

async function init(){
  bindEvents();
  const {data:{session}}=await db.auth.getSession();
  if(session?.user) await enterApp(session.user); else showAuth();
  db.auth.onAuthStateChange(async (_event,session)=>{ if(session?.user && state.user?.id!==session.user.id) await enterApp(session.user); if(!session) showAuth(); });
}

function bindEvents(){
  document.querySelectorAll('.auth-tab').forEach(b=>b.onclick=()=>{ state.authMode=b.dataset.authMode; document.querySelectorAll('.auth-tab').forEach(x=>x.classList.toggle('active',x===b)); els.authSubmit.textContent=state.authMode==='signin'?'Sign in':'Create account'; els.authHint.textContent=state.authMode==='signin'?'Sign in to open your private money workspace.':'Create an account. Depending on your Supabase email settings, you may need to confirm your email.'; });
  els.authForm.onsubmit=handleAuth;
  $('signOutButton').onclick=()=>db.auth.signOut();
  $('addTransactionButton').onclick=()=>openTransactionDialog();
  $('closeTransactionDialog').onclick=closeTransactionDialog; $('cancelTransactionButton').onclick=closeTransactionDialog;
  $('deleteTransactionButton').onclick=deleteCurrentTransaction; els.transactionForm.onsubmit=saveTransaction;
  document.querySelectorAll('#transactionTypeToggle button').forEach(b=>b.onclick=()=>setTransactionType(b.dataset.type));
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>switchView(b.dataset.jump));
  document.querySelectorAll('#periodMode button').forEach(b=>b.onclick=()=>{ state.periodMode=b.dataset.period; document.querySelectorAll('#periodMode button').forEach(x=>x.classList.toggle('active',x===b)); state.periodDate=new Date(); renderOverview(); });
  $('periodPrev').onclick=()=>movePeriod(-1); $('periodNext').onclick=()=>movePeriod(1);
  $('calPrev').onclick=()=>{state.calendarDate.setMonth(state.calendarDate.getMonth()-1);renderCalendar()}; $('calNext').onclick=()=>{state.calendarDate.setMonth(state.calendarDate.getMonth()+1);renderCalendar()};
  els.categoryForm.onsubmit=saveCategory; els.searchTransactions.oninput=renderAllTransactions; els.transactionTypeFilter.onchange=renderAllTransactions;
  $('themeButton').onclick=()=>els.themeDialog.showModal(); $('closeThemeDialog').onclick=()=>els.themeDialog.close();
  document.querySelectorAll('.theme-option').forEach(b=>b.onclick=async()=>{applyTheme(b.dataset.theme); await savePreference();});
  $('mobileMenuButton').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
}

async function handleAuth(e){
  e.preventDefault(); els.authSubmit.disabled=true;
  const email=els.authEmail.value.trim(), password=els.authPassword.value;
  const result = state.authMode==='signin' ? await db.auth.signInWithPassword({email,password}) : await db.auth.signUp({email,password});
  els.authSubmit.disabled=false;
  if(result.error) return toast(result.error.message);
  if(state.authMode==='signup' && !result.data.session) toast('Account created. Check your email to confirm it.');
}

function showAuth(){ state.user=null; els.app.classList.add('hidden'); els.authScreen.classList.remove('hidden'); }
async function enterApp(user){
  state.user=user; els.authScreen.classList.add('hidden'); els.app.classList.remove('hidden'); $('userEmail').textContent=user.email||'User'; $('avatar').textContent=(user.email||'U')[0].toUpperCase();
  await ensureStarterData(); await loadData(); await loadPreference(); renderEverything();
}

async function ensureStarterData(){
  const {data:cats}=await db.from('categories').select('id').limit(1);
  if(cats?.length) return;
  const defaults=[['Food','expense','#f59e8b'],['Transport','expense','#6baed6'],['Shopping','expense','#b994e7'],['Bills','expense','#f1c75b'],['Health','expense','#65c3a5'],['Entertainment','expense','#eb83a9'],['Education','expense','#7d9ee6'],['Other','expense','#a8a8b3'],['Salary','income','#4caf7a'],['Freelance','income','#5cb8a9'],['Gift','income','#a58ce3'],['Other','income','#7bb68a']];
  await db.from('categories').insert(defaults.map(([name,type,color])=>({user_id:state.user.id,name,type,color,is_default:true})));
}

async function loadData(){
  const [{data:cats,error:ce},{data:tx,error:te}] = await Promise.all([
    db.from('categories').select('*').order('type').order('name'),
    db.from('transactions').select('*').order('occurred_at',{ascending:false})
  ]);
  if(ce||te) toast((ce||te).message); state.categories=cats||[]; state.transactions=tx||[];
}
async function loadPreference(){ const {data}=await db.from('preferences').select('*').maybeSingle(); if(data?.theme) applyTheme(data.theme); }
async function savePreference(){ if(!state.user)return; await db.from('preferences').upsert({user_id:state.user.id,theme:state.theme,currency:'THB',updated_at:new Date().toISOString()}); }

function renderEverything(){ renderOverview(); renderAllTransactions(); renderCalendar(); renderCategories(); populateCategorySelect(); }
function periodBounds(){
  const d=new Date(state.periodDate); let start,end;
  if(state.periodMode==='day'){ start=new Date(d.getFullYear(),d.getMonth(),d.getDate()); end=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1); els.periodLabel.textContent=d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }
  if(state.periodMode==='month'){ start=new Date(d.getFullYear(),d.getMonth(),1); end=new Date(d.getFullYear(),d.getMonth()+1,1); els.periodLabel.textContent=d.toLocaleDateString('en-GB',{month:'long',year:'numeric'}); }
  if(state.periodMode==='year'){ start=new Date(d.getFullYear(),0,1); end=new Date(d.getFullYear()+1,0,1); els.periodLabel.textContent=String(d.getFullYear()); }
  return {start,end};
}
function movePeriod(dir){ if(state.periodMode==='day')state.periodDate.setDate(state.periodDate.getDate()+dir); if(state.periodMode==='month')state.periodDate.setMonth(state.periodDate.getMonth()+dir); if(state.periodMode==='year')state.periodDate.setFullYear(state.periodDate.getFullYear()+dir); renderOverview(); }

function renderOverview(){
  const {start,end}=periodBounds(); const tx=state.transactions.filter(t=>{const d=new Date(t.occurred_at);return d>=start&&d<end});
  const income=tx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0); const expense=tx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  els.balanceStat.textContent=money(income-expense); els.incomeStat.textContent=money(income); els.expenseStat.textContent=money(expense); els.countStat.textContent=tx.length; els.expenseTotalPill.textContent=money(expense);
  renderChart(tx.filter(t=>t.type==='expense')); renderTransactionList(els.recentTransactions,tx.slice(0,6),'No transactions in this period yet.');
}
function renderChart(expenses){
  const sums={}; expenses.forEach(t=>{const c=categoryById(t.category_id); const key=c?.name||'Uncategorized'; sums[key]=(sums[key]||0)+Number(t.amount)}); const labels=Object.keys(sums); const values=Object.values(sums);
  $('chartEmpty').classList.toggle('hidden',labels.length>0); document.querySelector('.chart-wrap').classList.toggle('hidden',labels.length===0); if(state.chart)state.chart.destroy(); if(!labels.length){state.chart=null;return}
  const colors=labels.map(l=>state.categories.find(c=>c.name===l)?.color||'#999');
  state.chart=new Chart($('expenseChart'),{type:'doughnut',data:{labels,datasets:[{data:values,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',padding:16,color:getComputedStyle(document.documentElement).getPropertyValue('--muted')}}}}});
}
function renderTransactionList(container,list,empty='No transactions yet.'){
  if(!list.length){container.innerHTML=`<div class="empty-state">${escapeHtml(empty)}</div>`;return}
  container.innerHTML=list.map(t=>{const c=categoryById(t.category_id);const dt=new Date(t.occurred_at);const isTransfer=t.type==='transfer';const icon=t.type==='income'?'↗':isTransfer?'⇄':'↘';const label=isTransfer?'Transfer':(c?.name||'Uncategorized');const sign=t.type==='income'?'+':isTransfer?'':'−';return `<div class="transaction-row" data-tx="${t.id}"><div class="category-dot" style="background:${isTransfer?'var(--surface-2)':colorWithAlpha(c?.color||'#999')};color:${isTransfer?'var(--muted)':(c?.color||'#777')}">${icon}</div><div class="transaction-main"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(t.note||'No note')} · ${dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} ${dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div><div class="transaction-amount ${t.type}">${sign}${money(t.amount)}</div></div>`}).join('');
  container.querySelectorAll('[data-tx]').forEach(r=>r.onclick=()=>openTransactionDialog(state.transactions.find(t=>t.id===r.dataset.tx)));
}
function renderAllTransactions(){ let list=[...state.transactions]; const q=els.searchTransactions.value.trim().toLowerCase(),type=els.transactionTypeFilter.value; if(type!=='all')list=list.filter(t=>t.type===type); if(q)list=list.filter(t=>{const c=categoryById(t.category_id);return (t.note||'').toLowerCase().includes(q)||(c?.name||'').toLowerCase().includes(q)}); renderTransactionList(els.allTransactions,list,'No matching transactions.'); }

function switchView(view){ document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view')); $(`${view}View`).classList.add('active-view'); document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); els.viewTitle.textContent=view[0].toUpperCase()+view.slice(1); document.querySelector('.sidebar').classList.remove('open'); if(view==='calendar')renderCalendar(); }
function setTransactionType(type){ state.transactionType=type; document.querySelectorAll('#transactionTypeToggle button').forEach(b=>b.classList.toggle('active',b.dataset.type===type)); const isTransfer=type==='transfer'; els.transactionCategoryField.classList.toggle('hidden',isTransfer); els.transactionCategory.required=!isTransfer; if(!isTransfer)populateCategorySelect(); }
function populateCategorySelect(selectedId=''){ const cats=state.categories.filter(c=>c.type===state.transactionType); els.transactionCategory.innerHTML=cats.map(c=>`<option value="${c.id}" ${c.id===selectedId?'selected':''}>${escapeHtml(c.name)}</option>`).join(''); if(!cats.length)els.transactionCategory.innerHTML='<option value="">Create a category first</option>'; }
function openTransactionDialog(tx=null){ els.transactionForm.reset(); const now=new Date(); els.transactionId.value=tx?.id||''; els.transactionAmount.value=tx?.amount||''; els.transactionDate.value=tx?localDateInput(new Date(tx.occurred_at)):localDateInput(now); els.transactionTime.value=tx?localTimeInput(new Date(tx.occurred_at)):localTimeInput(now); els.transactionNote.value=tx?.note||''; setTransactionType(tx?.type||'expense'); if(tx&&tx.type!=='transfer')populateCategorySelect(tx.category_id); $('transactionModalTitle').textContent=tx?'Edit transaction':'Add transaction'; els.deleteTransactionButton.classList.toggle('hidden',!tx); els.transactionDialog.showModal(); }
function closeTransactionDialog(){els.transactionDialog.close()}
async function saveTransaction(e){ e.preventDefault(); const id=els.transactionId.value; const occurred=new Date(`${els.transactionDate.value}T${els.transactionTime.value}`); const payload={user_id:state.user.id,type:state.transactionType,amount:Number(els.transactionAmount.value),category_id:state.transactionType==='transfer'?null:(els.transactionCategory.value||null),note:els.transactionNote.value.trim()||null,occurred_at:occurred.toISOString(),updated_at:new Date().toISOString()}; const res=id?await db.from('transactions').update(payload).eq('id',id):await db.from('transactions').insert(payload); if(res.error)return toast(res.error.message); closeTransactionDialog(); await loadData(); renderEverything(); toast(id?'Transaction updated.':'Transaction added.'); }
async function deleteCurrentTransaction(){ const id=els.transactionId.value;if(!id)return; const {error}=await db.from('transactions').delete().eq('id',id);if(error)return toast(error.message);closeTransactionDialog();await loadData();renderEverything();toast('Transaction deleted.'); }

function renderCategories(){ if(!state.categories.length){els.categoryList.innerHTML='<div class="empty-state">No categories yet.</div>';return} els.categoryList.innerHTML=state.categories.map(c=>`<div class="category-item"><span class="dot" style="background:${c.color}"></span><div><strong>${escapeHtml(c.name)}</strong><small>${c.type}</small></div><button title="Delete category" data-cat-delete="${c.id}">×</button></div>`).join(''); els.categoryList.querySelectorAll('[data-cat-delete]').forEach(b=>b.onclick=()=>deleteCategory(b.dataset.catDelete)); }
async function saveCategory(e){ e.preventDefault(); const payload={user_id:state.user.id,name:els.categoryName.value.trim(),type:els.categoryType.value,color:els.categoryColor.value,is_default:false}; const {error}=await db.from('categories').insert(payload); if(error)return toast(error.code==='23505'?'That category already exists.':error.message); els.categoryForm.reset(); els.categoryColor.value='#a78bfa'; await loadData(); renderEverything(); toast('Category added.'); }
async function deleteCategory(id){ const c=categoryById(id); const used=state.transactions.some(t=>t.category_id===id); if(used&&!confirm(`“${c.name}” is used by transactions. Deleting it will leave those transactions uncategorized. Continue?`))return; const {error}=await db.from('categories').delete().eq('id',id); if(error)return toast(error.message); await loadData();renderEverything();toast('Category deleted.'); }

function renderCalendar(){
  const y=state.calendarDate.getFullYear(),m=state.calendarDate.getMonth(); els.calendarTitle.textContent=new Date(y,m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}); const first=new Date(y,m,1), start=new Date(y,m,1-first.getDay()); const today=localDateInput(new Date()); let html='';
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=localDateInput(d);const dayTx=state.transactions.filter(t=>localDateInput(new Date(t.occurred_at))===key);const inc=dayTx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0),exp=dayTx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0),xfer=dayTx.filter(t=>t.type==='transfer').reduce((s,t)=>s+Number(t.amount),0);html+=`<button class="calendar-day ${d.getMonth()!==m?'other':''} ${key===today?'today':''}" data-date="${key}"><div class="day-num">${d.getDate()}</div><div class="day-sums">${inc?`<span class="day-sum income">+${money(inc)}</span>`:''}${exp?`<span class="day-sum expense">−${money(exp)}</span>`:''}${xfer?`<span class="day-sum transfer">⇄${money(xfer)}</span>`:''}</div></button>`}
  els.calendarGrid.innerHTML=html; els.calendarGrid.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{const d=new Date(`${b.dataset.date}T12:00:00`);openTransactionDialog();els.transactionDate.value=localDateInput(d)});
}

init();
