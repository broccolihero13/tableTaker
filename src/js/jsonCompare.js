/**
 * Grid Genie - Secure JSON Comparison & Multiline Table Diff Engine
 * Runs strictly locally in volatile memory. Prototype-pollution safe (Map/Set),
 * XSS-safe, and expands multiline strings into line-by-line table rows.
 */

const MAX_JSON_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB safety limit
const MAX_JSON_DEPTH = 100;
const MAX_JSON_NODES = 250000;

/**
 * Validates a JSON File object for extension and size limits.
 * @param {File|{name?: string, size?: number}} file
 * @param {object} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateJSONFile(file, options = {}) {
  const maxBytes = options.maxSizeBytes || MAX_JSON_FILE_SIZE_BYTES;
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
    const lower = file.name.toLowerCase();
    const validExt =
      lower.endsWith(".json") ||
      lower.endsWith(".jsonl") ||
      lower.endsWith(".txt");
    if (!validExt) {
      return {
        valid: false,
        error: "Unsupported file type. Please select a valid .json file.",
      };
    }
  }
  return { valid: true };
}

/**
 * Safely parses a JSON string while stripping UTF-8 BOM and rejecting binary content.
 * @param {string} jsonText
 * @returns {any}
 */
function parseJSONRobust(jsonText) {
  if (typeof jsonText !== "string") {
    throw new Error("JSON content must be a string.");
  }
  if (jsonText.indexOf("\0") !== -1) {
    throw new Error("Invalid JSON content: binary data detected.");
  }
  const cleaned = (jsonText.charCodeAt(0) === 0xfeff ? jsonText.slice(1) : jsonText).trim();
  if (!cleaned) {
    throw new Error("JSON content is empty.");
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Invalid JSON syntax: ${err.message}`);
  }
}

/**
 * Determines the normalized type name of a JSON value.
 * @param {any} val
 * @returns {'null'|'array'|'object'|'string'|'number'|'boolean'|'undefined'}
 */
function getJSONValueType(val) {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  if (Array.isArray(val)) return "array";
  return typeof val;
}

/**
 * Formats a path segment onto a base path (e.g. "user" + "name" -> "user.name", or "user[\"a.b\"]").
 * @param {string} basePath
 * @param {string|number} key
 * @param {boolean} isArrayIndex
 * @returns {string}
 */
function formatJSONPath(basePath, key, isArrayIndex = false) {
  if (isArrayIndex) {
    return `${basePath}[${key}]`;
  }
  const keyStr = String(key);
  const isSimpleIdentifier = /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(keyStr);
  if (!basePath) {
    return isSimpleIdentifier ? keyStr : JSON.stringify(keyStr);
  }
  return isSimpleIdentifier
    ? `${basePath}.${keyStr}`
    : `${basePath}[${JSON.stringify(keyStr)}]`;
}

/**
 * Flattens any JSON structure into a Map of path -> { path, value, type, order }.
 * Uses Map and Object.getOwnPropertyDescriptor to be 100% immune to prototype pollution keys.
 *
 * @param {any} rootValue
 * @param {object} options
 * @returns {Map<string, { path: string, value: any, type: string, order: number }>}
 */
function flattenJSONToMap(rootValue, options = {}) {
  const maxDepth = options.maxDepth || MAX_JSON_DEPTH;
  const maxNodes = options.maxNodes || MAX_JSON_NODES;
  const arrayKeyProp = options.arrayKeyProp ? String(options.arrayKeyProp).trim() : "";

  const result = new Map();
  let nodeCount = 0;

  function visit(current, currentPath, depth) {
    nodeCount++;
    if (nodeCount > maxNodes) {
      throw new Error(`JSON structure exceeds maximum allowed nodes (${maxNodes}).`);
    }
    if (depth > maxDepth) {
      throw new Error(`JSON nesting exceeds maximum allowed depth (${maxDepth}).`);
    }

    const type = getJSONValueType(current);

    if (type === "array") {
      if (current.length === 0) {
        const p = currentPath || "(root)";
        result.set(p, { path: p, value: "[]", type: "empty-array", order: result.size });
        return;
      }
      for (let i = 0; i < current.length; i++) {
        const item = current[i];
        let segPath;
        const propDesc =
          arrayKeyProp &&
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item)
            ? Object.getOwnPropertyDescriptor(item, arrayKeyProp)
            : undefined;
        if (
          propDesc &&
          (typeof propDesc.value === "string" || typeof propDesc.value === "number")
        ) {
          segPath = `${currentPath}[${arrayKeyProp}=${JSON.stringify(String(propDesc.value))}]`;
        } else {
          segPath = formatJSONPath(currentPath, i, true);
        }
        visit(item, segPath, depth + 1);
      }
      return;
    }

    if (type === "object") {
      const keys = Object.keys(current);
      if (keys.length === 0) {
        const p = currentPath || "(root)";
        result.set(p, { path: p, value: "{}", type: "empty-object", order: result.size });
        return;
      }
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const desc = Object.getOwnPropertyDescriptor(current, k);
        const val = desc ? desc.value : undefined;
        const nextPath = formatJSONPath(currentPath, k, false);
        visit(val, nextPath, depth + 1);
      }
      return;
    }

    const finalPath = currentPath || "(root)";
    result.set(finalPath, {
      path: finalPath,
      value: current,
      type,
      order: result.size,
    });
  }

  visit(rootValue, "", 0);
  return result;
}

/**
 * Checks whether a value (or pair of values) contains line breaks.
 * @param {any} valA
 * @param {any} valB
 * @returns {boolean}
 */
function hasLineBreaks(valA, valB) {
  const checkOne = (v) => typeof v === "string" && (v.includes("\n") || v.includes("\r"));
  return checkOne(valA) || checkOne(valB);
}

/**
 * Splits a string into normalized lines for line-by-line comparison.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoLines(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/**
 * Computes a line-by-line diff between two strings (used for detailed summary export & line analysis).
 * @param {string} textA
 * @param {string} textB
 * @param {object} options
 * @returns {object}
 */
function computeLineDiff(textA, textB, options = {}) {
  const strA = textA === null || textA === undefined ? "" : String(textA);
  const strB = textB === null || textB === undefined ? "" : String(textB);
  const trimLines = Boolean(options.trimLines);
  const caseSensitive =
    options.caseSensitive !== undefined ? Boolean(options.caseSensitive) : true;

  const rawLinesA = splitIntoLines(strA);
  const rawLinesB = splitIntoLines(strB);

  const normalizeLine = (line) => {
    let s = trimLines ? line.trim() : line;
    return caseSensitive ? s : s.toLowerCase();
  };

  const normA = rawLinesA.map(normalizeLine);
  const normB = rawLinesB.map(normalizeLine);

  const n = rawLinesA.length;
  const m = rawLinesB.length;

  let start = 0;
  while (start < n && start < m && normA[start] === normB[start]) {
    start++;
  }

  let endA = n - 1;
  let endB = m - 1;
  while (endA >= start && endB >= start && normA[endA] === normB[endB]) {
    endA--;
    endB--;
  }

  const prefixOps = [];
  for (let i = 0; i < start; i++) {
    prefixOps.push({
      type: "unchanged",
      lineNumA: i + 1,
      lineNumB: i + 1,
      text: rawLinesA[i],
    });
  }

  const suffixOps = [];
  const suffixLen = n - 1 - endA;
  for (let k = 0; k < suffixLen; k++) {
    const idxA = endA + 1 + k;
    const idxB = endB + 1 + k;
    suffixOps.push({
      type: "unchanged",
      lineNumA: idxA + 1,
      lineNumB: idxB + 1,
      text: rawLinesB[idxB],
    });
  }

  const midLenA = endA - start + 1;
  const midLenB = endB - start + 1;
  const midOps = [];

  if (midLenA === 0 && midLenB > 0) {
    for (let j = start; j <= endB; j++) {
      midOps.push({
        type: "added",
        lineNumA: null,
        lineNumB: j + 1,
        text: rawLinesB[j],
      });
    }
  } else if (midLenB === 0 && midLenA > 0) {
    for (let i = start; i <= endA; i++) {
      midOps.push({
        type: "removed",
        lineNumA: i + 1,
        lineNumB: null,
        text: rawLinesA[i],
      });
    }
  } else if (midLenA > 0 && midLenB > 0) {
    if (midLenA * midLenB <= 2500000) {
      const cols = midLenB + 1;
      const dp = new Int32Array((midLenA + 1) * cols);

      for (let i = midLenA - 1; i >= 0; i--) {
        const rowOffset = i * cols;
        const nextRowOffset = (i + 1) * cols;
        const aVal = normA[start + i];
        for (let j = midLenB - 1; j >= 0; j--) {
          if (aVal === normB[start + j]) {
            dp[rowOffset + j] = 1 + dp[nextRowOffset + j + 1];
          } else {
            const down = dp[nextRowOffset + j];
            const right = dp[rowOffset + j + 1];
            dp[rowOffset + j] = down >= right ? down : right;
          }
        }
      }

      let i = 0;
      let j = 0;
      while (i < midLenA && j < midLenB) {
        if (normA[start + i] === normB[start + j]) {
          midOps.push({
            type: "unchanged",
            lineNumA: start + i + 1,
            lineNumB: start + j + 1,
            text: rawLinesB[start + j],
          });
          i++;
          j++;
        } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
          midOps.push({
            type: "removed",
            lineNumA: start + i + 1,
            lineNumB: null,
            text: rawLinesA[start + i],
          });
          i++;
        } else {
          midOps.push({
            type: "added",
            lineNumA: null,
            lineNumB: start + j + 1,
            text: rawLinesB[start + j],
          });
          j++;
        }
      }
      while (i < midLenA) {
        midOps.push({
          type: "removed",
          lineNumA: start + i + 1,
          lineNumB: null,
          text: rawLinesA[start + i],
        });
        i++;
      }
      while (j < midLenB) {
        midOps.push({
          type: "added",
          lineNumA: null,
          lineNumB: start + j + 1,
          text: rawLinesB[start + j],
        });
        j++;
      }
    } else {
      for (let i = 0; i < Math.max(midLenA, midLenB); i++) {
        if (i < midLenA) {
          midOps.push({
            type: "removed",
            lineNumA: start + i + 1,
            lineNumB: null,
            text: rawLinesA[start + i],
          });
        }
        if (i < midLenB) {
          midOps.push({
            type: "added",
            lineNumA: null,
            lineNumB: start + i + 1,
            text: rawLinesB[start + i],
          });
        }
      }
    }
  }

  const lines = [...prefixOps, ...midOps, ...suffixOps];
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  for (const l of lines) {
    if (l.type === "added") added++;
    else if (l.type === "removed") removed++;
    else unchanged++;
  }

  return {
    lines,
    stats: {
      totalLines: lines.length,
      linesA: rawLinesA.length,
      linesB: rawLinesB.length,
      added,
      removed,
      unchanged,
    },
  };
}

/**
 * Formats a primitive or special leaf value into a human-readable string for display.
 * @param {any} val
 * @param {string} type
 * @returns {string}
 */
function formatValueForDisplay(val, type) {
  if (type === "undefined") return "";
  if (type === "null") return "null";
  if (type === "empty-array") return "[]";
  if (type === "empty-object") return "{}";
  if (typeof val === "string") return val;
  return String(val);
}

/**
 * Compares two JSON inputs (either raw JSON strings or parsed JS values).
 * Multiline strings (values containing \n or \r) are automatically broken into
 * individual line rows (e.g. "key [Line 1]", "key [Line 2]") so the entire comparison
 * renders cleanly as a standard table.
 *
 * @param {string|any} jsonA
 * @param {string|any} jsonB
 * @param {object} options
 * @returns {object}
 */
function compareJSON(jsonA, jsonB, options = {}) {
  const trimValues = options.trimValues !== undefined ? Boolean(options.trimValues) : false;
  const caseSensitive =
    options.caseSensitive !== undefined ? Boolean(options.caseSensitive) : true;
  const arrayKeyProp = options.arrayKeyProp || "";
  const sortBy = options.sortBy || "original";
  const expandMultilineRows =
    options.expandMultilineRows !== undefined ? Boolean(options.expandMultilineRows) : true;

  const parsedA = typeof jsonA === "string" ? parseJSONRobust(jsonA) : jsonA;
  const parsedB = typeof jsonB === "string" ? parseJSONRobust(jsonB) : jsonB;

  const mapA = flattenJSONToMap(parsedA, { arrayKeyProp });
  const mapB = flattenJSONToMap(parsedB, { arrayKeyProp });

  const allPaths = new Set([...mapA.keys(), ...mapB.keys()]);
  let entries = [];
  const multilineSummaries = [];

  const stringsEqual = (strA, strB) => {
    let a = strA ?? "";
    let b = strB ?? "";
    if (trimValues) {
      a = a.trim();
      b = b.trim();
    }
    if (!caseSensitive) {
      a = a.toLowerCase();
      b = b.toLowerCase();
    }
    return a === b;
  };

  let indexCounter = 0;

  for (const path of allPaths) {
    const itemA = mapA.get(path);
    const itemB = mapB.get(path);

    const typeA = itemA ? itemA.type : "undefined";
    const typeB = itemB ? itemB.type : "undefined";
    const displayA = itemA ? formatValueForDisplay(itemA.value, typeA) : "";
    const displayB = itemB ? formatValueForDisplay(itemB.value, typeB) : "";

    const isMultiline = hasLineBreaks(
      itemA ? itemA.value : undefined,
      itemB ? itemB.value : undefined
    );

    if (isMultiline && expandMultilineRows) {
      const linesA = itemA ? splitIntoLines(displayA) : [];
      const linesB = itemB ? splitIntoLines(displayB) : [];
      const maxLines = Math.max(linesA.length, linesB.length);

      const lineDiff = computeLineDiff(displayA, displayB, {
        trimLines: trimValues,
        caseSensitive,
      });
      multilineSummaries.push({
        path,
        stats: lineDiff.stats,
        lines: lineDiff.lines,
      });

      for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
        const hasLineA = itemA && lineIdx < linesA.length;
        const hasLineB = itemB && lineIdx < linesB.length;
        const lA = hasLineA ? linesA[lineIdx] : "";
        const lB = hasLineB ? linesB[lineIdx] : "";

        let lineStatus = "unchanged";
        if (hasLineA && !hasLineB) {
          lineStatus = "removed";
        } else if (!hasLineA && hasLineB) {
          lineStatus = "added";
        } else if (!stringsEqual(lA, lB)) {
          lineStatus = "modified";
        }

        entries.push({
          id: indexCounter++,
          path: `${path} [Line ${lineIdx + 1}]`,
          parentPath: path,
          lineNumber: lineIdx + 1,
          status: lineStatus,
          typeA: hasLineA ? "string" : "undefined",
          typeB: hasLineB ? "string" : "undefined",
          valueA: trimValues ? lA.trim() : lA,
          valueB: trimValues ? lB.trim() : lB,
          isMultilineLine: true,
        });
      }
    } else {
      let status = "unchanged";
      if (itemA && !itemB) {
        status = "removed";
      } else if (!itemA && itemB) {
        status = "added";
      } else if (typeA !== typeB) {
        status = "modified";
      } else if (typeA === "string") {
        if (!stringsEqual(displayA, displayB)) status = "modified";
      } else if (!Object.is(itemA.value, itemB.value)) {
        status = "modified";
      }

      entries.push({
        id: indexCounter++,
        path,
        status,
        typeA,
        typeB,
        valueA: trimValues && typeA === "string" ? displayA.trim() : displayA,
        valueB: trimValues && typeB === "string" ? displayB.trim() : displayB,
        isMultilineLine: false,
      });
    }
  }

  const statusWeight = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  if (sortBy === "path-asc") {
    entries.sort((a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" })
    );
  } else if (sortBy === "path-desc") {
    entries.sort((a, b) =>
      b.path.localeCompare(a.path, undefined, { numeric: true, sensitivity: "base" })
    );
  } else if (sortBy === "status") {
    entries.sort((a, b) => {
      const wDiff = (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9);
      if (wDiff !== 0) return wDiff;
      return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
    });
  } else if (sortBy === "val-a-asc") {
    entries.sort((a, b) =>
      a.valueA.localeCompare(b.valueA, undefined, { numeric: true, sensitivity: "base" })
    );
  } else if (sortBy === "val-b-asc") {
    entries.sort((a, b) =>
      a.valueB.localeCompare(b.valueB, undefined, { numeric: true, sensitivity: "base" })
    );
  }

  let unchanged = 0;
  let modified = 0;
  let added = 0;
  let removed = 0;

  for (const e of entries) {
    if (e.status === "unchanged") unchanged++;
    else if (e.status === "modified") modified++;
    else if (e.status === "added") added++;
    else if (e.status === "removed") removed++;
  }

  return {
    entries,
    multilineSummaries,
    summary: {
      totalRows: entries.length,
      totalKeys: entries.length,
      unchanged,
      modified,
      added,
      removed,
      multilineCount: multilineSummaries.length,
      identical: modified === 0 && added === 0 && removed === 0 && entries.length > 0,
    },
  };
}

/**
 * Sanitizes a cell for CSV export to prevent formula injection.
 */
function sanitizeCell(value, sanitizeFormulas = true) {
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
      const isPlainNumber = /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(str.trim());
      if (!isPlainNumber) {
        str = "'" + str;
      }
    }
  }
  return '"' + str.replace(/"/g, '""') + '"';
}

/**
 * Exports JSON comparison table rows as a formula-sanitized CSV string.
 * @param {object} jsonComparisonResult
 * @param {object} options
 * @returns {string}
 */
function exportJSONComparisonCSV(jsonComparisonResult, options = {}) {
  if (!jsonComparisonResult || !Array.isArray(jsonComparisonResult.entries)) {
    return "";
  }
  const filter = options.filter || "all";
  const sanitizeFormulas =
    options.sanitizeFormulas !== undefined ? Boolean(options.sanitizeFormulas) : true;

  const filtered = jsonComparisonResult.entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "differences") return e.status !== "unchanged";
    return e.status === filter;
  });

  const lines = [
    [
      sanitizeCell("Key / Path", sanitizeFormulas),
      sanitizeCell("Status", sanitizeFormulas),
      sanitizeCell("File 1 Value", sanitizeFormulas),
      sanitizeCell("File 2 Value", sanitizeFormulas),
    ].join(","),
  ];

  for (const e of filtered) {
    lines.push(
      [
        sanitizeCell(e.path, sanitizeFormulas),
        sanitizeCell(e.status.toUpperCase(), sanitizeFormulas),
        sanitizeCell(e.valueA, sanitizeFormulas),
        sanitizeCell(e.valueB, sanitizeFormulas),
      ].join(",")
    );
  }

  return lines.join("\n");
}

/**
 * Exports a comprehensive JSON comparison summary report (including full multiline diff stats).
 * @param {object} jsonComparisonResult
 * @param {object} options
 * @returns {string}
 */
function exportJSONComparisonReport(jsonComparisonResult, options = {}) {
  if (!jsonComparisonResult || !Array.isArray(jsonComparisonResult.entries)) {
    return "{}";
  }
  const filter = options.filter || "all";
  const filtered = jsonComparisonResult.entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "differences") return e.status !== "unchanged";
    return e.status === filter;
  });

  const payload = {
    summary: jsonComparisonResult.summary,
    filterApplied: filter,
    multilineDiffSummaries: jsonComparisonResult.multilineSummaries || [],
    entries: filtered.map((e) => ({
      path: e.path,
      status: e.status,
      valueA: e.valueA,
      valueB: e.valueB,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Overwrites and wipes sensitive JSON comparison data in-place.
 * @param {object} jsonComparisonResult
 */
function wipeJSONComparisonData(jsonComparisonResult) {
  if (!jsonComparisonResult || typeof jsonComparisonResult !== "object") return;
  if (Array.isArray(jsonComparisonResult.entries)) {
    for (const entry of jsonComparisonResult.entries) {
      if (!entry) continue;
      entry.path = "";
      entry.valueA = "";
      entry.valueB = "";
    }
    jsonComparisonResult.entries.length = 0;
  }
  if (Array.isArray(jsonComparisonResult.multilineSummaries)) {
    for (const ms of jsonComparisonResult.multilineSummaries) {
      if (ms && Array.isArray(ms.lines)) {
        for (const l of ms.lines) l.text = "";
        ms.lines.length = 0;
      }
    }
    jsonComparisonResult.multilineSummaries.length = 0;
  }
}

if (typeof window !== "undefined") {
  window.GridGenieJSONCompare = {
    validateJSONFile,
    parseJSONRobust,
    flattenJSONToMap,
    hasLineBreaks,
    computeLineDiff,
    compareJSON,
    exportJSONComparisonCSV,
    exportJSONComparisonReport,
    wipeJSONComparisonData,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    validateJSONFile,
    parseJSONRobust,
    flattenJSONToMap,
    hasLineBreaks,
    computeLineDiff,
    compareJSON,
    exportJSONComparisonCSV,
    exportJSONComparisonReport,
    wipeJSONComparisonData,
  };
}
