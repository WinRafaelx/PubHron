function loadEnvironmentVariables() {
  try {
    const envContent = chrome.runtime.getURL('.env');
    return fetch(envContent)
      .then(response => response.text())
      .then(text => {
        const env = {};
        text.split('\n').forEach(line => {
          if (line.trim().startsWith('//') || !line.trim()) return;
          const parts = line.split('=');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            env[key] = value;
          }
        });
        return env;
      })
      .catch(err => {
        console.error('Error loading .env file:', err);
        return {};
      });
  } catch (e) {
    console.error('Error accessing .env file:', e);
    return Promise.resolve({});
  }
}

let envCache = null;

async function getConfig() {
  if (envCache === null) {
    envCache = await loadEnvironmentVariables();
  }
  return envCache;
}

export { getConfig };
