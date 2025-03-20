import { pornKeywords } from "../keywords.js";

const pornRegex = new RegExp(pornKeywords.join("|"), "iu");

const checkedPages = new Map();
const deleteQueue = new Map();

const SAFE_HOSTNAMES = new Set(['google.com', 'github.com', 'microsoft.com']);

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

async function deleteFromHistory(url) {
  const now = Date.now();
  const origin = new URL(url).origin;

  if (deleteQueue.has(origin) && (now - deleteQueue.get(origin) < 5000)) return;
  deleteQueue.set(origin, now);

  try {
    await Promise.all([
      chrome.history.deleteUrl({ url }),
      chrome.browsingData.remove({
        origins: [origin],
        since: now - 15 * 60 * 1000,
      }, {
        cache: true,
        cookies: true,
        localStorage: true,
        serviceWorkers: true,
      }),
    ]);

    console.log(`✅ Cleaned: ${url}`);
    setTimeout(() => deleteQueue.delete(origin), 10000);
  } catch (error) {
    console.error("❌ Error cleaning:", error);
    deleteQueue.delete(origin);
  }
}

function analyzePageContent(tabId, url) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.body.innerText,
  }, ([result]) => {
    if (result?.result && pornRegex.test(result.result.toLowerCase())) {
      deleteFromHistory(url);
    }
  });
}

const testForPornContent = (url) => pornRegex.test(url.toLowerCase());

function cleanCheckedPagesCache(limit = 1000, expiryMs = 3600000) {
  if (checkedPages.size < limit) return;
  const now = Date.now();
  for (const [key, timestamp] of checkedPages) {
    if (timestamp < now - expiryMs) checkedPages.delete(key);
  }
}

function initNavigationHandlers(urlCallback) {
  chrome.webNavigation.onCommitted.addListener(({ url, frameId, tabId }) => {
    if (frameId === 0 && testForPornContent(url)) {
      deleteFromHistory(url);
      
      // Call the provided callback if it exists
      if (typeof urlCallback === 'function') {
        urlCallback(url);
      }
    }
  });

  chrome.webNavigation.onCompleted.addListener(debounce(({ url, frameId, tabId }) => {
    if (frameId !== 0) return;

    const { hostname, pathname, href } = new URL(url);
    const urlKey = hostname + pathname;
    const now = Date.now();

    if (checkedPages.has(urlKey) && (now - checkedPages.get(urlKey) < 300000)) return;
    checkedPages.set(urlKey, now);

    if (SAFE_HOSTNAMES.has(hostname)) return;

    cleanCheckedPagesCache();

    if (testForPornContent(href)) {
      deleteFromHistory(href);
      
      // Call the provided callback if it exists
      if (typeof urlCallback === 'function') {
        urlCallback(href);
      }
    } else {
      analyzePageContent(tabId, href);
    }
  }, 300), { url: [{ schemes: ["http", "https"] }] });
}

export { initNavigationHandlers, deleteFromHistory, testForPornContent, debounce };
