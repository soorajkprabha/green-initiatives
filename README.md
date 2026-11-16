# Green Initiatives

Vidya Mission 33 – Green Campus proposal for Vidya Academy of Science & Technology (VAST), Thrissur.

Static site: `index.html` + `config.js` + `data/trees.csv` + `images/`. Host with GitHub Pages.

## Tree data: live from a Google Sheet

The Tree Register, the Vegetation statistics, the progress bars and the tree totals on the
Facts tab are all computed from one table with these columns (names must match):

`Tag no. | Zone | Local name | Botanical name | Dedicated to / Donated by | Status`

Status is one of `Dedicated`, `Pledged`, `Open`, `Pending audit`.

### Connect the sheet

1. The shared file `vast-tree-register.xlsx` is an Excel file. Open it with Google Sheets and choose
   **File → Save as Google Sheets** (a native Sheet is needed for publishing).
2. In the Sheet: **File → Share → Publish to web**. Select the **Tree Register** tab, format
   **Comma-separated values (.csv)**, click **Publish**, and copy the link.
3. Paste the link into `config.js` as `sheetCsvUrl`, commit and push.

From then on, edit the sheet and the website follows: it re-checks on load, every
`refreshMinutes` (default 5) while open, and when you press **Refresh now** on the Tree Register tab.
Google caches published sheets for a few minutes, so changes may take a little while to appear.

If the sheet cannot be reached the site falls back to the snapshot in `data/trees.csv`.
To refresh that snapshot, download the sheet tab as CSV and replace the file.

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
5. Publish only the **Tree Register** tab to the web, never **Pledges** or **Status log** (they hold emails).

With `pledgeEndpoint` empty the form runs in demo mode and saves nothing.

### Notes
- Do not put private information (emails, phone numbers) in a published sheet: anyone with the link can read it.
