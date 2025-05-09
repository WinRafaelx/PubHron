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
  isGoogleSearch,
  isUrlInadSets,
  isUrlIngamblingSets,
  isUrlInpornSets,
  isUrlIntorrentSets
} from "./handler/navigationHandler.js";

import {
  initializeEncryption,
  deriveKeyFromPassword,
  encryptUrl,
  decryptUrl,
  saveEncryptedUrl,
  resetEncryptionKey,
  hasEncryptionKey,
  generateSalt
} from "./handler/historyHandler.js";

// Initialize encryption system on startup
initializeEncryption();

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "encryptAndSaveUrl") {
    const { url } = message;

    try {
      if (hasEncryptionKey()) {
        console.log("Encrypting URL in background");

        const result = await encryptUrl(url);

        if (result) {
          const { encryptedData, iv } = result;
          saveEncryptedUrl(encryptedData, iv);

          sendResponse({ success: true });
        } else {
          sendResponse({ success: false });
        }
      } else {
        console.log("No encryption key available");
        sendResponse({ success: false });
      }
    } catch (error) {
      console.error("Error encrypting URL:", error);
      sendResponse({ success: false });
    }
  }

  // Returning true allows asynchronous response
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "isEncryptionReady") {
    sendResponse({ ready: hasEncryptionKey() });
    // return true;
  }
});
// Update the processUrl function
const processUrl = debounce(async (url) => {
  try {
    // Always check for pornographic content
    if (testForPornContent(url) || isUrlInpornSets(url)) {
      console.log(`🚫 Pornographic URL detected: ${url}`);
      deleteFromHistory(url);
      if (!hasEncryptionKey()) {
        chrome.windows.create({
          url: "views/html/popup.html",
          type: "popup",
          width: 400,
          height: 300,
        },
          (window) => {
            chrome.runtime.sendMessage({ action: "sendUrlToPopup", url });
          });

      }
      if (hasEncryptionKey()) {
        console.log("test encryption in background");
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
    if (isAdTracker(urlObj.hostname) || isUrlInadSets(url)) {
      console.log(`📊 Ad/Tracker domain detected: ${url}`);
      return;
    }

    // Check for HTTP-only sites
    if (isHttpOnly(url)) {
      console.log(`🔓 HTTP-only site detected: ${url}`);
      return;
    }

    // Check for gambling sites
    if (testForGamblingContent(url) || isUrlIngamblingSets(url)) {
      console.log(`🎰 Gambling site detected: ${url}`);
      return;
    }

    // Check for torrent/piracy sites
    if (testForPiracyContent(url) || isUrlIntorrentSets(url)) {
      console.log(`🏴‍☠️ Torrent/Piracy site detected: ${url}`);
      return;
    }

  } catch (error) {
    console.error("Error processing URL:", error);
  }
}, 1700);

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
    generateSalt(message.salt)
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
