# music_viz_gltchr

Browser-based audio/video visualizer. A video is drawn to a canvas and glitched using frequency data from an audio analyser (Web Audio API). Sliders in a sidebar tune the effect, and settings can be saved as named presets. Vanilla JS on a Vite scaffold.

## Run
Needs Node 22.12 or newer (Vitest 5 requires it; set in `engines` in `package.json`).
```
yarn            # install (yarn.lock is the lockfile; use yarn, not npm)
yarn dev        # vite dev server
yarn build      # production build to dist/
yarn test       # vitest unit tests in tests/
```
No linter configured. Tests cover the DOM-free logic only, so still verify changes in the browser. CI runs `yarn test` on every PR.

## Layout
- `index.html` — page, sidebar controls (range sliders, file inputs, preset UI). There are no inline handlers (the CSP meta tag blocks them); `bindControls()` in `script.js` attaches listeners by id/selector, so new controls need wiring there.
- `script.js` — everything else: canvas and `OffscreenCanvas` setup, `AudioContext` + `AnalyserNode` (fftSize 32, drives the strips) chained after a second one for byte mode's beats (fftSize 1024, unsmoothed), the `animate()` render loop, the `settings` object, and the preset UI.
- `presets.js` — DOM-free settings and preset logic (`numericRanges`, `copySettings()`, preset name rules, `reservedKeys`, starter seeding). Functions take a Storage-like object rather than using `localStorage` directly, so tests can pass a fake (`tests/memoryStorage.js`).
- `videoRect.js` — `videoDrawRect()`, the crop/letterbox maths.
- `byteMode.js` — DOM-free helpers for byte mode (a frame is JPEG-encoded, its bytes corrupted, then decoded): finding where a JPEG's picture data starts, the operations per frame, beat detection. The async encode/decode pipeline is `erodeFrame()` in `script.js`. Its sliders (`erode*`, `beat*`) are ordinary settings saved in presets, but the mode select isn't (it's a string, and presets shouldn't switch on an expensive mode).
- `eroder/` — a copy of [Media-Eroder](https://github.com/SOMEiTIME/Media-Eroder)'s `src/core/` (from its commit `8b7eb4a`). Don't edit it here: change Media-Eroder and copy the folder over again.
- `tests/` — Vitest tests. `data.test.js` checks that `index.html` slider ranges match `numericRanges` and that `public/presets.json` is valid, so it fails if those drift apart.
- `stylesheet.css` — styling.

## Gotchas
- `audio.mp3` and `video.mp4` are loaded by default from `public/` (Vite copies it into `dist/` as-is). They're committed (self-made, rarely change); other `*.mp3`/`*.mp4` files are still gitignored. Avoid committing new media, since every version stays in git history forever.
- `defaultVideoFocus` in `script.js` is the bundled video's text column, which `videoDrawRect()` (in `videoRect.js`) keeps in view. Replacing `public/video.mp4` means re-measuring it, or setting it to `null` for a center crop.
- Browsers block audio until the user interacts with the page, so audio starts from the click-to-start overlay (`startFromOverlay()`). Check the console for autoplay errors when debugging "no sound".
- Adding a new setting needs changes in three places: the `settings` object in `script.js`, a slider in `index.html` with an id matching the key, and (if numeric) `numericRanges` in `presets.js` with the slider's min/max. `tests/data.test.js` also expects every starter preset in `public/presets.json` to have a value for it. `copySettings()` copies only keys already in `settings` and clamps numbers to `numericRanges`; a numeric key missing from an old saved preset keeps its current value, a string key becomes `undefined`. Presets and `current` are stored in localStorage as JSON of `settings`; `presetNames()` treats every localStorage key except those in `reservedKeys` (`current`, `lastPreset`, `seededPresets`) as a preset name, so any new app-state key must be added there. `public/presets.json` starter presets are seeded once per name by `seedStarterPresets()` and never overwrite an existing preset of the same name. To regenerate the file from a browser's presets, run this in the DevTools console and paste the result in (it drops the stale blob URLs; also remove `videoName`/`audioName`, which name files visitors don't have):
  ```js
  copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage)
    .filter(k => !["current", "lastPreset", "seededPresets"].includes(k))
    .map(k => {
      const { videoSrc, audioSrc, ...preset } = JSON.parse(localStorage[k]);
      return [k, preset];
    })), null, 2))
  ```
- User-uploaded files are used via object URLs (`videoSrc`/`audioSrc` in `settings`), so they can't be restored from storage. Revoke old URLs when swapping.
- Preset names are validated by a `^[\s\w]*$` pattern; keep that in mind if names are changed or shown in the DOM.
- The `settings` object carries trailing comments with older default values (e.g. `//2`, `//.09`). They are tuning history, so leave them in.

## Public repo
This repo is public. Don't commit personal details (full name, email, local paths, device names), other people's contact info, or secrets. Ask first if a task needs one.

## Git workflow
- Never commit directly to `main`. Before making any commit, create a branch named for the work (e.g. `feature/add-glitch-mode`, `fix/header-parsing`, `docs/update-notes`) and commit there.
- If you're on `main` when asked to commit, switch to a new branch first.
- Keep commits small and focused, with a short imperative message.
- Pushing to a branch Claude created is fine without asking. Ask before force-pushing or pushing to any other branch (including `main`).
- Open a PR without asking once the work on a branch Claude created is done (verified, docs updated). For any other branch, ask first. Don't merge PRs.
- Before opening a PR, do a final pass over the whole diff against `main`: is it readable, well designed, and no more verbose than it needs to be? Fix what you find, without changing behaviour, then re-verify (`yarn test`, `yarn build`, and check it in the browser) and note what the pass changed in the PR description.
- Stage specific files (not `git add -A`), since stray files like `.DS_Store` are lying around.
