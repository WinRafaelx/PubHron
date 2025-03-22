import { pornKeywords, gamblingKeywords, torrentPiracyKeywords, adTrackerDomains } from "../keywords.js";
import { checkUrlSafety, isHttpOnly } from "./safetyChecker.js";

const pornRegex = new RegExp(pornKeywords.join("|"), "iu");
const gamblingRegex = new RegExp(gamblingKeywords.join("|"), "iu");
const torrentPiracyRegex = new RegExp(torrentPiracyKeywords.join("|"), "iu");

const checkedPages = new Map();
const deleteQueue = new Map();
const warningShown = new Set(); // Track URLs we've already shown warnings for

const SAFE_HOSTNAMES = new Set(['google.com', 'github.com', 'microsoft.com']);

// Add this new function to detect Google Search pages
function isGoogleSearch(url) {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('google.')) return false;

    // Check if it's a search results page
    return urlObj.pathname === '/search' || 
           urlObj.pathname === '/webhp' || 
           urlObj.search.includes('?q=') || 
           urlObj.search.includes('&q=');
  } catch (e) {
    return false;
  }
}

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
    if (result?.result) {
      const text = result.result.toLowerCase();
      if (pornRegex.test(text) || gamblingRegex.test(text) || torrentPiracyRegex.test(text)) {
        deleteFromHistory(url);
      }
    }
  });
}

function testForPornContent(url) {
  return pornRegex.test(url.toLowerCase());
}

function testForGamblingContent(url) {
  return gamblingRegex.test(url.toLowerCase());
}

function testForPiracyContent(url) {
  return torrentPiracyRegex.test(url.toLowerCase());
}

function isAdTracker(hostname) {
  return adTrackerDomains.some(domain => hostname.includes(domain));
}

function cleanCheckedPagesCache(limit = 1000, expiryMs = 3600000) {
  if (checkedPages.size < limit) return;
  const now = Date.now();
  for (const [key, timestamp] of checkedPages) {
    if (timestamp < now - expiryMs) checkedPages.delete(key);
  }
}

async function showWarningPage(url, reason, tabId) {
  // Only show warning once per URL per session
  const urlKey = url.toString();
  if (warningShown.has(urlKey)) return false;
  
  warningShown.add(urlKey);
  
  try {
    // Update the tab with our warning page
    await chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL(`warning.html?url=${encodeURIComponent(url)}&reason=${encodeURIComponent(reason)}`)
    });
    return true;
  } catch (error) {
    console.error("Error showing warning page:", error);
    return false;
  }
}

// Modify the checkSiteCategories function
async function checkSiteCategories(url, tabId) {
  const urlObj = new URL(url);
  const { hostname, href } = urlObj;

  // Skip safe hostnames
  if (SAFE_HOSTNAMES.has(hostname)) return null;

  // Allow non-porn categories in Google Search results
  const isSearch = isGoogleSearch(href);

  // Check for HTTP-only sites
  if (isHttpOnly(href) && !isSearch) {
    return {
      category: "http",
      reason: "This site uses an unencrypted HTTP connection instead of secure HTTPS"
    };
  }

  // Check for ads and trackers
  if (isAdTracker(hostname) && !isSearch) {
    return {
      category: "adTracker",
      reason: "This appears to be an advertising or tracking domain"
    };
  }

  // Check for gambling
  if (testForGamblingContent(href) && !isSearch) {
    return {
      category: "gambling",
      reason: "This appears to be a gambling or betting website"
    };
  }

  // Check for torrents/piracy
  if (testForPiracyContent(href) && !isSearch) {
    return {
      category: "piracy",
      reason: "This appears to be a torrent or piracy-related website"
    };
  }

  // Check Google Safe Browsing - also bypass for search results
  if (!isSearch) {
    const isMalicious = await checkUrlSafety(href);
    if (isMalicious) {
      return {
        category: "unsafe",
        reason: "This site has been identified as potentially unsafe by Google Safe Browsing"
      };
    }
  }

  return null;
}

// Modify the initNavigationHandlers function
function initNavigationHandlers(urlCallback) {
  chrome.webNavigation.onCommitted.addListener(async ({ url, frameId, tabId }) => {
    if (frameId === 0) {
      // Skip processing if it's already a warning page
      if (url.startsWith(chrome.runtime.getURL('warning.html'))) {
        return;
      }

      // Always check for pornographic content first, regardless of being Google Search or not
      if (testForPornContent(url)) {
        deleteFromHistory(url);

        // Call the provided callback if it exists
        if (typeof urlCallback === 'function') {
          urlCallback(url);
        }
        return;
      }

      // Check other unsafe categories only if not a Google Search
      if (!isGoogleSearch(url)) {
        const result = await checkSiteCategories(url, tabId);
        if (result) {
          // Show warning for other categories
          showWarningPage(url, result.reason, tabId);
        }
      }
    }
  });

  chrome.webNavigation.onCompleted.addListener(debounce(async ({ url, frameId, tabId }) => {
    if (frameId !== 0) return;

    // Skip processing if it's already a warning page
    if (url.startsWith(chrome.runtime.getURL('warning.html'))) {
      return;
    }

    const urlObj = new URL(url);
    const { hostname, pathname, href } = urlObj;
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
      // Check other categories
      const result = await checkSiteCategories(href, tabId);
      if (result && !warningShown.has(href)) {
        showWarningPage(href, result.reason, tabId);
      } else {
        analyzePageContent(tabId, href);
      }
    }
  }, 300), { url: [{ schemes: ["http", "https"] }] });
}

export { 
  initNavigationHandlers, 
  deleteFromHistory, 
  testForPornContent,
  testForGamblingContent,
  testForPiracyContent,
  isAdTracker,
  isHttpOnly,
  checkSiteCategories,
  debounce,
  isGoogleSearch // Export the new function
};
