# Project Brief & Technical Specification: 4ndr0image

---

## Project Vision

We will use the skeleton of this app as the foundation for 4ndr0image. 4ndr0image  is designed for a specific niche in professional-grade, photo shoots. It aims to empower the amateur photographer with the expensive, state-of-the-art. professional-grade studio lighting effects that are out of budget. The same professional studio lighting once available only to professionals is offered via an AI-powered web tool. It provides a seamless and intuitive interface for users to harness the power of granular control over complex lighting manipulations—from generative angles, volumetric hazing, god light rays, style transfers and much more. With the click of a button and simple text prompts to begin granular controls using dials, knobs and graphs the app offers a professional lighting studio for manipulation in a fast and powerful way.

## Core Architectural Principles

- Responsiveness First: The layout must be fluid and adapt perfectly to all screen sizes.
- Centralized State Management: All global application states (image history, loading status, errors) must be managed centrally and passed down as props. This avoids state synchronization issues and makes debugging easier. 
- Complex, related state logic should be encapsulated in custom hooks (e.g. useHistory, useAutoSave).

---

# Features For Immediate Implementation

**Note**: all files that are referred to are only examples and may not exist in this context meaning you will have to design and fully flesh out the features described.
 
1. **Non-Destructive History System with Visual Thumbnails**: Every successful edit creates a new state in a history log. Users can undo, redo, and jump to any previous state by clicking on its thumbnail in the `HistoryPanel`. The `useHistory` hook will manage an array of `HistoryEntry` objects, where each entry contains the File object for that state. This is crucial for re-processing. The `HistoryPanel` component will render thumbnails by creating object URLs from the File objects in the history array. The history state is the **single source of truth** for the currently displayed image.

2. **Advanced Manual Adjustment Controls (via Web Worker)**: A suite of professional-grade, studio lighting controls (sliders for Intensity, angle of attack, diffusion, strength, etc.) are offered after selecting a spot on the image to place the lighting at. Similar to the retouch tab but specifically for lighting control after selecting an initial preset in the Adjustment tab. All lighting manipulation logic must reside in `workers/adjustmentWorker.ts`. When a user applies changes, the main App component sends the current image's `ImageData` and the adjustment values to the worker. The worker performs the calculations and sends the modified `ImageData` back. This process is asynchronous and does not block the UI. The worker must follow a professional order of operations (e.g., Adjustment/Preset -> Lighting -> Levels -> Exposure -> Tonal -> Brightness/Contrast -> Gamma) for high-quality results.

3. **Client-Side Session Persistence (IndexedDB)**: The user's entire session (image history, zoom/pan state) is automatically saved in the background. If they close the tab and return later, they are prompted to restore their session exactly where they left off. The `useAutoSave` hook will interface with a utility module (`utils/db.ts`) that uses `IndexedDB`. `IndexedDB` is essential because it can store File objects directly, which is highly efficient. Saving should occur periodically and on major state changes. Loading occurs once on app initialization.

4. **Comprehensive Service File**: A single, well-organized file to handle all communication with the Gemini API. A generic `generateImageModification` function should handle the common logic of file-to-part conversion, API call structure, and response parsing. Specific exported functions (`generateEditedImage`, `generateFilteredImage`, `generateStyleTransferImage`, `generateUpscaledImage`, etc.) will be responsible for creating the highly-specific system prompts required for each feature. Crucially, the service must include robust response handling to check for safety blocks (`promptFeedback`) or other failure reasons (`finishReason`) and throw descriptive errors if an image part is not returned.

---

**Important Notes**:
1. Do not remove any tab that currently exists, leave them all as is.
2. You are creating a new tab called "Lighting".
