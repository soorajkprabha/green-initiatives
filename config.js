/* Site configuration.
 *
 * sheetCsvUrl  - link to the live Tree Register as CSV (see README.md for how to get it).
 *                Leave empty to use the bundled snapshot in data/trees.csv.
 * fallbackCsv  - snapshot used when sheetCsvUrl is empty or cannot be reached.
 * pledgeEndpoint - web-app URL of the pledge script (apps-script/pledges.gs). Empty = demo mode.
 * refreshMinutes - how often an open page re-checks the sheet (0 = only on load / Refresh button).
 */
window.VM33_CONFIG = {
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSuO0Msiel1wgjwSrLmRIlxShS1anry3emxV5BcnSyHeS2zMptKRxhLilUPhMBC7g/pub?gid=1799749575&single=true&output=csv",
  fallbackCsv: "data/trees.csv",
  pledgeEndpoint: "",
  refreshMinutes: 5
};
