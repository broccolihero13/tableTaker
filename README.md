# Grid Genie

Grid Genie is a Chrome extension that helps users interact with tables on web pages more efficiently. It allows users to download table data as a CSV file, or upload CSV data to populate form tables directly in the browser.

🚀 Features

    💾 Download tables as CSV with a single click.

    📤 Upload CSV files to populate table-based forms.

    🧠 Intelligent matching of CSV values with table inputs.

    🔒 Fully client-side — no data is collected or sent anywhere.

🔐 Privacy Policy

Grid Genie does not collect or transmit any personal data.

    The extension operates entirely in the browser and uses file input strictly to read values from CSVs to insert into visible tables via the DOM.

    No data is sent to any server — all processing occurs locally on the user’s machine.

    We use browser.storage.sync to remember which sites the user has chosen to exclude from table processing. This preference is stored securely within the browser and is never shared.

No analytics, tracking scripts, or cookies are used.

⚙️ Setup & Usage

    Install the Grid Genie extension from the Chrome Web Store (or load it via developer mode if testing locally).

    Navigate to a page with a table.

    Hover over the table to reveal the ⬇ CSV button for downloading its contents.

    Drag a .csv file onto the table to upload values (if the table contains input fields).

✅ That’s it. No additional configuration is needed.