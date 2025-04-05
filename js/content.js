const onElementRendered = (selector, cb, _attempts, contains = false) => {
  const el = contains
    ? [...document.querySelectorAll(selector)]?.find((e) =>
        e.innerText.includes(contains)
      )
    : document.querySelector(selector);
  if (el) return cb(el);
  if (_attempts == 50) return;
  _attempts = ++_attempts || 1;
  setTimeout(() => onElementRendered(selector, cb, _attempts, contains), 250);
};

function attachCSVDownloadButtons() {
  const tables = document.querySelectorAll("table");
  if (!tables.length) {
    return;
  }

  tables.forEach((table, index) => {
    // Avoid duplicates
    if (table.dataset.csvButtonAttached) return;

    // Create bubble/button
    const btn = document.createElement('button');
    btn.textContent = '⬇ CSV';
    btn.className = 'csv-download-button';
    btn.style.cssText = `
      position: absolute;
      top: -15px;
      right: 5px;
      z-index: 9999;
      background-color: #0056d2;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;

    // Positioning container
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
    wrapper.appendChild(btn);

    table.dataset.csvButtonAttached = "true";

    btn.addEventListener("click", () => {
      extractTableAndDownloadCSV(table);
    });
  });

  function extractTableAndDownloadCSV(table) {
    let csv = [];

    for (let row of table.rows) {
      let cells = [...row.cells].map((cell) => {
        const input = cell.querySelector("input");
        const divText = cell.querySelector("div")?.innerText.trim();
        const textarea = cell.querySelector("textarea");

        if (input) {
          if (input.type === "checkbox") {
            return input.checked ? '"Yes"' : '"No"';
          } else {
            return `"${input.value}"`;
          }
        }

        if (textarea) {
          return `"${textarea.value}"`;
        }

        const text = cell.innerText.trim();
        return `"${text || divText || ""}"`;
      });

      csv.push(cells.join(","));
    }

    const csvContent = csv.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "table-export.csv";
    link.click();
  }
}

setTimeout(() => {
  chrome.storage.sync.get(['excludedSites'], (data) => {
    const excluded = data.excludedSites || [];
    const currentHost = window.location.hostname;
    console.log(`Current host: ${currentHost}`);
    console.log(`Excluded sites: ${excluded}`);
  
    if (excluded.some(site => currentHost.includes(site))) {
      console.log(`Skipping table injection on excluded site: ${currentHost}`);
      return;
    }
  
    onElementRendered("table", (el) => {
      attachCSVDownloadButtons();
    });
  });
  
  
}, 2000); // Wait for 2 seconds to ensure the page is fully loaded
