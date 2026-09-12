# OrbitDesk v39

## Account limit corrected

- The previous v38 limit was global/IP-based and could incorrectly block unrelated people on the same server or network.
- v39 limits registration to a maximum of 2 accounts per persistent browser/device cookie.
- The device identifier is a random opaque token; only its SHA-256 hash is stored in PostgreSQL.
- An additional server-side rate limiter still protects `/api/auth/register` against registration floods.
- This is a practical anti-alt measure, not a cryptographic proof of human identity: clearing browser storage or using another device can create a new device identifier.
- Environment variable: `MAX_ACCOUNTS_PER_DEVICE=2`.
