import { 
  initNavigationHandlers, 
  deleteFromHistory, 
  testForPornContent,
  testForGamblingContent,
  testForPiracyContent,
  isAdTracker,
  isHttpOnly,
  checkSiteCategories,
  debounce 
} from "./handler/navigationHandler.js";

import {
  initializeEncryption,
  deriveKeyFromPassword,
  encryptUrl,
  decryptUrl,
  saveEncryptedUrl,
  resetEncryptionKey,
  hasEncryptionKey
} from "./handler/historyHandler.js";

// Initialize encryption system on startup
initializeEncryption();

// Process URL in batches with debouncing
const processUrl = debounce(async (url) => {
  try {
    // Check for pornographic content
    if (testForPornContent(url)) {
      console.log(`🚫 Pornographic URL detected: ${url}`);
      deleteFromHistory(url);

      if (hasEncryptionKey()) {
        const result = await encryptUrl(url);
        if (result) {
          const { encryptedData, iv } = result;
          saveEncryptedUrl(encryptedData, iv);
        }
      }
      return;
    }

    // Check other categories
    const urlObj = new URL(url);
    
    // Check for ads and trackers
    if (isAdTracker(urlObj.hostname)) {
      console.log(`📊 Ad/Tracker domain detected: ${url}`);
      return;
    }
    
    // Check for HTTP-only sites
    if (isHttpOnly(url)) {
      console.log(`🔓 HTTP-only site detected: ${url}`);
      return;
    }
    
    // Check for gambling sites
    if (testForGamblingContent(url)) {
      console.log(`🎰 Gambling site detected: ${url}`);
      return;
    }
    
    // Check for torrent/piracy sites
    if (testForPiracyContent(url)) {
      console.log(`🏴‍☠️ Torrent/Piracy site detected: ${url}`);
      return;
    }
    
  } catch (error) {
    console.error("Error processing URL:", error);
  }
}, 300);

// Initialize navigation handlers with processUrl callback
initNavigationHandlers(processUrl);

// Add a listener for tab updates to process URLs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    processUrl(tab.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_PASSWORD") {
    deriveKeyFromPassword(message.password, message.salt)
      .then((success) => {
        if (success) {
          console.log("Encryption key derived from password");
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Failed to derive key" });
        }
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true;
  } else if (message.type === "VERIFY_PASSWORD") {
    deriveKeyFromPassword(message.password, message.salt)
      .then((success) => {
        if (success) {
          console.log("Password verified successfully");
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Invalid password" });
        }
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true;
  } else if (message.type === "DECRYPT_URL") {
    if (!hasEncryptionKey()) {
      sendResponse({ success: false, error: "No encryption key available. Please log in first." });
      return true;
    }
    
    try {
      const encryptedData = Uint8Array.from(atob(message.data), (c) =>
        c.charCodeAt(0)
      );
      const ivData = Uint8Array.from(atob(message.iv), (c) => c.charCodeAt(0));

      decryptUrl(encryptedData, ivData)
        .then((url) => {
          if (url) {
            sendResponse({ success: true, decryptedUrl: url });
          } else {
            sendResponse({ success: false, error: "Failed to decrypt URL" });
          }
        })
        .catch((error) => {
          console.error("Detailed decryption error:", error);
          sendResponse({ 
            success: false, 
            error: `Decryption failed: ${error.name || 'Unknown error'}` 
          });
        });
    } catch (error) {
      console.error("Error processing encrypted data:", error);
      sendResponse({ success: false, error: "Invalid encrypted data format" });
    }

    return true;
  } else if (message.type === "LOGOUT") {
    resetEncryptionKey();
    sendResponse({ success: true });
    return true;
  }
});
