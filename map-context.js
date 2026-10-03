/* Live GSI context tiles. Only the current viewport is requested; climate values stay independent. */
(() => {
  "use strict";
  const ROOT = "https://cyberjapandata.gsi.go.jp/xyz";
  const clamp = (v, low, high) => Math.min(high, Math.max(low, v));
  const wrap = (v, n) => ((v % n) + n) % n;
  const latitude = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;

  function plan(bounds, pixels) {
    const west = bounds.x, east = west + Math.min(1000, bounds.width);
    const north = clamp(bounds.y, 0, 1000), south = clamp(bounds.y + bounds.height, 0, 1000);
    let z = clamp(Math.ceil(Math.log2(Math.max(1, pixels) / 256)), 2, 18), extent;
    do {
      const n = 2 ** z;
      extent = { z, n, x: Math.floor(west / 1000 * n), y: Math.floor(north / 1000 * n),
        right: Math.ceil(east / 1000 * n), bottom: Math.min(n, Math.ceil(south / 1000 * n)) };
      extent.right = Math.min(extent.right, extent.x + n);
      if ((extent.right - extent.x) * (extent.bottom - extent.y) <= 64
        && extent.right - extent.x <= 16 && extent.bottom - extent.y <= 16) break;
    } while (--z >= 2);
    const tiles = [];
    for (let y = extent.y; y < extent.bottom; y++) for (let x = extent.x; x < extent.right; x++) tiles.push({ x, y, z: extent.z });
    return { ...extent, tiles, box: { x: extent.x * 1000 / extent.n, y: extent.y * 1000 / extent.n,
      width: (extent.right - extent.x) * 1000 / extent.n, height: (extent.bottom - extent.y) * 1000 / extent.n } };
  }

  function source(layer, tile, global = false) {
    const n = 2 ** tile.z, x = wrap(tile.x, n);
    const west = x / n * 360 - 180, east = (x + 1) / n * 360 - 180;
    const japan = east >= 122 && west <= 154 && latitude(tile.y + 1, n) <= 46 && latitude(tile.y, n) >= 20;
    let id, max;
    if (layer === "detail") { id = "std"; max = !global && japan ? 18 : 8; }
    if (layer === "photo") { id = "seamlessphoto"; max = !global && japan ? 18 : 8; }
    if (layer === "mono") { id = !global && japan && tile.z > 8 ? "hillshademap" : "earthhillshade"; max = id === "hillshademap" ? 16 : 8; }
    if (layer === "color") { id = !global && japan && tile.z >= 5 ? "relief" : "demgm_png"; max = id === "relief" ? 15 : 8; }
    const z = Math.min(tile.z, max), factor = 2 ** (tile.z - z);
    return { id, z, url: `${ROOT}/${id}/${z}/${Math.floor(x / factor)}/${Math.floor(tile.y / factor)}.${layer === "photo" ? "jpg" : "png"}`,
      crop: [x % factor * 256 / factor, tile.y % factor * 256 / factor, 256 / factor, 256 / factor] };
  }

  function elevation(r, g, b) {
    const value = r * 65536 + g * 256 + b;
    return value === 8388608 ? null : (value > 8388608 ? value - 16777216 : value) * .01;
  }
  const COLORS = [[0,[165,194,149]],[200,[195,211,157]],[500,[226,221,168]],
    [1000,[216,185,143]],[2000,[187,151,126]],[3500,[174,168,161]],[6000,[241,241,235]]];
  function elevationColor(height) {
    if (height === null) return null;
    if (height < 0) return [174,210,222];
    let a = COLORS[0], b = COLORS[COLORS.length - 1];
    for (let i = 1; i < COLORS.length; i++) if (height <= COLORS[i][0]) { a = COLORS[i - 1]; b = COLORS[i]; break; }
    const t = clamp((height - a[0]) / (b[0] - a[0]), 0, 1);
    return a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
  }

  class PlantMapContext {
    constructor(onAtlas, onStatus) {
      this.onAtlas = onAtlas; this.onStatus = onStatus;
      this.cache = new Map(); this.serial = 0; this.signature = "";
      this.active = 0; this.queue = [];
    }
    load(url, current) {
      if (this.cache.has(url)) return this.cache.get(url);
      const promise = new Promise((resolve) => {
        this.queue.push({ url, current, resolve }); this.pump();
      });
      this.cache.set(url, promise);
      return promise;
    }
    pump() {
      while (this.active < 8 && this.queue.length) {
        const task = this.queue.shift();
        if (!task.current()) { this.cache.delete(task.url); task.resolve(null); continue; }
        this.active++;
        const image = new Image(); image.crossOrigin = "anonymous"; image.referrerPolicy = "no-referrer"; image.decoding = "async";
        let complete = false;
        const finish = (result) => {
          if (complete) return; complete = true; clearTimeout(timer); this.active--;
          task.resolve(result);
          while (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value);
          this.pump();
        };
        const timer = setTimeout(() => { finish(null); image.src = ""; }, 10000);
        image.onload = () => finish(image); image.onerror = () => finish(null); image.src = task.url;
      }
    }
    cancel() { this.serial++; this.signature = ""; }
    async update(bounds, pixels, layers) {
      const layout = plan(bounds, pixels);
      const signature = JSON.stringify([layout.z, layout.x, layout.y, layout.right, layout.bottom, layers]);
      if (signature === this.signature) return;
      this.signature = signature;
      const serial = ++this.serial, current = () => this.serial === serial;
      // Drop queued requests from an obsolete viewport before reusing cache keys.
      const obsolete = this.queue.splice(0);
      for (const task of obsolete) { this.cache.delete(task.url); task.resolve(null); }
      for (const key of ["baseMap", "terrain"]) if (!layers[key]) this.onAtlas(key, null);
      if (!Object.values(layers).some(Boolean) || !layout.tiles.length) { this.onStatus(""); return; }
      this.onStatus("地図画像を読み込み中");
      const counts = await Promise.all(Object.entries(layers).filter(([,layer]) => layer).map(async ([key, layer]) => {
        const canvas = document.createElement("canvas");
        canvas.width = (layout.right - layout.x) * 256; canvas.height = (layout.bottom - layout.y) * 256;
        const context = canvas.getContext("2d");
        const entries = await Promise.all(layout.tiles.map(async (tile) => {
          let entry = source(layer, tile), image = await this.load(entry.url, current);
          if (!image && current()) { entry = source(layer, tile, true); image = await this.load(entry.url, current); }
          if (!image || !current()) return null;
          let shade = null;
          if (entry.id === "demgm_png") {
            const shadeSource = source("mono", tile, true);
            shade = { image: await this.load(shadeSource.url, current), crop: shadeSource.crop };
          }
          return { tile, entry, image, shade };
        }));
        if (!current()) return null;
        const sources = new Set(); let count = 0;
        for (const item of entries) {
          if (!item) continue;
          const { tile, entry, image, shade } = item;
          let drawable = image, crop = entry.crop;
          if (entry.id === "demgm_png") {
            const colored = document.createElement("canvas"); colored.width = colored.height = 256;
            const colorContext = colored.getContext("2d", { willReadFrequently: true });
            colorContext.imageSmoothingEnabled = false; colorContext.drawImage(image, ...crop, 0, 0, 256, 256);
            const heights = colorContext.getImageData(0, 0, 256, 256);
            colorContext.clearRect(0, 0, 256, 256);
            if (shade?.image) colorContext.drawImage(shade.image, ...shade.crop, 0, 0, 256, 256);
            const shadows = colorContext.getImageData(0, 0, 256, 256).data;
            for (let i = 0; i < heights.data.length; i += 4) {
              const rgb = heights.data[i + 3] ? elevationColor(elevation(heights.data[i], heights.data[i + 1], heights.data[i + 2])) : null;
              const light = shadows[i + 3] ? .65 + shadows[i] / 255 * .45 : 1;
              for (let c = 0; c < 3; c++) heights.data[i + c] = rgb ? clamp(Math.round(rgb[c] * light), 0, 255) : 0;
              heights.data[i + 3] = rgb ? 255 : 0;
            }
            colorContext.putImageData(heights, 0, 0); drawable = colored; crop = [0, 0, 256, 256];
          }
          context.drawImage(drawable, ...crop, (tile.x - layout.x) * 256, (tile.y - layout.y) * 256, 256, 256);
          sources.add(entry.id); count++;
        }
        if (current()) this.onAtlas(key, { image: canvas, box: layout.box, sources: [...sources], tiles: count, total: entries.length });
        return [count, entries.length];
      }));
      if (current()) this.onStatus(counts.some((c) => c && c[0] < c[1]) ? "一部の地図画像は提供範囲外、または読み込めませんでした" : "");
    }
  }
  PlantMapContext.coordinates = { plan, source, elevation, elevationColor };
  window.PlantMapContext = PlantMapContext;
})();
