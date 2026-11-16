/**
 * Tree pledge receiver + verification workflow for the Green Campus website.
 *
 * A pledge never goes straight to "Pledged" on the public register. It passes through people:
 *
 *   website form ──► tree shows "Awaiting verification" (reserved, no name shown)
 *        │
 *        ▼  donor clicks the confirmation link we email to them      (proves the email is theirs)
 *   "Awaiting committee approval" ──► committee member sets Follow-up to "Approved - pledged"
 *        │                                                            (register becomes Pledged)
 *        ▼  after planting, the zone owner sets Follow-up to "Planted - dedicated"
 *   register becomes Dedicated
 *
 *   "Rejected" (or an unconfirmed pledge after CONFIRM_EXPIRY_DAYS) re-opens the tree.
 *
 * Every verification records who did it and when (Pledges tab), and any manual edit to the
 * register's Status or Donor columns is written to a "Status log" tab.
 *
 * INSTALL (once), in the Google Sheet that holds the "Tree Register" tab:
 *   1. Extensions > Apps Script: paste this file, fill in CONFIG below, save.
 *   2. Run `setupTriggers` once from the editor and authorise it (adds the edit trigger,
 *      the daily clean-up and the Follow-up dropdown).
 *   3. Deploy > New deployment > Web app: Execute as "Me", access "Anyone". Copy the URL into
 *      `pledgeEndpoint` in config.js. (Re-deploy a new version after changing this file.)
 *   4. The website reads the register from this web app (?action=register), so "Publish to web" is optional.
 *      If you do publish, publish only "Tree Register", never "Pledges" or "Status log".
 */
var CONFIG = {
  REGISTER_SHEET: 'Tree Register',
  PLEDGE_SHEET: 'Pledges',
  LOG_SHEET: 'Status log',
  // Committee members allowed to approve/reject/dedicate. Empty = anyone with edit access to the sheet.
  APPROVER_EMAILS: [],
  // Who is emailed when a donor has confirmed a pledge and it is ready for approval.
  NOTIFY_EMAILS: [],
  MAX_PLEDGES_PER_EMAIL: 5,
  CONFIRM_EXPIRY_DAYS: 3,
  ORG_NAME: 'VAST Green Campus'
};

var STATUS = { OPEN: 'Open', AWAITING: 'Awaiting verification', PLEDGED: 'Pledged', DEDICATED: 'Dedicated' };
var FOLLOW = {
  AWAIT_DONOR: 'Awaiting donor confirmation',
  AWAIT_COMMITTEE: 'Awaiting committee approval',
  APPROVED: 'Approved - pledged',
  DEDICATED: 'Planted - dedicated',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired (not confirmed)'
};
var PLEDGE_COLS = ['ID', 'Time', 'Tag no.', 'Name', 'Email', 'Dedication', 'Show publicly', 'Shown on register',
                   'Follow-up', 'Token', 'Donor confirmed at', 'Verified by', 'Verified at', 'Notes'];

/* ------------------------------------------------------------------ web app */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = (e && e.parameter) || {};
    var tag = clean_(p.tag, 40), name = clean_(p.name, 80), email = clean_(p.email, 120).toLowerCase();
    var dedication = clean_(p.dedication, 120), isPublic = p['public'] === '1';
    if (!tag || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json_({ ok: false, error: 'Please check your name and email address.' });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reg = registerInfo_(ss);
    if (!reg) return json_({ ok: false, error: 'Register not found.' });
    var rowIdx = findTreeRow_(reg, tag);
    if (rowIdx < 0) return json_({ ok: false, error: 'That tree was not found.' });
    if (String(reg.values[rowIdx][reg.cStatus]).trim().toLowerCase() !== STATUS.OPEN.toLowerCase()) {
      return json_({ ok: false, taken: true, error: 'Sorry, this tree has just been taken. Please choose another one.' });
    }

    var log = pledgeSheet_(ss);
    var mine = log.getDataRange().getValues().filter(function (r, k) { return k > 0 && String(r[4]).toLowerCase() === email; }).length;
    if (mine >= CONFIG.MAX_PLEDGES_PER_EMAIL) {
      return json_({ ok: false, error: 'This email has reached the pledge limit. Please contact the Green Campus team.' });
    }

    var id = Utilities.getUuid(), token = Utilities.getUuid();
    var shown = isPublic ? (dedication || name) : 'Anonymous';
    log.appendRow([id, new Date(), tag, safe_(name), safe_(email), safe_(dedication), isPublic ? 'Yes' : 'No',
                   safe_(shown), FOLLOW.AWAIT_DONOR, token, '', '', '', '']);
    setRegister_(reg, rowIdx, STATUS.AWAITING, '');   // reserved; no name shown until approved

    var link = ScriptApp.getService().getUrl() + '?action=confirm&id=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(token);
    mail_(email, 'Please confirm your tree pledge (' + tag + ')',
      'Dear ' + name + ',\n\nThank you for pledging tree ' + tag + ' for the ' + CONFIG.ORG_NAME + '.\n\n' +
      'To confirm that this pledge is really yours, please open this link within ' + CONFIG.CONFIRM_EXPIRY_DAYS + ' days:\n' + link + '\n\n' +
      'After that, the Green Campus Committee will verify the pledge and you will hear from us.\n' +
      'If you did not make this pledge, just ignore this email and the tree will be released.\n');
    return json_({ ok: true, needsConfirmation: true });
  } catch (err) {
    return json_({ ok: false, error: 'Something went wrong. Please try again.' });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'register') return registerCsv_();
  if (p.action !== 'confirm') return json_({ ok: true, service: 'VM33 pledge receiver' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = pledgeSheet_(ss), data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0]) === String(p.id) && String(data[r][9]) === String(p.t) && p.t) {
        var follow = String(data[r][8]);
        if (follow === FOLLOW.AWAIT_DONOR) {
          sheet.getRange(r + 1, 9).setValue(FOLLOW.AWAIT_COMMITTEE);
          sheet.getRange(r + 1, 11).setValue(new Date());
          notifyCommittee_(String(data[r][2]), String(data[r][3]));
          return page_('Pledge confirmed', 'Thank you. Your pledge for tree ' + data[r][2] + ' is confirmed. The Green Campus Committee will now verify it and be in touch.');
        }
        if (follow === FOLLOW.EXPIRED || follow === FOLLOW.REJECTED) {
          return page_('Pledge not active', 'This pledge is no longer active. Please contact the Green Campus team if you still wish to sponsor a tree.');
        }
        return page_('Already confirmed', 'This pledge was already confirmed. Thank you.');
      }
    }
    return page_('Link not valid', 'This confirmation link is not valid.');
  } finally {
    lock.releaseLock();
  }
}

/** The "Tree Register" tab as CSV, always current (no Publish-to-web delay). Only this tab is exposed. */
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

/* --------------------------------------------------- committee / zone owner */

/** Installable edit trigger (created by setupTriggers). */
function onEditInstalled(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet(), name = sheet.getName(), user = editorEmail_(e);
  if (name === CONFIG.REGISTER_SHEET) return logRegisterEdit_(e, user);
  if (name !== CONFIG.PLEDGE_SHEET) return;
  var col = e.range.getColumn(), row = e.range.getRow();
  if (row < 2 || col !== 9 || e.range.getNumRows() !== 1) return;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = e.source, rec = sheet.getRange(row, 1, 1, PLEDGE_COLS.length).getValues()[0];
    var value = String(e.value || '').trim(), tag = String(rec[2]);
    var confirmed = !!rec[10];
    var fallback = confirmed ? FOLLOW.AWAIT_COMMITTEE : FOLLOW.AWAIT_DONOR;
    var prev = e.oldValue ? String(e.oldValue) : fallback;
    function revert(msg) { sheet.getRange(row, 9).setValue(prev); ss.toast(msg, 'Not changed', 8); }

    if (CONFIG.APPROVER_EMAILS.length && CONFIG.APPROVER_EMAILS.indexOf(user) < 0) {
      return revert('Only committee approvers can change a pledge status.');
    }
    var reg = registerInfo_(ss), idx = reg ? findTreeRow_(reg, tag) : -1;
    if (idx < 0) return revert('Tree ' + tag + ' was not found in the register.');
    var shown = String(rec[7]), donorEmail = String(rec[4]), donorName = String(rec[3]);

    if (value === FOLLOW.APPROVED) {
      if (!confirmed) return revert('The donor has not confirmed the email link yet.');
      setRegister_(reg, idx, STATUS.PLEDGED, shown);
      stamp_(sheet, row, user);
      mail_(donorEmail, 'Your tree pledge is approved (' + tag + ')', 'Dear ' + donorName + ',\n\nYour pledge for tree ' + tag + ' has been verified and approved. Thank you for supporting the ' + CONFIG.ORG_NAME + '.\n');
    } else if (value === FOLLOW.DEDICATED) {
      if (String(e.oldValue) !== FOLLOW.APPROVED) return revert('Approve the pledge first, then mark it planted.');
      setRegister_(reg, idx, STATUS.DEDICATED, shown);
      stamp_(sheet, row, user);
      mail_(donorEmail, 'Your tree has been planted (' + tag + ')', 'Dear ' + donorName + ',\n\nTree ' + tag + ' has been planted and dedicated, as verified by the zone owner. Thank you!\n');
    } else if (value === FOLLOW.REJECTED || value === FOLLOW.EXPIRED) {
      setRegister_(reg, idx, STATUS.OPEN, '');
      stamp_(sheet, row, user);
      mail_(donorEmail, 'About your tree pledge (' + tag + ')', 'Dear ' + donorName + ',\n\nWe could not verify your pledge for tree ' + tag + ', so it has been released. Please contact the Green Campus team if this is a mistake.\n');
    } else if (value === FOLLOW.AWAIT_DONOR || value === FOLLOW.AWAIT_COMMITTEE) {
      revert('That state is set automatically. Choose Approved, Planted, or Rejected.');
    } else {
      revert('Unknown status. Use the dropdown values.');
    }
  } finally {
    lock.releaseLock();
  }
}

/** Daily: release trees whose donor never confirmed. */
function releaseStale() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = pledgeSheet_(ss), data = sheet.getDataRange().getValues();
  var reg = registerInfo_(ss), cutoff = Date.now() - CONFIG.CONFIRM_EXPIRY_DAYS * 86400000;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][8]) === FOLLOW.AWAIT_DONOR && new Date(data[r][1]).getTime() < cutoff) {
      var idx = reg ? findTreeRow_(reg, String(data[r][2])) : -1;
      if (idx >= 0) setRegister_(reg, idx, STATUS.OPEN, '');
      sheet.getRange(r + 1, 9).setValue(FOLLOW.EXPIRED);
      sheet.getRange(r + 1, 14).setValue('Released automatically: donor did not confirm in time');
    }
  }
}

/** Run once from the Apps Script editor. */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  ScriptApp.newTrigger('releaseStale').timeBased().everyDays(1).create();
  var sheet = pledgeSheet_(SpreadsheetApp.getActiveSpreadsheet());
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([FOLLOW.AWAIT_DONOR, FOLLOW.AWAIT_COMMITTEE, FOLLOW.APPROVED, FOLLOW.DEDICATED, FOLLOW.REJECTED, FOLLOW.EXPIRED], true)
    .setAllowInvalid(false).build();
  sheet.getRange(2, 9, 1000, 1).setDataValidation(rule);
}

/* ------------------------------------------------------------------ helpers */

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
function stamp_(sheet, row, user) {
  sheet.getRange(row, 12).setValue(user || '(unknown)');
  sheet.getRange(row, 13).setValue(new Date());
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
function notifyCommittee_(tag, name) {
  if (!CONFIG.NOTIFY_EMAILS.length) return;
  mail_(CONFIG.NOTIFY_EMAILS.join(','), 'Pledge ready for approval: ' + tag,
    name + ' has confirmed a pledge for tree ' + tag + '.\nOpen the "Pledges" tab and set Follow-up to "Approved - pledged" or "Rejected":\n' +
    SpreadsheetApp.getActiveSpreadsheet().getUrl() + '\n');
}
function mail_(to, subject, body) { try { MailApp.sendEmail(to, subject, body); } catch (err) { /* quota or bad address: the sheet still has the record */ } }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function safe_(v) { v = String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; }   // stop spreadsheet formulas
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function page_(title, msg) {
  return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;max-width:480px;margin:60px auto;padding:0 16px"><h2>' +
    esc_(title) + '</h2><p>' + esc_(msg) + '</p></div>').setTitle(title);
}
function esc_(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
