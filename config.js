/* Site configuration.
 *
 * sheetCsvUrl  - the pledge web app URL + "?action=register": the live Tree Register, no publishing delay.
 * backupCsvUrl - optional "Publish to web" CSV link, used if the web app cannot be reached.
 *                Leave both empty to use the bundled snapshot in data/trees.csv.
 * fallbackCsv  - snapshot used when sheetCsvUrl is empty or cannot be reached.
 * pledgeEndpoint - web-app URL of the pledge script (apps-script/pledges.gs). Empty = demo mode.
 * refreshMinutes - how often an open page re-checks the sheet (0 = only on load / Refresh button).
 */
window.VM33_CONFIG = {
  sheetCsvUrl: "https://script.google.com/macros/s/AKfycbx5JAUWCZYv9YR7zDkOB7lQ0nmaUUF6clAksE3E5FWM1GYbYuGQfQwCmYXm99b3aHVQ/exec?action=register",
  backupCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSuO0Msiel1wgjwSrLmRIlxShS1anry3emxV5BcnSyHeS2zMptKRxhLilUPhMBC7g/pub?gid=1799749575&single=true&output=csv",
  fallbackCsv: "data/trees.csv",
  pledgeEndpoint: "https://script.google.com/macros/s/AKfycbx5JAUWCZYv9YR7zDkOB7lQ0nmaUUF6clAksE3E5FWM1GYbYuGQfQwCmYXm99b3aHVQ/exec",
  refreshMinutes: 5
};
