# Aspect Ratio Helper – Forge Neo Edition (Gradio 4 Ready)

A maintained fork of Aspect Ratio Helper adapted for Forge Neo and Gradio 4.x.
This version resolves compatibility issues caused by deprecated Gradio APIs and differences in Neo's frontend initialization. The JavaScript controller has been redesigned to function independently of `window.opts` and to initialize reliably within Neo's UI environment.
This fork will continue to be maintained for Forge Neo compatibility.

---

# Aspect Ratio Helper [![pytest](https://github.com/thomasasfk/sd-webui-aspect-ratio-helper/actions/workflows/pytest.yml/badge.svg?branch=main)](https://github.com/thomasasfk/sd-webui-aspect-ratio-helper/actions/workflows/pytest.yml)

Simple extension to easily maintain aspect ratio while changing dimensions.

Install via the extensions tab on the [AUTOMATIC1111 webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) or Forge Neo.

## Features

### JavaScript aspect ratio controls

Injected next to the native Width/Height sliders (txt2img and img2img), not inside the accordion below.

- **Aspect ratio dropdown** — pick a ratio (e.g. `3:2`, `16:9`) and Width/Height are recalculated from the **Side** pixel budget: the resulting resolution has an area of roughly `side²`, aligned to a multiple of 64 by default. For example, `3:2` at a side of `1024` gives `1216×832` — matching the standard SDXL preset resolutions exactly for every built-in ratio (`1:1`, `5:4`, `4:3`, `3:2`, `16:9`, `21:9` and their portrait mirrors).
- **Side** — a compact slider next to Width, default `1024`. Acts as the pixel budget described above. Setting it to `0` falls back to scaling from whatever resolution is currently set on the sliders (the old behavior), instead of a fixed budget.
- **Align to a multiple of 64** — checkbox, enabled by default. When on, aspect ratio results (and Lock-mode recalculations) always land on a multiple of 64; when off, dimensions are rounded to the nearest pixel that hits the exact ratio.
- **Lock 🔒** — captures whatever ratio Width/Height currently have. While locked, editing either Width or Height recalculates the other to preserve that ratio (aligned to 64 if the checkbox is on). When you leave (blur) a Width/Height input box, if the committed value is within 64px of what the locked ratio would produce at a standard resolution (512, 768, 1024, 1536, 2048, i.e. SD1.5/SD2/SDXL and their 1.5×/2× multiples), both dimensions snap to that resolution. Nothing snaps while you're still typing.
- **Image 🖼️** (img2img only) — keeps the aspect ratio of the currently loaded image.
- **Swap ⇅** — flips the current dimensions. The configured ratio list also flips (e.g. `3:2` becomes `2:3`), so you don't need to list both orientations separately.
- Width/Height minimum and maximum are read from whatever your `ui-config.json` configured for those sliders (not hard-coded), so resolutions above 2048 (e.g. for 4K generation) work correctly.

### Accordion controls (unchanged)

- **Scale to maximum dimension** — scales width/height to a configured maximum, keeping the aspect ratio.
- **Scale to aspect ratio** — scales the current dimensions to a given ratio, using the highest width or height (or optionally the "Maximum dimension" slider value).
  - i.e. `4:3 of 256x512 = 512x384`, `9:16 of 512x256 = 288x512`, `1:1 of 256x300 = 300x300`
- **Scale by percentage** — multiplies the current dimensions by a percentage, aspect ratio maintained.
  - i.e. `-25% of 512x256 = 384x192`, `+50% of 512x512 = 768x768`
  - Display format is configurable: incremental (`-25%`/`+50%`), raw (`75%`/`150%`), or multiplier (`x0.75`/`x1.5`)

## Settings

- Hide accordion by default (`True`)
- Expand accordion by default (`False`)
- UI Component order (`MaxDimensionScaler, MinDimensionScaler, PredefinedAspectRatioButtons, PredefinedPercentageButtons`)
  - Determines the order in which the accordion's UI components render
- Enable JavaScript aspect ratio controls (`True`)
- JavaScript aspect ratio buttons (`1:1, 3:2, 4:3, 5:4, 16:9, 21:9`)
  - Only list one orientation per ratio (e.g. `3:2`, not also `2:3`) — the Swap button covers the other orientation
- Default side length for aspect ratio presets (`1024`)
  - Pixel budget for the dropdown presets (area ≈ side²); `0` = use the resolution currently set in the UI
- Align aspect ratio resolutions to a multiple of 64 by default (`True`)
- Show maximum dimension button (`False`)
- Maximum dimension default (`1024`)
- Show minimum dimension button (`False`)
- Minimum dimension default (`1024`)
- Show pre-defined aspect ratio buttons (`False`)
- Use "Maximum dimension" for aspect ratio buttons (`False`)
- Pre-defined aspect ratio buttons (`1:1, 4:3, 16:9, 9:16, 21:9`)
- Show pre-defined percentage buttons (`False`)
- Pre-defined percentage buttons (`25, 50, 75, 125, 150, 175, 200`)
- Pre-defined percentage display format (`Incremental/decremental percentage (-50%, +50%)`)
  - `Incremental/decremental percentage (-50%, +50%)`
  - `Raw percentage (50%, 150%)`
  - `Multiplication (x0.5, x1.5)`

JavaScript & accordion aspect ratios _might_ not play well together if both are enabled at once — they operate independently.

## Contributing

- Open an issue for suggestions
- Raise a pull request

## Dependencies

Developed using existing [AUTOMATIC1111 webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) / Forge Neo dependencies.

It's recommended to use the python version specified by the webui you're running.

However - for running unit tests, we use pytest.

```bash
pip install pytest
```

## Testing
From the root of the repository.
```bash
pytest
```
