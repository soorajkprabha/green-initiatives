/* Site configuration.
 *
 * sheetCsvUrl  - link to the live Tree Register as CSV (see README.md for how to get it).
 *                Leave empty to use the bundled snapshot in data/trees.csv.
 * fallbackCsv  - snapshot used when sheetCsvUrl is empty or cannot be reached.
 * refreshMinutes - how often an open page re-checks the sheet (0 = only on load / Refresh button).
 */
window.VM33_CONFIG = {
  sheetCsvUrl: "",
  fallbackCsv: "data/trees.csv",
  refreshMinutes: 5
};
