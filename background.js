import { pornKeywords } from "./keywords.js";

const encoder = new TextEncoder();

let encryptionKey;
let salt;
let passwordSet = false;

// Replace simple Set with object that includes timestamps
const deleteQueue = {};

// Create a compiled regex pattern once instead of rebuilding it each time
const pornRegex = new RegExp(pornKeywords.join("|"), "i");

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
    // Only delete specific URL rather than searching all history
    chrome.history.deleteUrl({ url }, () => {
      console.log(`✅ Deleted history entry: ${url}`);
    });

    // Use more targeted removal with a specific timeframe
    chrome.browsingData.remove({
      origins: [new URL(url).origin],
      since: now - (15 * 60 * 1000) // Only last 15 minutes
    }, {
      cache: true,
      cookies: true, 
      localStorage: true,
      serviceWorkers: true
    }, () => console.log(`✅ Cache and storage cleared for: ${url}`));

    // Clean up old entries from queue after 10 seconds
    setTimeout(() => {
      delete deleteQueue[urlKey];
    }, 10000);
  } catch (error) {
    console.error("❌ Error deleting from history:", error);
    delete deleteQueue[urlKey];
  }
}

// Process URL in batches with debouncing
const processUrl = debounce(async (url) => {
  if (pornRegex.test(url)) {
    console.log(`🚫 Pornographic URL detected: ${url}`);
    deleteFromHistory(url);

    // Only encrypt if we have an encryption key
    if (!encryptionKey) return;
    
    const result = await encryptUrl(url);
    if (!result) return;

    const { encryptedData, iv } = result;
    const encryptedString = btoa(String.fromCharCode(...encryptedData));
    const ivString = btoa(String.fromCharCode(...iv));

    chrome.storage.local.set({
      [Date.now()]: { data: encryptedString, iv: ivString },
    });
  }
}, 300); // Process URLs after 300ms of inactivity

// More efficient event listener with debouncing
chrome.webNavigation.onCommitted.addListener((details) => {
  if (!details.url || details.frameId !== 0) return; // Only process main frame
  processUrl(details.url);
});

// Cache for page content checks to avoid checking the same pages multiple times
const checkedPages = {};

// More efficient page content checking
chrome.webNavigation.onCompleted.addListener(
  (details) => {
    if (!details.url || details.frameId !== 0) return; // Only process main frame
    const urlObj = new URL(details.url);
    const urlKey = urlObj.hostname + urlObj.pathname;
    
    // Skip if we've checked this URL in the last 5 minutes
    if (checkedPages[urlKey] && (Date.now() - checkedPages[urlKey] < 300000)) {
      return;
    }
    
    checkedPages[urlKey] = Date.now();
    
    // Optimize by not checking content for known safe domains
    const safeHostnames = ['google.com', 'github.com', 'microsoft.com'];
    if (safeHostnames.some(safe => urlObj.hostname.includes(safe))) {
      return;
    }
    
    // Clean up old cache entries
    if (Object.keys(checkedPages).length > 1000) {
      const oldestAllowed = Date.now() - 3600000; // 1 hour
      for (const key in checkedPages) {
        if (checkedPages[key] < oldestAllowed) {
          delete checkedPages[key];
        }
      }
    }

    // Skip if already queued for deletion
    if (deleteQueue[urlObj.origin]) return;

    // Send the info for processing and encrypting instead of fetching content
    processUrl(details.url);
  },
  { url: [{ schemes: ["http", "https"] }] }
);

// ✅ Initialize encryption system properly
chrome.storage.local.get(["encryption_salt", "password_set"], async (result) => {
  if (result.encryption_salt) {
    salt = Uint8Array.from(atob(result.encryption_salt), (c) => c.charCodeAt(0));
    passwordSet = !!result.password_set;
    console.log("Salt found, password status:", passwordSet ? "set" : "needed");
  } else {
    console.log("No password set yet");
  }
});

async function deriveKeyFromPassword(password, providedSalt) {
  try {
    if (providedSalt) {
      salt = Uint8Array.from(atob(providedSalt), (c) => c.charCodeAt(0));
    } else {
      salt = crypto.getRandomValues(new Uint8Array(16));
      const saltString = btoa(String.fromCharCode(...salt));
      chrome.storage.local.set({ 
        encryption_salt: saltString,
        password_set: true 
      });
    }

    const hashedPassword = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(password)
    );
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      hashedPassword,
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    encryptionKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    passwordSet = true;
    return true;
  } catch (error) {
    console.error("Error deriving key:", error);
    return false;
  }
}

async function encryptUrl(url) {
  if (!encryptionKey) return null;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      encoder.encode(url)
    );
    return { encryptedData: new Uint8Array(encrypted), iv };
  } catch (error) {
    console.error("Encryption error:", error);
    return null;
  }
}

async function decryptUrl(encryptedData, iv) {
  if (!encryptionKey) {
    console.error("Decryption attempted without an encryption key");
    return null;
  }
  
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      encryptedData
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    // More detailed error logging
    if (error.name === 'OperationError') {
      console.error("Decryption operation error (likely incorrect key or corrupted data):", error);
    } else {
      console.error("Decryption error:", error, "Type:", error.name);
    }
    return null;
  }
}

// ✅ Handle password setup properly
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
    if (!encryptionKey) {
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
    // Reset the encryption key but keep the salt
    encryptionKey = null;
    passwordSet = false;
    sendResponse({ success: true });
    return true;
  }
});
