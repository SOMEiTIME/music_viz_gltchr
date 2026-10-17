# music_viz_gltchr

Browser-based audio/video visualizer. A video is drawn to a canvas and glitched using frequency data from an audio analyser (Web Audio API). Sliders in a sidebar tune the effect, and settings can be saved as named presets. Vanilla JS on a Vite scaffold.

## Run
```
yarn            # install (yarn.lock is the lockfile; use yarn, not npm)
yarn dev        # vite dev server
yarn build      # production build to dist/
```
No tests or linter configured. Verify changes in the browser.

## Layout
- `index.html` — page, sidebar controls (range sliders, file inputs, preset UI). Handlers are inline (`oninput="input(...)"`, `onclick="addFavorite()"`), so the functions they call must stay global in `script.js`.
- `script.js` — everything else: canvas and `OffscreenCanvas` setup, `AudioContext` + `AnalyserNode` (fftSize 32), the `animate()` render loop, the `settings` object, and localStorage preset functions.
- `util.js` — `storageAvailable()` helper copied from MDN.
- `stylesheet.css` — styling.

## Gotchas
- `audio.mp3` and `video.mp4` are loaded by default from the project root. They are **gitignored** (`*.mp3`, `*.mp4`), so a fresh clone won't have them and the page won't work until you add your own. Don't commit media.
- Browsers block autoplay until the user interacts with the page, and `audio1.play()` is called on load, so check the console for autoplay errors when debugging "no sound".
- Adding a new setting needs changes in two places: the `settings` object in `script.js`, and a slider in `index.html` with an id matching the key. `copySettings()` copies only keys already in `settings`, so a new key missing from an old saved preset becomes `undefined`. Presets and `current` are stored in localStorage as JSON of `settings`; `loadSelections()` treats every localStorage key except `current` as a preset name.
- User-uploaded files are used via object URLs (`videoSrc`/`audioSrc` in `settings`), so they can't be restored from storage. Revoke old URLs when swapping.
- Preset names are validated by a `^[\s\w]*$` pattern; keep that in mind if names are changed or shown in the DOM.
- The `settings` object carries trailing comments with older default values (e.g. `//2`, `//.09`). They are tuning history, so leave them in.

## Git workflow
- Never commit directly to `main`. Before making any commit, create a branch named for the work (e.g. `feature/add-glitch-mode`, `fix/header-parsing`, `docs/update-notes`) and commit there.
- If you're on `main` when asked to commit, switch to a new branch first.
- Keep commits small and focused, with a short imperative message. Don't push or open a PR unless asked.
- Stage specific files (not `git add -A`), since stray files like `.DS_Store` are lying around.
