/* Display-only geography. Climate grids, point selection and plant ranges stay independent. */
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const node = (name, attrs = {}) => {
    const item = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
    return item;
  };
  const polygons = (geometry) => geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  // Remove shared country edges, then join the remaining edges into regional outlines.
  // Keep disconnected islands and holes; never replace a region with a bounding rectangle.
  function outsideBoundary(features) {
    const edges = new Map(), positions = new Map();
    const key = (p) => p.map((v) => Number(v.toFixed(6))).join(",");
    for (const feature of features) for (const polygon of polygons(feature.geometry)) for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const a = key(ring[i - 1]), b = key(ring[i]);
        if (a === b) continue;
        const id = a < b ? `${a}|${b}` : `${b}|${a}`;
        positions.set(a, ring[i - 1]); positions.set(b, ring[i]);
        if (edges.has(id)) edges.delete(id); else edges.set(id, [a, b]);
      }
    }
    const links = new Map();
    for (const [id, pair] of edges) for (const end of pair) {
      if (!links.has(end)) links.set(end, new Set());
      links.get(end).add(id);
    }
    const lines = [];
    while (edges.size) {
      const [firstId, first] = edges.entries().next().value;
      const line = [positions.get(first[0])];
      let current = first[0], nextId = firstId;
      while (nextId) {
        const pair = edges.get(nextId);
        const next = pair[0] === current ? pair[1] : pair[0];
        edges.delete(nextId); links.get(current).delete(nextId); links.get(next).delete(nextId);
        line.push(positions.get(next)); current = next;
        nextId = links.get(current).values().next().value;
      }
      lines.push(line);
    }
    return { type: "MultiLineString", coordinates: lines };
  }

  function prepare(countries, places, metadata) {
    const normalize = (rings) => d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI
      ? rings.map((ring) => ring.slice().reverse()) : rings;
    const labels = countries.map((f) => ({ ...metadata.countries[f.properties.code],
      name: f.properties.name, code: f.properties.code, capital: f.properties.capital,
      feature: { ...f, geometry: { type: "MultiPolygon", coordinates: polygons(f.geometry).map(normalize) } },
    })).sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));
    const byCode = new Map(labels.map((label) => [label.code, label]));
    const multipleNames = { Tokyo: "東京", "La Paz": "ラパス", Sucre: "スクレ", Abidjan: "アビジャン",
      Yamoussoukro: "ヤムスクロ", Bloemfontein: "ブルームフォンテーン", "Cape Town": "ケープタウン", Pretoria: "プレトリア" };
    const capitals = places.filter((p) => p.q === "c" && byCode.has(p.c)).map((p) => ({
      name: multipleNames[p.n] || byCode.get(p.c).capital || p.n,
      point: [p.x, p.y], rank: byCode.get(p.c).rank, code: p.c,
    })).sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));
    const regions = metadata.regions.map((r) => {
      const members = labels.filter((label) => label.region === r.id);
      return { ...r, members, geometry: { type: "FeatureCollection", features: members.map((m) => m.feature) },
        boundary: outsideBoundary(members.map((m) => m.feature)) };
    });
    return { countries: labels, capitals, regions };
  }

  function regionPaths(regions, path) {
    const fragment = document.createDocumentFragment();
    for (const region of regions) {
      const group = node("g", { "data-region": region.id });
      group.append(node("path", { d: path(region.geometry) || "", class: "region-fill", fill: region.color }),
        node("path", { d: path(region.boundary) || "", class: "region-border-halo" }),
        node("path", { d: path(region.boundary) || "", class: "region-border", stroke: region.color }));
      fragment.append(group);
    }
    return fragment;
  }

  function drawLabels(layer, data, options) {
    const { width, height, point, visible, disk } = options;
    const fragment = document.createDocumentFragment(), occupied = [];
    const markers = node("g", { class: "capital-markers" });
    fragment.append(markers);
    const inside = (p, margin = 6) => p && p[0] >= margin && p[1] >= margin && p[0] <= width - margin && p[1] <= height - margin
      && (!disk || Math.hypot(p[0] - disk.x, p[1] - disk.y) <= disk.radius - margin);
    const intersects = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const measure = document.createElement("canvas").getContext("2d");
    const text = (name, p, kind, color, offset = [0, 0]) => {
      const size = kind === "region" ? 13 : kind === "country" ? 12 : 11;
      measure.font = `${kind === "capital" ? 500 : 700} ${size}px sans-serif`;
      const w = measure.measureText(name).width + (kind === "region" ? 16 : 6), h = size + 9;
      const x = p[0] + offset[0], y = p[1] + offset[1];
      const box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      if (![[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].every((p) => inside(p, 3))
        || occupied.some((b) => intersects(box, b))) return false;
      occupied.push(box);
      const group = node("g", { class: `geography-label ${kind}-label`, "data-name": name });
      if (kind === "region") group.append(node("rect", { x: box[0], y: box[1], width: w, height: h, rx: 4, stroke: color }));
      const label = node("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": size });
      if (color) label.setAttribute("fill", color);
      label.textContent = name; group.append(label); fragment.append(group);
      return true;
    };
    if (visible.regions) for (const region of data.regions) {
      if (region.id === "ocean-islands" && options.zoom < 4) continue;
      let candidates = point(...region.point).filter((p) => inside(p, 20));
      const reference = candidates[0] || [width / 2, height / 2];
      candidates = candidates.concat(region.members.flatMap((m) => point(...m.point)).filter((p) => inside(p, 20))
        .sort((a, b) => Math.hypot(a[0] - reference[0], a[1] - reference[1]) - Math.hypot(b[0] - reference[0], b[1] - reference[1])));
      if (options.centerRegion === region.id) candidates.push([width / 2, height / 2]);
      for (const p of candidates) if (text(region.name, p, "region", region.color)) break;
    }
    if (visible.countries) for (const country of data.countries) for (const p of point(...country.point)) {
      if (inside(p)) text(country.name, p, "country");
    }
    if (visible.capitals) for (const capital of data.capitals) for (const p of point(...capital.point)) {
      if (!inside(p)) continue;
      markers.append(node("circle", { cx: p[0], cy: p[1], r: 2.8, class: "capital-marker", "data-name": capital.name }));
      measure.font = "500 11px sans-serif";
      const w = measure.measureText(capital.name).width / 2 + 9;
      for (const offset of [[w, 0], [-w, 0], [0, -13], [0, 13]]) {
        if (text(capital.name, p, "capital", null, offset)) break;
      }
    }
    layer.replaceChildren(fragment);
  }

  window.PlantGeography = { prepare, regionPaths, drawLabels, outsideBoundary };
})();
