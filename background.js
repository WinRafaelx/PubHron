const encoder = new TextEncoder();
const flaggedKeywords = ["porn", "explicit", "adult", "unsafe"];

let encryptionKey;
let salt;
let passwordSet = false;
let recentVisits = new Set();

async function deriveKeyFromPassword(password, providedSalt) {
    try {
        if (providedSalt) {
            salt = Uint8Array.from(atob(providedSalt), (c) => c.charCodeAt(0));
        } else {
            salt = crypto.getRandomValues(new Uint8Array(16));
            const saltString = btoa(String.fromCharCode(...salt));
            chrome.storage.local.set({ "encryption_salt": saltString });
        }

        const hashedPassword = await crypto.subtle.digest("SHA-256", encoder.encode(password));
        const keyMaterial = await crypto.subtle.importKey(
            "raw", hashedPassword, { name: "PBKDF2" }, false, ["deriveKey"]
        );
        encryptionKey = await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
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

// ✅ Improved deletion logic (partial match)
async function deleteFromHistory(url) {
    chrome.history.search({ text: "", maxResults: 100 }, (historyItems) => {
        for (const item of historyItems) {
            if (item.url.includes(url) || item.title.includes(url)) {
                chrome.history.deleteUrl({ url: item.url }, () => {
                    console.log(`Deleted history entry: ${item.url}`);
                });
            }
        }
    });
}

// ✅ Handle search query AND direct URLs
chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (!passwordSet || !encryptionKey) return;

    // Only track main frame requests
    if (details.frameId !== 0) return;

    let targetUrl = details.url;
    let queryString = new URL(targetUrl).searchParams.get("q");

    // ✅ Handle Google search terms separately
    if (queryString) {
        targetUrl = queryString.toLowerCase(); // Use search query if available
    }

    for (const keyword of flaggedKeywords) {
        if (targetUrl.toLowerCase().includes(keyword.toLowerCase())) {
            console.log("Flagged URL detected:", details.url);

            // ✅ Avoid double-logging within 5 seconds
            if (recentVisits.has(details.url)) return;
            recentVisits.add(details.url);
            setTimeout(() => recentVisits.delete(details.url), 5000);

            // ✅ Encrypt and store
            const result = await encryptUrl(details.url);
            if (!result) return;

            const { encryptedData, iv } = result;
            const encryptedString = btoa(String.fromCharCode(...encryptedData));
            const ivString = btoa(String.fromCharCode(...iv));
            chrome.storage.local.set({
                [Date.now()]: { data: encryptedString, iv: ivString }
            });

            // ✅ Delete from history using partial matching
            await deleteFromHistory(details.url);

            break;
        }
    }
});

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
            .then(success => {
                if (success) {
                    console.log("Encryption key derived from password");
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: "Failed to derive key" });
                }
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        return true;
    }
});
