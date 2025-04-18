let browser;

if (typeof browser === "undefined") {
  browser = chrome;
}

document.getElementById("activate").addEventListener("click", () => {
  browser.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) {
      browser.tabs.sendMessage(tab.id, {
        action: "activate",
      });
    }
  });
});

document.getElementById("deactivate").addEventListener("click", () => {
  browser.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) {
      browser.tabs.sendMessage(tab.id, {
        action: "deactivate",
      });
    }
  });
});
