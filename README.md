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

### Pledges (online, policy section 4.3)

The flow follows the revised policy: no email confirmation and no committee approval.

| Step | Who | What happens |
| --- | --- | --- |
| 1. Pay and pledge | Donor, on the website | The donor picks an available tree, pays by UPI (QR or tap-to-pay, with the tree number as the note), and submits the form with the 12-digit UPI reference number. The tree shows **Payment pending** (reserved, no name shown). |
| 2. Payment verified | Script, automatically | The script matches the reference and amount with a row in the **Payments** tab. The tree then shows **Pledged** with the donor's chosen name or dedication, and the donor gets a confirmation email. |
| 3. Planting | Planting team | After planting, the team sets the tree's Status in the Tree Register to **Dedicated**. The Pledges tab is stamped automatically. |

- **The Payments tab** is the feed of received payments (columns: Time, UPI ref, Amount, Payer, Note, Source). Until a payment gateway or bank feed is connected, someone pastes the UPI credits from the bank statement into it; matching then happens at once (edit trigger) and every 15 minutes. A feed can also post to the web app: set `PAYMENT_FEED_SECRET` in the script and send `action=payment&secret=...&ref=...&amount=...`.
- A payment below the contribution amount (`CONTRIBUTION` in the script, Rs 2,500) does not verify a pledge; the Pledges tab notes it.
- An unpaid reservation is released after `HOLD_DAYS` (3) and the tree shows Open again.
- Manual edits to the register's Status or Donor columns are written to the **Status log** tab.

Set up once, in the Google Sheet:
1. **Extensions → Apps Script**: paste `apps-script/pledges.gs` and fill in `CONFIG` (optionally `NOTIFY_EMAILS`).
2. Run **`setupTriggers`** once and authorise it. It adds the edit trigger, the 15-minute payment check and the daily release, and creates the **Pledges** and **Payments** tabs.
3. **Deploy → Manage deployments → pencil → Version: New version → Deploy.** The web-app URL stays the same. First time: **New deployment → Web app**, *Execute as:* **Me**, *Who has access:* **Anyone**.
4. Put the web-app URL in `pledgeEndpoint` in `config.js`.
5. Never publish the **Pledges**, **Payments** or **Status log** tabs (they hold emails and payment details). Publish only the **Tree Register** if you use the backup link.

**Payment QR.** The pledge form shows a UPI QR code (`images/payment-upi-qr.png`) with a tap-to-pay link for phones that adds the tree number as the payment note. Both come from `paymentQr` and `upiLink` in `config.js`; the amount shown is read from `upiLink`. If the payee, account or amount changes, replace the image **and** the link together and check that the QR scans to the same details. Leave either empty to hide the payment block. The QR is a static UPI code, so it carries no information about who paid: the donor's UPI reference number is what links a payment to a pledge.

With `pledgeEndpoint` empty the form runs in demo mode and saves nothing.

### Notes
- Do not put private information (emails, phone numbers) in a published sheet: anyone with the link can read it.
