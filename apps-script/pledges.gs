/**
 * Online tree pledges for the Green Campus website (policy v0.2, section 4.3).
 *
 *   1. The donor picks an available tree, pays by UPI, and submits the form with the LAST 4 DIGITS of the UPI
 *      reference number. The tree shows "Payment pending" (reserved) and no name is shown yet.
 *   2. The script looks for that payment in the "Payments" tab: a payment of at least the contribution whose
 *      reference ends in those digits, dated close to the pledge. It verifies only when exactly ONE payment and
 *      ONE pending pledge fit, since 4 digits can collide. Then the tree shows "Pledged" with the donor's chosen
 *      name or dedication, and is slated for planting. If it is ambiguous the pledge stays pending with a note;
 *      staff resolve it by typing the full 12-digit reference into the pledge's "UPI ref" cell.
 *      No email confirmation, no committee approval.
 *   3. After planting, the planting team sets the tree's Status in the Tree Register to "Dedicated".
 *
 * The only manual step is the planting. The "Payments" tab is the feed of received payments: until a payment
 * gateway or bank feed is connected, someone pastes the UPI credits (reference and amount) from the bank
 * statement into it; the script matches them automatically. A feed can also post to this web app (see
 * PAYMENT_FEED_SECRET).
 *
 * An unpaid reservation is released after HOLD_DAYS. Manual edits to the register's Status or Donor columns are
 * written to a "Status log" tab.
 *
 * INSTALL (once), in the Google Sheet that holds the "Tree Register" tab:
 *   1. Extensions > Apps Script: paste this file, fill in CONFIG, save.
 *   2. Run `setupTriggers` once and authorise it (edit trigger, 15-minute payment check, daily release).
 *   3. Deploy > Manage deployments > pencil > Version: New version > Deploy (the web-app URL stays the same).
 *      First time: Deploy > New deployment > Web app, Execute as "Me", access "Anyone".
 *   4. Never publish the "Pledges", "Payments" or "Status log" tabs: they hold emails and payment details.
 */
var CONFIG = {
  REGISTER_SHEET: 'Tree Register',
  PLEDGE_SHEET: 'Pledges',
  PAYMENT_SHEET: 'Payments',
  LOG_SHEET: 'Status log',
  CONTRIBUTION: 2500,          // rupees for one tree; a payment of at least this amount verifies a pledge
  HOLD_DAYS: 3,                // an unpaid reservation is released after this many days
  MAX_PLEDGES_PER_EMAIL: 5,
  NOTIFY_EMAILS: [],           // optional: emailed when a pledge is verified
  PAYMENT_FEED_SECRET: '',     // optional: a payment feed posts {action:'payment', secret, ref, amount, payer, note}
  ORG_NAME: 'VAST Green Campus'
};

var STATUS = { OPEN: 'Open', PENDING: 'Payment pending', PLEDGED: 'Pledged', DEDICATED: 'Dedicated' };
var RELEASED = 'Released (no payment found)';
var PLEDGE_COLS = ['ID', 'Time', 'Tag no.', 'Name', 'Email', 'Dedication', 'Show publicly', 'Shown on register',
                   'Status', 'UPI ref', 'Verified at', 'Planted on', 'Notes'];
var PAY_COLS = ['Time', 'UPI ref', 'Amount', 'Payer', 'Note', 'Source', 'Matched pledge'];

/* ------------------------------------------------------------------ web app */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = (e && e.parameter) || {};
    return json_(p.action === 'payment' ? recordPayment_(p) : newPledge_(p));
  } catch (err) {
    return json_({ ok: false, error: 'Something went wrong. Please try again.' });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'register') return registerCsv_();
  return json_({ ok: true, service: 'VM33 pledge receiver', version: 'online-v4', action: p.action || '' });
}

function newPledge_(p) {
  var tag = clean_(p.tag, 40), name = clean_(p.name, 80), email = clean_(p.email, 120).toLowerCase();
  var dedication = clean_(p.dedication, 120), isPublic = p['public'] === '1', ref = digits_(p.ref);
  if (!tag || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please check your name and email address.' };
  }
  if (!/^(\d{4}|\d{12})$/.test(ref)) {
    return { ok: false, error: 'Please enter the last 4 digits of the UPI reference number from your payment.' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reg = registerInfo_(ss);
  if (!reg) return { ok: false, error: 'Register not found.' };
  var rowIdx = findTreeRow_(reg, tag);
  if (rowIdx < 0) return { ok: false, error: 'That tree was not found.' };
  if (String(reg.values[rowIdx][reg.cStatus]).trim().toLowerCase() !== STATUS.OPEN.toLowerCase()) {
    return { ok: false, taken: true, error: 'Sorry, this tree has just been taken. Please choose another one.' };
  }

  var sheet = pledgeSheet_(ss), data = sheet.getDataRange().getValues(), mine = 0;
  for (var i = 1; i < data.length; i++) {
    var live = String(data[i][8]) !== RELEASED;
    if (live && ref.length === 12 && digits_(data[i][9]) === ref) return { ok: false, error: 'This payment reference has already been used for a pledge.' };
    if (live && String(data[i][4]).toLowerCase() === email) mine++;
  }
  if (mine >= CONFIG.MAX_PLEDGES_PER_EMAIL) {
    return { ok: false, error: 'This email has reached the pledge limit. Please contact the Green Campus team.' };
  }

  var id = Utilities.getUuid(), shown = isPublic ? (dedication || name) : 'Anonymous';
  sheet.appendRow([id, new Date(), tag, safe_(name), safe_(email), safe_(dedication), isPublic ? 'Yes' : 'No',
                   safe_(shown), STATUS.PENDING, ref, '', '', '']);
  setRegister_(reg, rowIdx, STATUS.PENDING, '');   // reserved; no name shown until the payment is verified
  verifyPayments_();                                // the payment may already be in the Payments tab
  var done = false, now = sheet.getDataRange().getValues();
  for (var k = 1; k < now.length; k++) if (String(now[k][0]) === id) done = String(now[k][8]) === STATUS.PLEDGED;
  return { ok: true, verified: done };
}

function recordPayment_(p) {
  if (!CONFIG.PAYMENT_FEED_SECRET || String(p.secret) !== CONFIG.PAYMENT_FEED_SECRET) return { ok: false, error: 'Not allowed.' };
  var ref = digits_(p.ref), amount = Number(String(p.amount || '').replace(/[^0-9.]/g, ''));
  if (!/^\d{12}$/.test(ref) || !amount) return { ok: false, error: 'Bad payment.' };
  paymentSheet_(SpreadsheetApp.getActiveSpreadsheet())
    .appendRow([new Date(), ref, amount, safe_(clean_(p.payer, 80)), safe_(clean_(p.note, 120)), 'feed', '']);
  verifyPayments_();
  return { ok: true };
}

/* ---------------------------------------------------- payment verification */

/** Match payments to pending pledges. Call inside a lock. Returns how many pledges were verified. */
function verifyPayments_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), pledges = pledgeSheet_(ss), payments = paymentSheet_(ss);
  var pl = pledges.getDataRange().getValues(), pay = payments.getDataRange().getValues();
  var reg = registerInfo_(ss), count = 0, i, j;
  var pendingRefs = {};                                   // how many pending pledges share the same digits
  for (i = 1; i < pl.length; i++) if (String(pl[i][8]) === STATUS.PENDING) { var q = digits_(pl[i][9]); pendingRefs[q] = (pendingRefs[q] || 0) + 1; }

  for (i = 1; i < pl.length; i++) {
    if (String(pl[i][8]) !== STATUS.PENDING) continue;
    var ref = digits_(pl[i][9]);
    if (pendingRefs[ref] > 1) { note_(pledges, i, 'Another pending pledge has the same payment digits: check by hand and type the full 12-digit reference'); continue; }
    var fits = [], short = null;
    for (j = 1; j < pay.length; j++) {
      if (String(pay[j][6])) continue;                    // already matched to a pledge
      var pr = digits_(pay[j][1]);
      if (!pr || !(ref.length === 12 ? pr === ref : pr.slice(-ref.length) === ref)) continue;
      if (!inWindow_(pay[j][0], pl[i][1])) continue;
      var amount = Number(String(pay[j][2]).replace(/[^0-9.]/g, ''));
      if (amount >= CONFIG.CONTRIBUTION) fits.push(j); else short = amount;
    }
    if (fits.length === 0) { if (short !== null) note_(pledges, i, 'Payment found but the amount is short: ' + short); continue; }
    if (fits.length > 1) { note_(pledges, i, 'More than one payment ends in these digits: check by hand and type the full 12-digit reference'); continue; }
    j = fits[0];
    var idx = reg ? findTreeRow_(reg, String(pl[i][2])) : -1;
    if (idx >= 0) setRegister_(reg, idx, STATUS.PLEDGED, String(pl[i][7]));
    pledges.getRange(i + 1, 9).setValue(STATUS.PLEDGED);
    pledges.getRange(i + 1, 11).setValue(new Date());
    pledges.getRange(i + 1, 13).setValue('');
    payments.getRange(j + 1, 7).setValue(String(pl[i][0]));
    pay[j][6] = String(pl[i][0]);
    count++;
    mail_(String(pl[i][4]), 'Your tree pledge is confirmed (' + pl[i][2] + ')',
      'Dear ' + pl[i][3] + ',\n\nThank you. Your payment is verified and tree ' + pl[i][2] + ' is now pledged in your name for the ' +
      CONFIG.ORG_NAME + '. It will be planted in the next planting season, and you can follow its status on the website.\n');
    if (CONFIG.NOTIFY_EMAILS.length) {
      mail_(CONFIG.NOTIFY_EMAILS.join(','), 'Pledge verified: ' + pl[i][2], pl[i][3] + ' pledged tree ' + pl[i][2] + '. It is ready to be slated for planting.\n');
    }
  }
  return count;
}

/** A payment counts if it is dated from 2 days before the pledge to HOLD_DAYS after it (undated payments count). */
function inWindow_(payTime, pledgeTime) {
  var t = new Date(payTime).getTime(), p = new Date(pledgeTime).getTime();
  if (isNaN(t) || isNaN(p)) return true;
  return t >= p - 2 * 86400000 && t <= p + CONFIG.HOLD_DAYS * 86400000;
}
function note_(sheet, i, text) { sheet.getRange(i + 1, 13).setValue(text); }

/** Every 15 minutes (trigger): pick up payments that were added to the Payments tab. */
function checkPayments() { withLock_(verifyPayments_); }

/** Daily (trigger): release trees whose payment never arrived. */
function releaseStale() {
  withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = pledgeSheet_(ss), data = sheet.getDataRange().getValues();
    var reg = registerInfo_(ss), cutoff = Date.now() - CONFIG.HOLD_DAYS * 86400000;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][8]) === STATUS.PENDING && new Date(data[r][1]).getTime() < cutoff) {
        var idx = reg ? findTreeRow_(reg, String(data[r][2])) : -1;
        if (idx >= 0 && String(reg.values[idx][reg.cStatus]) === STATUS.PENDING) setRegister_(reg, idx, STATUS.OPEN, '');
        sheet.getRange(r + 1, 9).setValue(RELEASED);
        sheet.getRange(r + 1, 13).setValue('Released automatically: no payment found within ' + CONFIG.HOLD_DAYS + ' days');
      }
    }
  });
}

/* --------------------------------------------------------------- triggers */

/** Installable edit trigger (created by setupTriggers). */
function onEditInstalled(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet(), name = sheet.getName();
  if (name === CONFIG.PAYMENT_SHEET) { withLock_(verifyPayments_); return; }
  if (name === CONFIG.REGISTER_SHEET) {
    var user = editorEmail_(e);
    logRegisterEdit_(e, user);
    withLock_(function () { markPlanted_(e); });
  }
}

/** When the planting team sets a tree to Dedicated, stamp the pledge row. */
function markPlanted_(e) {
  var reg = registerInfo_(e.source); if (!reg) return;
  var c = e.range.getColumn() - 1, row = e.range.getRow();
  if (c !== reg.cStatus || row <= reg.hdr + 1 || String(e.value).trim() !== STATUS.DEDICATED) return;
  var tag = String(reg.sheet.getRange(row, reg.cTag + 1).getValue()).trim();
  var sheet = pledgeSheet_(e.source), data = sheet.getDataRange().getValues();
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][2]) === tag && String(data[r][8]) === STATUS.PLEDGED) {
      sheet.getRange(r + 1, 9).setValue(STATUS.DEDICATED);
      sheet.getRange(r + 1, 12).setValue(new Date());
      return;
    }
  }
}

/** Run once from the Apps Script editor. */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  ScriptApp.newTrigger('checkPayments').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('releaseStale').timeBased().everyDays(1).create();
  pledgeSheet_(SpreadsheetApp.getActiveSpreadsheet());
  paymentSheet_(SpreadsheetApp.getActiveSpreadsheet());
}

/* ------------------------------------------------------------------ helpers */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function registerInfo_(ss) {
  var sheet = ss.getSheetByName(CONFIG.REGISTER_SHEET);
  if (!sheet) return null;
  var values = sheet.getDataRange().getValues(), col = {}, hdr = -1;
  for (var i = 0; i < values.length && hdr < 0; i++) {
    var low = values[i].map(function (h) { return String(h).trim().toLowerCase(); });
    if (low.indexOf('tag no.') !== -1) { hdr = i; low.forEach(function (h, j) { col[h] = j; }); }
  }
  var cTag = col['tag no.'], cDonor = col['dedicated to / donated by'], cStatus = col['status'];
  if (hdr < 0 || cDonor == null || cStatus == null) return null;
  return { sheet: sheet, values: values, hdr: hdr, cTag: cTag, cDonor: cDonor, cStatus: cStatus };
}
function findTreeRow_(reg, tag) {
  for (var r = reg.hdr + 1; r < reg.values.length; r++) if (String(reg.values[r][reg.cTag]).trim() === tag) return r;
  return -1;
}
function setRegister_(reg, rowIdx, status, donor) {
  reg.sheet.getRange(rowIdx + 1, reg.cStatus + 1).setValue(status);
  reg.sheet.getRange(rowIdx + 1, reg.cDonor + 1).setValue(safe_(donor));
  reg.values[rowIdx][reg.cStatus] = status; reg.values[rowIdx][reg.cDonor] = donor;
}
function pledgeSheet_(ss) {
  var s = ss.getSheetByName(CONFIG.PLEDGE_SHEET);
  if (!s) { s = ss.insertSheet(CONFIG.PLEDGE_SHEET); s.appendRow(PLEDGE_COLS); }
  return s;
}
function paymentSheet_(ss) {
  var s = ss.getSheetByName(CONFIG.PAYMENT_SHEET);
  if (!s) { s = ss.insertSheet(CONFIG.PAYMENT_SHEET); s.appendRow(PAY_COLS); }
  return s;
}
function logRegisterEdit_(e, user) {
  var reg = registerInfo_(e.source); if (!reg) return;
  var c = e.range.getColumn() - 1, row = e.range.getRow();
  if (row <= reg.hdr + 1 || (c !== reg.cStatus && c !== reg.cDonor)) return;
  var ss = e.source, log = ss.getSheetByName(CONFIG.LOG_SHEET);
  if (!log) { log = ss.insertSheet(CONFIG.LOG_SHEET); log.appendRow(['Time', 'User', 'Tag no.', 'Column', 'Old value', 'New value']); }
  var tag = reg.sheet.getRange(row, reg.cTag + 1).getValue();
  log.appendRow([new Date(), user || '(unknown)', tag, c === reg.cStatus ? 'Status' : 'Donor', e.oldValue == null ? '' : safe_(e.oldValue), safe_(e.value == null ? '' : e.value)]);
}
function editorEmail_(e) {
  try { return (e.user && e.user.getEmail()) || Session.getActiveUser().getEmail() || ''; } catch (x) { return ''; }
}
/** The "Tree Register" tab as CSV, always current. Only this tab is exposed. */
function registerCsv_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.REGISTER_SHEET);
  if (!sheet) return json_({ ok: false, error: 'Register not found.' });
  var csv = sheet.getDataRange().getValues().map(function (row) {
    return row.map(function (v) {
      v = String(v == null ? '' : v);
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',');
  }).join('\r\n');
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}
function mail_(to, subject, body) { try { MailApp.sendEmail(to, subject, body); } catch (err) { /* quota or bad address: the sheet still has the record */ } }
function digits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function safe_(v) { v = String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; }   // stop spreadsheet formulas
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
