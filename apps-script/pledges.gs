/**
 * Tree pledge receiver for the Green Campus website.
 *
 * Install: open the Google Sheet that holds the "Tree Register" tab, then
 * Extensions > Apps Script, paste this file, save, and Deploy > New deployment > Web app
 *   Execute as: Me      Who has access: Anyone
 * Copy the web-app URL into `pledgeEndpoint` in config.js.
 *
 * What it does for each pledge from the website:
 *   1. checks the tree exists and is still "Open" (so two people cannot take the same tree)
 *   2. marks the tree "Pledged" and writes the donor text into "Dedicated to / Donated by"
 *   3. logs the full pledge (including the email, which is NOT published) in a "Pledges" tab
 *
 * Keep the "Pledges" tab out of "Publish to web"; only the "Tree Register" tab should be published.
 */
var REGISTER_SHEET = 'Tree Register';
var PLEDGE_SHEET = 'Pledges';
var MAX_PLEDGES_PER_EMAIL = 5;

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = (e && e.parameter) || {};
    var tag = clean_(p.tag, 40);
    var name = clean_(p.name, 80);
    var email = clean_(p.email, 120).toLowerCase();
    var dedication = clean_(p.dedication, 120);
    var isPublic = p['public'] === '1';

    if (!tag || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return out_({ ok: false, error: 'Please check your name and email address.' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reg = ss.getSheetByName(REGISTER_SHEET);
    if (!reg) return out_({ ok: false, error: 'Register not found.' });

    var values = reg.getDataRange().getValues();
    var hdr = -1, col = {};
    for (var i = 0; i < values.length && hdr < 0; i++) {
      var low = values[i].map(function (h) { return String(h).trim().toLowerCase(); });
      if (low.indexOf('tag no.') !== -1) {
        hdr = i;
        low.forEach(function (h, j) { col[h] = j; });
      }
    }
    var cTag = col['tag no.'], cDonor = col['dedicated to / donated by'], cStatus = col['status'];
    if (hdr < 0 || cDonor == null || cStatus == null) return out_({ ok: false, error: 'Register columns not found.' });

    var rowIdx = -1;
    for (var r = hdr + 1; r < values.length; r++) {
      if (String(values[r][cTag]).trim() === tag) { rowIdx = r; break; }
    }
    if (rowIdx < 0) return out_({ ok: false, error: 'That tree was not found.' });
    if (String(values[rowIdx][cStatus]).trim().toLowerCase() !== 'open') {
      return out_({ ok: false, taken: true, error: 'Sorry, this tree has just been taken. Please choose another one.' });
    }

    var log = ss.getSheetByName(PLEDGE_SHEET);
    if (!log) {
      log = ss.insertSheet(PLEDGE_SHEET);
      log.appendRow(['Time', 'Tag no.', 'Name', 'Email', 'Dedication', 'Show publicly', 'Shown on register', 'Follow-up']);
    }
    var existing = log.getDataRange().getValues().filter(function (row, k) {
      return k > 0 && String(row[3]).toLowerCase() === email;
    }).length;
    if (existing >= MAX_PLEDGES_PER_EMAIL) {
      return out_({ ok: false, error: 'This email has reached the pledge limit. Please contact the Green Campus team.' });
    }

    var shown = isPublic ? (dedication || name) : 'Anonymous';
    reg.getRange(rowIdx + 1, cStatus + 1).setValue('Pledged');
    reg.getRange(rowIdx + 1, cDonor + 1).setValue(safe_(shown));
    log.appendRow([new Date(), tag, safe_(name), safe_(email), safe_(dedication), isPublic ? 'Yes' : 'No', safe_(shown), '']);

    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: 'Something went wrong. Please try again.' });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return out_({ ok: true, service: 'VM33 pledge receiver' });
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

// Stop spreadsheet formulas: a value starting with = + - @ would otherwise be evaluated.
function safe_(v) {
  v = String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
