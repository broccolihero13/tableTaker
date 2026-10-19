# Grid Genie

[![Available in the Chrome Web Store](https://img.shields.io/chrome-web-store/v/oknhgchlehbbfohkgiijgdhefjeilipl.svg)](https://chrome.google.com/webstore/detail/oknhgchlehbbfohkgiijgdhefjeilipl)
[![Available for Firefox](https://img.shields.io/amo/v/grid-genie.svg)](https://addons.mozilla.org/en-US/firefox/addon/grid-genie/)

Grid Genie allows you to **download any table on the page as a CSV/JSON**, **upload a CSV/JSON to populate table forms**, and **securely compare CSV & JSON files locally**.

It works with many form-based tables and sensitive datasets, making repetitive data entry and CSV/JSON diffing faster and less error-prone.

---

## 🚀 Features

- ✅ One-click **CSV, JSON**, and **TSV (Copy)** download of HTML tables
- ✅ Native **Google Sheets** support: instantly export any Google Sheet to JSON!
- ✅ Drag-and-drop **CSV & JSON** upload into editable table forms
- ✅ **Secure Two-CSV Comparison** directly inside the extension popup via drag-and-drop or clipboard paste
  - Compare **row-by-row** (positional) or match rows by **Key Column(s)**
  - Visual diff table highlighting **Modified** (`old → new`), **Added**, **Removed**, and **Unchanged** rows/cells
  - Filter by `All`, `Differences`, `Modified`, `Added`, `Removed`, or `Unchanged`
  - Export filtered comparison results to CSV with **Safe Export** formula-injection sanitization
- ✅ **Multi-Column Sorting**: sort CSV data by any sequence of columns (e.g., Primary sort by `Column B`, Secondary sort by `Column C`, Tertiary sort by `Column D`, etc.) with ascending/descending and type-aware numeric sorting
- ✅ **Secure Deep JSON Comparison (Unified Table View)**:
  - Compare any two JSON files or pasted JSON values (deep nested objects, key-value maps, and arrays) in a clean comparison table matching the CSV Compare layout
  - **Line-by-Line Multiline String Expansion**: automatically expands multiline string values (`\n`) into individual table rows (`key [Line 1]`, `key [Line 2]`, ...) so every line is compared side-by-side in the same default table
  - Export the comparison table as a sanitized **CSV** (`Export CSV`) or download a full **Summary JSON** report (`Summary JSON`)
- ✅ **Persistent Standalone "Pop Out" Window**:
  - Automatically opens Compare CSVs / Compare JSON in a persistent standalone window on Firefox (and via the header **Pop Out** button in Chrome/Firefox) so switching to Finder or opening native file pickers never dismisses your workspace
- ✅ Intelligently populates `input`, `textarea`, `select` (dropdowns), and `checkbox` fields
- ✅ React, Vue, and modern JS framework compatibility via native event dispatching
- ✅ **Security-first design**: no data is stored or transmitted — everything runs in volatile local memory and is wiped on popup close or via the **Clear Data** button

---

## 🛠 Installation

### 🧩 For Chrome

The easiest way to install Grid Genie is directly from the **[Chrome Web Store](https://chrome.google.com/webstore/detail/oknhgchlehbbfohkgiijgdhefjeilipl)**.

#### Manual Installation (For Development)

1. Clone or download this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run build:chrome` to generate the Chrome build in `build/chrome`.
4. Go to `chrome://extensions` in Chrome.
5. Enable **Developer Mode** (top right).
6. Click **Load unpacked** and select `build/chrome`.
7. You're ready to start using Grid Genie on supported websites!

### 🦊 For Firefox

The easiest way to install Grid Genie is directly from **[Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/grid-genie/)**.

#### Manual Installation (For Development)

1. Clone or download this repository.
2. Install [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/):

   ```bash
   npm install --global web-ext
   ```

3. Build and run the extension locally:

   ```bash
   npm run build:firefox
   web-ext run --source-dir build/firefox
   ```

4. To build a distributable `.zip` for Firefox Add-ons:

   ```bash
   npm run package:firefox
   ```

> 📌 Note: The Firefox version includes a `browser_specific_settings` block in `manifest.firefox.json` with the ID for the production build (`extensionsupport@broccolihero.mozmail.com`).

---

## 🧪 Running Tests

Grid Genie uses **Jest** for unit testing to ensure CSV/JSON comparison, multi-column sorting, line-by-line multiline diffing, security sanitization, and DOM manipulation stay robust.

1. Install dependencies: `npm install`
2. Run the test suite: `npm test`

---

## 📂 Folder Structure

```
📁 src/
  ├── 📁 js/
  │   ├── content.js         ← Page table extraction, formatters, and DOM injection
  │   ├── csvCompare.js      ← Secure CSV parser, multi-column sorter, and diff engine
  │   ├── jsonCompare.js     ← Deep JSON comparison & line-by-line multiline string diff engine
  │   └── background.js      ← Extension service worker
  ├── 📁 css/
  │   └── add.css            ← Styling for in-page table buttons and modals
  ├── 📁 images/
  │   └── icon*.png          ← Extension icons
  ├── popup.html             ← Popup interface (Table Tools, Compare CSVs, Compare JSON)
  ├── popup.css              ← Modern dark-theme popup stylesheet
  └── popup.js               ← Popup controller & XSS-safe diff renderer
📁 tests/
  ├── content.test.js        ← Unit tests for DOM table extraction & formatters
  ├── csvCompare.test.js     ← Unit & security tests for CSV compare, sorting, and formula protection
  └── jsonCompare.test.js    ← Unit & security tests for deep JSON compare & multiline string diffs
📁 scripts/
  └── build.js               ← Cross-browser build script for Chrome & Firefox
manifest.chrome.json         ← Chrome Manifest V3 configuration
manifest.firefox.json        ← Firefox Manifest V3 configuration
```

---

## 🔒 Privacy & Security Policy

Grid Genie does **not collect, transmit, or store any data**.

- **100% Local Execution & Zero Network Access (`connect-src 'none'`)**: All table parsing and CSV/JSON comparisons run strictly locally inside your browser. The popup enforces a strict Content Security Policy with `connect-src 'none'`, guaranteeing at the browser level that comparison data can never be transmitted over the network.
- **Minimal Content Script Footprint**: Only `js/content.js` runs on web pages; the CSV and JSON comparison engines (`js/csvCompare.js`, `js/jsonCompare.js`) run exclusively inside the isolated extension popup.
- **Volatile Memory Only**: Sensitive CSV and JSON comparison files are held only in transient JavaScript memory inside the isolated extension popup—never written to `localStorage`, `sessionStorage`, `chrome.storage`, or `IndexedDB`, and automatically wiped when the popup/window closes.
- **XSS, Prototype Pollution & Formula Injection Protection**: All compared CSV and JSON values are rendered via safe DOM `textContent` APIs, JSON flattening uses `Map` and `Object.getOwnPropertyDescriptor` to prevent `__proto__` pollution, and exported CSV reports sanitize spreadsheet formula prefixes (`=`, `+`, `-`, `@`) by default.

---

## ⚙️ Permissions Justification

| Permission       | Reason                                                                 |
|------------------|------------------------------------------------------------------------|
| `activeTab`      | Needed to access and modify the content of the current active page     |
| `<all_urls>`     | Required to run on any webpage where tables might be edited or viewed  |

> 💡 Grid Genie does **not** use any `remote code`, or external APIs.

---

## 🙋 FAQ

**Q: Why does it need `<all_urls>` permission?**  
A: Because it needs to work on any page you open with a table. No data is collected or sent — it's just enabling table enhancements.

**Q: Can I compare sensitive CSVs even on pages where content scripts are restricted?**  
A: Yes! The **Compare CSVs** tab runs directly inside the isolated extension popup and works on any tab without injecting data into the active webpage.

**Q: Does it work on complex form tables?**  
A: It handles `input`, `textarea`, `select`, and `checkbox` fields inside tables. Dynamic/JS-heavy forms may require page-specific tweaks. As time goes on and requests are made, we'll look into supporting more and more complex use cases.
