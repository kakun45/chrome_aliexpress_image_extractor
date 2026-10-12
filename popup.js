// This version looks for clickable gallery elements, captures the enlarged image URLs as the gallery changes, and builds the ZIP locally.
const status = document.getElementById("status");
const button = document.getElementById("go");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getImageUrl(raw) {
  try {
    const u = new URL(raw, location.href);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!/alicdn\.com|aliexpress-media\.com/i.test(u.hostname)) return null;
    if (!/\.(jpg|jpeg|png|webp|avif)(?:_|$)/i.test(u.pathname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

function crc32(bytes) {
  let c = -1;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
  }
  return (c ^ -1) >>> 0;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const u16 = n => [n & 255, (n >>> 8) & 255];
  const u32 = n => [
    n & 255, (n >>> 8) & 255,
    (n >>> 16) & 255, (n >>> 24) & 255
  ];

  function join(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const header = new Uint8Array([
      80,75,3,4, ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(crc),
      ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0), ...name
    ]);

    const central = new Uint8Array([
      80,75,1,2, ...u16(20), ...u16(20), ...u16(0),
      ...u16(0), ...u16(0), ...u16(0), ...u32(crc),
      ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name
    ]);

    locals.push(header, data);
    centrals.push(central);
    offset += header.length + data.length;
  }

  const body = join(locals);
  const directory = join(centrals);
  const end = new Uint8Array([
    80,75,5,6, ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(directory.length), ...u32(body.length), ...u16(0)
  ]);

  return new Blob([body, directory, end], { type: "application/zip" });
}

button.addEventListener("click", async () => {
  button.disabled = true;

  try {
    status.textContent = "Finding the gallery…";

    const [tab] = await chrome.tabs.query({
      active: true, currentWindow: true
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const imageSelector = "img.magnifier--image--RM17RL2";
        const mainImage = () => document.querySelector(imageSelector);

        const main = mainImage();
        if (!main) {
          return { error: "Magnifier image not found. Open the listing's image gallery first." };
        }

        const gallery = main.closest(
          ".image-view-v2--previewWrap--lICzhlN"
        )?.parentElement || main.parentElement?.parentElement;

        // Find visible images outside the enlarged preview, then walk up
        // to a clickable thumbnail/control.
        const allImgs = [...document.querySelectorAll("img")];
        const thumbs = [];

        for (const img of allImgs) {
          if (img === main || img.closest(".image-view-v2--previewWrap--lICzhlN")) {
            continue;
          }

          const r = img.getBoundingClientRect();
          if (r.width < 25 || r.height < 25) continue;

          const container = img.closest(
            "li, button, [role='button'], a"
          ) || img.parentElement;

          if (container && !thumbs.includes(container)) {
            thumbs.push(container);
          }
        }

        const candidates = thumbs.filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });

        const urls = new Set();
        const addCurrent = () => {
          const src = mainImage()?.getAttribute("src");
          if (src) urls.add(src);
        };

        addCurrent();

        if (!candidates.length) {
          return {
            error: "Found the enlarged image, but could not identify thumbnail controls. Need the thumbnail HTML or a screenshot of the gallery."
          };
        }

        for (let i = 0; i < candidates.length; i++) {
          const el = candidates[i];
          el.scrollIntoView({ block: "center", inline: "center" });
          el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          el.click();
          await sleep(500);

          // Wait briefly for the main image source to change.
          const start = Date.now();
          while (Date.now() - start < 1800) {
            addCurrent();
            await sleep(150);
          }
        }

        return { urls: [...urls], count: candidates.length };
      }
    });

    if (result.error) throw new Error(result.error);

    const urls = [...new Set(result.urls.map(getImageUrl).filter(Boolean))];
    if (!urls.length) throw new Error("No image URLs found.");

    status.textContent = `Found ${urls.length} image URLs. Downloading…`;

    const files = [];
    const failures = [];

    for (let i = 0; i < urls.length; i++) {
      status.textContent = `Downloading ${i + 1} of ${urls.length}…`;
      try {
        const response = await fetch(urls[i]);
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = new Uint8Array(await response.arrayBuffer());
        const type = response.headers.get("content-type") || "";
        let ext = urls[i].match(/\.(jpg|jpeg|png|webp|avif)(?:_|$)/i)?.[1] || "jpg";
        if (/png/i.test(type)) ext = "png";
        else if (/webp/i.test(type)) ext = "webp";
        else if (/avif/i.test(type)) ext = "avif";
        files.push({
          name: `image_${String(files.length + 1).padStart(3, "0")}.${ext}`,
          data
        });
      } catch {
        failures.push(urls[i]);
      }
    }

    if (!files.length) {
      throw new Error("Could not fetch the image files. The image host may block cross-origin downloads.");
    }

    const blob = makeZip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aliexpress-images.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    status.textContent =
      `ZIP created with ${files.length} images.` +
      (failures.length ? ` ${failures.length} downloads failed.` : "");
  } catch (e) {
    status.textContent = "Error: " + e.message;
  } finally {
    button.disabled = false;
  }
});