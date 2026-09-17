# Lab 6 Change Log

## September 17, 2026 — Submission cleanup

- Synchronized the laptop course-folder checkout with the previously published Lab 6 revision (`071e980`). Preserved the old checkout in a separate backup folder.
- Replaced the introduction and both treemap instructions with the requested wording.
- Updated the country count and size/color summary labels.
- Changed the shared GDP-status palette to light red (Increase), light yellow (Unchanged), and light green (Decrease).
- Updated the GDP-area legend wording.
- Enlarged both treemap layouts from 1080 × 650 to 1280 × 880 and increased only the Lab 6 page's maximum width from 1000 to 1300 pixels.
- Rewrote the design description to explain the new palette, hierarchy, interactions, and segmentation trade-offs within 100–200 words.
- Bumped the Lab 6 stylesheet and script cache versions.

The official CSV, hierarchical JSON, conversion script, page section order, and Labs 1–5 are unchanged. All edits are committed from the laptop's `stats401-labs` checkout. The commit history identifies each published revision; verify it with `git log -1 --oneline`. Deployment verification compares public files with that checkout.

### Pre-publication verification

- Official CSV records match; the JSON retains all 27 countries, their complete hierarchy paths, GDP values, and statuses.
- Running the Python/pandas converter reproduces the existing JSON exactly.
- Both browser-rendered SVGs contain 27 country marks, use different layout geometries, and share the three requested status colors.
- Keyboard-focus tooltips work in both views; all 54 country marks are focusable.
- No browser console errors or warnings; no page-level horizontal overflow at the audit viewport.
- Design description: 174 words. JavaScript syntax and Git whitespace checks pass.
