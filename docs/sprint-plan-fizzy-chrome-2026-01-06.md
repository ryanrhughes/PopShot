# Sprint Plan: Fizzy Google Chrome Extension

**Date:** 2026-01-06
**Scrum Master:** Ryan
**Project Level:** 1 (Small)
**Total Stories:** 8
**Total Points:** 34
**Planned Sprints:** 1

---

## Executive Summary

Single-sprint implementation plan for the Fizzy Chrome Extension. All 8 stories are ordered by dependency to enable incremental development. The extension will capture screenshots, allow annotation, and submit feedback directly to Fizzy boards.

**Key Metrics:**
- Total Stories: 8
- Total Points: 34
- Sprints: 1
- Target Completion: ASAP (~9-13 days)

---

## Story Inventory

### STORY-001: Project Setup & Extension Scaffold

**Priority:** Must Have
**Points:** 3

**User Story:**
As a developer
I want to have a properly configured Chrome extension project
So that I can build features on a solid foundation

**Acceptance Criteria:**
- [ ] Vite + React + TypeScript project initialized
- [ ] @crxjs/vite-plugin configured for Manifest V3
- [ ] manifest.json with required permissions (activeTab, storage)
- [ ] Basic popup opens when clicking extension icon
- [ ] Extension loads in Chrome without errors
- [ ] Hot module replacement works during development

**Technical Notes:**
- Use `npm create vite@latest` with React + TypeScript template
- Add @crxjs/vite-plugin for Chrome extension support
- Configure manifest.json with Manifest V3 format
- Set up src/popup/, src/background/, src/options/ folder structure

**Dependencies:** None (foundation story)

---

### STORY-002: Authentication & API Key Management

**Priority:** Must Have
**Points:** 5

**User Story:**
As a user
I want to securely store my Fizzy API key
So that the extension can make authenticated requests to Fizzy

**Acceptance Criteria:**
- [ ] Options page accessible from extension menu
- [ ] Input field for entering Fizzy API key
- [ ] API key encrypted before storage using Web Crypto API
- [ ] "Save" button stores encrypted key in chrome.storage.local
- [ ] "Test" button validates key via GET /my/identity
- [ ] Success/error feedback displayed to user
- [ ] Instructions/link for generating API key in Fizzy

**Technical Notes:**
- Create src/options/ with React components
- Implement encryption utility in src/lib/crypto.ts
- Create Fizzy API client in src/lib/fizzy-api.ts
- Store encrypted key in chrome.storage.local

**Dependencies:** STORY-001

---

### STORY-003: Screenshot Capture

**Priority:** Must Have
**Points:** 3

**User Story:**
As a user
I want to capture a screenshot of the current webpage
So that I can provide visual feedback

**Acceptance Criteria:**
- [ ] "Capture" button in popup triggers screenshot
- [ ] Screenshot captures visible viewport using chrome.tabs.captureVisibleTab
- [ ] Captured image displayed in popup UI
- [ ] Image stored as data URL for subsequent annotation
- [ ] Error handling if capture fails (e.g., chrome:// pages)

**Technical Notes:**
- Background service worker handles chrome.tabs.captureVisibleTab
- Message passing from popup to service worker
- Store captured image in component state (not persisted)
- Handle edge cases (restricted pages, permissions)

**Dependencies:** STORY-001

---

### STORY-004: Annotation Tools

**Priority:** Must Have
**Points:** 8

**User Story:**
As a user
I want to annotate my screenshot with arrows, highlights, and text
So that I can clearly communicate feedback

**Acceptance Criteria:**
- [ ] Fabric.js canvas displays captured screenshot
- [ ] Arrow tool: draw arrows pointing to areas of interest
- [ ] Highlight tool: draw rectangles/circles to highlight areas
- [ ] Text tool: add text labels to the image
- [ ] Crop tool: crop image to focus on relevant area
- [ ] Color picker for annotation colors
- [ ] Undo/redo functionality
- [ ] Clear all annotations option
- [ ] Export annotated image as data URL

**Technical Notes:**
- Integrate Fabric.js in popup UI
- Create toolbar component with tool selection
- Implement custom arrow drawing (Fabric.js line with arrowhead)
- Handle canvas resize based on screenshot dimensions
- Export final canvas as PNG data URL

**Dependencies:** STORY-003

---

### STORY-005: Board Selection

**Priority:** Must Have
**Points:** 5

**User Story:**
As a user
I want to select which Fizzy board to send my feedback to
So that feedback goes to the right place

**Acceptance Criteria:**
- [ ] Fetch user's boards from Fizzy API on popup open
- [ ] Dropdown displays available boards (across all accounts)
- [ ] User can select destination board
- [ ] Last used board is remembered
- [ ] URL-based defaults: configure rules in options page
- [ ] URL matching applies default board when pattern matches current URL
- [ ] Manual selection overrides URL default

**Technical Notes:**
- Call GET /:account_slug/boards for each account from /my/identity
- Store board list in component state
- Store lastUsedBoard in chrome.storage.local
- Options page UI for managing URL-to-board mappings
- URL pattern matching (simple prefix or regex)

**Dependencies:** STORY-002

---

### STORY-006: Metadata Capture

**Priority:** Must Have
**Points:** 2

**User Story:**
As a user
I want my feedback to automatically include page context
So that developers have the information they need to investigate

**Acceptance Criteria:**
- [ ] Auto-capture current page URL
- [ ] Auto-capture browser name and version
- [ ] Auto-capture timestamp
- [ ] Auto-capture viewport dimensions
- [ ] Metadata displayed in submission preview
- [ ] Metadata formatted for inclusion in card description

**Technical Notes:**
- Use chrome.tabs API to get current tab URL
- Use navigator.userAgent for browser info
- Use window.innerWidth/innerHeight for viewport
- Create utility function in src/lib/metadata.ts
- Format as markdown for card description

**Dependencies:** STORY-001

---

### STORY-007: Card Submission

**Priority:** Must Have
**Points:** 5

**User Story:**
As a user
I want to submit my annotated screenshot to Fizzy
So that a card is created with my feedback

**Acceptance Criteria:**
- [ ] "Submit" button triggers card creation flow
- [ ] Image uploaded via ActiveStorage direct upload
- [ ] Card created in selected board's default/triage column
- [ ] Card description includes annotated screenshot
- [ ] Card description includes captured metadata
- [ ] Loading state shown during submission
- [ ] Success message with link to created card
- [ ] Error handling with clear messages

**Technical Notes:**
- POST /rails/active_storage/direct_uploads to get upload URL
- PUT to upload URL with image blob
- POST /:account_slug/boards/:board_id/cards with card data
- Use action-text-attachment format for embedding image
- Handle CORS if needed

**Dependencies:** STORY-002, STORY-004, STORY-005, STORY-006

---

### STORY-008: Polish & Error Handling

**Priority:** Should Have
**Points:** 3

**User Story:**
As a user
I want a polished experience with clear feedback
So that I know what's happening at all times

**Acceptance Criteria:**
- [ ] Loading spinners during async operations
- [ ] Descriptive error messages for all failure scenarios
- [ ] Success confirmation after card creation
- [ ] Option to capture another screenshot after success
- [ ] Keyboard shortcuts for common actions
- [ ] Responsive popup sizing
- [ ] Edge case handling (offline, API errors, invalid states)
- [ ] Clear visual hierarchy and consistent styling

**Technical Notes:**
- Add loading state management
- Create error boundary component
- Toast/notification system for feedback
- Test all error scenarios
- CSS polish and consistency pass

**Dependencies:** STORY-007

---

## Sprint Allocation

### Sprint 1 - All Stories (34 points)

**Goal:** Deliver complete Fizzy Chrome Extension MVP

**Implementation Order:**

| Order | Story | Points | Cumulative |
|-------|-------|--------|------------|
| 1 | STORY-001: Project Setup | 3 | 3 |
| 2 | STORY-002: Authentication | 5 | 8 |
| 3 | STORY-003: Screenshot Capture | 3 | 11 |
| 4 | STORY-006: Metadata Capture | 2 | 13 |
| 5 | STORY-004: Annotation Tools | 8 | 21 |
| 6 | STORY-005: Board Selection | 5 | 26 |
| 7 | STORY-007: Card Submission | 5 | 31 |
| 8 | STORY-008: Polish | 3 | 34 |

**Rationale:**
- Stories 1-2: Foundation and auth (required for everything)
- Stories 3, 6: Capture capabilities (can work in parallel conceptually)
- Story 4: Annotation (depends on screenshot)
- Story 5: Board selection (depends on auth)
- Story 7: Submission (brings everything together)
- Story 8: Polish (final pass)

---

## Requirements Traceability

| Requirement | Story | Status |
|-------------|-------|--------|
| Screenshot Capture (viewport) | STORY-003 | Planned |
| Screenshot Capture (region) | STORY-003 | Planned |
| Annotation - Arrows | STORY-004 | Planned |
| Annotation - Highlights | STORY-004 | Planned |
| Annotation - Text | STORY-004 | Planned |
| Annotation - Crop | STORY-004 | Planned |
| Board Selection | STORY-005 | Planned |
| URL-based Defaults | STORY-005 | Planned |
| Auto-Metadata | STORY-006 | Planned |
| Card Submission | STORY-007 | Planned |
| Authentication | STORY-002 | Planned |

All requirements from tech-spec are covered.

---

## Risks and Mitigation

**Technical Risks:**

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Fabric.js learning curve | Medium | Medium | Start with simple tools, iterate |
| MV3 service worker limitations | Medium | Low | Use offscreen documents if needed |
| ActiveStorage upload complexity | Medium | Medium | Test upload flow early in STORY-007 |
| Region selection implementation | Low | Medium | Defer to visible viewport if complex |

**External Risks:**

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Fizzy API changes | High | Low | Handle errors gracefully |
| Chrome Web Store delays | Medium | Medium | Use unpacked extension for testing |

---

## Dependencies

**External:**
- Fizzy API access with personal access token
- Chrome/Chromium browser for testing

**Internal (story dependencies):**
```
STORY-001 (Setup)
    ├── STORY-002 (Auth)
    │       └── STORY-005 (Boards)
    ├── STORY-003 (Screenshot)
    │       └── STORY-004 (Annotation)
    └── STORY-006 (Metadata)

STORY-007 (Submission) ← depends on 002, 004, 005, 006
STORY-008 (Polish) ← depends on 007
```

---

## Definition of Done

For a story to be considered complete:
- [ ] Code implemented and working
- [ ] Tested manually in Chrome
- [ ] Error cases handled
- [ ] Code committed to repository
- [ ] Acceptance criteria validated

---

## Next Steps

**Begin Implementation:**

Run `/dev-story STORY-001` to start with project setup.

**Story sequence:**
1. `/dev-story STORY-001` - Project Setup
2. `/dev-story STORY-002` - Authentication
3. `/dev-story STORY-003` - Screenshot Capture
4. `/dev-story STORY-006` - Metadata Capture
5. `/dev-story STORY-004` - Annotation Tools
6. `/dev-story STORY-005` - Board Selection
7. `/dev-story STORY-007` - Card Submission
8. `/dev-story STORY-008` - Polish

---

**This plan was created using BMAD Method v6 - Phase 4 (Implementation Planning)**
