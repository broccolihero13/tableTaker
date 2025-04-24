let browser;

if (typeof browser === "undefined") {
  browser = chrome;
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const url = tabs[0].url || "";

    // first: restricted‑page check (as before)…
    const restricted = [/^chrome:\/\//, /^arc:\/\//, /addons\.mozilla\.org/, /chromewebstore\.google\.com/]
      .some(re => re.test(url));
    if (restricted) {
      showUnavailableMessage();
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: "checkButtons" }, response => {
      const couldNotConnect = !!chrome.runtime.lastError;
      const stale = couldNotConnect
                  || (!response.hasTables && response.buttonsStillAttached);
    
      if (stale) {
        showStalePageUI();
      } else {
        loadExtensionUI();
      }
    });
    
  });
});

const showUnavailableMessage = () => {
  document.body.innerHTML = `
    <div style="padding:1em;text-align:center">
      <h3>🔒 Grid Genie Unavailable</h3>
      <p>This page restricts extensions from running.</p>
    </div>`;
}

const showStalePageUI = () => {
  document.body.innerHTML = `
    <div style="padding:1em;text-align:center">
      <h3>⚠️ Session Expired</h3>
      <p>It looks like the page changed since activation.</p>
      <button id="gg-refresh">Refresh Page</button>
    </div>`;
  document.getElementById("gg-refresh").addEventListener("click", () => {
    chrome.tabs.reload();
    window.close();
  });
}

const loadExtensionUI = () => {
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
}
