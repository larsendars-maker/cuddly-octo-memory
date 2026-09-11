# v23 mail fix

The previous build hid the actual Resend provider error behind `EMAIL_SEND_FAILED`. v23 adds provider diagnostics to the server response and adds a free Google Apps Script HTTPS mail bridge.

Recommended free provider for the current OrbitDesk setup: Google Apps Script + Gmail account `orbitdesksupport@gmail.com`.

Resend remains available as an alternative when a verified sending domain/address is configured.
