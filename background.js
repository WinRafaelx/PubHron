// background.js

// Define keyword-based filters
const categoryFilters = {
    porn: ["porn", "xxx", "adult", "sex"],
    gambling: ["bet", "gambling", "casino", "poker"],
    torrent: ["torrent", "piratebay", "1337x", "magnet"],
    ads: ["ads", "tracker", "analytics"],
  };
  
  // Generate dynamic rules for URL blocking
  function updateFilterRules() {
    const rules = [];
    let ruleId = 1;
  
    for (const [category, keywords] of Object.entries(categoryFilters)) {
      keywords.forEach((keyword) => {
        rules.push({
          id: ruleId++,
          priority: 1,
          action: {
            type: "block"
          },
          condition: {
            urlFilter: `*${keyword}*`,
            resourceTypes: ["main_frame"]
          }
        });
      });
    }
  
    // Update rules dynamically
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map((rule) => rule.id),
      addRules: rules
    });
  }
  
  // Encryption helper (AES-GCM)
  async function encryptUrl(url) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    return { encryptedData: new Uint8Array(encryptedData), iv };
  }
  
  // Event listener for navigation events
  chrome.webNavigation.onCommitted.addListener(async ({ url }) => {
    const parsedUrl = new URL(url);
    const combined = parsedUrl.hostname + parsedUrl.pathname;
  
    // Check non-HTTPS
    if (parsedUrl.protocol !== "https:") {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Security Warning",
        message: `The URL ${url} is not secure (non-HTTPS).`
      });
    }
  
    // Check custom blacklist (saved in storage)
    chrome.storage.local.get(["blacklist"], async (result) => {
      const blacklist = result.blacklist || [];
      const isBlacklisted = blacklist.some(keyword => combined.includes(keyword));
  
      if (isBlacklisted) {
        console.log(`Flagged URL: ${url}`);
  
        // Encrypt the URL and save to storage
        const { encryptedData, iv } = await encryptUrl(url);
        const encryptedString = btoa(String.fromCharCode(...encryptedData));
        const ivString = btoa(String.fromCharCode(...iv));
  
        chrome.storage.local.set({
          [Date.now()]: { data: encryptedString, iv: ivString, reason: "Blacklisted site" }
        });
  
        // Delete from history
        chrome.history.deleteUrl({ url });
  
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "URL Blocked",
          message: `Blocked due to: Blacklisted site.`
        });
      }
    });
  });
  
  // Initialize the extension
  chrome.runtime.onInstalled.addListener(() => {
    updateFilterRules(); // Load filters when the extension is installed/updated
  });
  
  chrome.runtime.onStartup.addListener(() => {
    updateFilterRules(); // Load filters on browser startup
  });
  