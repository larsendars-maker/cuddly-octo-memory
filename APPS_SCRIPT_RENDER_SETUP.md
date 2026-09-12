# OrbitDesk — Google Apps Script Mail Bridge

OrbitDesk uses Google Apps Script for verification mail. SMTP is not required.

Render Web Service environment variables:

MAIL_PROVIDER=apps-script
MAIL_BRIDGE_URL=<your Apps Script Web App /exec URL>
MAIL_BRIDGE_TOKEN=<long random secret>
MAIL_FROM_NAME=OrbitDesk

In Apps Script, put the same secret in Script Properties as ORBITDESK_BRIDGE_TOKEN.

Deploy the Apps Script Web App as:
- Execute as: Me
- Who has access: Anyone

Authorize `GmailApp` once by running `testAuthorization`.

Do not put the bridge token in GitHub or in Code.gs source.
