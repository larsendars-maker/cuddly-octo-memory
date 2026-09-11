# Arena Nexus Online v8

Render-ready online MOBA.

## Render
- Service: Web Service
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

## Features
- 3 MOBA lanes with curved dirt trails instead of wide roads
- river/water with animated highlights
- forest zones, trees, camps and rune spots
- Dota-like wave pacing: melee + ranged every wave, siege on every 3rd wave, upgraded siege on every 6th
- neutral camps with gold/XP and respawn timers
- server-side movement, combat, creeps and towers
- gold, XP, levels and skill points
- skill leveling with Q/W/E/R
- shop: Boots, Blade, Armor, Wand
- desktop click-to-move/click-to-attack + WASD
- mobile joystick + touch abilities
- smooth client interpolation and lightweight particle effects

## GitHub
Put all files in the repository root so `package.json`, `server.js` and `index.html` are at the top level.
