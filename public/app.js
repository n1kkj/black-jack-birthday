'use strict';
const app=document.querySelector('#app');
const toast=document.querySelector('#toast');
const state={boards:{},participants:[],finance:{},admin:null,transactions:[],accounts:[],board:'overall',liveUpdates:true,registrationEnabled:false,poll:null};
const types=[
  ['poker','♠ Покер','game'],['craps','⚄ Крэпс','game'],['blackjack','♣ Блэкджек','game'],
  ['roulette','◉ Рулетка','game'],['activities','✦ Активности','bonus'],
  ['credit','↔ Кредит / возврат','loan'],['adjustment','✎ Корректировка','adjustment']
];
const names={overall:'Общий рейтинг',poker:'Покер',craps:'Крэпс',blackjack:'Блэкджек',roulette:'Рулетка',activities:'Активности',credit:'Кредит',adjustment:'Корректировка'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('ru-RU');
const signed=n=>(Number(n)>0?'+':'')+fmt(n)+' $';
function initials(s){return esc(String(s||'?').split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase());}
function avatar(p,size=''){return '<span class="coin-face '+size+'">'+(p.avatar?'<img src="'+esc(p.avatar)+'" alt="">':initials(p.name))+'</span>';}
function announce(message,bad=false){toast.textContent=message;toast.className='toast show'+(bad?' error':'');clearTimeout(announce.timer);announce.timer=setTimeout(()=>toast.className='toast',3500);}
async function api(path,options={}){
  const resp=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});
  const data=await resp.json();
  if(!resp.ok)throw Error(data.error||'Ошибка запроса');
  return data;
}
const post=(url,payload)=>api(url,{method:'POST',body:JSON.stringify(payload)});
async function refresh(){
  const data=await api('/api/state');
  state.boards=data.boards||{};state.participants=data.participants||[];state.finance=data.finance||{};
  state.liveUpdates=data.liveUpdates!==false;state.registrationEnabled=!!data.registrationEnabled;
  const label=document.querySelector('.live-label');if(label)label.textContent=state.liveUpdates?'● LIVE':'Ⅱ PAUSED';
}
function header(title,caption){return '<div class="heading"><span class="eyebrow">THE BLACK 21 / CASINO NIGHT</span><h1>'+title+'</h1><p>'+caption+'</p></div>';}
function nav(){return '<nav class="board-nav" aria-label="Рейтинги">'+['overall','poker','craps','blackjack','roulette','activities'].map(k=>'<button type="button" data-board="'+k+'" class="'+(state.board===k?'active':'')+'">'+esc(names[k])+'</button>').join('')+'</nav>';}
function renderBoard(){
  const players=state.boards[state.board]||[];const isOverall=state.board==='overall';
  const leaders=players.slice(0,3);
  app.innerHTML='<section class="view">'+header(isOverall?'Короли казино':'Рейтинг: '+names[state.board],isOverall?'Общий капитал, победы, бонусы и долги — один честный итог.':'Рейтинг по чистому выигрышу или проигрышу в выбранной игре.')+
    '<div class="stat-strip"><div><small>В игре</small><strong>'+state.participants.length+' / 23</strong></div><div><small>Касса казино</small><strong class="'+(state.finance.bank<0?'negative':'')+'">'+fmt(state.finance.bank)+' $</strong></div><div><small>Резерв наград</small><strong>'+fmt(state.finance.reservedBonuses)+' $</strong></div></div>'+
    nav()+'<div class="podium">'+leaders.map((p,i)=>'<div class="winner rank-'+(i+1)+'"><span class="placement">'+(['I','II','III'][i])+' МЕСТО</span>'+avatar(p,'big')+'<strong>'+esc(p.name)+'</strong><span class="serial">'+esc(p.serial||'BLACK 21')+'</span><b class="'+(p.score<0?'negative':'')+'">'+(isOverall?fmt(p.score)+' $':signed(p.score))+'</b></div>').join('')+'</div>'+
    '<div class="table-card"><div class="table-head"><span>МЕСТО / ИГРОК</span><span>'+(isOverall?'КАПИТАЛ':'ЧИСТЫЙ РЕЗУЛЬТАТ')+'</span></div>'+
    (players.length?players.map(p=>'<div class="player-row"><span class="rank-number">'+String(p.rank).padStart(2,'0')+'</span>'+avatar(p)+
      '<span class="person-detail"><b>'+esc(p.name)+'</b><small>'+esc(p.serial||'Гость казино')+(isOverall?' · игры: '+signed(p.gameProfit):'')+'</small></span>'+
      '<strong class="'+(p.score<0?'negative':'')+'">'+(isOverall?fmt(p.score)+' $':signed(p.score))+'</strong></div>').join(''):'<div class="empty">Пока нет участников. Администратор добавит гостей перед началом игр.</div>')+'</div>'+
    '<p class="disclaimer">Казино использует условные деньги. Общий рейтинг = доступный капитал минус непогашенный игровой кредит. Значения обновляются автоматически.</p></section>';
  document.querySelectorAll('[data-board]').forEach(b=>b.onclick=()=>{state.board=b.dataset.board;renderBoard();});
}
function renderRegistration(){
  app.innerHTML='<section class="view small-view">'+header('Войти в семью','Регистрация участника по приглашению организатора.')+
    '<div class="panel">'+(state.registrationEnabled?'<form id="register"><label>Имя<input name="name" maxlength="60" required placeholder="Ваше имя"></label><label>Код приглашения<input name="code" required placeholder="Код от организатора"></label><label>Персональный серийный номер (необязательно)<input name="serial" maxlength="6" placeholder="BLK721"></label><button class="primary">Зарегистрироваться</button></form>':'<p class="muted">Саморегистрация сейчас закрыта. Обратись к организатору или администратору — он добавит тебя в список гостей.</p>')+'</div></section>';
  const form=document.querySelector('#register');if(form)form.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(form));try{await post('/api/register',b);await refresh();location.hash='#leaderboard';announce('Участник добавлен');}catch(err){announce(err.message,true);}};
}
function adminLogin(){
  app.innerHTML='<section class="view small-view">'+header('Доступ в казино','Вход только для организатора и назначенных администраторов.')+
    '<div class="panel"><form id="login"><label>Логин<input name="username" autocomplete="username" required></label><label>Пароль<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Войти в админку →</button></form><p class="muted">Первый администратор задаётся переменными окружения ADMIN_USERNAME и ADMIN_PASSWORD на сервере.</p></div></section>';
  document.querySelector('#login').onsubmit=async e=>{e.preventDefault();try{const d=await post('/api/admin/login',Object.fromEntries(new FormData(e.target)));state.admin=d.user;await loadAdmin();renderAdmin();announce('Вход выполнен');}catch(err){announce(err.message,true);}};
}
async function loadAdmin(){
  const [a,b]=await Promise.all([api('/api/admin/transactions'),state.admin?.role==='owner'?api('/api/admin/accounts'):Promise.resolve({accounts:[]})]);
  state.transactions=a.transactions;state.accounts=b.accounts;
}
const selector=()=>'<select class="select" name="playerId">'+
  '<option value="">Участник…</option>'+state.participants.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' ('+esc(p.serial||'—')+')</option>').join('')+'</select>';
function entryRow(){return '<div class="entry-row">'+selector()+'<input type="number" step="1" name="delta" required placeholder="+ выигрыш / − проигрыш" aria-label="Изменение фишек"><button class="tiny danger remove-entry" type="button" aria-label="Удалить строку">×</button></div>';}
function transactionList(){
  const people=new Map(state.participants.map(p=>[p.id,p.name]));
  if(!state.transactions.length)return '<p class="muted">Операций пока нет.</p>';
  return state.transactions.slice(0,80).map(t=>{
    const parts=t.entries.map(e=>esc(people.get(e.playerId)||'Удалённый игрок')+' '+signed(e.delta)).join(' · ');
    const cancelled=state.transactions.some(z=>z.reversalOf===t.id);
    const label=names[t.game]||t.game;
    return '<div class="audit-row"><div><b>'+esc(label)+'</b> <small>'+esc(new Date(t.createdAt).toLocaleString('ru-RU'))+' · '+esc(t.createdBy)+'</small></div><p>'+parts+'</p><small>'+esc(t.note||'Без примечания')+(t.reversalOf?' · ОТМЕНА':'')+'</small>'+
      ((!t.reversalOf&&!cancelled)?'<button class="text-button" data-reverse="'+esc(t.id)+'" type="button">Отменить запись</button>':'<span class="tag">'+(t.reversalOf?'Отмена':'Отменено')+'</span>')+'</div>';
  }).join('');
}
function staffPanel(){
  if(state.admin?.role!=='owner')return '';
  return '<div class="panel"><h2>Назначенные администраторы</h2><p class="muted">Добавляй отдельных сотрудников. У каждого — свой логин и пароль, а все операции сохраняют имя автора.</p>'+
    '<div class="accounts">'+state.accounts.map(u=>'<div><b>'+esc(u.username)+'</b> <small>'+esc(u.role)+'</small>'+(u.role!=='owner'?'<button class="text-button" data-revoke="'+esc(u.username)+'">Отозвать доступ</button>':'')+'</div>').join('')+'</div>'+
    '<form id="staff-form" class="form-grid"><label>Логин<input name="username" required minlength="3" maxlength="32" placeholder="dealer_1"></label><label>Новый пароль<input name="password" type="password" minlength="12" required placeholder="Не менее 12 символов"></label><button class="secondary">Добавить администратора</button></form></div>';
}
function renderAdmin(){
  if(!state.admin)return adminLogin();
  app.innerHTML='<section class="view">'+header('Пульт управления','Внесение итогов раздач, бонусов, кредитов и проверяемая история денег.')+
    '<div class="admin-bar"><span>Вы вошли как <b>'+esc(state.admin.username)+'</b> · '+esc(state.admin.role)+'</span><button id="logout" class="secondary small">Выйти</button></div>'+
    '<div class="stat-strip"><div><small>Капитал банка</small><strong class="'+(state.finance.bank<0?'negative':'')+'">'+fmt(state.finance.bank)+' $</strong></div><div><small>Не выдано наград</small><strong>'+fmt(state.finance.reservedBonuses)+' $</strong></div><div><small>Выдано кредитов</small><strong>'+fmt(state.finance.activeCredit)+' $</strong></div></div>'+
    (state.finance.bank<0||state.finance.unbacked>0?'<div class="warning">Внимание: банк в минусе или обязательства превышают номинал запасов. Сверьте физические фишки и задолженности.</div>':'')+
    '<div class="admin-columns"><div class="stack">'+
    '<div class="panel"><h2>Внести результат</h2><p class="muted">Для покера укажи результаты всех участников раздачи или блока. Их сумма обязана равняться 0. Для остальных игр допускаются отдельные результаты.</p>'+
    '<form id="record-form"><label>Игра или операция<select name="game" id="record-game">'+types.map(t=>'<option value="'+t[0]+'">'+esc(t[1])+'</option>').join('')+'</select></label>'+
    '<div id="entry-rows">'+entryRow()+entryRow()+'</div><button class="secondary small" id="add-entry" type="button">+ Добавить игрока</button>'+
    '<label>Номер раунда / комментарий<input name="note" maxlength="240" placeholder="Стол 2, раунд 5"></label>'+
    '<div id="record-total" class="total-box">Сумма изменений: 0 $</div><button class="primary" type="submit">Сохранить результаты</button></form></div>'+
    '<div class="panel"><h2>Участники</h2><p class="muted">Можно добавить гостя вручную или вставить список «Имя; серийный номер» по строкам. Максимум 23 человека.</p>'+
    '<form id="guest-form" class="form-grid"><label>Имя<input name="name" required></label><label>Серийный номер<input name="serial" maxlength="6" placeholder="BLK721"></label><button class="secondary">Добавить гостя</button></form>'+
    '<form id="bulk-form"><label>Массовый импорт<textarea name="text" rows="3" placeholder="Рома; BLK721&#10;Сеня; MFX309"></textarea></label><button class="secondary" type="submit">Импортировать</button></form>'+
    '<p class="muted">Все участники: '+state.participants.length+' / 23</p></div>'+staffPanel()+'</div>'+
    '<div class="panel audit"><div class="flex-heading"><h2>Журнал операций</h2><button id="reload" class="secondary small">Обновить</button></div>'+transactionList()+'</div></div></section>';
  bindAdmin();
}
function bindAdmin(){
  document.querySelector('#logout').onclick=async()=>{try{await post('/api/admin/logout',{});}catch{}state.admin=null;renderAdmin();};
  const rows=document.querySelector('#entry-rows'),form=document.querySelector('#record-form'),game=document.querySelector('#record-game');
  const total=()=>{const sum=[...rows.querySelectorAll('input[name=delta]')].reduce((n,input)=>n+(Number(input.value)||0),0);document.querySelector('#record-total').textContent='Сумма изменений: '+signed(sum)+(game.value==='poker'&&sum!==0?' · покер не сбалансирован':'');};
  function wire(){rows.querySelectorAll('.remove-entry').forEach(b=>b.onclick=()=>{if(rows.children.length>1)b.parentElement.remove();total();});rows.querySelectorAll('input').forEach(i=>i.oninput=total);total();}
  document.querySelector('#add-entry').onclick=()=>{if(rows.children.length>=23)return announce('Не более 23 участников',true);rows.insertAdjacentHTML('beforeend',entryRow());wire();};
  game.onchange=()=>{total();};wire();
  form.onsubmit=async e=>{
    e.preventDefault();const kind=(types.find(x=>x[0]===game.value)||types[0])[2];
    const entries=[...rows.children].map(r=>({playerId:r.querySelector('select').value,delta:Number(r.querySelector('input').value)})).filter(e=>e.playerId);
    if(!entries.length)return announce('Выбери участников',true);
    const note=form.querySelector('[name=note]').value;
    if(kind==='game'&&game.value==='poker'&&entries.reduce((a,x)=>a+x.delta,0)!==0)return announce('В покере сумма должна быть нулевой',true);
    try{await post('/api/admin/transactions',{kind,game:game.value,entries,note});await refresh();await loadAdmin();renderAdmin();announce('Операция записана');}
    catch(error){announce(error.message,true);}
  };
  document.querySelector('#guest-form').onsubmit=async e=>{e.preventDefault();try{await post('/api/admin/participants',Object.fromEntries(new FormData(e.target)));await refresh();renderAdmin();announce('Гость добавлен');}catch(err){announce(err.message,true);}};
  document.querySelector('#bulk-form').onsubmit=async e=>{e.preventDefault();try{const d=await post('/api/admin/participants/bulk',Object.fromEntries(new FormData(e.target)));await refresh();renderAdmin();announce('Импортировано: '+d.count);}catch(err){announce(err.message,true);}};
  document.querySelector('#reload').onclick=async()=>{await refresh();await loadAdmin();renderAdmin();};
  document.querySelectorAll('[data-reverse]').forEach(b=>b.onclick=async()=>{if(!confirm('Создать обратную проводку? Исходная запись останется в истории.'))return;try{await post('/api/admin/transactions/reverse',{id:b.dataset.reverse});await refresh();await loadAdmin();renderAdmin();announce('Операция отменена');}catch(err){announce(err.message,true);}});
  const sf=document.querySelector('#staff-form');
  if(sf)sf.onsubmit=async e=>{e.preventDefault();try{await post('/api/admin/accounts',Object.fromEntries(new FormData(sf)));await loadAdmin();renderAdmin();announce('Администратор назначен');}catch(err){announce(err.message,true);}};
  document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{if(!confirm('Отозвать доступ '+b.dataset.revoke+'?'))return;try{await post('/api/admin/accounts/revoke',{username:b.dataset.revoke});await loadAdmin();renderAdmin();announce('Доступ отозван');}catch(err){announce(err.message,true);}});
}
async function render(){
  try{await refresh();}catch(err){app.innerHTML='<p class="empty">Нет связи с сервером. '+esc(err.message)+'</p>';return;}
  if(location.hash==='#admin'){
    try{const a=await api('/api/admin/me');state.admin=a.user;await loadAdmin();}catch{state.admin=null;}
    renderAdmin();
  }else if(location.hash==='#register')renderRegistration();
  else renderBoard();
}
let lastSignature='';
async function tick(){
  try{
    const r=await api('/api/state');
    const sig=JSON.stringify([r.updatedAt,r.boards?.overall?.length,r.liveUpdates]);
    if(r.liveUpdates&&sig!==lastSignature&&location.hash!=='#admin'){state.boards=r.boards;state.participants=r.participants;state.finance=r.finance;renderBoard();}
    lastSignature=sig;
    const label=document.querySelector('.live-label');if(label)label.textContent=r.liveUpdates?'● LIVE':'Ⅱ PAUSED';
  }catch{}finally{state.poll=setTimeout(tick,2500);}
}
window.addEventListener('hashchange',render);
render().then(()=>tick());
