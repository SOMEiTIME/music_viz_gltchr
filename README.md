# music_viz_gltchr
for the browser, vanilla JS on Vite

Plays a video on a canvas and glitches it using the frequency data from the audio.

## Usage
```
yarn
yarn dev
```
`yarn build` makes a production build in dist/.

The page loads `audio.mp3` and `video.mp4` from the project root, and they're included. Swap in your own with the same names, or upload them in the sidebar. Browsers block autoplay, so click the page if there's no sound.

## Sidebar
Click the menu icon to open it.

 * Sliders tune the effect (see below)

 * Upload your own video and audio

 * Presets save your slider settings under a name (letters, numbers, underscores and spaces only). They live in localStorage

 * Uploaded files aren't saved with presets

## Sliders
The picture is split into vertical strips, one per slice of the audio's frequency range. The louder a slice is, the harder its strip gets glitched.

 * Color: shifts the colors. Which pixel values get changed depends on this

 * Gap: louder strips get narrower and shift down

 * Response: how far the sound pushes the color channels around. Higher response means more wild colors

 * Visual Offset: brightens a strip as it gets louder

 * High End / Low End: pixels brighter than High End or darker than Low End get replaced with the Fill In value

 * Fill In: the value those replaced pixels get. Low is dark, high is bright

 * Fidget: how much loud strips jitter sideways

 * Bars: draws a second copy of each strip that rises up from the bottom with the volume. 0 turns it off
