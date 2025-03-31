import { pornKeywords, gamblingKeywords, torrentPiracyKeywords, adTrackerDomains } from "../keywords.js";
import { checkUrlSafety, isHttpOnly } from "./safetyChecker.js";

let pornRegex = null;//new RegExp(pornKeywords.join("|"), "iu");
let gamblingRegex = null;//new RegExp(gamblingKeywords.join("|"), "iu");
let torrentPiracyRegex = null;//new RegExp(torrentPiracyKeywords.join("|"), "iu");
let adRegex = null;

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

async function loadGamblingBlocklist() {
  const blocklistURL = "https://blocklistproject.github.io/Lists/gambling.txt";
  
  try {
      const response = await fetch(blocklistURL);
      if (!response.ok) {
           throw new Error(`HTTP error! status: ${response.status}`);
       }
      const text = await response.text();
      const blockedSites = text.split("\n")
                               .map(line => line.trim())
                               .filter(line => line && !line.startsWith("#"));
      return new RegExp(blockedSites.join("|"), "iu");
    } catch (error) {
        console.error("❌ Error loading gambling blocklist:", error);
        return null;
    }
}

async function loadPornBlocklist() {
  const blocklistURL = "https://blocklistproject.github.io/Lists/porn.txt";
  
  try {
      const response = await fetch(blocklistURL);
      if (!response.ok) {
           throw new Error(`HTTP error! status: ${response.status}`);
       }
      const text = await response.text();
      const blockedSites = text.split("\n")
                               .map(line => line.trim())
                               .filter(line => line && !line.startsWith("#"));
      return new RegExp(blockedSites.join("|"), "iu");
    } catch (error) {
        console.error("❌ Error loading porn blocklist:", error);
        return null;
    }
}

async function loadTorrentBlocklist() {
  const blocklistURL = "https://blocklistproject.github.io/Lists/torrent.txt";
  
  try {
      const response = await fetch(blocklistURL);
      if (!response.ok) {
           throw new Error(`HTTP error! status: ${response.status}`);
       }
      const text = await response.text();
      const blockedSites = text.split("\n")
                               .map(line => line.trim())
                               .filter(line => line && !line.startsWith("#"));
      return new RegExp(blockedSites.join("|"), "iu");
    } catch (error) {
        console.error("❌ Error loading torrent blocklist:", error);
        return null;
    }
}

async function loadAdBlocklist() {
  const blocklistURL = "https://blocklistproject.github.io/Lists/ads.txt";
  
  try {
      const response = await fetch(blocklistURL);
      if (!response.ok) {
           throw new Error(`HTTP error! status: ${response.status}`);
       }
      const text = await response.text();
      const blockedSites = text.split("\n")
                               .map(line => line.trim())
                               .filter(line => line && !line.startsWith("#"));
      return new RegExp(blockedSites.join("|"), "iu");
    } catch (error) {
        console.error("❌ Error loading ads blocklist:", error);
        return null;
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

loadGamblingBlocklist().then(loadedRegex => {
  gamblingRegex = loadedRegex;
  console.log("✅ Gambling blocklist regex loaded!");
}).catch(error => {
   console.error("Failed to initialize gambling regex:", error);
});

loadPornBlocklist().then(loadedRegex => {
  pornRegex = loadedRegex;
  console.log("✅ Porn blocklist regex loaded!");
}).catch(error => {
   console.error("Failed to initialize porn regex:", error);
});

loadTorrentBlocklist().then(loadedRegex => {
  torrentPiracyRegex = loadedRegex;
  console.log("✅ Torrent blocklist regex loaded!");
}).catch(error => {
   console.error("Failed to initialize torrent regex:", error);
});

loadAdBlocklist().then(loadedRegex => {
  adRegex = loadedRegex;
  console.log("✅ Ads blocklist regex loaded!");
}).catch(error => {
   console.error("Failed to initialize ads regex:", error);
});

function testForPornContent(url) {
  if (!pornRegex) {
    console.warn("⚠️ Porn regex not loaded yet!");
    return false;
  }
  return pornRegex.test(url.toLowerCase());
}

function testForGamblingContent(url) {
  if (!gamblingRegex) {
    console.warn("⚠️ Gambling regex not loaded yet!");
    return false;
  }
  return gamblingRegex.test(url.toLowerCase());
}

function testForPiracyContent(url) {
  if (!torrentPiracyRegex) {
    console.warn("⚠️ Torrent regex not loaded yet!");
    return false;
  }
  return torrentPiracyRegex.test(url.toLowerCase());
}

function isAdTracker(url) {
  if (!adRegex) {
    console.warn("⚠️ Ads regex not loaded yet!");
    return false;
  }
  return adRegex.test(url.toLowerCase());
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
