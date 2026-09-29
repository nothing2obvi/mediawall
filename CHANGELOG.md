# Changelog

## Unreleased

- Reorganize setup and reference documentation into topic pages under `docs/`, with a linked Documentation tree in the README; keep License and Contributors in the README.
- Add enlarged image previews with same-type arrow-key/button navigation, Enter selection of search results, and Backspace deletion of existing backdrops.
- Hide image editing during all fallback presentation, including Immich Kiosk.

- Hold disappearing Live TV sessions for a fixed 15 seconds during channel switches; fresh playback takes over immediately.

- Apply visual effects to centered Live TV channel images, increase their default size to 713 pixels, and add independent channel/title-label media information controls and shortcut cycling.

- Detect Jellyfin TV/radio channel sessions and display centered channel images with configurable size and text titles.
- Make the optional local music mount writable and enforce image-only local edits; remove the main image editor Cancel button.

- Add image uploads with drag-and-drop, file selection, preview, and Logo/Backdrop type selection for Jellyfin, local files, and external cache.

- Fix saved Jellyfin image edits appearing to fail during a secondary metadata refresh; refresh editor previews after changes.
- Move image editing beside Themes and open search in a nested modal with stepwise dismissal.

- Shared source-aware image editor on display and remote controls, with Jellyfin, local-file, and external-cache adapters.
- Logo/backdrop search, append, individual deletion, persisted ordering, and presentation timer hold/resume.
- Confirmed artwork-cache CLI cleanup with success toast and global-sound-aware built-in feedback.
- Static asset metadata sanitization and normalized cache-clear sound.

## 0.4.0 — 2026-09-25

Local release checkpoint before the image editor work.

- External music via a ListenBrainz-compatible receiver and Multi-Scrobbler; Spotify tested.
- Canonical artist/album-artist artwork, bidirectional aliases, Jellyfin/local/provider fallback, cached provider images, and source avatars.
- Immediate external track replacement and a configurable track-handoff grace period.
- Artwork provenance, download counts, rejection reasons, and cache-reuse logs.
- Optional daily page refresh per space and 300-pixel default album artwork.
- External music and image-provider setup documentation.

Validation: production build and 28 automated tests passed. Personal test configuration, credentials, and runtime data are excluded.
