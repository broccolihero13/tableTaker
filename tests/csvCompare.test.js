const {
  indexToColumnLetter,
  columnLetterToIndex,
  resolveColumnIndex,
  validateCSVFile,
  parseCSVRobust,
  sortCSVData,
  sanitizeCSVCellForExport,
  compareCSVs,
  exportComparisonCSV,
  wipeComparisonData,
} = require("../src/js/csvCompare.js");

describe("Column Letter & Resolution Helpers", () => {
  test("converts 0-based index to Excel column letters", () => {
    expect(indexToColumnLetter(0)).toBe("A");
    expect(indexToColumnLetter(1)).toBe("B");
    expect(indexToColumnLetter(25)).toBe("Z");
    expect(indexToColumnLetter(26)).toBe("AA");
    expect(indexToColumnLetter(27)).toBe("AB");
  });

  test("converts column letters and 'Column X' labels to 0-based index", () => {
    expect(columnLetterToIndex("A")).toBe(0);
    expect(columnLetterToIndex("B")).toBe(1);
    expect(columnLetterToIndex("Column B")).toBe(1);
    expect(columnLetterToIndex("col d")).toBe(3);
    expect(columnLetterToIndex("AA")).toBe(26);
    expect(columnLetterToIndex("123")).toBe(-1);
  });

  test("resolves column index by letter, 'Column X', header name, or index", () => {
    const headers = ["ID", "Department", "Role", "Salary"];
    expect(resolveColumnIndex(1, headers)).toBe(1);
    expect(resolveColumnIndex("B", headers)).toBe(1);
    expect(resolveColumnIndex("Column C", headers)).toBe(2);
    expect(resolveColumnIndex("Salary", headers)).toBe(3);
    expect(resolveColumnIndex("department", headers)).toBe(1);
  });
});

describe("Robust & Secure CSV Parsing", () => {
  test("strips UTF-8 BOM and parses multiline quoted fields and escaped quotes", () => {
    const csv = '\uFEFF"ID","Notes","Amount"\r\n"1","Line 1\nLine 2 with ""quotes""","$1,200.50"\r\n"2","Simple","300"\r\n';
    const rows = parseCSVRobust(csv);
    expect(rows).toEqual([
      ["ID", "Notes", "Amount"],
      ["1", 'Line 1\nLine 2 with "quotes"', "$1,200.50"],
      ["2", "Simple", "300"],
    ]);
  });

  test("rejects binary content containing null bytes", () => {
    expect(() => parseCSVRobust("A,B\n1,\0binary")).toThrow(/binary data/i);
  });

  test("enforces maxRows and maxCols limits against DoS", () => {
    expect(() => parseCSVRobust("a,b,c,d", { maxCols: 2 })).toThrow(/maximum allowed columns/i);
    expect(() => parseCSVRobust("a\n1\n2\n3", { maxRows: 2 })).toThrow(/maximum allowed rows/i);
  });

  test("validates file extension and size", () => {
    expect(validateCSVFile({ name: "secret.csv", size: 1024 }).valid).toBe(true);
    expect(validateCSVFile({ name: "malware.exe", size: 1024 }).valid).toBe(false);
    expect(validateCSVFile({ name: "huge.csv", size: 100 * 1024 * 1024 }).valid).toBe(false);
  });
});

describe("Multi-Column Sorting (Column B -> Column C -> Column D...)", () => {
  const dataset = [
    ["ID", "Dept", "Team", "Level", "Name"],
    ["1", "Engineering", "Backend", "3", "Zoe"],
    ["2", "Sales", "Enterprise", "1", "Bob"],
    ["3", "Engineering", "Frontend", "2", "Alice"],
    ["4", "Engineering", "Backend", "1", "Charlie"],
    ["5", "Engineering", "Backend", "2", "Dave"],
  ];

  test("sorts by Column B (Primary), then Column C (Secondary), then Column D (Tertiary)", () => {
    const sorted = sortCSVData(dataset, [
      { column: "Column B", direction: "asc" },
      { column: "Column C", direction: "asc" },
      { column: "Column D", direction: "asc" },
    ]);

    expect(sorted).toEqual([
      ["ID", "Dept", "Team", "Level", "Name"],
      ["4", "Engineering", "Backend", "1", "Charlie"],
      ["5", "Engineering", "Backend", "2", "Dave"],
      ["1", "Engineering", "Backend", "3", "Zoe"],
      ["3", "Engineering", "Frontend", "2", "Alice"],
      ["2", "Sales", "Enterprise", "1", "Bob"],
    ]);
  });

  test("supports mixed ascending/descending directions and numeric comparison", () => {
    const rows = [
      ["Code", "Group", "Score"],
      ["X1", "Alpha", "100"],
      ["X2", "Alpha", "20"],
      ["X3", "Beta", "5"],
      ["X4", "Alpha", "2"],
    ];

    const sorted = sortCSVData(rows, [
      { column: "B", direction: "asc" },
      { column: "C", direction: "desc" },
    ]);

    expect(sorted.slice(1).map((r) => r[0])).toEqual(["X1", "X2", "X4", "X3"]);
  });
});

describe("Two-CSV Comparison Engine", () => {
  const csv1 = [
    "ID,Dept,Role,Salary",
    "102,Engineering,Senior,150000",
    "101,Engineering,Junior,95000",
    "103,Finance,Analyst,85000",
  ].join("\n");

  const csv2 = [
    "ID,Dept,Role,Salary",
    "101,Engineering,Mid,110000",
    "102,Engineering,Senior,150000",
    "104,HR,Manager,120000",
  ].join("\n");

  test("compares row-by-row after sorting by Column B, Column C, Column D", () => {
    const result = compareCSVs(csv1, csv2, {
      hasHeaders: true,
      matchMode: "row",
      sortRules: [
        { column: "B", direction: "asc" },
        { column: "C", direction: "asc" },
        { column: "D", direction: "asc" },
      ],
    });

    expect(result.summary.totalRows).toBe(3);
    // After sorting by Dept (B), Role (C), Salary (D):
    // CSV1 row 0: 101, Engineering, Junior, 95000 vs CSV2 row 0: 101, Engineering, Mid, 110000 -> modified
    // CSV1 row 1: 102, Engineering, Senior, 150000 vs CSV2 row 1: 102, Engineering, Senior, 150000 -> unchanged
    // CSV1 row 2: 103, Finance, Analyst, 85000 vs CSV2 row 2: 104, HR, Manager, 120000 -> modified
    expect(result.diffRows[0].status).toBe("modified");
    expect(result.diffRows[1].status).toBe("unchanged");
    expect(result.diffRows[2].status).toBe("modified");
  });

  test("compares by Key Column (Column A) and detects unchanged, modified, added, and removed rows", () => {
    const result = compareCSVs(csv1, csv2, {
      hasHeaders: true,
      matchMode: "key",
      keyColumns: ["Column A"],
      sortRules: [{ column: "A", direction: "asc" }],
    });

    expect(result.summary).toEqual({
      totalRows: 4,
      unchanged: 1, // 102
      modified: 1, // 101 (Role & Salary changed)
      added: 1, // 104
      removed: 1, // 103
      identical: false,
    });

    // Sorted by Column A ascending: 101, 102, 103, 104
    expect(result.diffRows.map((r) => r.status)).toEqual([
      "modified",
      "unchanged",
      "removed",
      "added",
    ]);

    // Check cell-level diff on row 101
    const row101 = result.diffRows[0];
    expect(row101.cells[2]).toEqual({
      colIndex: 2,
      valueA: "Junior",
      valueB: "Mid",
      status: "modified",
    });
    expect(row101.cells[3]).toEqual({
      colIndex: 3,
      valueA: "95000",
      valueB: "110000",
      status: "modified",
    });
  });

  test("is immune to prototype pollution keys like __proto__, constructor, toString", () => {
    const maliciousA = "Key,Secret\n__proto__,val1\nconstructor,val2\ntoString,val3";
    const maliciousB = "Key,Secret\n__proto__,val1\nconstructor,changed\ntoString,val3";

    const res = compareCSVs(maliciousA, maliciousB, {
      matchMode: "key",
      keyColumns: [0],
    });

    expect(res.summary.unchanged).toBe(2);
    expect(res.summary.modified).toBe(1);
    expect(({}).polluted).toBeUndefined();
  });
});

describe("Security: CSV Formula Injection Protection & Memory Wipe", () => {
  test("neutralizes dangerous formula prefixes (=, +, -, @) while allowing negative numbers", () => {
    expect(sanitizeCSVCellForExport("=HYPERLINK(\"http://evil.com\", \"Click\")")).toBe(
      "\"'=HYPERLINK(\"\"http://evil.com\"\", \"\"Click\"\")\""
    );
    expect(sanitizeCSVCellForExport("+cmd|' /C calc'!A0")).toBe("\"'\" +cmd|' /C calc'!A0\"".replace("\"'\" ", "\"'"));
    expect(sanitizeCSVCellForExport("@SUM(A1:A2)")).toBe("\"'@SUM(A1:A2)\"");
    expect(sanitizeCSVCellForExport("-2+3")).toBe("\"'-2+3\"");
    // Plain negative number should NOT be prefixed with a single quote
    expect(sanitizeCSVCellForExport("-42.50")).toBe('"-42.50"');
    expect(sanitizeCSVCellForExport("Normal Text")).toBe('"Normal Text"');
  });

  test("exports comparison CSV with formula sanitization and status filtering", () => {
    const res = compareCSVs(
      "ID,Formula\n1,Safe\n2,Old",
      "ID,Formula\n1,Safe\n2,=EVIL()",
      { matchMode: "key", keyColumns: [0] }
    );

    const exportedDiffsOnly = exportComparisonCSV(res, {
      filter: "differences",
      sanitizeFormulas: true,
    });
    const lines = exportedDiffsOnly.split("\n");
    expect(lines.length).toBe(2); // Header + 1 modified row
    expect(lines[0]).toBe('"Status","File 1 Row","File 2 Row","ID","Formula"');
    expect(lines[1]).toBe('"MODIFIED","3","3","2","Old -> =EVIL()"');
  });

  test("wipes sensitive comparison data in-place", () => {
    const res = compareCSVs(
      "SSN,Name\n123-45-6789,Alice",
      "SSN,Name\n123-45-6789,Bob"
    );
    const cellRef = res.diffRows[0].cells[0];
    expect(cellRef.valueA).toBe("123-45-6789");

    wipeComparisonData(res);
    expect(cellRef.valueA).toBe("");
    expect(cellRef.valueB).toBe("");
    expect(res.diffRows.length).toBe(0);
    expect(res.headers.length).toBe(0);
  });
});

describe("Popup Compare UI & XSS Prevention", () => {
  const fs = require("fs");
  const path = require("path");

  beforeEach(() => {
    const html = fs.readFileSync(
      path.join(__dirname, "../src/popup.html"),
      "utf8"
    );
    document.documentElement.innerHTML = html;
    jest.resetModules();
    require("../src/js/csvCompare.js");
    require("../src/popup.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
  });

  test("renders XSS payloads safely as textContent without creating HTML elements and wipes on Clear Data", () => {
    // Switch to Compare CSVs tab
    const compareTab = document.getElementById("tab-compare-csv");
    compareTab.click();
    expect(document.body.classList.contains("compare-mode")).toBe(true);

    // Load CSV 1 and CSV 2 via paste flow with XSS payload
    document.getElementById("paste-btn-a").click();
    document.getElementById("paste-textarea-a").value =
      'ID,Payload\n1,"<img src=x onerror=alert(1)>"';
    document.getElementById("paste-apply-a").click();

    document.getElementById("paste-btn-b").click();
    document.getElementById("paste-textarea-b").value =
      'ID,Payload\n1,"<script>window.pwned=true</script>"';
    document.getElementById("paste-apply-b").click();

    const tbody = document.getElementById("cmp-diff-tbody");
    expect(tbody.querySelectorAll("img").length).toBe(0);
    expect(tbody.querySelectorAll("script").length).toBe(0);
    expect(window.pwned).toBeUndefined();
    expect(tbody.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(tbody.textContent).toContain("<script>window.pwned=true</script>");

    // Add multi-column sort rules via UI button
    const addSortBtn = document.getElementById("add-sort-rule-btn");
    addSortBtn.click();
    addSortBtn.click();
    expect(document.querySelectorAll(".sort-rule-row").length).toBe(2);

    // Wipe sensitive data via Clear Data button
    document.getElementById("wipe-data-btn").click();
    expect(tbody.textContent).toBe("");
    expect(document.getElementById("cmp-results-section").style.display).toBe("none");
  });
});

