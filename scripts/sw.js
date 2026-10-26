// ChillChain service worker: keeps the app on the phone so it opens and works without a network.
// Template: vite.config.ts fills in VERSION and PRECACHE (this build's files) and writes /sw.js.
//  - App code, styles and icons: saved at install, then served from the phone (cache first).
//  - Pages: network first (6 s), falling back to the last copy saved.
//  - Map tiles and the on-phone grading models: saved the first time they load online.
//  - Server functions and the API are never cached here; the app keeps its own data copy.
/* global self, caches, fetch, Response, URL, location */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const APP = `cc-app-${VERSION}`;
const PAGES = "cc-pages";
const TILES = "cc-tiles";
const MODELS = "cc-models";
const MAX_TILES = 800;

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const app = await caches.open(APP);
      // One missing file must not stop the rest from being saved.
      await Promise.allSettled(PRECACHE.map((u) => app.add(u)));
      // Refresh saved pages so they point at this build's files.
      const pages = await caches.open(PAGES);
      const keys = (await pages.keys()).map((r) => r.url);
      await Promise.allSettled([...new Set(["/", ...keys])].map((u) => pages.add(u)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys())
        if (k.startsWith("cc-app-") && k !== APP) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// The grower's screen asks for the grading models to be saved while there is a network.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "save-models" && Array.isArray(e.data.urls))
    e.waitUntil(saveModels(e.data.urls).catch(() => undefined));
});

async function saveModels(bases) {
  const cache = await caches.open(MODELS);
  for (const base of bases) {
    const files = [`${base}model.json`, `${base}metadata.json`];
    const model = await cachedFetch(cache, files[0]);
    const manifest = model ? await model.clone().json() : null;
    for (const group of manifest?.weightsManifest ?? [])
      for (const p of group.paths ?? []) files.push(new URL(p, base).href);
    for (const f of files.slice(1)) await cachedFetch(cache, f);
  }
}

async function cachedFetch(cache, url) {
  const hit = await cache.match(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (res.ok) await cache.put(url, res.clone());
  return res.ok ? res : null;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.searchParams.has("probe")) return; // the app checking whether the server is reachable
  if (req.mode === "navigate") return e.respondWith(page(req, url));
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) return;
    return e.respondWith(cacheFirst(req, APP));
  }
  if (url.hostname.endsWith("tile.openstreetmap.org"))
    return e.respondWith(cacheFirst(req, TILES, MAX_TILES));
  if (url.hostname === "teachablemachine.withgoogle.com")
    return e.respondWith(cacheFirst(req, MODELS));
});

async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    await cache.put(req, res.clone());
    if (max) void trim(cache, max);
  }
  return res;
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function page(req, url) {
  const cache = await caches.open(PAGES);
  const key = url.origin + url.pathname;
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, no) => setTimeout(() => no(new Error("slow")), 6000)),
    ]);
    if (res.ok && res.type === "basic") await cache.put(key, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(key)) ||
      (await cache.match(`${url.origin}/`)) ||
      new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } })
    );
  }
}

// Only seen if the app was never opened online on this phone.
const OFFLINE_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChillChain</title><body style="font:17px -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;background:#F2F2F7;color:#000"><div><h1 style="font-size:22px">You're offline</h1><p>Open ChillChain once with internet. After that it works offline too.</p><p lang="hi">आप ऑफ़लाइन हैं। ChillChain एक बार इंटरनेट से खोलें, उसके बाद यह बिना इंटरनेट भी चलेगा।</p><button onclick="location.reload()" style="font:inherit;padding:10px 20px;border:0;border-radius:10px;background:#007AFF;color:#fff">Try again</button></div></body></html>`;
