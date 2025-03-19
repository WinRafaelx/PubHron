import { 
  initNavigationHandlers, 
  deleteFromHistory, 
  testForPornContent,
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
  if (testForPornContent(url)) {
    console.log(`🚫 Pornographic URL detected: ${url}`);
    deleteFromHistory(url);

    if (!hasEncryptionKey()) return;
    
    const result = await encryptUrl(url);
    if (!result) return;

    const { encryptedData, iv } = result;
    saveEncryptedUrl(encryptedData, iv);
  }
}, 300);

// Initialize navigation handlers
initNavigationHandlers(processUrl);

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
