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

document.getElementById("show-history").addEventListener("click", async () => {
  const password = document.getElementById("password").value;
  if (!password) {
      alert("Please enter your password");
      return;
  }

  const historyList = document.getElementById("history-list");
  historyList.innerHTML = "";

  // Load encrypted data and salt from storage
  chrome.storage.local.get(null, async (items) => {
      const encoder = new TextEncoder();
      
      // Get the salt used for encryption
      if (!items.encryption_salt) {
          alert("No encryption salt found. Please set a password first.");
          return;
      }
      
      const salt = Uint8Array.from(atob(items.encryption_salt), (c) => c.charCodeAt(0));
      
      // Derive key for decryption
      const hashedPassword = await crypto.subtle.digest("SHA-256", encoder.encode(password));
      const keyMaterial = await crypto.subtle.importKey(
          "raw", hashedPassword, { name: "PBKDF2" }, false, ["deriveKey"]
      );
      const encryptionKey = await crypto.subtle.deriveKey(
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

      // Process history items
      for (const [key, value] of Object.entries(items)) {
          // Skip the salt entry
          if (key === "encryption_salt") continue;
          
          try {
              const { data, iv } = value;
              const encryptedData = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
              const ivData = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
              
              const decryptedUrl = await crypto.subtle.decrypt(
                  { name: "AES-GCM", iv: ivData },
                  encryptionKey,
                  encryptedData
              );

              const url = new TextDecoder().decode(decryptedUrl);
              const li = document.createElement("li");
              li.textContent = `${new Date(parseInt(key)).toLocaleString()}: ${url}`;
              historyList.appendChild(li);
          } catch (error) {
              console.error("Failed to decrypt:", error);
          }
      }
  });
});
