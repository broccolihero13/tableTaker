# Grid Genie

[![Available in the Chrome Web Store](https://img.shields.io/chrome-web-store/v/oknhgchlehbbfohkgiijgdhefjeilipl.svg)](https://chrome.google.com/webstore/detail/oknhgchlehbbfohkgiijgdhefjeilipl)
[![Available for Firefox](https://img.shields.io/amo/v/grid-genie.svg)](https://addons.mozilla.org/en-US/firefox/addon/grid-genie/)

Grid Genie allows you to **download any table on the page as a CSV/JSON** or **upload a CSV/JSON to populate table forms**.

It works with many form-based tables, making repetitive data entry faster and less error-prone.

---

## 🚀 Features

- ✅ One-click **CSV, JSON**, and **TSV (Copy)** download of HTML tables
- ✅ Drag-and-drop **CSV & JSON** upload into editable table forms
- ✅ Intelligently populates `input`, `textarea`, `select` (dropdowns), and `checkbox` fields
- ✅ React, Vue, and modern JS framework compatibility via native event dispatching
- ✅ No data is stored or transmitted — everything runs locally in your browser

---

## 🛠 Installation

### 🧩 For Chrome

The easiest way to install Grid Genie is directly from the **[Chrome Web Store](https://chrome.google.com/webstore/detail/oknhgchlehbbfohkgiijgdhefjeilipl)**.

#### Manual Installation (For Development)

1. Clone or download this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run build:chrome` to generate the Chrome manifest.
4. Go to `chrome://extensions` in Chrome.
5. Enable **Developer Mode** (top right).
6. Click **Load unpacked** and select this repo folder.
7. You're ready to start using Grid Genie on supported websites!

### 🦊 For Firefox

The easiest way to install Grid Genie is directly from **[Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/grid-genie/)**.

#### Manual Installation (For Development)

1. Clone or download this repository.
2. Install [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/):

   ```bash
   npm install --global web-ext
   ```

3. Run the extension locally:

   ```bash
   web-ext run
   ```

4. To build a distributable `.zip` for Firefox Add-ons:

   ```bash
   web-ext build
   ```

> 📌 Note: The Firefox version includes a `browser_specific_settings` block in `manifest.json` with the ID for the production build (`extensionsupport@broccolihero.mozmail.com`).

---

## 🧪 Running Tests

Grid Genie uses **Jest** for unit testing to ensure data parsing and DOM manipulation stay robust.

1. Install dependencies: `npm install`
2. Run the test suite: `npm test`

---

## 📂 Folder Structure

```
📁 src/
  └── 📁 js/
      └── content.js   ← Core logic (parsing, DOM injection)
  └── 📁 css/
      └── add.css      ← Styling for buttons and hover effects
📁 tests/
  └── content.test.js  ← Jest unit tests for DOM/data manipulation
📁 images/
  └── icon16.png       ← Icons
popup.html             ← Popup interface
popup.css              ← Popup stylesheet
popup.js               ← Popup JS for logic
manifest.json          ← Core extension config
```

---

## 🔒 Privacy Policy

Grid Genie does **not collect, transmit, or store any data**.

- It only runs locally on the browser.
- It **reads CSV and JSON files only** to populate tables on the active tab.
- It **writes nothing** beyond table cell values using `input.value`, framework events, or `textContent`.

---

## ⚙️ Permissions Justification

| Permission       | Reason                                                                 |
|------------------|------------------------------------------------------------------------|
| `activeTab`      | Needed to access and modify the content of the current active page     |
| `<all_urls>`      | Required to run on any webpage where tables might be edited or viewed  |

> 💡 Grid Genie does **not** use any `remote code`, or external APIs.

---

## 🙋 FAQ

**Q: Why does it need `<all_urls>` permission?**  
A: Because it needs to work on any page you open with a table. No data is collected or sent — it's just enabling table enhancements.

**Q: Does it work on complex form tables?**  
A: It handles `input`, `textarea`, and `checkbox` fields inside tables. Dynamic/JS-heavy forms may require page-specific tweaks. As time goes on and requests are made, we'll look into supporting more and more complex use cases.
