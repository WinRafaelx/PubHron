const encoder = new TextEncoder();

let encryptionKey;
let salt;
let passwordSet = false;

const pornKeywords = [
  "porn", "xxx", "xvideo", "nude", "sex", "pornhub", "redtube", "brazzers",
  "nudity", "erotic", "nsfw", "hentai", "jav", "milf", "bbw", "incest", "fetish",
  "pornstar", "masturbation", "cum", "hardcore", "bdsm", "doujin", "rule34",
  "18+", "fakku", "e-hentai", "nhentai", "โป๊", "เย็ด", "เอ็ก", "ควย", "หี",
  "เสียว", "ลามก", "หนังโป๊", "คลิปหลุด", "ช่วยตัวเอง", "ขายตัว", "เปลือย",
  "แก้ผ้า", "จิ๋ม", "สวิงกิ้ง", "น้ำแตก", "หนังx", "นมใหญ่", "หำ", "รูหี",
  "ชักว่าว", "เย็ดสด", "ดูดควย", "ลงแขก", "ตั้งกล้อง", "โดนจ้อน", "จ้อน",
  "ควยถอก", "หัวควย", "ไข่สั่น", "หีแฉะ", "เย็ดหี", "เย็ดตูด", "แทงหี",
  "ดูหี", "นมโต", "เงี่ยน", "เย็ดแรง", "ขย่มควย", "แหกหี", "ควยใหญ่",
  "ควยแข็ง", "เย็ดมันส์", "เอาสด", "ปี้", "ล่อหี", "เสร็จคาปาก", "นั่งเทียน",
  "ไซด์ไลน์", "แตกใน", "แตกปาก", "หีฟิต", "หีใหญ่", "หีดำ", "เกี่ยวเบ็ด",
  "อมสด", "ควยปลอม", "doujinshi", "dojin", "dojinshi", "ecchi", "oppai",
  "lolicon", "shotacon", "ahegao", "h-manga", "eromanga", "exhentai"
];

const deleteQueue = new Set();

const pornRegex = new RegExp(pornKeywords.join("|"), "i");

// ✅ Improved deletion logic with debouncing
async function deleteFromHistory(url) {
  if (deleteQueue.has(url)) return; // Skip if already deleting
  deleteQueue.add(url);

  try {
    setTimeout(() => {
      chrome.history.search({ text: "", maxResults: 10000 }, (historyItems) => {
        for (const item of historyItems) {
          // Clean up URL (remove query and fragment for better matching)
          const baseUrl = new URL(item.url).origin + new URL(item.url).pathname;
          const targetBaseUrl = new URL(url).origin + new URL(url).pathname;

          // Match full URL, base URL, or regex-based content
          if (
            item.url === url ||
            baseUrl === targetBaseUrl ||
            pornRegex.test(item.url) || // Regex-based match
            pornRegex.test(item.title)
          ) {
            chrome.history.deleteUrl({ url: item.url }, () => {
              console.log(`✅ Deleted history entry: ${item.url}`);
            });
          }
        }
      });

      deleteQueue.delete(url); // Clean up after deletion
    }, 200); // Small delay to avoid async conflict
  } catch (error) {
    console.error("❌ Error deleting from history:", error);
    deleteQueue.delete(url);
  }
}



// ✅ Trigger deletion on URL commit (when the user finishes navigating)
chrome.webNavigation.onCommitted.addListener((details) => {
  if (!details.url) return;
  if (pornRegex.test(details.url)) {
    console.log(`🚫 Pornographic URL detected: ${details.url}`);
    deleteFromHistory(details.url);
  }
});

// ✅ Additional check for title-based content (after page load)
chrome.webNavigation.onCompleted.addListener(async (details) => {
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
      console.log(`🚫 Pornographic content detected in title/meta: ${details.url}`);
      deleteFromHistory(details.url);
    }
  } catch (error) {
    console.error("❌ Failed to fetch page content:", error);
  }
}, { url: [{ schemes: ["http", "https"] }] });


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


async function loadConfig() {
  return new Promise((resolve, reject) => {
    fetch(chrome.runtime.getURL("config.json"))
      .then(response => response.json())
      .then(config => {
        console.log("✅ CONFIG loaded:", config);
        resolve(config);
      })
      .catch(reject);
  });
}


chrome.runtime.onInstalled.addListener(async () => {
  try {
    const config = await loadConfig();
    if (config && config.API_KEY) {
      chrome.storage.local.set({ apiKey: config.API_KEY }, () => {
        console.log("✅ API Key stored securely!");
      });
    } else {
      console.error("❌ API Key not found!");
    }
  } catch (error) {
    console.error("🚨 Failed to load config.js:", error);
  }
});


async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["apiKey"], (result) => {
      resolve(result.apiKey || null);
    });
  });
}


async function checkUrlSafety(url) {
  const apiKey = await getApiKey();
  console.log("🔑 API Key:", apiKey);

  if (!apiKey) {
    console.error("❌ API Key missing!");
    return false;
  }

  const requestBody = {
    "threatInfo": {
      "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING"],
      "platformTypes": ["WINDOWS"],
      "threatEntryTypes": ["URL"],
      "threatEntries": [
        { "url": "http://example.com" }
      ]
    }
  };

  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      console.error(`⚠ API Error: ${response.status} - ${response.statusText}`);
      return false;
    }

    const data = await response.json();
    return data.matches ? true : false;
  } catch (error) {
    console.error("🚨 Fetch error:", error.message);
    return false;
  }
}
function showWarningNotification(url) {
  console.log("🚨 แจ้งเตือนเว็บอันตราย:", url);

  chrome.notifications.create({
    type: "basic",
    iconUrl: "warning_icon.png",
    title: "⚠ เว็บไซต์อันตราย!",
    message: `เว็บไซต์นี้อาจเป็นอันตราย: ${url}`,
    priority: 2,
  });
}

chrome.webNavigation.onCommitted.addListener((details) => {
  console.log("🔄 Redirect ไปยัง:", details.url);
  checkWebsiteSafety(details.url);
}, { urls: ["<all_urls>"] });

async function checkWebsiteSafety(url) {
  console.log("🔍 ตรวจสอบเว็บ:", url);

  const isUnsafe = await checkUrlSafety(url);

  console.log("📌 ผลการตรวจสอบ:", isUnsafe ? "❌ อันตราย" : "✅ ปลอดภัย");

  if (isUnsafe) {
    showWarningNotification(url);
  }
}
