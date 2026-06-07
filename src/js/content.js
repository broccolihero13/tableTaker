let browser;

if (typeof browser === "undefined") {
  browser = typeof chrome !== "undefined" ? chrome : { runtime: { onMessage: { addListener: () => {} } } };
}

const safeSetHTML = (element, htmlString) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  element.textContent = '';
  while (doc.body.firstChild) {
    element.appendChild(doc.body.firstChild);
  }
};

const setInputValue = (input, value) => {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const setTextareaValue = (textarea, value) => {
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (nativeTextareaValueSetter) {
    nativeTextareaValueSetter.call(textarea, value);
  } else {
    textarea.value = value;
  }
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
};

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "activate") {
    activateTables();
  } else if (message.action === "deactivate") {
    deactivateTables();
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "checkButtons") {
    const tables  = document.querySelectorAll("table");
    const buttons = document.querySelectorAll(".csv-download-button");
    const hasTables = tables.length > 0;
    const ok = hasTables && buttons.length === tables.length;

    sendResponse({ hasTables, buttonsStillAttached: ok });
  }
});


const onElementRendered = (selector, cb, _attempts, contains = false) => {
  const el = contains
    ? [...document.querySelectorAll(selector)]?.find((e) =>
        e.innerText.includes(contains)
      )
    : document.querySelector(selector);
  if (el) return cb(el);
  if (_attempts == 1) {
    showBanner(
      `Searching for ${selector} on this page.`,
      "message"
    );
  }
  if (_attempts == 15) {
    showBanner(
      `No ${selector} found on this page.`,
      "error"
    );
    return;
  }
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
    safeSetHTML(btn, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="color: #ffffff; width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"><path fill="#ffffff" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 242.7-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7 288 32zM64 352c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-101.5 0-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352 64 352zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg> CSV');
    btn.className = "csv-download-button";
    btn.style.left = "calc(50% - 85px)";

    const btnJson = document.createElement("button");
    safeSetHTML(btnJson, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="color: #ffffff; width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"><path fill="#ffffff" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 242.7-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7 288 32zM64 352c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-101.5 0-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352 64 352zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg> JSON');
    btnJson.className = "csv-download-button";
    btnJson.style.left = "50%";

    const btnCopy = document.createElement("button");
    safeSetHTML(btnCopy, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style="color: #ffffff; width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"><path fill="#ffffff" d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16l140.1 0L400 115.9 400 320c0 8.8-7.2 16-16 16zM192 384H384c26.5 0 48-21.5 48-48V112c0-12.7-5.1-24.9-14.1-33.9L342.1 14.1C333.1 5.1 320.9 0 308.1 0H192C165.5 0 144 21.5 144 48V320c0 26.5 21.5 48 48 48zM64 128c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H256c35.3 0 64-28.7 64-64V416H272v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16H96V128H64z"/></svg> Copy');
    btnCopy.className = "csv-download-button";
    btnCopy.style.left = "calc(50% + 85px)";

    const btn2 = document.createElement("button");
    safeSetHTML(btn2, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="color: #ffffff; width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path fill="#ffffff" d="M288 109.3L288 352c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-242.7-73.4 73.4c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l128-128c12.5-12.5 32.8-12.5 45.3 0l128 128c12.5-12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L288 109.3zM64 352l128 0c0 35.3 28.7 64 64 64s64-28.7 64-64l128 0c35.3 0 64 28.7 64 64l0 32c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64l0-32c0-35.3 28.7-64 64-64zM432 456a24 24 0 1 0 0-48 24 24 0 1 0 0 48z"/></svg> Upload');
    btn2.className = "csv-upload-button";

    // Wrap the table in a div to position the button
    const wrapper = document.createElement("div");
    wrapper.classList.add("ext-table-wrapper");

    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
    wrapper.appendChild(btn);
    wrapper.appendChild(btnJson);
    wrapper.appendChild(btnCopy);
    wrapper.appendChild(btn2);

    table.dataset.csvButtonAttached = "true";

    btn.addEventListener("click", () => {
      extractTableAndDownload(table, 'csv');
    });
    btnJson.addEventListener("click", () => {
      extractTableAndDownload(table, 'json');
    });
    btnCopy.addEventListener("click", () => {
      extractTableAndDownload(table, 'tsv');
    });
  });
};

function getTableData(table) {
    let data = [];
    let foundHeader = false;

    for (let row of table.rows) {
      const isHeaderOnly = row.querySelectorAll("td").length === 0 && row.querySelectorAll("th").length > 0;
      
      if (isHeaderOnly) {
        if (foundHeader) {
          continue; // Skip intermediate header rows
        } else {
          foundHeader = true; // Keep the first header row
        }
      }

      let cells = [...row.cells].map((cell) => {
        const input = cell.querySelector("input");
        const divText = cell.querySelector("div")?.innerText.trim();
        const textarea = cell.querySelector("textarea");
        const select = cell.querySelector("select");

        if (input) {
          if (input.type === "checkbox") {
            return input.checked ? 'Yes' : 'No';
          } else {
            return input.value;
          }
        }

        if (textarea) {
          return textarea.value;
        }

        if (select) {
          return select.options[select.selectedIndex]?.text || select.value || "";
        }

        const text = (cell.innerText || cell.textContent || "").replace(/\s*\n\s*/g, " ").trim();
        return text || divText || "";
      });
      data.push(cells);
    }
    return data;
  }

  function downloadBlob(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }



  function formatAsCSV(data) {
    let csvLines = [];
    for (let i = 0; i < data.length; i++) {
      let row = data[i];
      if (!Array.isArray(row)) continue;
      let rowCols = [];
      for (let j = 0; j < row.length; j++) {
        let cell = row[j];
        let str = "";
        try { str = String(cell || ""); } catch(e) {}
        rowCols.push('"' + str.replace(/"/g, '""') + '"');
      }
      csvLines.push(rowCols.join(","));
    }
    return csvLines.join("\n");
  }

  function formatAsJSON(data) {
    if (data.length > 1) {
      const headers = (data[0] || []).map(h => {
        try { return String(h || "").trim(); } catch(e) { return ""; }
      });
      const rows = data.slice(1);
      const objects = rows.map(row => {
        let obj = {};
        if (Array.isArray(row)) {
          row.forEach((cell, i) => {
            let cellStr = "";
            try { cellStr = String(cell || ""); } catch(e) {}
            obj[headers[i] || `Column${i}`] = cellStr;
          });
        }
        return obj;
      });
      return JSON.stringify(objects, null, 2);
    } else {
      return JSON.stringify(data, null, 2);
    }
  }

  function formatAsTSV(data) {
    let tsvLines = [];
    for (let i = 0; i < data.length; i++) {
      let row = data[i];
      if (!Array.isArray(row)) continue;
      let rowCols = [];
      for (let j = 0; j < row.length; j++) {
        let cell = row[j];
        let str = "";
        try { str = String(cell || ""); } catch(e) {}
        rowCols.push(str);
      }
      tsvLines.push(rowCols.join("\t"));
    }
    return tsvLines.join("\n");
  }

  function extractTableAndDownload(table, format) {
    try {
      const data = getTableData(table) || [];

      if (format === 'csv') {
        const csvContent = formatAsCSV(data);
        downloadBlob(csvContent, "text/csv;charset=utf-8;", "table-export.csv");
      } else if (format === 'json') {
        const jsonContent = formatAsJSON(data);
        downloadBlob(jsonContent, "application/json;charset=utf-8;", "table-export.json");
      } else if (format === 'tsv') {
        const tsvContent = formatAsTSV(data);
        navigator.clipboard.writeText(tsvContent).then(() => {
          showBanner("Table copied to clipboard as TSV!", "success");
        }).catch(err => {
          showBanner("Failed to copy to clipboard", "error");
        });
      }
    } catch (error) {
      console.error("Grid Genie Download Error:", error);
      showBanner("Failed to export table. Check console for details.", "error");
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
  }, 1300);
};


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
    if (!file) {
      console.log("No file was dropped or the file list is empty.");
      return;
    }

    const isCsv = file.name.endsWith(".csv");
    const isJson = file.name.endsWith(".json");
    if (!isCsv && !isJson) {
      showBanner("Unsupported file format. Please drop a CSV or JSON.", "error");
      return;
    }

    if (file) {
      const reader = new FileReader();
      reader.onload = function (event) {
        const fileText = event.target.result;
        let allRows = [];

        if (isCsv) {
          allRows = fileText.trim().split("\n").map(parseCSVLine);
        } else if (isJson) {
          try {
            const parsed = JSON.parse(fileText);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
                const headerSet = new Set();
                parsed.forEach(obj => {
                  if (typeof obj === 'object' && obj !== null) {
                    Object.keys(obj).forEach(k => headerSet.add(k));
                  }
                });
                const headers = Array.from(headerSet);
                allRows.push(headers);
                parsed.forEach(obj => {
                  allRows.push(headers.map(h => obj[h] !== null && obj[h] !== undefined ? String(obj[h]) : ""));
                });
              } else if (Array.isArray(parsed[0])) {
                allRows = parsed.map(row => row.map(String));
              }
            }
          } catch (err) {
            showBanner("Invalid JSON format", "error");
            return;
          }
        }

        const modal = createCsvModal(isJson);

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
              const textarea = cells[j].querySelector("textarea");
              const select = cells[j].querySelector("select");

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
                    setInputValue(input, cellValue);
                  }
                } else {
                  setInputValue(input, cellValue);
                }
              } else if (textarea) {
                setTextareaValue(textarea, cellValue);
              } else if (select) {
                const options = Array.from(select.options);
                const matchingOption = options.find(opt => opt.text.trim() === cellValue || opt.value === cellValue);
                if (matchingOption) {
                  select.value = matchingOption.value;
                  select.dispatchEvent(new Event("change", { bubbles: true }));
                }
              } else {
                const div = cells[j].querySelector("div");
                let targetCell = div && div.classList.contains("drplt-text") ? div : cells[j];
                targetCell.textContent = cellValue;
                
                // Visual feedback
                cells[j].style.transition = "background-color 0.4s ease";
                cells[j].style.backgroundColor = "rgba(76, 175, 80, 0.3)";
                setTimeout(() => {
                  cells[j].style.backgroundColor = "";
                }, 800);
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

const createCsvModal = (isJson = false) => {
  const existingModal = document.getElementById("csvUploadModal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "csvUploadModal";

  safeSetHTML(modal, `
    <div class="modal-content">
      <h2>${isJson ? 'JSON' : 'CSV'} Upload Options</h2>
      <label><input type="checkbox" id="csv-use-headers" checked /> Use ${isJson ? 'JSON keys / first row' : 'first row'} as headers</label>
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
  `);

  document.body.appendChild(modal);

  document.getElementById("csv-cancel").onclick = () => {
    modal.remove();
  };

  return modal;
};


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
  banner.style.backgroundColor = type === "success" ? "#4CAF50" : type === "error" ? "#F44336" : "#2196F3";

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseCSVLine,
    getTableData,
    formatAsCSV,
    formatAsJSON,
    formatAsTSV,
    setInputValue,
    setTextareaValue
  };
}

