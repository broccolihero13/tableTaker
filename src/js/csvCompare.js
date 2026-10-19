/**
 * Grid Genie - Secure CSV Comparison & Multi-Column Sorting Engine
 * Runs strictly locally in memory. Zero external dependencies, zero network calls,
 * prototype-pollution safe (uses Map/Set), and protected against XSS & CSV Formula Injection.
 */

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB safety limit
const MAX_ROWS_LIMIT = 250000;
const MAX_COLS_LIMIT = 1000;

/**
 * Converts a 0-based column index to an Excel-style column letter (0 -> A, 1 -> B, 26 -> AA).
 * @param {number} index
 * @returns {string}
 */
function indexToColumnLetter(index) {
  if (typeof index !== "number" || index < 0 || !Number.isFinite(index)) {
    return "";
  }
  let letter = "";
  let temp = Math.floor(index);
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Converts an Excel-style column letter (e.g. "A", "B", "AA", "Column B") to a 0-based column index.
 * Returns -1 if invalid.
 * @param {string} input
 * @returns {number}
 */
function columnLetterToIndex(input) {
  if (typeof input !== "string") return -1;
  let cleaned = input.trim();
  const prefixMatch = cleaned.match(/^col(?:umn)?\s+([A-Za-z]+)$/i);
  if (prefixMatch) {
    cleaned = prefixMatch[1];
  }
  if (!/^[A-Za-z]+$/.test(cleaned)) {
    return -1;
  }
  cleaned = cleaned.toUpperCase();
  let index = 0;
  for (let i = 0; i < cleaned.length; i++) {
    index = index * 26 + (cleaned.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Resolves a column reference (0-based number, "B", "Column B", or header name) to a 0-based index.
 * @param {number|string} colSpec
 * @param {string[]} headers
 * @returns {number} 0-based index or -1 if not found
 */
function resolveColumnIndex(colSpec, headers = []) {
  if (typeof colSpec === "number" && Number.isInteger(colSpec) && colSpec >= 0) {
    return colSpec;
  }
  if (typeof colSpec !== "string") return -1;
  const trimmed = colSpec.trim();
  if (!trimmed) return -1;

  // 1. Explicit "Column X" or "Col X" syntax
  const explicitColMatch = trimmed.match(/^col(?:umn)?\s+([A-Za-z]+)$/i);
  if (explicitColMatch) {
    return columnLetterToIndex(explicitColMatch[1]);
  }

  // 2. Exact header match (if headers provided)
  if (Array.isArray(headers) && headers.length > 0) {
    const exactIdx = headers.findIndex((h) => String(h).trim() === trimmed);
    if (exactIdx !== -1) return exactIdx;
  }

  // 3. Single/multi letter column reference ("A", "B", "C", "AA")
  if (/^[A-Za-z]{1,3}$/.test(trimmed)) {
    const letterIdx = columnLetterToIndex(trimmed);
    if (letterIdx >= 0) return letterIdx;
  }

  // 4. Case-insensitive header match
  if (Array.isArray(headers) && headers.length > 0) {
    const lower = trimmed.toLowerCase();
    const ciIdx = headers.findIndex((h) => String(h).trim().toLowerCase() === lower);
    if (ciIdx !== -1) return ciIdx;
  }

  // 5. Numeric string (0-based)
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  return -1;
}

/**
 * Validates a File object or raw CSV text for security and size limits.
 * @param {File| { name?: string, size?: number, type?: string }} file
 * @param {object} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCSVFile(file, options = {}) {
  const maxBytes = options.maxSizeBytes || MAX_FILE_SIZE_BYTES;
  if (!file) {
    return { valid: false, error: "No file provided." };
  }
  if (typeof file.size === "number" && file.size > maxBytes) {
    return {
      valid: false,
      error: `File exceeds the maximum allowed size (${Math.round(maxBytes / (1024 * 1024))} MB).`,
    };
  }
  if (file.name) {
    const lowerName = file.name.toLowerCase();
    const validExt =
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".tsv") ||
      lowerName.endsWith(".txt");
    if (!validExt) {
      return {
        valid: false,
        error: "Unsupported file type. Please select a valid .csv file.",
      };
    }
  }
  return { valid: true };
}

/**
 * Robust RFC 4180 compliant CSV parser.
 * Handles UTF-8 BOM, quoted multiline values, escaped double-quotes (""), CRLF/LF/CR line endings,
 * and enforces row/column limits against resource exhaustion.
 * @param {string} csvText
 * @param {object} options
 * @returns {string[][]}
 */
function parseCSVRobust(csvText, options = {}) {
  if (typeof csvText !== "string") {
    throw new Error("CSV content must be a string.");
  }

  const trimValues = options.trimValues !== undefined ? Boolean(options.trimValues) : true;
  const ignoreEmptyRows =
    options.ignoreEmptyRows !== undefined ? Boolean(options.ignoreEmptyRows) : true;
  const maxRows = options.maxRows || MAX_ROWS_LIMIT;
  const maxCols = options.maxCols || MAX_COLS_LIMIT;

  // Reject binary content containing null bytes
  if (csvText.indexOf("\0") !== -1) {
    throw new Error("Invalid CSV content: binary data detected.");
  }

  // Strip UTF-8 BOM if present
  let text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  if (text.length === 0) return [];

  const rows = [];
  let currentRow = [];
  let currentVal = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentVal += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        // Allow quotes at start of field or after leading whitespace
        if (currentVal.trim() === "") {
          currentVal = "";
          insideQuotes = true;
        } else {
          currentVal += char;
        }
      } else if (char === ",") {
        currentRow.push(trimValues ? currentVal.trim() : currentVal);
        if (currentRow.length > maxCols) {
          throw new Error(`CSV exceeds maximum allowed columns (${maxCols}).`);
        }
        currentVal = "";
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && next === "\n") {
          i++;
        }
        currentRow.push(trimValues ? currentVal.trim() : currentVal);
        const isRowEmpty =
          currentRow.length === 1 && currentRow[0] === "" ||
          currentRow.every((cell) => cell === "");
        if (!ignoreEmptyRows || !isRowEmpty) {
          rows.push(currentRow);
          if (rows.length > maxRows) {
            throw new Error(`CSV exceeds maximum allowed rows (${maxRows}).`);
          }
        }
        currentRow = [];
        currentVal = "";
      } else {
        currentVal += char;
      }
    }
  }

  // Flush final value/row
  currentRow.push(trimValues ? currentVal.trim() : currentVal);
  const isFinalRowEmpty =
    (currentRow.length === 1 && currentRow[0] === "") ||
    currentRow.every((cell) => cell === "");
  if (!ignoreEmptyRows || !isFinalRowEmpty) {
    rows.push(currentRow);
    if (rows.length > maxRows) {
      throw new Error(`CSV exceeds maximum allowed rows (${maxRows}).`);
    }
  }

  return rows;
}

/**
 * Parses a numeric value if the string represents a valid number (supports optional currency/commas).
 * @param {string} val
 * @returns {number|null}
 */
function parseNumericCandidate(val) {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  // Standard number or formatted currency/comma number
  const normalized = trimmed.replace(/^\$/, "").replace(/,/g, "");
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) {
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Compares two cell values with support for numeric sorting, case sensitivity, and empty-last handling.
 * @param {string} valA
 * @param {string} valB
 * @param {'asc'|'desc'} direction
 * @param {object} options
 * @returns {number}
 */
function compareCellValues(valA, valB, direction = "asc", options = {}) {
  const caseSensitive =
    options.caseSensitive !== undefined ? Boolean(options.caseSensitive) : true;
  const numeric = options.numeric !== undefined ? Boolean(options.numeric) : true;
  const emptyLast = options.emptyLast !== undefined ? Boolean(options.emptyLast) : true;

  const strA = valA === null || valA === undefined ? "" : String(valA).trim();
  const strB = valB === null || valB === undefined ? "" : String(valB).trim();

  const isEmptyA = strA === "";
  const isEmptyB = strB === "";

  if (isEmptyA && isEmptyB) return 0;
  if (isEmptyA) return emptyLast ? 1 : direction === "desc" ? 1 : -1;
  if (isEmptyB) return emptyLast ? -1 : direction === "desc" ? -1 : 1;

  const mult = direction && direction.toLowerCase() === "desc" ? -1 : 1;

  if (numeric) {
    const numA = parseNumericCandidate(strA);
    const numB = parseNumericCandidate(strB);
    if (numA !== null && numB !== null) {
      if (numA < numB) return -1 * mult;
      if (numA > numB) return 1 * mult;
      return 0;
    }
  }

  const cmp = strA.localeCompare(strB, undefined, {
    numeric: numeric,
    sensitivity: caseSensitive ? "variant" : "base",
  });
  return cmp * mult;
}

/**
 * Sorts a 2D array of CSV rows by multiple columns in priority order.
 * For example: Column B (primary), then Column C (secondary), then Column D (tertiary), etc.
 *
 * @param {string[][]} rows - 2D array of CSV strings
 * @param {Array<{column: number|string, direction?: 'asc'|'desc'}|string|number>} sortRules
 * @param {object} options - { hasHeaders?: boolean, caseSensitive?: boolean, numeric?: boolean }
 * @returns {string[][]} Newly sorted 2D array (does not mutate input)
 */
function sortCSVData(rows, sortRules = [], options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const hasHeaders = options.hasHeaders !== undefined ? Boolean(options.hasHeaders) : true;

  const headerRow = hasHeaders ? [...rows[0]] : null;
  const dataRows = hasHeaders ? rows.slice(1).map((r) => [...r]) : rows.map((r) => [...r]);

  if (!Array.isArray(sortRules) || sortRules.length === 0 || dataRows.length <= 1) {
    return hasHeaders ? [headerRow, ...dataRows] : dataRows;
  }

  // Normalize sort rules into resolved column indices
  const resolvedRules = sortRules
    .map((rule) => {
      if (typeof rule === "string" || typeof rule === "number") {
        return {
          colIndex: resolveColumnIndex(rule, headerRow || []),
          direction: "asc",
        };
      }
      if (rule && typeof rule === "object") {
        const colSpec =
          rule.column !== undefined
            ? rule.column
            : rule.colIndex !== undefined
            ? rule.colIndex
            : rule.col;
        return {
          colIndex: resolveColumnIndex(colSpec, headerRow || []),
          direction:
            typeof rule.direction === "string" &&
            rule.direction.toLowerCase() === "desc"
              ? "desc"
              : "asc",
        };
      }
      return { colIndex: -1, direction: "asc" };
    })
    .filter((r) => r.colIndex >= 0);

  if (resolvedRules.length === 0) {
    return hasHeaders ? [headerRow, ...dataRows] : dataRows;
  }

  // Decorate for guaranteed stability across all engines
  const decorated = dataRows.map((row, idx) => ({ row, idx }));

  decorated.sort((a, b) => {
    for (let i = 0; i < resolvedRules.length; i++) {
      const { colIndex, direction } = resolvedRules[i];
      const valA = a.row[colIndex] !== undefined ? a.row[colIndex] : "";
      const valB = b.row[colIndex] !== undefined ? b.row[colIndex] : "";
      const cmp = compareCellValues(valA, valB, direction, options);
      if (cmp !== 0) return cmp;
    }
    return a.idx - b.idx;
  });

  const sortedData = decorated.map((d) => d.row);
  return hasHeaders ? [headerRow, ...sortedData] : sortedData;
}

/**
 * Sanitizes a cell value before exporting to CSV to prevent CSV Formula Injection (DDE/Formula attacks).
 * Any cell beginning with =, +, -, @, Tab, or CR (that is not a plain number) is prefixed with a single quote.
 * @param {string} value
 * @param {boolean} sanitizeFormulas
 * @returns {string}
 */
function sanitizeCSVCellForExport(value, sanitizeFormulas = true) {
  let str = value === null || value === undefined ? "" : String(value);
  if (sanitizeFormulas && str.length > 0) {
    const firstNonSpace = str.trimStart()[0];
    if (
      firstNonSpace === "=" ||
      firstNonSpace === "+" ||
      firstNonSpace === "-" ||
      firstNonSpace === "@" ||
      str[0] === "\t" ||
      str[0] === "\r"
    ) {
      // Allow plain negative/positive numeric literals like -42 or -3.14
      const isPlainNumber = /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(str.trim());
      if (!isPlainNumber) {
        str = "'" + str;
      }
    }
  }
  return '"' + str.replace(/"/g, '""') + '"';
}

/**
 * Compares two CSV datasets (either raw CSV strings or 2D arrays) with support for:
 * - Multi-column sorting (Primary, Secondary, Tertiary, ... Nth column)
 * - Row-by-row comparison (after sorting) OR Key-column matching
 * - Cell-level diff granularity
 *
 * @param {string|string[][]} csvA
 * @param {string|string[][]} csvB
 * @param {object} options
 * @returns {object} Detailed comparison result
 */
function compareCSVs(csvA, csvB, options = {}) {
  const hasHeaders = options.hasHeaders !== undefined ? Boolean(options.hasHeaders) : true;
  const trimValues = options.trimValues !== undefined ? Boolean(options.trimValues) : true;
  const caseSensitive =
    options.caseSensitive !== undefined ? Boolean(options.caseSensitive) : true;
  const matchMode = options.matchMode === "key" ? "key" : "row";
  const sortRules = Array.isArray(options.sortRules) ? options.sortRules : [];
  const keyColumns = Array.isArray(options.keyColumns) ? options.keyColumns : [];

  const rawRowsA =
    typeof csvA === "string"
      ? parseCSVRobust(csvA, { trimValues, ignoreEmptyRows: true })
      : Array.isArray(csvA)
      ? csvA.map((r) => (Array.isArray(r) ? r.map((c) => (trimValues ? String(c ?? "").trim() : String(c ?? ""))) : []))
      : [];

  const rawRowsB =
    typeof csvB === "string"
      ? parseCSVRobust(csvB, { trimValues, ignoreEmptyRows: true })
      : Array.isArray(csvB)
      ? csvB.map((r) => (Array.isArray(r) ? r.map((c) => (trimValues ? String(c ?? "").trim() : String(c ?? ""))) : []))
      : [];

  // Determine maximum column count across both files
  let maxCols = 0;
  for (const r of rawRowsA) {
    if (r.length > maxCols) maxCols = r.length;
  }
  for (const r of rawRowsB) {
    if (r.length > maxCols) maxCols = r.length;
  }

  const rawHeadersA = hasHeaders && rawRowsA.length > 0 ? rawRowsA[0] : [];
  const rawHeadersB = hasHeaders && rawRowsB.length > 0 ? rawRowsB[0] : [];

  const headers = [];
  const headerNamesForLookup = [];
  for (let c = 0; c < maxCols; c++) {
    const letter = indexToColumnLetter(c);
    const hA = rawHeadersA[c] !== undefined ? String(rawHeadersA[c]).trim() : "";
    const hB = rawHeadersB[c] !== undefined ? String(rawHeadersB[c]).trim() : "";
    let name = hA || hB || "";
    if (hA && hB && hA !== hB) {
      name = `${hA} / ${hB}`;
    }
    const label = name ? `Column ${letter} (${name})` : `Column ${letter}`;
    headers.push({
      index: c,
      letter,
      headerA: hA,
      headerB: hB,
      name,
      label,
      headerChanged: Boolean(hasHeaders && hA !== hB && (rawRowsA.length > 0 && rawRowsB.length > 0)),
    });
    headerNamesForLookup.push(hA || hB || letter);
  }

  // Extract and pad data rows, preserving original 1-based row numbers
  const startIdx = hasHeaders ? 1 : 0;
  const padRow = (row) => {
    const padded = new Array(maxCols);
    for (let c = 0; c < maxCols; c++) {
      padded[c] = row[c] !== undefined && row[c] !== null ? String(row[c]) : "";
    }
    return padded;
  };

  let itemsA = [];
  for (let i = startIdx; i < rawRowsA.length; i++) {
    itemsA.push({
      originalRowNumber: i + 1,
      cells: padRow(rawRowsA[i]),
    });
  }

  let itemsB = [];
  for (let i = startIdx; i < rawRowsB.length; i++) {
    itemsB.push({
      originalRowNumber: i + 1,
      cells: padRow(rawRowsB[i]),
    });
  }

  // Resolve multi-column sort rules
  const resolvedSortRules = sortRules
    .map((rule) => {
      if (typeof rule === "string" || typeof rule === "number") {
        return {
          colIndex: resolveColumnIndex(rule, headerNamesForLookup),
          direction: "asc",
        };
      }
      if (rule && typeof rule === "object") {
        const colSpec =
          rule.column !== undefined
            ? rule.column
            : rule.colIndex !== undefined
            ? rule.colIndex
            : rule.col;
        return {
          colIndex: resolveColumnIndex(colSpec, headerNamesForLookup),
          direction:
            typeof rule.direction === "string" &&
            rule.direction.toLowerCase() === "desc"
              ? "desc"
              : "asc",
        };
      }
      return { colIndex: -1, direction: "asc" };
    })
    .filter((r) => r.colIndex >= 0 && r.colIndex < maxCols);

  const cellsEqual = (valA, valB) => {
    const a = valA ?? "";
    const b = valB ?? "";
    if (caseSensitive) return a === b;
    return a.toLowerCase() === b.toLowerCase();
  };

  const buildDiffRow = (itemA, itemB) => {
    const cells = [];
    let hasCellDiff = false;

    for (let c = 0; c < maxCols; c++) {
      const vA = itemA ? itemA.cells[c] : "";
      const vB = itemB ? itemB.cells[c] : "";
      let cellStatus = "unchanged";

      if (itemA && !itemB) {
        cellStatus = "removed";
      } else if (!itemA && itemB) {
        cellStatus = "added";
      } else if (!cellsEqual(vA, vB)) {
        cellStatus = "modified";
        hasCellDiff = true;
      }

      cells.push({
        colIndex: c,
        valueA: vA,
        valueB: vB,
        status: cellStatus,
      });
    }

    let status = "unchanged";
    if (itemA && !itemB) {
      status = "removed";
    } else if (!itemA && itemB) {
      status = "added";
    } else if (hasCellDiff) {
      status = "modified";
    }

    const sortValues = itemB ? itemB.cells : itemA ? itemA.cells : new Array(maxCols).fill("");

    return {
      status,
      rowNumberA: itemA ? itemA.originalRowNumber : null,
      rowNumberB: itemB ? itemB.originalRowNumber : null,
      cells,
      sortValues,
    };
  };

  // Helper to sort itemsA / itemsB in place before positional comparison
  const sortItemList = (list) => {
    if (resolvedSortRules.length === 0 || list.length <= 1) return list;
    const decorated = list.map((item, idx) => ({ item, idx }));
    decorated.sort((a, b) => {
      for (let i = 0; i < resolvedSortRules.length; i++) {
        const { colIndex, direction } = resolvedSortRules[i];
        const cmp = compareCellValues(
          a.item.cells[colIndex],
          b.item.cells[colIndex],
          direction,
          { caseSensitive, numeric: true }
        );
        if (cmp !== 0) return cmp;
      }
      return a.idx - b.idx;
    });
    return decorated.map((d) => d.item);
  };

  let diffRows = [];

  // Resolve key columns if matchMode === 'key'
  const resolvedKeyCols =
    matchMode === "key"
      ? keyColumns
          .map((k) => resolveColumnIndex(k, headerNamesForLookup))
          .filter((idx) => idx >= 0 && idx < maxCols)
      : [];

  if (matchMode === "key" && resolvedKeyCols.length > 0) {
    // Key-based matching using Map to prevent prototype pollution
    const makeKey = (cells) =>
      resolvedKeyCols
        .map((colIdx) => {
          const v = cells[colIdx] ?? "";
          return caseSensitive ? v : v.toLowerCase();
        })
        .join("\u001F"); // Unit separator

    // Group B items by key (preserving queue for duplicate keys)
    const mapB = new Map();
    for (const itemB of itemsB) {
      const k = makeKey(itemB.cells);
      if (!mapB.has(k)) {
        mapB.set(k, []);
      }
      mapB.get(k).push(itemB);
    }

    const matchedBSet = new Set();

    for (const itemA of itemsA) {
      const k = makeKey(itemA.cells);
      const queueB = mapB.get(k);
      if (queueB && queueB.length > 0) {
        const matchedB = queueB.shift();
        matchedBSet.add(matchedB);
        diffRows.push(buildDiffRow(itemA, matchedB));
      } else {
        diffRows.push(buildDiffRow(itemA, null));
      }
    }

    for (const itemB of itemsB) {
      if (!matchedBSet.has(itemB)) {
        diffRows.push(buildDiffRow(null, itemB));
      }
    }

    // Apply multi-column sort rules to unified diff rows if specified
    if (resolvedSortRules.length > 0 && diffRows.length > 1) {
      const decorated = diffRows.map((dr, idx) => ({ dr, idx }));
      decorated.sort((a, b) => {
        for (let i = 0; i < resolvedSortRules.length; i++) {
          const { colIndex, direction } = resolvedSortRules[i];
          const cmp = compareCellValues(
            a.dr.sortValues[colIndex],
            b.dr.sortValues[colIndex],
            direction,
            { caseSensitive, numeric: true }
          );
          if (cmp !== 0) return cmp;
        }
        return a.idx - b.idx;
      });
      diffRows = decorated.map((d) => d.dr);
    }
  } else {
    // Row-by-row comparison (after sorting both datasets by sortRules)
    const sortedA = sortItemList(itemsA);
    const sortedB = sortItemList(itemsB);
    const maxLen = Math.max(sortedA.length, sortedB.length);

    for (let i = 0; i < maxLen; i++) {
      diffRows.push(buildDiffRow(sortedA[i] || null, sortedB[i] || null));
    }
  }

  let unchanged = 0;
  let modified = 0;
  let added = 0;
  let removed = 0;

  for (const row of diffRows) {
    if (row.status === "unchanged") unchanged++;
    else if (row.status === "modified") modified++;
    else if (row.status === "added") added++;
    else if (row.status === "removed") removed++;
  }

  return {
    headers,
    diffRows,
    resolvedSortRules,
    resolvedKeyCols,
    summary: {
      totalRows: diffRows.length,
      unchanged,
      modified,
      added,
      removed,
      identical: modified === 0 && added === 0 && removed === 0 && diffRows.length > 0,
    },
  };
}

/**
 * Exports a comparison result (or filtered subset) to a formula-sanitized CSV string.
 * @param {object} comparisonResult
 * @param {object} options - { filter?: 'all'|'differences'|'modified'|'added'|'removed'|'unchanged', sanitizeFormulas?: boolean }
 * @returns {string}
 */
function exportComparisonCSV(comparisonResult, options = {}) {
  if (!comparisonResult || !Array.isArray(comparisonResult.diffRows)) {
    return "";
  }
  const filter = options.filter || "all";
  const sanitizeFormulas =
    options.sanitizeFormulas !== undefined ? Boolean(options.sanitizeFormulas) : true;

  const headers = comparisonResult.headers || [];
  const headerLine = [
    sanitizeCSVCellForExport("Status", sanitizeFormulas),
    sanitizeCSVCellForExport("File 1 Row", sanitizeFormulas),
    sanitizeCSVCellForExport("File 2 Row", sanitizeFormulas),
    ...headers.map((h) => sanitizeCSVCellForExport(h.name || `Column ${h.letter}`, sanitizeFormulas)),
  ].join(",");

  const filteredRows = comparisonResult.diffRows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "differences") return row.status !== "unchanged";
    return row.status === filter;
  });

  const lines = [headerLine];

  for (const row of filteredRows) {
    const statusLabel = row.status.toUpperCase();
    const rA = row.rowNumberA !== null ? String(row.rowNumberA) : "";
    const rB = row.rowNumberB !== null ? String(row.rowNumberB) : "";

    const formattedCells = row.cells.map((cell) => {
      let displayVal = "";
      if (cell.status === "modified") {
        displayVal = `${cell.valueA} -> ${cell.valueB}`;
      } else if (row.status === "removed") {
        displayVal = cell.valueA;
      } else {
        displayVal = cell.valueB !== "" ? cell.valueB : cell.valueA;
      }
      return sanitizeCSVCellForExport(displayVal, sanitizeFormulas);
    });

    lines.push(
      [
        sanitizeCSVCellForExport(statusLabel, sanitizeFormulas),
        sanitizeCSVCellForExport(rA, sanitizeFormulas),
        sanitizeCSVCellForExport(rB, sanitizeFormulas),
        ...formattedCells,
      ].join(",")
    );
  }

  return lines.join("\n");
}

/**
 * Overwrites and clears sensitive comparison data in memory so nothing lingers in heap references.
 * @param {object} comparisonResult
 */
function wipeComparisonData(comparisonResult) {
  if (!comparisonResult || typeof comparisonResult !== "object") return;
  if (Array.isArray(comparisonResult.diffRows)) {
    for (const row of comparisonResult.diffRows) {
      if (row && Array.isArray(row.cells)) {
        for (let i = 0; i < row.cells.length; i++) {
          row.cells[i].valueA = "";
          row.cells[i].valueB = "";
        }
        row.cells.length = 0;
      }
      if (row && Array.isArray(row.sortValues)) {
        row.sortValues.fill("");
        row.sortValues.length = 0;
      }
    }
    comparisonResult.diffRows.length = 0;
  }
  if (Array.isArray(comparisonResult.headers)) {
    comparisonResult.headers.length = 0;
  }
}

if (typeof window !== "undefined") {
  window.GridGenieCompare = {
    indexToColumnLetter,
    columnLetterToIndex,
    resolveColumnIndex,
    validateCSVFile,
    parseCSVRobust,
    compareCellValues,
    sortCSVData,
    sanitizeCSVCellForExport,
    compareCSVs,
    exportComparisonCSV,
    wipeComparisonData,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    indexToColumnLetter,
    columnLetterToIndex,
    resolveColumnIndex,
    validateCSVFile,
    parseCSVRobust,
    compareCellValues,
    sortCSVData,
    sanitizeCSVCellForExport,
    compareCSVs,
    exportComparisonCSV,
    wipeComparisonData,
  };
}
