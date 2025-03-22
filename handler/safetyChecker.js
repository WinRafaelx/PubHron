import { getConfig } from "../config.js";

// Google Safe Browsing API configuration
let SAFE_BROWSING_API_KEY;
let SAFE_BROWSING_ENDPOINT;

// Initialize API configuration
async function initializeApi() {
  const config = await getConfig();
  SAFE_BROWSING_API_KEY = config.SAFE_BROWSING_API_KEY || "";
  SAFE_BROWSING_ENDPOINT = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;
}

// Initialize immediately
initializeApi();

async function checkUrlSafety(url) {
  try {
    // Don't check empty URLs
    if (!url || url === 'about:blank') return false;

    if (!SAFE_BROWSING_ENDPOINT) {
      await initializeApi();
    }
    if (!SAFE_BROWSING_API_KEY) {
      console.warn("Safe Browsing API key not available");
      return false;
    }
    
    const requestBody = {
      client: {
        clientId: "secure-history-extension",
        clientVersion: "1.0"
      },
      threatInfo: {
        threatTypes: [
          "MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"
        ],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }]
      }
    };

    const response = await fetch(SAFE_BROWSING_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    // If the response contains matches, the URL is unsafe
    return data.matches && data.matches.length > 0;
  } catch (error) {
    console.error("Error checking URL safety:", error);
    return false; // Assume safe if we can't check
  }
}

function isHttpOnly(url) {
  try {
    return new URL(url).protocol === 'http:';
  } catch (error) {
    return false;
  }
}

export { checkUrlSafety, isHttpOnly };
