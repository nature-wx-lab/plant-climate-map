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
    const inside = (p, margin = 0) => p && p.every(Number.isFinite) && p[0] >= margin && p[1] >= margin && p[0] <= width - margin && p[1] <= height - margin
      && (!disk || Math.hypot(p[0] - disk.x, p[1] - disk.y) <= disk.radius - margin);
    const intersects = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const measure = document.createElement("canvas").getContext("2d");

    // A fixed name anchor can leave the viewport while much of its country is still visible.
    // Find an anchor on the clipped land instead, including at the globe's visible limb.
    const projections = (options.projections || []).map((projection) => ({ projection, path: d3.geoPath(projection) }));
    const landAnchor = (country, projection, path) => {
      const bounds = path.bounds(country.feature);
      if (!bounds.flat().every(Number.isFinite)) return null;
      const centroid = path.centroid(country.feature);
      const contains = (p) => {
        if (!inside(p)) return false;
        const coordinate = projection.invert(p);
        return coordinate?.every(Number.isFinite) && d3.geoContains(country.feature, coordinate);
      };
      if (contains(centroid)) return centroid;
      const candidates = [[width / 2, height / 2]];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) candidates.push([
        bounds[0][0] + (bounds[1][0] - bounds[0][0]) * (x + .5) / 5,
        bounds[0][1] + (bounds[1][1] - bounds[0][1]) * (y + .5) / 5,
      ]);
      const found = candidates.find(contains);
      if (found) return found;
      // Small islands and thin visible strips can fall between the sample points.
      const edgePoints = [], record = (x, y) => { if (inside([x, y])) edgePoints.push([x, y]); };
      path.context({ moveTo: record, lineTo: record, closePath() {}, arc() {} })(country.feature);
      path.context(null);
      edgePoints.sort((a, b) => Math.hypot(a[0] - width / 2, a[1] - height / 2)
        - Math.hypot(b[0] - width / 2, b[1] - height / 2));
      return edgePoints[0] || null;
    };
    const countryPoints = new Map();
    if (visible.countries || visible.regions) for (const country of data.countries) {
      const primary = point(...country.point).filter((p) => inside(p));
      let anchors = primary;
      if (country.feature && projections.length) anchors = projections.map(({ projection, path }) => {
        const projected = projection(country.point);
        return primary.find((p) => Math.hypot(p[0] - projected[0], p[1] - projected[1]) < .1)
          || ((options.zoom >= 4 || country.code === options.centerCountry) ? landAnchor(country, projection, path) : null);
      }).filter(Boolean);
      if (!anchors.length && country.code && country.code === options.centerCountry) anchors = [[width / 2, height / 2]];
      countryPoints.set(country, anchors);
    }
    const entries = [];
    if (visible.countries) for (const country of data.countries) for (const p of countryPoints.get(country) || []) {
      entries.push({ name: country.name, kind: "country", code: country.code, rank: country.rank || 0, anchors: [p] });
    }
    if (visible.regions) for (const region of data.regions) {
      const anchors = point(...region.point).filter((p) => inside(p));
      const reference = anchors[0] || [width / 2, height / 2];
      anchors.push(...region.members.flatMap((member) => countryPoints.get(member) || [])
        .sort((a, b) => Math.hypot(a[0] - reference[0], a[1] - reference[1]) - Math.hypot(b[0] - reference[0], b[1] - reference[1])));
      if (options.centerRegion === region.id) anchors.unshift([width / 2, height / 2]);
      if (anchors.length) entries.push({ name: region.name, kind: "region", code: region.id, color: region.color, anchors });
    }
    if (visible.capitals) for (const capital of data.capitals) for (const p of point(...capital.point)) {
      if (!inside(p)) continue;
      markers.append(node("circle", { cx: p[0], cy: p[1], r: 2.8, class: "capital-marker", "data-name": capital.name }));
      occupied.push([p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5]);
      entries.push({ name: capital.name, kind: "capital", code: capital.code, rank: capital.rank || 0, anchors: [p] });
    }
    // The central country keeps its place before the region is positioned nearby.
    // Dense labels are omitted; never move them to unrelated empty space on the map.
    const central = (entry) => Boolean(entry.code && (entry.code === options.centerCountry || entry.code === options.centerRegion));
    const centralCountry = (entry) => entry.kind === "country" && central(entry);
    const preferred = options.zoom >= 4 ? "country" : "region";
    entries.sort((a, b) => Number(centralCountry(b)) - Number(centralCountry(a)) || Number(central(b)) - Number(central(a))
      || (central(a) && central(b) ? Number(b.kind === "capital") - Number(a.kind === "capital") : 0)
      || Number(b.kind === preferred) - Number(a.kind === preferred) || (a.rank || 0) - (b.rank || 0));
    let placed = 0;
    const text = ({ name, kind, color, code, anchors }) => {
      const size = kind === "region" ? 13 : kind === "country" ? 12 : 11;
      measure.font = `${kind === "capital" ? 500 : 700} ${size}px "Hiragino Sans", "Yu Gothic", sans-serif`;
      const w = measure.measureText(name).width + (kind === "region" ? 16 : 6), h = size + 9;
      if (w > width - 6 || h > height - 6) return false;
      let box, x, y;
      const fit = (p, dx, dy) => {
        x = Math.max(w / 2 + 3, Math.min(width - w / 2 - 3, p[0] + dx));
        y = Math.max(h / 2 + 3, Math.min(height - h / 2 - 3, p[1] + dy));
        box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
        if (![[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].every((corner) => inside(corner, 3))) return false;
        if (occupied.some((b) => intersects([box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2], b))) return false;
        return true;
      };
      const offsets = kind === "capital" ? [[w / 2 + 9, 0], [-w / 2 - 9, 0], [0, -h - 3], [0, h + 3]] : [[0, 0]];
      if (kind === "region" || (kind === "country" && (options.zoom >= 4 || code === options.centerCountry)))
        offsets.push([0, -h - 5], [0, h + 5]);
      if (kind === "region") offsets.push([0, -2 * (h + 5)], [0, 2 * (h + 5)]);
      const found = anchors.some((p) => offsets.some(([dx, dy]) => fit(p, dx, dy)));
      if (!found) return false;
      occupied.push(box);
      const group = node("g", { class: `geography-label ${kind}-label`, "data-name": name, "data-code": code || "",
        "data-kind": kind, "data-box": box.join(",") });
      if (kind === "region") group.append(node("rect", { x: box[0], y: box[1], width: w, height: h, rx: 4, stroke: color }));
      const label = node("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": size });
      if (color) label.setAttribute("fill", color);
      label.textContent = name; group.append(label); fragment.append(group);
      placed++;
      return true;
    };
    entries.forEach(text);
    layer.setAttribute("data-visible-labels", entries.length);
    layer.setAttribute("data-placed-labels", placed);
    layer.replaceChildren(fragment);
  }

  window.PlantGeography = { prepare, regionPaths, drawLabels, outsideBoundary };
})();
