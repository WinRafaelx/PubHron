const encoder = new TextEncoder();

let encryptionKey;
let salt;


async function initializeEncryption() {
  chrome.storage.local.get(["encryption_salt"], async (result) => {
    if (result.encryption_salt) {
      salt = Uint8Array.from(atob(result.encryption_salt), (c) => c.charCodeAt(0));
    } else {
      console.log("No password set yet");
    }
  });
}


async function generateSalt(providedSalt) {
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
    return true;
  } catch (err) {
    console.error("Error deriving key:", error);
    return false;
  }
}

async function deriveKeyFromPassword(password, providedSalt) {
  try {

    if (!providedSalt) {
      throw new Error("Setting password yet?");
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
    if (!(encryptedData instanceof ArrayBuffer)) {
      encryptedData = new Uint8Array(encryptedData).buffer;
    }
    if (!(iv instanceof ArrayBuffer)) {
      iv = new Uint8Array(iv).buffer;
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error, "Type:", error.name);
    return null;
  }
}
function saveEncryptedUrl(encryptedData, iv) {
  const encryptedString = btoa(String.fromCharCode(...encryptedData));
  const ivString = btoa(String.fromCharCode(...iv));

  console.log("hello save encrypt");

  chrome.storage.local.set({
    [Date.now()]: { data: encryptedString, iv: ivString },
  });
}

function resetEncryptionKey() {
  encryptionKey = null;

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
  hasEncryptionKey,
  generateSalt
};
