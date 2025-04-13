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

    const btn = document.createElement("button");
    btn.textContent = "⬇ CSV";
    btn.className = "csv-download-button";

    const btn2 = document.createElement("button");
    btn2.textContent = "⬆ CSV";
    btn2.className = "csv-upload-button";
    
    // Wrap the table in a div to position the button
    const wrapper = document.createElement("div");
    wrapper.classList.add("ext-table-wrapper");

    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
    wrapper.appendChild(btn);
    wrapper.appendChild(btn2);

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

        const text = cell.innerText.replace(/\s*\n\s*/g, " ").trim();
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

function showUploadSuccessToast(message = "Upload Successful") {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    background-color: #4CAF50;
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    opacity: 1;
    z-index: 9999;
    transition: all 1s ease-out;
    pointer-events: none;
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-30px)";
  }, 1000);

  setTimeout(() => {
    toast.remove();
  }, 1200);
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"'; // escaped quote
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim()); // last value
  return values;
}


function enableCSVDropOnTable(table) {
  const wrapper = table.closest(".ext-table-wrapper");
  const uploadBtn = wrapper.querySelector(".csv-upload-button");
  const downloadBtn = wrapper.querySelector(".csv-download-button");

  table.addEventListener("dragover", (e) => {
    e.preventDefault();
    table.style.outline = "2px dashed #4CAF50";
    wrapper.classList.add("dragging-file");

    if (uploadBtn) uploadBtn.classList.add("showing");
    if (downloadBtn) downloadBtn.classList.add("hidden");
  });

  table.addEventListener("dragleave", () => {
    table.style.outline = "";
    wrapper.classList.remove("dragging-file");

    if (uploadBtn) uploadBtn.classList.remove("showing");
    if (downloadBtn) downloadBtn.classList.remove("hidden");
  });

  table.addEventListener("drop", (e) => {
    e.preventDefault();
    table.style.outline = "";
    wrapper.classList.remove("dragging-file");
    if (uploadBtn) uploadBtn.classList.remove("showing");
    if (downloadBtn) downloadBtn.classList.remove("hidden");

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = function (event) {
        const csvText = event.target.result;
        const rows = csvText
          .trim()
          .split("\n")
          .map((row) => row.split(","));

        const tbody = table.querySelector("tbody");
        if (!tbody) return;

        const tableRows = [...tbody.querySelectorAll("tr")].filter(
          (row) => {
            return row.querySelectorAll("td").length > 0 && row.querySelectorAll(".drplt-no-border").length < 1
          }
        );

        for (let i = 0; i < rows.length; i++) {
          const rowData = rows[i];
          const tableRow = tableRows[i];
          if (!tableRow) continue;

          const cells = tableRow.querySelectorAll("td");

          for (let j = 0; j < rowData.length && j < cells.length; j++) {
            const cellValue = rowData[j].trim().replace(/^"|"$/g, "");
            const input = cells[j].querySelector("input");

            if (input) {
              if (input.type === "checkbox") {
                const shouldBeChecked =
                  cellValue.toLowerCase() === "true" ||
                  cellValue === "1" ||
                  cellValue.toLowerCase() === "yes";

                if (input.checked !== shouldBeChecked) {
                  input.click();
                }
              } else if (input.type === "number") {
                if (!isNaN(cellValue) && cellValue !== "") {
                  input.value = cellValue;
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                } else {
                  console.log("Skipped invalid number value:", cellValue);
                }
              } else {
                input.value = cellValue;
                input.dispatchEvent(new Event("input", { bubbles: true }));
              }
            } else {
              // No input? Just set the text content if it's plain text
              const div = cells[j].querySelector("div");
              if (div && div.classList.contains("drplt-text")) {
                div.textContent = cellValue;
              } else {
                cells[j].textContent = cellValue;
              }
            }
          }
        }
      };
      reader.readAsText(file);
      showUploadSuccessToast();
    }

    table.style.outline = "2px solid #4CAF50";
    setTimeout(() => {
      table.style.outline = "";
    }, 1000);
  });
}

setTimeout(() => {
  chrome.storage.sync.get(["excludedSites"], (data) => {
    const excluded = data.excludedSites || [];
    const currentHost = window.location.hostname;

    if (excluded.some((site) => currentHost.includes(site))) {
      console.log(`Skipping table injection on excluded site: ${currentHost}`);
      return;
    }

    onElementRendered("table", (el) => {
      attachCSVDownloadButtons();
      document.querySelectorAll("table").forEach((table) => {
        enableCSVDropOnTable(table);
      });
    });
  });
}, 2000);
