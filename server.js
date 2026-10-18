'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {URL}=require('url');
const economy=require('./lib/economy');
const PORT=Number(process.env.PORT)||4173;
const ROOT=__dirname;
const DATA=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(ROOT,'data');
const UPLOADS=path.join(ROOT,'uploads');
const PUBLIC=path.join(ROOT,'public');
const participantsFile=path.join(DATA,'participants.json');
const transactionsFile=path.join(DATA,'transactions.json');
const adminsFile=path.join(DATA,'admins.json');
const sessions=new Map();
const failedLogins=new Map();

function safeJson(file,fallback) { try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;} }
function writeJson(file,data) {
  const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');
  fs.renameSync(tmp,file);
}
function hashPassword(password,salt) {return crypto.scryptSync(password,salt,64).toString('hex');}
function initialize(){
  fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(UPLOADS,{recursive:true});
  if(!fs.existsSync(participantsFile))writeJson(participantsFile,{participants:[],liveUpdates:true});
  if(!fs.existsSync(transactionsFile))writeJson(transactionsFile,{transactions:[]});
  if(!fs.existsSync(adminsFile)||!safeJson(adminsFile,{users:[]}).users?.length){
    const user=String(process.env.ADMIN_USERNAME||'owner').trim();
    const pass=String(process.env.ADMIN_PASSWORD||'');
    if(pass.length>=12){
      const salt=crypto.randomBytes(24).toString('hex');
      writeJson(adminsFile,{users:[{username:user,role:'owner',salt,hash:hashPassword(pass,salt),createdAt:new Date().toISOString()}]});
    } else {
      writeJson(adminsFile,{users:[]});
      console.warn('Администратор не настроен. Установите ADMIN_USERNAME и ADMIN_PASSWORD (минимум 12 символов) перед первым запуском.');
    }
  }
}
function getData(){
  const old=safeJson(participantsFile,{participants:[],liveUpdates:true});
  const ledger=safeJson(transactionsFile,{transactions:[]});
  return {participants:Array.isArray(old.participants)?old.participants:[],transactions:Array.isArray(ledger.transactions)?ledger.transactions:[],liveUpdates:old.liveUpdates!==false};
}
function saveData(data){
  writeJson(participantsFile,{participants:data.participants,liveUpdates:data.liveUpdates});
  writeJson(transactionsFile,{transactions:data.transactions});
}
function send(res,status,payload,headers={}){
  const body=JSON.stringify(payload);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});
  res.end(body);
}
function parseBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];let count=0;
    req.on('data',chunk=>{count+=chunk.length;if(count>2_000_000){reject(Error('Превышен размер запроса'));req.destroy();}else chunks.push(chunk);});
    req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'));}catch{reject(Error('Неверный JSON'));}});
    req.on('error',reject);
  });
}
function cookie(req){
  const found=String(req.headers.cookie||'').match(/(?:^|;\s*)casino_sid=([a-f0-9]{64})(?:;|$)/);
  return found?found[1]:null;
}
function currentAdmin(req){
  const raw=cookie(req);if(!raw)return null;
  const key=crypto.createHash('sha256').update(raw).digest('hex');
  const session=sessions.get(key);
  if(!session)return null;
  if(session.expires<Date.now()){sessions.delete(key);return null;}
  const user=safeJson(adminsFile,{users:[]}).users.find(u=>u.username===session.username);
  if(!user){sessions.delete(key);return null;}
  return {username:user.username,role:user.role};
}
function setSession(res,user){
  const raw=crypto.randomBytes(32).toString('hex');
  sessions.set(crypto.createHash('sha256').update(raw).digest('hex'),{username:user.username,expires:Date.now()+12*60*60*1000});
  const secure=process.env.COOKIE_SECURE==='1'?'; Secure':'';
  return 'casino_sid='+raw+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+secure;
}
function hasValidOrigin(req){
  if(!req.headers.origin)return true;
  try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}
}
function nameClean(value){return String(value||'').trim().replace(/\s+/g,' ').slice(0,60);}
function serialClean(value){return String(value||'').trim().toUpperCase().slice(0,6);}
function emojiClean(value){return Array.from(String(value||'♠')).slice(0,2).join('')||'♠';}
function publicPlayer(p){
  const {id,name,avatar,emoji,serial,starting,wallet,netWorth,gameProfit,games,bonus,adjustment,debt,rank,score}=p;
  return {id,name,avatar,emoji,serial,starting,wallet,netWorth,gameProfit,games,bonus,adjustment,debt,rank,score};
}
function publicData(){
  const data=getData(),base=economy.calculate(data.participants,data.transactions);
  const boards={};
  for(const game of ['overall',...economy.GAME_KEYS,'activities'])boards[game]=economy.sorted(base,game).map(publicPlayer);
  return {boards,participants:boards.overall,liveUpdates:data.liveUpdates,registrationEnabled:!!process.env.REGISTRATION_CODE,
    finance:{bank:base.bank,reservedBonuses:base.outstandingReserve,activeCredit:base.activeCredit,physicalTotal:base.physicalTotal,unbacked:base.unbacked},
    updatedAt:data.transactions.length?data.transactions[data.transactions.length-1].createdAt:null,
    games:economy.LABELS};
}
function ensureParticipant(data,body){
  const name=nameClean(body.name);const serial=serialClean(body.serial);
  if(!name)throw Error('Введите имя участника');
  if(data.participants.filter(p=>!p.archived).length>=economy.MAX_GUESTS)throw Error('Все 23 места уже заняты');
  if(data.participants.some(p=>!p.archived&&p.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))throw Error('Участник с таким именем уже есть');
  if(serial&&(!/^[A-Z0-9]{6}$/.test(serial)||data.participants.some(p=>p.serial===serial)))throw Error('Серийный номер должен состоять из шести уникальных символов A–Z/0–9');
  const now=new Date().toISOString();
  const p={id:crypto.randomUUID(),name,serial,emoji:emojiClean(body.emoji),avatar:'',score:0,createdAt:now,updatedAt:now};
  data.participants.push(p);
  return p;
}
function login(req,res,body){
  const ip=String(req.socket.remoteAddress||'unknown');
  const record=failedLogins.get(ip)||{count:0,until:0};
  if(record.until>Date.now())return send(res,429,{error:'Слишком много попыток, повторите позже'});
  const username=nameClean(body.username),password=String(body.password||'');
  const user=safeJson(adminsFile,{users:[]}).users.find(u=>u.username===username);
  const salt=user?user.salt:'000000000000000000000000000000000000000000000000';
  const candidate=hashPassword(password,salt);
  const verified=!!user&&crypto.timingSafeEqual(Buffer.from(user.hash,'hex'),Buffer.from(candidate,'hex'));
  if(!verified){
    record.count++;if(record.count>=5){record.count=0;record.until=Date.now()+15*60*1000;}
    failedLogins.set(ip,record);
    return send(res,401,{error:'Неверный логин или пароль'});
  }
  failedLogins.delete(ip);
  return send(res,200,{user:{username:user.username,role:user.role}},{'Set-Cookie':setSession(res,user)});
}
async function api(req,res,url){
  const isPost=req.method==='POST';
  if(isPost&&!hasValidOrigin(req))return send(res,403,{error:'Недопустимый источник запроса'});
  let body={};
  if(isPost){try{body=await parseBody(req);}catch(e){return send(res,400,{error:e.message});}}
  if(isPost&&url.pathname==='/api/admin/login')return login(req,res,body);
  if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,publicData());
  if(req.method==='GET'&&url.pathname==='/api/live-mode')return send(res,200,{liveUpdates:getData().liveUpdates});
  if(isPost&&url.pathname==='/api/register'){
    if(!process.env.REGISTRATION_CODE||body.code!==process.env.REGISTRATION_CODE)return send(res,403,{error:'Регистрация доступна только по коду организатора'});
    try{const data=getData(),p=ensureParticipant(data,body);saveData(data);return send(res,201,{participant:p});}
    catch(e){return send(res,400,{error:e.message});}
  }
  if(!url.pathname.startsWith('/api/admin/'))return send(res,404,{error:'Маршрут не найден'});
  const admin=currentAdmin(req);
  if(!admin)return send(res,401,{error:'Требуется вход администратора'});
  if(req.method==='GET'&&url.pathname==='/api/admin/me')return send(res,200,{user:admin});
  if(isPost&&url.pathname==='/api/admin/logout'){
    const raw=cookie(req);if(raw)sessions.delete(crypto.createHash('sha256').update(raw).digest('hex'));
    return send(res,200,{ok:true},{'Set-Cookie':'casino_sid=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/'});
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/transactions')return send(res,200,{transactions:getData().transactions.slice(-500).reverse()});
  if(req.method==='GET'&&url.pathname==='/api/admin/accounts'){
    if(admin.role!=='owner')return send(res,403,{error:'Только владелец'});
    return send(res,200,{accounts:safeJson(adminsFile,{users:[]}).users.map(u=>({username:u.username,role:u.role}))});
  }
  if(!isPost)return send(res,404,{error:'Маршрут не найден'});
  try{
    if(url.pathname==='/api/admin/accounts'){
      if(admin.role!=='owner')throw Error('Только владелец может назначать администраторов');
      const username=nameClean(body.username),password=String(body.password||'');
      const admins=safeJson(adminsFile,{users:[]});
      if(!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)||password.length<12||password.length>128)throw Error('Логин: 3–32 символа; пароль: 12–128 символов');
      if(admins.users.some(u=>u.username===username))throw Error('Логин занят');
      const salt=crypto.randomBytes(24).toString('hex');
      admins.users.push({username,role:'admin',salt,hash:hashPassword(password,salt),createdAt:new Date().toISOString()});
      writeJson(adminsFile,admins);
      return send(res,201,{ok:true,username});
    }
    if(url.pathname==='/api/admin/accounts/revoke'){
      if(admin.role!=='owner'||body.username===admin.username)throw Error('Удалить доступ может только владелец и не самому себе');
      const admins=safeJson(adminsFile,{users:[]});
      const u=admins.users.find(u=>u.username===body.username);
      if(!u||u.role==='owner')throw Error('Администратор не найден');
      admins.users=admins.users.filter(x=>x.username!==u.username);writeJson(adminsFile,admins);
      for(const [sid,s] of sessions)if(s.username===u.username)sessions.delete(sid);
      return send(res,200,{ok:true});
    }
    const data=getData();
    if(url.pathname==='/api/admin/participants'){
      const p=ensureParticipant(data,body);saveData(data);return send(res,201,{participant:{id:p.id,name:p.name,serial:p.serial}});
    }
    if(url.pathname==='/api/admin/participants/bulk'){
      const rows=String(body.text||'').split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
      if(!rows.length||rows.length>23)throw Error('Вставьте от 1 до 23 строк');
      const changed=[];
      for(const line of rows){
        const [name,serial]=line.split(/[,;\t]/).map(s=>s.trim());
        changed.push(ensureParticipant(data,{name,serial}));
      }
      saveData(data);return send(res,201,{count:changed.length});
    }
    if(url.pathname==='/api/admin/participants/archive'){
      const p=data.participants.find(x=>x.id===body.id);
      if(!p)throw Error('Игрок не найден');
      if(body.archived!==false){
        const transacted=data.transactions.some(t=>t.entries.some(e=>e.playerId===p.id));
        if(transacted)throw Error('Нельзя скрыть игрока с операциями: история балансов должна сохраниться');
      }
      p.archived=body.archived!==false;saveData(data);return send(res,200,{ok:true});
    }
    if(url.pathname==='/api/admin/transactions'){
      const tx=economy.validateTransaction(data,{...body,actor:admin.username});
      data.transactions.push(tx);
      saveData(data);
      return send(res,201,{transaction:tx,finance:publicData().finance});
    }
    if(url.pathname==='/api/admin/transactions/reverse'){
      if(!body.id)throw Error('Не указана операция');
      const tx=economy.reverseTransaction(data,String(body.id),admin.username);
      data.transactions.push(tx);saveData(data);return send(res,201,{transaction:tx});
    }
    if(url.pathname==='/api/admin/live-mode'){
      data.liveUpdates=body.enabled!==false;saveData(data);return send(res,200,{liveUpdates:data.liveUpdates});
    }
    return send(res,404,{error:'Маршрут не найден'});
  }catch(e){return send(res,400,{error:e.message||'Ошибка операции'});}
}
function serve(req,res,url){
  const pathname=url.pathname==='/'?'/index.html':url.pathname;
  const upload=pathname.startsWith('/uploads/');
  const base=upload?ROOT:PUBLIC, file=path.resolve(base,pathname.slice(1));
  if(!(file.startsWith(path.resolve(base)+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,{error:'Файл не найден'});
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
  res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
  fs.createReadStream(file).pipe(res);
}
function start(){
  initialize();
  const server=http.createServer((req,res)=>{
    let url;try{url=new URL(req.url,'http://localhost');}catch{return send(res,400,{error:'Неверный адрес'});}
    if(url.pathname.startsWith('/api/')){api(req,res,url).catch(e=>send(res,500,{error:'Ошибка сервера'}));}
    else if(req.method==='GET'||req.method==='HEAD')serve(req,res,url);
    else send(res,405,{error:'Метод не поддерживается'});
  });
  server.listen(PORT,'0.0.0.0',()=>console.log('BLACK 21: http://127.0.0.1:'+PORT));
  return server;
}
if(require.main===module)start();
module.exports={start,getData,initialize,publicData,ensureParticipant};
