/* Orthographic display of the same Mercator source textures; no climate values are recalculated. */
(() => {
  "use strict";
  const RAD = Math.PI / 180;
  const MAX_LAT = 85.05112878;

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
      this.graticule = d3.geoGraticule().step([30, 20])();
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
        uniform float radius, longitude, latitude, opacity, weatherVisible, climateVisible;
        uniform vec4 japanBox;
        uniform sampler2D worldImage, japanImage, japanMask, climateImage;
        const float PI=3.141592653589793;
        vec4 over(vec4 top, vec4 bottom) {
          return vec4(top.rgb*top.a + bottom.rgb*(1.-top.a), top.a+bottom.a*(1.-top.a));
        }
        void main(){
          vec2 p=(gl_FragCoord.xy-viewport*.5)/radius;
          float r2=dot(p,p); if(r2>1.){gl_FragColor=vec4(0.);return;}
          float z=sqrt(max(0.,1.-r2));
          float lat=asin(clamp(p.y*cos(latitude)+z*sin(latitude),-1.,1.));
          float lon=longitude+atan(p.x,z*cos(latitude)-p.y*sin(latitude));
          if(abs(lat)>1.48442223){gl_FragColor=vec4(0.);return;}
          vec2 uv=vec2(fract(lon/(2.*PI)+.5),.5-log(tan(PI*.25+lat*.5))/(2.*PI));
          vec4 color=vec4(0.);
          if(weatherVisible>.5){
            vec4 world=texture2D(worldImage,uv);world.a*=opacity;color=over(world,color);
            vec2 local=(uv*1000.-japanBox.xy)/japanBox.zw;
            if(all(greaterThanEqual(local,vec2(0.)))&&all(lessThanEqual(local,vec2(1.)))){
              vec4 mask=texture2D(japanMask,local);
              color=over(mask,color);
              vec4 japan=texture2D(japanImage,local);japan.a*=opacity;color=over(japan,color);
            }
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
      for (const name of ["viewport", "radius", "longitude", "latitude", "opacity", "weatherVisible", "climateVisible", "japanBox"])
        this.uniforms[name] = gl.getUniformLocation(this.program, name);
      this.textures = ["world", "japan", "mask", "climate"].map((key, index) => {
        gl.activeTexture(gl.TEXTURE0 + index);
        const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        gl.uniform1i(gl.getUniformLocation(this.program, ["worldImage", "japanImage", "japanMask", "climateImage"][index]), index);
        return { key, texture, uploaded: null };
      });
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
      const projection = this.projection();
      const path = d3.geoPath(projection, context);
      context.beginPath(); path({ type: "Sphere" }); context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ocean").trim(); context.fill();
      context.beginPath(); path(this.countries); context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--land").trim(); context.fill();
      if (this.gl) this.renderGL(width, height, density); else this.renderCPU(width, height, density);
      const vectorPath = d3.geoPath(projection);
      const svg = (className, geometry) => {
        const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
        node.setAttribute("d", vectorPath(geometry) || ""); node.setAttribute("class", className);
        return node;
      };
      const nodes = [svg("graticule", this.graticule), svg("country-border", this.countries)];
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
          if (o.weatherVisible) {
            blend(world, sample(world, u, v), o.opacity);
            const ju = (u * 1000 - box.x) / box.width, jv = (v * 1000 - box.y) / box.height;
            blend(mask, sample(mask, ju, jv), 1); blend(japan, sample(japan, ju, jv), o.opacity);
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
})();
