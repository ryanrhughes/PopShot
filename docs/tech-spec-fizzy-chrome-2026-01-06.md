# Technical Specification: Fizzy Google Chrome Extension

**Date:** 2026-01-06
**Author:** Ryan
**Version:** 1.0
**Project Type:** Chrome Extension
**Project Level:** 1 (Small, 1-10 stories)
**Status:** Draft

---

## Document Overview

This Technical Specification provides focused technical planning for the Fizzy Google Chrome Extension. It is designed for smaller projects (Level 0-1) that need clear requirements without heavyweight PRD overhead.

**Related Documents:**
- Product Brief: `docs/product-brief.md`

---

## Problem & Solution

### Problem Statement

Capturing feedback on websites using Fizzy is currently a friction-heavy, 7-step process: manually take a screenshot, save the file, open Fizzy separately, navigate to the correct board, create a new card, upload the screenshot, and add context. This multi-step workflow breaks concentration, wastes time, and discourages users from capturing feedback in the moment.

### Proposed Solution

A Chrome browser extension that streamlines website feedback capture into a single, integrated workflow:

1. Click extension icon or use hotkey
2. Capture and annotate screenshot
3. Select destination board
4. Submit - card created automatically in Fizzy

All functionality runs client-side with direct API calls to Fizzy - no server hosting required.

---

## Requirements

### What Needs to Be Built

- **Screenshot Capture:** Capture visible viewport or selected region of the current page
- **Annotation Tools:** Draw arrows, highlight/circle areas, add text labels, crop images using a canvas-based editor
- **Board Selection:** List available Fizzy boards from user's account, select destination board, configure URL-based defaults (e.g., "always send example.com feedback to Board X")
- **Auto-Captured Metadata:** Automatically capture page URL, browser name/version, timestamp, and viewport resolution with each submission
- **Quick Submit:** Create card in default/triage column of selected board with screenshot embedded and metadata included
- **Authentication:** Securely store and validate Fizzy API key, with instructions for users on how to generate one

### What This Does NOT Include

- Firefox or other non-Chromium browser support

---

## Technical Approach

### Technology Stack

- **Manifest:** Manifest V3 (required for all new Chrome extensions)
- **Language:** TypeScript
- **UI Framework:** React (for popup and options pages)
- **Build Tool:** Vite + @crxjs/vite-plugin (HMR, zero-config, MV3 support)
- **Annotation Library:** Fabric.js (mature, feature-rich canvas library)
- **Screenshot API:** chrome.tabs.captureVisibleTab
- **Storage:** chrome.storage.local (with encryption for API key)

### Architecture Overview

**Components:**

1. **Background Service Worker** (`src/background/`)
   - Handles screenshot capture via chrome.tabs.captureVisibleTab
   - Coordinates messaging between popup and content scripts
   - Manages extension lifecycle events

2. **Popup UI** (`src/popup/`) - React
   - Main interface for capture, annotation, board selection, and submission
   - Fabric.js canvas for annotation
   - Board selector dropdown
   - Submit button with loading/success/error states

3. **Options Page** (`src/options/`) - React
   - API key configuration and validation
   - URL-to-board default mappings management
   - Instructions for generating Fizzy API key

4. **Content Script** (`src/content/`) - Minimal
   - Region selection overlay (if implementing region capture)

5. **Shared Utilities** (`src/lib/`)
   - Storage utilities (encrypted API key handling)
   - Fizzy API client
   - Metadata capture utilities

**Data Flow:**
```
User clicks extension → Popup opens
  → User clicks capture → Service worker captures screenshot
  → Screenshot displayed in Fabric.js canvas
  → User annotates (arrows, highlights, text, crop)
  → User selects board (fetched from Fizzy API)
  → User clicks submit
  → Image uploaded to Fizzy (ActiveStorage direct upload)
  → Card created via Fizzy API
  → Success confirmation displayed
```

**Storage Strategy:**
- `chrome.storage.local` - API key (encrypted via Web Crypto API), URL-to-board mappings
- `chrome.storage.sync` - User preferences (optional, for sync across devices)

### Data Model

**Stored Data:**

| Key | Type | Storage | Description |
|-----|------|---------|-------------|
| `apiKey` | string (encrypted) | local | Fizzy API personal access token |
| `urlBoardDefaults` | Record<string, string> | local | URL pattern to board ID mappings |
| `lastUsedBoard` | string | local | Most recently selected board ID |

**Runtime Data (not persisted):**

| Data | Type | Description |
|------|------|-------------|
| `capturedImage` | string (data URL) | Screenshot captured from current tab |
| `annotatedImage` | string (data URL) | Final image after annotation |
| `boards` | Board[] | User's available Fizzy boards |
| `metadata` | Metadata | Auto-captured page/browser info |

### API Design

**Fizzy API Endpoints Used:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/my/identity` | Validate API key, get user's accounts |
| GET | `/:account_slug/boards` | List available boards for account |
| POST | `/:account_slug/boards/:board_id/cards` | Create new card |
| POST | `/rails/active_storage/direct_uploads` | Get direct upload URL for image |
| PUT | `{direct_upload_url}` | Upload image to storage |

**Chrome Extension APIs Used:**

| API | Permission | Purpose |
|-----|------------|---------|
| `chrome.tabs.captureVisibleTab` | activeTab | Capture screenshot |
| `chrome.storage.local` | storage | Store API key, preferences |
| `chrome.action` | (default) | Extension icon and popup |
| `chrome.runtime` | (default) | Messaging between components |

---

## Implementation Plan

### Stories

1. **Project Setup & Extension Scaffold** - Vite + React + TypeScript project, manifest.json, basic popup that opens
2. **Authentication & API Key Management** - Options page to enter/save API key, validation via `/my/identity`, encrypted storage
3. **Screenshot Capture** - Capture visible viewport on button click, display captured image in popup
4. **Annotation Tools** - Fabric.js canvas with arrows, highlight/rectangle, text labels, crop functionality
5. **Board Selection** - Fetch user's boards from Fizzy API, dropdown selector, URL-based default mappings
6. **Metadata Capture** - Auto-capture page URL, browser info, timestamp, viewport size
7. **Card Submission** - Upload image to Fizzy (ActiveStorage), create card with screenshot + metadata
8. **Polish & Error Handling** - Loading states, error messages, success feedback, edge cases

### Development Phases

**Phase 1: Foundation (Stories 1-2)**
- Project scaffold with build tooling
- Authentication working end-to-end

**Phase 2: Core Capture (Stories 3-4)**
- Screenshot capture functional
- Annotation tools working

**Phase 3: Integration (Stories 5-7)**
- Board selection and defaults
- Metadata capture
- Full submission flow

**Phase 4: Polish (Story 8)**
- Error handling
- UX refinements
- Edge cases

---

## Acceptance Criteria

How we'll know it's done:

- [ ] Extension installs and loads in Chrome/Chromium browsers
- [ ] User can enter and save Fizzy API key
- [ ] API key is validated against Fizzy API
- [ ] User can capture screenshot of visible viewport
- [ ] User can select and capture a region of the page
- [ ] User can annotate with arrows, highlights, and text
- [ ] User can crop the captured image
- [ ] User can select destination board from their Fizzy account
- [ ] URL-based board defaults can be configured
- [ ] Metadata (URL, browser, timestamp, resolution) is auto-captured
- [ ] Card is successfully created in Fizzy with screenshot embedded
- [ ] Clear error messages shown when something fails
- [ ] Success confirmation shown after card creation

---

## Non-Functional Requirements

### Performance

- Screenshot capture should complete within 1 second
- Annotation canvas should be responsive (no lag when drawing)
- Standard performance expectations for a Chrome extension

### Security

- API key encrypted at rest using Web Crypto API
- API key never logged to console
- All Fizzy API calls over HTTPS
- Minimal permissions requested (activeTab preferred over broad host permissions)

### Other

- Support Chrome and Chromium-based browsers (Edge, Brave, etc.)
- Follow Chrome Web Store publishing guidelines

---

## Dependencies

- **Fizzy API** - Requires working API with personal access token support
- **Chrome Web Store Developer Account** - For distribution (if publishing publicly)
- **@crxjs/vite-plugin** - Build tooling for Chrome extensions
- **Fabric.js** - Canvas annotation library
- **@types/chrome** - TypeScript definitions for Chrome APIs

---

## Risks & Mitigation

- **Risk:** Full-page screenshot may be complex (requires stitching multiple viewport captures)
  - **Mitigation:** Start with visible viewport only; add full-page as a future enhancement if needed

- **Risk:** Manifest V3 service worker limitations (no persistent background, no DOM access)
  - **Mitigation:** Research edge cases early; use offscreen documents if DOM manipulation needed

- **Risk:** Fizzy API changes could break extension
  - **Mitigation:** Handle API errors gracefully; provide clear error messages to users

- **Risk:** Chrome Web Store review delays
  - **Mitigation:** Plan for 1-2 week review time; use local/unpacked extension for internal testing

---

## Timeline

**Target Completion:** ASAP

**Milestones:**
- Foundation complete (Stories 1-2): +2-3 days
- Core capture working (Stories 3-4): +3-4 days
- Full integration (Stories 5-7): +3-4 days
- Polish and ready for use (Story 8): +1-2 days

**Estimated Total:** 9-13 days of development

---

## Approval

**Reviewed By:**
- [ ] Ryan (Author)
- [ ] Technical Lead
- [ ] Product Owner

---

## Next Steps

### Phase 4: Implementation

For Level 1 projects (1-10 stories):
- Run `/sprint-planning` to organize your stories and plan implementation
- Then create and implement stories with `/create-story` and `/dev-story`

Note: Level 1 projects can skip detailed architecture and go straight to implementation.

---

**This document was created using BMAD Method v6 - Phase 2 (Planning)**

*To continue: Run `/workflow-status` to see your progress and next recommended workflow.*
