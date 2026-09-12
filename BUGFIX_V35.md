# OrbitDesk v35

## Email verification
Google Apps Script Mail Bridge remains the mail provider. Registration now requires the 6-digit code from the email again.

Flow:
1. User submits username, email and password.
2. OrbitDesk creates an unverified account temporarily.
3. Apps Script sends the verification email.
4. Only after successful delivery is the registration considered pending.
5. User enters the 6-digit code.
6. OrbitDesk marks the email verified and creates the session automatically.

If mail delivery fails, the temporary user/settings records are removed so no unusable account is left behind.

## Render variables
- MAIL_PROVIDER=apps-script
- MAIL_BRIDGE_URL=<Apps Script /exec URL>
- MAIL_BRIDGE_TOKEN=<same secret as Apps Script Script Properties>
- MAIL_FROM_NAME=OrbitDesk
