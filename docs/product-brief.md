# Product Brief: Fizzy Google Chrome Extension

**Date:** 2026-01-06  
**Status:** Draft  
**Project Level:** 1 (Small, 1-10 stories)

---

## Problem Statement

Capturing feedback on websites using Fizzy is currently a friction-heavy process:

1. Take a screenshot manually
2. Save the file to your computer
3. Open Fizzy as a separate application
4. Navigate to the correct board
5. Create a new card
6. Upload the screenshot file
7. Add description and context

This multi-step workflow breaks concentration, wastes time, and discourages users from capturing feedback in the moment.

---

## Solution

A Chrome browser extension that streamlines website feedback capture into a single, integrated workflow:

1. Click extension icon or use hotkey
2. Capture and annotate screenshot
3. Select destination board
4. Submit - card created automatically in Fizzy

---

## Target Users

**Primary Users:**
- QA testers conducting website reviews
- Team members reporting bugs
- Stakeholders requesting changes to websites
- Anyone who needs to provide visual feedback on web content

**Use Cases:**
- Bug reporting during QA reviews
- Change requests with visual context
- Design feedback with annotations
- Documentation of website issues

---

## Key Features

### 1. Screenshot Capture
- Capture visible viewport
- Capture selected region
- Capture full page (if feasible)

### 2. Annotation Tools
- Draw arrows to point out issues
- Highlight/circle areas of interest
- Add text labels
- Crop image to focus on relevant area

### 3. Board Selection
- List available Fizzy boards from user's account
- Select destination board for each submission
- Configure URL-based defaults (e.g., "always send example.com feedback to Board X")

### 4. Auto-Captured Metadata
Automatically include with each card:
- Page URL
- Browser name and version
- Timestamp
- Browser window resolution
- Any other relevant debugging context

### 5. Quick Submit
- Card created in default/triage column of selected board
- Screenshot embedded in card description
- Metadata included automatically

---

## Technical Integration

### Fizzy API
- **Authentication:** Personal Access Token (API key)
- **Endpoints used:**
  - `GET /my/identity` - Get user's accounts and boards
  - `GET /:account_slug/boards` - List available boards
  - `POST /:account_slug/boards/:board_id/cards` - Create card
  - Direct upload flow for images (ActiveStorage)

### Authentication Flow
1. User opens extension for first time
2. Extension prompts for Fizzy API key
3. Provide instructions on how to generate API key in Fizzy (Profile > API > Personal access tokens)
4. Store API key securely in Chrome extension storage
5. Validate key by calling `/my/identity`

### Image Upload Flow
1. Create direct upload request with file metadata
2. Upload image to provided storage URL
3. Reference uploaded image in card description using `<action-text-attachment>`

### Offline Behavior
- Fail gracefully if no internet connection
- Display clear error message
- No offline queuing (online-only application)

---

## Scope

### In Scope (MVP)
- Chrome browser only
- Screenshot capture (visible area, selection)
- Basic annotation tools (arrows, highlight, text, crop)
- Board selection with URL-based defaults
- Auto-metadata capture
- Card creation via Fizzy API

### Out of Scope
- Firefox/Edge support
- Offline queuing
- Video capture
- Advanced annotation tools
- Direct column selection (uses default/triage)

---

## Constraints

- **Platform:** Chrome Web Store distribution
- **API Dependency:** Requires Fizzy API access with Read+Write permissions
- **Authentication:** API key only (no OAuth/magic link for extension)

---

## Open Questions

1. Full-page screenshot - technically feasible in Chrome extension? May require stitching multiple viewport captures.
2. Storage for URL-to-board mapping preferences - Chrome sync storage vs local only?

---

## References

- [Fizzy API Documentation](https://github.com/basecamp/fizzy/blob/main/docs/API.md)
- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)

---

## Next Steps

1. Create technical specification (required for Level 1)
2. Define stories for implementation
3. Begin development
