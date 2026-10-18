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

 * Sliders tune the effect

 * Upload your own video and audio

 * Presets save your slider settings under a name (letters, numbers, underscores and spaces only). They live in localStorage

 * Uploaded files aren't saved with presets
