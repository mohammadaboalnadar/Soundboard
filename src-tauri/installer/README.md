# Installer art

`sidebar.bmp` (164 x 314, welcome and finish pages) and `header.bmp` (150 x 57, inner pages) are rendered from `art.html`:

1. Open `art.html?sidebar` and `art.html?header` in a Chromium browser at device scale 1 and screenshot each at its size.
2. Convert to 24-bit BMP, e.g. `ffmpeg -i sidebar.png -pix_fmt bgr24 sidebar.bmp`.

The mark itself is `../icons/icon-source.svg`; regenerate app icons with `npx tauri icon src-tauri/icons/icon-source.svg -o src-tauri/icons`.
