# Chrome Extention for AliExpress Image Extractor
For Mac


## Install it in Chrome

- Open chrome://extensions in Chrome.

- Turn on Developer mode in the upper-right corner.

- Click Load unpacked and select the AliExpress Image Extractor folder.

- Return to the AliExpress listing. Scroll through the item-selection gallery and open the enlarged-image view if needed.

- Click the extensions icon in Chrome, select AliExpress Image Extractor, then click Extract images and make ZIP.

Useful things in HTML:

Image element: `img.magnifier--image--RM17RL2`

Image container: `div.image-view-v2--previewWrap--lICzhlN`

Image URLs: Each image has a different filename, even though the HTML classes are the same.

- This version should click each thumbnail, wait for the src to change, collect the URL, and download all the images into one ZIP. 
- This version looks for clickable gallery elements, captures the enlarged image URLs as the gallery changes, and builds the ZIP locally.
- The manifest.json must include those listed in it permissions.

Feel free to modify this. After saving file changes:

- Open chrome://extensions.
- Click the reload icon on your extension.
- Return to the listing and refresh it.
- Open the gallery and click the extension button.

## Please note: 

The thumbnail selector is still a best-effort guess because HTML shows the enlarged image container, not the actual thumbnail strip. If the script says it can't identify thumbnail controls, don't worry — the next thing to try is the `outerHTML` of one small thumbnail, copied by right-clicking that small thumbnail and choosing `Inspect → Copy → Copy outerHTML`. That will let you target the exact controls rather than guessing.

## A few important limitations

Full resolution: The extension removes common AliExpress thumbnail suffixes, but some listings use separate original-image URLs. Removing a suffix cannot guarantee the original is available.

Gallery coverage: It may find extra images from recommendations or other page sections, not just the item-selection gallery.

Blocked downloads: If the CDN refuses cross-origin requests, some images may fail. This first version doesn't yet handle every AliExpress image format or gallery layout.

Browser choice: Start with Chrome; its unpacked-extension workflow is straightforward on macOS.