# Arena Nexus Online v9

Render-ready Node + WebSocket MOBA.

## Render
- Service: Web Service
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

## Main improvements
- Static pre-rendered map layer for much lower GPU/CPU load.
- Separate earth/paths/water/forest/bridges visual zones.
- Clear hero silhouettes and distinct melee/ranged/siege creeps.
- Smooth interpolation for players and creeps.
- Bosses: Overlord and Titan, with HP, damage, rewards and respawn.
- Functional shop/fountain/outpost buildings.
- Neutral camps and runes.
- Three lanes and lane-based creep routes.
- WebSocket server remains authoritative for core combat state.
