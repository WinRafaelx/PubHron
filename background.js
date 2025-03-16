const encoder = new TextEncoder();
const flaggedKeywords = ["porn", "explicit", "adult", "unsafe"];

let encryptionKey;

// Initialize encryption key from password
async function deriveKeyFromPassword(password) {
    const hashedPassword = await crypto.subtle.digest("SHA-256", encoder.encode(password));
    const keyMaterial = await crypto.subtle.importKey(
        "raw", hashedPassword, { name: "PBKDF2" }, false, ["deriveKey"]
    );
    encryptionKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: crypto.getRandomValues(new Uint8Array(16)),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

// Encrypt the URL
async function encryptUrl(url) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        encryptionKey,
        encoder.encode(url)
    );
    return { encryptedData: new Uint8Array(encrypted), iv };
}

// Decrypt the URL
async function decryptUrl(encryptedData, iv) {
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        encryptionKey,
        encryptedData
    );
    return new TextDecoder().decode(decrypted);
}

// Intercept history events and encrypt if needed
chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.url) {
        for (const keyword of flaggedKeywords) {
            if (details.url.includes(keyword)) {
                console.log("Flagged URL detected:", details.url);
                
                // Encrypt the URL
                const { encryptedData, iv } = await encryptUrl(details.url);
                
                // Save to storage
                const encryptedString = btoa(String.fromCharCode(...encryptedData));
                const ivString = btoa(String.fromCharCode(...iv));
                chrome.storage.local.set({ [Date.now()]: { data: encryptedString, iv: ivString } });

                // Remove from history
                chrome.history.deleteUrl({ url: details.url });
                
                console.log("Encrypted and stored URL:", encryptedString);
                break;
            }
        }
    }
});

// Listen for password setup from popup
chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === "SET_PASSWORD") {
        await deriveKeyFromPassword(message.password);
        console.log("Encryption key derived from password.");
    }
});
