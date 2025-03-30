import {
  initNavigationHandlers,
  deleteFromHistory,
  testForPornContent,
  testForGamblingContent,
  testForPiracyContent,
  isAdTracker,
  isHttpOnly,
  checkSiteCategories,
  debounce,
  isGoogleSearch
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

// Update the processUrl function
const processUrl = debounce(async (url) => {
  try {
    // Always check for pornographic content
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

    // Check if it's a Google Search page
    if (isGoogleSearch(url)) {
      // For Google Search, we only block porn (already checked above)
      // Allow all other content categories
      return;
    }

    // For non-Google Search pages, check all other categories
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
}, 500);

// Initialize navigation handlers with processUrl callback
initNavigationHandlers(processUrl);

// Add a listener for tab updates to process URLs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    processUrl(tab.url);
  }
});

function isValidBase64(string) {
  try {
    return btoa(atob(string)) === string;
  } catch (e) {
    return false;
  }
}


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
      if (!isValidBase64(message.data) || !isValidBase64(message.iv)) {
        sendResponse({ success: false, error: "Invalid Base64 data" });
        return true;
      }

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
