# Grid Genie

Grid Genie allows you to **download any table on the page as a CSV** or **upload a CSV to populate table inputs**.

It works with many form-based tables, making repetitive data entry faster and less error-prone.

---

## 🚀 Features

- ✅ One-click CSV **download** of HTML tables
- ✅ Drag-and-drop CSV **upload** into editable table forms
- ✅ Intelligently populates `input`, `textarea`, and `checkbox` fields
- ✅ No data is stored or transmitted — everything runs in your browser

---

## 🛠 Installation

### 🧩 For Chrome

1. Clone or download this repository.
2. Go to `chrome://extensions` in Chrome.
3. Enable **Developer Mode** (top right).
4. Click **Load unpacked** and select this repo folder.
5. You're ready to start using Grid Genie on supported websites!

### 🦊 For Firefox

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

## 📂 Folder Structure

```
📁 js/
  └── content.js       ← CSV injection & DOM logic
📁 css/
  └── add.css          ← Styling for buttons and hover effects
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
- It **reads CSV files only** to populate tables on the active tab.
- It **writes nothing** beyond table cell values using `input.value` or `innerText`.

---

## ⚙️ Permissions Justification

| Permission       | Reason                                                                 |
|------------------|------------------------------------------------------------------------|
| `activeTab`      | Needed to access and modify the content of the current active page     |
| `<all_urls>` (firefox only)    | Required to run on any webpage where tables might be edited or viewed  |

> 💡 Grid Genie does **not** use any `remote code`, or external APIs.

---

## 🙋 FAQ

**Q: Why does it need `<all_urls>` permission?**  
A: Because it needs to work on any page you open with a table. No data is collected or sent — it's just enabling table enhancements.

**Q: Does it work on complex form tables?**  
A: It handles `input`, `textarea`, and `checkbox` fields inside tables. Dynamic/JS-heavy forms may require page-specific tweaks. As time goes on and requests are made, we'll look into supporting more and more complex use cases.
