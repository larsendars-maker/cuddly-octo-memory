# Arena Nexus Online v11

Server-authoritative MOBA foundation for Render Web Service.

## Features
- Server authoritative movement/combat state.
- Client prediction + reconciliation sequence numbers.
- A* grid navigation for minions around forest blockers.
- Three lane routes, river, forests, towers, camps, runes, bosses.
- Hero roles, XP/levels, Q/W/E/R skills, items, gold.
- Tower target priority: minions before heroes.
- Boss phases and respawn timers.
- Per-player fog-of-war snapshots.
- Online mode over WebSocket and local practice mode.
- Static SVG asset pipeline under public/assets.

## Render
Runtime: Node
Build: npm install
Start: npm start
Health: /health
