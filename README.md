# Image gallery for Paseo

A [Paseo](https://paseo.sh) plugin that collects every image from a workspace's agent sessions into a gallery in the right-side Explorer panel.

## Features

- Open **Image gallery** from the Explorer **+** menu, from the Command Center ("Open workspace image gallery"), or with `/gallery` in the composer.
- Finds images the agents read or wrote, image paths in commands, outputs, and messages, uploaded image files, and Markdown images. Identical images are shown once.
- Full-screen viewer with hover controls, previous and next buttons, left and right arrow keys, zoom to fit for small images, and actual size with drag panning for large images.

## Install

Requires Paseo 0.16.0 or later with plugins enabled.

```bash
paseo plugin add git:mordol/paseo-image-gallery
```

## Development

```bash
npm install
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload paseo-image-gallery
```

## How it works

The daemon side reads each agent's timeline through the Paseo SDK, extracts image references, keeps files that exist on the daemon machine, and removes duplicates by content hash. The app requests image bytes only for paths returned by a scan. Images pasted directly into the composer are not recorded in the timeline, so they do not appear.

## License

MIT
