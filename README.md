# Hopp!story (GLAMhack 2026)

A small Progressive Web App that shows historical sports events on a map of Switzerland
using swisstopo base maps.
Plain HTML, CSS and JavaScript: no build step and no dependencies to install.

## Live app

The app is deployed with GitHub Pages: **<https://glamhack.github.io/Hoppstory/>**

<img src="docs/qr-code.svg" width="180" alt="QR code linking to https://glamhack.github.io/Hoppstory/">

Scan the QR code to open the app on your phone.

Open it on a phone or in Chrome/Edge to install it as an app. After a change is
deployed, installed copies only update if `VERSION` in `sw.js` was bumped (see below).

## Run it locally

A service worker only works over `http://localhost` or HTTPS, so serve the folder
with any static web server rather than opening `index.html` directly.

```bash
# Python (usually already installed)
python -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>. In Chrome or Edge you can install the app
via the install icon in the address bar.

Tip: while developing, tick "Update on reload" under DevTools → Application →
Service workers, so changes show up straight away.

## Structure

```
index.html              page shell
manifest.webmanifest    PWA manifest (name, colours, icons)
sw.js                   service worker: caches the app and viewed map tiles
css/style.css           layout
js/config.js            map centre, zoom, bounds, base layers, data settings
js/map.js               creates the Leaflet map; addOverlay() for data layers
js/app.js               entry point, registers the service worker
icons/                  app icons (SVG + 192/512 PNG)
vendor/leaflet/         Leaflet 1.9.4 (BSD-2-Clause), served locally so it works offline
```

## Map data

Base maps are swisstopo WMTS tiles in Web Mercator
(`https://wmts.geo.admin.ch/1.0.0/<layer>/default/current/3857/{z}/{x}/{y}.jpeg`),
free to use with the attribution "© swisstopo". Three layers are configured in
`js/config.js`: the colour national map, the grey national map and SWISSIMAGE aerial photos.

## Adding data later

`createMap()` returns `addOverlay(name, layer)`, which adds a Leaflet layer to the
map and to the layer switcher. Event markers or routes (for example from the
Start/End Lat/Lon columns of the Google Sheet's *Austragung* tab) can be built as
a `L.layerGroup` and passed to it from `js/app.js`. `sheetId` in `js/config.js`
is reserved for that sheet.

When you change any app file, bump `VERSION` in `sw.js` so installed copies pick it up.
