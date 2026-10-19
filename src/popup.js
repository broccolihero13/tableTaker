let browser;

if (typeof browser === "undefined") {
  browser = typeof chrome !== "undefined" ? chrome : null;
}

const CompareEngine =
  typeof window !== "undefined" && window.GridGenieCompare
    ? window.GridGenieCompare
    : typeof require !== "undefined"
    ? require("./js/csvCompare.js")
    : null;

const JSONCompareEngine =
  typeof window !== "undefined" && window.GridGenieJSONCompare
    ? window.GridGenieJSONCompare
    : typeof require !== "undefined"
    ? require("./js/jsonCompare.js")
    : null;

const PAGE_SIZE = 250;

// Volatile in-memory state only (never persisted to storage)
const compareState = {
  fileA: { name: "", rawText: "", rows: [] },
  fileB: { name: "", rawText: "", rows: [] },
  hasHeaders: true,
  trimValues: true,
  caseSensitive: true,
  matchMode: "row", // 'row' | 'key'
  keyColumns: [0], // 0-based column indices
  sortRules: [], // [{ column: number, direction: 'asc' | 'desc' }]
  activeFilter: "all",
  visibleLimit: PAGE_SIZE,
  comparisonResult: null,
};

const jsonCompareState = {
  fileA: { name: "", rawText: "", parsed: undefined, keyCount: 0 },
  fileB: { name: "", rawText: "", parsed: undefined, keyCount: 0 },
  trimValues: false,
  caseSensitive: true,
  sortBy: "original",
  activeFilter: "all", // 'all' | 'differences' | 'modified' | 'added' | 'removed' | 'unchanged'
  visibleLimit: PAGE_SIZE,
  comparisonResult: null,
};

document.addEventListener("DOMContentLoaded", () => {
  initNavigationTabs();
  initCompareCSVUI();
  initCompareJSONUI();
  initTableToolsTab();

  // Automatically wipe sensitive CSV & JSON data from memory when the popup closes
  const wipeAll = () => {
    wipeAllSensitiveData();
    wipeAllSensitiveJSONData();
  };
  window.addEventListener("pagehide", wipeAll);
  window.addEventListener("beforeunload", wipeAll);
  window.addEventListener("unload", wipeAll);
});

let currentActiveTabMode = "table";

function isStandaloneWindow() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("standalone") === "1";
  } catch (_) {
    return false;
  }
}

function isFirefoxExtension() {
  if (typeof window !== "undefined" && window.location && window.location.protocol === "moz-extension:") {
    return true;
  }
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  return /Firefox\//i.test(ua);
}

function openStandaloneWorkspace(mode) {
  const targetMode = mode || currentActiveTabMode || "compare-csv";
  const relativeUrl = `popup.html?tab=${encodeURIComponent(targetMode)}&standalone=1`;
  const fullUrl =
    browser && browser.runtime && typeof browser.runtime.getURL === "function"
      ? browser.runtime.getURL(relativeUrl)
      : relativeUrl;

  if (browser && browser.windows && typeof browser.windows.create === "function") {
    try {
      const createRes = browser.windows.create({
        url: fullUrl,
        type: "popup",
        width: 900,
        height: 720,
      });
      if (createRes && typeof createRes.then === "function") {
        createRes.then(() => {
          if (typeof window.close === "function") window.close();
        });
      } else {
        setTimeout(() => {
          if (typeof window.close === "function") window.close();
        }, 50);
      }
      return;
    } catch (_) {
      // Fallback below if windows.create is unavailable
    }
  }

  if (browser && browser.tabs && typeof browser.tabs.create === "function") {
    browser.tabs.create({ url: fullUrl });
    if (typeof window.close === "function") window.close();
    return;
  }

  if (typeof window.open === "function") {
    window.open(fullUrl, "GridGenieWorkspace", "popup=yes,width=900,height=720");
  }
}

function initNavigationTabs() {
  const tabTable = document.getElementById("tab-table-tools");
  const tabCompareCSV = document.getElementById("tab-compare-csv");
  const tabCompareJSON = document.getElementById("tab-compare-json");
  const viewTable = document.getElementById("view-table-tools");
  const viewCompareCSV = document.getElementById("view-compare-csv");
  const viewCompareJSON = document.getElementById("view-compare-json");
  const popoutBtn = document.getElementById("popout-window-btn");

  if (!tabTable || !tabCompareCSV || !viewTable || !viewCompareCSV) return;

  const standalone = isStandaloneWindow();
  if (standalone) {
    document.body.classList.add("standalone-window");
    if (popoutBtn) popoutBtn.style.display = "none";
  } else if (popoutBtn) {
    popoutBtn.addEventListener("click", () => {
      openStandaloneWorkspace(currentActiveTabMode);
    });
  }

  const switchTab = (mode, options = {}) => {
    const isCompareTab = mode === "compare-csv" || mode === "compare-json";

    // In Firefox toolbar popups, opening a file dialog or switching to Finder closes the popup.
    // Automatically pop out into a persistent standalone window when entering Compare views.
    if (isCompareTab && !standalone && !options.skipAutoPopout && isFirefoxExtension()) {
      openStandaloneWorkspace(mode);
      return;
    }

    currentActiveTabMode = mode;
    document.body.classList.toggle("compare-mode", isCompareTab);

    tabTable.classList.toggle("active", mode === "table");
    tabTable.setAttribute("aria-selected", String(mode === "table"));
    viewTable.style.display = mode === "table" ? "block" : "none";

    tabCompareCSV.classList.toggle("active", mode === "compare-csv");
    tabCompareCSV.setAttribute("aria-selected", String(mode === "compare-csv"));
    viewCompareCSV.style.display = mode === "compare-csv" ? "block" : "none";

    if (tabCompareJSON && viewCompareJSON) {
      tabCompareJSON.classList.toggle("active", mode === "compare-json");
      tabCompareJSON.setAttribute("aria-selected", String(mode === "compare-json"));
      viewCompareJSON.style.display = mode === "compare-json" ? "block" : "none";
    }
  };

  tabTable.addEventListener("click", () => switchTab("table"));
  tabCompareCSV.addEventListener("click", () => switchTab("compare-csv"));
  if (tabCompareJSON) {
    tabCompareJSON.addEventListener("click", () => switchTab("compare-json"));
  }

  try {
    const params = new URLSearchParams(window.location.search || "");
    const initialTab = params.get("tab");
    if (initialTab === "compare-csv" || initialTab === "compare-json" || initialTab === "table") {
      switchTab(initialTab, { skipAutoPopout: true });
    }
  } catch (_) {
    // Ignore URLSearchParams errors
  }
}

function getTargetWebpageTab(callback) {
  if (!browser || !browser.tabs) return;

  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const first = tabs && tabs[0];
    const url = (first && first.url) || "";
    const isExtensionPopupTab = /^(chrome|moz)-extension:\/\//i.test(url);

    if (first && !isExtensionPopupTab && !isStandaloneWindow()) {
      callback(first);
      return;
    }

    // If running inside a standalone popup window, find the active tab in the main browser window
    browser.tabs.query({ active: true }, (allActiveTabs) => {
      const webTab =
        (allActiveTabs || []).find(
          (t) => t && t.url && !/^(chrome|moz)-extension:\/\//i.test(t.url)
        ) || first;
      callback(webTab);
    });
  });
}

function initTableToolsTab() {
  if (!browser || !browser.tabs) return;

  getTargetWebpageTab((activeTab) => {
    const url = (activeTab && activeTab.url) || "";

    const restricted = [
      /^chrome:\/\//,
      /^arc:\/\//,
      /^edge:\/\//,
      /^about:/,
      /addons\.mozilla\.org/,
      /chromewebstore\.google\.com/,
    ].some((re) => re.test(url));

    if (restricted || !activeTab) {
      showUnavailableMessage();
      return;
    }

    browser.tabs.sendMessage(activeTab.id, { action: "checkButtons" }, (response) => {
      const couldNotConnect = !!(browser.runtime && browser.runtime.lastError);
      const stale =
        couldNotConnect ||
        !response ||
        (!response.hasTables && response.buttonsStillAttached);

      if (stale) {
        showStalePageUI(activeTab.id);
      } else {
        loadExtensionUI(url);
      }
    });
  });
}

const showUnavailableMessage = () => {
  const statusEl = document.getElementById("table-tools-status");
  const controlsEl = document.getElementById("table-tools-controls");
  if (controlsEl) controlsEl.style.display = "none";
  if (statusEl) {
    statusEl.style.display = "block";
    statusEl.textContent = "";
    const heading = document.createElement("h3");
    heading.textContent = "Table Tools Unavailable";
    const msg = document.createElement("p");
    msg.textContent =
      "Browser security restricts page injection on this tab. You can still use the Compare CSVs and Compare JSON tabs above.";
    statusEl.appendChild(heading);
    statusEl.appendChild(msg);
  }
};

const showStalePageUI = (tabId) => {
  const statusEl = document.getElementById("table-tools-status");
  const controlsEl = document.getElementById("table-tools-controls");
  if (controlsEl) controlsEl.style.display = "none";
  if (statusEl) {
    statusEl.style.display = "block";
    statusEl.textContent = "";
    const heading = document.createElement("h3");
    heading.textContent = "Session Expired";
    const msg = document.createElement("p");
    msg.textContent = "The active page changed since extension activation. Refresh to reconnect.";
    const refreshBtn = document.createElement("button");
    refreshBtn.id = "gg-refresh";
    refreshBtn.className = "action-button";
    refreshBtn.textContent = "Refresh Page";
    refreshBtn.addEventListener("click", () => {
      if (tabId !== undefined) {
        browser.tabs.reload(tabId);
      } else {
        browser.tabs.reload();
      }
      if (!isStandaloneWindow()) {
        window.close();
      }
    });
    statusEl.appendChild(heading);
    statusEl.appendChild(msg);
    statusEl.appendChild(refreshBtn);
  }
};

const loadExtensionUI = (url) => {
  const activateBtn = document.getElementById("activate");
  const deactivateBtn = document.getElementById("deactivate");

  if (url && url.includes("docs.google.com/spreadsheets")) {
    if (activateBtn) {
      activateBtn.innerText = "Export Sheet to JSON";
    }
    if (deactivateBtn) {
      deactivateBtn.style.display = "none";
    }
  }

  if (activateBtn) {
    activateBtn.addEventListener("click", () => {
      getTargetWebpageTab((tab) => {
        if (tab?.id) {
          browser.tabs.sendMessage(tab.id, { action: "activate" });
        }
      });
    });
  }

  if (deactivateBtn) {
    deactivateBtn.addEventListener("click", () => {
      getTargetWebpageTab((tab) => {
        if (tab?.id) {
          browser.tabs.sendMessage(tab.id, { action: "deactivate" });
        }
      });
    });
  }
};

/* ==========================================================================
   Secure CSV Comparison & Multi-Column Sort UI Logic
   ========================================================================== */

function showCompareError(message) {
  const banner = document.getElementById("cmp-error-banner");
  if (!banner) return;
  if (!message) {
    banner.style.display = "none";
    banner.textContent = "";
    return;
  }
  banner.textContent = message;
  banner.style.display = "block";
}

function initCompareCSVUI() {
  if (!CompareEngine) return;

  setupDropzone("a");
  setupDropzone("b");

  const hasHeadersCheckbox = document.getElementById("cmp-has-headers");
  const trimCheckbox = document.getElementById("cmp-trim-values");
  const caseCheckbox = document.getElementById("cmp-case-sensitive");
  const matchModeSelect = document.getElementById("cmp-match-mode");
  const addSortBtn = document.getElementById("add-sort-rule-btn");
  const filterGroup = document.getElementById("cmp-filter-group");
  const exportBtn = document.getElementById("export-diff-btn");
  const wipeBtn = document.getElementById("wipe-data-btn");
  const loadMoreBtn = document.getElementById("cmp-load-more-btn");

  if (hasHeadersCheckbox) {
    hasHeadersCheckbox.addEventListener("change", () => {
      compareState.hasHeaders = hasHeadersCheckbox.checked;
      refreshColumnSelectorsAndCompare();
    });
  }

  if (trimCheckbox) {
    trimCheckbox.addEventListener("change", () => {
      compareState.trimValues = trimCheckbox.checked;
      reparseLoadedFiles();
      refreshColumnSelectorsAndCompare();
    });
  }

  if (caseCheckbox) {
    caseCheckbox.addEventListener("change", () => {
      compareState.caseSensitive = caseCheckbox.checked;
      runComparisonIfReady();
    });
  }

  if (matchModeSelect) {
    matchModeSelect.addEventListener("change", () => {
      compareState.matchMode = matchModeSelect.value === "key" ? "key" : "row";
      const keyRow = document.getElementById("cmp-key-columns-row");
      if (keyRow) {
        keyRow.style.display = compareState.matchMode === "key" ? "block" : "none";
      }
      renderKeyColumnPills();
      runComparisonIfReady();
    });
  }

  if (addSortBtn) {
    addSortBtn.addEventListener("click", () => {
      const colMeta = getAvailableColumnsMeta();
      const totalCols = colMeta.length || 26;
      const usedCols = new Set(compareState.sortRules.map((r) => r.column));
      let nextCol = 0;
      for (let i = 0; i < totalCols; i++) {
        if (!usedCols.has(i)) {
          nextCol = i;
          break;
        }
      }
      compareState.sortRules.push({ column: nextCol, direction: "asc" });
      renderSortRulesUI();
      runComparisonIfReady();
    });
  }

  if (filterGroup) {
    filterGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".cmp-filter-btn");
      if (!btn) return;
      const filter = btn.getAttribute("data-filter");
      if (!filter) return;
      compareState.activeFilter = filter;
      compareState.visibleLimit = PAGE_SIZE;

      filterGroup.querySelectorAll(".cmp-filter-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      renderDiffTable();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", handleExportComparison);
  }

  if (wipeBtn) {
    wipeBtn.addEventListener("click", () => {
      wipeAllSensitiveData();
      showCompareError("");
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      compareState.visibleLimit += PAGE_SIZE;
      renderDiffTable();
    });
  }
}

function setupDropzone(slot) {
  const dropzone = document.getElementById(`dropzone-${slot}`);
  const fileInput = document.getElementById(`file-input-${slot}`);
  const clearBtn = document.getElementById(`clear-file-${slot}`);
  const pasteBtn = document.getElementById(`paste-btn-${slot}`);
  const pasteBox = document.getElementById(`paste-box-${slot}`);
  const pasteTextarea = document.getElementById(`paste-textarea-${slot}`);
  const pasteApply = document.getElementById(`paste-apply-${slot}`);
  const pasteCancel = document.getElementById(`paste-cancel-${slot}`);
  const emptyView = document.getElementById(`dz-empty-${slot}`);

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", (e) => {
    if (
      e.target.closest(".dz-clear-btn") ||
      e.target.closest(".dz-paste-btn") ||
      e.target.closest(".dz-paste-box")
    ) {
      return;
    }
    fileInput.click();
  });

  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target === dropzone) {
        e.preventDefault();
        fileInput.click();
      }
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("drag-over");
  });

  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("drag-over");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("drag-over");

    const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length === 0) return;

    if (files.length >= 2) {
      readAndLoadCSVFile(files[0], "a");
      readAndLoadCSVFile(files[1], "b");
    } else {
      readAndLoadCSVFile(files[0], slot);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      readAndLoadCSVFile(fileInput.files[0], slot);
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clearSingleFile(slot);
    });
  }

  if (pasteBtn && pasteBox && emptyView && pasteTextarea) {
    pasteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      emptyView.style.display = "none";
      pasteBox.style.display = "block";
      pasteTextarea.focus();
    });
  }

  if (pasteCancel && pasteBox && emptyView && pasteTextarea) {
    pasteCancel.addEventListener("click", (e) => {
      e.stopPropagation();
      pasteTextarea.value = "";
      pasteBox.style.display = "none";
      emptyView.style.display = "block";
    });
  }

  if (pasteApply && pasteBox && emptyView && pasteTextarea) {
    pasteApply.addEventListener("click", (e) => {
      e.stopPropagation();
      const raw = pasteTextarea.value;
      pasteTextarea.value = "";
      pasteBox.style.display = "none";
      if (!raw || !raw.trim()) {
        emptyView.style.display = "block";
        return;
      }
      loadCSVTextIntoSlot(
        raw,
        slot === "a" ? "Pasted CSV 1.csv" : "Pasted CSV 2.csv",
        slot
      );
    });
  }
}

function readAndLoadCSVFile(file, slot) {
  showCompareError("");
  const validation = CompareEngine.validateCSVFile(file);
  if (!validation.valid) {
    showCompareError(validation.error);
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = typeof ev.target.result === "string" ? ev.target.result : "";
    loadCSVTextIntoSlot(text, file.name, slot);
  };
  reader.onerror = () => {
    showCompareError(`Failed to read file "${file.name}".`);
  };
  reader.readAsText(file);
}

function loadCSVTextIntoSlot(rawText, fileName, slot) {
  try {
    showCompareError("");
    const parsedRows = CompareEngine.parseCSVRobust(rawText, {
      trimValues: compareState.trimValues,
      ignoreEmptyRows: true,
    });

    if (parsedRows.length === 0) {
      showCompareError(`"${fileName}" contains no CSV rows.`);
      return;
    }

    const target = slot === "a" ? compareState.fileA : compareState.fileB;
    clearSlotMemory(target);

    target.name = fileName;
    target.rawText = rawText;
    target.rows = parsedRows;

    updateDropzoneDisplay(slot);
    refreshColumnSelectorsAndCompare();
  } catch (err) {
    showCompareError(err.message || "Failed to parse CSV content.");
  }
}

function reparseLoadedFiles() {
  for (const slot of ["a", "b"]) {
    const target = slot === "a" ? compareState.fileA : compareState.fileB;
    if (target.rawText) {
      try {
        target.rows = CompareEngine.parseCSVRobust(target.rawText, {
          trimValues: compareState.trimValues,
          ignoreEmptyRows: true,
        });
        updateDropzoneDisplay(slot);
      } catch (err) {
        showCompareError(err.message);
      }
    }
  }
}

function updateDropzoneDisplay(slot) {
  const target = slot === "a" ? compareState.fileA : compareState.fileB;
  const emptyEl = document.getElementById(`dz-empty-${slot}`);
  const loadedEl = document.getElementById(`dz-loaded-${slot}`);
  const pasteBox = document.getElementById(`paste-box-${slot}`);
  const nameEl = document.getElementById(`filename-${slot}`);
  const metaEl = document.getElementById(`filemeta-${slot}`);

  if (pasteBox) pasteBox.style.display = "none";

  if (!target.rows || target.rows.length === 0) {
    if (emptyEl) emptyEl.style.display = "block";
    if (loadedEl) loadedEl.style.display = "none";
    if (nameEl) nameEl.textContent = "";
    if (metaEl) metaEl.textContent = "";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  if (loadedEl) loadedEl.style.display = "block";

  const rowCount = compareState.hasHeaders
    ? Math.max(0, target.rows.length - 1)
    : target.rows.length;
  const colCount = target.rows.reduce((max, r) => Math.max(max, r.length), 0);

  if (nameEl) nameEl.textContent = target.name;
  if (metaEl) {
    metaEl.textContent = `${rowCount} data row${rowCount === 1 ? "" : "s"} • ${colCount} column${
      colCount === 1 ? "" : "s"
    }`;
  }
}

function getAvailableColumnsMeta() {
  const rowsA = compareState.fileA.rows || [];
  const rowsB = compareState.fileB.rows || [];
  let maxCols = 0;
  for (const r of rowsA) if (r.length > maxCols) maxCols = r.length;
  for (const r of rowsB) if (r.length > maxCols) maxCols = r.length;

  if (maxCols === 0) {
    return Array.from({ length: 8 }, (_, idx) => {
      const letter = CompareEngine.indexToColumnLetter(idx);
      return { index: idx, letter, label: `Column ${letter}` };
    });
  }

  const headersA = compareState.hasHeaders && rowsA.length > 0 ? rowsA[0] : [];
  const headersB = compareState.hasHeaders && rowsB.length > 0 ? rowsB[0] : [];

  const meta = [];
  for (let c = 0; c < maxCols; c++) {
    const letter = CompareEngine.indexToColumnLetter(c);
    const hA = headersA[c] ? String(headersA[c]).trim() : "";
    const hB = headersB[c] ? String(headersB[c]).trim() : "";
    let name = hA || hB || "";
    if (hA && hB && hA !== hB) {
      name = `${hA} / ${hB}`;
    }
    meta.push({
      index: c,
      letter,
      name,
      label: name ? `Column ${letter} (${name})` : `Column ${letter}`,
    });
  }
  return meta;
}

function getOrdinalSortLabel(idx) {
  if (idx === 0) return "1st Sort (Primary)";
  if (idx === 1) return "2nd Sort (Secondary)";
  if (idx === 2) return "3rd Sort (Tertiary)";
  return `${idx + 1}th Sort`;
}

function renderSortRulesUI() {
  const listEl = document.getElementById("sort-rules-list");
  const hintEl = document.getElementById("sort-empty-hint");
  if (!listEl) return;

  listEl.textContent = "";
  const colMeta = getAvailableColumnsMeta();

  if (compareState.sortRules.length === 0) {
    if (hintEl) hintEl.style.display = "block";
    return;
  }
  if (hintEl) hintEl.style.display = "none";

  compareState.sortRules.forEach((rule, idx) => {
    const rowEl = document.createElement("div");
    rowEl.className = "sort-rule-row";

    const badge = document.createElement("span");
    badge.className = "sort-priority-badge";
    badge.textContent = getOrdinalSortLabel(idx);

    const colSelect = document.createElement("select");
    colSelect.className = "gg-select sort-col-select";
    colSelect.setAttribute("aria-label", `${getOrdinalSortLabel(idx)} column`);

    colMeta.forEach((col) => {
      const opt = document.createElement("option");
      opt.value = String(col.index);
      opt.textContent = col.label;
      if (col.index === rule.column) {
        opt.selected = true;
      }
      colSelect.appendChild(opt);
    });

    colSelect.addEventListener("change", () => {
      rule.column = parseInt(colSelect.value, 10) || 0;
      runComparisonIfReady();
    });

    const dirSelect = document.createElement("select");
    dirSelect.className = "gg-select sort-dir-select";
    dirSelect.setAttribute("aria-label", `${getOrdinalSortLabel(idx)} direction`);

    const optAsc = document.createElement("option");
    optAsc.value = "asc";
    optAsc.textContent = "Ascending (A → Z, 0 → 9)";
    if (rule.direction !== "desc") optAsc.selected = true;

    const optDesc = document.createElement("option");
    optDesc.value = "desc";
    optDesc.textContent = "Descending (Z → A, 9 → 0)";
    if (rule.direction === "desc") optDesc.selected = true;

    dirSelect.appendChild(optAsc);
    dirSelect.appendChild(optDesc);

    dirSelect.addEventListener("change", () => {
      rule.direction = dirSelect.value === "desc" ? "desc" : "asc";
      runComparisonIfReady();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "sort-remove-btn";
    removeBtn.title = "Remove sort level";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      compareState.sortRules.splice(idx, 1);
      renderSortRulesUI();
      runComparisonIfReady();
    });

    rowEl.appendChild(badge);
    rowEl.appendChild(colSelect);
    rowEl.appendChild(dirSelect);
    rowEl.appendChild(removeBtn);
    listEl.appendChild(rowEl);
  });
}

function renderKeyColumnPills() {
  const container = document.getElementById("cmp-key-columns-list");
  if (!container) return;
  container.textContent = "";

  const colMeta = getAvailableColumnsMeta();
  compareState.keyColumns = compareState.keyColumns.filter((c) => c >= 0 && c < colMeta.length);
  if (compareState.keyColumns.length === 0 && colMeta.length > 0) {
    compareState.keyColumns = [0];
  }

  colMeta.forEach((col) => {
    const pill = document.createElement("button");
    pill.type = "button";
    const isSelected = compareState.keyColumns.includes(col.index);
    pill.className = `cmp-key-pill${isSelected ? " selected" : ""}`;
    pill.textContent = col.label;
    pill.addEventListener("click", () => {
      const exists = compareState.keyColumns.includes(col.index);
      if (exists && compareState.keyColumns.length > 1) {
        compareState.keyColumns = compareState.keyColumns.filter((c) => c !== col.index);
      } else if (!exists) {
        compareState.keyColumns.push(col.index);
      }
      renderKeyColumnPills();
      runComparisonIfReady();
    });
    container.appendChild(pill);
  });
}

function refreshColumnSelectorsAndCompare() {
  updateDropzoneDisplay("a");
  updateDropzoneDisplay("b");
  renderKeyColumnPills();
  renderSortRulesUI();
  runComparisonIfReady();
}

function runComparisonIfReady() {
  const hasA = compareState.fileA.rows && compareState.fileA.rows.length > 0;
  const hasB = compareState.fileB.rows && compareState.fileB.rows.length > 0;
  const resultsSection = document.getElementById("cmp-results-section");

  if (!hasA || !hasB) {
    if (resultsSection) resultsSection.style.display = "none";
    return;
  }

  try {
    if (compareState.comparisonResult) {
      CompareEngine.wipeComparisonData(compareState.comparisonResult);
    }

    compareState.comparisonResult = CompareEngine.compareCSVs(
      compareState.fileA.rows,
      compareState.fileB.rows,
      {
        hasHeaders: compareState.hasHeaders,
        trimValues: compareState.trimValues,
        caseSensitive: compareState.caseSensitive,
        matchMode: compareState.matchMode,
        keyColumns: compareState.keyColumns,
        sortRules: compareState.sortRules,
      }
    );

    compareState.visibleLimit = PAGE_SIZE;
    if (resultsSection) resultsSection.style.display = "block";
    updateFilterCounts();
    renderDiffTable();
  } catch (err) {
    showCompareError(err.message || "Comparison failed.");
  }
}

function updateFilterCounts() {
  if (!compareState.comparisonResult) return;
  const { summary } = compareState.comparisonResult;
  const diffs = summary.modified + summary.added + summary.removed;

  const setBtnText = (id, label, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${label} (${count})`;
  };

  setBtnText("filter-all", "All", summary.totalRows);
  setBtnText("filter-differences", "Differences", diffs);
  setBtnText("filter-modified", "Modified", summary.modified);
  setBtnText("filter-added", "Added", summary.added);
  setBtnText("filter-removed", "Removed", summary.removed);
  setBtnText("filter-unchanged", "Unchanged", summary.unchanged);

  const identicalBanner = document.getElementById("cmp-identical-banner");
  if (identicalBanner) {
    identicalBanner.style.display = summary.identical ? "block" : "none";
  }
}

function renderDiffTable() {
  const thead = document.getElementById("cmp-diff-thead");
  const tbody = document.getElementById("cmp-diff-tbody");
  const paginationBar = document.getElementById("cmp-pagination-bar");
  const showingCount = document.getElementById("cmp-showing-count");
  const loadMoreBtn = document.getElementById("cmp-load-more-btn");

  if (!thead || !tbody || !compareState.comparisonResult) return;

  thead.textContent = "";
  tbody.textContent = "";

  const { headers, diffRows } = compareState.comparisonResult;

  const headerTr = document.createElement("tr");

  const thRowNum = document.createElement("th");
  thRowNum.textContent = "Row (F1 / F2)";
  headerTr.appendChild(thRowNum);

  const thStatus = document.createElement("th");
  thStatus.textContent = "Status";
  headerTr.appendChild(thStatus);

  headers.forEach((h) => {
    const th = document.createElement("th");
    const sortRuleIdx = compareState.sortRules.findIndex((r) => r.column === h.index);
    let sortIndicator = "";
    if (sortRuleIdx !== -1) {
      const dirArrow = compareState.sortRules[sortRuleIdx].direction === "desc" ? "↓" : "↑";
      sortIndicator = ` [${sortRuleIdx + 1}${dirArrow}]`;
    }
    th.textContent = `${h.label}${sortIndicator}`;
    th.style.cursor = "pointer";
    th.title = "Click to toggle sorting on this column";
    th.addEventListener("click", () => {
      toggleColumnSortFromHeader(h.index);
    });
    headerTr.appendChild(th);
  });

  thead.appendChild(headerTr);

  const filter = compareState.activeFilter;
  const filtered = diffRows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "differences") return row.status !== "unchanged";
    return row.status === filter;
  });

  if (filtered.length === 0) {
    const emptyTr = document.createElement("tr");
    const emptyTd = document.createElement("td");
    emptyTd.colSpan = headers.length + 2;
    emptyTd.style.textAlign = "center";
    emptyTd.style.padding = "18px";
    emptyTd.style.color = "#94a3b8";
    emptyTd.textContent = "No rows match the selected filter.";
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
    if (paginationBar) paginationBar.style.display = "none";
    return;
  }

  const sliceEnd = Math.min(filtered.length, compareState.visibleLimit);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < sliceEnd; i++) {
    const row = filtered[i];
    const tr = document.createElement("tr");
    tr.className = `cmp-row-${row.status}`;

    const tdRowNum = document.createElement("td");
    tdRowNum.className = "cmp-rownum-cell";
    const rA = row.rowNumberA !== null ? String(row.rowNumberA) : "—";
    const rB = row.rowNumberB !== null ? String(row.rowNumberB) : "—";
    tdRowNum.textContent = `${rA} / ${rB}`;
    tr.appendChild(tdRowNum);

    const tdStatus = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `cmp-status-pill cmp-status-${row.status}`;
    pill.textContent =
      row.status === "unchanged"
        ? "Match"
        : row.status === "modified"
        ? "~ Modified"
        : row.status === "added"
        ? "+ Added"
        : "- Removed";
    tdStatus.appendChild(pill);
    tr.appendChild(tdStatus);

    row.cells.forEach((cell) => {
      const td = document.createElement("td");
      if (cell.status === "modified") {
        td.className = "cmp-cell-modified";

        const oldSpan = document.createElement("span");
        oldSpan.className = "diff-old-val";
        oldSpan.textContent = cell.valueA !== "" ? cell.valueA : "(empty)";

        const arrowSpan = document.createElement("span");
        arrowSpan.className = "diff-arrow";
        arrowSpan.textContent = "→";

        const newSpan = document.createElement("span");
        newSpan.className = "diff-new-val";
        newSpan.textContent = cell.valueB !== "" ? cell.valueB : "(empty)";

        td.appendChild(oldSpan);
        td.appendChild(arrowSpan);
        td.appendChild(newSpan);
      } else if (row.status === "removed") {
        td.textContent = cell.valueA;
      } else {
        td.textContent = cell.valueB !== "" ? cell.valueB : cell.valueA;
      }
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  }

  tbody.appendChild(fragment);

  if (paginationBar && showingCount && loadMoreBtn) {
    if (filtered.length > PAGE_SIZE) {
      paginationBar.style.display = "flex";
      showingCount.textContent = `Showing ${sliceEnd} of ${filtered.length} rows`;
      loadMoreBtn.style.display = sliceEnd < filtered.length ? "inline-block" : "none";
    } else {
      paginationBar.style.display = "none";
    }
  }
}

function toggleColumnSortFromHeader(colIndex) {
  const existingIdx = compareState.sortRules.findIndex((r) => r.column === colIndex);
  if (existingIdx === -1) {
    compareState.sortRules.push({ column: colIndex, direction: "asc" });
  } else if (compareState.sortRules[existingIdx].direction === "asc") {
    compareState.sortRules[existingIdx].direction = "desc";
  } else {
    compareState.sortRules.splice(existingIdx, 1);
  }
  renderSortRulesUI();
  runComparisonIfReady();
}

function handleExportComparison() {
  if (!compareState.comparisonResult) return;
  const sanitizeCheckbox = document.getElementById("cmp-sanitize-export");
  const sanitizeFormulas = sanitizeCheckbox ? sanitizeCheckbox.checked : true;

  const csvContent = CompareEngine.exportComparisonCSV(compareState.comparisonResult, {
    filter: compareState.activeFilter,
    sanitizeFormulas,
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "csv-comparison-report.csv";
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function clearSlotMemory(slotObj) {
  if (!slotObj) return;
  slotObj.name = "";
  slotObj.rawText = "";
  if (Array.isArray(slotObj.rows)) {
    for (let i = 0; i < slotObj.rows.length; i++) {
      if (Array.isArray(slotObj.rows[i])) {
        slotObj.rows[i].fill("");
        slotObj.rows[i].length = 0;
      }
    }
    slotObj.rows.length = 0;
  }
}

function clearSingleFile(slot) {
  const target = slot === "a" ? compareState.fileA : compareState.fileB;
  clearSlotMemory(target);

  const fileInput = document.getElementById(`file-input-${slot}`);
  if (fileInput) fileInput.value = "";

  const textarea = document.getElementById(`paste-textarea-${slot}`);
  if (textarea) textarea.value = "";

  if (compareState.comparisonResult) {
    CompareEngine.wipeComparisonData(compareState.comparisonResult);
    compareState.comparisonResult = null;
  }

  const thead = document.getElementById("cmp-diff-thead");
  const tbody = document.getElementById("cmp-diff-tbody");
  if (thead) thead.textContent = "";
  if (tbody) tbody.textContent = "";

  refreshColumnSelectorsAndCompare();
}

function wipeAllSensitiveData() {
  clearSlotMemory(compareState.fileA);
  clearSlotMemory(compareState.fileB);

  if (compareState.comparisonResult && CompareEngine) {
    CompareEngine.wipeComparisonData(compareState.comparisonResult);
    compareState.comparisonResult = null;
  }

  compareState.sortRules = [];
  compareState.keyColumns = [0];
  compareState.activeFilter = "all";

  for (const slot of ["a", "b"]) {
    const fileInput = document.getElementById(`file-input-${slot}`);
    if (fileInput) fileInput.value = "";
    const textarea = document.getElementById(`paste-textarea-${slot}`);
    if (textarea) textarea.value = "";
  }

  const thead = document.getElementById("cmp-diff-thead");
  const tbody = document.getElementById("cmp-diff-tbody");
  if (thead) thead.textContent = "";
  if (tbody) tbody.textContent = "";

  const resultsSection = document.getElementById("cmp-results-section");
  if (resultsSection) resultsSection.style.display = "none";

  refreshColumnSelectorsAndCompare();
}

/* ==========================================================================
   Secure JSON Comparison UI Logic (Unified Table View including Multilines)
   ========================================================================== */

function showJSONCompareError(message) {
  const banner = document.getElementById("json-error-banner");
  if (!banner) return;
  if (!message) {
    banner.style.display = "none";
    banner.textContent = "";
    return;
  }
  banner.textContent = message;
  banner.style.display = "block";
}

function initCompareJSONUI() {
  if (!JSONCompareEngine) return;

  setupJSONDropzone("a");
  setupJSONDropzone("b");

  const trimCheck = document.getElementById("json-trim-values");
  const caseCheck = document.getElementById("json-case-sensitive");
  const sortSelect = document.getElementById("json-sort-by");
  const filterGroup = document.getElementById("json-filter-group");
  const exportCsvBtn = document.getElementById("export-json-csv-btn");
  const exportJsonBtn = document.getElementById("export-json-diff-btn");
  const wipeBtn = document.getElementById("wipe-json-data-btn");
  const loadMoreBtn = document.getElementById("json-load-more-btn");

  if (trimCheck) {
    trimCheck.addEventListener("change", () => {
      jsonCompareState.trimValues = trimCheck.checked;
      runJSONComparisonIfReady();
    });
  }

  if (caseCheck) {
    caseCheck.addEventListener("change", () => {
      jsonCompareState.caseSensitive = caseCheck.checked;
      runJSONComparisonIfReady();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      jsonCompareState.sortBy = sortSelect.value || "original";
      runJSONComparisonIfReady();
    });
  }

  if (filterGroup) {
    filterGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".cmp-filter-btn");
      if (!btn) return;
      const filter = btn.getAttribute("data-filter");
      if (!filter) return;
      jsonCompareState.activeFilter = filter;
      jsonCompareState.visibleLimit = PAGE_SIZE;

      filterGroup.querySelectorAll(".cmp-filter-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      renderJSONDiffTable();
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", handleExportJSONAsCSV);
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", handleExportJSONComparison);
  }

  if (wipeBtn) {
    wipeBtn.addEventListener("click", () => {
      wipeAllSensitiveJSONData();
      showJSONCompareError("");
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      jsonCompareState.visibleLimit += PAGE_SIZE;
      renderJSONDiffTable();
    });
  }
}

function setupJSONDropzone(slot) {
  const dropzone = document.getElementById(`json-dropzone-${slot}`);
  const fileInput = document.getElementById(`json-file-input-${slot}`);
  const clearBtn = document.getElementById(`json-clear-file-${slot}`);
  const pasteBtn = document.getElementById(`json-paste-btn-${slot}`);
  const pasteBox = document.getElementById(`json-paste-box-${slot}`);
  const pasteTextarea = document.getElementById(`json-paste-textarea-${slot}`);
  const pasteApply = document.getElementById(`json-paste-apply-${slot}`);
  const pasteCancel = document.getElementById(`json-paste-cancel-${slot}`);
  const emptyView = document.getElementById(`json-dz-empty-${slot}`);

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", (e) => {
    if (
      e.target.closest(".dz-clear-btn") ||
      e.target.closest(".dz-paste-btn") ||
      e.target.closest(".dz-paste-box")
    ) {
      return;
    }
    fileInput.click();
  });

  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target === dropzone) {
        e.preventDefault();
        fileInput.click();
      }
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("drag-over");
  });

  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("drag-over");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("drag-over");

    const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length === 0) return;

    if (files.length >= 2) {
      readAndLoadJSONFile(files[0], "a");
      readAndLoadJSONFile(files[1], "b");
    } else {
      readAndLoadJSONFile(files[0], slot);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      readAndLoadJSONFile(fileInput.files[0], slot);
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clearSingleJSONFile(slot);
    });
  }

  if (pasteBtn && pasteBox && emptyView && pasteTextarea) {
    pasteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      emptyView.style.display = "none";
      pasteBox.style.display = "block";
      pasteTextarea.focus();
    });
  }

  if (pasteCancel && pasteBox && emptyView && pasteTextarea) {
    pasteCancel.addEventListener("click", (e) => {
      e.stopPropagation();
      pasteTextarea.value = "";
      pasteBox.style.display = "none";
      emptyView.style.display = "block";
    });
  }

  if (pasteApply && pasteBox && emptyView && pasteTextarea) {
    pasteApply.addEventListener("click", (e) => {
      e.stopPropagation();
      const raw = pasteTextarea.value;
      pasteTextarea.value = "";
      pasteBox.style.display = "none";
      if (!raw || !raw.trim()) {
        emptyView.style.display = "block";
        return;
      }
      loadJSONTextIntoSlot(
        raw,
        slot === "a" ? "Pasted JSON 1.json" : "Pasted JSON 2.json",
        slot
      );
    });
  }
}

function readAndLoadJSONFile(file, slot) {
  showJSONCompareError("");
  const validation = JSONCompareEngine.validateJSONFile(file);
  if (!validation.valid) {
    showJSONCompareError(validation.error);
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = typeof ev.target.result === "string" ? ev.target.result : "";
    loadJSONTextIntoSlot(text, file.name, slot);
  };
  reader.onerror = () => {
    showJSONCompareError(`Failed to read file "${file.name}".`);
  };
  reader.readAsText(file);
}

function loadJSONTextIntoSlot(rawText, fileName, slot) {
  try {
    showJSONCompareError("");
    const parsed = JSONCompareEngine.parseJSONRobust(rawText);
    const map = JSONCompareEngine.flattenJSONToMap(parsed);

    const target = slot === "a" ? jsonCompareState.fileA : jsonCompareState.fileB;
    clearJSONSlotMemory(target);

    target.name = fileName;
    target.rawText = rawText;
    target.parsed = parsed;
    target.keyCount = map.size;

    updateJSONDropzoneDisplay(slot);
    runJSONComparisonIfReady();
  } catch (err) {
    showJSONCompareError(err.message || "Failed to parse JSON content.");
  }
}

function updateJSONDropzoneDisplay(slot) {
  const target = slot === "a" ? jsonCompareState.fileA : jsonCompareState.fileB;
  const emptyEl = document.getElementById(`json-dz-empty-${slot}`);
  const loadedEl = document.getElementById(`json-dz-loaded-${slot}`);
  const pasteBox = document.getElementById(`json-paste-box-${slot}`);
  const nameEl = document.getElementById(`json-filename-${slot}`);
  const metaEl = document.getElementById(`json-filemeta-${slot}`);

  if (pasteBox) pasteBox.style.display = "none";

  if (target.parsed === undefined && !target.rawText) {
    if (emptyEl) emptyEl.style.display = "block";
    if (loadedEl) loadedEl.style.display = "none";
    if (nameEl) nameEl.textContent = "";
    if (metaEl) metaEl.textContent = "";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  if (loadedEl) loadedEl.style.display = "block";

  if (nameEl) nameEl.textContent = target.name;
  if (metaEl) {
    metaEl.textContent = `${target.keyCount} key${target.keyCount === 1 ? "" : "s"}`;
  }
}

function runJSONComparisonIfReady() {
  const hasA = jsonCompareState.fileA.parsed !== undefined || Boolean(jsonCompareState.fileA.rawText);
  const hasB = jsonCompareState.fileB.parsed !== undefined || Boolean(jsonCompareState.fileB.rawText);
  const resultsSection = document.getElementById("json-results-section");

  if (!hasA || !hasB) {
    if (resultsSection) resultsSection.style.display = "none";
    return;
  }

  try {
    if (jsonCompareState.comparisonResult) {
      JSONCompareEngine.wipeJSONComparisonData(jsonCompareState.comparisonResult);
    }

    jsonCompareState.comparisonResult = JSONCompareEngine.compareJSON(
      jsonCompareState.fileA.parsed,
      jsonCompareState.fileB.parsed,
      {
        trimValues: jsonCompareState.trimValues,
        caseSensitive: jsonCompareState.caseSensitive,
        sortBy: jsonCompareState.sortBy,
      }
    );

    jsonCompareState.visibleLimit = PAGE_SIZE;

    if (resultsSection) resultsSection.style.display = "block";
    updateJSONFilterCounts();
    renderJSONDiffTable();
  } catch (err) {
    showJSONCompareError(err.message || "JSON comparison failed.");
  }
}

function updateJSONFilterCounts() {
  if (!jsonCompareState.comparisonResult) return;
  const { summary } = jsonCompareState.comparisonResult;
  const diffs = summary.modified + summary.added + summary.removed;

  const setBtnText = (id, label, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${label} (${count})`;
  };

  setBtnText("json-filter-all", "All", summary.totalKeys);
  setBtnText("json-filter-differences", "Differences", diffs);
  setBtnText("json-filter-modified", "Modified", summary.modified);
  setBtnText("json-filter-added", "Added", summary.added);
  setBtnText("json-filter-removed", "Removed", summary.removed);
  setBtnText("json-filter-unchanged", "Unchanged", summary.unchanged);

  const identicalBanner = document.getElementById("json-identical-banner");
  if (identicalBanner) {
    identicalBanner.style.display = summary.identical ? "block" : "none";
  }
}

function renderJSONDiffTable() {
  const tbody = document.getElementById("json-diff-tbody");
  const paginationBar = document.getElementById("json-pagination-bar");
  const showingCount = document.getElementById("json-showing-count");
  const loadMoreBtn = document.getElementById("json-load-more-btn");

  if (!tbody || !jsonCompareState.comparisonResult) return;
  tbody.textContent = "";

  const { entries } = jsonCompareState.comparisonResult;
  const filter = jsonCompareState.activeFilter;

  const filtered = entries.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "differences") return entry.status !== "unchanged";
    return entry.status === filter;
  });

  if (filtered.length === 0) {
    const emptyTr = document.createElement("tr");
    const emptyTd = document.createElement("td");
    emptyTd.colSpan = 3;
    emptyTd.style.textAlign = "center";
    emptyTd.style.padding = "18px";
    emptyTd.style.color = "#94a3b8";
    emptyTd.textContent = "No rows match the selected filter.";
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
    if (paginationBar) paginationBar.style.display = "none";
    return;
  }

  const sliceEnd = Math.min(filtered.length, jsonCompareState.visibleLimit);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < sliceEnd; i++) {
    const entry = filtered[i];
    const tr = document.createElement("tr");
    tr.className = `cmp-row-${entry.status}`;

    const tdPath = document.createElement("td");
    tdPath.className = "json-path-cell";
    tdPath.textContent = entry.path;
    tr.appendChild(tdPath);

    const tdStatus = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `cmp-status-pill cmp-status-${entry.status}`;
    pill.textContent =
      entry.status === "unchanged"
        ? "Match"
        : entry.status === "modified"
        ? "~ Modified"
        : entry.status === "added"
        ? "+ Added"
        : "- Removed";
    tdStatus.appendChild(pill);
    tr.appendChild(tdStatus);

    const tdVal = document.createElement("td");
    if (entry.status === "modified") {
      tdVal.className = "cmp-cell-modified";

      const oldSpan = document.createElement("span");
      oldSpan.className = "diff-old-val";
      oldSpan.textContent = entry.valueA !== "" ? entry.valueA : "(empty)";

      const arrowSpan = document.createElement("span");
      arrowSpan.className = "diff-arrow";
      arrowSpan.textContent = "→";

      const newSpan = document.createElement("span");
      newSpan.className = "diff-new-val";
      newSpan.textContent = entry.valueB !== "" ? entry.valueB : "(empty)";

      tdVal.appendChild(oldSpan);
      tdVal.appendChild(arrowSpan);
      tdVal.appendChild(newSpan);
    } else if (entry.status === "removed") {
      tdVal.textContent = entry.valueA;
    } else {
      tdVal.textContent = entry.valueB !== "" ? entry.valueB : entry.valueA;
    }

    tr.appendChild(tdVal);
    fragment.appendChild(tr);
  }

  tbody.appendChild(fragment);

  if (paginationBar && showingCount && loadMoreBtn) {
    if (filtered.length > PAGE_SIZE) {
      paginationBar.style.display = "flex";
      showingCount.textContent = `Showing ${sliceEnd} of ${filtered.length} rows`;
      loadMoreBtn.style.display = sliceEnd < filtered.length ? "inline-block" : "none";
    } else {
      paginationBar.style.display = "none";
    }
  }
}

function handleExportJSONAsCSV() {
  if (!jsonCompareState.comparisonResult) return;

  const csvStr = JSONCompareEngine.exportJSONComparisonCSV(
    jsonCompareState.comparisonResult,
    { filter: jsonCompareState.activeFilter, sanitizeFormulas: true }
  );

  const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "json-comparison-table.csv";
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function handleExportJSONComparison() {
  if (!jsonCompareState.comparisonResult) return;

  const reportStr = JSONCompareEngine.exportJSONComparisonReport(
    jsonCompareState.comparisonResult,
    { filter: jsonCompareState.activeFilter }
  );

  const blob = new Blob([reportStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "json-comparison-summary.json";
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function clearJSONSlotMemory(slotObj) {
  if (!slotObj) return;
  slotObj.name = "";
  slotObj.rawText = "";
  slotObj.parsed = undefined;
  slotObj.keyCount = 0;
}

function clearSingleJSONFile(slot) {
  const target = slot === "a" ? jsonCompareState.fileA : jsonCompareState.fileB;
  clearJSONSlotMemory(target);

  const fileInput = document.getElementById(`json-file-input-${slot}`);
  if (fileInput) fileInput.value = "";

  const textarea = document.getElementById(`json-paste-textarea-${slot}`);
  if (textarea) textarea.value = "";

  if (jsonCompareState.comparisonResult) {
    JSONCompareEngine.wipeJSONComparisonData(jsonCompareState.comparisonResult);
    jsonCompareState.comparisonResult = null;
  }

  const tbody = document.getElementById("json-diff-tbody");
  if (tbody) tbody.textContent = "";

  updateJSONDropzoneDisplay("a");
  updateJSONDropzoneDisplay("b");
  runJSONComparisonIfReady();
}

function wipeAllSensitiveJSONData() {
  clearJSONSlotMemory(jsonCompareState.fileA);
  clearJSONSlotMemory(jsonCompareState.fileB);

  if (jsonCompareState.comparisonResult && JSONCompareEngine) {
    JSONCompareEngine.wipeJSONComparisonData(jsonCompareState.comparisonResult);
    jsonCompareState.comparisonResult = null;
  }

  for (const slot of ["a", "b"]) {
    const fileInput = document.getElementById(`json-file-input-${slot}`);
    if (fileInput) fileInput.value = "";
    const textarea = document.getElementById(`json-paste-textarea-${slot}`);
    if (textarea) textarea.value = "";
  }

  const tbody = document.getElementById("json-diff-tbody");
  if (tbody) tbody.textContent = "";

  const resultsSection = document.getElementById("json-results-section");
  if (resultsSection) resultsSection.style.display = "none";

  updateJSONDropzoneDisplay("a");
  updateJSONDropzoneDisplay("b");
}

