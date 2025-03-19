import { pornKeywords } from "../keywords.js";

// Create a compiled regex pattern once instead of rebuilding it each time
const pornRegex = new RegExp(pornKeywords.join("|"), "i");

// Cache for page content checks to avoid checking the same pages multiple times
const checkedPages = {};

// Replace simple Set with object that includes timestamps
const deleteQueue = {};

// Create a debounce function for expensive operations
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Improved deletion logic with better debouncing
async function deleteFromHistory(url) {
  const now = Date.now();
  const urlKey = new URL(url).origin;
  
  // Skip if we've processed this domain in the last 5 seconds
  if (deleteQueue[urlKey] && (now - deleteQueue[urlKey] < 5000)) {
    return;
  }
  
  deleteQueue[urlKey] = now;

  try {
    chrome.history.deleteUrl({ url }, () => {
      console.log(`✅ Deleted history entry: ${url}`);
    });

    chrome.browsingData.remove({
      origins: [new URL(url).origin],
      since: now - (15 * 60 * 1000) // Only last 15 minutes
    }, {
      cache: true,
      cookies: true, 
      localStorage: true,
      serviceWorkers: true
    }, () => console.log(`✅ Cache and storage cleared for: ${url}`));

    setTimeout(() => {
      delete deleteQueue[urlKey];
    }, 10000);
  } catch (error) {
    console.error("❌ Error deleting from history:", error);
    delete deleteQueue[urlKey];
  }
}

function initNavigationHandlers(processUrl) {
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (!details.url || details.frameId !== 0) return;
    processUrl(details.url);
  });

  chrome.webNavigation.onCompleted.addListener(
    (details) => {
      if (!details.url || details.frameId !== 0) return;
      const urlObj = new URL(details.url);
      const urlKey = urlObj.hostname + urlObj.pathname;
      
      if (checkedPages[urlKey] && (Date.now() - checkedPages[urlKey] < 300000)) {
        return;
      }
      
      checkedPages[urlKey] = Date.now();
      
      const safeHostnames = ['google.com', 'github.com', 'microsoft.com'];
      if (safeHostnames.some(safe => urlObj.hostname.includes(safe))) {
        return;
      }
      
      if (Object.keys(checkedPages).length > 1000) {
        const oldestAllowed = Date.now() - 3600000;
        for (const key in checkedPages) {
          if (checkedPages[key] < oldestAllowed) {
            delete checkedPages[key];
          }
        }
      }

      if (deleteQueue[urlObj.origin]) return;

      processUrl(details.url);
    },
    { url: [{ schemes: ["http", "https"] }] }
  );
}

function testForPornContent(url) {
  return pornRegex.test(url);
}

export { 
  initNavigationHandlers, 
  deleteFromHistory, 
  testForPornContent,
  debounce
};
