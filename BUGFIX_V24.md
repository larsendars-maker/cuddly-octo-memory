# OrbitDesk v24

- Google Docs/Sheets/Drive: no longer attempts to iframe Google pages that reject embedding; opens them externally instead. Google OAuth-not-configured now falls back to direct Google Docs/Sheets/Drive links instead of showing a raw error.
- Quick sites: removed email-like entries from the personal quick-site list; added immediate rename/icon editing and up/down ordering.
- Frequent sites: improved icons and live usage counts.
- History: every visit can be opened again with one click.
- Chat: added user search, friend requests, incoming request list, and rank display.
- League/XP: opening a site grants +5 XP; rank updates immediately in the UI. Admin can manually set XP/rank from the admin user list.
- Settings: theme/visual settings apply immediately and autosave after a short debounce.
- Admin navigation is rendered only for admins and has a server-side role guard.
- Public server responses no longer serve source/config file paths; source remains protected by not serving the project root. A public GitHub repository would still expose source and should be private for true source hiding.
- Added visual icons and polished quick-site/history/chat controls.
