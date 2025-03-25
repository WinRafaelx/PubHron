document.addEventListener('DOMContentLoaded', () => {
  // Get query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const targetUrl = urlParams.get('url');
  const reason = urlParams.get('reason');
  
  // Display the URL and reason
  document.getElementById('site-url').textContent = targetUrl || 'Unknown URL';
  document.getElementById('warning-reason').textContent = reason || 'Unknown reason';
  
  // Set up event listeners for buttons
  document.getElementById('go-back').addEventListener('click', () => {
    window.history.back();
  });
  
  document.getElementById('proceed-anyway').addEventListener('click', () => {
    // Navigate to the target URL
    if (targetUrl) {
      window.location.href = targetUrl;
    }
  });
});
