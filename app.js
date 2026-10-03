(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAP_SIZE = 1000;
  const INITIAL_MAP_VIEW = { longitude: 146, latitude: 34, maxZoom: 1.5625 };
  const MAX_LAT = 85.05112878;
  const METEOROLOGY_LAT_STEP = 0.5;
  const METEOROLOGY_LON_STEP = 0.625;
  const POWER_CLIMATOLOGY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/climatology/point";
  const POWER_DAILY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point";
  const PARAMETERS = ["T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M"];
  const DAILY_PARAMETERS = ["T2M_MAX", "T2M_MIN", "ALLSKY_SFC_SW_DWN", "RH2M"];
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const WEATHER_LAYERS = {
    temperature: {
      name: "平均気温",
      unit: "℃",
      grid: "0.5°×0.625°格子",
      stops: [[-50, "#21134f"], [-40, "#2c2b83"], [-30, "#3154b4"], [-20, "#377dcc"], [-10, "#63add8"], [0, "#b8dfe4"], [10, "#eef1c2"], [20, "#ffd27a"], [30, "#ed6c3b"], [40, "#b51f4b"], [50, "#59052c"]],
      ticks: [-50, -30, -10, 10, 30, 50],
    },
    precipitation: {
      name: "降水量",
      grid: "0.5°×0.625°格子",
      monthlyUnit: "mm/月",
      annualUnit: "mm/年",
      monthlyStops: [[0, "#fff7ec"], [25, "#e0f3db"], [50, "#ccebc5"], [100, "#a8ddb5"], [200, "#7bccc4"], [300, "#43a2ca"], [500, "#0868ac"], [800, "#084081"]],
      annualStops: [[0, "#fff7ec"], [250, "#e0f3db"], [500, "#ccebc5"], [1000, "#a8ddb5"], [1500, "#7bccc4"], [2500, "#43a2ca"], [4000, "#0868ac"], [6000, "#084081"]],
      monthlyTicks: [0, 100, 300, 500, 800],
      annualTicks: [0, 1000, 2500, 4000, 6000],
    },
    humidity: {
      name: "相対湿度",
      unit: "%",
      grid: "0.5°×0.625°格子",
      stops: [[0, "#7a4f28"], [20, "#bc8957"], [40, "#e3c89e"], [60, "#dce9c6"], [70, "#a9d8c3"], [80, "#58b5a7"], [90, "#257d89"], [100, "#174f70"]],
      ticks: [0, 40, 60, 80, 100],
    },
    solar: {
      name: "日射量",
      unit: "MJ/㎡/日",
      grid: "1°×1°格子",
      stops: [[0, "#28306f"], [5, "#3769a9"], [10, "#4ca5c2"], [15, "#8bcf9c"], [20, "#eee879"], [25, "#f4a64f"], [30, "#cc4b3d"], [35, "#761d39"]],
      ticks: [0, 10, 20, 30, 35],
    },
  };
  const AVERAGE_DAYS_PER_MONTH = [31, 28 + 8 / 30, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const AVERAGE_DAYS_PER_YEAR = AVERAGE_DAYS_PER_MONTH.reduce((sum, days) => sum + days, 0);
  const FILL_VALUE = -999;
  const JAPAN_MISSING = -32768;
  const JAPAN_GRID_ROOT = "./data/japan-1km";
  const KOPPEN_CLASSES = [
    ["Af", "熱帯雨林"], ["Am", "熱帯モンスーン"], ["Aw", "サバナ"],
    ["BWh", "高温砂漠"], ["BWk", "低温砂漠"], ["BSh", "高温ステップ"], ["BSk", "低温ステップ"],
    ["Csa", "高温夏季乾燥"], ["Csb", "温暖夏季乾燥"], ["Csc", "冷涼夏季乾燥"],
    ["Cwa", "高温冬季乾燥"], ["Cwb", "温暖冬季乾燥"], ["Cwc", "冷涼冬季乾燥"],
    ["Cfa", "高温・乾季なし"], ["Cfb", "温暖・乾季なし"], ["Cfc", "冷涼・乾季なし"],
    ["Dsa", "高温夏季乾燥"], ["Dsb", "温暖夏季乾燥"], ["Dsc", "冷涼夏季乾燥"], ["Dsd", "厳冬・夏季乾燥"],
    ["Dwa", "高温冬季乾燥"], ["Dwb", "温暖冬季乾燥"], ["Dwc", "冷涼冬季乾燥"], ["Dwd", "厳冬・冬季乾燥"],
    ["Dfa", "高温・乾季なし"], ["Dfb", "温暖・乾季なし"], ["Dfc", "冷涼・乾季なし"], ["Dfd", "厳冬・乾季なし"],
    ["ET", "ツンドラ"], ["EF", "氷雪"],
  ];
  const elements = {
    map: document.getElementById("worldMap"),
    mapWrap: document.querySelector(".map-wrap"),
    globeBase: document.getElementById("globeBase"),
    globeRaster: document.getElementById("globeRaster"),
    globeVectors: document.getElementById("globeVectors"),
    region: document.getElementById("regionLayer"),
    geographyLabels: document.getElementById("geographyLabels"),
    geographyButtons: document.querySelectorAll("[data-geography]"),
    geographyStatus: document.getElementById("geographyStatus"),
    geographyControls: document.getElementById("geographyControls"),
    geographyPanelToggle: document.getElementById("toggleGeographyPanel"),
    equator: document.getElementById("equatorLayer"),
    equatorToggle: document.getElementById("toggleEquator"),
    projectionBadge: document.getElementById("projectionBadge"),
    projectionButtons: document.querySelectorAll("[data-projection]"),
    focusLocationA: document.getElementById("focusLocationA"),
    focusLocationB: document.getElementById("focusLocationB"),
    graticule: document.getElementById("graticuleLayer"),
    land: document.getElementById("landLayer"),
    border: document.getElementById("borderLayer"),
    plantOrigin: document.getElementById("plantOriginLayer"),
    plantBrowser: document.getElementById("plantBrowser"),
    plantCatalogCount: document.getElementById("plantCatalogCount"),
    plantCategory: document.getElementById("plantCategory"),
    plantSearch: document.getElementById("plantSearch"),
    plantResultCount: document.getElementById("plantResultCount"),
    plantResults: document.getElementById("plantResults"),
    selectedPlant: document.getElementById("selectedPlant"),
    selectedPlantName: document.getElementById("selectedPlantName"),
    selectedPlantScientific: document.getElementById("selectedPlantScientific"),
    togglePlantOrigin: document.getElementById("togglePlantOrigin"),
    plantReferenceStars: document.getElementById("plantReferenceStars"),
    plantReferenceReason: document.getElementById("plantReferenceReason"),
    plantTaxonNote: document.getElementById("plantTaxonNote"),
    plantSource: document.getElementById("plantSource"),
    plantReferenceSource: document.getElementById("plantReferenceSource"),
    plantOriginLabel: document.getElementById("plantOriginLabel"),
    plantChoiceState: document.getElementById("plantChoiceState"),
    plantOriginInfo: document.getElementById("plantOriginInfo"),
    focusPlantOrigin: document.getElementById("focusPlantOrigin"),
    plantMapBadge: document.getElementById("plantMapBadge"),
    mapDescription: document.getElementById("mapDescription"),
    weather: document.getElementById("weatherLayer"),
    weatherImage: document.getElementById("weatherImage"),
    japanOcclusion: document.getElementById("japanOcclusion"),
    japanImage: document.getElementById("japanImage"),
    climate: document.getElementById("climateLayer"),
    climateImage: document.getElementById("climateImage"),
    climateToggle: document.getElementById("climateToggle"),
    climateLegend: document.getElementById("climateLegend"),
    climateLegendItems: document.getElementById("climateLegendItems"),
    selection: document.getElementById("selectionLayer"),
    selectionState: document.getElementById("selectionState"),
    requestStatus: document.getElementById("requestStatus"),
    locationSummary: document.getElementById("locationSummary"),
    annualTemperature: document.getElementById("annualTemperature"),
    annualTemperatureNote: document.getElementById("annualTemperatureNote"),
    annualPrecipitation: document.getElementById("annualPrecipitation"),
    annualPrecipitationNote: document.getElementById("annualPrecipitationNote"),
    annualSolar: document.getElementById("annualSolar"),
    annualSolarNote: document.getElementById("annualSolarNote"),
    annualHumidity: document.getElementById("annualHumidity"),
    annualHumidityNote: document.getElementById("annualHumidityNote"),
    climateHeadline: document.getElementById("climateHeadline"),
    overviewLegend: document.getElementById("overviewLegend"),
    overviewReadout: document.getElementById("overviewReadout"),
    overviewMonthAxis: document.getElementById("overviewMonthAxis"),
    monthlyBody: document.getElementById("monthlyBody"),
    monthlyHeading: document.getElementById("monthlyHeading"),
    temperatureChart: document.getElementById("temperatureChart"),
    precipitationChart: document.getElementById("precipitationChart"),
    solarChart: document.getElementById("solarChart"),
    humidityChart: document.getElementById("humidityChart"),
    resultPanel: document.getElementById("resultPanel"),
    resultHeading: document.querySelector(".result-heading"),
    resultTitle: document.getElementById("resultHeading"),
    setReference: document.getElementById("setReference"),
    toggleComparison: document.getElementById("toggleComparison"),
    referenceShortLabel: document.getElementById("referenceShortLabel"),
    clearReference: document.getElementById("clearReference"),
    swapLocations: document.getElementById("swapLocations"),
    toggleSeasonShift: document.getElementById("toggleSeasonShift"),
    seasonShiftStatus: document.getElementById("seasonShiftStatus"),
    referenceCard: document.getElementById("referenceCard"),
    referenceRole: document.getElementById("referenceRole"),
    referenceState: document.getElementById("referenceState"),
    referenceActions: document.getElementById("referenceActions"),
    currentActions: document.getElementById("currentActions"),
    pickComparison: document.getElementById("pickComparison"),
    mapGuide: document.getElementById("mapGuide"),
    mapSettings: document.getElementById("mapSettings"),
    referenceLocation: document.getElementById("referenceLocation"),
    referenceDetail: document.getElementById("referenceDetail"),
    currentCard: document.getElementById("currentCard"),
    currentLocation: document.getElementById("currentLocation"),
    currentDetail: document.getElementById("currentDetail"),
    comparisonKeys: [...document.querySelectorAll("[data-comparison-key]")],
    resultTabs: [...document.querySelectorAll("[data-result-tab]")],
    resultPages: [...document.querySelectorAll("[data-result-page]")],
    openResults: document.getElementById("openResults"),
    closeResults: document.getElementById("closeResults"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    resetView: document.getElementById("resetView"),
    layerPanel: document.getElementById("layerPanel"),
    toggleLayerPanel: document.getElementById("toggleLayerPanel"),
    layerButtons: document.querySelectorAll("[data-weather-layer]"),
    layerPeriod: document.getElementById("layerPeriod"),
    activeLayerPeriod: document.getElementById("activeLayerPeriod"),
    activeLayerName: document.getElementById("activeLayerName"),
    activeLayerMeta: document.getElementById("activeLayerMeta"),
    layerStatus: document.getElementById("layerStatus"),
    weatherLegendTitle: document.getElementById("weatherLegendTitle"),
    weatherLegendUnit: document.getElementById("weatherLegendUnit"),
    weatherLegendBar: document.getElementById("weatherLegendBar"),
    weatherLegendTicks: document.getElementById("weatherLegendTicks"),
    weatherLayerToggle: document.getElementById("weatherLayerToggle"),
    weatherLayerOpacity: document.getElementById("weatherLayerOpacity"),
    weatherLayerOpacityValue: document.getElementById("weatherLayerOpacityValue"),
    mapLayerLabel: document.getElementById("mapLayerLabel"),
  };

  const state = {
    zoom: 1,
    projection: "flat",
    globeLongitude: INITIAL_MAP_VIEW.longitude,
    globeLatitude: INITIAL_MAP_VIEW.latitude,
    globeUsed: false,
    equatorVisible: true,
    pointers: new Map(),
    pinch: null,
    japanBox: { x: 0, y: 0, width: 1000, height: 1000 },
    centerX: MAP_SIZE / 2,
    centerY: MAP_SIZE / 2,
    requestSerial: 0,
    controller: null,
    cache: new Map(),
    selectedCell: null,
    drag: null,
    countries: [],
    places: [],
    geographyStatus: "loading",
    geography: null,
    geographyVisible: { countries: false, capitals: false, regions: false },
    plantVisible: false,
    plantOriginBounds: null,
    plants: [],
    plantOutlines: null,
    selectedPlant: null,
    currentRecord: null,
    referenceRecord: null,
    comparisonEnabled: true,
    seasonShiftEnabled: false,
    climateVisible: false,
    weatherLayer: "temperature",
    weatherPeriod: "annual",
    weatherVisible: true,
    resultPanelPosition: null,
    resultPanelScale: 1,
    resultPanelPage: "overview",
    resultPanelDragging: false,
    resultPanelDragStart: null,
    resultPanelResizeStart: null,
    selectionSerial: 0,
    japanCatalog: null,
    japanMapCache: new Map(),
    japanHumidityMapCache: new Map(),
    japanDailyCache: new Map(),
    japanMapSerial: 0,
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function wrapWorldX(value) {
    return ((value % MAP_SIZE) + MAP_SIZE) % MAP_SIZE;
  }

  const globe = new PlantGlobe(elements.globeBase, elements.globeRaster, elements.globeVectors);

  function syncGlobe() {
    const bounds = elements.map.getBoundingClientRect();
    const outline = state.plantVisible && state.selectedPlant && state.plantOutlines
      ? state.plantOutlines.outlines[state.plantOutlines.plantKeys[state.selectedPlant.id]]?.rings : null;
    globe.update({ visible: state.projection === "globe", width: bounds.width, height: bounds.height,
      zoom: state.zoom, longitude: state.globeLongitude, latitude: state.globeLatitude,
      countries: state.countries, outline, weatherVisible: state.weatherVisible,
      regions: state.geographyVisible.regions ? state.geography?.regions : null,
      equatorVisible: state.equatorVisible,
      climateVisible: state.climateVisible, opacity: Number(elements.weatherLayerOpacity.value) / 100,
      japanBox: state.japanBox });
  }

  function setProjection(mode) {
    if (!["flat", "globe"].includes(mode) || mode === state.projection) return;
    if (mode === "globe") [state.globeLongitude, state.globeLatitude] = unproject(state.centerX, state.centerY);
    else [state.centerX, state.centerY] = project(state.globeLongitude, state.globeLatitude);
    if (mode === "globe" && !state.globeUsed && state.zoom < 2) state.zoom = 1;
    if (mode === "globe") state.globeUsed = true;
    state.projection = mode;
    for (const id of state.pointers.keys()) if (elements.map.hasPointerCapture(id)) elements.map.releasePointerCapture(id);
    state.pointers.clear();
    state.drag = null;
    state.pinch = null;
    elements.map.classList.remove("is-dragging");
    elements.mapWrap.classList.toggle("globe-mode", mode === "globe");
    for (const node of [globe.base, globe.raster, elements.globeVectors]) node.hidden = mode !== "globe";
    elements.globeVectors.toggleAttribute("hidden", mode !== "globe");
    elements.projectionButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.projection === mode)));
    elements.projectionBadge.textContent = mode === "globe"
      ? "地球儀｜ドラッグで回転｜緯度±85.05°より極側はデータなし"
      : "Webメルカトル｜表示緯度 ±85.05°｜東西連続";
    setView(state.zoom);
  }

  function focusLocation(record) {
    if (!record?.cell) return;
    if (state.projection === "globe") {
      state.globeLongitude = record.cell.longitude;
      state.globeLatitude = record.cell.latitude;
      setView(state.zoom);
    } else setView(state.zoom, ...project(record.cell.longitude, record.cell.latitude));
  }

  function project(longitude, latitude) {
    const safeLatitude = clamp(latitude, -MAX_LAT, MAX_LAT);
    const x = ((longitude + 180) / 360) * MAP_SIZE;
    const sine = Math.sin((safeLatitude * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * MAP_SIZE;
    return [x, y];
  }

  function unproject(x, y) {
    const longitude = (wrapWorldX(x) / MAP_SIZE) * 360 - 180;
    const mercator = Math.PI - (2 * Math.PI * y) / MAP_SIZE;
    const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
    return [longitude, clamp(latitude, -MAX_LAT, MAX_LAT)];
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function setStatus(message, kind = "idle") {
    elements.requestStatus.textContent = message;
    elements.requestStatus.dataset.state = kind;
    state.dataStatus = { message, kind };
    updateComparisonControls();
  }

  function setView(zoom, centerX = state.centerX, centerY = state.centerY) {
    state.zoom = clamp(zoom, 1, 2048);
    const size = MAP_SIZE / state.zoom;
    if (state.projection === "globe") {
      if (arguments.length > 1) [state.globeLongitude, state.globeLatitude] = unproject(centerX, centerY);
      [state.centerX, state.centerY] = project(state.globeLongitude, state.globeLatitude);
      const bounds = elements.map.getBoundingClientRect();
      elements.map.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
      syncGlobe();
    } else {
      state.centerX = wrapWorldX(centerX);
      state.centerY = clamp(centerY, size / 2, MAP_SIZE - size / 2);
      elements.map.setAttribute("viewBox", `${state.centerX - size / 2} ${state.centerY - size / 2} ${size} ${size}`);
    }
    elements.zoomOut.disabled = state.zoom <= 1;
    elements.zoomIn.disabled = state.zoom >= 2048;
    drawSelections();
    drawGeographyLabels();
    if (state.projection === "globe" && state.zoom >= 32) {
      clearTimeout(state.japanViewTimer);
      // Invalidate an older asynchronous viewport before the next tile render.
      state.japanMapSerial++;
      state.japanViewTimer = setTimeout(updateJapanMap, 120);
    } else updateJapanMap();
  }

  function drawGeographyLabels() {
    if (!state.geography) return;
    const bounds = elements.map.getBoundingClientRect();
    const size = MAP_SIZE / state.zoom, scale = Math.min(bounds.width, bounds.height) / size;
    const left = state.centerX - size / 2, top = state.centerY - size / 2;
    const dx = (bounds.width - size * scale) / 2, dy = (bounds.height - size * scale) / 2;
    const point = state.projection === "globe" ? (lon, lat) => {
      const p = globe.point(lon, lat); return p ? [p] : [];
    } : (lon, lat) => {
      const [x, y] = project(lon, lat);
      return [-MAP_SIZE, 0, MAP_SIZE].map((shift) => [(x + shift - left) * scale + dx, (y - top) * scale + dy]);
    };
    elements.geographyLabels.setAttribute("transform", state.projection === "globe" ? ""
      : `translate(${left - dx / scale} ${top - dy / scale}) scale(${1 / scale})`);
    const center = state.projection === "globe" ? [state.globeLongitude, state.globeLatitude] : unproject(state.centerX, state.centerY);
    const centerCountry = state.geographyVisible.regions && state.zoom >= 4 ? countryAt(...center) : null;
    const centerRegion = centerCountry ? state.geography.countries.find((c) => c.code === centerCountry.properties.code)?.region : null;
    PlantGeography.drawLabels(elements.geographyLabels, state.geography,
      { width: bounds.width, height: bounds.height, point, visible: state.geographyVisible, zoom: state.zoom,
        centerRegion,
        disk: state.projection === "globe" ? { x: bounds.width / 2, y: bounds.height / 2,
          radius: Math.min(bounds.width, bounds.height) * .46 * state.zoom } : null });
  }

  async function loadGeographyLabels() {
    try {
      const response = await fetch("./data/geography.json", { credentials: "same-origin", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const metadata = await response.json();
      if (metadata.schema !== 1 || !metadata.countries || !Array.isArray(metadata.regions)) throw new Error("地名データ形式が不正です");
      state.geography = PlantGeography.prepare(state.countries, state.places, metadata);
      const projection = d3.geoMercator().translate([500, 500]).scale(MAP_SIZE / (2 * Math.PI))
        .clipExtent([[0, 0], [MAP_SIZE, MAP_SIZE]]);
      elements.region.replaceChildren(PlantGeography.regionPaths(state.geography.regions, d3.geoPath(projection)));
      elements.geographyButtons.forEach((button) => { button.disabled = false; });
      drawGeographyLabels(); syncGlobe();
    } catch (error) {
      elements.geographyStatus.textContent = "地名を読み込めませんでした。再読込してください。";
    }
  }

  function openResultPanel() {
    elements.resultPanel.hidden = false;
    elements.openResults.hidden = true;
    elements.openResults.setAttribute("aria-expanded", "true");
    elements.closeResults.setAttribute("aria-expanded", "true");
    setResultPanelPage(state.resultPanelPage);
    applyResultPanelScale();
    applyResultPanelPosition();
  }

  function closeResultPanel() {
    elements.resultPanel.hidden = true;
    elements.openResults.hidden = false;
    elements.openResults.setAttribute("aria-expanded", "false");
    elements.closeResults.setAttribute("aria-expanded", "false");
  }

  function setResultPanelPage(page, focus = false) {
    const selectedButton = elements.resultTabs.find((button) => button.dataset.resultTab === page);
    if (!selectedButton) return;
    state.resultPanelPage = page;
    elements.resultTabs.forEach((button) => {
      const selected = button === selectedButton;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    elements.resultPages.forEach((panel) => {
      panel.hidden = panel.dataset.resultPage !== page;
    });
    if (focus) selectedButton.focus();
  }

  function moveResultPanelTab(event) {
    const currentIndex = elements.resultTabs.indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % elements.resultTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + elements.resultTabs.length) % elements.resultTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = elements.resultTabs.length - 1;
    else return;
    event.preventDefault();
    setResultPanelPage(elements.resultTabs[nextIndex].dataset.resultTab, true);
  }

  function defaultResultPanelPosition() {
    const wrapRect = elements.mapWrap.getBoundingClientRect();
    const panelRect = elements.resultPanel.getBoundingClientRect();
    return {
      left: Math.max(12, wrapRect.width - panelRect.width - 14),
      top: Math.max(12, wrapRect.height - panelRect.height - 14),
    };
  }

  function clampResultPanelPosition(position) {
    const wrapRect = elements.mapWrap.getBoundingClientRect();
    const panelRect = elements.resultPanel.getBoundingClientRect();
    const headerRect = elements.resultHeading.getBoundingClientRect();
    const visibleLeft = Math.max(0, -wrapRect.left);
    const visibleRight = Math.min(wrapRect.width, document.documentElement.clientWidth - wrapRect.left);
    const visibleTop = Math.max(0, -wrapRect.top);
    const visibleBottom = Math.min(wrapRect.height, window.innerHeight - wrapRect.top);
    // Park most of the panel beyond either side or below the map, leaving
    // enough of its header inside the visible map to grab it again.
    const trailingActions = elements.swapLocations.hidden ? 0
      : headerRect.right - elements.swapLocations.getBoundingClientRect().left;
    const grabWidth = Math.min(Math.max(140, trailingActions + 64), panelRect.width,
      Math.max(0, visibleRight - visibleLeft - 16));
    const minimumTop = visibleTop + 8;
    return {
      left: clamp(position.left, visibleLeft + 8 + grabWidth - panelRect.width, visibleRight - grabWidth - 8),
      top: clamp(position.top, minimumTop, Math.max(minimumTop, visibleBottom - headerRect.height - 8)),
    };
  }

  function applyResultPanelScale() {
    elements.resultPanel.style.setProperty("--panel-scale", String(state.resultPanelScale));
  }

  function applyResultPanelPosition() {
    if (elements.resultPanel.hidden) return;
    const bounds = elements.mapWrap.getBoundingClientRect();
    const maxScale = Math.min(1.45, (bounds.width - 16) / elements.resultPanel.offsetWidth,
      (bounds.height - 16) / elements.resultPanel.offsetHeight);
    state.resultPanelScale = clamp(state.resultPanelScale, 0.65, Math.max(0.65, maxScale));
    applyResultPanelScale();
    if (!state.resultPanelPosition) state.resultPanelPosition = defaultResultPanelPosition();
    state.resultPanelPosition = clampResultPanelPosition(state.resultPanelPosition);
    elements.resultPanel.style.left = `${state.resultPanelPosition.left}px`;
    elements.resultPanel.style.top = `${state.resultPanelPosition.top}px`;
  }

  function beginResultPanelDrag(event) {
    if (event.button !== 0 || event.target.closest("button") || state.resultPanelResizeStart) return;
    const current = state.resultPanelPosition || defaultResultPanelPosition();
    state.resultPanelDragging = true;
    state.resultPanelDragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: current.left,
      top: current.top,
    };
    elements.resultHeading.setPointerCapture?.(event.pointerId);
    elements.resultPanel.classList.add("dragging");
    event.preventDefault();
  }

  function moveResultPanelDrag(event) {
    if (!state.resultPanelDragging || !state.resultPanelDragStart || state.resultPanelResizeStart) return;
    if (event.pointerId !== state.resultPanelDragStart.pointerId) return;
    state.resultPanelPosition = clampResultPanelPosition({
      left: state.resultPanelDragStart.left + event.clientX - state.resultPanelDragStart.x,
      top: state.resultPanelDragStart.top + event.clientY - state.resultPanelDragStart.y,
    });
    applyResultPanelPosition();
  }

  function endResultPanelDrag(event) {
    if (!state.resultPanelDragging || event.pointerId !== state.resultPanelDragStart?.pointerId) return;
    try { elements.resultHeading.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    state.resultPanelDragging = false;
    state.resultPanelDragStart = null;
    elements.resultPanel.classList.remove("dragging");
  }

  function beginResultPanelResize(event) {
    const handle = event.target.closest("[data-result-resize]");
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = elements.resultPanel.getBoundingClientRect();
    const position = state.resultPanelPosition || defaultResultPanelPosition();
    state.resultPanelResizeStart = {
      pointerId: event.pointerId,
      corner: handle.dataset.panelCorner || "se",
      x: event.clientX,
      y: event.clientY,
      scale: state.resultPanelScale,
      width: rect.width,
      height: rect.height,
      left: position.left,
      top: position.top,
    };
    handle.setPointerCapture?.(event.pointerId);
    elements.resultPanel.classList.add("resizing");
  }

  function moveResultPanelResize(event) {
    const start = state.resultPanelResizeStart;
    if (!start || event.pointerId !== start.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const widthRatio = (start.width + (start.corner.includes("w") ? -dx : dx)) / start.width;
    const heightRatio = (start.height + (start.corner.includes("n") ? -dy : dy)) / start.height;
    const ratio = Math.max(widthRatio, heightRatio);
    const baseWidth = start.width / start.scale;
    const baseHeight = start.height / start.scale;
    const wrapRect = elements.mapWrap.getBoundingClientRect();
    const maxScale = Math.max(0.65, Math.min(
      1.45,
      (wrapRect.width - 16) / baseWidth,
      (wrapRect.height - 16) / baseHeight,
    ));
    const scale = clamp(start.scale * ratio, 0.65, maxScale);
    const scaleRatio = scale / start.scale;
    state.resultPanelScale = scale;
    state.resultPanelPosition = {
      left: start.left + (start.corner.includes("w") ? start.width * (1 - scaleRatio) : 0),
      top: start.top + (start.corner.includes("n") ? start.height * (1 - scaleRatio) : 0),
    };
    applyResultPanelScale();
    applyResultPanelPosition();
  }

  function endResultPanelResize(event) {
    const start = state.resultPanelResizeStart;
    if (!start || event.pointerId !== start.pointerId) return;
    state.resultPanelResizeStart = null;
    elements.resultPanel.classList.remove("resizing");
  }

  function drawGraticule() {
    for (let longitude = -180; longitude <= 180; longitude += 30) {
      const [x] = project(longitude, 0);
      elements.graticule.append(svgElement("line", { x1: x, y1: 0, x2: x, y2: MAP_SIZE, class: "graticule" }));
    }
    for (let latitude = -80; latitude <= 80; latitude += 20) {
      const [, y] = project(0, latitude);
      elements.graticule.append(svgElement("line", { x1: 0, y1: y, x2: MAP_SIZE, y2: y, class: "graticule" }));
    }
  }

  function drawClimateLegend() {
    const fragment = document.createDocumentFragment();
    KOPPEN_CLASSES.forEach(([code, description], index) => {
      const item = document.createElement("span");
      item.className = "climate-key";
      item.title = `${code} ${description}`;
      const swatch = document.createElement("i");
      swatch.className = `climate-swatch kg-${index + 1}`;
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = code;
      item.append(swatch, label);
      fragment.append(item);
    });
    elements.climateLegendItems.replaceChildren(fragment);
  }

  function weatherLayerConfig() {
    return WEATHER_LAYERS[state.weatherLayer];
  }

  function weatherStops(config = weatherLayerConfig()) {
    if (state.weatherLayer === "precipitation") {
      return state.weatherPeriod === "annual" ? config.annualStops : config.monthlyStops;
    }
    return config.stops;
  }

  function weatherTicks(config = weatherLayerConfig()) {
    if (state.weatherLayer === "precipitation") {
      return state.weatherPeriod === "annual" ? config.annualTicks : config.monthlyTicks;
    }
    return config.ticks;
  }

  function weatherUnit(config = weatherLayerConfig()) {
    if (state.weatherLayer === "precipitation") {
      return state.weatherPeriod === "annual" ? config.annualUnit : config.monthlyUnit;
    }
    return config.unit;
  }

  function periodLabel() {
    if (state.weatherPeriod === "annual") return "年平均";
    return `${Number(state.weatherPeriod)}月`;
  }

  function renderWeatherLegend() {
    const config = weatherLayerConfig();
    const stops = weatherStops(config);
    const minimum = stops[0][0];
    const maximum = stops[stops.length - 1][0];
    const gradient = stops.map(([value, color]) => {
      const position = ((value - minimum) / (maximum - minimum)) * 100;
      return `${color} ${position.toFixed(2)}%`;
    }).join(", ");
    elements.weatherLegendBar.style.background = `linear-gradient(90deg, ${gradient})`;
    const ticks = weatherTicks(config).map((value, index, values) => {
      const tick = document.createElement("span");
      tick.textContent = String(value);
      tick.style.left = `${((value - minimum) / (maximum - minimum)) * 100}%`;
      if (index === 0) tick.style.left = "0";
      if (index === values.length - 1) tick.style.left = "100%";
      return tick;
    });
    elements.weatherLegendTicks.replaceChildren(...ticks);
    elements.weatherLegendTitle.textContent = config.name;
    elements.weatherLegendUnit.textContent = weatherUnit(config);
  }

  function updateWeatherLayer() {
    const config = weatherLayerConfig();
    const label = periodLabel();
    const path = `./data/climate-layers/${state.weatherLayer}-${state.weatherPeriod}.png`;
    elements.activeLayerPeriod.textContent = label;
    elements.activeLayerName.textContent = config.name;
    elements.activeLayerMeta.textContent = `1991–2020年の気候平均｜日本は1km独自推定、その他は${config.grid}`;
    elements.mapLayerLabel.textContent = state.weatherVisible ? `${label}｜${config.name}` : "気象レイヤー非表示";
    elements.layerStatus.textContent = "読み込み中";
    elements.layerStatus.dataset.state = "loading";
    elements.weatherImage.setAttribute("href", path);
    globe.setSource("world", path);
    syncGlobe();
    elements.layerButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.weatherLayer === state.weatherLayer));
    });
    renderWeatherLegend();
    updateJapanMap();
  }

  function setWeatherVisibility(visible) {
    state.weatherVisible = visible;
    elements.weather.toggleAttribute("hidden", !visible);
    syncGlobe();
    const config = weatherLayerConfig();
    elements.mapLayerLabel.textContent = visible ? `${periodLabel()}｜${config.name}` : "気象レイヤー非表示";
    updateJapanMap();
  }

  async function fetchJapanBinary(path) {
    const response = await fetch(`${JAPAN_GRID_ROOT}/${path}`, { credentials: "same-origin", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`日本1kmデータ HTTP ${response.status}`);
    if (typeof DecompressionStream !== "function") throw new Error("このブラウザは1kmデータの展開に対応していません");
    return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }

  async function loadJapanCatalog() {
    if (state.japanCatalog) return state.japanCatalog;
    if (!state.japanCatalogPromise) {
      state.japanCatalogPromise = fetch(`${JAPAN_GRID_ROOT}/catalog.json`, {
        credentials: "same-origin", referrerPolicy: "no-referrer",
      }).then((response) => {
        if (!response.ok) throw new Error(`日本1km目録 HTTP ${response.status}`);
        return response.json();
      }).then((catalog) => {
        if (catalog.schema !== 1 || catalog.cells !== 387717 || catalog.days !== 366 || !catalog.prefixes) {
          throw new Error("日本1km目録の形式が不正です");
        }
        state.japanCatalog = catalog;
        return catalog;
      }).catch((error) => {
        state.japanCatalogPromise = null;
        throw error;
      });
    }
    return state.japanCatalogPromise;
  }

  function loadJapanMapChunk(prefix) {
    if (!state.japanMapCache.has(prefix)) {
      const promise = Promise.all([loadJapanCatalog(), fetchJapanBinary(`map-${prefix}.bin.gz`)]).then(([catalog, buffer]) => {
        const length = catalog.prefixes[prefix];
        if (!Number.isInteger(length) || buffer.byteLength !== length * (4 + 13 * 3 * 2)) {
          throw new Error("日本1km地図データの長さが不正です");
        }
        const codes = new Uint32Array(buffer, 0, length);
        for (let i = 1; i < length; i++) {
          if (codes[i] <= codes[i - 1] || Math.floor(codes[i] / 10000) !== Number(prefix)) {
            throw new Error("日本1km格子コードが不正です");
          }
        }
        return {
          codes,
          tmean: new Int16Array(buffer, length * 4, length * 13),
          precip: new Int16Array(buffer, length * (4 + 13 * 2), length * 13),
          solar: new Int16Array(buffer, length * (4 + 13 * 4), length * 13),
        };
      }).catch((error) => { state.japanMapCache.delete(prefix); throw error; });
      state.japanMapCache.set(prefix, promise);
    }
    return state.japanMapCache.get(prefix);
  }

  function loadJapanHumidityMapChunk(prefix) {
    if (!state.japanHumidityMapCache.has(prefix)) {
      const promise = Promise.all([loadJapanMapChunk(prefix), fetchJapanBinary(`map-humidity-${prefix}.bin.gz`)]).then(([base, buffer]) => {
        const length = base.codes.length;
        if (buffer.byteLength !== length * (4 + 13 * 2)) throw new Error("日本1km湿度地図データの長さが不正です");
        const codes = new Uint32Array(buffer, 0, length);
        if (!codes.every((code, index) => code === base.codes[index])) throw new Error("日本1km湿度格子が一致しません");
        return { codes, humidity: new Int16Array(buffer, length * 4, length * 13) };
      }).catch((error) => { state.japanHumidityMapCache.delete(prefix); throw error; });
      state.japanHumidityMapCache.set(prefix, promise);
    }
    return state.japanHumidityMapCache.get(prefix);
  }

  function binarySearchCode(codes, code) {
    let low = 0;
    let high = codes.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (codes[middle] < code) low = middle + 1;
      else high = middle;
    }
    return low < codes.length && codes[low] === code ? low : -1;
  }

  function meshCodeAt(longitude, latitude) {
    if (longitude < 120 || longitude >= 155 || latitude < 20 || latitude >= 47) return null;
    const latIndex = Math.floor(latitude * 120);
    const lonIndex = Math.floor((longitude - 100) * 80);
    const first = Math.floor(latIndex / 80);
    const second = Math.floor(lonIndex / 80);
    const third = Math.floor((latIndex % 80) / 10);
    const fourth = Math.floor((lonIndex % 80) / 10);
    return first * 1e6 + second * 1e4 + third * 1e3 + fourth * 1e2
      + (latIndex % 10) * 10 + lonIndex % 10;
  }

  function japanCell(code) {
    const latitudeIndex = Math.floor(code / 1e6) * 80 + Math.floor(code / 1e3) % 10 * 10 + Math.floor(code / 10) % 10;
    const longitudeIndex = Math.floor(code / 1e4) % 100 * 80 + Math.floor(code / 1e2) % 10 * 10 + code % 10;
    const latMin = latitudeIndex / 120;
    const lonMin = 100 + longitudeIndex / 80;
    return { kind: "japan-1km", code, latMin, latMax: latMin + 1 / 120,
      lonMin, lonMax: lonMin + 1 / 80, latitude: latMin + 1 / 240, longitude: lonMin + 1 / 160 };
  }

  function mapColor(value, stops) {
    let before = stops[0];
    let after = stops[stops.length - 1];
    for (let i = 1; i < stops.length; i++) {
      if (value <= stops[i][0]) { after = stops[i]; before = stops[i - 1]; break; }
    }
    const ratio = clamp((value - before[0]) / (after[0] - before[0] || 1), 0, 1);
    const channels = [1, 3, 5].map((offset) => Math.round(
      parseInt(before[1].slice(offset, offset + 2), 16) * (1 - ratio)
      + parseInt(after[1].slice(offset, offset + 2), 16) * ratio));
    return `rgb(${channels.join(",")})`;
  }

  function visibleJapanPrefixes(catalog, left, top, size) {
    const right = left + size;
    const bottom = top + size;
    const globePath = state.projection === "globe" ? d3.geoPath(globe.projection()) : null;
    return Object.keys(catalog.prefixes).filter((prefix) => {
      const number = Number(prefix);
      const latIndex = Math.floor(number / 100);
      const lonIndex = number % 100;
      const [x1, y1] = project(lonIndex + 100, (latIndex + 1) / 1.5);
      const [x2, y2] = project(lonIndex + 101, latIndex / 1.5);
      if (!(x2 >= left && x1 <= right && y2 >= top && y1 <= bottom)) return false;
      if (!globePath) return true;
      const west = lonIndex + 100, east = west + 1, south = latIndex / 1.5, north = (latIndex + 1) / 1.5;
      const bounds = globePath.bounds({ type: "Polygon", coordinates: [[[west, south], [west, north],
        [east, north], [east, south], [west, south]]] });
      return Number.isFinite(bounds[0][0]);
    });
  }

  async function updateJapanMap() {
    const serial = ++state.japanMapSerial;
    if (!state.weatherVisible) {
      elements.japanImage.removeAttribute("href");
      elements.japanOcclusion.removeAttribute("href");
      globe.setSource("japan", null);
      globe.setSource("mask", null);
      return;
    }
    const applyImage = (href, maskHref, box) => {
      state.japanBox = box;
      globe.setSource("japan", href);
      globe.setSource("mask", maskHref);
      syncGlobe();
      for (const [image, source] of [[elements.japanOcclusion, maskHref], [elements.japanImage, href]]) {
        for (const [attribute, value] of Object.entries(box)) image.setAttribute(attribute, String(value));
        image.setAttribute("href", source);
      }
    };
    const base = `${JAPAN_GRID_ROOT}/overview-${state.weatherLayer}-${state.weatherPeriod}.png`;
    const baseMask = `${JAPAN_GRID_ROOT}/overview-mask.png`;
    if (state.zoom < 32) {
      applyImage(base, baseMask, { x: 0, y: 0, width: 1000, height: 1000 });
      return;
    }
    try {
      const catalog = await loadJapanCatalog();
      if (serial !== state.japanMapSerial) return;
      const globeBox = state.projection === "globe" ? globe.mercatorBounds(project) : null;
      const size = state.projection === "globe" ? (globeBox?.width || 0) : MAP_SIZE / state.zoom;
      const left = state.projection === "globe" ? (globeBox?.x || 0) : state.centerX - size / 2;
      const top = state.projection === "globe" ? (globeBox?.y || 0) : state.centerY - size / 2;
      const prefixes = visibleJapanPrefixes(catalog, left, top, size);
      if (!prefixes.length) {
        elements.japanImage.removeAttribute("href");
        elements.japanOcclusion.removeAttribute("href");
        globe.setSource("japan", null);
        globe.setSource("mask", null);
        return;
      }
      const chunks = await Promise.all(prefixes.map(state.weatherLayer === "humidity"
        ? loadJapanHumidityMapChunk : loadJapanMapChunk));
      if (serial !== state.japanMapSerial) return;
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const context = canvas.getContext("2d", { alpha: true });
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskContext = maskCanvas.getContext("2d", { alpha: true });
      maskContext.fillStyle = "#f8faf8";
      const period = state.weatherPeriod === "annual" ? 12 : Number(state.weatherPeriod) - 1;
      const name = { temperature: "tmean", precipitation: "precip", humidity: "humidity", solar: "solar" }[state.weatherLayer];
      const stops = weatherStops();
      for (const chunk of chunks) {
        const values = chunk[name];
        const length = chunk.codes.length;
        for (let i = 0; i < length; i++) {
          const raw = values[period * length + i];
          const cell = japanCell(chunk.codes[i]);
          const [x1, y1] = project(cell.lonMin, cell.latMax);
          const [x2, y2] = project(cell.lonMax, cell.latMin);
          if (x2 < left || x1 > left + size || y2 < top || y1 > top + size) continue;
          const pixelX = (x1 - left) / size * canvas.width;
          const pixelY = (y1 - top) / size * canvas.height;
          const pixelWidth = Math.max(1, (x2 - x1) / size * canvas.width);
          const pixelHeight = Math.max(1, (y2 - y1) / size * canvas.height);
          maskContext.fillRect(pixelX, pixelY, pixelWidth, pixelHeight);
          if (raw !== JAPAN_MISSING) {
            const factor = name === "precip" ? 1 : 0.1;
            context.fillStyle = mapColor(raw * factor, stops);
            context.fillRect(pixelX, pixelY, pixelWidth, pixelHeight);
          }
        }
      }
      if (serial !== state.japanMapSerial) return;
      applyImage(canvas.toDataURL("image/png"), maskCanvas.toDataURL("image/png"),
        { x: left, y: top, width: size, height: size });
    } catch (error) {
      if (serial !== state.japanMapSerial) return;
      applyImage(base, baseMask, { x: 0, y: 0, width: 1000, height: 1000 });
      elements.layerStatus.textContent = "日本の1km表示を読み込めませんでした";
      elements.layerStatus.dataset.state = "error";
    }
  }

  function toggleClimateLayer() {
    state.climateVisible = !state.climateVisible;
    if (state.climateVisible && !elements.climateImage.getAttribute("href")) {
      elements.climateImage.setAttribute("href", elements.climateImage.dataset.src);
    }
    elements.climate.toggleAttribute("hidden", !state.climateVisible);
    elements.climateLegend.toggleAttribute("hidden", !state.climateVisible);
    elements.climateToggle.setAttribute("aria-pressed", String(state.climateVisible));
    elements.map.classList.toggle("climate-visible", state.climateVisible);
    globe.setSource("climate", state.climateVisible ? "./data/koppen-geiger-1991-2020.png" : null);
    syncGlobe();
  }

  function ringToPath(ring) {
    const commands = [];
    for (let index = 0; index < ring.length; index += 1) {
      const coordinate = ring[index];
      if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
      const [x, y] = project(Number(coordinate[0]), Number(coordinate[1]));
      commands.push(`${commands.length ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
    }
    if (commands.length) commands.push("Z");
    return commands.join(" ");
  }

  function geometryToPath(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return "";
    if (geometry.type === "Polygon") return geometry.coordinates.map(ringToPath).join(" ");
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.flatMap((polygon) => polygon.map(ringToPath)).join(" ");
    }
    return "";
  }

  function normalizePlantSearch(value) {
    return value.normalize("NFKC").toLowerCase()
      .replace(/[ぁ-ゖ]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60))
      .replace(/[^\p{L}\p{N}]/gu, "");
  }

  function plantStars(plant) {
    return "★".repeat(plant.reference.stars) + "☆".repeat(5 - plant.reference.stars);
  }

  function renderPlantResults() {
    const query = normalizePlantSearch(elements.plantSearch.value);
    const category = elements.plantCategory.value;
    const plants = state.plants.filter((plant) => (category === "all" || plant.category === category)
      && (!query || normalizePlantSearch([plant.name, plant.scientificName, ...plant.aliases].join(" ")).includes(query)));
    const fragment = document.createDocumentFragment();
    for (const plant of plants) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plant-result";
      button.dataset.plantId = plant.id;
      button.setAttribute("aria-pressed", String(state.selectedPlant?.id === plant.id));
      const name = document.createElement("strong");
      name.textContent = plant.name;
      const scientific = document.createElement("small");
      scientific.textContent = plant.scientificName;
      const stars = document.createElement("span");
      stars.className = "plant-result-stars";
      stars.textContent = plantStars(plant);
      stars.setAttribute("aria-label", `気候の参考度5段階中${plant.reference.stars}（暫定）`);
      button.append(name, stars, scientific);
      fragment.append(button);
    }
    elements.plantResults.replaceChildren(fragment);
    elements.plantResultCount.textContent = plants.length ? `${plants.length}件 · 選択すると原産地域を表示` : "該当する植物がありません。名前・ジャンルを変えてください。";
  }

  function updatePlantOrigin() {
    const plant = state.selectedPlant;
    const visible = state.plantVisible && Boolean(state.plantOriginBounds);
    elements.plantOrigin.toggleAttribute("hidden", !visible);
    elements.plantMapBadge.toggleAttribute("hidden", !visible);
    elements.togglePlantOrigin.setAttribute("aria-pressed", String(visible));
    elements.togglePlantOrigin.disabled = !state.plantOriginBounds;
    elements.focusPlantOrigin.disabled = !state.plantOriginBounds;
    elements.focusPlantOrigin.hidden = !state.plantOriginBounds;
    document.getElementById("plantOriginCaveat").hidden = !state.plantOriginBounds;
    elements.plantChoiceState.textContent = visible ? "線を非表示" : state.plantOriginBounds ? "線を表示" : "原種未特定";
    const originLabel = plant?.originKind === "cultigen" ? "栽培化した種の成立地域（目安）" : "原産地域の目安";
    if (visible) {
      const key = document.createElement("span");
      key.className = "origin-line-key";
      key.setAttribute("aria-hidden", "true");
      elements.plantMapBadge.replaceChildren(key, document.createTextNode(`${plant.name}｜${originLabel}`));
    }
    elements.mapDescription.textContent = "日本の気温・降水・日射・湿度は約1kmの独自推定、日本以外はNASA POWERの気候平均を表示します。"
      + (visible ? `${plant.name}（${plant.scientificName}）のKew掲載地域を黒い太線で概略表示します。線は実際の自生域境界ではありません。` : "");
    syncGlobe();
  }

  function selectPlant(id) {
    const plant = state.plants.find((candidate) => candidate.id === id);
    if (!plant) return;
    const outline = state.plantOutlines.outlines[state.plantOutlines.plantKeys[id]];
    state.selectedPlant = plant;
    state.plantOriginBounds = outline ? nativeBounds([{ geometry: { coordinates: outline.rings } }]) : null;
    state.plantVisible = Boolean(outline);
    const pathData = outline ? outline.rings.map(ringToPath).join(" ") : "";
    elements.plantOrigin.replaceChildren(...(pathData ? [
      svgElement("path", { d: pathData, class: "plant-origin-halo" }),
      svgElement("path", { d: pathData, class: "plant-origin-outline" }),
    ] : []));
    elements.selectedPlant.hidden = false;
    elements.plantOriginInfo.hidden = false;
    elements.selectedPlantName.textContent = plant.name;
    elements.selectedPlantScientific.textContent = plant.scientificName;
    elements.plantReferenceStars.textContent = plantStars(plant);
    elements.plantReferenceStars.setAttribute("aria-label", `5段階中${plant.reference.stars}`);
    elements.plantReferenceReason.textContent = plant.reference.reason;
    const kind = plant.taxonRank === "variety" ? "自然変種" : plant.taxonRank === "subspecies" ? "亜種" : plant.originKind === "cultigen" ? "栽培化した種" : plant.taxonRank === "cultivar" ? "園芸品種（原種未特定）" : "原種・種全体";
    elements.plantTaxonNote.textContent = `${kind}${plant.note ? " · " + plant.note : ""}`;
    elements.plantSource.href = plant.sourceUrl;
    elements.plantSource.textContent = plant.originKind === "unresolved" ? "品種名の出典：RHS" : "分布の出典：Kew";
    elements.plantReferenceSource.href = plant.reference.sourceUrl;
    elements.plantReferenceSource.hidden = plant.reference.sourceUrl === plant.sourceUrl;
    elements.plantOriginLabel.textContent = outline
      ? `黒い太線：${plant.originKind === "cultigen" ? "栽培化した種の成立地域" : "原産地域"}の目安`
      : "原種未特定のため、原産地域の線は表示しません";
    updatePlantOrigin();
    // Keep the picker, scroll position and keyboard focus stable for rapid switching.
    elements.plantResults.querySelectorAll("button[data-plant-id]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.plantId === id));
    });
    // Selection changes the overlay only. Pan/zoom is an explicit, separate action.
  }

  function focusPlantOrigin() {
    const bounds = state.plantOriginBounds;
    if (!bounds) return;
    if (state.projection === "globe") {
      const rings = state.plantOutlines.outlines[state.plantOutlines.plantKeys[state.selectedPlant.id]].rings;
      const [[west, south], [east, north]] = d3.geoBounds({ type: "MultiLineString", coordinates: rings });
      state.globeLongitude = ((west + east + (west > east ? 360 : 0)) / 2 + 540) % 360 - 180;
      state.globeLatitude = (south + north) / 2;
      setView(state.zoom);
    } else setView(state.zoom, (bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  }

  async function loadPlantCatalog() {
    try {
      const [catalog, outlines] = await Promise.all(["./data/plants.json", "./data/plant-outlines.json"].map(async (url) => {
        const response = await fetch(url, { credentials: "same-origin", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }));
      if (catalog.schema !== 1 || outlines.schema !== 1 || !Array.isArray(catalog.plants)
          || !Array.isArray(catalog.categories) || !outlines.outlines || !outlines.plantKeys
          || outlines.sourceSha256 !== catalog.regionSource.sha256) throw new Error("植物データ形式が不正です");
      for (const plant of catalog.plants) {
        if (!plant.id || !plant.name || !Array.isArray(plant.aliases)
            || !Number.isInteger(plant.reference?.stars) || plant.reference.stars < 1 || plant.reference.stars > 5
            || !plant.reference.reason || !/^https:\/\//.test(plant.sourceUrl) || !/^https:\/\//.test(plant.reference.sourceUrl)
            || (plant.regionCodes.length && !outlines.outlines[outlines.plantKeys[plant.id]])) throw new Error("植物の分布・参考度が不足しています");
      }
      state.plants = catalog.plants;
      state.plantOutlines = outlines;
      elements.plantCategory.options[0].textContent = `すべて（${catalog.plants.length}）`;
      for (const category of catalog.categories) {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = `${category.label}（${catalog.plants.filter((plant) => plant.category === category.id).length}）`;
        elements.plantCategory.append(option);
      }
      elements.plantCatalogCount.textContent = `${catalog.plants.length}件 / 9ジャンル`;
      elements.plantCategory.disabled = false;
      elements.plantSearch.disabled = false;
      renderPlantResults();
    } catch (error) {
      elements.plantCatalogCount.textContent = "読込エラー";
      elements.plantResultCount.textContent = "植物データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  function nativeBounds(features) {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const visit = (coordinates) => {
      if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
        const [x, y] = project(coordinates[0], coordinates[1]);
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
        return;
      }
      for (const coordinate of coordinates) visit(coordinate);
    };
    for (const feature of features) visit(feature.geometry.coordinates);
    return bounds;
  }

  async function loadWorldMap() {
    try {
      const response = await fetch("./data/world-50m.geojson", {
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const collection = await response.json();
      if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
        throw new Error("地図データ形式が不正です");
      }
      state.countries = collection.features;
      state.places = Array.isArray(collection.places) ? collection.places : [];
      state.geographyStatus = "ready";
      const fragment = document.createDocumentFragment();
      const borderFragment = document.createDocumentFragment();
      for (const feature of collection.features) {
        const pathData = geometryToPath(feature.geometry);
        if (pathData) {
          fragment.append(svgElement("path", { d: pathData, class: "land", "fill-rule": "evenodd" }));
          borderFragment.append(svgElement("path", { d: pathData, class: "country-border", "fill-rule": "evenodd" }));
        }
      }
      elements.land.replaceChildren(fragment);
      elements.border.replaceChildren(borderFragment);
      loadGeographyLabels();
      syncGlobe();
      if (state.referenceRecord?.cell) {
        state.referenceRecord.location = describeLocation(state.referenceRecord.cell);
      }
      if (state.selectedCell) updateLocation(state.selectedCell);
    } catch (error) {
      state.geographyStatus = "error";
      elements.geographyStatus.textContent = "地図・地名を読み込めませんでした。再読込してください。";
      if (state.referenceRecord?.cell) state.referenceRecord.location = describeLocation(state.referenceRecord.cell);
      if (state.selectedCell) updateLocation(state.selectedCell);
    }
  }

  function selectedCell(longitude, latitude) {
    const latitudeIndex = Math.round((clamp(latitude, -85, 85) + 90) / METEOROLOGY_LAT_STEP);
    const longitudeIndex = Math.round((longitude + 180) / METEOROLOGY_LON_STEP);
    const gridLatitude = -90 + latitudeIndex * METEOROLOGY_LAT_STEP;
    let gridLongitude = -180 + longitudeIndex * METEOROLOGY_LON_STEP;
    if (gridLongitude >= 180) gridLongitude -= 360;
    const clean = (value) => Number(value.toFixed(6));
    return {
      lonMin: clean(gridLongitude - METEOROLOGY_LON_STEP / 2),
      lonMax: clean(gridLongitude + METEOROLOGY_LON_STEP / 2),
      latMin: clean(gridLatitude - METEOROLOGY_LAT_STEP / 2),
      latMax: clean(gridLatitude + METEOROLOGY_LAT_STEP / 2),
      longitude: clean(gridLongitude),
      latitude: clean(gridLatitude),
    };
  }

  async function resolveSelectedCell(longitude, latitude) {
    const code = meshCodeAt(longitude, latitude);
    if (code === null) return selectedCell(longitude, latitude);
    const catalog = await loadJapanCatalog();
    const prefix = String(Math.floor(code / 10000));
    if (catalog.prefixes[prefix]) {
      const chunk = await loadJapanMapChunk(prefix);
      if (binarySearchCode(chunk.codes, code) >= 0) return japanCell(code);
    }
    // Land inside Japan without a source mesh must not silently become NASA data.
    if (countryAt(longitude, latitude)?.properties?.code === "JPN") {
      return { ...japanCell(code), kind: "japan-missing" };
    }
    return selectedCell(longitude, latitude);
  }

  function cellCopies(cell, cellClass, pointClass) {
    const [left, top] = project(cell.lonMin, cell.latMax);
    const [right, bottom] = project(cell.lonMax, cell.latMin);
    const [centerX, centerY] = project(cell.longitude, cell.latitude);
    const copies = [];
    for (const offset of [-MAP_SIZE, 0, MAP_SIZE]) {
      copies.push(svgElement("rect", {
        x: left + offset,
        y: top,
        width: Math.max(0.2, right - left),
        height: Math.max(0.2, bottom - top),
        class: cellClass,
      }));
      copies.push(svgElement("circle", {
        cx: centerX + offset,
        cy: centerY,
        r: 2.2 / state.zoom,
        class: pointClass,
      }));
    }
    return copies;
  }

  function sameCell(first, second) {
    return Boolean(first && second
      && first.latitude === second.latitude
      && first.longitude === second.longitude);
  }

  function drawSelections() {
    const copies = [];
    const firstRecord = state.referenceRecord || state.currentRecord;
    const secondRecord = state.referenceRecord && !sameCell(state.currentRecord?.cell, state.referenceRecord.cell)
      ? state.currentRecord : null;
    const isGlobe = state.projection === "globe";
    elements.focusLocationA.hidden = !isGlobe || !firstRecord;
    elements.focusLocationB.hidden = !isGlobe || !secondRecord;
    const globeCell = (cell, cellClass, pointClass) => {
      const geometry = { type: "Polygon", coordinates: [[[cell.lonMin, cell.latMin], [cell.lonMin, cell.latMax],
        [cell.lonMax, cell.latMax], [cell.lonMax, cell.latMin], [cell.lonMin, cell.latMin]]] };
      const path = globe.path(geometry), point = globe.point(cell.longitude, cell.latitude);
      const nodes = path ? [svgElement("path", { d: path, class: cellClass })] : [];
      if (point) nodes.push(svgElement("circle", { cx: point[0], cy: point[1], r: 2.2, class: pointClass }));
      return nodes;
    };
    if (firstRecord?.cell) copies.push(...(isGlobe ? globeCell : cellCopies)(firstRecord.cell, "reference-cell", "reference-point"));
    if (secondRecord?.cell) copies.push(...(isGlobe ? globeCell : cellCopies)(secondRecord.cell, "selection-cell", "selection-point"));
    for (const [record, label, color] of [[firstRecord, "A", "#2463b4"], [secondRecord, "B", "#bd4818"]]) {
      if (!record) continue;
      const point = isGlobe ? globe.point(record.cell.longitude, record.cell.latitude) : project(record.cell.longitude, record.cell.latitude);
      if (!point) continue;
      const [x, y] = point, scale = isGlobe ? 1 : state.zoom;
      for (const offset of (isGlobe ? [0] : [-MAP_SIZE, 0, MAP_SIZE])) {
        const marker = svgElement("text", { x: x + offset + 6 / scale, y: y - 5 / scale,
          fill: color, stroke: "white", "stroke-width": 3 / scale, "paint-order": "stroke",
          "font-size": 15 / scale, "font-weight": 800, class: "map-location-label" });
        marker.textContent = label; copies.push(marker);
      }
    }
    elements.selection.replaceChildren(...copies);
  }

  function coordinateLabel(value, positive, negative) {
    const direction = value >= 0 ? positive : negative;
    return `${Math.abs(value).toFixed(2)}°${direction}`;
  }

  function ringContainsPoint(ring, longitude, latitude) {
    let minimumLongitude = Infinity;
    let maximumLongitude = -Infinity;
    ring.forEach((coordinate) => {
      const value = Number(coordinate[0]);
      minimumLongitude = Math.min(minimumLongitude, value);
      maximumLongitude = Math.max(maximumLongitude, value);
    });
    const crossesAntimeridian = maximumLongitude - minimumLongitude > 180;
    const pointX = crossesAntimeridian && longitude < 0 ? longitude + 360 : longitude;
    const ringLongitude = (value) => crossesAntimeridian && value < 0 ? value + 360 : value;
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const currentCoordinate = ring[index];
      const previousCoordinate = ring[previous];
      const currentX = ringLongitude(Number(currentCoordinate[0]));
      const previousX = ringLongitude(Number(previousCoordinate[0]));
      const currentY = Number(currentCoordinate[1]);
      const previousY = Number(previousCoordinate[1]);
      const crossesLatitude = (currentY > latitude) !== (previousY > latitude);
      if (!crossesLatitude) continue;
      const crossingX = ((previousX - currentX) * (latitude - currentY)) / (previousY - currentY) + currentX;
      if (crossingX > pointX) inside = !inside;
    }
    return inside;
  }

  function polygonContainsPoint(polygon, longitude, latitude) {
    if (!polygon.length || !ringContainsPoint(polygon[0], longitude, latitude)) return false;
    return !polygon.slice(1).some((hole) => ringContainsPoint(hole, longitude, latitude));
  }

  function geometryContainsPoint(geometry, longitude, latitude) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return false;
    if (geometry.type === "Polygon") return polygonContainsPoint(geometry.coordinates, longitude, latitude);
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, longitude, latitude));
    }
    return false;
  }

  function countryAt(longitude, latitude) {
    return state.countries.find((feature) => geometryContainsPoint(feature.geometry, longitude, latitude)) || null;
  }

  function radians(value) {
    return (value * Math.PI) / 180;
  }

  function distanceKilometers(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
    const latitudeDelta = radians(secondLatitude - firstLatitude);
    const longitudeDelta = radians(secondLongitude - firstLongitude);
    const first = radians(firstLatitude);
    const second = radians(secondLatitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(first) * Math.cos(second) * Math.sin(longitudeDelta / 2) ** 2;
    const safe = clamp(haversine, 0, 1);
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(safe), Math.sqrt(1 - safe));
  }

  function directionFromPlace(place, cell) {
    const first = radians(place.y);
    const second = radians(cell.latitude);
    const longitudeDelta = radians(cell.longitude - place.x);
    const bearing = (Math.atan2(
      Math.sin(longitudeDelta) * Math.cos(second),
      Math.cos(first) * Math.sin(second) - Math.sin(first) * Math.cos(second) * Math.cos(longitudeDelta),
    ) * 180 / Math.PI + 360) % 360;
    return ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][Math.round(bearing / 45) % 8];
  }

  function roundedDistance(distance) {
    const step = distance < 100 ? 5 : distance < 500 ? 10 : 50;
    return Math.max(step, Math.round(distance / step) * step);
  }

  function nearestPlace(cell, country) {
    if (!country || !state.places.length) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const place of state.places) {
      if (place.c !== country.properties.code) continue;
      const distance = distanceKilometers(cell.latitude, cell.longitude, place.y, place.x);
      if (distance < nearestDistance) {
        nearest = place;
        nearestDistance = distance;
      }
    }
    return nearest ? { place: nearest, distance: nearestDistance } : null;
  }

  function describeLocation(cell) {
    const country = countryAt(cell.longitude, cell.latitude);
    if (!country) {
      const coordinates = `${coordinateLabel(cell.latitude, "N", "S")}, ${coordinateLabel(cell.longitude, "E", "W")}`;
      const label = state.geographyStatus === "ready" ? "海上・国未判定"
        : state.geographyStatus === "loading" ? "地名を確認中" : "地名情報を取得できませんでした";
      return {
        countryName: label,
        areaLabel: coordinates,
        placeName: label,
        headerLabel: `${label}｜${coordinates}`,
      };
    }
    const nearest = nearestPlace(cell, country);
    if (!nearest) {
      return {
        countryName: country.properties.name,
        areaLabel: "周辺都市の情報なし",
        placeName: country.properties.name,
        headerLabel: `${country.properties.name}｜周辺都市の情報なし`,
      };
    }
    const localizedName = nearest.place.q === "c" && country.properties.capital
      ? country.properties.capital
      : nearest.place.n;
    const areaLabel = nearest.distance <= 45
      ? `${localizedName}周辺`
      : `${localizedName}の${directionFromPlace(nearest.place, cell)} 約${roundedDistance(nearest.distance)}km`;
    return {
      countryName: country.properties.name,
      areaLabel,
      placeName: localizedName,
      headerLabel: `${country.properties.name}｜${areaLabel}`,
    };
  }

  function updateLocation(cell) {
    const location = describeLocation(cell);
    const previous = state.currentRecord;
    if (!sameCell(previous?.cell, cell)) state.dataStatus = null;
    state.currentRecord = {
      cell,
      location,
      climate: sameCell(previous?.cell, cell) ? previous.climate : null,
      daily: sameCell(previous?.cell, cell) ? previous.daily : null,
    };
    const strong = document.createElement("strong");
    strong.textContent = cell.kind?.startsWith("japan-")
      ? "日本の約1kmメッシュ（1991–2020年・独自推定）"
      : "気象格子：約0.5°×0.625°（地図の枠）";
    const span = document.createElement("span");
    span.textContent = `格子中心：${coordinateLabel(cell.latitude, "N", "S")}, ${coordinateLabel(cell.longitude, "E", "W")}`;
    const country = countryAt(cell.longitude, cell.latitude);
    const place = document.createElement("span");
    place.className = "place-summary";
    place.textContent = `国・地域：${location.countryName}｜周辺：${location.areaLabel}`;
    const note = document.createElement("small");
    note.textContent = cell.kind?.startsWith("japan-")
      ? "気温・降水・日射・相対湿度は観測値を基にした約1kmの独自推定です。気象庁が公表する公式な1km日別平年値ではなく、欠測をNASA値で埋めません。"
      : "気温・降水・相対湿度は選択した枠に対応する元格子の空間平均です。日射は中心点に対応する別の1°×1°格子です。";
    elements.locationSummary.replaceChildren(strong, span, place, note);
    updateComparisonControls();
  }

  function powerUrl(cell, parameters = PARAMETERS) {
    const query = new URLSearchParams({
      parameters: parameters.join(","),
      community: "AG",
      longitude: cell.longitude.toFixed(2),
      latitude: cell.latitude.toFixed(2),
      start: "1991",
      end: "2020",
      format: "JSON",
    });
    return `${POWER_CLIMATOLOGY_ENDPOINT}?${query.toString()}`;
  }

  function dailyPowerUrl(cell, parameters = DAILY_PARAMETERS) {
    const query = new URLSearchParams({
      parameters: parameters.join(","),
      community: "AG",
      longitude: cell.longitude.toFixed(2),
      latitude: cell.latitude.toFixed(2),
      start: "19910101",
      end: "20201231",
      format: "JSON",
      "time-standard": "LST",
    });
    return `${POWER_DAILY_ENDPOINT}?${query.toString()}`;
  }

  function validNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value !== FILL_VALUE;
  }

  function numberText(value, digits = 1) {
    return validNumber(value) ? value.toFixed(digits) : "—";
  }

  function setMetric(element, value, unit, digits = 1) {
    element.textContent = validNumber(value) ? `${numberText(value, digits)} ${unit}` : "データなし";
  }

  function signedNumberText(value, digits = 1) {
    if (!validNumber(value)) return "—";
    const rounded = Number(value.toFixed(digits));
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
  }

  function setMetricComparison(noteElement, current, reference, unit, digits, defaultText) {
    noteElement.textContent = validNumber(reference) && validNumber(current)
      ? `A ${numberText(reference, digits)}｜B−A ${signedNumberText(current - reference, digits)} ${unit}`
      : defaultText;
  }

  function dataSeries(payload, key) {
    const series = payload?.properties?.parameter?.[key];
    return series && typeof series === "object" ? series : {};
  }

  const interactiveCharts = new Map();
  const dailyChartWindow = { start: 0, end: 365 };
  let temperatureChartMode = "both";

  function boundedChartWindow(start, end) {
    const span = Math.max(6, Math.min(365, end - start));
    const first = Math.max(0, Math.min(365 - span, start));
    return { start: first, end: first + span };
  }

  function chartDateLabel(index, short = false) {
    const day = calendarDays()[Math.max(0, Math.min(365, Math.round(index)))];
    return Number(day.slice(0, 2)) + (short ? "/" : "月") + Number(day.slice(2)) + (short ? "" : "日");
  }

  function oppositeHemispheres(reference, current) {
    return Boolean(reference && current && reference.cell.latitude * current.cell.latitude < 0);
  }

  function seasonShiftActive() {
    return state.seasonShiftEnabled && Boolean(state.currentRecord?.climate) && Boolean(activeReferenceRecord())
      && oppositeHemispheres(state.referenceRecord, state.currentRecord);
  }

  function shiftedDailyValues(values) {
    return values.map((_, index) => values[(index + 183) % 366]);
  }

  function shiftedMonthIndex(index) {
    return (index + 6) % 12;
  }

  function chartLocationGroups(referenceAvailable) {
    const isReference = Boolean(state.referenceRecord && state.currentRecord
      && sameCell(state.referenceRecord.cell, state.currentRecord.cell));
    const current = {
      key: "current",
      role: isReference ? "基準 A" : (state.referenceRecord ? "比較 B" : "選択地点 A"),
      name: state.currentRecord?.location?.headerLabel || "地点を選択",
      tone: isReference || !state.referenceRecord ? "reference" : "current",
      isBaseline: isReference,
      colors: isReference || !state.referenceRecord ? ["#2463b4", "#4c8fc5"] : ["#bd4818", "#cf8537"],
    };
    return referenceAvailable ? [{
      key: "reference", role: "基準 A",
      name: state.referenceRecord?.location?.headerLabel || "基準地点",
      tone: "reference", isBaseline: true, colors: ["#2463b4", "#4c8fc5"],
    }, current] : [current];
  }

  function chartElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function chartSeriesStyle(kind, group, index) {
    // Temperature hue denotes the measurement, never the selected location.
    if (kind === "temperature") return {
      color: index === 0 ? "#d84a36" : "#227bb9",
      outlined: Boolean(group.isBaseline),
    };
    return { color: group.colors[index] || group.colors[0], outlined: false };
  }

  function visibleChartSeries(model) {
    return model.series.filter((series) => model.kind !== "temperature"
      || temperatureChartMode === "both" || temperatureChartMode === series.measure);
  }

  function setDailyChartWindow(start, end) {
    Object.assign(dailyChartWindow, boundedChartWindow(start, end));
    for (const model of interactiveCharts.values()) {
      if (!model.daily) continue;
      model.cursor = null;
      drawInteractiveChart(model);
    }
  }

  function zoomDailyChart(model, factor, anchor = 0.5) {
    const span = dailyChartWindow.end - dailyChartWindow.start;
    const nextSpan = Math.max(6, Math.min(365, span * factor));
    const point = dailyChartWindow.start + span * anchor;
    setDailyChartWindow(point - nextSpan * anchor, point + nextSpan * (1 - anchor));
  }

  function chartPointerFraction(model, event) {
    const rect = model.svg.getBoundingClientRect();
    const localX = (event.clientX - rect.left) * model.geometry.canvasWidth / Math.max(1, rect.width);
    return Math.max(0, Math.min(1, (localX - model.geometry.left) / model.geometry.width));
  }

  function updateChartCursor(model, index) {
    model.cursor = Math.max(0, Math.min(model.daily ? 365 : 11, Math.round(index)));
    drawChartReadout(model);
  }

  function prepareInteractiveChart(svg, options) {
    let model = interactiveCharts.get(svg);
    if (!model) {
      const card = svg.closest(".chart-card");
      const caption = card.querySelector("figcaption");
      caption.querySelectorAll(".chart-caption-tools, .comparison-key, .temperature-legend").forEach((item) => item.remove());
      const legend = chartElement("div", "chart-location-legend");
      const toolbar = chartElement("div", "chart-toolbar");
      const readout = chartElement("div", "chart-readout");
      readout.id = svg.id + "Readout";
      readout.setAttribute("aria-live", "off");
      caption.after(legend, toolbar);
      svg.after(readout);
      card.classList.add("interactive-chart-card");
      svg.classList.add("interactive-chart");
      svg.setAttribute("tabindex", "0");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-describedby", readout.id);
      model = { svg, card, legend, toolbar, readout, cursor: null, pointers: new Map(), geometry: null };
      interactiveCharts.set(svg, model);
      svg.addEventListener("wheel", (event) => {
        if (!model.daily || !model.hasData) return;
        event.preventDefault();
        event.stopPropagation();
        zoomDailyChart(model, Math.exp(Math.max(-160, Math.min(160, event.deltaY)) * 0.003), chartPointerFraction(model, event));
      }, { passive: false });
      svg.addEventListener("pointerdown", (event) => {
        if (!model.hasData || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.stopPropagation();
        model.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        svg.setPointerCapture(event.pointerId);
        model.drag = { x: event.clientX, start: dailyChartWindow.start, end: dailyChartWindow.end, moved: false };
        if (model.pointers.size === 2) {
          const points = [...model.pointers.values()];
          model.pinch = { distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)), start: dailyChartWindow.start, end: dailyChartWindow.end,
            fraction: chartPointerFraction(model, { clientX: (points[0].x + points[1].x) / 2 }) };
        }
        updateChartCursor(model, model.daily
          ? dailyChartWindow.start + chartPointerFraction(model, event) * (dailyChartWindow.end - dailyChartWindow.start)
          : chartPointerFraction(model, event) * 12 - 0.5);
      });
      svg.addEventListener("pointermove", (event) => {
        if (!model.hasData) return;
        if (model.pointers.has(event.pointerId)) {
          model.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (model.daily && model.pointers.size === 2 && model.pinch) {
            const points = [...model.pointers.values()];
            const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
            const nextSpan = Math.max(6, Math.min(365, (model.pinch.end - model.pinch.start) * model.pinch.distance / distance));
            const center = model.pinch.start + (model.pinch.end - model.pinch.start) * model.pinch.fraction;
            const fraction = chartPointerFraction(model, { clientX: (points[0].x + points[1].x) / 2 });
            setDailyChartWindow(center - nextSpan * fraction, center + nextSpan * (1 - fraction));
            return;
          }
          if (model.daily && model.drag) {
            const rect = svg.getBoundingClientRect();
            const delta = (event.clientX - model.drag.x) * model.geometry.canvasWidth / Math.max(1, rect.width)
              / model.geometry.width * (model.drag.end - model.drag.start);
            if (Math.abs(event.clientX - model.drag.x) > 3) model.drag.moved = true;
            if (model.drag.moved) {
              setDailyChartWindow(model.drag.start - delta, model.drag.end - delta);
              svg.classList.add("is-panning");
              return;
            }
          }
        }
        updateChartCursor(model, model.daily
          ? dailyChartWindow.start + chartPointerFraction(model, event) * (dailyChartWindow.end - dailyChartWindow.start)
          : chartPointerFraction(model, event) * 12 - 0.5);
      });
      const finishPointer = (event) => {
        model.pointers.delete(event.pointerId);
        model.pinch = null;
        model.drag = null;
        svg.classList.remove("is-panning");
        if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
        if (model.pointers.size === 1) {
          const point = [...model.pointers.values()][0];
          model.drag = { x: point.x, start: dailyChartWindow.start, end: dailyChartWindow.end, moved: false };
        }
      };
      svg.addEventListener("pointerup", finishPointer);
      svg.addEventListener("pointercancel", finishPointer);
      svg.addEventListener("pointerleave", () => {
        if (model.pointers.size) return;
        model.cursor = null;
        drawChartReadout(model);
      });
      svg.addEventListener("keydown", (event) => {
        if (!model.hasData) return;
        if (model.daily && ["+", "=", "-", "Home"].includes(event.key)) {
          event.preventDefault();
          if (event.key === "Home") setDailyChartWindow(0, 365);
          else zoomDailyChart(model, event.key === "-" ? 1.5 : 1 / 1.5);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const current = model.cursor ?? (model.daily ? Math.round((dailyChartWindow.start + dailyChartWindow.end) / 2) : 0);
          const next = Math.max(0, Math.min(model.daily ? 365 : 11, current + (event.key === "ArrowRight" ? 1 : -1)));
          if (model.daily && (next < dailyChartWindow.start || next > dailyChartWindow.end)) {
            const span = dailyChartWindow.end - dailyChartWindow.start;
            setDailyChartWindow(next < dailyChartWindow.start ? next : next - span, next < dailyChartWindow.start ? next + span : next);
          }
          model.readout.setAttribute("aria-live", "polite");
          updateChartCursor(model, next);
        }
      });
      svg.addEventListener("blur", () => model.readout.setAttribute("aria-live", "off"));
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => {
          if (svg.clientWidth > 0 && svg.clientHeight > 0) drawInteractiveChart(model);
        });
        observer.observe(svg);
      }
    }
    Object.assign(model, options);
    model.cursor = null;
    model.pointers.clear();
    model.drag = null;
    model.pinch = null;
    model.legend.replaceChildren();
    for (const group of model.groups) {
      const row = chartElement("div", "chart-location-key chart-key-" + group.tone);
      const name = chartElement("span", "chart-key-name", group.role + "  " + group.name);
      name.title = name.textContent;
      if (model.kind === "temperature" && state.referenceRecord) name.append(chartElement("span", "chart-line-treatment",
        group.isBaseline ? "［黒縁］" : "［縁なし］"));
      if (model.seasonShifted && group.key === "current") name.append(chartElement("span", "chart-season-label",
        model.daily ? "［Bを183日ずらし］" : "［Bを6か月ずらし］"));
      if (group.status) name.append(chartElement("span", "chart-key-status", "（" + group.status + "）"));
      const swatches = chartElement("span", "chart-series-keys");
      for (const series of model.series.filter((item) => item.group === group.key)) {
        const key = chartElement("span", "chart-series-key");
        const swatch = chartElement("i", "chart-series-swatch");
        swatch.style.backgroundColor = series.color;
        swatch.classList.toggle("swatch-outlined", Boolean(series.outlined));
        key.append(swatch, document.createTextNode(series.label));
        swatches.append(key);
      }
      row.append(name, swatches);
      model.legend.append(row);
    }
    model.toolbar.replaceChildren();
    if (model.daily) {
      const ranges = chartElement("div", "chart-range-buttons");
      ranges.setAttribute("aria-label", "グラフの表示期間");
      for (const [label, span] of [["全年", 365], ["3か月", 89], ["1か月", 30]]) {
        const button = chartElement("button", "chart-range-button", label);
        button.type = "button";
        button.dataset.span = String(span);
        button.addEventListener("click", () => {
          const center = model.cursor ?? (dailyChartWindow.start + dailyChartWindow.end) / 2;
          setDailyChartWindow(center - span / 2, center + span / 2);
        });
        ranges.append(button);
      }
      for (const [label, factor, title] of [["−", 1.5, "グラフを縮小"], ["＋", 1 / 1.5, "グラフを拡大"]]) {
        const button = chartElement("button", "chart-zoom-button", label);
        button.type = "button";
        button.setAttribute("aria-label", title);
        button.addEventListener("click", () => zoomDailyChart(model, factor));
        ranges.append(button);
      }
      model.toolbar.append(ranges);
      if (model.kind === "temperature") {
        const modes = chartElement("div", "chart-temperature-modes");
        modes.setAttribute("aria-label", "表示する気温");
        for (const [mode, label] of [["both", "最高・最低"], ["high", "最高"], ["low", "最低"]]) {
          const button = chartElement("button", "chart-mode-button", label);
          button.type = "button";
          button.dataset.mode = mode;
          button.addEventListener("click", () => { temperatureChartMode = mode; drawInteractiveChart(model); });
          modes.append(button);
        }
        model.toolbar.append(modes);
      }
    }
    model.rangeLabel = chartElement("span", "chart-range-label");
    model.toolbar.append(model.rangeLabel);
    drawInteractiveChart(model);
  }

  function drawChartReadout(model) {
    model.svg.querySelector(".chart-cursor")?.remove();
    model.readout.replaceChildren();
    if (!model.hasData || model.cursor === null) {
      if (model.groups.some((group) => group.status)) {
        model.readout.append(chartElement("strong", "chart-readout-date", "状態"));
        for (const group of model.groups) {
          const row = chartElement("div", "chart-readout-location chart-key-" + group.tone);
          row.append(chartElement("span", "chart-readout-name", group.role + "  " + group.name),
            chartElement("strong", "chart-readout-values", group.status || "表示中：線に触れると日別の値"));
          model.readout.append(row);
        }
        return;
      }
      model.readout.append(chartElement("span", "chart-readout-hint", model.hasData
        ? (model.daily ? "線に触れると日別の値｜ホイール・2本指で拡大、拡大後にドラッグで期間移動" : "棒に触れると月別の値｜← → キーでも選択")
        : model.emptyMessage));
      return;
    }
    if (!model.geometry) return;
    const index = model.cursor;
    model.readout.append(chartElement("strong", "chart-readout-date", (model.seasonShifted ? "A " : "")
      + (model.daily ? chartDateLabel(index) : (index + 1) + "月")));
    const visibleSeries = visibleChartSeries(model);
    const cursor = svgElement("g", { class: "chart-cursor", "aria-hidden": "true" });
    const x = model.geometry.x(index);
    cursor.append(svgElement("line", { x1: x, x2: x, y1: model.geometry.top, y2: model.geometry.bottom, class: "chart-cursor-line" }));
    for (const group of model.groups) {
      const row = chartElement("div", "chart-readout-location chart-key-" + group.tone);
      const actualDate = model.seasonShifted && group.key === "current"
        ? "｜Bの元の日付 " + (model.daily ? chartDateLabel((index + 183) % 366) : (shiftedMonthIndex(index) + 1) + "月")
        : "";
      const name = chartElement("span", "chart-readout-name", group.role + "  " + group.name + actualDate);
      name.title = name.textContent;
      const values = chartElement("strong", "chart-readout-values");
      values.textContent = group.status || visibleSeries.filter((series) => series.group === group.key)
        .map((series) => series.label + " " + (validNumber(series.values[index])
          ? numberText(series.values[index], model.kind === "solar" ? 2 : 1) + " " + model.unit : "データなし")).join("　");
      row.append(name, values);
      model.readout.append(row);
    }
    for (const series of visibleSeries) {
      const value = series.values[index];
      if (validNumber(value)) cursor.append(svgElement("circle", { cx: x, cy: model.geometry.y(value), r: 3.5, fill: series.color,
        class: "chart-point" + (series.outlined ? " chart-point-outlined" : "") }));
    }
    model.svg.append(cursor);
  }

  function drawInteractiveChart(model) {
    if (!model.series) return;
    const svg = model.svg;
    const width = Math.max(240, svg.clientWidth || 700);
    const height = Math.max(85, svg.clientHeight || 200);
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.replaceChildren();
    const series = visibleChartSeries(model);
    const values = series.flatMap((item) => item.values).filter(validNumber);
    model.hasData = values.length > 0;
    const start = model.daily ? dailyChartWindow.start : 0;
    const end = model.daily ? dailyChartWindow.end : 11;
    svg.dataset.rangeStart = String(start);
    svg.dataset.rangeEnd = String(end);
    model.rangeLabel.textContent = (model.seasonShifted ? "Aの暦 " : "")
      + (model.daily ? chartDateLabel(start, true) + " – " + chartDateLabel(end, true) : "1月 – 12月");
    model.toolbar.querySelectorAll("[data-span]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Math.abs(Number(button.dataset.span) - (end - start)) < 0.5));
      button.disabled = !model.hasData;
    });
    model.toolbar.querySelectorAll("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === temperatureChartMode)));
    model.toolbar.querySelectorAll(".chart-zoom-button").forEach((button, index) => {
      button.disabled = !model.hasData || (index === 0 ? end - start >= 365 : end - start <= 6);
    });
    model.legend.querySelectorAll(".chart-series-key").forEach((key) => {
      key.classList.toggle("series-muted", model.kind === "temperature" && temperatureChartMode !== "both"
        && !key.textContent.includes(temperatureChartMode === "high" ? "最高" : "最低"));
    });
    svg.setAttribute("aria-label", model.title + "。" + model.groups.map((group) => group.role + " " + group.name).join("、")
      + (model.kind === "temperature" ? "。最高は赤、最低は青" + (state.referenceRecord ? "。基準Aは黒縁、比較Bは縁なしの実線" : "") : "")
      + (model.seasonShifted ? (model.daily ? "。Bの日別値を183日ずらし、横軸はAの日付" : "。Bの月別値を6か月ずらし、横軸はAの月") : "")
      + "。左右キーで日付と数値を確認" + (model.daily ? "、プラスとマイナスで拡縮、Homeで全年。" : "。"));
    if (!model.hasData) {
      model.geometry = null;
      const text = svgElement("text", { x: width / 2, y: height / 2, class: "chart-empty" });
      text.textContent = model.emptyMessage;
      svg.append(text);
      drawChartReadout(model);
      return;
    }
    const step = model.kind === "temperature" ? 5 : model.kind === "solar" ? 5 : model.kind === "humidity" ? 10
      : Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(...values) || 1))) / 2);
    const minimum = model.kind === "temperature" ? Math.min(0, Math.floor(Math.min(...values) / 5) * 5)
      : model.kind === "humidity" ? Math.max(0, Math.floor((Math.min(...values) - 3) / 10) * 10) : 0;
    const maximum = model.kind === "temperature" ? Math.max(35, Math.ceil(Math.max(...values) / 5) * 5)
      : model.kind === "humidity" ? Math.max(minimum + 10, Math.min(100, Math.ceil((Math.max(...values) + 3) / 10) * 10))
        : Math.max(step, Math.ceil(Math.max(...values) / step) * step);
    const left = model.kind === "precipitation" ? 42 : 32;
    const right = 12;
    const top = 9;
    const bottom = height - 24;
    const plotWidth = width - left - right;
    const plotHeight = Math.max(20, bottom - top);
    const x = (index) => left + (model.daily ? (index - start) / (end - start) : (index + 0.5) / 12) * plotWidth;
    const y = (value) => top + (maximum - value) / (maximum - minimum) * plotHeight;
    model.geometry = { x, y, left, top, bottom, width: plotWidth, canvasWidth: width };
    const maxTicks = Math.max(2, Math.floor(plotHeight / 22));
    const tickStep = step * Math.max(1, Math.ceil((maximum - minimum) / step / maxTicks));
    const ticks = [];
    for (let tick = Math.ceil(minimum / tickStep) * tickStep; tick <= maximum; tick += tickStep) ticks.push(tick);
    if (model.kind === "temperature") for (const tick of [0, 30]) if (!ticks.includes(tick)) ticks.push(tick);
    for (const tick of ticks) {
      const emphasized = model.kind === "temperature" && (tick === 0 || tick === 30);
      svg.append(svgElement("line", { x1: left, x2: width - right, y1: y(tick), y2: y(tick), class: "chart-gridline" + (emphasized ? " chart-gridline-emphasis" : "") }));
      const label = svgElement("text", { x: left - 6, y: y(tick) + 4, class: "chart-axis-label" + (emphasized ? " chart-axis-label-emphasis" : ""), "text-anchor": "end" });
      label.textContent = String(tick);
      svg.append(label);
    }
    let lastLabelX = -Infinity;
    const days = calendarDays();
    for (let index = Math.ceil(start); index <= Math.floor(end); index++) {
      const day = model.daily ? days[index] : null;
      const candidate = !model.daily || (end - start > 100 ? day.endsWith("01") : end - start > 35 ? ["01", "15"].includes(day.slice(2)) : true);
      if (!candidate || x(index) - lastLabelX < (width < 400 ? 42 : 48)) continue;
      const label = svgElement("text", { x: x(index), y: height - 6, class: "chart-axis-label", "text-anchor": "middle" });
      label.textContent = !model.daily ? (index + 1) + "月" : end - start > 100 ? Number(day.slice(0, 2)) + "月" : chartDateLabel(index, true);
      svg.append(label);
      lastLabelX = x(index);
    }
    const clipId = svg.id + "PlotClip";
    const defs = svgElement("defs");
    const clip = svgElement("clipPath", { id: clipId });
    clip.append(svgElement("rect", { x: left, y: top - 2, width: plotWidth, height: plotHeight + 4 }));
    defs.append(clip);
    const plot = svgElement("g", { "clip-path": "url(#" + clipId + ")" });
    svg.append(defs, plot);
    series.forEach((item, seriesIndex) => {
      if (model.kind === "precipitation") {
        const groupWidth = plotWidth / 12 * 0.7;
        const barWidth = groupWidth / series.length;
        item.values.forEach((value, index) => {
          if (!validNumber(value)) return;
          plot.append(svgElement("rect", { x: x(index) - groupWidth / 2 + seriesIndex * barWidth, y: y(value),
            width: Math.max(2, barWidth - 1), height: Math.max(0, y(0) - y(value)), rx: 1, fill: item.color,
            class: item.group === "reference" ? "chart-bar chart-reference-bar" : "chart-bar" }));
        });
      } else {
        const commands = [];
        let open = false;
        for (let index = Math.max(0, Math.floor(start) - 1); index <= Math.min(365, Math.ceil(end) + 1); index++) {
          const value = item.values[index];
          if (!validNumber(value)) { open = false; continue; }
          commands.push((open ? "L" : "M") + x(index).toFixed(2) + "," + y(value).toFixed(2));
          open = true;
        }
        const pathData = commands.join(" ");
        if (item.outlined) plot.append(svgElement("path", { d: pathData, class: "chart-line-outline",
          "data-outline-for": item.group + "-" + item.measure, "aria-hidden": "true" }));
        plot.append(svgElement("path", { d: pathData, stroke: item.color, class: "chart-line"
          + (item.group === "reference" ? " chart-reference-series" : ""), "data-series": item.group + "-" + item.measure }));
      }
    });
    drawChartReadout(model);
  }

  function renderChart(svg, values, referenceValues, color, type) {
    const groups = chartLocationGroups(Boolean(referenceValues));
    const seasonShifted = seasonShiftActive();
    prepareInteractiveChart(svg, {
      kind: "precipitation", daily: false, groups, seasonShifted, title: "月降水量", unit: "mm", emptyMessage: "月降水量のデータがありません",
      series: groups.map((group) => ({ group: group.key, measure: "precipitation", label: "月降水量", color: group.colors[0],
        values: group.key === "reference" ? referenceValues : (seasonShifted ? values.map((_, index) => values[shiftedMonthIndex(index)]) : values) })),
    });
  }

  function monthlyValues(payload, key) {
    const series = dataSeries(payload, key);
    return MONTHS.map((month) => series[month]);
  }

  function monthlyPrecipitationTotals(payload) {
    return monthlyValues(payload, "PRECTOTCORR").map((value, index) => (
      validNumber(value) ? value * AVERAGE_DAYS_PER_MONTH[index] : FILL_VALUE
    ));
  }

  function calendarDays() {
    const days = [];
    const cursor = new Date(Date.UTC(2000, 0, 1));
    const end = new Date(Date.UTC(2001, 0, 1));
    while (cursor < end) {
      days.push(`${String(cursor.getUTCMonth() + 1).padStart(2, "0")}${String(cursor.getUTCDate()).padStart(2, "0")}`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }

  function averageByCalendarDay(payload, key) {
    const sums = new Map();
    const counts = new Map();
    for (const [date, value] of Object.entries(dataSeries(payload, key))) {
      if (!/^\d{8}$/.test(date) || !validNumber(value)) continue;
      const calendarDay = date.slice(4);
      sums.set(calendarDay, (sums.get(calendarDay) || 0) + value);
      counts.set(calendarDay, (counts.get(calendarDay) || 0) + 1);
    }
    return calendarDays().map((calendarDay) => ({
      calendarDay,
      value: counts.has(calendarDay) ? sums.get(calendarDay) / counts.get(calendarDay) : FILL_VALUE,
      count: counts.get(calendarDay) || 0,
    }));
  }

  function averageDailyValuesByMonth(payload, key) {
    const sums = Array(12).fill(0);
    const counts = Array(12).fill(0);
    for (const [date, value] of Object.entries(dataSeries(payload, key))) {
      if (!/^\d{8}$/.test(date) || !validNumber(value)) continue;
      if (payload?.sourceKind === "japan-1km" && date.endsWith("0229")) continue;
      const monthIndex = Number(date.slice(4, 6)) - 1;
      if (monthIndex < 0 || monthIndex > 11) continue;
      sums[monthIndex] += value;
      counts[monthIndex] += 1;
    }
    return sums.map((sum, index) => (counts[index] ? sum / counts[index] : FILL_VALUE));
  }

  function renderDailyClimateChart(svg, payload, referencePayload, options) {
    const reference = activeReferenceRecord();
    const referenceSource = referencePayload || reference?.daily || null;
    const groups = chartLocationGroups(Boolean(referencePayload || reference));
    const loading = !payload && /取得しています|問い合わせ中/.test(options.emptyMessage);
    const seasonShifted = seasonShiftActive();
    const series = [];
    for (const group of groups) {
      const source = group.key === "reference" ? referenceSource : payload;
      options.parameters.forEach(([key, measure, label], index) => {
        series.push({ group: group.key, measure, label, ...chartSeriesStyle(options.kind, group, index),
          values: group.key === "current" && seasonShifted
            ? shiftedDailyValues(averageByCalendarDay(source, key).map((item) => item.value))
            : averageByCalendarDay(source, key).map((item) => item.value) });
      });
      group.status = series.some((item) => item.group === group.key && item.values.some(validNumber))
        ? "" : (group.key === "current" && loading ? "取得中" : "データなし");
    }
    prepareInteractiveChart(svg, { ...options, daily: true, groups, series, seasonShifted });
  }

  function renderDailyTemperatureChart(payload, referencePayload = null, emptyMessage = "日別最高・最低を取得できませんでした") {
    renderDailyClimateChart(elements.temperatureChart, payload, referencePayload, {
      kind: "temperature", title: "日ごとの気温", unit: "℃", emptyMessage,
      parameters: [["T2M_MAX", "high", "最高"], ["T2M_MIN", "low", "最低"]],
    });
  }

  function renderDailySolarChart(payload, referencePayload = null, emptyMessage = "日別日射量を取得できませんでした") {
    renderDailyClimateChart(elements.solarChart, payload, referencePayload, {
      kind: "solar", title: "日ごとの日射量", unit: "MJ/㎡/日", emptyMessage,
      parameters: [["ALLSKY_SFC_SW_DWN", "solar", "日射量"]],
    });
  }

  function renderDailyHumidityChart(payload, referencePayload = null, emptyMessage = "日別相対湿度を取得できませんでした") {
    renderDailyClimateChart(elements.humidityChart, payload, referencePayload, {
      kind: "humidity", title: "日ごとの相対湿度", unit: "%", emptyMessage,
      parameters: [["RH2M", "humidity", "相対湿度"]],
    });
  }

  function activeReferenceRecord() {
    if (!state.comparisonEnabled || !state.referenceRecord || !state.currentRecord) return null;
    return sameCell(state.referenceRecord.cell, state.currentRecord.cell) ? null : state.referenceRecord;
  }

  function updateComparisonControls() {
    const currentReady = Boolean(state.currentRecord?.climate);
    const hasReference = Boolean(state.referenceRecord?.climate);
    const currentIsReference = hasReference && sameCell(state.currentRecord?.cell, state.referenceRecord.cell);
    const canShiftSeason = hasReference && currentReady && !currentIsReference
      && oppositeHemispheres(state.referenceRecord, state.currentRecord);
    if (hasReference && currentReady && !canShiftSeason) state.seasonShiftEnabled = false;
    elements.toggleSeasonShift.hidden = !canShiftSeason || !state.comparisonEnabled;
    elements.toggleSeasonShift.setAttribute("aria-pressed", String(seasonShiftActive()));
    elements.toggleSeasonShift.textContent = seasonShiftActive() ? "季節合わせ ON" : "季節を合わせる";
    elements.toggleSeasonShift.title = "南北半球の比較で、Bの日別値を183日・月別値を6か月ずらしてAの季節に合わせる";
    elements.seasonShiftStatus.hidden = !seasonShiftActive();
    elements.setReference.disabled = !currentReady;
    elements.setReference.hidden = currentIsReference;
    elements.setReference.textContent = hasReference ? "Bを新しい基準に" : "Aを基準に固定";
    elements.setReference.title = hasReference ? "現在の比較地点Bで、基準地点Aを置き換える" : "この地点を基準地点Aに固定する";
    elements.toggleComparison.hidden = !hasReference;
    elements.clearReference.hidden = !hasReference;
    elements.toggleComparison.setAttribute("aria-pressed", String(state.comparisonEnabled));
    elements.swapLocations.hidden = !hasReference || currentIsReference;
    elements.swapLocations.disabled = !currentReady;
    const actions = hasReference ? elements.currentActions : elements.referenceActions;
    if (elements.setReference.parentElement !== actions) actions.prepend(elements.setReference);
    elements.referenceCard.parentElement.classList.toggle("has-reference", hasReference);
    elements.referenceRole.textContent = hasReference ? "基準地点" : "選択地点";
    elements.referenceState.textContent = hasReference ? "固定" : "未固定";
    elements.currentCard.hidden = !hasReference;
    elements.pickComparison.hidden = !hasReference || !currentIsReference;
    const guideDetail = document.createElement("span");
    guideDetail.textContent = hasReference ? `基準A：${state.referenceRecord.location.headerLabel}`
      : "地点を固定すると、2地点を比較できます";
    elements.mapGuide.replaceChildren(document.createTextNode(hasReference
      ? "地図をクリックして比較地点Bを選択" : "地図をクリックして気候を確認"), guideDetail);
    elements.referenceCard.classList.toggle("is-empty", !state.currentRecord && !hasReference);
    elements.referenceCard.classList.toggle("overlay-off", hasReference && !state.comparisonEnabled);
    elements.currentCard.classList.toggle("is-empty", currentIsReference);
    const coordinates = (record) => `格子中心 ${coordinateLabel(record.cell.latitude, "N", "S")} · ${coordinateLabel(record.cell.longitude, "E", "W")}｜${record.cell.kind === "japan-1km" ? "日本1km独自推定" : "NASA POWER"}`;
    const firstRecord = state.referenceRecord || state.currentRecord;
    elements.referenceLocation.textContent = firstRecord?.location.headerLabel || "地図で地点Aを選択";
    elements.referenceDetail.textContent = firstRecord ? coordinates(firstRecord) : "Aを基準に固定すると、比較地点Bを選べます";
    if (hasReference && !state.referenceRecord.daily) elements.referenceDetail.textContent += "｜日別データなし";
    elements.currentLocation.textContent = currentIsReference ? "次に、地図で比べたい地点Bを選択" : state.currentRecord?.location.headerLabel || "地図で地点Bを選択";
    elements.currentDetail.textContent = currentIsReference ? "Aの地点・データはそのまま保持します" : state.currentRecord ? coordinates(state.currentRecord) : "国と周辺地域を表示します";
    elements.currentDetail.dataset.state = "idle";
    elements.referenceDetail.dataset.state = "idle";
    if (["loading", "error"].includes(state.dataStatus?.kind)) {
      const statusDetail = !hasReference || currentIsReference ? elements.referenceDetail : elements.currentDetail;
      statusDetail.textContent = state.dataStatus.message;
      statusDetail.dataset.state = state.dataStatus.kind;
    }
    elements.referenceLocation.title = elements.referenceLocation.textContent;
    elements.currentLocation.title = elements.currentLocation.textContent;
    if (hasReference) {
      elements.referenceShortLabel.textContent = state.comparisonEnabled ? "重ね表示 ON" : "重ね表示 OFF";
      const mode = state.comparisonEnabled ? "重ね表示中" : "重ね表示なし";
      elements.toggleComparison.title = `基準：${state.referenceRecord.location.headerLabel}｜${mode}`;
      elements.toggleComparison.setAttribute("aria-label", `${elements.toggleComparison.title}。クリックして切り替え`);
      elements.clearReference.title = `基準：${state.referenceRecord.location.headerLabel}を解除`;
    }
    const comparing = Boolean(activeReferenceRecord());
    elements.comparisonKeys.forEach((element) => { element.hidden = !comparing; });
    drawSelections();
  }

  function renderCharts(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload) {
    renderDailyTemperatureChart(dailyPayload, referenceDailyPayload);
    renderChart(
      elements.precipitationChart,
      monthlyPrecipitationTotals(climatePayload),
      referenceClimatePayload ? monthlyPrecipitationTotals(referenceClimatePayload) : null,
      "#287bb5",
      "bar",
    );
    renderDailySolarChart(dailyPayload, referenceDailyPayload);
    renderDailyHumidityChart(dailyPayload, referenceDailyPayload);
  }

  function renderMonthly(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload) {
    const averageHigh = dailyPayload ? averageDailyValuesByMonth(dailyPayload, "T2M_MAX") : Array(12).fill(FILL_VALUE);
    const averageLow = dailyPayload ? averageDailyValuesByMonth(dailyPayload, "T2M_MIN") : Array(12).fill(FILL_VALUE);
    const precipitation = monthlyPrecipitationTotals(climatePayload);
    const solar = dataSeries(climatePayload, "ALLSKY_SFC_SW_DWN");
    const humidity = dataSeries(climatePayload, "RH2M");
    const referenceHigh = referenceDailyPayload ? averageDailyValuesByMonth(referenceDailyPayload, "T2M_MAX") : Array(12).fill(FILL_VALUE);
    const referenceLow = referenceDailyPayload ? averageDailyValuesByMonth(referenceDailyPayload, "T2M_MIN") : Array(12).fill(FILL_VALUE);
    const referencePrecipitation = referenceClimatePayload ? monthlyPrecipitationTotals(referenceClimatePayload) : Array(12).fill(FILL_VALUE);
    const referenceSolar = referenceClimatePayload ? dataSeries(referenceClimatePayload, "ALLSKY_SFC_SW_DWN") : {};
    const referenceHumidity = referenceClimatePayload ? dataSeries(referenceClimatePayload, "RH2M") : {};
    const comparing = Boolean(referenceClimatePayload);
    const seasonShifted = seasonShiftActive();
    const fragment = document.createDocumentFragment();
    elements.monthlyHeading.textContent = comparing
      ? (seasonShifted ? "季節合わせ中｜Aの月にBの6か月後を対応（上段B、下段A・差）"
        : "月別｜上段 B比較・下段 A基準（括弧内は B−A の差）")
      : "月別の数値表（平均日最高・平均日最低）";

    MONTHS.forEach((month, index) => {
      const row = document.createElement("tr");
      const currentIndex = seasonShifted ? shiftedMonthIndex(index) : index;
      const currentMonth = MONTHS[currentIndex];
      const values = [
        seasonShifted ? `A ${MONTH_LABELS[index]} / B ${MONTH_LABELS[currentIndex]}` : MONTH_LABELS[index],
        averageHigh[currentIndex],
        averageLow[currentIndex],
        precipitation[currentIndex],
        solar[currentMonth],
        humidity[currentMonth],
      ];
      const referenceValues = [
        null,
        referenceHigh[index],
        referenceLow[index],
        referencePrecipitation[index],
        referenceSolar[month],
        referenceHumidity[month],
      ];
      const digits = [0, 1, 1, 1, 2, 1];
      values.forEach((value, cellIndex) => {
        const cell = document.createElement(cellIndex === 0 ? "th" : "td");
        if (cellIndex === 0) cell.scope = "row";
        if (cellIndex === 0) {
          cell.textContent = value;
        } else {
          cell.textContent = numberText(value, digits[cellIndex]);
          const referenceValue = referenceValues[cellIndex];
          if (comparing && validNumber(value) && validNumber(referenceValue)) {
            const delta = document.createElement("small");
            delta.className = "monthly-delta";
            delta.textContent = `A ${numberText(referenceValue, digits[cellIndex])} (${signedNumberText(value - referenceValue, digits[cellIndex])})`;
            cell.append(delta);
            cell.title = `比較先B ${MONTH_LABELS[currentIndex]} ${numberText(value, digits[cellIndex])}｜基準A ${MONTH_LABELS[index]} ${numberText(referenceValue, digits[cellIndex])}｜差 ${signedNumberText(value - referenceValue, digits[cellIndex])}`;
          }
        }
        row.append(cell);
      });
      fragment.append(row);
    });

    elements.monthlyBody.replaceChildren(fragment);
  }

  // These are descriptions of the displayed monthly values, not a climate
  // classification or estimates of plant tolerance or weather extremes.
  function monthlyExtent(values) {
    const available = values.map((value, index) => ({ value, index })).filter((item) => validNumber(item.value));
    if (!available.length) return null;
    return {
      minimum: available.reduce((a, b) => b.value < a.value ? b : a),
      maximum: available.reduce((a, b) => b.value > a.value ? b : a),
      complete: available.length === 12,
    };
  }

  function overviewValues(climate, daily) {
    return {
      temperature: monthlyValues(climate, "T2M"),
      high: averageDailyValuesByMonth(daily, "T2M_MAX"),
      low: averageDailyValuesByMonth(daily, "T2M_MIN"),
      precipitation: monthlyPrecipitationTotals(climate),
      solar: monthlyValues(climate, "ALLSKY_SFC_SW_DWN"),
      humidity: monthlyValues(climate, "RH2M"),
    };
  }

  function climateOverviewDescription(values) {
    const temperature = monthlyExtent(values.temperature);
    const rain = monthlyExtent(values.precipitation);
    const parts = [];
    if (temperature?.complete) {
      const low = temperature.minimum.value, high = temperature.maximum.value;
      parts.push(low >= 20 ? "一年を通して暖かい（月平均20℃以上）"
        : high <= 10 ? "一年を通して冷涼（月平均10℃以下）"
          : high - low <= 5 ? "気温の季節差が小さい（月平均の差5℃以下）"
            : low < 10 && high >= 20 ? "暖かい季節と寒い季節が明瞭"
              : "季節によって気温が変化");
    }
    if (rain?.complete) {
      parts.push(rain.maximum.value <= 20 ? "年間を通して少雨（各月20mm以下）"
        : rain.minimum.value >= 100 ? "毎月100mm以上の雨"
          : rain.maximum.value >= Math.max(1, rain.minimum.value) * 3 && rain.maximum.value - rain.minimum.value >= 50
            ? "雨の多い月・少ない月が明瞭" : "降水の月ごとの差は比較的小さい");
    }
    if (!parts.length) return "月別データが不足しています。取得できた要素を下に表示します。";
    return parts.join(" · ") + (temperature?.complete && rain?.complete ? "" : " · 一部の月別データなし");
  }

  const overviewKinds = [
    { key: "temperature", stem: "Temperature", title: "気温", unit: "℃", digits: 1, color: "#a84b32" },
    { key: "precipitation", stem: "Precipitation", title: "降水", unit: "mm", digits: 0, color: "#287bb5" },
    { key: "solar", stem: "Solar", title: "日射", unit: "MJ/㎡/日", digits: 1, color: "#b97b08" },
    { key: "humidity", stem: "Humidity", title: "湿度", unit: "%", digits: 1, color: "#25816f" },
  ];
  let overviewModel = null;
  let overviewCursor = null;

  function renderClimateOverview(climate, daily, referenceClimate, referenceDaily, message = "") {
    const current = overviewValues(climate, daily);
    const reference = referenceClimate ? overviewValues(referenceClimate, referenceDaily) : null;
    const shifted = Boolean(reference && seasonShiftActive());
    const currentRole = state.referenceRecord && !sameCell(state.referenceRecord.cell, state.currentRecord?.cell) ? "B" : "A";
    overviewModel = { current, reference, shifted, currentRole, message };
    overviewCursor = null;
    if (climate && !reference) {
      const temperature = monthlyExtent(current.temperature), rain = monthlyExtent(current.precipitation);
      const humidity = monthlyExtent(current.humidity);
      elements.annualTemperatureNote.textContent = temperature?.complete
        ? `月平均の年較差 ${numberText(temperature.maximum.value - temperature.minimum.value)}℃` : "月別の欠測あり";
      elements.annualPrecipitationNote.textContent = rain?.complete
        ? `雨が最も多いのは${MONTH_LABELS[rain.maximum.index]}` : "月別の欠測あり";
      elements.annualSolarNote.textContent = "日照時間ではなく、届くエネルギー";
      elements.annualHumidityNote.textContent = humidity?.complete
        ? (humidity.minimum.value >= 80 ? "全月の平均湿度が80%以上" : `月平均 ${numberText(humidity.minimum.value, 0)}〜${numberText(humidity.maximum.value, 0)}%`) : "月別の欠測あり";
    }
    elements.climateHeadline.textContent = message || ((currentRole === "B" ? "Bの特徴：" : "") + climateOverviewDescription(current));
    elements.overviewLegend.textContent = reference
      ? (shifted ? "B＝色線・棒 / A＝黒縁 · Bを6か月移動" : "B＝色線・棒 / A＝黒縁")
      : currentRole === "B" ? "Bのみ表示 · Aの重ね表示OFF" : "月別の気候平均 · 4要素を同じ月軸で";
    for (const kind of overviewKinds) {
      const extent = monthlyExtent(current[kind.key]);
      const target = document.getElementById("overview" + kind.stem + "Insight");
      if (!extent) { target.textContent = /取得しています|読み込み|問い合わせ/.test(message) ? "取得中" : "月別データなし"; target.title = ""; continue; }
      const { minimum, maximum, complete } = extent;
      const lowLabel = kind.key === "temperature" ? "最冷" : "最少";
      const highLabel = kind.key === "temperature" ? "最暖" : "最多";
      target.textContent = kind.key === "humidity"
        ? `${MONTH_LABELS[minimum.index]} ${numberText(minimum.value, 1)}〜${MONTH_LABELS[maximum.index]} ${numberText(maximum.value, 1)}%`
        : `${lowLabel}${MONTH_LABELS[minimum.index]} ${numberText(minimum.value, kind.digits)} / ${highLabel}${MONTH_LABELS[maximum.index]} ${numberText(maximum.value, kind.digits)}`;
      if (!complete) target.textContent += "（欠測月あり）";
      target.title = `元の暦の月別値。${kind.unit}。${kind.key === "temperature" ? "月平均気温の年較差 " + numberText(maximum.value - minimum.value) + "℃。" : ""}`;
    }
    drawClimateOverview();
  }

  function overviewDisplayed(values) {
    return overviewModel.shifted ? values.map((_, index) => values[shiftedMonthIndex(index)]) : values;
  }

  function drawClimateOverview() {
    if (!overviewModel) return;
    const { current, reference, currentRole } = overviewModel;
    overviewKinds.forEach((kind) => {
      const svg = document.getElementById("overview" + kind.stem + "Chart");
      if (!svg.clientWidth || !svg.clientHeight) return;
      const width = svg.clientWidth, height = svg.clientHeight;
      const left = 29, right = 10, top = 7, bottom = height - 6;
      const x = (index) => left + (index + 0.5) / 12 * (width - left - right);
      const groups = reference ? [{ values: reference, role: "A", outlined: true }, { values: current, role: "B", outlined: false }]
        : [{ values: current, role: currentRole, outlined: false }];
      const plotted = groups.flatMap((group) => kind.key === "temperature"
        ? [group.values.temperature, group.values.high, group.values.low].flat() : group.values[kind.key]).filter(validNumber);
      const minimum = kind.key === "temperature" ? Math.min(0, Math.floor(Math.min(0, ...plotted) / 5) * 5) : 0;
      const maximum = kind.key === "temperature" ? Math.max(35, Math.ceil(Math.max(0, ...plotted) / 5) * 5)
        : kind.key === "precipitation" ? Math.max(50, Math.ceil(Math.max(0, ...plotted) / 50) * 50)
          : kind.key === "solar" ? Math.max(30, Math.ceil(Math.max(0, ...plotted) / 5) * 5) : 100;
      const y = (value) => top + (maximum - value) / (maximum - minimum) * (bottom - top);
      svg.replaceChildren();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("aria-describedby", "overviewReadout");
      svg.setAttribute("aria-label", `${kind.title}、月別。${kind.unit}。左右キーで月の4要素を読取り。`);
      for (let month = 0; month < 12; month++) {
        svg.append(svgElement("line", { x1: x(month), x2: x(month), y1: top, y2: bottom, class: "overview-month-line" }));
      }
      const ticks = [minimum, maximum];
      ticks.forEach((tick) => {
        svg.append(svgElement("line", { x1: left, x2: width - right, y1: y(tick), y2: y(tick), class: "overview-gridline" }));
        const label = svgElement("text", { x: left - 4, y: y(tick) + 3, "text-anchor": "end", class: "overview-axis-label" });
        label.textContent = tick;
        svg.append(label);
      });
      groups.forEach((group, groupIndex) => {
        const shiftedValues = (key) => group.role === "B" ? overviewDisplayed(group.values[key]) : group.values[key];
        const line = (key, color, weight = 1.8) => {
          let connected = false;
          const path = shiftedValues(key).map((value, index) => {
            if (!validNumber(value)) { connected = false; return ""; }
            const command = `${connected ? "L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)}`;
            connected = true;
            return command;
          }).join(" ");
          if (group.outlined) svg.append(svgElement("path", { d: path, fill: "none", stroke: "#243b36", "stroke-width": weight + 2, opacity: 0.8 }));
          svg.append(svgElement("path", { d: path, fill: "none", stroke: color, "stroke-width": weight, "data-overview-series": `${group.role}-${key}` }));
          shiftedValues(key).forEach((value, index) => {
            if (validNumber(value)) svg.append(svgElement("circle", { cx: x(index), cy: y(value), r: weight, fill: color, stroke: group.outlined ? "#243b36" : "#fff", "stroke-width": 0.7 }));
          });
        };
        if (kind.key === "temperature") {
          // Shade only complete adjacent high/low pairs; missing months stay gaps.
          const high = shiftedValues("high"), low = shiftedValues("low");
          for (let index = 0; index < 11; index++) {
            if (![high[index], high[index + 1], low[index], low[index + 1]].every(validNumber)) continue;
            svg.append(svgElement("polygon", { points: `${x(index)},${y(high[index])} ${x(index + 1)},${y(high[index + 1])} ${x(index + 1)},${y(low[index + 1])} ${x(index)},${y(low[index])}`, fill: group.outlined ? "#677c74" : "#e6b193", opacity: 0.13 }));
          }
          line("high", "#cf5946", 1.4);
          line("low", "#287bb5", 1.4);
          line("temperature", kind.color, 2.1);
        } else if (kind.key === "precipitation") {
          const groupWidth = (width - left - right) / 12 * 0.65;
          const barWidth = groupWidth / groups.length;
          shiftedValues(kind.key).forEach((value, index) => {
            if (validNumber(value)) svg.append(svgElement("rect", { x: x(index) - groupWidth / 2 + groupIndex * barWidth, y: y(value), width: Math.max(1, barWidth - 1), height: Math.max(0, y(0) - y(value)), fill: kind.color, opacity: group.outlined ? 0.45 : 0.85, stroke: group.outlined ? "#243b36" : "none", "stroke-width": 1.3, "data-overview-series": `${group.role}-${kind.key}`, "data-month": index, "data-value": value }));
          });
        } else line(kind.key, kind.color);
      });
      if (!plotted.length) {
        const label = svgElement("text", { x: width / 2, y: height / 2 + 3, "text-anchor": "middle", class: "overview-axis-label" });
        label.textContent = /取得しています|読み込み|問い合わせ/.test(overviewModel.message) ? "取得中" : "月別データなし";
        svg.append(label);
      }
      if (overviewCursor !== null) svg.append(svgElement("line", { x1: x(overviewCursor), x2: x(overviewCursor), y1: top, y2: bottom, class: "overview-cursor" }));
    });
    drawOverviewReadout();
  }

  function drawOverviewReadout() {
    elements.overviewMonthAxis.replaceChildren(...MONTH_LABELS.map((label, index) => {
      const item = document.createElement("span");
      item.textContent = label;
      item.classList.toggle("active", index === overviewCursor);
      return item;
    }));
    if (overviewCursor === null) {
      elements.overviewReadout.textContent = "グラフに触れると同じ月の4要素を確認 · 左右キーでも操作できます";
      return;
    }
    const index = overviewCursor;
    const { current, reference, shifted, currentRole } = overviewModel;
    const currentIndex = shifted ? shiftedMonthIndex(index) : index;
    const rows = [{ values: current, index: currentIndex, role: currentRole }];
    if (reference) rows.push({ values: reference, index, role: "A" });
    elements.overviewReadout.replaceChildren(...rows.map((row) => {
      const line = document.createElement("span");
      line.textContent = `${row.role} ${MONTH_LABELS[row.index]}｜気温 ${numberText(row.values.temperature[row.index])}℃（平均最高 ${numberText(row.values.high[row.index])} / 平均最低 ${numberText(row.values.low[row.index])}） · 雨 ${numberText(row.values.precipitation[row.index], 0)}mm · 日射 ${numberText(row.values.solar[row.index])}MJ/㎡/日 · 湿度 ${numberText(row.values.humidity[row.index])}%`;
      return line;
    }));
  }

  function renderPayload(climatePayload, dailyPayload, referenceClimatePayload = null, referenceDailyPayload = null) {
    const temperature = dataSeries(climatePayload, "T2M").ANN;
    const precipitation = dataSeries(climatePayload, "PRECTOTCORR").ANN;
    const solar = dataSeries(climatePayload, "ALLSKY_SFC_SW_DWN").ANN;
    const humidity = dataSeries(climatePayload, "RH2M").ANN;
    const referenceTemperature = dataSeries(referenceClimatePayload, "T2M").ANN;
    const referencePrecipitationDaily = dataSeries(referenceClimatePayload, "PRECTOTCORR").ANN;
    const referenceSolar = dataSeries(referenceClimatePayload, "ALLSKY_SFC_SW_DWN").ANN;
    const referenceHumidity = dataSeries(referenceClimatePayload, "RH2M").ANN;
    const annualPrecipitation = validNumber(precipitation) ? precipitation * AVERAGE_DAYS_PER_YEAR : FILL_VALUE;
    const referenceAnnualPrecipitation = validNumber(referencePrecipitationDaily)
      ? referencePrecipitationDaily * AVERAGE_DAYS_PER_YEAR
      : FILL_VALUE;

    setMetric(elements.annualTemperature, temperature, "℃");
    setMetricComparison(elements.annualTemperatureNote, temperature, referenceTemperature, "℃", 1, "地上2m");
    setMetric(elements.annualPrecipitation, annualPrecipitation, "mm/年", 0);
    setMetricComparison(elements.annualPrecipitationNote, annualPrecipitation, referenceAnnualPrecipitation, "mm/年", 0, "1991–2020年の年平均");
    setMetric(elements.annualSolar, solar, "MJ/㎡/日", 2);
    setMetricComparison(elements.annualSolarNote, solar, referenceSolar, "MJ/㎡/日", 2, "全天日射量・日平均");
    setMetric(elements.annualHumidity, humidity, "%");
    setMetricComparison(elements.annualHumidityNote, humidity, referenceHumidity, "%", 1, "地上2m");
    renderCharts(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload);
    renderMonthly(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload);
    renderClimateOverview(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload);
  }

  function renderCurrentPayload() {
    updateComparisonControls();
    if (!state.currentRecord?.climate) return;
    const reference = activeReferenceRecord();
    renderPayload(
      state.currentRecord.climate,
      state.currentRecord.daily,
      reference?.climate || null,
      reference?.daily || null,
    );
  }

  function setReferenceFromCurrent() {
    if (!state.currentRecord?.climate) return;
    state.referenceRecord = {
      cell: { ...state.currentRecord.cell },
      location: { ...state.currentRecord.location },
      climate: state.currentRecord.climate,
      daily: state.currentRecord.daily,
    };
    state.comparisonEnabled = true;
    state.seasonShiftEnabled = false;
    renderCurrentPayload();
  }

  function toggleComparison() {
    if (!state.referenceRecord) return;
    state.comparisonEnabled = !state.comparisonEnabled;
    renderCurrentPayload();
  }

  function clearReference() {
    state.referenceRecord = null;
    state.comparisonEnabled = true;
    state.seasonShiftEnabled = false;
    if (state.currentRecord?.climate) renderCurrentPayload();
    else updateComparisonControls();
  }

  function swapLocations() {
    if (!state.currentRecord?.climate || !state.referenceRecord?.climate) return;
    // Cancel any older request before changing which record is the live selection.
    state.requestSerial += 1;
    state.controller?.abort();
    const previous = state.currentRecord;
    state.currentRecord = state.referenceRecord;
    state.referenceRecord = previous;
    state.selectedCell = state.currentRecord.cell;
    updateLocation(state.currentRecord.cell);
    renderCurrentPayload();
  }

  function resetValues(message) {
    renderClimateOverview(null, null, null, null, message);
    for (const element of [elements.annualTemperature, elements.annualPrecipitation, elements.annualSolar, elements.annualHumidity]) {
      element.textContent = "—";
    }
    elements.annualTemperatureNote.textContent = "地上2m";
    elements.annualPrecipitationNote.textContent = "1991–2020年の年平均";
    elements.annualSolarNote.textContent = "全天日射量・日平均";
    elements.annualHumidityNote.textContent = "地上2m";
    elements.monthlyHeading.textContent = "月別の数値表（平均日最高・平均日最低）";
    elements.comparisonKeys.forEach((element) => { element.hidden = true; });
    renderDailyTemperatureChart(null, null, message);
    renderDailySolarChart(null, null, message);
    renderDailyHumidityChart(null, null, message);
    renderChart(elements.precipitationChart, [], null, "#71827e", "line");
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty-row";
    cell.textContent = message;
    row.append(cell);
    elements.monthlyBody.replaceChildren(row);
  }

  function loadJapanDaily(prefix, variable, length) {
    const key = `${variable}-${prefix}`;
    if (!state.japanDailyCache.has(key)) {
      const promise = fetchJapanBinary(`daily-${variable}-${prefix}.bin.gz`).then((buffer) => {
        if (buffer.byteLength !== length * 366 * 2) throw new Error(`日本1km日別${variable}の長さが不正です`);
        return new Int16Array(buffer);
      }).catch((error) => { state.japanDailyCache.delete(key); throw error; });
      state.japanDailyCache.set(key, promise);
      if (state.japanDailyCache.size > 20) state.japanDailyCache.delete(state.japanDailyCache.keys().next().value);
    }
    return state.japanDailyCache.get(key);
  }

  function japanMonthlySeries(values, variable) {
    const series = {};
    const dates = calendarDays();
    const annual = [];
    for (let month = 0; month < 12; month++) {
      const indices = dates.flatMap((day, index) => Number(day.slice(0, 2)) === month + 1 && day !== "0229" ? [index] : []);
      const selected = indices.map((index) => values[index]);
      const valid = selected.length && selected.every((value) => value !== JAPAN_MISSING);
      const total = valid ? selected.reduce((sum, value) => sum + value, 0) / 10 : FILL_VALUE;
      series[MONTHS[month]] = valid ? (variable === "precip" ? total / AVERAGE_DAYS_PER_MONTH[month]
        : total / selected.length) : FILL_VALUE;
      if (valid) annual.push(...selected);
    }
    series.ANN = annual.length === 365
      ? annual.reduce((sum, value) => sum + value, 0) / 10 / (variable === "precip" ? AVERAGE_DAYS_PER_YEAR : 365)
      : FILL_VALUE;
    return series;
  }

  async function loadJapanClimate(cell, requestSerial) {
    const cacheKey = `japan:${cell.code}`;
    const cached = state.cache.get(cacheKey);
    if (cached) {
      state.currentRecord = { ...state.currentRecord, cell, climate: cached.climate, daily: cached.daily };
      renderCurrentPayload();
      setStatus(cached.humidityAvailable ? "日本1kmデータ取得完了" : "日本1kmデータ取得完了｜湿度はこのメッシュで欠測", "ready");
      return;
    }
    state.controller = new AbortController();
    resetValues("日本の1kmデータを読み込んでいます");
    setStatus("日本の1kmデータを読み込み中", "loading");
    try {
      const prefix = String(Math.floor(cell.code / 10000));
      const map = await loadJapanMapChunk(prefix);
      const position = binarySearchCode(map.codes, cell.code);
      if (position < 0) throw new Error("選択した1kmメッシュが見つかりません");
      const variables = ["tmin", "tmean", "tmax", "precip", "solar", "humidity"];
      const values = await Promise.all(variables.map((variable) => loadJapanDaily(prefix, variable, map.codes.length)));
      if (requestSerial !== state.requestSerial) return;
      const perCell = Object.fromEntries(variables.map((variable, index) => [variable,
        values[index].subarray(position * 366, (position + 1) * 366)]));
      const parameter = {
        T2M: japanMonthlySeries(perCell.tmean, "tmean"),
        PRECTOTCORR: japanMonthlySeries(perCell.precip, "precip"),
        ALLSKY_SFC_SW_DWN: japanMonthlySeries(perCell.solar, "solar"),
        RH2M: japanMonthlySeries(perCell.humidity, "humidity"),
      };
      const dates = calendarDays();
      const dailyParameter = {};
      for (const [variable, name] of [["tmean", "T2M"], ["tmax", "T2M_MAX"],
        ["tmin", "T2M_MIN"], ["precip", "PRECTOTCORR"], ["solar", "ALLSKY_SFC_SW_DWN"],
        ["humidity", "RH2M"]]) {
        dailyParameter[name] = Object.fromEntries(dates.map((date, index) => [
          `2000${date}`, perCell[variable][index] === JAPAN_MISSING ? FILL_VALUE : perCell[variable][index] / 10,
        ]));
      }
      const climate = { sourceKind: "japan-1km", properties: { parameter } };
      const daily = { sourceKind: "japan-1km", properties: { parameter: dailyParameter } };
      const humidityAvailable = validNumber(parameter.RH2M.ANN);
      state.cache.set(cacheKey, { climate, daily, humidityAvailable });
      state.currentRecord = { ...state.currentRecord, cell, climate, daily };
      renderCurrentPayload();
      setStatus(humidityAvailable ? "日本1kmデータ取得完了" : "日本1kmデータ取得完了｜湿度はこのメッシュで欠測", "ready");
    } catch (error) {
      if (error.name === "AbortError" || requestSerial !== state.requestSerial) return;
      resetValues("日本の1kmデータを読み込めませんでした。再度選択してください");
      setStatus(error.message || "日本の1kmデータ取得に失敗しました", "error");
    }
  }

  async function loadClimate(cell) {
    const cacheKey = `${cell.latitude.toFixed(1)},${cell.longitude.toFixed(1)}`;
    state.requestSerial += 1;
    const requestSerial = state.requestSerial;
    if (state.controller) state.controller.abort();
    state.controller = null;
    if (cell.kind === "japan-missing") {
      resetValues("この地点には日本の1kmメッシュ値がありません");
      setStatus("この地点には日本の1kmメッシュ値がありません", "error");
      return;
    }
    if (cell.kind === "japan-1km") {
      await loadJapanClimate(cell, requestSerial);
      return;
    }
    if (state.cache.get(cacheKey)?.daily) {
      const cached = state.cache.get(cacheKey);
      state.currentRecord = { ...state.currentRecord, cell, climate: cached.climate, daily: cached.daily };
      renderCurrentPayload();
      setStatus("取得完了", cached.daily ? "ready" : "error");
      return;
    }

    state.controller = new AbortController();
    resetValues("NASA POWERから取得しています");
    setStatus("NASA POWERへ問い合わせ中", "loading");

    try {
      const request = (url) => fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "force-cache",
        signal: state.controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      const [climateResult, dailyResult] = await Promise.allSettled([
        request(powerUrl(cell)),
        request(dailyPowerUrl(cell)),
      ]);
      if (requestSerial !== state.requestSerial) return;
      if (climateResult.status !== "fulfilled" || !climateResult.value?.properties?.parameter) {
        throw climateResult.status === "rejected" ? climateResult.reason : new Error("応答形式が不正です");
      }
      const climatePayload = climateResult.value;
      const dailyPayload = dailyResult.status === "fulfilled" && dailyResult.value?.properties?.parameter
        ? dailyResult.value
        : null;
      state.cache.set(cacheKey, { climate: climatePayload, daily: dailyPayload });
      state.currentRecord = { ...state.currentRecord, cell, climate: climatePayload, daily: dailyPayload };
      renderCurrentPayload();
      const version = climatePayload?.header?.api?.version;
      const status = dailyPayload ? "取得完了" : "日別データを取得できませんでした。同じ地点の再選択で再試行できます";
      setStatus(version ? `${status}｜API ${version}` : status, dailyPayload ? "ready" : "error");
    } catch (error) {
      if (error.name === "AbortError" || requestSerial !== state.requestSerial) return;
      resetValues("データを取得できませんでした。時間をおいて再度選択してください");
      setStatus("データ取得に失敗しました", "error");
    }
  }

  function eventPoint(event) {
    const matrix = elements.map.getScreenCTM();
    if (!matrix) return null;
    const point = elements.map.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }

  async function selectFromEvent(event) {
    const point = eventPoint(event);
    if (!point || (state.projection === "flat" && (point.y < 0 || point.y > MAP_SIZE))) return;
    const coordinate = state.projection === "globe" ? globe.invert(point.x, point.y) : unproject(point.x, point.y);
    if (!coordinate) return;
    const [longitude, latitude] = coordinate;
    if (Math.abs(latitude) > MAX_LAT) {
      elements.mapGuide.hidden = false;
      elements.mapGuide.textContent = "この極域には気候データがありません（表示データは緯度±85.05°まで）";
      return;
    }
    const serial = ++state.selectionSerial;
    let cell;
    try {
      cell = await resolveSelectedCell(longitude, latitude);
    } catch (error) {
      if (serial === state.selectionSerial) setStatus("日本の1kmメッシュを確認できませんでした。再度クリックしてください", "error");
      return;
    }
    if (serial !== state.selectionSerial) return;
    state.selectedCell = cell;
    updateLocation(cell);
    drawSelections();
    if (!state.referenceRecord) setResultPanelPage("overview");
    openResultPanel();
    loadClimate(cell);
  }

  function beginDrag(event) {
    if (event.button !== 0) return;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    elements.map.setPointerCapture(event.pointerId);
    if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      state.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom,
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        centerX: state.centerX, centerY: state.centerY,
        longitude: state.globeLongitude, latitude: state.globeLatitude };
      const rect = elements.map.getBoundingClientRect();
      state.pinch.coordinate = state.projection === "globe"
        ? globe.invert(state.pinch.midpoint.x - rect.left, state.pinch.midpoint.y - rect.top) : null;
      state.drag = null;
      return;
    }
    if (state.pointers.size > 1) return;
    const matrix = elements.map.getScreenCTM();
    if (!matrix) return;
    state.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      centerX: state.centerX, centerY: state.centerY,
      longitude: state.globeLongitude, latitude: state.globeLatitude,
      scaleX: Math.max(Math.abs(matrix.a), .0001), scaleY: Math.max(Math.abs(matrix.d), .0001), moved: false };
  }

  function rotateFromDrag(longitude, latitude, deltaX, deltaY) {
    const bounds = elements.map.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) * .46 * state.zoom;
    state.globeLongitude = ((longitude - deltaX / radius * 180 / Math.PI + 180) % 360 + 360) % 360 - 180;
    state.globeLatitude = clamp(latitude + deltaY / radius * 180 / Math.PI, -90, 90);
    setView(state.zoom);
  }

  function moveDrag(event) {
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pinch && state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()], pinch = state.pinch;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.distance), 1, 2048);
      const bounds = elements.map.getBoundingClientRect();
      if (state.projection === "globe") {
        const center = pinch.coordinate && PlantGlobe.coordinates.globeCenterForAnchor(pinch.coordinate,
          midpoint.x - bounds.left - bounds.width / 2, midpoint.y - bounds.top - bounds.height / 2,
          Math.min(bounds.width, bounds.height) * .46 * zoom, pinch.latitude);
        if (center) {
          [state.globeLongitude, state.globeLatitude] = center;
          setView(zoom);
        } else {
          state.zoom = zoom;
          rotateFromDrag(pinch.longitude, pinch.latitude, midpoint.x - pinch.midpoint.x, midpoint.y - pinch.midpoint.y);
        }
      } else {
        const scale = Math.min(bounds.width, bounds.height) * pinch.zoom / MAP_SIZE;
        const nextScale = Math.min(bounds.width, bounds.height) * zoom / MAP_SIZE;
        const anchorX = pinch.centerX + (pinch.midpoint.x - bounds.left - bounds.width / 2) / scale;
        const anchorY = pinch.centerY + (pinch.midpoint.y - bounds.top - bounds.height / 2) / scale;
        setView(zoom, anchorX - (midpoint.x - bounds.left - bounds.width / 2) / nextScale,
          anchorY - (midpoint.y - bounds.top - bounds.height / 2) / nextScale);
      }
      elements.map.classList.add("is-dragging");
      return;
    }
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    const deltaX = event.clientX - state.drag.startX, deltaY = event.clientY - state.drag.startY;
    if (Math.hypot(deltaX, deltaY) > 5) state.drag.moved = true;
    if (!state.drag.moved) return;
    elements.map.classList.add("is-dragging");
    if (state.projection === "globe") rotateFromDrag(state.drag.longitude, state.drag.latitude, deltaX, deltaY);
    else setView(state.zoom, state.drag.centerX - deltaX / state.drag.scaleX, state.drag.centerY - deltaY / state.drag.scaleY);
  }

  function endDrag(event) {
    const tap = state.drag?.pointerId === event.pointerId && !state.drag.moved && !state.pinch;
    state.pointers.delete(event.pointerId);
    state.drag = null;
    if (!state.pointers.size) { state.pinch = null; elements.map.classList.remove("is-dragging"); }
    else if (state.pointers.size === 1 && state.pinch) {
      const [id, pointer] = [...state.pointers.entries()][0], matrix = elements.map.getScreenCTM();
      state.pinch = null;
      if (matrix) state.drag = { pointerId: id, startX: pointer.x, startY: pointer.y,
        centerX: state.centerX, centerY: state.centerY,
        longitude: state.globeLongitude, latitude: state.globeLatitude,
        scaleX: Math.max(Math.abs(matrix.a), .0001), scaleY: Math.max(Math.abs(matrix.d), .0001), moved: true };
    }
    if (elements.map.hasPointerCapture(event.pointerId)) elements.map.releasePointerCapture(event.pointerId);
    if (tap) selectFromEvent(event);
  }

  function cancelDrag(event) {
    state.pointers.delete(event.pointerId); state.drag = null;
    if (!state.pointers.size) { state.pinch = null; elements.map.classList.remove("is-dragging"); }
  }

  function zoomFromWheel(event) {
    event.preventDefault();
    const point = eventPoint(event);
    if (!point) return;
    const nextZoom = clamp(state.zoom * (event.deltaY < 0 ? 1.25 : .8), 1, 2048);
    if (state.projection === "globe") {
      const coordinate = globe.invert(point.x, point.y), bounds = elements.map.getBoundingClientRect();
      const center = coordinate && PlantGlobe.coordinates.globeCenterForAnchor(coordinate,
        point.x - bounds.width / 2, point.y - bounds.height / 2,
        Math.min(bounds.width, bounds.height) * .46 * nextZoom, state.globeLatitude);
      if (center) [state.globeLongitude, state.globeLatitude] = center;
      setView(nextZoom); return;
    }
    const oldSize = MAP_SIZE / state.zoom;
    const left = state.centerX - oldSize / 2, top = state.centerY - oldSize / 2;
    const anchorX = (point.x - left) / oldSize, anchorY = (point.y - top) / oldSize;
    const nextSize = MAP_SIZE / nextZoom;
    setView(nextZoom, point.x + (.5 - anchorX) * nextSize, point.y + (.5 - anchorY) * nextSize);
  }

  const overviewResize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(drawClimateOverview) : null;
  for (const kind of overviewKinds) {
    const svg = document.getElementById("overview" + kind.stem + "Chart");
    overviewResize?.observe(svg);
    const readMonth = (event) => {
      if (!overviewModel) return;
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / svg.clientWidth;
      overviewCursor = clamp(Math.floor((event.clientX - rect.left - 29 * scale) / Math.max(1, rect.width - 39 * scale) * 12), 0, 11);
      drawClimateOverview();
    };
    svg.addEventListener("pointerdown", readMonth);
    svg.addEventListener("pointermove", (event) => { if (event.pointerType === "mouse") readMonth(event); });
    svg.addEventListener("keydown", (event) => {
      if (!overviewModel || !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
      event.preventDefault();
      overviewCursor = event.key === "Escape" ? null : event.key === "Home" ? 0 : event.key === "End" ? 11
        : clamp((overviewCursor ?? (event.key === "ArrowRight" ? -1 : 12)) + (event.key === "ArrowRight" ? 1 : -1), 0, 11);
      drawClimateOverview();
    });
  }

  drawGraticule();
  drawClimateLegend();
  const initialMapBounds = elements.map.getBoundingClientRect();
  // Fit one longitude cycle; keep the reference framing on wider screens.
  const initialZoom = Math.min(INITIAL_MAP_VIEW.maxZoom,
    Math.max(1, initialMapBounds.width / Math.max(1, initialMapBounds.height)));
  setView(initialZoom, ...project(INITIAL_MAP_VIEW.longitude, INITIAL_MAP_VIEW.latitude));
  loadWorldMap();
  elements.plantBrowser.open = true;
  loadPlantCatalog();
  elements.weatherImage.addEventListener("load", () => {
    elements.layerStatus.textContent = "表示中";
    elements.layerStatus.dataset.state = "ready";
  });
  elements.weatherImage.addEventListener("error", () => {
    elements.layerStatus.textContent = "レイヤーを読み込めませんでした";
    elements.layerStatus.dataset.state = "error";
  });
  elements.layerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!WEATHER_LAYERS[button.dataset.weatherLayer]) return;
      state.weatherLayer = button.dataset.weatherLayer;
      updateWeatherLayer();
    });
  });
  elements.layerPeriod.addEventListener("change", () => {
    if (elements.layerPeriod.value !== "annual" && !/^\d{2}$/.test(elements.layerPeriod.value)) return;
    state.weatherPeriod = elements.layerPeriod.value;
    updateWeatherLayer();
  });
  elements.weatherLayerToggle.addEventListener("change", () => {
    setWeatherVisibility(elements.weatherLayerToggle.checked);
  });
  elements.weatherLayerOpacity.addEventListener("input", () => {
    const opacity = clamp(Number(elements.weatherLayerOpacity.value) / 100, 0.2, 1);
    elements.weatherImage.style.opacity = String(opacity);
    elements.japanImage.style.opacity = String(opacity);
    elements.weatherLayerOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
    syncGlobe();
  });
  elements.toggleLayerPanel.addEventListener("click", () => {
    const expanded = elements.layerPanel.classList.toggle("is-open");
    elements.toggleLayerPanel.setAttribute("aria-expanded", String(expanded));
    elements.toggleLayerPanel.textContent = expanded ? "地図へ戻る" : "植物を選ぶ";
  });
  document.addEventListener("pointerdown", (event) => {
    if (elements.mapSettings.open && !elements.mapSettings.contains(event.target)) elements.mapSettings.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (elements.mapSettings.open) {
      elements.mapSettings.open = false;
      elements.mapSettings.querySelector("summary").focus();
    } else if (window.matchMedia("(max-width: 760px)").matches && elements.layerPanel.classList.contains("is-open")) {
      elements.toggleLayerPanel.click();
      elements.toggleLayerPanel.focus();
    }
  });
  elements.togglePlantOrigin.addEventListener("click", () => {
    if (!state.plantOriginBounds) return;
    state.plantVisible = !state.plantVisible;
    updatePlantOrigin();
  });
  elements.focusPlantOrigin.addEventListener("click", focusPlantOrigin);
  elements.plantCategory.addEventListener("change", renderPlantResults);
  elements.plantSearch.addEventListener("input", renderPlantResults);
  elements.plantResults.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-plant-id]");
    if (button && elements.plantResults.contains(button)) selectPlant(button.dataset.plantId);
  });
  elements.map.addEventListener("pointerdown", beginDrag);
  elements.map.addEventListener("pointermove", moveDrag);
  elements.map.addEventListener("pointerup", endDrag);
  elements.map.addEventListener("pointercancel", cancelDrag);
  elements.map.addEventListener("wheel", zoomFromWheel, { passive: false });
  elements.zoomIn.addEventListener("click", () => setView(state.zoom * 2));
  elements.zoomOut.addEventListener("click", () => setView(state.zoom / 2));
  elements.resetView.addEventListener("click", () => {
    if (state.projection === "globe") {
      state.globeLongitude = INITIAL_MAP_VIEW.longitude;
      state.globeLatitude = INITIAL_MAP_VIEW.latitude;
      setView(1);
    } else setView(1, MAP_SIZE / 2, MAP_SIZE / 2);
  });
  elements.projectionButtons.forEach((button) => button.addEventListener("click", () => setProjection(button.dataset.projection)));
  elements.focusLocationA.addEventListener("click", () => focusLocation(state.referenceRecord || state.currentRecord));
  elements.focusLocationB.addEventListener("click", () => focusLocation(state.referenceRecord && state.currentRecord));
  elements.geographyButtons.forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.geography;
    state.geographyVisible[key] = !state.geographyVisible[key];
    button.setAttribute("aria-pressed", String(state.geographyVisible[key]));
    button.querySelector("span").textContent = state.geographyVisible[key] ? "ON" : "OFF";
    elements.region.toggleAttribute("hidden", !state.geographyVisible.regions);
    drawGeographyLabels(); syncGlobe();
  }));
  function setGeographyPanel(open) {
    elements.geographyControls.classList.toggle("is-open", open);
    elements.geographyPanelToggle.setAttribute("aria-expanded", String(open));
    if (!open) elements.geographyControls.querySelector(".geography-help").open = false;
  }
  elements.equatorToggle.addEventListener("click", () => {
    state.equatorVisible = !state.equatorVisible;
    elements.equator.toggleAttribute("hidden", !state.equatorVisible);
    elements.equatorToggle.setAttribute("aria-pressed", String(state.equatorVisible));
    elements.equatorToggle.querySelector("span").textContent = state.equatorVisible ? "ON" : "OFF";
    syncGlobe();
  });
  elements.geographyPanelToggle.addEventListener("click", () => {
    setGeographyPanel(!elements.geographyControls.classList.contains("is-open"));
  });
  document.addEventListener("click", (event) => {
    if (!elements.geographyControls.contains(event.target)) setGeographyPanel(false);
  });
  elements.geographyControls.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setGeographyPanel(false);
      elements.geographyPanelToggle.focus();
    }
  });
  const mapResize = new ResizeObserver(() => {
    if (state.projection === "globe") setView(state.zoom); else drawGeographyLabels();
  });
  mapResize.observe(elements.map);
  elements.climateToggle.addEventListener("click", toggleClimateLayer);
  elements.setReference.addEventListener("click", setReferenceFromCurrent);
  elements.toggleComparison.addEventListener("click", toggleComparison);
  elements.toggleSeasonShift.addEventListener("click", () => {
    if (!oppositeHemispheres(state.referenceRecord, state.currentRecord) || !activeReferenceRecord()) return;
    state.seasonShiftEnabled = !state.seasonShiftEnabled;
    renderCurrentPayload();
  });
  elements.clearReference.addEventListener("click", clearReference);
  elements.swapLocations.addEventListener("click", swapLocations);
  elements.closeResults.addEventListener("click", closeResultPanel);
  elements.pickComparison.addEventListener("click", closeResultPanel);
  elements.openResults.addEventListener("click", openResultPanel);
  elements.resultTabs.forEach((button) => {
    button.addEventListener("click", () => setResultPanelPage(button.dataset.resultTab));
    button.addEventListener("keydown", moveResultPanelTab);
  });
  elements.resultHeading.addEventListener("pointerdown", beginResultPanelDrag);
  elements.resultPanel.addEventListener("pointerdown", beginResultPanelResize);
  window.addEventListener("pointermove", moveResultPanelDrag);
  window.addEventListener("pointermove", moveResultPanelResize, { passive: false });
  window.addEventListener("pointerup", endResultPanelDrag);
  window.addEventListener("pointercancel", endResultPanelDrag);
  window.addEventListener("pointerup", endResultPanelResize);
  window.addEventListener("pointercancel", endResultPanelResize);
  window.addEventListener("resize", applyResultPanelPosition);
  elements.weatherImage.style.opacity = String(Number(elements.weatherLayerOpacity.value) / 100);
  elements.japanImage.style.opacity = String(Number(elements.weatherLayerOpacity.value) / 100);
  updateWeatherLayer();
})();
