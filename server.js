const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MAP = 3600;
const MAX_PLAYERS = 40;
const TICK = 30;
const TEAM = { blue: '#4ca7ff', red: '#ff5f72' };

const HEROES = {
  guardian: { name:'Guardian', hp:840, mana:280, speed:230, range:145, damage:56, armor:32, attackCd:0.86, role:'Tank', icon:'🛡️' },
  arcanist: { name:'Arcanist', hp:560, mana:520, speed:225, range:520, damage:72, armor:16, attackCd:1.12, role:'Mage', icon:'🔮' },
  ranger: { name:'Ranger', hp:610, mana:340, speed:250, range:620, damage:64, armor:18, attackCd:0.78, role:'Carry', icon:'🏹' },
  assassin: { name:'Assassin', hp:640, mana:330, speed:285, range:155, damage:82, armor:20, attackCd:0.72, role:'Assassin', icon:'🗡️' },
  druid: { name:'Druid', hp:680, mana:460, speed:235, range:450, damage:48, armor:22, attackCd:0.95, role:'Support', icon:'🌿' },
  berserker: { name:'Berserker', hp:960, mana:240, speed:240, range:155, damage:61, armor:28, attackCd:0.88, role:'Fighter', icon:'⚔️' }
};
const HERO_KEYS=Object.keys(HEROES);

const players = new Map();
const minions = new Map();
const towers = new Map();
let nextPlayer=1, nextMinion=1;
let lastWave=0;

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function norm(x,y){ const d=Math.hypot(x,y)||1; return {x:x/d,y:y/d}; }
function cleanName(v,f='Player'){ if(typeof v!=='string') return f; const s=v.replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,18); return s||f; }
function heroSpec(k){ return HEROES[k]||HEROES.guardian; }
function spawnFor(team){ return team==='blue'?{x:360,y:3240}:{x:3240,y:360}; }
function lanePoints(lane){
  if(lane==='top') return [{x:320,y:650},{x:700,y:760},{x:1160,y:1080},{x:1600,y:1600},{x:2120,y:2050},{x:2840,y:2940}];
  if(lane==='bot') return [{x:760,y:3280},{x:1120,y:2900},{x:1480,y:2520},{x:1860,y:2140},{x:2280,y:1760},{x:2940,y:1120}];
  return [{x:360,y:3240},{x:760,y:2860},{x:1160,y:2440},{x:1600,y:2000},{x:2040,y:1600},{x:2460,y:1160},{x:3240,y:360}];
}
function pointOnLane(lane,t,fromBlue=true){
  const pts=lanePoints(lane).slice(); if(!fromBlue) pts.reverse();
  const seg=(pts.length-1)*clamp(t,0,1), i=Math.min(pts.length-2,Math.floor(seg)), f=seg-i;
  return {x:pts[i].x+(pts[i+1].x-pts[i].x)*f,y:pts[i].y+(pts[i+1].y-pts[i].y)*f};
}
function towerData(){
  const out=[];
  for(const team of ['blue','red']) for(const lane of ['top','mid','bot']) {
    for(const t of [0.22,0.5]) { const p=pointOnLane(lane,t,team==='blue'); out.push({id:`${team}-${lane}-${t}`,team,lane,x:p.x,y:p.y,hp:1800,maxHp:1800,range:600,damage:85}); }
  }
  return out;
}
for(const t of towerData()) towers.set(t.id,t);

function nearestEnemy(p, range){
  let best=null,bd=range;
  for(const q of players.values()) if(q.team!==p.team && q.hp>0){ const d=dist(p,q); if(d<bd){best=q;bd=d;} }
  for(const q of minions.values()) if(q.team!==p.team && q.hp>0){ const d=dist(p,q); if(d<bd){best=q;bd=d;} }
  for(const q of towers.values()) if(q.team!==p.team && q.hp>0){ const d=dist(p,q); if(d<bd){best=q;bd=d;} }
  return best;
}
function damageTarget(target, amount, source){
  if(!target || target.hp<=0) return false;
  if(target.invuln && Date.now()<target.invuln) return false;
  const reduction = target.armor!=null ? 100/(100+target.armor) : 1;
  target.hp -= amount*reduction;
  target.lastHitBy = source?.id || null;
  if(target.hp<=0){ target.hp=0; return true; }
  return false;
}
function broadcast(obj){
  const s=JSON.stringify(obj); for(const p of players.values()) if(p.ws.readyState===WebSocket.OPEN) p.ws.send(s);
}
function publicState(){
  const ps={}; for(const [id,p] of players) ps[id]={id,name:p.name,hero:p.hero,team:p.team,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,mana:p.mana,maxMana:p.maxMana,level:p.level,xp:p.xp,gold:p.gold,dead:p.dead,respawn:p.respawn,dir:p.dir};
  const ms={}; for(const [id,m] of minions) ms[id]={id,team:m.team,lane:m.lane,type:m.type,x:m.x,y:m.y,hp:m.hp,maxHp:m.maxHp};
  const ts={}; for(const [id,t] of towers) ts[id]={id,team:t.team,lane:t.lane,x:t.x,y:t.y,hp:t.hp,maxHp:t.maxHp};
  return {players:ps,minions:ms,towers:ts,online:players.size,serverTime:Date.now()};
}

function spawnWave(){
  const now=Date.now(); if(now-lastWave<7000)return; lastWave=now;
  for(const team of ['blue','red']) for(const lane of ['top','mid','bot']) {
    for(let i=0;i<5;i++){ const id=String(nextMinion++); minions.set(id,{id,team,lane,type:i===0?'siege':(i<3?'melee':'ranged'),t:0.01+i*0.012,hp:i===0?520:360,maxHp:i===0?520:360,speed:i===0?92:(i<3?108:112),dmg:i===0?42:(i<3?30:26),attackCd:0.9,lastAttack:0,x:0,y:0,targetId:null}); }
  }
}
function updateMinions(dt){
  const now=Date.now();
  for(const m of minions.values()){
    if(m.hp<=0){continue;}
    const dir=m.team==='blue'; m.t += m.speed*dt/3000;
    const p=pointOnLane(m.lane,m.t,dir); m.x=p.x; m.y=p.y;
    let target=nearestEnemy(m,145);
    if(target){
      m.t -= m.speed*dt/3000;
      if(now-m.lastAttack>m.attackCd*1000){ m.lastAttack=now; damageTarget(target,m.dmg,m); }
    }
  }
  for(const [id,m] of minions) if(m.hp<=0 || m.t>1.03) minions.delete(id);
}
function updateTowers(){
  const now=Date.now();
  for(const t of towers.values()) if(t.hp>0){
    let best=null,bd=t.range;
    for(const p of players.values()) if(p.team!==t.team && p.hp>0){const d=dist(t,p);if(d<bd){best=p;bd=d;}}
    for(const m of minions.values()) if(m.team!==t.team && m.hp>0){const d=dist(t,m);if(d<bd){best=m;bd=d;}}
    if(best && now-(t.last||0)>1100){t.last=now;damageTarget(best,t.damage,t);}
  }
}
function respawn(p){ const s=spawnFor(p.team); p.x=s.x;p.y=s.y;p.hp=p.maxHp;p.mana=p.maxMana;p.dead=false;p.respawn=0;p.invuln=Date.now()+2200; }
function updatePlayers(dt){
  const now=Date.now();
  for(const p of players.values()){
    if(p.dead){if(now>=p.respawn)respawn(p);continue;}
    const s=heroSpec(p.hero); p.maxHp=s.hp+p.level*30; p.maxMana=s.mana+p.level*20; p.hp=Math.min(p.maxHp,p.hp); p.mana=Math.min(p.maxMana,p.mana);
    const d=norm(p.inputX,p.inputY); const speed=s.speed*(p.slowUntil>now?0.55:1); const nx=clamp(p.x+d.x*speed*dt/1000,80,MAP-80), ny=clamp(p.y+d.y*speed*dt/1000,80,MAP-80);
    p.x=nx;p.y=ny;if(Math.abs(d.x)+Math.abs(d.y)>0.01)p.dir=Math.atan2(d.y,d.x);
    p.cooldowns.attack=Math.max(0,p.cooldowns.attack-dt);
    for(const k of Object.keys(p.cooldowns)) if(k!=='attack') p.cooldowns[k]=Math.max(0,p.cooldowns[k]-dt);
    if(p.regenAt && now>p.regenAt){p.regenAt=0;p.hp=Math.min(p.maxHp,p.hp+p.maxHp*0.24);}
    if(p.attack && p.cooldowns.attack<=0){p.attack=false; basicAttack(p);}
  }
}
function basicAttack(p){
  if(p.dead) return; const s=heroSpec(p.hero), target=nearestEnemy(p,s.range); if(!target)return;
  p.cooldowns.attack=s.attackCd*1000;
  if(damageTarget(target,s.damage+p.level*4,p)){
    p.gold+=80; p.xp+=70; if(p.xp>=p.level*100){p.xp-=p.level*100;p.level++;}
    if(target.hp<=0 && target.team && players.has(target.id)){ target.dead=true;target.respawn=Date.now()+6000; }
  }
}
function useSkill(p,n){
  if(p.dead || p.cooldowns[n]>0)return; const s=heroSpec(p.hero), now=Date.now();
  const costs=[0,70,90,110,150]; const cds=[0,7,10,12,40]; const idx=n;
  if(p.mana<costs[idx])return;p.mana-=costs[idx];p.cooldowns[n]=cds[idx]*1000;
  const target=nearestEnemy(p, n===4?720:s.range+220);
  if(n===1){p.slowUntil=now+2200;if(target)damageTarget(target,s.damage*1.15,p);}
  if(n===2){p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.18);}
  if(n===3){for(const q of players.values()) if(q.team!==p.team&&dist(p,q)<320){damageTarget(q,s.damage*1.7,p);q.slowUntil=now+2500;} for(const q of minions.values()) if(q.team!==p.team&&dist(p,q)<320)damageTarget(q,s.damage*2.0,p);}
  if(n===4){for(const q of players.values()) if(q.team!==p.team&&dist(p,q)<650)damageTarget(q,s.damage*3.1,p);p.invuln=now+1000;}
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};
function safeFile(url){let p;try{p=decodeURIComponent(url.split('?')[0]||'/')}catch{return null}if(p==='/')p='/index.html';const root=path.resolve(__dirname);const rel=path.normalize(p).replace(/^[/\\]+/,'');const full=path.resolve(root,rel);return (full===root||full.startsWith(root+path.sep))?full:null}
const server=http.createServer((req,res)=>{const u=(req.url||'/').split('?')[0];if(u==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,online:players.size,map:MAP}))}let file;try{let p=decodeURIComponent(u);if(p==='/')p='/index.html';const rel=path.normalize(p).replace(/^[/\\]+/,'');file=path.join(__dirname,rel);if(!file.startsWith(__dirname))return res.writeHead(403).end('Forbidden');}catch{return res.writeHead(400).end('Bad URL')}
  fs.stat(file,(e,s)=>{if(e||!s.isFile())return res.writeHead(404).end('Not found');res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':path.basename(file)==='index.html'?'no-cache':'public,max-age=3600'});fs.createReadStream(file).pipe(res);});
});

const wss=new WebSocketServer({server,maxPayload:20*1024});
wss.on('connection',(ws)=>{
  if(players.size>=MAX_PLAYERS){ws.close(1013,'server full');return;}
  const id=String(nextPlayer++), team=[...players.values()].filter(p=>p.team==='blue').length<=[...players.values()].filter(p=>p.team==='red').length?'blue':'red';
  const s=heroSpec('guardian'), sp=spawnFor(team);
  const p={ws,id,team,name:`Player_${id}`,hero:'guardian',x:sp.x,y:sp.y,hp:s.hp,maxHp:s.hp,mana:s.mana,maxMana:s.mana,level:1,xp:0,gold:500,dead:false,respawn:0,invuln:Date.now()+2500,inputX:0,inputY:0,dir:0,attack:false,cooldowns:{attack:0,1:0,2:0,3:0,4:0},lastMsg:0,pong:Date.now()};
  players.set(id,p);
  ws.send(JSON.stringify({type:'welcome',id,team,map:MAP,heroes:HEROES}));
  ws.send(JSON.stringify({type:'state',...publicState()}));
  ws.on('pong',()=>p.pong=Date.now());
  ws.on('message',(raw)=>{const now=Date.now();if(now-p.lastMsg<25)return;p.lastMsg=now;let m;try{m=JSON.parse(raw.toString())}catch{return}if(!m||typeof m.type!=='string')return;
    if(m.type==='join'){p.name=cleanName(m.name,p.name);p.hero=HERO_KEYS.includes(m.hero)?m.hero:'guardian';const h=heroSpec(p.hero);p.maxHp=h.hp;p.hp=h.hp;p.maxMana=h.mana;p.mana=h.mana;}
    else if(m.type==='input'){p.inputX=clamp(Number(m.x)||0,-1,1);p.inputY=clamp(Number(m.y)||0,-1,1);p.dir=Number.isFinite(m.dir)?m.dir:p.dir;p.attack=!!m.attack;}
    else if(m.type==='skill'){useSkill(p,Number(m.n));}
    else if(m.type==='ping'){ws.send(JSON.stringify({type:'pongClient',t:m.t}));}
  });
  const bye=()=>{players.delete(id)};ws.on('close',bye);ws.on('error',bye);
});

let last=Date.now(),sendAccum=0;
const loop=setInterval(()=>{
  const now=Date.now(),dt=clamp(now-last,1,80);last=now;
  spawnWave(); updatePlayers(dt); updateMinions(dt/1000); updateTowers();
  for(const p of players.values()) if(p.dead===false && p.hp<=0){p.hp=0;p.dead=true;p.respawn=Date.now()+6000;}
  sendAccum+=dt;if(sendAccum>=50){sendAccum=0;broadcast({type:'state',...publicState()});}
  for(const p of players.values()){
    if(now-p.pong>35000){try{p.ws.terminate()}catch{}}
    else if(p.ws.readyState===WebSocket.OPEN)p.ws.ping();
  }
},TICK);
function shutdown(){clearInterval(loop);for(const p of players.values())try{p.ws.close(1001)}catch{}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3500)}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
server.listen(PORT,HOST,()=>console.log(`MOBA Arena v6 listening on ${HOST}:${PORT}`));
