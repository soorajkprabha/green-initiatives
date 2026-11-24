# Green Initiatives

Vidya Mission 33 – Green Campus proposal for Vidya Academy of Science & Technology (VAST), Thrissur.

Static site: `index.html` + `config.js` + `data/trees.csv` + `images/`. Host with GitHub Pages.

## Tree data: live from a Google Sheet

The Tree Register, the Vegetation statistics, the progress bars and the tree totals on the
Facts tab are all computed from one table with these columns (names must match):

`Tag no. | Zone | Local name | Botanical name | Dedicated to / Donated by | Status`

Status is one of `Dedicated`, `Pledged`, `Open`, `Pending audit`.

### Connect the sheet

The website reads the register **live from the pledge web app** (the Apps Script described below), so there
is no "Publish to web" delay and it always reads the same spreadsheet the pledges are written to.

1. Set up the script as described under *Pledges and verification* below.
2. In `config.js`, `sheetCsvUrl` is the web-app URL followed by `?action=register`.
3. `backupCsvUrl` (optional) is a "Publish to web" CSV link of the **Tree Register** tab, used only if the web app
   cannot be reached. If both fail, the site shows the snapshot in `data/trees.csv`.

The site re-checks on load, every `refreshMinutes` (default 5) while open, when you return to the tab, and when you
press **Refresh now** on the Tree Register tab. The line above the register says which source is in use.

After changing `apps-script/pledges.gs`, paste the new code into Apps Script and use
**Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The web-app URL stays the same.

### Pledges and verification (Plus 500 Tree Club)

A pledge never goes straight to **Pledged** on the public register. It is verified by the people concerned:

| Step | Who | What happens |
|---|---|---|
| 1. Pledge | Donor, on the website | Tree shows **Awaiting verification** (reserved, no name shown). The donor gets an email with a confirmation link. |
| 2. Confirm | Donor | Clicking the link proves the email is theirs. Follow-up becomes *Awaiting committee approval* and the committee is emailed. |
| 3. Approve | Green Campus Committee | In the **Pledges** tab set Follow-up to **Approved - pledged**. The register shows **Pledged** with the donor text. |
| 4. Plant | Zone owner | After planting set Follow-up to **Planted - dedicated**. The register shows **Dedicated**. |

- **Rejected**, or a pledge the donor does not confirm within 3 days, re-opens the tree and the donor is told.
- Each verification stamps **who** and **when** in the Pledges tab. Manual edits to the register's Status or Donor columns are written to a **Status log** tab.
- Approval is refused if the donor has not confirmed, and "Planted" is refused before "Approved".

Set up once, in the Google Sheet:
1. **Extensions → Apps Script**: paste `apps-script/pledges.gs`. Fill in `CONFIG`:
   `APPROVER_EMAILS` (who may approve; empty = anyone with edit access) and `NOTIFY_EMAILS` (who is emailed for approval).
2. Run **`setupTriggers`** once and authorise it. This adds the edit trigger, the daily clean-up and the Follow-up dropdown.
3. **Deploy → New deployment → Web app**; *Execute as:* **Me**, *Who has access:* **Anyone**.
4. Copy the web-app URL into `pledgeEndpoint` in `config.js`, commit and push.
5. If you also use "Publish to web" for the backup link, publish only the **Tree Register** tab, never **Pledges** or **Status log** (they hold emails).

**Payment QR.** The pledge form shows a UPI QR code (`images/payment-upi-qr.png`) with a tap-to-pay link for phones that adds the tree number as the payment note. Both come from `paymentQr` and `upiLink` in `config.js`; the amount shown is read from `upiLink`. If the payee, account or amount changes, replace the image **and** the link together and check that the QR scans to the same details. Leave either empty to hide the payment block. The QR is a static UPI code, so a payment is matched to a pledge by the tree number in the payment note, checked against the bank statement.

With `pledgeEndpoint` empty the form runs in demo mode and saves nothing.

### Notes
- Do not put private information (emails, phone numbers) in a published sheet: anyone with the link can read it.
