const http=require('http');
const fs=require('fs');
const path=require('path');
const {WebSocketServer,WebSocket}=require('ws');
const HOST='0.0.0.0';
const PORT=Number(process.env.PORT||10000);
const MAP=4000, TICK=50, MAX_PLAYERS=40;
const players=new Map(), minions=new Map(), towers=new Map(), camps=new Map();
const bosses=new Map([['overlord',{id:'overlord',name:'OVERLORD',x:2050,y:980,kind:'boss',hp:9000,maxHp:9000,armor:24,damage:120,range:360,last:0,respawnAt:0,alive:true,reward:500,xp:900}],['titan',{id:'titan',name:'TITAN',x:1950,y:3020,kind:'boss',hp:10000,maxHp:10000,armor:28,damage:135,range:380,last:0,respawnAt:0,alive:true,reward:650,xp:1050}]]);
const BUILDINGS=[{id:'shop-blue',kind:'shop',team:'blue',x:560,y:3360},{id:'shop-red',kind:'shop',team:'red',x:3440,y:640},{id:'fountain-blue',kind:'fountain',team:'blue',x:300,y:3700},{id:'fountain-red',kind:'fountain',team:'red',x:3700,y:300},{id:'outpost-nw',kind:'outpost',team:'neutral',x:2050,y:650},{id:'outpost-se',kind:'outpost',team:'neutral',x:1950,y:3350}];
let nextPlayer=1,nextMinion=1,nextCamp=1,lastWave=0,waveNumber=0;
const HEROES={
 guardian:{role:'Tank',hp:960,mana:330,speed:225,damage:62,range:250,attackCd:.78,armor:28,skills:[45,70,100,185]},
 arcanist:{role:'Mage',hp:620,mana:680,speed:228,damage:56,range:520,attackCd:1.0,armor:14,skills:[80,100,145,240]},
 ranger:{role:'Carry',hp:670,mana:430,speed:255,damage:70,range:570,attackCd:.72,armor:18,skills:[60,95,135,280]},
 assassin:{role:'Assassin',hp:700,mana:390,speed:300,damage:80,range:275,attackCd:.68,armor:17,skills:[70,100,150,300]},
 druid:{role:'Support',hp:740,mana:600,speed:238,damage:45,range:430,attackCd:1.0,armor:21,skills:[55,85,115,235]},
 berserker:{role:'Fighter',hp:1040,mana:300,speed:242,damage:75,range:250,attackCd:.76,armor:29,skills:[70,95,130,275]}
};
const LANES={
 top:[{x:440,y:3560},{x:410,y:3100},{x:460,y:2600},{x:560,y:2100},{x:700,y:1600},{x:950,y:1150},{x:1350,y:800},{x:2000,y:560},{x:2750,y:440},{x:3560,y:440}],
 mid:[{x:450,y:3550},{x:950,y:3100},{x:1450,y:2550},{x:2000,y:2000},{x:2550,y:1450},{x:3100,y:950},{x:3550,y:440}],
 bot:[{x:440,y:3560},{x:950,y:3600},{x:1500,y:3580},{x:2100,y:3500},{x:2650,y:3250},{x:3050,y:2850},{x:3320,y:2300},{x:3480,y:1600},{x:3560,y:440}]
};
const CAMP_DEFS=[
 {x:1150,y:1450,kind:'large',gold:70,xp:90,respawn:75},
 {x:1450,y:1050,kind:'small',gold:40,xp:55,respawn:60},
 {x:2550,y:2950,kind:'large',gold:70,xp:90,respawn:75},
 {x:2900,y:3250,kind:'small',gold:40,xp:55,respawn:60},
 {x:1650,y:2350,kind:'ancient',gold:110,xp:130,respawn:100},
 {x:2350,y:1650,kind:'ancient',gold:110,xp:130,respawn:100},
 {x:2000,y:1150,kind:'rune',gold:0,xp:0,respawn:120,hp:1},
 {x:2000,y:2850,kind:'rune',gold:0,xp:0,respawn:120,hp:1}
];
for(const d of CAMP_DEFS){const id=String(nextCamp++);camps.set(id,{id,...d,alive:true,respawnAt:0,maxHp:d.hp||560,hp:d.hp||560,armor:d.kind==='ancient'?18:10})}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function norm(x,y){const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}}
function cleanName(s,f){return String(s||f).replace(/[^\p{L}\p{N}_ -]/gu,'').trim().slice(0,18)||f}
function stats(p){return HEROES[p.hero]||HEROES.guardian}
function base(team){return team==='blue'?{x:350,y:3650}:{x:3650,y:350}}
function lanePoint(lane,t,blue=true){let pts=(LANES[lane]||LANES.mid).slice();if(!blue)pts.reverse();t=clamp(t,0,1);const seg=(pts.length-1)*t,i=Math.min(pts.length-2,Math.floor(seg)),f=seg-i;return{x:pts[i].x+(pts[i+1].x-pts[i].x)*f,y:pts[i].y+(pts[i+1].y-pts[i].y)*f}}
function nearLane(m){const pts=LANES[m.lane];let best=1e9;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],abx=b.x-a.x,aby=b.y-a.y,t=clamp(((m.x-a.x)*abx+(m.y-a.y)*aby)/(abx*abx+aby*aby),0,1),px=a.x+abx*t,py=a.y+aby*t;best=Math.min(best,Math.hypot(m.x-px,m.y-py))}return best}
function addTower(team,lane,tier,t){const p=lanePoint(lane,t,team==='blue');const id=`${team}-${lane}-${tier}`;towers.set(id,{id,team,lane,tier,x:p.x,y:p.y,hp:tier===1?1900:2350,maxHp:tier===1?1900:2350,range:tier===1?500:540,last:0})}
for(const team of ['blue','red'])for(const lane of ['top','mid','bot']){addTower(team,lane,1,.23);addTower(team,lane,2,.44)}
function enemyUnitInRange(src,range){let best=null,bd=range;
 for(const p of players.values()){if(p.team===src.team||p.dead)continue;const d=dist(src,p);if(d<bd){bd=d;best=p}}
 for(const m of minions.values()){if(m.team===src.team||m.hp<=0)continue;const d=dist(src,m);if(d<bd){bd=d;best=m}}
 for(const t of towers.values()){if(t.team===src.team||t.hp<=0)continue;const d=dist(src,t);if(d<bd){bd=d;best=t}}
 if(players.has(src.id)){for(const c of camps.values()){if(!c.alive)continue;const d=dist(src,c);if(d<bd){bd=d;best=c}}}
 for(const b of bosses.values()){if(!b.alive)continue;const d=dist(src,b);if(d<bd){bd=d;best=b}}
 return best}
function laneEnemyForMinion(m){let best=null,bd=175;
 for(const p of players.values()){if(p.team===m.team||p.dead)continue;if(nearLane(m)>90)continue;const d=dist(m,p);if(d<bd){bd=d;best=p}}
 for(const q of minions.values()){if(q.team===m.team||q.hp<=0||q.lane!==m.lane)continue;const d=dist(m,q);if(d<bd){bd=d;best=q}}
 for(const t of towers.values()){if(t.team===m.team||t.hp<=0||t.lane!==m.lane)continue;const d=dist(m,t);if(d<bd){bd=d;best=t}}
 return best}
function rewardKill(source,target){if(!source||!source.id||!players.has(source.id)||source.dead)return;source.gold+=target.kind==='camp'||target.kind==='boss'?target.gold||0:(target.type==='siege'?65:target.type==='ranged'?45:35);source.xp+=target.kind==='camp'||target.kind==='boss'?target.xp||0:(target.type==='siege'?85:target.type==='ranged'?55:40);while(source.xp>=source.level*160){source.xp-=source.level*160;source.level=Math.min(30,source.level+1);source.skillPoints=(source.skillPoints||0)+1;source.hp=Math.min(source.maxHp+35,source.hp+35);source.maxHp+=35;source.maxMana+=16;source.mana=Math.min(source.maxMana,source.mana+16)}}
function damage(target,amount,source){if(!target)return false;if(target.kind==='rune')return false;if(target.kind==='camp'&&!target.alive)return false;if(target.kind==='boss'&&!target.alive)return false;if(target.hp<=0)return false;if(target.invulnUntil&&Date.now()<target.invulnUntil)return false;const armor=target.armor||0;target.hp=Math.max(0,target.hp-amount*100/(100+Math.max(-50,armor)));if(target.hp===0){
 if(target.kind==='camp'){target.alive=false;target.respawnAt=Date.now()+target.respawn*1000;target.hp=target.maxHp;rewardKill(source,target);return true}
 if(target.kind==='boss'){target.alive=false;target.respawnAt=Date.now()+180000;target.hp=target.maxHp;rewardKill(source,{kind:'boss',gold:target.reward,xp:target.xp});return true}
 if(target.id&&players.has(target.id)){target.dead=true;target.respawnAt=Date.now()+Math.min(10000,7000+target.level*220);target.gold=Math.max(0,target.gold-80);target.inputX=target.inputY=0}
 rewardKill(source,target);return true}return false}
function spawnWave(){const now=Date.now();if(lastWave&&now-lastWave<30000)return;lastWave=now;waveNumber++;
 for(const team of ['blue','red'])for(const lane of ['top','mid','bot']){
  const count=waveNumber%6===0?2:1;
  for(let i=0;i<3;i++)spawnMinion(team,lane,'melee',.012+i*.010);
  for(let i=0;i<2;i++)spawnMinion(team,lane,'ranged',.052+i*.010);
  if(waveNumber%3===0||count===2)spawnMinion(team,lane,'siege',.092);
 }
}
function spawnMinion(team,lane,type,t){const id=String(nextMinion++);const p=lanePoint(lane,t,team==='blue');const baseStats=type==='melee'?{hp:420,dmg:30,speed:105,range:155,cd:1.0}:type==='ranged'?{hp:320,dmg:27,speed:102,range:265,cd:1.25}:{hp:720,dmg:55,speed:82,range:300,cd:1.15};minions.set(id,{id,team,lane,type,t,x:p.x,y:p.y,...baseStats,maxHp:baseStats.hp,last:0})}
function updateMinions(dt){const now=Date.now();for(const m of minions.values()){if(m.hp<=0)continue;const target=laneEnemyForMinion(m);if(target){if(now-m.last>m.cd*1000){m.last=now;damage(target,m.dmg,m)}}else{const step=m.speed*dt/1000/4800;m.t=clamp(m.t+step,0,1.02);const p=lanePoint(m.lane,m.t,m.team==='blue');m.x=p.x;m.y=p.y}}
 for(const [id,m] of minions)if(m.hp<=0||m.t>=1.02)minions.delete(id)}
function updateTowers(){const now=Date.now();for(const t of towers.values()){if(t.hp<=0)continue;const target=enemyUnitInRange(t,t.range);if(target&&now-t.last>1000){t.last=now;damage(target,112+(t.tier===2?22:0),t)}}}
function updateBosses(){const now=Date.now();for(const b of bosses.values()){if(!b.alive)continue;let target=null,bd=b.range;for(const p of players.values()){if(p.dead)continue;const d=dist(b,p);if(d<bd){bd=d;target=p}}if(target&&now-b.last>1200){b.last=now;damage(target,b.damage,b)}}}
function updateCamps(){const now=Date.now();for(const c of camps.values()){if(!c.alive&&now>=c.respawnAt)c.alive=true}for(const b of bosses.values()){if(!b.alive&&now>=b.respawnAt){b.alive=true;b.hp=b.maxHp}}for(const p of players.values()){if(p.dead)continue;for(const b of BUILDINGS){if(b.kind==='fountain'&&b.team===p.team&&Math.hypot(p.x-b.x,p.y-b.y)<220)p.hp=Math.min(p.maxHp,p.hp+28);}}}
function respawn(p){const s=base(p.team),h=stats(p);p.x=s.x;p.y=s.y;p.dead=false;p.respawnAt=0;p.invulnUntil=Date.now()+2500;p.hp=p.maxHp;p.mana=p.maxMana;p.inputX=p.inputY=0}
function basic(p){if(p.dead||p.attackCd>0)return;const h=stats(p),t=enemyUnitInRange(p,h.range);if(!t)return;p.attackCd=h.attackCd*1000;damage(t,h.damage+p.level*4+(p.items.damage||0),p)}
function cast(p,n){const now=Date.now();if(p.dead||n<1||n>4||p.cd[n]>0||p.skill[n]<1)return;const h=stats(p),lv=p.skill[n],cost=[0,55,85,110,170][n]-Math.min(30,lv*4);if(p.mana<cost)return;p.mana-=cost;p.cd[n]=[0,5,8,11,40][n]*1000;
 if(n===1){const t=enemyUnitInRange(p,h.range+120);if(t){damage(t,(h.skills[0]+(lv-1)*28)+p.level*7,p);t.slowUntil=now+1500}}
 else if(n===2){p.hp=Math.min(p.maxHp,p.hp+p.maxHp*(.18+.04*lv))}
 else if(n===3){for(const q of players.values())if(q.team!==p.team&&!q.dead&&dist(p,q)<320)damage(q,h.skills[2]+lv*24+p.level*9,p);for(const q of minions.values())if(q.team!==p.team&&dist(p,q)<320)damage(q,h.skills[2]*1.25,p)}
 else {for(const q of players.values())if(q.team!==p.team&&!q.dead&&dist(p,q)<680)damage(q,h.skills[3]+lv*40+p.level*15,p);p.invulnUntil=now+700}}
function buy(p,item){const shop={boots:{cost:250,speed:35},blade:{cost:600,damage:24},armor:{cost:550,armor:10},wand:{cost:650,mana:180}};const d=shop[item];if(!d||p.gold<d.cost||p.inventory.length>=6)return false;p.gold-=d.cost;p.inventory.push(item);p.items.speed+=d.speed||0;p.items.damage+=d.damage||0;p.items.armor+=d.armor||0;p.items.mana+=d.mana||0;return true}
function publicState(){const ps={};for(const [id,p] of players)ps[id]={id,name:p.name,hero:p.hero,team:p.team,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,mana:p.mana,maxMana:p.maxMana,level:p.level,xp:p.xp,gold:p.gold,dead:p.dead,respawnAt:p.respawnAt,dir:p.dir,attackCd:p.attackCd,cd:p.cd,skill:p.skill,skillPoints:p.skillPoints,inventory:p.inventory,items:p.items};
 const ms={};for(const [id,m] of minions)ms[id]={id,team:m.team,lane:m.lane,type:m.type,x:m.x,y:m.y,hp:m.hp,maxHp:m.maxHp};
 const ts={};for(const [id,t] of towers)ts[id]={id,team:t.team,lane:t.lane,tier:t.tier,x:t.x,y:t.y,hp:t.hp,maxHp:t.maxHp};
 const cs={};for(const [id,c] of camps)cs[id]={id,x:c.x,y:c.y,kind:c.kind,alive:c.alive,respawnAt:c.respawnAt,hp:c.hp,maxHp:c.maxHp};
 const bs={};for(const [id,b] of bosses)bs[id]={id,name:b.name,x:b.x,y:b.y,kind:b.kind,alive:b.alive,respawnAt:b.respawnAt,hp:b.hp,maxHp:b.maxHp};
 return{type:'state',players:ps,minions:ms,towers:ts,camps:cs,bosses:bs,buildings:BUILDINGS,online:players.size,wave:waveNumber,serverTime:Date.now()}}
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{const url=(req.url||'/').split('?')[0];if(url==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,online:players.size,map:MAP,wave:waveNumber}))}let rel;try{rel=decodeURIComponent(url==='/'?'/index.html':url).replace(/^[/\\]+/,'')}catch{return res.writeHead(400).end('bad url')}const root=path.resolve(__dirname),full=path.resolve(root,rel);if(!full.startsWith(root+path.sep)&&full!==root)return res.writeHead(403).end('forbidden');fs.stat(full,(err,st)=>{if(err||!st.isFile())return res.writeHead(404).end('not found');res.writeHead(200,{'content-type':MIME[path.extname(full)]||'application/octet-stream','cache-control':'no-cache'});fs.createReadStream(full).pipe(res)})});
const wss=new WebSocketServer({server,maxPayload:16384});
wss.on('connection',ws=>{if(players.size>=MAX_PLAYERS)return ws.close(1013,'server full');const blue=[...players.values()].filter(p=>p.team==='blue').length,red=[...players.values()].filter(p=>p.team==='red').length,team=blue<=red?'blue':'red',id=String(nextPlayer++),h=HEROES.guardian,s=base(team);const p={ws,id,team,name:`Player_${id}`,hero:'guardian',x:s.x,y:s.y,hp:h.hp,maxHp:h.hp,mana:h.mana,maxMana:h.mana,level:1,xp:0,gold:500,dead:false,respawnAt:0,invulnUntil:Date.now()+2500,inputX:0,inputY:0,dir:0,attack:false,attackCd:0,cd:{1:0,2:0,3:0,4:0},skill:{1:1,2:0,3:0,4:0},skillPoints:0,inventory:[],items:{speed:0,damage:0,armor:0,mana:0},lastMessage:0,lastPong:Date.now()};players.set(id,p);ws.send(JSON.stringify({type:'welcome',id,team,map:MAP}));ws.send(JSON.stringify(publicState()));ws.on('pong',()=>p.lastPong=Date.now());ws.on('message',raw=>{const now=Date.now();if(now-p.lastMessage<25)return;p.lastMessage=now;let m;try{m=JSON.parse(raw.toString())}catch{return};
 if(m.type==='join'){p.name=cleanName(m.name,p.name);if(HEROES[m.hero]){p.hero=m.hero;const h=HEROES[p.hero];p.maxHp=h.hp;p.hp=h.hp;p.maxMana=h.mana;p.mana=h.mana}}
 else if(m.type==='move'){p.inputX=clamp(Number(m.x)||0,-1,1);p.inputY=clamp(Number(m.y)||0,-1,1);if(Number.isFinite(m.dir))p.dir=m.dir}
 else if(m.type==='attack')p.attack=true;
 else if(m.type==='skill')cast(p,Number(m.n));
 else if(m.type==='levelSkill'){const n=Number(m.n);if(n>=1&&n<=4&&p.skillPoints>0&&p.skill[n]<4&&p.level>=({1:1,2:2,3:4,4:6}[n]||99)){p.skill[n]++;p.skillPoints--}}
 else if(m.type==='buy')buy(p,String(m.item||''));
});const drop=()=>players.delete(id);ws.on('close',drop);ws.on('error',drop)});
let last=Date.now(),acc=0;const timer=setInterval(()=>{const now=Date.now(),dt=clamp(now-last,1,100);last=now;spawnWave();updateCamps();for(const p of players.values()){
 if(p.dead){if(now>=p.respawnAt)respawn(p);continue}
 const h=stats(p),d=norm(p.inputX,p.inputY),slow=p.slowUntil&&p.slowUntil>now?.55:1,moveSpeed=h.speed+p.items.speed;p.x=clamp(p.x+d.x*moveSpeed*slow*dt/1000,80,MAP-80);p.y=clamp(p.y+d.y*moveSpeed*slow*dt/1000,80,MAP-80);if(Math.abs(p.inputX)+Math.abs(p.inputY)>.02)p.dir=Math.atan2(d.y,d.x);p.attackCd=Math.max(0,p.attackCd-dt);for(const k of [1,2,3,4])p.cd[k]=Math.max(0,p.cd[k]-dt);if(p.attack){p.attack=false;basic(p)}p.mana=Math.min(p.maxMana+p.items.mana,p.mana+9*dt/1000);p.maxMana=h.mana+p.level*16+p.items.mana;p.maxHp=h.hp+p.level*35; if(p.hp<=0&&!p.dead){p.dead=true;p.respawnAt=now+7000+p.level*200}}
 updateMinions(dt);updateTowers();updateBosses();acc+=dt;if(acc>=100){acc=0;const packet=JSON.stringify(publicState());for(const p of players.values())if(p.ws.readyState===WebSocket.OPEN)p.ws.send(packet)}for(const p of players.values()){if(now-p.lastPong>35000)try{p.ws.terminate()}catch{}else if(p.ws.readyState===WebSocket.OPEN)p.ws.ping()}
},TICK);
function stop(){clearInterval(timer);for(const p of players.values())try{p.ws.close(1001)}catch{}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000)}process.on('SIGTERM',stop);process.on('SIGINT',stop);server.listen(PORT,HOST,()=>console.log(`Arena Nexus v9 listening on ${HOST}:${PORT}`));
