# OrbitDesk v31 — mail bridge fix

- Registration now shows the real mail bridge error detail instead of hiding it behind a generic message.
- Added an admin mail diagnostic endpoint.
- Google Apps Script bridge GET now reports `ok=true` and version `v31`.
- Added 15s timeout and clearer handling for Apps Script permission/HTML responses.
- `render.yaml` now uses MAIL_PROVIDER=apps-script and removes legacy Resend variables from the blueprint.
- `mail-bridge/Code.gs` uses the same bridge token as the previous setup guide so Render and Apps Script match out of the box.
- Google Apps Script must still be deployed as a Web App; Google documents Web Apps under Deploy → New deployment → Web app, with the execution identity/access configured in the deployment.
