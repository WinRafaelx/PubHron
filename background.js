const encoder = new TextEncoder();

let encryptionKey;
let salt;
let passwordSet = false;

const browserSearch = ["google", "bing", "yahoo", "duckduckgo"];

const pornSites = [
  "porn",
  "xxx",
  "xvideo",
  "nude",
  "sex",
  "pornhub",
  "redtube",
  "brazzers",
  "nudity",
  "erotic",
  "nsfw",
  "hentai",
  "jav",
  "milf",
  "bbw",
  "incest",
  "fetish",
  "pornstar",
  "masturbation",
  "cum",
  "hardcore",
  "bdsm",
  "doujin",
  "rule34",
  "18+",
  "fakku",
  "e-hentai",
  "nhentai",
  "โป๊",
  "เย็ด",
  "เอ็ก",
  "ควย",
  "หี",
  "เสียว",
  "ลามก",
  "หนังโป๊",
  "คลิปหลุด",
  "ช่วยตัวเอง",
  "ขายตัว",
  "เปลือย",
  "แก้ผ้า",
  "จิ๋ม",
  "สวิงกิ้ง",
  "น้ำแตก",
  "หนังx",
  "นมใหญ่",
  "หำ",
  "รูหี",
  "ชักว่าว",
  "เย็ดสด",
  "ดูดควย",
  "ลงแขก",
  "ตั้งกล้อง",
  "โดนจ้อน",
  "จ้อน",
  "ควยถอก",
  "หัวควย",
  "ไข่สั่น",
  "หีแฉะ",
  "เย็ดหี",
  "เย็ดตูด",
  "แทงหี",
  "ดูหี",
  "นมโต",
  "เงี่ยน",
  "เย็ดแรง",
  "ขย่มควย",
  "แหกหี",
  "ควยใหญ่",
  "ควยแข็ง",
  "เย็ดมันส์",
  "เอาสด",
  "ปี้",
  "ล่อหี",
  "เสร็จคาปาก",
  "นั่งเทียน",
  "ไซด์ไลน์",
  "แตกใน",
  "แตกปาก",
  "หีฟิต",
  "หีใหญ่",
  "หีดำ",
  "เกี่ยวเบ็ด",
  "อมสด",
  "ควยปลอม",
  "doujinshi",
  "dojin",
  "dojinshi",
  "ecchi",
  "oppai",
  "lolicon",
  "shotacon",
  "ahegao",
  "h-manga",
  "eromanga",
  "exhentai",
];

// Use a Set for faster lookup
const flaggedKeywords = new Set([
  "explicit",
  "adult",
  "unsafe",
  ...browserSearch,
  ...pornSites,
]);

// Compile regex once (non-global, case-insensitive)
const flaggedRegex = new RegExp([...flaggedKeywords].join("|"), "i");

const recentVisits = new Set();

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (!passwordSet || !encryptionKey) return;

  if (details.frameId !== 0) return;

  const urlObj = new URL(details.url);
  const query = urlObj.searchParams.get("q");
  const targetContent = (query || details.url).toLowerCase();

  if (flaggedRegex.test(targetContent)) {
    console.log("Flagged URL detected:", details.url);

    if (recentVisits.has(details.url)) return;
    recentVisits.add(details.url);
    setTimeout(() => recentVisits.delete(details.url), 5000);

    const result = await encryptUrl(details.url);
    if (!result) return;

    const { encryptedData, iv } = result;
    const encryptedString = btoa(String.fromCharCode(...encryptedData));
    const ivString = btoa(String.fromCharCode(...iv));

    chrome.storage.local.set({
      [Date.now()]: { data: encryptedString, iv: ivString },
    });

    await deleteFromHistory(details.url);
    console.log("Deleted from history:", details.url);
  }
});

// ✅ Check title and meta description for better content filtering using `fetch`
chrome.webNavigation.onCompleted.addListener(
  async (details) => {
    if (!passwordSet || !encryptionKey) return;

    if (recentVisits.has(details.url)) return;

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

      if (flaggedRegex.test(pageTitle) || flaggedRegex.test(pageDescription)) {
        console.log("Flagged Content Detected:", details.url);

        if (recentVisits.has(details.url)) return;
        recentVisits.add(details.url);
        setTimeout(() => recentVisits.delete(details.url), 5000);

        const result = await encryptUrl(details.url);
        if (!result) return;

        const { encryptedData, iv } = result;
        const encryptedString = btoa(String.fromCharCode(...encryptedData));
        const ivString = btoa(String.fromCharCode(...iv));

        chrome.storage.local.set({
          [Date.now()]: { data: encryptedString, iv: ivString },
        });

        await deleteFromHistory(details.url);
        console.log("Deleted from history:", details.url);
      }
    } catch (error) {
      console.error("Failed to fetch content:", error);
    }
  },
  { url: [{ schemes: ["http", "https"] }] }
);

async function deleteFromHistory(url) {
  try {
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.origin}${urlObj.pathname}`; // Remove query and fragment

    chrome.history.search({ text: "", maxResults: 10000 }, (historyItems) => {
      for (const item of historyItems) {
        const itemUrlObj = new URL(item.url);
        const itemBaseUrl = `${itemUrlObj.origin}${itemUrlObj.pathname}`;

        // Match base URLs and remove fragments or query params
        if (
          item.url === url || // Exact match
          itemBaseUrl === baseUrl || // Base URL match
          item.url.startsWith(baseUrl) || // Partial match for variations
          item.title.includes(urlObj.hostname) // Title-based match
        ) {
          chrome.history.deleteUrl({ url: item.url }, () => {
            console.log(`Deleted history entry: ${item.url}`);
          });
        }
      }
    });
  } catch (error) {
    console.error("Failed to delete from history:", error);
  }
}

async function deriveKeyFromPassword(password, providedSalt) {
  try {
    if (providedSalt) {
      salt = Uint8Array.from(atob(providedSalt), (c) => c.charCodeAt(0));
    } else {
      salt = crypto.getRandomValues(new Uint8Array(16));
      const saltString = btoa(String.fromCharCode(...salt));
      chrome.storage.local.set({ encryption_salt: saltString });
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
  if (!encryptionKey) return null;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      encryptedData
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
}

// ✅ Initialize password status
chrome.storage.local.get("encryption_salt", async (result) => {
  if (result.encryption_salt) {
    console.log("Salt found, awaiting password input");
  } else {
    console.log("No password set yet");
  }
});

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
        sendResponse({ success: false, error: error.message });
      });

    return true;
  } else if (message.type === "LOGOUT") {
    // Reset the encryption key but keep the salt
    encryptionKey = null;
    passwordSet = false;
    sendResponse({ success: true });
    return true;
  }
});
