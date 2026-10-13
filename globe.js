/* Orthographic display of the same Mercator source textures; no climate values are recalculated. */
(() => {
  "use strict";
  const RAD = Math.PI / 180;
  const MAX_LAT = 85.05112878;

  // Decorative celestial sphere: fixed motifs, not a dated astronomical sky chart.
  // Reuse the camera's rotation and keep sky scale independent of Earth zoom.
  function spaceScene() {
    let seed = 0x5e71ab;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const stars = Array.from({ length: 1800 }, () => ({
      longitude: random() * 360 - 180,
      latitude: Math.asin(random() * 2 - 1) / RAD,
      radius: .35 + random() ** 3 * 1.1,
      opacity: .24 + random() * .66,
      warm: random() > .88,
    }));
    const motifs = [
      { points: [[-12,-2],[-7,7],[-1,-1],[5,6],[11,-3]], edges: [[0,1],[1,2],[2,3],[3,4]] },
      { points: [[-13,6],[-6,3],[0,-1],[6,-3],[11,-2],[10,-9],[3,-10]], edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]] },
      { points: [[-7,10],[7,8],[-2,1],[0,0],[2,-1],[-7,-11],[7,-10]], edges: [[0,1],[0,2],[1,4],[2,3],[3,4],[2,5],[4,6],[5,6]] },
      { points: [[0,12],[0,2],[1,-11],[-10,1],[10,3]], edges: [[0,1],[1,2],[3,1],[1,4]] },
    ];
    const constellations = [];
    for (const latitude of [-42, 10, 55]) for (let longitude = -180; longitude < 180; longitude += 45) {
      const motif = motifs[constellations.length % motifs.length];
      const scale = .7 + random() * .3;
      const points = motif.points.map(([east, north]) => ({
        longitude: longitude + east * scale / Math.cos(latitude * RAD),
        latitude: latitude + north * scale,
      }));
      constellations.push({ points, edges: motif.edges });
    }
    return { stars, constellations };
  }

  function spacePoint(star, width, height, longitude, latitude) {
    const point = globeForward(star.longitude, star.latitude, Math.hypot(width, height) * .65, longitude, latitude);
    return point ? [point[0] + width / 2, point[1] + height / 2] : null;
  }

  function drawSpace(context, options, scene) {
    const { width, height, longitude, latitude, zoom } = options;
    const sky = context.createRadialGradient(width * .45, height * .42, 0,
      width * .45, height * .42, Math.max(width, height) * .8);
    sky.addColorStop(0, "#15253c"); sky.addColorStop(.5, "#090f20"); sky.addColorStop(1, "#02050d");
    context.fillStyle = sky; context.fillRect(0, 0, width, height);
    const point = (star) => spacePoint(star, width, height, longitude, latitude);
    const visible = (p, margin = 8) => p && p[0] > -margin && p[0] < width + margin
      && p[1] > -margin && p[1] < height + margin;
    // Sparse, quiet blue haze behind the globe, without tinting its data surface.
    for (const anchor of [{ longitude: 90, latitude: -10 }, { longitude: -70, latitude: 25 }]) {
      const p = point(anchor);
      if (!p) continue;
      context.save(); context.translate(p[0], p[1]); context.rotate(-.35); context.scale(1, .42);
      const haze = context.createRadialGradient(0, 0, 0, 0, 0, Math.max(width, height) * .5);
      haze.addColorStop(0, "rgba(66, 84, 151, .16)"); haze.addColorStop(.4, "rgba(39, 69, 124, .08)");
      haze.addColorStop(1, "rgba(19, 29, 63, 0)"); context.fillStyle = haze;
      context.fillRect(-width, -height * 2, width * 2, height * 4); context.restore();
    }
    context.lineWidth = .7; context.strokeStyle = "rgba(162, 193, 236, .32)";
    for (const constellation of scene.constellations) {
      const points = constellation.points.map(point);
      context.beginPath();
      for (const [a, b] of constellation.edges) {
        // Never join an edge across the celestial horizon.
        if (!points[a] || !points[b]) continue;
        context.moveTo(...points[a]); context.lineTo(...points[b]);
      }
      context.stroke();
      for (const p of points) if (visible(p)) {
        const glow = context.createRadialGradient(...p, 0, ...p, 5);
        glow.addColorStop(0, "rgba(220, 237, 255, .55)"); glow.addColorStop(1, "rgba(161, 200, 255, 0)");
        context.fillStyle = glow; context.fillRect(p[0] - 5, p[1] - 5, 10, 10);
        context.beginPath(); context.arc(...p, 1.35, 0, Math.PI * 2); context.fillStyle = "#d9e8fa"; context.fill();
      }
    }
    for (const star of scene.stars) {
      const p = point(star);
      if (!visible(p)) continue;
      context.globalAlpha = star.opacity;
      context.fillStyle = star.warm ? "#e8d4b9" : "#d2e2ff";
      context.beginPath(); context.arc(...p, star.radius, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    const radius = Math.min(width, height) * .46 * zoom;
    const atmosphere = context.createRadialGradient(width / 2, height / 2, radius,
      width / 2, height / 2, radius + 14);
    atmosphere.addColorStop(0, "rgba(140, 198, 238, .23)"); atmosphere.addColorStop(1, "rgba(105, 169, 230, 0)");
    context.fillStyle = atmosphere; context.beginPath();
    context.arc(width / 2, height / 2, radius + 14, 0, Math.PI * 2); context.fill();
  }

  function globeInverse(x, y, radius, longitude, latitude) {
    const east = x / radius;
    const north = -y / radius;
    const squared = east * east + north * north;
    if (squared > 1) return null;
    const front = Math.sqrt(Math.max(0, 1 - squared));
    const phi = latitude * RAD;
    const lat = Math.asin(Math.max(-1, Math.min(1, north * Math.cos(phi) + front * Math.sin(phi)))) / RAD;
    const lon = longitude + Math.atan2(east, front * Math.cos(phi) - north * Math.sin(phi)) / RAD;
    return [((lon + 180) % 360 + 360) % 360 - 180, lat];
  }

  function globeForward(longitude, latitude, radius, centerLongitude, centerLatitude) {
    const lambda = (longitude - centerLongitude) * RAD;
    const phi = latitude * RAD;
    const origin = centerLatitude * RAD;
    const front = Math.sin(origin) * Math.sin(phi) + Math.cos(origin) * Math.cos(phi) * Math.cos(lambda);
    if (front < -1e-10) return null;
    return [radius * Math.cos(phi) * Math.sin(lambda),
      -radius * (Math.cos(origin) * Math.sin(phi) - Math.sin(origin) * Math.cos(phi) * Math.cos(lambda))];
  }

  function globeCenterForAnchor(coordinate, x, y, radius, nearLatitude) {
    const east = x / radius, north = -y / radius;
    if (east * east + north * north >= 1) return null;
    const front = Math.sqrt(1 - east * east - north * north);
    const ratio = Math.sin(coordinate[1] * RAD) / Math.sqrt(1 - east * east);
    if (Math.abs(ratio) > 1) return null;
    const angle = Math.asin(ratio), offset = Math.atan2(north, front);
    const candidates = [angle - offset, Math.PI - angle - offset]
      .map((value) => ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI)
      .filter((value) => Math.abs(value) <= Math.PI / 2 + 1e-10);
    if (!candidates.length) return null;
    candidates.sort((a, b) => Math.abs(a / RAD - nearLatitude) - Math.abs(b / RAD - nearLatitude));
    const latitude = candidates[0];
    const longitude = coordinate[0] - Math.atan2(east, front * Math.cos(latitude) - north * Math.sin(latitude)) / RAD;
    return [((longitude + 180) % 360 + 360) % 360 - 180, latitude / RAD];
  }

  function smallPolygons(collection) {
    return { type: "FeatureCollection", features: collection.map((feature) => {
      const geometry = feature.geometry;
      const normalize = (rings) => d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI
        ? rings.map((ring) => ring.slice().reverse()) : rings;
      return { ...feature, geometry: { ...geometry, coordinates: geometry.type === "Polygon"
        ? normalize(geometry.coordinates) : geometry.coordinates.map(normalize) } };
    }) };
  }

  class PlantGlobe {
    constructor(base, raster, vectors) {
      this.base = base;
      this.raster = raster;
      this.vectors = vectors;
      this.context = base.getContext("2d");
      this.sources = new Map();
      this.slots = {};
      this.frame = 0;
      this.space = spaceScene();
      this.graticule = d3.geoGraticule().step([30, 20])();
      this.equator = { type: "LineString", coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, 0]) };
      this.gl = raster.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
      if (this.gl) {
        try { this.initGL(); } catch (error) { this.gl = null; }
      }
      if (!this.gl) {
        // A canvas with a WebGL context cannot acquire a 2D context.
        const replacement = raster.cloneNode();
        raster.replaceWith(replacement);
        this.raster = replacement;
        this.cpu = replacement.getContext("2d");
      }
      this.raster.dataset.renderer = this.gl ? "webgl" : "canvas";
      this.raster.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        const replacement = this.raster.cloneNode();
        this.raster.replaceWith(replacement);
        this.raster = replacement;
        this.gl = null;
        this.cpu = replacement.getContext("2d");
        this.raster.dataset.renderer = "canvas";
        this.request();
      });
    }

    initGL() {
      const gl = this.gl;
      if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < 4096) throw new Error("globe texture size unavailable");
      const vertex = "attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}";
      const fragment = `precision highp float;
        uniform vec2 viewport;
        uniform float radius, longitude, latitude, opacity, weatherVisible, climateVisible, baseMapOpacity, terrainOpacity;
        uniform vec4 japanBox, baseMapBox, terrainBox;
        uniform sampler2D worldImage, japanImage, japanMask, climateImage, baseMapImage, terrainImage;
        const float PI=3.141592653589793;
        vec4 over(vec4 top, vec4 bottom) {
          return vec4(top.rgb*top.a + bottom.rgb*(1.-top.a), top.a+bottom.a*(1.-top.a));
        }
        vec4 atlas(sampler2D image, vec2 uv, vec4 box, float strength) {
          vec2 local=vec2(mod(uv.x*1000.-box.x+1000.,1000.)/box.z,(uv.y*1000.-box.y)/box.w);
          if(strength<=0.||any(lessThan(local,vec2(0.)))||any(greaterThan(local,vec2(1.))))return vec4(0.);
          vec4 pixel=texture2D(image,local);pixel.a*=strength;return pixel;
        }
        void main(){
          vec2 p=(gl_FragCoord.xy-viewport*.5)/radius;
          float r2=dot(p,p); if(r2>1.){gl_FragColor=vec4(0.);return;}
          float z=sqrt(max(0.,1.-r2));
          float lat=asin(clamp(p.y*cos(latitude)+z*sin(latitude),-1.,1.));
          float lon=longitude+atan(p.x,z*cos(latitude)-p.y*sin(latitude));
          if(abs(lat)>1.48442223){gl_FragColor=vec4(0.);return;}
          vec2 uv=vec2(fract(lon/(2.*PI)+.5),.5-log(tan(PI*.25+lat*.5))/(2.*PI));
          vec4 color=over(atlas(baseMapImage,uv,baseMapBox,baseMapOpacity),vec4(0.));
          color=over(atlas(terrainImage,uv,terrainBox,terrainOpacity),color);
          if(weatherVisible>.5){
            vec4 weather=over(texture2D(worldImage,uv),vec4(0.));
            vec2 local=(uv*1000.-japanBox.xy)/japanBox.zw;
            if(all(greaterThanEqual(local,vec2(0.)))&&all(lessThanEqual(local,vec2(1.)))){
              vec4 mask=texture2D(japanMask,local);
              weather*=1.-mask.a;
              weather=over(texture2D(japanImage,local),weather);
            }
            weather*=opacity;
            color=weather+color*(1.-weather.a);
          }
          if(climateVisible>.5){vec4 climate=texture2D(climateImage,uv);climate.a*=.66;color=over(climate,color);}
          gl_FragColor=vec4(color.a>0.?color.rgb/color.a:vec3(0.),color.a);
        }`;
      const shader = (type, source) => {
        const object = gl.createShader(type);
        gl.shaderSource(object, source); gl.compileShader(object);
        if (!gl.getShaderParameter(object, gl.COMPILE_STATUS)) throw new Error("globe shader unavailable");
        return object;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error("globe program unavailable");
      gl.useProgram(this.program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, "position");
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = {};
      for (const name of ["viewport", "radius", "longitude", "latitude", "opacity", "weatherVisible", "climateVisible", "japanBox", "baseMapBox", "terrainBox", "baseMapOpacity", "terrainOpacity"])
        this.uniforms[name] = gl.getUniformLocation(this.program, name);
      this.textures = ["world", "japan", "mask", "climate", "baseMap", "terrain"].map((key, index) => {
        gl.activeTexture(gl.TEXTURE0 + index);
        const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, index >= 4 ? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, index >= 4 ? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        gl.uniform1i(gl.getUniformLocation(this.program, ["worldImage", "japanImage", "japanMask", "climateImage", "baseMapImage", "terrainImage"][index]), index);
        return { key, texture, uploaded: null };
      });
    }

    setImage(key, image) {
      this.slots[key] = { image };
      this.request();
    }

    setSource(key, url) {
      if (this.slots[key]?.url === url) return;
      const slot = { url, image: null };
      this.slots[key] = slot;
      if (!url) { this.request(); return; }
      const cached = this.sources.get(url);
      if (cached) { slot.image = cached; this.request(); return; }
      const image = new Image();
      image.onload = () => {
        if (!url.startsWith("data:")) {
          this.sources.set(url, image);
          if (this.sources.size > (this.gl ? 16 : 4)) this.sources.delete(this.sources.keys().next().value);
        }
        if (this.slots[key] !== slot) return;
        slot.image = image; this.request();
      };
      image.onerror = () => { if (this.slots[key] === slot) this.request(); };
      image.src = url;
      this.request();
    }

    update(options) {
      this.options = options;
      if (options.countries !== this.countrySource) {
        this.countrySource = options.countries;
        this.countries = smallPolygons(options.countries);
      }
      this.request();
    }

    request() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => { this.frame = 0; if (this.options?.visible) this.render(); });
    }

    projection() {
      const { width, height, zoom, longitude, latitude } = this.options;
      return d3.geoOrthographic().translate([width / 2, height / 2])
        .scale(Math.min(width, height) * .46 * zoom).rotate([-longitude, -latitude])
        .clipAngle(90).clipExtent([[0, 0], [width, height]]).precision(.3);
    }

    point(lon, lat) {
      const { width, height, zoom, longitude, latitude } = this.options;
      const p = globeForward(lon, lat, Math.min(width, height) * .46 * zoom, longitude, latitude);
      return p ? [p[0] + width / 2, p[1] + height / 2] : null;
    }

    invert(x, y) {
      const { width, height, zoom, longitude, latitude } = this.options;
      return globeInverse(x - width / 2, y - height / 2, Math.min(width, height) * .46 * zoom, longitude, latitude);
    }

    path(geometry) { return d3.geoPath(this.projection())(geometry) || ""; }

    mercatorBounds(project) {
      const { width, height } = this.options;
      const points = [];
      for (let row = 0; row <= 8; row++) for (let column = 0; column <= 8; column++) {
        const coordinate = this.invert(width * column / 8, height * row / 8);
        if (coordinate && Math.abs(coordinate[1]) <= MAX_LAT) points.push(project(...coordinate));
      }
      if (!points.length) return null;
      const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), .001) * 1.04;
      return { x: (Math.min(...xs) + Math.max(...xs) - size) / 2,
        y: (Math.min(...ys) + Math.max(...ys) - size) / 2, width: size, height: size };
    }

    render() {
      const o = this.options;
      const density = Math.min(window.devicePixelRatio || 1, this.gl ? 2 : 1);
      const width = Math.round(o.width * density), height = Math.round(o.height * density);
      for (const canvas of [this.base, this.raster]) {
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      }
      const context = this.context;
      context.setTransform(density, 0, 0, density, 0, 0);
      context.clearRect(0, 0, o.width, o.height);
      drawSpace(context, o, this.space);
      const projection = this.projection();
      const path = d3.geoPath(projection, context);
      context.beginPath(); path({ type: "Sphere" }); context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ocean").trim(); context.fill();
      context.globalAlpha = o.mapOpacity ?? 1;
      context.beginPath(); path(this.countries); context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--land").trim(); context.fill();
      context.globalAlpha = 1;
      if (this.gl) this.renderGL(width, height, density); else this.renderCPU(width, height, density);
      const vectorPath = d3.geoPath(projection);
      const svg = (className, geometry) => {
        const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
        node.setAttribute("d", vectorPath(geometry) || ""); node.setAttribute("class", className);
        return node;
      };
      const nodes = [svg("graticule", this.graticule), svg("country-border", this.countries)];
      for (const node of nodes) node.style.opacity = String(o.mapOpacity ?? 1);
      if (o.regions) nodes.push(PlantGeography.regionPaths(o.regions, vectorPath));
      if (o.equatorVisible) nodes.push(svg("equator-halo", this.equator), svg("equator-line", this.equator));
      if (o.outline) {
        const geometry = { type: "MultiLineString", coordinates: o.outline };
        nodes.push(svg("plant-origin-halo", geometry), svg("plant-origin-outline", geometry));
      }
      this.vectors.replaceChildren(...nodes);
      this.raster.dataset.ready = String(Boolean(this.slots.world?.image));
    }

    renderGL(width, height, density) {
      const gl = this.gl, o = this.options, u = this.uniforms;
      gl.viewport(0, 0, width, height); gl.useProgram(this.program);
      gl.uniform2f(u.viewport, width, height);
      gl.uniform1f(u.radius, Math.min(o.width, o.height) * .46 * o.zoom * density);
      gl.uniform1f(u.longitude, o.longitude * RAD); gl.uniform1f(u.latitude, o.latitude * RAD);
      gl.uniform1f(u.opacity, o.opacity); gl.uniform1f(u.weatherVisible, o.weatherVisible ? 1 : 0);
      gl.uniform1f(u.climateVisible, o.climateVisible ? 1 : 0);
      const box = o.japanBox || { x: 0, y: 0, width: 1000, height: 1000 };
      gl.uniform4f(u.japanBox, box.x, box.y, box.width, box.height);
      for (const key of ["baseMap", "terrain"]) {
        const atlasBox = o[`${key}Box`] || { x: 0, y: 0, width: 1000, height: 1000 };
        gl.uniform4f(u[`${key}Box`], atlasBox.x, atlasBox.y, atlasBox.width, atlasBox.height);
        gl.uniform1f(u[`${key}Opacity`], o[`${key}Opacity`] || 0);
      }
      this.textures.forEach((entry, index) => {
        const image = this.slots[entry.key]?.image || null;
        gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        if (entry.uploaded !== image) {
          if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
          entry.uploaded = image;
        }
      });
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    pixels(key) {
      const image = this.slots[key]?.image;
      if (!image) return null;
      if (!image.globePixels) {
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0);
        image.globePixels = { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
      }
      return image.globePixels;
    }

    renderCPU(width, height, density) {
      const o = this.options, output = this.cpu.createImageData(width, height), data = output.data;
      const radius = Math.min(o.width, o.height) * .46 * o.zoom * density;
      const sin = Math.sin(o.latitude * RAD), cos = Math.cos(o.latitude * RAD), longitude = o.longitude * RAD;
      const world = this.pixels("world"), japan = this.pixels("japan"), mask = this.pixels("mask"), climate = this.pixels("climate");
      const box = o.japanBox || { x: 0, y: 0, width: 1000, height: 1000 };
      const baseMap = this.pixels("baseMap"), terrain = this.pixels("terrain");
      const sample = (source, u, v) => source && u >= 0 && u <= 1 && v >= 0 && v <= 1
        ? (Math.min(source.height - 1, Math.floor(v * source.height)) * source.width
          + Math.min(source.width - 1, Math.floor(u * source.width))) * 4 : -1;
      for (let y = 0; y < height; y++) {
        const north = (height / 2 - y - .5) / radius;
        for (let x = 0; x < width; x++) {
          const east = (x + .5 - width / 2) / radius, squared = east * east + north * north;
          if (squared > 1) continue;
          const front = Math.sqrt(1 - squared), lat = Math.asin(north * cos + front * sin);
          if (Math.abs(lat / RAD) > MAX_LAT) continue;
          const lon = longitude + Math.atan2(east, front * cos - north * sin);
          const u = ((lon / (2 * Math.PI) + .5) % 1 + 1) % 1;
          const v = .5 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI);
          const offset = (y * width + x) * 4;
          let red = 0, green = 0, blue = 0, alpha = 0;
          const blend = (source, index, opacity) => {
            if (index < 0) return;
            const a = source.data[index + 3] / 255 * opacity;
            red = source.data[index] * a + red * (1 - a);
            green = source.data[index + 1] * a + green * (1 - a);
            blue = source.data[index + 2] * a + blue * (1 - a); alpha = a + alpha * (1 - a);
          };
          for (const [key, source] of [["baseMap", baseMap], ["terrain", terrain]]) {
            const b = o[`${key}Box`] || { x: 0, y: 0, width: 1000, height: 1000 };
            blend(source, sample(source, ((u * 1000 - b.x + 1000) % 1000) / b.width,
              (v * 1000 - b.y) / b.height), o[`${key}Opacity`] || 0);
          }
          if (o.weatherVisible) {
            const under = [red, green, blue, alpha]; red = green = blue = alpha = 0;
            blend(world, sample(world, u, v), 1);
            const ju = (u * 1000 - box.x) / box.width, jv = (v * 1000 - box.y) / box.height;
            const m = sample(mask, ju, jv), keep = m < 0 ? 1 : 1 - mask.data[m + 3] / 255;
            red *= keep; green *= keep; blue *= keep; alpha *= keep;
            blend(japan, sample(japan, ju, jv), 1);
            red *= o.opacity; green *= o.opacity; blue *= o.opacity; alpha *= o.opacity;
            red += under[0] * (1 - alpha); green += under[1] * (1 - alpha); blue += under[2] * (1 - alpha);
            alpha += under[3] * (1 - alpha);
          }
          if (o.climateVisible) blend(climate, sample(climate, u, v), .66);
          if (alpha) { data[offset] = red / alpha; data[offset + 1] = green / alpha; data[offset + 2] = blue / alpha; data[offset + 3] = alpha * 255; }
        }
      }
      this.cpu.putImageData(output, 0, 0);
    }
  }
  window.PlantGlobe = PlantGlobe;
  // Export pure coordinate helpers for the same-source contract test.
  PlantGlobe.coordinates = { globeForward, globeInverse, globeCenterForAnchor };
  PlantGlobe.space = { scene: spaceScene, point: spacePoint, draw: drawSpace };
})();
