// Check if password is already set when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    chrome.storage.local.get("encryption_salt", (result) => {
        if (result.encryption_salt) {
            // Password already set, show login view
            document.getElementById("setup-view").style.display = "none";
            document.getElementById("login-view").style.display = "block";
        }
    });
});

// Set password functionality
document.getElementById("set-password").addEventListener("click", async () => {
    const password = document.getElementById("password").value;
    if (password) {
        try {
            // Generate a salt for PBKDF2
            const salt = crypto.getRandomValues(new Uint8Array(16));
            // Convert salt to string for storage
            const saltString = btoa(String.fromCharCode(...salt));
            
            // Send message and wait for response
            chrome.runtime.sendMessage({ 
                type: "SET_PASSWORD", 
                password,
                salt: saltString 
            }, response => {
                if (response && response.success) {
                    // Store salt in local storage
                    chrome.storage.local.set({ "encryption_salt": saltString });
                    alert("Password set successfully!");
                    
                    // Switch to login view
                    document.getElementById("setup-view").style.display = "none";
                    document.getElementById("login-view").style.display = "block";
                } else {
                    alert("Failed to set password: " + (response?.error || "Unknown error"));
                }
            });
        } catch (error) {
            console.error("Error setting password:", error);
            alert("Error setting password: " + error.message);
        }
    } else {
        alert("Please enter a password");
    }
});

// Login functionality
document.getElementById("login-button").addEventListener("click", async () => {
    const password = document.getElementById("login-password").value;
    if (!password) {
        alert("Please enter your password");
        return;
    }

    // Check if the password is correct by trying to decrypt a test value
    chrome.storage.local.get("encryption_salt", async (result) => {
        if (!result.encryption_salt) {
            alert("No password has been set. Please set a password first.");
            return;
        }

        try {
            // Verify password by sending to background script
            chrome.runtime.sendMessage({
                type: "VERIFY_PASSWORD",
                password,
                salt: result.encryption_salt
            }, response => {
                if (response && response.success) {
                    // Password correct, show history view
                    document.getElementById("login-view").style.display = "none";
                    document.getElementById("history-view").style.display = "block";
                } else {
                    alert("Incorrect password. Please try again.");
                }
            });
        } catch (error) {
            console.error("Error during login:", error);
            alert("Error during login: " + error.message);
        }
    });
});

// Show history functionality
document.getElementById("show-history").addEventListener("click", async () => {
    const historyList = document.getElementById("history-list");
    historyList.innerHTML = "";

    // Load encrypted data from storage
    chrome.storage.local.get(null, async (items) => {
        // Skip processing if we don't have items
        if (!items) return;
        
        // Process history items
        for (const [key, value] of Object.entries(items)) {
            // Skip the salt entry
            if (key === "encryption_salt") continue;
            
            try {
                const { data, iv } = value;
                
                // Request decryption from background script
                chrome.runtime.sendMessage({
                    type: "DECRYPT_URL",
                    data,
                    iv
                }, response => {
                    if (response && response.success) {
                        const url = response.decryptedUrl;
                        const li = document.createElement("li");
                        li.textContent = `${new Date(parseInt(key)).toLocaleString()}: ${url}`;
                        historyList.appendChild(li);
                    }
                });
            } catch (error) {
                console.error("Failed to process history item:", error);
            }
        }
    });
});

// Logout functionality
document.getElementById("logout-button").addEventListener("click", () => {
    // Send logout message to background script
    chrome.runtime.sendMessage({ type: "LOGOUT" }, () => {
        // Return to login view
        document.getElementById("history-view").style.display = "none";
        document.getElementById("login-view").style.display = "block";
        document.getElementById("login-password").value = "";
    });
});