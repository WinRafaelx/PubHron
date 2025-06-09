# Secure Local History

This repository contains a Chrome extension that filters and encrypts browsing history. It checks each visited URL against keyword lists and the Google Safe Browsing API before saving it locally in encrypted form.

## Setup

1. Clone the repository.
2. Copy `.env.example` to `.env` and provide your Google Safe Browsing API key:

```bash
cp .env.example .env
# Edit .env and set SAFE_BROWSING_API_KEY=your_key
```

You can obtain a key from the [Google Safe Browsing API](https://developers.google.com/safe-browsing). The `.env` file is read by the extension at runtime and should remain in the root of the project.

## Loading the Extension

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select this project directory.
4. The extension icon should appear and you can open its popup to set a password and view encrypted history.

## Usage

- The first time you open the popup, you will be asked to set a password. This password is used to derive a key for encrypting your history.
- After setting a password, you must log in with the same password whenever you start the browser.
- The extension filters navigation to sites identified as porn, gambling, piracy or malicious using keyword lists and the Safe Browsing API.
- Encrypted history is stored in Chrome's local storage and can be viewed from the popup after logging in.

## License

This project is released under the MIT License. See [LICENSE](LICENSE) for details.
