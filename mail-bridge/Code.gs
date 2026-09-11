const BRIDGE_TOKEN = 'OrbitDesk-Mail-2026-9fK2x7-P4mQ8-Z1';
const DEFAULT_FROM_NAME = 'OrbitDesk';

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'OrbitDesk mail bridge', version: 'v31' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!body.token || body.token !== BRIDGE_TOKEN) return json({ ok:false, error:'UNAUTHORIZED' });
    const to = String(body.to || '').trim();
    const subject = String(body.subject || 'OrbitDesk').slice(0, 200);
    const text = String(body.text || '');
    const html = String(body.html || '');
    const name = String(body.fromName || DEFAULT_FROM_NAME).replace(/[<>\r\n]/g, '').slice(0, 80) || DEFAULT_FROM_NAME;
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) return json({ ok:false, error:'BAD_TO' });
    GmailApp.sendEmail(to, subject, text, { htmlBody: html, name });
    return json({ ok:true });
  } catch (err) {
    return json({ ok:false, error: String(err && err.message || err).slice(0, 400) });
  }
}

function testAuthorization() {
  GmailApp.getAliases();
  Logger.log('OrbitDesk mail bridge authorized.');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
