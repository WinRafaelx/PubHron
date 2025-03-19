import { pornKeywords } from "./keywords.js";

const encoder = new TextEncoder();

let encryptionKey;
let salt;
let passwordSet = false;

const deleteQueue = new Set();

const pornRegex = new RegExp(pornKeywords.join("|"), "i");

// ✅ Improved deletion logic with debouncing
async function deleteFromHistory(url) {
  if (deleteQueue.has(url)) return;
  deleteQueue.add(url);

  try {
    // 1. Delete from history
    chrome.history.search({ text: "", maxResults: 10000 }, (historyItems) => {
      for (const item of historyItems) {
        const baseUrl = new URL(item.url).origin + new URL(item.url).pathname;
        const targetBaseUrl = new URL(url).origin + new URL(url).pathname;

        if (
          item.url === url ||
          baseUrl === targetBaseUrl ||
          pornRegex.test(item.url) ||
          pornRegex.test(item.title)
        ) {
          chrome.history.deleteUrl({ url: item.url }, () => {
            console.log(`✅ Deleted history entry: ${item.url}`);
          });
        }
      }
    });

    // 2. Clear cache and storage
    chrome.browsingData.remove(
      { origins: [new URL(url).origin] },
      {
        cache: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        cacheStorage: true,
      },
      () => console.log(`✅ Cache and storage cleared for: ${url}`)
    );

    // 3. Clear cookies
    chrome.cookies.getAll({ domain: new URL(url).hostname }, (cookies) => {
      cookies.forEach((cookie) => {
        chrome.cookies.remove({
          url: `https://${cookie.domain}${cookie.path}`,
          name: cookie.name,
        });
        console.log(`✅ Cookie deleted: ${cookie.name}`);
      });
    });

    // 4. Clear DNS cache
    chrome.webRequest.handlerBehaviorChanged(() => {
      console.log("✅ Network stack refreshed");
    });

    // 5. Unregister service workers
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (registration.scope.includes(new URL(url).origin)) {
          await registration.unregister();
          console.log(`✅ Service worker unregistered for: ${url}`);
        }
      }
    }

    deleteQueue.delete(url); // Clean up after deletion
  } catch (error) {
    console.error("❌ Error deleting from history:", error);
    deleteQueue.delete(url);
  }
}


// ✅ Trigger deletion on URL commit (when the user finishes navigating)
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (!details.url) return;
  if (pornRegex.test(details.url)) {
    console.log(`🚫 Pornographic URL detected: ${details.url}`);
    deleteFromHistory(details.url);

    const result = await encryptUrl(details.url);
    if (!result) return;

    const { encryptedData, iv } = result;
    const encryptedString = btoa(String.fromCharCode(...encryptedData));
    const ivString = btoa(String.fromCharCode(...iv));

    chrome.storage.local.set({
      [Date.now()]: { data: encryptedString, iv: ivString },
    });
  }
});

// ✅ Additional check for title-based content (after page load)
chrome.webNavigation.onCompleted.addListener(
  async (details) => {
    if (deleteQueue.has(details.url)) return; // Skip if already processed

    try {
      const response = await fetch(details.url);
      if (!response.ok) return;

      const html = await response.text();

      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const metaMatch = html.match(
        /<meta\s+name="description"\s+content="(.*?)"/i
      );

      const pageTitle = titleMatch ? titleMatch[1].toLowerCase() : "";
      const pageDescription = metaMatch ? metaMatch[1].toLowerCase() : "";

      if (
        pornRegex.test(pageTitle) || // Match based on title content
        pornRegex.test(pageDescription)
      ) {
        console.log(
          `🚫 Pornographic content detected in title/meta: ${details.url}`
        );
        deleteFromHistory(details.url);
      }

      const result = await encryptUrl(details.url);
      if (!result) return;

      const { encryptedData, iv } = result;
      const encryptedString = btoa(String.fromCharCode(...encryptedData));
      const ivString = btoa(String.fromCharCode(...iv));

      chrome.storage.local.set({
        [Date.now()]: { data: encryptedString, iv: ivString },
      });
    } catch (error) {
      console.error("❌ Failed to fetch page content:", error);
    }
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
