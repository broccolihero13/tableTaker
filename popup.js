function refreshExcludeList() {
  chrome.storage.sync.get(["excludedSites"], (data) => {
    const list = data.excludedSites || [];
    const ul = document.getElementById("exclude-list");
    ul.innerHTML = "";

    list.forEach((site, index) => {
      const li = document.createElement("li");
      li.textContent = site;

      const btn = document.createElement("button");
      btn.textContent = "Remove";
      btn.style.marginLeft = "10px";
      btn.addEventListener("click", () => {
        list.splice(index, 1);
        chrome.storage.sync.set({ excludedSites: list }, () => {
          refreshExcludeList();
          updateCurrentSiteStatus();
        });
      });

      li.appendChild(btn);
      ul.appendChild(li);
    });
  });
}

let currentHostname = null;

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url);
  currentHostname = url.hostname;

  refreshExcludeList();
  updateCurrentSiteStatus();
});

function updateCurrentSiteStatus() {
  const statusDiv = document.getElementById("current-site-status");
  chrome.storage.sync.get(["excludedSites"], (data) => {
    const list = data.excludedSites || [];
    if (currentHostname && list.includes(currentHostname)) {
      statusDiv.textContent = `✅ ${currentHostname} is excluded`;
      statusDiv.style.color = "green";
    } else {
      statusDiv.textContent = `❌ ${currentHostname} is not excluded`;
      statusDiv.style.color = "red";
    }
  });
}

document.getElementById("add-exclude").addEventListener("click", () => {
  const input = document.getElementById("exclude-input");
  const site = input.value.trim();
  if (!site) return;

  chrome.storage.sync.get(["excludedSites"], (data) => {
    const current = data.excludedSites || [];
    if (!current.includes(site)) {
      current.push(site);
      chrome.storage.sync.set({ excludedSites: current }, () => {
        refreshExcludeList();
        updateCurrentSiteStatus();
      });
      input.value = "";
    }
  });
});

document
  .getElementById("exclude-current")
  .addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = new URL(tab.url);
    const hostname = url.hostname;

    chrome.storage.sync.get(["excludedSites"], (data) => {
      const current = data.excludedSites || [];
      if (!current.includes(hostname)) {
        current.push(hostname);
        chrome.storage.sync.set({ excludedSites: current }, () => {
          refreshExcludeList();
          updateCurrentSiteStatus();
        });
      }
    });
  });

document.getElementById('exclude-input').addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    document.getElementById('add-exclude').click();
  }
});
