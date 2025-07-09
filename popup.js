const searchInput = document.getElementById("search");
const refreshBtn = document.getElementById("refresh");
const authorBtn = document.getElementById("author");
const publishBtn = document.getElementById("publish");
const compareBtn = document.getElementById("compare");

const authorLogEl = document.getElementById("author-log");
const publishLogEl = document.getElementById("publish-log");

const filterError = document.getElementById("filter-error");
const filterWarn = document.getElementById("filter-warn");
const filterInfo = document.getElementById("filter-info");

let currentMode = "author"; // 'author', 'publish', or 'compare'
let authorRawLogText = "";
let publishRawLogText = "";
let currentSearch = "";

let filters = {
  error: true,
  warn: true,
  info: true,
};

let autoRefreshInterval = null;
const REFRESH_INTERVAL_MS = 5000;

const ENDPOINTS = {
  author:
    "http://localhost:4502/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log",
  publish:
    "http://localhost:4503/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log",
};

const closeBtn = document.getElementById("close-btn");
closeBtn.addEventListener("click", () => window.close());

// Debounce utility
function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// Auto-refresh controls
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(() => {
    refreshLogs();
  }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// Render logs based on current mode
function renderLogs() {
  authorLogEl.innerHTML = "";
  publishLogEl.innerHTML = "";

  const authorSection = document.querySelector(".log-section:nth-child(1)");
  const publishSection = document.querySelector(".log-section:nth-child(2)");

  if (currentMode === "author") {
    renderLogSection(authorLogEl, authorRawLogText);
    authorSection.classList.remove("hidden");
    publishSection.classList.add("hidden");
  } else if (currentMode === "publish") {
    renderLogSection(publishLogEl, publishRawLogText);
    publishSection.classList.remove("hidden");
    authorSection.classList.add("hidden");
  } else if (currentMode === "compare") {
    renderLogSection(authorLogEl, authorRawLogText);
    renderLogSection(publishLogEl, publishRawLogText);
    authorSection.classList.remove("hidden");
    publishSection.classList.remove("hidden");
  }
}

// Render individual log section with filters
function renderLogSection(container, logText) {
  const lines = logText.split("\n");
  let visibleLines = 0;

  lines.forEach((line) => {
    if (
      currentSearch &&
      !line.toLowerCase().includes(currentSearch.toLowerCase())
    ) {
      return;
    }

    if (
      (line.includes("ERROR") && !filters.error) ||
      (line.includes("WARN") && !filters.warn) ||
      (line.includes("INFO") && !filters.info)
    ) {
      return;
    }

    visibleLines++;

    const span = document.createElement("span");
    span.classList.add("log-line");

    if (line.includes("ERROR")) {
      span.classList.add("error");
    } else if (line.includes("WARN")) {
      span.classList.add("warn");
    } else if (line.includes("INFO")) {
      span.classList.add("info");
    }

    span.textContent = line;
    container.appendChild(span);
  });

  if (visibleLines === 0) {
    container.textContent = "No matching log lines.";
  }

  container.scrollTop = container.scrollHeight;
}

// Fetch logs from AEM Author or Publish
function fetchSingleLogs(env) {
  return new Promise((resolve) => {
    currentMode = env;
    const logUrl = ENDPOINTS[env];

    getLogsFromTab(logUrl, (result) => {
      if (result.success) {
        if (env === "author") {
          authorRawLogText = result.data;
        } else {
          publishRawLogText = result.data;
        }
        renderLogs();
      } else {
        showError(result.error);
      }
      resolve();
    });
  });
}

// Fetch logs from both Author and Publish
function fetchCompareLogs() {
  return new Promise((resolve) => {
    currentMode = "compare";
    let authorDone = false;
    let publishDone = false;

    authorLogEl.textContent = "Loading Author Logs...";
    publishLogEl.textContent = "Loading Publish Logs...";

    const checkDone = () => {
      if (authorDone && publishDone) {
        renderLogs();
        resolve();
      }
    };

    getLogsFromTab(ENDPOINTS.author, (result) => {
      authorDone = true;
      if (result.success) {
        authorRawLogText = result.data;
      } else {
        authorRawLogText = `Error: ${result.error}`;
      }
      checkDone();
    });

    getLogsFromTab(ENDPOINTS.publish, (result) => {
      publishDone = true;
      if (result.success) {
        publishRawLogText = result.data;
      } else {
        publishRawLogText = `Error: ${result.error}`;
      }
      checkDone();
    });
  });
}

// Communicate with content script
function getLogsFromTab(url, callback) {
  chrome.runtime.sendMessage(
    { action: "fetchLogsFromTab", url },
    (response) => {
      if (response) {
        callback(response);
      } else {
        callback({
          success: false,
          error: "No response. Are you on an AEM page?",
        });
      }
    }
  );
}

// Show error
function showError(message) {
  authorLogEl.textContent = `Error: ${message}`;
  publishLogEl.textContent = "";
}

// Refresh button (manual)
refreshBtn.addEventListener("click", () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading...";

  if (currentMode === "author") {
    authorLogEl.textContent = "Loading Author Logs...";
    publishLogEl.textContent = "";
  } else if (currentMode === "publish") {
    publishLogEl.textContent = "Loading Publish Logs...";
    authorLogEl.textContent = "";
  } else if (currentMode === "compare") {
    authorLogEl.textContent = "Loading Author Logs...";
    publishLogEl.textContent = "Loading Publish Logs...";
  }

  const done = () => {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh Logs";
  };

  if (currentMode === "compare") {
    fetchCompareLogs().then(done);
  } else {
    fetchSingleLogs(currentMode).then(done);
  }
});

// Search with debounce
const debouncedSearch = debounce(() => {
  currentSearch = searchInput.value.trim();
  renderLogs();
}, 400);

searchInput.addEventListener("input", debouncedSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    currentSearch = searchInput.value.trim();
    renderLogs();
  }
});

// Filter checkboxes
filterError.addEventListener("change", () => {
  filters.error = filterError.checked;
  renderLogs();
});

filterWarn.addEventListener("change", () => {
  filters.warn = filterWarn.checked;
  renderLogs();
});

filterInfo.addEventListener("change", () => {
  filters.info = filterInfo.checked;
  renderLogs();
});

// Mode buttons
authorBtn.addEventListener("click", () => {
  fetchSingleLogs("author").then(() => {
    startAutoRefresh();
  });
});

publishBtn.addEventListener("click", () => {
  fetchSingleLogs("publish").then(() => {
    startAutoRefresh();
  });
});

compareBtn.addEventListener("click", () => {
  fetchCompareLogs().then(() => {
    startAutoRefresh();
  });
});

// Initial load with auto-refresh
fetchSingleLogs("author").then(() => {
  startAutoRefresh();
});
