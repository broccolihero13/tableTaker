let browser;

if (typeof browser === "undefined") {
  browser = chrome;
}

browser.runtime.onInstalled.addListener(() => {
  console.log("Table CSV Downloader Extension installed.");
});
