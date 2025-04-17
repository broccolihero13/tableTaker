let browser;

if (typeof browser === "undefined") {
  browser = chrome;
}

document.getElementById("activate").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["js/content.js"]
      });
    }
  });
});