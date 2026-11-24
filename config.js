/* Site configuration.
 *
 * sheetCsvUrl  - the pledge web app URL + "?action=register": the live Tree Register, no publishing delay.
 * backupCsvUrl - optional "Publish to web" CSV link, used if the web app cannot be reached.
 *                Leave both empty to use the bundled snapshot in data/trees.csv.
 * fallbackCsv  - snapshot used when sheetCsvUrl is empty or cannot be reached.
 * pledgeEndpoint - web-app URL of the pledge script (apps-script/pledges.gs). Empty = demo mode.
 * paymentQr / upiLink - the UPI QR image shown on the pledge form and the matching upi:// link (amount is read from it).
 *                Leave either empty to hide the payment block.
 * refreshMinutes - how often an open page re-checks the sheet (0 = only on load / Refresh button).
 */
window.VM33_CONFIG = {
  sheetCsvUrl: "https://script.google.com/macros/s/AKfycbweGSYTa4YoAABL4niIoSg2_6Z-6cXpZDjK8-oTqZ22wevX7xY8xUDBxmQjI7oKwfU/exec?action=register",
  backupCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSuO0Msiel1wgjwSrLmRIlxShS1anry3emxV5BcnSyHeS2zMptKRxhLilUPhMBC7g/pub?gid=1799749575&single=true&output=csv",
  fallbackCsv: "data/trees.csv",
  pledgeEndpoint: "https://script.google.com/macros/s/AKfycbweGSYTa4YoAABL4niIoSg2_6Z-6cXpZDjK8-oTqZ22wevX7xY8xUDBxmQjI7oKwfU/exec",
  paymentQr: "images/payment-upi-qr.png",
  upiLink: "upi://pay?pa=Vyapar.175684159355@hdfcbank&pn=Merchant&am=2500.00&cu=INR",
  refreshMinutes: 5
};
