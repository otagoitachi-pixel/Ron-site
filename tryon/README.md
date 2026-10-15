# RON COLLECTION — Virtual Watch Try-On

This directory contains a browser-based watch try-on demo adapted from WebAR.rocks VTOWatch.

## How it works
- Open `/tryon/` on the deployed HTTPS website.
- Grant camera permission.
- Follow the wrist-positioning instructions.
- The demo currently renders the sample Casio 3D model supplied by the upstream project.

## Product-page integration
The product detail modal includes a Try It On button linking to `/tryon/?watch=<product-id>&name=<product-name>`.
The selected product name is displayed, but the current 3D asset remains the sample Casio model. Replace `assets/watchCasio.glb` and calibrate scale/offset in `main.js` for each actual watch model before presenting the try-on as an accurate preview of that product.

## Upstream project
WebAR.rocks VTOWatch: https://github.com/WebAR-rocks/VTOWatch
WebAR.rocks.hand: https://github.com/WebAR-rocks/WebAR.rocks.hand

Review upstream licensing and asset permissions before commercial use or redistribution. This integration retains the runtime assets needed by the demo and excludes development-only Blender/debug assets.
