// Google Safe Browsing API configuration
// Replace API_KEY with your actual Google Safe Browsing API key
const SAFE_BROWSING_API_KEY = "AIzaSyCycTN0AIpyYdYCn5kmWAtR70enfJ1xhkE";
const SAFE_BROWSING_ENDPOINT = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;

/**
 * Check if a URL is potentially unsafe using Google Safe Browsing API
 * @param {string} url - The URL to check
 * @return {Promise<boolean>} - True if unsafe, false if safe
 */
async function checkUrlSafety(url) {
  try {
    // Don't check empty URLs
    if (!url || url === 'about:blank') return false;
    
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

/**
 * Check if a URL uses HTTP instead of HTTPS
 * @param {string} url - The URL to check
 * @return {boolean} - True if the URL uses HTTP
 */
function isHttpOnly(url) {
  try {
    return new URL(url).protocol === 'http:';
  } catch (error) {
    return false;
  }
}

export { checkUrlSafety, isHttpOnly };
