
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { attach, tick, snapshot, publicMeta, state, TICK } from './server/game.js';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||10000),HOST='0.0.0.0';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const url=(req.url||'/').split('?')[0];
 if(url==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,online:state.players.size,tick:TICK}));}
 if(url==='/game-meta'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(publicMeta()));}
 let rel;try{rel=decodeURIComponent(url==='/'?'/index.html':url).replace(/^[/\\]+/,'')}catch{return res.writeHead(400).end('bad url')}
 const root=path.resolve(__dirname,'public');const full=path.resolve(root,rel);if(full!==root&&!full.startsWith(root+path.sep))return res.writeHead(403).end('forbidden');
 fs.stat(full,(err,st)=>{if(err||!st.isFile())return res.writeHead(404).end('not found');res.writeHead(200,{'content-type':MIME[path.extname(full)]||'application/octet-stream','cache-control':'no-cache'});fs.createReadStream(full).pipe(res)})
});
const wss=new WebSocketServer({server,maxPayload:32768});
wss.on('connection',ws=>{const p=attach(ws);ws.on('pong',()=>{p.lastPong=Date.now()});ws.on('error',()=>{});ws.send(JSON.stringify({type:'meta',meta:publicMeta()}));});
let last=Date.now(),acc=0;setInterval(()=>{const now=Date.now();const dt=Math.min(100,now-last);last=now;acc+=dt;while(acc>=TICK){tick(TICK);acc-=TICK}for(const p of state.players.values()){if(!p.ws||p.ws.readyState!==1)continue;try{p.ws.send(JSON.stringify(snapshot(p)));p.ws.ping()}catch{}}},TICK);
function stop(){try{wss.close()}catch{}try{server.close()}catch{}process.exit(0)}process.on('SIGTERM',stop);process.on('SIGINT',stop);server.listen(PORT,HOST,()=>console.log(`Arena Nexus Online v2 listening on ${HOST}:${PORT}`));
