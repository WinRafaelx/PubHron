const encoder = new TextEncoder();

let encryptionKey;
let salt;
let passwordSet = false;

async function initializeEncryption() {
  chrome.storage.local.get(["encryption_salt", "encryption_key", "password_set"], async (result) => {
    if (result.encryption_salt) {
      salt = Uint8Array.from(atob(result.encryption_salt), (c) => c.charCodeAt(0));
      passwordSet = !!result.password_set;
      console.log("Salt found, password status:", passwordSet ? "set" : "needed");
    } else {
      console.log("No password set yet");
    }

    if (result.encryption_key) {
      const keyBuffer = Uint8Array.from(atob(result.encryption_key), (c) => c.charCodeAt(0));
      encryptionKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
      console.log("🔑 Encryption key restored");
    }
  });
}


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

    const exportedKey = await crypto.subtle.exportKey("raw", encryptionKey);
    const keyString = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
    chrome.storage.local.set({ encryption_key: keyString });

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
    if (error.name === 'OperationError') {
      console.error("Decryption operation error:", error);
    } else {
      console.error("Decryption error:", error, "Type:", error.name);
    }
    return null;
  }
}

function saveEncryptedUrl(encryptedData, iv) {
  const encryptedString = btoa(String.fromCharCode(...encryptedData));
  const ivString = btoa(String.fromCharCode(...iv));

  chrome.storage.local.set({
    [Date.now()]: { data: encryptedString, iv: ivString },
  });
}

function resetEncryptionKey() {
  encryptionKey = null;
  passwordSet = false;

}


function hasEncryptionKey() {
  return !!encryptionKey;
}

export {
  initializeEncryption,
  deriveKeyFromPassword,
  encryptUrl,
  decryptUrl,
  saveEncryptedUrl,
  resetEncryptionKey,
  hasEncryptionKey
};
