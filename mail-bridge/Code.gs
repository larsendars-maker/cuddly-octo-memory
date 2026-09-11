const TOKEN_PROPERTY = 'ORBITDESK_BRIDGE_TOKEN';
const DEFAULT_FROM_NAME = 'OrbitDesk';

function bridgeToken_() {
  return PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY) || '';
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    service: 'OrbitDesk mail bridge'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!body.token || body.token !== bridgeToken_()) return json_({ok:false,error:'UNAUTHORIZED'});
    if (!bridgeToken_()) return json_({ok:false,error:'BRIDGE_TOKEN_NOT_CONFIGURED'});
    const to = String(body.to || '').trim();
    const subject = String(body.subject || 'OrbitDesk').slice(0, 200);
    const text = String(body.text || '');
    const html = String(body.html || '');
    const name = String(body.fromName || DEFAULT_FROM_NAME).replace(/[<>\r\n]/g, '').slice(0, 80) || DEFAULT_FROM_NAME;
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) return json_({ok:false,error:'BAD_TO'});
    GmailApp.sendEmail(to, subject, text, {htmlBody: html, name});
    return json_({ok:true});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err).slice(0,400)});
  }
}

function testAuthorization() {
  GmailApp.getAliases();
  Logger.log('OrbitDesk mail bridge authorized.');
}

function setBridgeToken() {
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY, 'PASTE_YOUR_RENDER_MAIL_BRIDGE_TOKEN_HERE');
  Logger.log('Set the placeholder to the same secret used in Render before running this function.');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
