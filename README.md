# Fizzy Feedback Chrome Extension

A Chrome browser extension that streamlines website feedback capture and submission to [Fizzy](https://fizzy.do).

## Features

- **Screenshot Capture** - Capture the visible viewport of any webpage
- **Annotation Tools** - Add arrows, rectangles, circles, and text to screenshots
- **Board Selection** - Send feedback to any Fizzy board you have access to
- **Auto Metadata** - Automatically includes URL, browser info, and timestamp
- **Quick Submit** - Create cards directly from your browser

## Installation

### Development Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd fizzy-chrome
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

### Production Build

```bash
npm run build
```

The built extension will be in the `dist` folder.

## Configuration

1. Click the Fizzy Feedback extension icon
2. Click the settings gear icon (or go to extension options)
3. Enter your Fizzy Personal Access Token:
   - Go to [app.fizzy.do](https://app.fizzy.do)
   - Click your profile → API → Personal access tokens
   - Generate a new token with **Read + Write** permissions
4. Click "Save API Key"
5. Click "Test Connection" to verify

## Usage

1. Navigate to any webpage you want to provide feedback on
2. Click the Fizzy Feedback extension icon
3. Click "Capture Screenshot"
4. Use the annotation tools to mark up the screenshot:
   - **Select** - Move and resize annotations
   - **Arrow** - Draw arrows pointing to areas of interest
   - **Rectangle** - Draw rectangles to highlight areas
   - **Circle** - Draw circles around elements
   - **Text** - Add text labels
5. Choose your colors from the color palette
6. Click "Done Annotating" when finished
7. Select the destination Fizzy board
8. Edit the card title if desired
9. Click "Submit to Fizzy"

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite + @crxjs/vite-plugin
- **Manifest**: Chrome Extension Manifest V3
- **Annotation**: Fabric.js
- **Storage**: Chrome Storage API

## Project Structure

```
fizzy-chrome/
├── src/
│   ├── background/       # Service worker
│   ├── popup/           # Main popup UI
│   │   ├── components/  # React components
│   │   ├── Popup.tsx    # Main popup component
│   │   └── popup.css    # Styles
│   ├── options/         # Settings page
│   └── lib/             # Shared utilities
│       ├── storage.ts   # Chrome storage helpers
│       ├── fizzy-api.ts # Fizzy API client
│       └── metadata.ts  # Metadata capture
├── public/
│   └── icons/           # Extension icons
├── manifest.config.ts   # Extension manifest
├── vite.config.ts       # Vite configuration
└── package.json
```

## Permissions

The extension requires the following permissions:

- **activeTab** - To capture screenshots of the current tab
- **storage** - To store API key and preferences
- **host_permissions** - To communicate with the Fizzy API

## License

MIT
