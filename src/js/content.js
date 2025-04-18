let browser;

if (typeof browser === "undefined") {
  browser = chrome;
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "activate") {
    activateTables();
  } else if (message.action === "deactivate") {
    deactivateTables();
  }
});


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

const attachCSVDownloadButtons = () => {
  const tables = document.querySelectorAll("table");
  if (!tables.length) {
    return;
  }

  tables.forEach((table, index) => {
    // Avoid duplicates
    if (table.dataset.csvButtonAttached) return;

    const btn = document.createElement("button");
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="color: #ffffff; width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"><path fill="#ffffff" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 242.7-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7 288 32zM64 352c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-101.5 0-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352 64 352zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg> CSV';
    btn.className = "csv-download-button";

    const btn2 = document.createElement("button");
    btn2.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="color: #ffffff; width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path fill="#ffffff" d="M288 109.3L288 352c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-242.7-73.4 73.4c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l128-128c12.5-12.5 32.8-12.5 45.3 0l128 128c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L288 109.3zM64 352l128 0c0 35.3 28.7 64 64 64s64-28.7 64-64l128 0c35.3 0 64 28.7 64 64l0 32c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64l0-32c0-35.3 28.7-64 64-64zM432 456a24 24 0 1 0 0-48 24 24 0 1 0 0 48z"/></svg> CSV';
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

const showUploadSuccessToast = (message = "Upload Successful") => {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.id = "csv-upload-toast";

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-30px)";
  }, 1000);

  setTimeout(() => {
    toast.remove();
  }, 1200);
}

const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
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

  values.push(current.trim());
  return values;
}

const enableCSVDropOnTable = (table) => {
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

    const file = e.dataTransfer.files && e.dataTransfer.files.length > 0 ? e.dataTransfer.files[0] : null;
    if (!file || !file.name.endsWith(".csv") || !file.type === "text/csv") {
      console.log("No file was dropped or the file list is empty.");
      return;
    }
    if (file && file.name.endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = function (event) {
        const csvText = event.target.result;
        const allRows = csvText
          .trim()
          .split("\n")
          .map((row) => parseCSVLine(row));

        const modal = createCsvModal();

        document.getElementById("csv-confirm").onclick = () => {
          const useHeaders = document.getElementById("csv-use-headers").checked;
          const cols = parseNumberInput(
            document.getElementById("csv-cols").value
          );
          const rows = parseNumberInput(
            document.getElementById("csv-rows").value
          );
          modal.remove();

          let dataRows = [...allRows];

          // Filter rows
          if (rows) {
            dataRows = dataRows.filter((_, i) => rows.includes(i + 1));
          }

          // Filter columns
          if (cols) {
            dataRows = dataRows.map((row) => cols.map((c) => row[c - 1] || ""));
          }
          
          const tbody = table.querySelector("tbody") || table;

          if (useHeaders){
            let headers = dataRows.shift();
            const headerRow = table.querySelector("thead") || table.querySelector('tr:has(th)');
            const headerCells = headerRow ? headerRow.querySelectorAll("th") : [];
  
            if (headerCells.length > 0) {
              headerCells.forEach((cell, index) => {
                if (headers[index]) {
                  cell.textContent = headers[index];
                }
              });
            }
          };

          
          const tableRows = [...tbody.querySelectorAll("tr")].filter((row) => {
            return (
              row.querySelectorAll("td").length > 0 &&
              row.querySelectorAll(".drplt-no-border").length < 1
            );
          });

          for (
            let i = 0;
            i < dataRows.length && i < tableRows.length;
            i++
          ) {
            const rowData = dataRows[i];
            const tableRow = tableRows[i];
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
                  }
                } else {
                  input.value = cellValue;
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                }
              } else {
                const div = cells[j].querySelector("div");
                if (div && div.classList.contains("drplt-text")) {
                  div.textContent = cellValue;
                } else {
                  cells[j].textContent = cellValue;
                }
              }
            }
          }
          showUploadSuccessToast();
        };
      };

      reader.readAsText(file);
    }

    table.style.outline = "2px solid #4CAF50";
    setTimeout(() => {
      table.style.outline = "";
    }, 1000);
  });
}

const createCsvModal = () => {
  const modal = document.createElement("div");
  modal.id = "csvUploadModal";

  modal.innerHTML = `
  <div class="modal-content">
    <h2>Upload CSV Options</h2>
    <label><input type="checkbox" id="csv-use-headers" checked /> Use first row as headers</label>
    <label>Columns to include (e.g. 1,2,4):
      <input type="text" id="csv-cols" placeholder="All" />
    </label>
    <label>Rows to include (e.g. 2-5,8):
      <input type="text" id="csv-rows" placeholder="All" />
    </label>
    <div style="margin-top: 16px; text-align: right;">
      <button id="csv-cancel">Cancel</button>
      <button id="csv-confirm">Upload</button>
    </div>
  </div>
`;

  document.body.appendChild(modal);

  document.getElementById("csv-cancel").onclick = () => modal.remove();
  return modal;
}

const parseNumberInput = (input) => {
  if (!input) return null;
  const parts = input.split(",").flatMap((part) => {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    } else {
      return [parseInt(part)];
    }
  });
  return [...new Set(parts)].filter((n) => !isNaN(n));
}

function showBanner(message, type = "success") {
  const existingBanner = document.getElementById("grid-genie-banner");
  if (existingBanner) existingBanner.remove();

  const banner = document.createElement("div");
  banner.id = "grid-genie-banner";
  banner.innerText = message;
  banner.style.backgroundColor = type === "success" ? "#4CAF50" : "#F44336";

  document.body.appendChild(banner);

  requestAnimationFrame(() => {
    banner.style.top = "0";
  });

  setTimeout(() => {
    banner.style.top = "-60px";
    setTimeout(() => banner.remove(), 400);
  }, 3000);
}


const activateTables = () => {
  setTimeout(() => {
    onElementRendered("table", (el) => {
      attachCSVDownloadButtons();
      let tables = document.querySelectorAll("table")
      tables.forEach((table) => {
        enableCSVDropOnTable(table);
      });
      showBanner(`Activated ${tables.length} table(s)`, "success");
    });
  }, 500);
}

const deactivateTables = () => {
  const tables = document.querySelectorAll("table");
  tables.forEach((table) => {
    const wrapper = table.closest(".ext-table-wrapper");
    if (wrapper) {
      wrapper.replaceWith(table);
    }
    table.removeAttribute("data-csv-button-attached");
  });

  const toasts = document.querySelectorAll("#csv-upload-toast");
  toasts.forEach((toast) => toast.remove());
  showBanner(`Deactivated ${tables.length} table(s)`, "error");
};

