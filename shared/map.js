
export const MAP={w:4200,h:4200,cell:140,cols:30,rows:30};
export const BASES={blue:{x:340,y:3860},red:{x:3860,y:340}};
export const LANES={
 top:[{x:420,y:3720},{x:470,y:3200},{x:650,y:2700},{x:900,y:2200},{x:1250,y:1750},{x:1700,y:1300},{x:2200,y:920},{x:2750,y:650},{x:3300,y:480},{x:3760,y:390}],
 mid:[{x:430,y:3770},{x:900,y:3300},{x:1400,y:2850},{x:1850,y:2450},{x:2100,y:2100},{x:2450,y:1750},{x:2850,y:1400},{x:3300,y:900},{x:3770,y:430}],
 bot:[{x:430,y:3770},{x:950,y:3820},{x:1500,y:3800},{x:2050,y:3650},{x:2600,y:3450},{x:3050,y:3050},{x:3350,y:2650},{x:3580,y:2100},{x:3760,y:1400},{x:3830,y:430}]
};
export const FOREST=[
 {x:1050,y:1200,r:330},{x:3050,y:1150,r:340},{x:1000,y:3000,r:350},{x:3100,y:3100,r:350},
 {x:1650,y:950,r:250},{x:2550,y:3350,r:250},{x:1550,y:2550,r:280},{x:2650,y:1650,r:280}
];
export const WATER={center:{x:2100,y:2100},angle:-.65,width:230};
export const CAMPS=[
 {id:'camp-blue-small',x:1260,y:1420,kind:'small',respawn:65,weight:1},
 {id:'camp-blue-large',x:920,y:1760,kind:'large',respawn:80,weight:2},
 {id:'camp-red-small',x:2940,y:2780,kind:'small',respawn:65,weight:1},
 {id:'camp-red-large',x:3260,y:2440,kind:'large',respawn:80,weight:2},
 {id:'camp-ancient-blue',x:1680,y:2220,kind:'ancient',respawn:100,weight:3},
 {id:'camp-ancient-red',x:2520,y:1980,kind:'ancient',respawn:100,weight:3},
 {id:'rune-top',x:2080,y:1020,kind:'rune',respawn:120,weight:0},
 {id:'rune-bottom',x:2120,y:3180,kind:'rune',respawn:120,weight:0}
];
export const BOSSES=[
 {id:'overlord',name:'OVERLORD',x:1100,y:2100,hp:14000,armor:30,damage:150,range:420,respawn:210,reward:900,xp:1400},
 {id:'titan',name:'TITAN',x:3100,y:2100,hp:15500,armor:34,damage:165,range:430,respawn:210,reward:1050,xp:1600}
];
export const TOWERS=[];
function sample(line,t,rev=false){const pts=LANES[line]; const p=rev?pts.slice().reverse():pts; const s=Math.max(0,Math.min(1,t))*(p.length-1); const i=Math.min(p.length-2,Math.floor(s)); const f=s-i; return {x:p[i].x+(p[i+1].x-p[i].x)*f,y:p[i].y+(p[i+1].y-p[i].y)*f};}
for(const team of ['blue','red']) for(const lane of ['top','mid','bot']) for(const [tier,t] of [[3,.20],[2,.38],[1,.56]]) { const p=sample(lane,t,team==='red'); TOWERS.push({id:`${team}-${lane}-${tier}`,team,lane,tier,...p,hp:tier===1?2100: tier===2?2550:2900,maxHp:tier===1?2100: tier===2?2550:2900,range:560}); }
export const BUILDINGS=[
 {id:'shop-blue',kind:'shop',team:'blue',x:560,y:3650},{id:'shop-red',kind:'shop',team:'red',x:3640,y:560},
 {id:'fountain-blue',kind:'fountain',team:'blue',x:350,y:3850},{id:'fountain-red',kind:'fountain',team:'red',x:3850,y:350},
 {id:'outpost-a',kind:'outpost',team:'neutral',x:2100,y:690},{id:'outpost-b',kind:'outpost',team:'neutral',x:2100,y:3510}
];
export function lanePoint(lane,t,blue){return sample(lane,t,!blue)}
export function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
export function waterDistance(x,y){const ang=WATER.angle,dx=x-WATER.center.x,dy=y-WATER.center.y;const n=Math.sin(ang)*dx-Math.cos(ang)*dy;return Math.abs(n)}
export function inWater(x,y){return waterDistance(x,y)<WATER.width/2}
export function forestBlocked(x,y){for(const z of FOREST){const dx=x-z.x,dy=y-z.y;if(dx*dx+dy*dy<z.r*z.r*0.82)return true}return false}
