const {
  validateJSONFile,
  parseJSONRobust,
  flattenJSONToMap,
  computeLineDiff,
  compareJSON,
  exportJSONComparisonCSV,
  exportJSONComparisonReport,
  wipeJSONComparisonData,
} = require("../src/js/jsonCompare.js");

describe("JSON Validation & Safe Parsing", () => {
  test("validates JSON file extensions and size limits", () => {
    expect(validateJSONFile({ name: "config.json", size: 2048 }).valid).toBe(true);
    expect(validateJSONFile({ name: "script.exe", size: 2048 }).valid).toBe(false);
    expect(validateJSONFile({ name: "huge.json", size: 80 * 1024 * 1024 }).valid).toBe(false);
  });

  test("parses JSON with UTF-8 BOM and guards against __proto__ pollution", () => {
    const raw = '\uFEFF{"__proto__": {"polluted": true}, "safeKey": "value"}';
    const parsed = parseJSONRobust(raw);
    expect(({}).polluted).toBeUndefined();
    expect(parsed.safeKey).toBe("value");

    const map = flattenJSONToMap(parsed);
    expect(map.get("__proto__.polluted").value).toBe(true);
    expect(map.get("safeKey").value).toBe("value");
    expect(({}).polluted).toBeUndefined();
  });
});

describe("Line-by-Line Diff Helper", () => {
  test("computes accurate line numbers and +/- operations for multiline strings", () => {
    const strA = [
      "line 1: header",
      "line 2: old config",
      "line 3: shared middle",
      "line 4: to be removed",
      "shared footer",
    ].join("\n");

    const strB = [
      "line 1: header",
      "line 2: new config",
      "line 3: shared middle",
      "line 4: newly added A",
      "line 5: newly added B",
      "shared footer",
    ].join("\n");

    const diff = computeLineDiff(strA, strB);
    expect(diff.stats).toEqual({
      totalLines: 8,
      linesA: 5,
      linesB: 6,
      added: 3,
      removed: 2,
      unchanged: 3,
    });
  });
});

describe("Deep JSON Comparison Engine (Unified Table Rows including Multiline)", () => {
  const json1 = {
    version: 1,
    server: {
      host: "10.0.0.1",
      startupScript: "#!/bin/bash\necho 'starting v1'\nexport PORT=8080\nexec app",
    },
    users: [
      { id: "u1", role: "admin" },
      { id: "u2", role: "viewer" },
    ],
    deprecatedFlag: true,
  };

  const json2 = {
    version: 1,
    server: {
      host: "10.0.0.2",
      startupScript: "#!/bin/bash\necho 'starting v2'\nexport PORT=8080\nexec app\necho 'done'",
    },
    users: [
      { id: "u2", role: "editor" },
      { id: "u1", role: "admin" },
    ],
    newFeature: "enabled",
  };

  test("expands multiline string values into individual table rows ([Line N]) alongside standard keys", () => {
    const result = compareJSON(json1, json2, {
      arrayKeyProp: "id",
      sortBy: "path-asc",
    });

    // 8 standard scalar keys + 5 expanded lines for server.startupScript = 13 total rows
    expect(result.summary).toEqual({
      totalRows: 13,
      totalKeys: 13,
      unchanged: 7, // version, 3 user fields, plus Line 1, Line 3, Line 4 of startupScript
      modified: 3, // server.host, server.startupScript [Line 2], users[id="u2"].role
      added: 2, // newFeature, server.startupScript [Line 5]
      removed: 1, // deprecatedFlag
      multilineCount: 1, // 1 multiline key expanded into 5 rows
      identical: false,
    });

    const line2 = result.entries.find((e) => e.path === "server.startupScript [Line 2]");
    expect(line2).toBeDefined();
    expect(line2.status).toBe("modified");
    expect(line2.valueA).toBe("echo 'starting v1'");
    expect(line2.valueB).toBe("echo 'starting v2'");

    const line5 = result.entries.find((e) => e.path === "server.startupScript [Line 5]");
    expect(line5).toBeDefined();
    expect(line5.status).toBe("added");
    expect(line5.valueB).toBe("echo 'done'");
  });

  test("exports JSON comparison as CSV and Summary JSON and wipes sensitive data from memory", () => {
    const result = compareJSON(json1, json2);

    const csvOut = exportJSONComparisonCSV(result, { filter: "differences" });
    expect(csvOut).toContain('"Key / Path","Status","File 1 Value","File 2 Value"');
    expect(csvOut).toContain("server.startupScript [Line 2]");

    const reportJson = exportJSONComparisonReport(result, { filter: "differences" });
    const parsedReport = JSON.parse(reportJson);
    expect(parsedReport.entries.some((e) => e.path === "server.startupScript [Line 2]")).toBe(true);

    wipeJSONComparisonData(result);
    expect(result.entries.length).toBe(0);
  });
});

describe("Popup Compare JSON Unified Table UI", () => {
  const fs = require("fs");
  const path = require("path");

  beforeEach(() => {
    const html = fs.readFileSync(path.join(__dirname, "../src/popup.html"), "utf8");
    document.documentElement.innerHTML = html;
    jest.resetModules();
    require("../src/js/csvCompare.js");
    require("../src/js/jsonCompare.js");
    require("../src/popup.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
  });

  test("renders multiline JSON strings directly as individual table rows and neutralizes XSS", () => {
    const jsonTab = document.getElementById("tab-compare-json");
    jsonTab.click();
    expect(document.body.classList.contains("compare-mode")).toBe(true);

    const payloadA = JSON.stringify({
      title: "Normal",
      policy: "Line 1\n<img src=x onerror=alert(1)>\nLine 3",
    });
    const payloadB = JSON.stringify({
      title: "Normal",
      policy: "Line 1\n<script>window.hacked=true</script>\nLine 3\nLine 4",
    });

    document.getElementById("json-paste-btn-a").click();
    document.getElementById("json-paste-textarea-a").value = payloadA;
    document.getElementById("json-paste-apply-a").click();

    document.getElementById("json-paste-btn-b").click();
    document.getElementById("json-paste-textarea-b").value = payloadB;
    document.getElementById("json-paste-apply-b").click();

    const tbody = document.getElementById("json-diff-tbody");
    const rows = tbody.querySelectorAll("tr");
    // 1 row for 'title' + 4 rows for 'policy [Line 1..4]' = 5 table rows
    expect(rows.length).toBe(5);

    const pathCells = Array.from(tbody.querySelectorAll(".json-path-cell")).map(
      (td) => td.textContent
    );
    expect(pathCells).toEqual([
      "title",
      "policy [Line 1]",
      "policy [Line 2]",
      "policy [Line 3]",
      "policy [Line 4]",
    ]);

    // Ensure XSS payloads inside multiline strings are rendered purely as text
    expect(tbody.querySelectorAll("img").length).toBe(0);
    expect(tbody.querySelectorAll("script").length).toBe(0);
    expect(window.hacked).toBeUndefined();
    expect(tbody.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(tbody.textContent).toContain("<script>window.hacked=true</script>");

    // Clear Data wipes everything
    document.getElementById("wipe-json-data-btn").click();
    expect(tbody.textContent).toBe("");
  });

  test("auto-opens persistent standalone window on Firefox when clicking Compare tabs and supports Pop Out button", () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    // 1. Test explicit Pop Out button click
    const popoutBtn = document.getElementById("popout-window-btn");
    expect(popoutBtn).not.toBeNull();
    popoutBtn.click();
    expect(openSpy).toHaveBeenCalledWith(
      "popup.html?tab=table&standalone=1",
      "GridGenieWorkspace",
      "popup=yes,width=900,height=720"
    );

    // 2. Test Firefox auto-popout when clicking Compare CSVs / Compare JSON
    openSpy.mockClear();
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0",
      configurable: true,
    });

    document.getElementById("tab-compare-csv").click();
    expect(openSpy).toHaveBeenCalledWith(
      "popup.html?tab=compare-csv&standalone=1",
      "GridGenieWorkspace",
      "popup=yes,width=900,height=720"
    );

    Object.defineProperty(navigator, "userAgent", {
      value: originalUA,
      configurable: true,
    });
    openSpy.mockRestore();
  });
});

