document.addEventListener("DOMContentLoaded", function () {
    const setupDiv = document.getElementById("setupDiv");
    const loginDiv = document.getElementById("loginDiv");
    const settingsDiv = document.getElementById("settingsDiv");
    const loginError = document.getElementById("loginError");
  
    // Check if the master password is already set.
    chrome.storage.local.get(["masterPassword"], function (result) {
      if (!result.masterPassword) {
        // Show setup view to set password.
        setupDiv.classList.remove("hidden");
      } else {
        // Show login view.
        loginDiv.classList.remove("hidden");
      }
    });
  
    // Handle setting a new master password.
    document.getElementById("setPasswordBtn").addEventListener("click", function () {
      const newPassword = document.getElementById("newPassword").value;
      if (newPassword) {
        // Simple hash demonstration; replace with a secure hash in production.
        const hashed = btoa(newPassword);
        chrome.storage.local.set({ masterPassword: hashed }, function () {
          setupDiv.classList.add("hidden");
          loginDiv.classList.remove("hidden");
        });
      }
    });
  
    // Handle login.
    document.getElementById("loginBtn").addEventListener("click", function () {
      const loginPassword = document.getElementById("loginPassword").value;
      chrome.storage.local.get(["masterPassword"], function (result) {
        const hashed = btoa(loginPassword);
        if (hashed === result.masterPassword) {
          loginDiv.classList.add("hidden");
          settingsDiv.classList.remove("hidden");
          loadBlacklist();
        } else {
          loginError.textContent = "Incorrect password!";
        }
      });
    });
  
    // Add a new entry to the blacklist.
    document.getElementById("addBlacklistBtn").addEventListener("click", function () {
      const entry = document.getElementById("blacklistInput").value;
      if (!entry) return;
      chrome.storage.local.get(["blacklist"], function (result) {
        let list = result.blacklist || [];
        list.push(entry);
        chrome.storage.local.set({ blacklist: list }, function () {
          document.getElementById("blacklistInput").value = "";
          loadBlacklist();
        });
      });
    });
  
    // Load and display the blacklist.
    function loadBlacklist() {
      chrome.storage.local.get(["blacklist"], function (result) {
        const list = result.blacklist || [];
        const ul = document.getElementById("blacklistList");
        ul.innerHTML = "";
        list.forEach((entry, index) => {
          const li = document.createElement("li");
          li.textContent = entry;
          const delBtn = document.createElement("button");
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", function () {
            list.splice(index, 1);
            chrome.storage.local.set({ blacklist: list }, loadBlacklist);
          });
          li.appendChild(delBtn);
          ul.appendChild(li);
        });
      });
    }
  });
  