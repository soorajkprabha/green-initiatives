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

### Notes
- The "Donate" form is still a demo; pledges are not written back to the sheet.
- Do not put private information (emails, phone numbers) in a published sheet: anyone with the link can read it.
