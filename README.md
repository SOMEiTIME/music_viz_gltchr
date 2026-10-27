# music_viz_gltchr
A simple toy for the browser, using vanilla JS on Vite.
Public demo: https://someitime.github.io/music_viz_gltchr/

Plays a video on a canvas and glitches it using the frequency data from the audio.

## Usage
Needs Node 22.12 or newer.
```
yarn
yarn dev
```
`yarn build` makes a production build in dist/. `yarn test` runs the tests.

The page loads `audio.mp3` and `video.mp4` from `public/`, and they're included. Swap in your own with the same names, or upload them in the sidebar. Browsers block audio until you interact with the page, so it opens with a click-to-start screen.

The included video is cropped to fill the screen around its text. If you replace `public/video.mp4`, update `defaultVideoFocus` in `script.js` to the left and right edges of the part you want kept in view, or set it to `null` to crop around the center.

## Sidebar
Click the menu icon to open it.

 * Sliders tune the effect (see below).
 * Byte mode (experimental) saves a frame as a JPEG, corrupts its bytes and shows the result for a few frames, either every N frames or on beats. Louder sound means more damage. The line under it shows the frame rate and how long each step takes, and on beats also how loud the bass is and what a beat needs, to help set the beat sliders. Its sliders are saved with presets, but the mode isn't.
 * Upload your own video and audio. The last ones you uploaded are kept in the browser and come back when the page reloads. They aren't saved with presets. Use default media goes back to the included files.
 * Presets save your slider settings under a name (letters, numbers, underscores and spaces only) in localStorage.
 * Starter presets are included, and the dropdown reopens on the last preset you chose or saved.

## Sliders
The picture is split into vertical strips, one per slice of the audio's frequency range. The louder a slice is, the harder its strip gets glitched.

 * Color: shifts the colors. Which pixel values get changed depends on this
 * Gap: louder strips get narrower and shift down
 * Response: how far the sound pushes the color channels around. Higher means wilder colors
 * Visual Offset: brightens a strip as it gets louder
 * High End / Low End: pixels brighter than High End or darker than Low End get replaced with the Fill In value
 * Fill In: the value those replaced pixels get. Low is dark, high is bright
 * Fidget: how much loud strips jitter sideways
 * Bars: draws a second copy of each strip that rises up from the bottom with the volume. 0 turns it off

Byte mode's sliders:

 * Every N Frames: how often "Every N frames" glitches
 * Beat Jump: how far above its recent average the bass has to jump to count as a beat. Lower catches more beats
 * Beat Floor: how loud the bass has to be for a beat to count
 * Beat Rest: frames after a beat before another can count
 * Hold: how many frames a glitched frame stays on screen
 * Damage: how much of each frame gets corrupted
 * Resolution: the size a frame is glitched at. Lower is faster and blockier
