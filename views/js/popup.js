console.log("🔍 Popup script loaded");


document.addEventListener("DOMContentLoaded", () => {
    console.log("📦 DOM Content Loaded");

    chrome.storage.local.get("encryption_salt", (result) => {
        const setupView = document.getElementById("setup-view");
        const loginView = document.getElementById("login-view");
        const historyView = document.getElementById("history-view");

        if (result.encryption_salt) {
            setupView.style.display = "none";
            loginView.style.display = "block";

            // ถาม background ว่ามี encryptionKey พร้อมไหม
            chrome.runtime.sendMessage({ action: "isEncryptionReady" }, (response) => {
                if (response.ready) {
                    loginView.style.display = "none";
                    historyView.style.display = "block";
                } else {
                    const h1 = document.createElement("h1");
                    h1.textContent = "🔐Login first to encrypt your history";
                    h1.style.fontSize = "16px";
                    h1.style.color = "#333";
                    h1.style.marginTop = "10px";
                    loginView.insertBefore(h1, loginView.firstChild);
                }
            });
        } else {
            setupView.style.display = "block";
            loginView.style.display = "none";
            historyView.style.display = "none";
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

            // Show loading state
            const button = document.getElementById("set-password");
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = "Setting password...";

            // Send message and wait for response
            chrome.runtime.sendMessage({
                type: "SET_PASSWORD",
                password,
                salt: saltString
            }, response => {
                button.disabled = false;
                button.textContent = originalText;

                if (response && response.success) {
                    // Store salt in local storage
                    chrome.storage.local.set({ "encryption_salt": saltString });
                    alert("Password set successfully!");

                    // Switch to login view
                    document.getElementById("setup-view").style.display = "none";
                    const loginView = document.getElementById("login-view");
                    const h1 = document.createElement("h1");
                    h1.textContent = "🔐Login first to encrypt your history";
                    h1.style.fontSize = "16px";
                    h1.style.color = "#333";
                    h1.style.marginTop = "10px";
                    loginView.insertBefore(h1, loginView.firstChild);
                    loginView.style.display = "block";
                    document.getElementById("password").value = '';
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

    chrome.storage.local.get("encryption_salt", async (result) => {
        if (!result.encryption_salt) {
            alert("No password has been set. Please set a password first.");
            return;
        }

        try {
            const button = document.getElementById("login-button");
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = "Logging in...";

            chrome.runtime.sendMessage({
                type: "VERIFY_PASSWORD",
                password,
                salt: result.encryption_salt
            }, response => {
                button.disabled = false;
                button.textContent = originalText;

                if (response && response.success) {
                    window.close();  // Close the popup once login is successful
                    document.getElementById("login-view").style.display = "none";
                    document.getElementById("history-view").style.display = "block";
                    document.getElementById("history-list").innerHTML = "";
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

document.getElementById("forget-button").addEventListener("click", async () => {
    const loginView = document.getElementById("login-view");

    if (document.getElementById("forget-warning")) return;

    const message = document.createElement("p");
    message.id = "forget-warning";
    message.textContent = "🔐 Sorry, you need to use a new password and can't rewind your old history.";
    message.style.fontSize = "16px";
    message.style.color = "#333";
    message.style.marginTop = "10px";

    loginView.appendChild(message);
});
// Improved history loading with pagination
document.getElementById("show-history").addEventListener("click", async () => {
    const historyList = document.getElementById("history-list");
    historyList.innerHTML = "<li>Loading history...</li>";

    // Show loading state
    const button = document.getElementById("show-history");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Loading...";

    // Load encrypted data from storage
    chrome.storage.local.get(null, async (items) => {
        // Reset UI
        historyList.innerHTML = "";
        button.disabled = false;
        button.textContent = originalText;

        // Skip processing if we don't have items
        if (!items) {
            historyList.innerHTML = "<li>No history found.</li>";
            return;
        }

        // Extract and sort timestamps (keys)
        const timestamps = Object.keys(items)
            .filter(key => key !== "encryption_salt" && key !== "password_set")
            .sort((a, b) => parseInt(b) - parseInt(a)); // Sort newest first

        if (timestamps.length === 0) {
            historyList.innerHTML = "<li>No history found.</li>";
            return;
        }

        // Process only the most recent 50 items for better performance
        const batch = timestamps.slice(0, 50);
        let processed = 0;

        // Process history items in smaller batches with requestAnimationFrame
        function processNextBatch(startIdx) {
            const endIdx = Math.min(startIdx + 5, batch.length);

            for (let i = startIdx; i < endIdx; i++) {
                const timestamp = batch[i];
                const value = items[timestamp];

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
                            const a = document.createElement("a");
                            const span = document.createElement("span");

                            const formattedTime = new Date(Number(timestamp)).toLocaleString();

                            span.textContent = `${formattedTime}: `;
                            a.href = url;
                            a.textContent = url;
                            a.target = "_blank";

                            li.appendChild(span);
                            li.appendChild(a);
                            historyList.appendChild(li);
                        }
                    });
                } catch (error) {
                    console.error("Failed to process history item:", error);
                }
            }

            processed = endIdx;

            // If there are more items to process, schedule the next batch
            if (processed < batch.length) {
                requestAnimationFrame(() => processNextBatch(processed));
            } else if (batch.length < timestamps.length) {
                // Add a "Load more" button if there are more items
                const loadMoreLi = document.createElement("li");
                loadMoreLi.innerHTML = "<button id='load-more'>Load more...</button>";
                historyList.appendChild(loadMoreLi);

                document.getElementById("load-more").addEventListener("click", () => {
                    // Load the next batch when clicked
                    loadMoreLi.remove();
                    loadMoreHistory(50, batch.length);
                });
            }
        }

        // Function to load more history items
        function loadMoreHistory(count, skip) {
            const nextBatch = timestamps.slice(skip, skip + count);

            for (const timestamp of nextBatch) {
                const value = items[timestamp];

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
                            const a = document.createElement("a");
                            const span = document.createElement("span");

                            const formattedTime = new Date(Number(timestamp)).toLocaleString();

                            span.textContent = `${formattedTime}: `;
                            a.href = url;
                            a.textContent = url;
                            a.target = "_blank";

                            li.appendChild(span);
                            li.appendChild(a);
                            historyList.appendChild(li);
                        }
                    });
                } catch (error) {
                    console.error("Failed to process history item:", error);
                }
            }

            // Add "Load more" button if there are still more items
            if (skip + count < timestamps.length) {
                const loadMoreLi = document.createElement("li");
                loadMoreLi.innerHTML = "<button id='load-more'>Load more...</button>";
                historyList.appendChild(loadMoreLi);

                document.getElementById("load-more").addEventListener("click", () => {
                    // Load the next batch when clicked
                    loadMoreLi.remove();
                    loadMoreHistory(50, skip + count);
                });
            }
        }

        // Start processing
        processNextBatch(0);
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