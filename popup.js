document.getElementById("set-password").addEventListener("click", async () => {
  const password = document.getElementById("password").value;
  if (password) {
      chrome.runtime.sendMessage({ type: "SET_PASSWORD", password });
      alert("Password set successfully!");
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

  // Load encrypted data from storage
  chrome.storage.local.get(null, async (items) => {
      const encoder = new TextEncoder();

      // Derive key for decryption
      const hashedPassword = await crypto.subtle.digest("SHA-256", encoder.encode(password));
      const keyMaterial = await crypto.subtle.importKey(
          "raw", hashedPassword, { name: "PBKDF2" }, false, ["deriveKey"]
      );
      const encryptionKey = await crypto.subtle.deriveKey(
          {
              name: "PBKDF2",
              salt: new Uint8Array(16),
              iterations: 100000,
              hash: "SHA-256"
          },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"]
      );

      for (const [timestamp, { data, iv }] of Object.entries(items)) {
          try {
              const encryptedData = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
              const ivData = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
              
              const decryptedUrl = await crypto.subtle.decrypt(
                  { name: "AES-GCM", iv: ivData },
                  encryptionKey,
                  encryptedData
              );

              const url = new TextDecoder().decode(decryptedUrl);
              const li = document.createElement("li");
              li.textContent = url;
              historyList.appendChild(li);
          } catch (error) {
              console.error("Failed to decrypt:", error);
          }
      }
  });
});
