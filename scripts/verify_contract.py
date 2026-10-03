#!/usr/bin/env python3
"""Verify the source and browser-facing contract for Plant Climate Mesh."""

from __future__ import annotations

import hashlib
import gzip
import json
import re
import struct
import subprocess
from pathlib import Path

from build_deployment_manifest import japan_files
from verify_deployed_pages import EXPECTED_FILES as PUBLIC_FILES


ROOT = Path(__file__).resolve().parents[1]
JAPAN_FILES = set(japan_files(ROOT))
CLIMATE_LAYER_KEYS = ("temperature", "precipitation", "humidity", "solar")
CLIMATE_LAYER_PERIODS = ("annual",) + tuple(f"{month:02d}" for month in range(1, 13))
CLIMATE_LAYER_FILES = {
    f"data/climate-layers/{key}-{period}.png"
    for key in CLIMATE_LAYER_KEYS
    for period in CLIMATE_LAYER_PERIODS
}
SOURCE_FILES = {
    ".githooks/pre-push",
    ".github/workflows/pages.yml",
    ".github/workflows/privacy-gate.yml",
    ".gitignore",
    ".nojekyll",
    "404.html",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "app.js",
    "globe.js",
    "geography.js",
    "data/geography.json",
    "vendor/d3-array-3.2.4.min.js",
    "vendor/d3-geo-3.1.1.min.js",
    "vendor/d3-array-LICENSE.txt",
    "vendor/d3-geo-LICENSE.txt",

    "data/koppen-geiger-1991-2020.png",
    "data/world-50m.geojson",
    "data/plants.json",
    "data/plant-outlines.json",
    "index.html",
    "robots.txt",
    "scripts/build_deployment_manifest.py",
    "scripts/build_climate_layers.py",
    "scripts/build_plant_outlines.py",
    "scripts/build_geography.py",
    "scripts/build_japan_1km.py",
    "scripts/build_japan_humidity.py",
    "scripts/climate_layers_requirements.txt",
    "scripts/privacy_gate.py",
    "scripts/verify_contract.py",
    "scripts/verify_deployed_pages.py",
    "sitemap.xml",
    "styles.css",
    "data/climate-layers/manifest.json",
} | CLIMATE_LAYER_FILES | JAPAN_FILES
DEPLOY_FILES = {
    "404.html",
    "app.js",
    "globe.js",
    "geography.js",
    "data/geography.json",
    "vendor/d3-array-3.2.4.min.js",
    "vendor/d3-geo-3.1.1.min.js",
    "vendor/d3-array-LICENSE.txt",
    "vendor/d3-geo-LICENSE.txt",

    "data/koppen-geiger-1991-2020.png",
    "data/world-50m.geojson",
    "data/plants.json",
    "data/plant-outlines.json",
    "index.html",
    "robots.txt",
    "sitemap.xml",
    "styles.css",
    "data/climate-layers/manifest.json",
} | CLIMATE_LAYER_FILES | JAPAN_FILES


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def all_coordinates(value: object):
    if isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
        yield value
    elif isinstance(value, list):
        for child in value:
            yield from all_coordinates(child)



def verify_globe_math() -> None:
    """Check actual globe helpers, spherical clipping, raster fallback and gestures."""
    program = r'''
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const root = process.argv[1];
const sandbox = {window:{}, console, Math, Map, Float32Array, Uint8Array};
vm.createContext(sandbox);
for (const file of ["vendor/d3-array-3.2.4.min.js", "vendor/d3-geo-3.1.1.min.js", "globe.js"])
  vm.runInContext(fs.readFileSync(root + "/" + file, "utf8"), sandbox);
const Globe = sandbox.window.PlantGlobe;
const {globeForward:forward, globeInverse:inverse, globeCenterForAnchor:anchor} = Globe.coordinates;
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7, a+" != "+b);
assert.equal(forward(180,0,100,0,0), null);
assert.equal(inverse(100.01,0,100,0,0), null);
close(inverse(0,0,100,179,90)[1],90);
for (const center of [[0,0],[146,34],[179,-25],[-179,70],[0,-90]]) {
  const projection = sandbox.d3.geoOrthographic().translate([0,0]).scale(100).rotate([-center[0],-center[1]]);
  for (const coordinate of [center,[0,0],[139.76,35.68],[151,-34],[-179,45],[179,-45]]) {
    const point = forward(...coordinate,100,...center);
    if (!point) continue;
    const expected = projection(coordinate); close(point[0],expected[0]); close(point[1],expected[1]);
    const restored = inverse(...point,100,...center);
    if (Math.abs(coordinate[1])<89.999 && Math.hypot(...point)<99.999) {
      close(((restored[0]-coordinate[0]+540)%360)-180,0); close(restored[1],coordinate[1]);
    }
  }
}
for (const camera of [[146,34],[179,-25],[0,75]]) {
  const coordinate = inverse(20,-15,100,...camera);
  const centered = anchor(coordinate,20,-15,200,camera[1]);
  assert.ok(centered); const point = forward(...coordinate,200,...centered);
  close(point[0],20); close(point[1],-15);
}
assert.equal(anchor([0,0],200,0,100,0),null);
const projection = sandbox.d3.geoOrthographic().translate([0,0]).scale(100).rotate([0,0]).clipAngle(90);
const path = sandbox.d3.geoPath(projection);
assert.equal(path({type:"LineString",coordinates:[[170,0],[175,5]]}),null);
const horizon = path({type:"LineString",coordinates:[[80,0],[100,0]]});
assert.ok(horizon && !/NaN|Infinity/.test(horizon));
const image = (rgba) => ({width:2,height:2,data:Uint8Array.from([...rgba,...rgba,...rgba,...rgba])});
const fallback = Object.create(Globe.prototype);
fallback.options = {width:4,height:4,zoom:1,longitude:0,latitude:0,opacity:.5,weatherVisible:true,climateVisible:false};
fallback.cpu = {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(p)=>{fallback.output=p.data;}};
let textures = {world:image([200,40,20,255])}; fallback.pixels=(key)=>textures[key]||null;
fallback.renderCPU(4,4,1); assert.equal(fallback.output[23],128); assert.equal(fallback.output[20],200);
fallback.options.weatherVisible=false; fallback.renderCPU(4,4,1); assert.ok(fallback.output.every(v=>v===0));
fallback.options.weatherVisible=true; textures.mask=image([248,250,248,255]);
fallback.renderCPU(4,4,1); assert.deepEqual(Array.from(fallback.output.slice(20,24)),[248,250,248,255]);
textures.japan=image([20,200,40,255]); fallback.renderCPU(4,4,1);
assert.deepEqual(Array.from(fallback.output.slice(20,24)),[134,225,144,255]);
fallback.options.latitude=90; fallback.options.zoom=10000; fallback.renderCPU(4,4,1);
assert.ok(fallback.output.every(v=>v===0),"polar cap must not sample Mercator edge values");
// Exercise actual pointer handlers with a DOM-sized map and two distinct pointer IDs.
const app=fs.readFileSync(root+"/app.js","utf8");
const names=["clamp","beginDrag","moveDrag","endDrag","rotateFromDrag"];
const functions=names.map(name=>app.match(new RegExp("^  function "+name+"\\([\\s\\S]*?^  }","m"))[0]).join("\n");
const state={projection:"globe",zoom:1,centerX:500,centerY:500,globeLongitude:146,globeLatitude:34,pointers:new Map(),pinch:null,drag:null};
const map={getBoundingClientRect:()=>({width:400,height:600,left:0,top:0}),getScreenCTM:()=>({a:1,d:1}),
  setPointerCapture:()=>{},hasPointerCapture:()=>true,releasePointerCapture:()=>{},classList:{add:()=>{},remove:()=>{}}};
let views=0,taps=0;
const setView=(zoom,x,y)=>{state.zoom=zoom;if(x!==undefined){state.centerX=x;state.centerY=y;}views++;};
const globe={invert:(x,y)=>inverse(x-200,y-300,184,...[state.globeLongitude,state.globeLatitude])};
const api=new Function("state","elements","globe","PlantGlobe","setView","selectFromEvent","MAP_SIZE",
  functions+"\nreturn {"+names.join(",")+"};")(state,{map},globe,Globe,setView,()=>taps++,1000);
const event=(id,x,y)=>({pointerId:id,button:0,clientX:x,clientY:y});
api.beginDrag(event(1,150,300));api.beginDrag(event(2,250,300));api.moveDrag(event(2,350,300));
assert.equal(state.zoom,2);assert.ok(views>0);assert.equal(state.pointers.size,2);
api.endDrag(event(2,350,300));assert.ok(state.drag&&state.drag.moved);assert.equal(state.pinch,null);
api.moveDrag(event(1,160,310));api.endDrag(event(1,160,310));assert.equal(taps,0);assert.equal(state.pointers.size,0);
state.projection="flat";state.zoom=1;api.beginDrag(event(3,150,300));api.beginDrag(event(4,250,300));
api.moveDrag(event(4,350,300));assert.equal(state.zoom,2);close(state.centerX,437.5);
console.log("GLOBE_COORDINATES_CLIPPING_FALLBACK_GESTURES_OK");
'''
    subprocess.run(["node", "-e", program, str(ROOT)], check=True)


def verify_geography() -> None:
    """Exercise shared-edge removal and label clipping against the actual renderer."""
    program = r'''
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const root = process.argv[1];
const makeNode = (name) => ({name, attrs:{}, children:[], setAttribute(k,v){this.attrs[k]=v;},
  append(...items){for(const item of items) this.children.push(...(item.name==="fragment"?item.children:[item]));},
  replaceChildren(...items){this.children=[];this.append(...items);},
  getContext(){return {measureText:(text)=>({width:text.length*11})};}});
const sandbox = {window:{}, console, Math, Map, Set, document:{
  createElementNS:(ns,name)=>makeNode(name), createDocumentFragment:()=>makeNode("fragment"), createElement:makeNode}};
vm.createContext(sandbox);
for(const file of ["vendor/d3-array-3.2.4.min.js","vendor/d3-geo-3.1.1.min.js","geography.js"])
  vm.runInContext(fs.readFileSync(root+"/"+file,"utf8"),sandbox);
const api=sandbox.window.PlantGeography;
const polygon=(coordinates)=>({geometry:{type:"Polygon",coordinates:[coordinates]}});
const joined=api.outsideBoundary([polygon([[0,0],[1,0],[1,1],[0,1],[0,0]]),polygon([[1,0],[2,0],[2,1],[1,1],[1,0]])]);
const edges=joined.coordinates.flatMap(r=>r.slice(1).map((p,i)=>[r[i],p]));
assert.equal(edges.length,6);
assert.ok(!edges.some(([a,b])=>a[0]===1&&b[0]===1),"interior country edge must be removed");
const islands=api.outsideBoundary([polygon([[0,0],[1,0],[1,1],[0,1],[0,0]]),polygon([[4,0],[5,0],[5,1],[4,1],[4,0]])]);
assert.equal(islands.coordinates.length,2,"disconnected islands must keep separate outlines");
const world=JSON.parse(fs.readFileSync(root+"/data/world-50m.geojson"));
const metadata=JSON.parse(fs.readFileSync(root+"/data/geography.json"));
assert.deepEqual(Object.keys(metadata.countries).sort(),world.features.map(f=>f.properties.code).sort());
assert.ok(metadata.regions.every(r=>/^#[0-9a-f]{6}$/.test(r.color)&&r.point.every(Number.isFinite)));
const data=api.prepare(world.features,world.places,metadata);
assert.equal(data.countries.length,242);assert.equal(data.capitals.length,200);
assert.deepEqual(data.regions.find(r=>r.id==="south-africa").members.map(m=>m.code).sort().join(","),"BWA,LSO,NAM,SWZ,ZAF");
assert.equal(data.capitals.filter(c=>c.code==="ZAF").length,3);
assert.ok(data.capitals.some(c=>c.code==="JPN"&&c.name==="東京"));
const layer=makeNode("g"), point=()=>[[100,100]], sample={regions:[],countries:[{name:"日本",point:[139,36]}],capitals:[]};
api.drawLabels(layer,sample,{width:200,height:200,zoom:1,point,visible:{countries:true}});
assert.equal(layer.children.filter(n=>n.attrs.class==="geography-label country-label").length,1);
api.drawLabels(layer,sample,{width:200,height:200,zoom:1,point,visible:{countries:false}});
assert.equal(layer.children.length,1);assert.equal(layer.children[0].children.length,0);
api.drawLabels(layer,sample,{width:200,height:200,zoom:1,point:()=>[[188,100]],disk:{x:100,y:100,radius:90},visible:{countries:true}});
assert.equal(layer.children.length,1,"text must fit inside the globe limb, not just its anchor");
api.drawLabels(layer,sample,{width:200,height:200,zoom:1,point:()=>[],visible:{countries:true}});
assert.equal(layer.children.length,1,"far hemisphere labels must be absent");
api.drawLabels(layer,{countries:[],capitals:[],regions:[{id:"east-asia",name:"東アジア",color:"#2b619d",point:[112,39],members:[]}]},
  {width:200,height:200,zoom:32,point:()=>[],centerRegion:"east-asia",visible:{regions:true}});
assert.equal(layer.children.length,2,"keep the central region labelled when zoomed past its label anchor");
console.log("GEOGRAPHY_BOUNDARIES_CAPITALS_LABEL_CLIPPING_OK");
'''
    subprocess.run(["node", "-e", program, str(ROOT)], check=True)


def verify_comparison_math() -> None:
    """Exercise the actual pure helpers without a browser or network fixtures."""
    program = r'''
const assert = require("node:assert/strict");
const app = require("node:fs").readFileSync(process.argv[1], "utf8");
const names = ["boundedChartWindow", "validNumber", "calendarDays", "dataSeries",
  "averageByCalendarDay", "sameCell", "chartLocationGroups", "chartSeriesStyle",
  "oppositeHemispheres", "shiftedDailyValues", "shiftedMonthIndex", "normalizePlantSearch"];
const functions = names.map(name => {
  const match = app.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"));
  assert.ok(match, name + " missing");
  return match[0];
}).join("\n");
const state = { currentRecord: {cell:{latitude:36,longitude:139.375},location:{headerLabel:"B"}} };
const api = new Function("state", "FILL_VALUE", functions + "\nreturn {" + names.join(",") + "};")(state, -999);
assert.deepEqual(api.boundedChartWindow(-20, 10), {start:0,end:30});
assert.deepEqual(api.boundedChartWindow(355, 385), {start:335,end:365});
assert.deepEqual(api.boundedChartWindow(100, 101), {start:100,end:106});
assert.deepEqual(api.boundedChartWindow(0, 999), {start:0,end:365});
assert.equal(api.calendarDays().length, 366);
assert.equal(api.calendarDays()[59], "0229");
assert.equal(api.normalizePlantSearch("さんすべりあ"), api.normalizePlantSearch("サンスベリア"));
assert.equal(api.normalizePlantSearch("Ｆｉｃｕｓ・Elastica"), api.normalizePlantSearch("ficus elastica"));
const numberedDays = Array.from({length:366}, (_, index) => index);
assert.equal(api.shiftedDailyValues(numberedDays)[0], 183);
assert.equal(api.shiftedDailyValues(numberedDays)[183], 0);
assert.equal(api.shiftedDailyValues(numberedDays)[365], 182);
assert.equal(api.shiftedMonthIndex(0), 6);
assert.equal(api.shiftedMonthIndex(6), 0);
assert.equal(api.oppositeHemispheres({cell:{latitude:35}}, {cell:{latitude:-18}}), true);
assert.equal(api.oppositeHemispheres({cell:{latitude:35}}, {cell:{latitude:18}}), false);
const series = api.averageByCalendarDay({properties:{parameter:{T:{"19910101":0,"19920101":2,"19910102":-999,"19920229":8}}}}, "T");
assert.equal(series[0].value, 1);
assert.equal(series[0].count, 2);
assert.equal(series[1].value, -999);
assert.equal(series[59].value, 8);
assert.equal(api.validNumber(0), true);
assert.equal(api.validNumber(null), false);
assert.equal(api.validNumber(NaN), false);
assert.equal(api.chartLocationGroups(false)[0].role, "選択地点 A");
assert.equal(api.chartLocationGroups(false)[0].colors[0], "#2463b4");
assert.equal(api.chartSeriesStyle("temperature", api.chartLocationGroups(false)[0], 0).outlined, false);
assert.equal(api.chartSeriesStyle("temperature", api.chartLocationGroups(false)[0], 1).color, "#227bb9");
state.referenceRecord = {...state.currentRecord};
assert.equal(api.chartLocationGroups(false)[0].role, "基準 A");
assert.equal(api.chartLocationGroups(false)[0].colors[0], "#2463b4");
state.currentRecord = {cell:{latitude:28,longitude:113.125},location:{headerLabel:"B2"}};
const groups = api.chartLocationGroups(true);
assert.deepEqual(groups.map(g => g.role), ["基準 A", "比較 B"]);
assert.equal(groups[0].name, "B");
assert.equal(groups[1].name, "B2");
assert.equal(api.chartLocationGroups(false)[0].role, "比較 B");
for (const group of groups) {
  assert.deepEqual(api.chartSeriesStyle("temperature", group, 0), {color:"#d84a36",outlined:group.isBaseline});
  assert.deepEqual(api.chartSeriesStyle("temperature", group, 1), {color:"#227bb9",outlined:group.isBaseline});
  assert.equal(api.chartSeriesStyle("solar", group, 0).color, group.colors[0]);
  assert.equal(api.chartSeriesStyle("humidity", group, 0).outlined, false);
}
state.currentRecord = state.referenceRecord;
assert.equal(api.chartSeriesStyle("temperature", api.chartLocationGroups(false)[0], 1).outlined, true);
console.log("COMPARISON_MATH_OK");
'''
    subprocess.run(["node", "-e", program, str(ROOT / "app.js")], check=True)


def verify_plant_catalog(app: str) -> None:
    catalog = json.loads((ROOT / 'data/plants.json').read_text())
    outlines = json.loads((ROOT / 'data/plant-outlines.json').read_text())
    plants = catalog['plants']
    require(catalog['schema'] == outlines['schema'] == 1, 'plant schema mismatch')
    require(catalog['regionSource']['sha256'] == outlines['sourceSha256'], 'plant boundary source mismatch')
    require(catalog['ratingMethod']['kind'] == 'editorial-provisional', 'rating method missing')
    expected = {'tropical':40, 'vegetables':25, 'annuals':20, 'perennials':20, 'trees':20,
                'australian':33, 'succulents':25, 'caudex':28, 'tillandsia':22}
    require(len(plants) == 233 and len({p['id'] for p in plants}) == 233, 'plant count or duplicate ID')
    require({c['id'] for c in catalog['categories']} == set(expected), 'plant categories mismatch')
    require({c:sum(p['category'] == c for p in plants) for c in expected} == expected, 'genre count mismatch')
    require(len({p['scientificName'] for p in plants}) == 233, 'duplicate accepted taxa')
    for plant in plants:
        require(plant['taxonRank'] in ('species','variety','subspecies','cultivar'), 'invalid taxon rank')
        require(plant['originKind'] in ('native','cultigen','unresolved'), 'invalid origin kind')
        require(plant['checkedAt'] == '2026-09-26', 'source check date missing')
        require(plant['sourceUrl'].startswith(('https://powo.science.kew.org/taxon/', 'https://www.rhs.org.uk/plants/')), 'plant source missing')
        rating = plant['reference']
        require(type(rating['stars']) is int and 1 <= rating['stars'] <= 5 and rating['reason'] and rating['sourceUrl'].startswith('https://'), 'plant rating lacks reason or source')
        if plant['originKind'] == 'unresolved':
            require(plant['id'] == 'philodendron-birkin' and not plant['nativeAreas'] and not plant['regionCodes'] and plant['id'] not in outlines['plantKeys'], 'unresolved origin must have no outline')
        else:
            require(len(plant['nativeAreas']) == len(plant['regionCodes']) and plant['regionCodes'] == sorted(set(plant['regionCodes'])), 'native region mapping incomplete')
            require(outlines['plantKeys'][plant['id']] == '-'.join(plant['regionCodes']), 'outline region mismatch')
    for outline in outlines['outlines'].values():
        require(outline['rings'], 'empty plant outline')
        for ring in outline['rings']:
            require(len(ring) >= 4 and ring[0] == ring[-1], 'open plant outline ring')
            require(all(len(pt) == 2 and -180.001 <= pt[0] <= 180.001 and -90 <= pt[1] <= 90 for pt in ring), 'invalid plant coordinates')
    by_id = {p['id']:p for p in plants}
    require(set(by_id['dracaena-trifasciata']['nativeAreas']) == {'Cameroon','Central African Republic','Congo','DR Congo','Equatorial Guinea','Gabon','Nigeria','Tanzania'}, 'Sansevieria native range changed')
    require(by_id['solanum-tuberosum']['reference']['stars'] == 1 and '長日' in by_id['solanum-tuberosum']['reference']['reason'], 'potato improvement note missing')
    require('フレンチマリーゴールド' in by_id['tagetes-erecta']['aliases'] and '別名' in by_id['tagetes-erecta']['note'], 'marigold synonym explanation missing')
    perennials = {'Echinacea purpurea', 'Rudbeckia fulgida', 'Oenothera lindheimeri',
                  'Achillea millefolium', 'Stachys byzantina', 'Phlox subulata',
                  'Gypsophila paniculata', 'Veronica spicata', 'Geranium sanguineum',
                  'Platycodon grandiflorus', 'Liatris spicata', 'Physostegia virginiana',
                  'Phlox paniculata', 'Monarda didyma', 'Helenium autumnale',
                  'Campanula persicifolia', 'Lamprocapnos spectabilis', 'Tricyrtis hirta',
                  'Farfugium japonicum', 'Paeonia lactiflora'}
    require({p['scientificName'] for p in plants if p['category'] == 'perennials'} == perennials,
            'requested perennial species missing')
    require('夏' in by_id['lamprocapnos-spectabilis']['reference']['reason']
            and '休眠' in by_id['lamprocapnos-spectabilis']['reference']['reason'], 'summer dormancy explanation missing')
    trees = {'Camellia japonica', 'Camellia sasanqua', 'Gardenia jasminoides', 'Pieris japonica',
             'Nerium oleander', 'Kalmia latifolia', 'Hydrangea macrophylla', 'Enkianthus perulatus',
             'Spiraea thunbergii', 'Spiraea cantoniensis', 'Spiraea japonica', 'Kerria japonica',
             'Deutzia crenata', 'Cornus florida', 'Cornus kousa', 'Styrax japonicus',
             'Chimonanthus praecox', 'Cercis chinensis', 'Syringa vulgaris', 'Magnolia denudata'}
    require({p['scientificName'] for p in plants if p['category'] == 'trees'} == trees,
            'requested flowering tree species missing')
    require('遅霜' in by_id['magnolia-denudata']['reference']['reason']
            and '改良' in by_id['syringa-vulgaris']['reference']['reason'], 'flowering/cultivar explanation missing')
    australian_research = {'Acacia baileyana', 'Eucalyptus gunnii', 'Melaleuca citrina',
        'Grevillea lanigera', 'Banksia ericifolia', 'Melaleuca linariifolia', 'Westringia fruticosa',
        'Eremophila nivea', 'Chamelaucium uncinatum', 'Boronia heterophylla', 'Hardenbergia violacea',
        'Actinotus helianthi', 'Anigozanthos flavidus', 'Leucophyta brownii', 'Crowea exalata',
        'Backhousia citriodora', 'Leptospermum petersonii', 'Erioseira myoporoides',
        'Ceratopetalum gummiferum', 'Telopea speciosissima'}
    succulent_research = {'Echeveria agavoides', 'Echeveria elegans', 'Echeveria laui', 'Echeveria lilacina',
        'Haworthia cooperi', 'Haworthia cymbiformis', 'Haworthia retusa', 'Haworthia truncata',
        'Haworthiopsis attenuata', 'Agave parryi', 'Agave victoriae-reginae', 'Agave potatorum',
        'Agave attenuata', 'Agave americana', 'Crassula ovata', 'Kalanchoe tomentosa',
        'Aeonium arboreum', 'Sempervivum tectorum', 'Sedum morganianum', 'Curio rowleyanus'}
    caudex_research = {'Pachypodium rosulatum subsp. gracilius', 'Pachypodium lamerei',
        'Pachypodium densiflorum', 'Pachypodium brevicaule', 'Pachypodium eburneum',
        'Adenium obesum', 'Operculicarya pachypus', 'Operculicarya decaryi', 'Fockea edulis',
        'Adenia glauca', 'Cyphostemma juttae', 'Dorstenia foetida', 'Jatropha podagrica',
        'Sinningia leucotricha', 'Dioscorea elephantipes', 'Othonna euphorbioides',
        'Othonna herrei', 'Tylecodon paniculatus', 'Tylecodon reticulatus', 'Pelargonium triste'}
    tillandsia_research = {f'Tillandsia {name}' for name in (
        'ionantha', 'xerographica', 'usneoides', 'caput-medusae', 'stricta', 'brachycaulos',
        'bulbosa', 'butzii', 'tectorum', 'juncea', 'streptophylla', 'harrisii', 'fuchsii',
        'magnusiana', 'tricolor', 'seleriana', 'capitata', 'aeranthos', 'bergeri', 'tenuifolia')}
    for category, requested in [('australian', australian_research), ('succulents', succulent_research),
                                ('caudex', caudex_research), ('tillandsia', tillandsia_research)]:
        group = [p for p in plants if p['category'] == category]
        require(requested <= {p['scientificName'] for p in group}, 'requested research species missing')
        require(all(p['note'] and p['reference']['reason'] for p in group if p['scientificName'] in requested),
                'individual research caveat missing')
    require('Philotheca myoporoides' in by_id['erioseira-myoporoides']['aliases'], 'revised name search alias missing')
    require(by_id['eremophila-nivea']['reference']['stars'] == 3
            and '接ぎ木' in by_id['eremophila-nivea']['note'], 'grafted plant limitation missing')
    require('変種' in by_id['haworthia-cooperi']['note']
            and '基本変種' in by_id['haworthia-cymbiformis']['note'], 'variety source scope missing')
    require(by_id['aeonium-arboreum']['originKind'] == 'native'
            and by_id['aeonium-arboreum']['taxonRank'] == 'species'
            and '黒法師' in by_id['aeonium-arboreum']['note']
            and '園芸品種' in by_id['aeonium-arboreum']['note'], 'Aeonium cultivar/species distinction missing')
    require(by_id['pachypodium-rosulatum-subsp-gracilius']['taxonRank'] == 'subspecies'
            and by_id['pachypodium-rosulatum']['taxonRank'] == 'species', 'Gracilius subspecies distinction missing')
    require(all('発根' in p['note'] and '自根' in p['note'] for p in plants
                if p['scientificName'] in caudex_research), 'rooted caudex comparison scope missing')
    require('休' in by_id['dioscorea-elephantipes']['reference']['reason']
            and '露出' in by_id['fockea-edulis']['reference']['reason'], 'caudex season/exposure explanation missing')
    require(all(p['taxonRank'] == 'species' and p['originKind'] == 'native'
                for p in plants if p['scientificName'] in tillandsia_research),
            'Tillandsia research must refer to original species')
    select_body = re.search(r'^  function selectPlant\([\s\S]*?^  }', app, re.M).group(0)
    require('setView(' not in select_body and 'focusPlantOrigin(' not in select_body, 'plant selection must preserve view')
    print('PLANT_CATALOG_OK 233 taxa, 9 genres, reference reasons, outlines')


def main() -> None:
    require(hashlib.sha256((ROOT / 'vendor/d3-array-3.2.4.min.js').read_bytes()).hexdigest() == '80aa70d0cd17dabddf6d056494ea17926a45a69da8b7850220aace331bad671d', "projection vendor bytes changed")
    require(hashlib.sha256((ROOT / 'vendor/d3-array-LICENSE.txt').read_bytes()).hexdigest() == '3e6849627f74ff73c257a3ae1efb574015d94fc1035c05ec3c15805165efcbc4', "projection vendor bytes changed")
    require(hashlib.sha256((ROOT / 'vendor/d3-geo-3.1.1.min.js').read_bytes()).hexdigest() == '23e574f1e8d4716d622bce45356a379b66a277162b145f5f147e4c8daefb73d2', "projection vendor bytes changed")
    require(hashlib.sha256((ROOT / 'vendor/d3-geo-LICENSE.txt').read_bytes()).hexdigest() == '3e3edc1224eec9c39cd26491a21304a62883c1e5b6a65c5283ccc7a6cc94baee', "projection vendor bytes changed")
    require(PUBLIC_FILES == DEPLOY_FILES, 'public verifier file allowlist differs from deployment')
    actual_files = {
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*")
        if path.is_file()
        and ".git" not in path.relative_to(ROOT).parts
        and "_site" not in path.relative_to(ROOT).parts
        and "__pycache__" not in path.relative_to(ROOT).parts
    }
    require(actual_files == SOURCE_FILES, f"source file allowlist mismatch: {sorted(actual_files ^ SOURCE_FILES)}")

    index = (ROOT / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    styles = (ROOT / "styles.css").read_text(encoding="utf-8")
    workflow = (ROOT / ".github/workflows/pages.yml").read_text(encoding="utf-8")
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")

    require("Content-Security-Policy" in index, "CSP meta is missing")
    require("connect-src 'self' https://power.larc.nasa.gov" in index, "POWER must be the only external connection")
    require("'unsafe-inline'" not in index and "'unsafe-eval'" not in index, "unsafe CSP directive")
    require("<script src=\"./app.js?v=20261003-equator-toggle\" defer></script>" in index, "versioned local deferred script missing")
    require('href="./styles.css?v=20261003-equator-thin"' in index, "versioned local stylesheet missing")
    require(all(f'id="{key}"' in index for key in ('plantSearch','plantCategory','plantResults','plantOriginLayer','plantReferenceStars')), "plant search, categories, outline or ratings missing")
    require("地域全域の自生を示す線ではありません" in index, "native-region boundary caveat missing")
    require("耐寒性・栽培可否の判定ではありません" in index, "reference rating disclaimer missing")
    require(".plant-origin-outline" in styles and "stroke-width: 3.5" in styles, "native-country outline style missing")
    require(not re.search(r"<script[^>]+src=[\"']https?://", index), "external script detected")
    require(
        not re.search(r"<link[^>]+rel=[\"']stylesheet[\"'][^>]+href=[\"']https?://", index),
        "external stylesheet detected",
    )
    require("referrer\" content=\"no-referrer" in index, "no-referrer policy missing")
    require("Cookie、アクセス解析、現在地取得" in index, "privacy disclosure missing")
    require("通常の通信情報" in index and "NASA POWERへ送信" in index, "external transmission disclosure missing")
    require("1991–2020年の気候平均" in index, "independent climate-average label missing")
    require("公式の1km日別平年値ではありません" in index, "Japan estimate caveat missing")
    require("Webメルカトル" in index, "projection disclosure missing")
    require("<title id=\"mapTitle\">" not in index, "hover map tooltip must stay absent")
    require('aria-label="世界地図"' in index, "accessible map label missing")
    require(index.count('href="#worldLayer"') == 3, "three wrapped world copies are required")
    require('x="-1000"' in index and 'x="1000"' in index, "east-west world copies missing")
    require("0.5°×0.625°" in index and "1°×1°格子" in index, "native resolution disclosure missing")
    require("日本以外の気温・降水量・相対湿度は選択した枠に対応する元格子の空間平均" in index, "meteorology-grid disclosure missing")
    require("日射量は同じ中心点に対応する別の1°×1°格子" in index, "solar-grid distinction missing")
    require("通常日は30年分、2月29日は8年分" in index, "daily aggregation sample disclosure missing")
    require("月降水量" in index and "mm/月" in index and "年降水量" in index, "precipitation total labels missing")
    require("日平均量に各月・年の日数を掛けて" in index, "precipitation conversion disclosure missing")
    require("使い方" not in index, "guide link must stay absent until its note exists")
    for url in (
        "https://naturewxlab.com/",
        "https://www.youtube.com/@nature_wx_lab",
        "https://note.com/nature_wx_lab",
        "https://x.com/nature_wx_lab",
    ):
        require(f'href="{url}"' in index, f"header link missing: {url}")
    require('id="resultPanel"' in index and 'aria-controls="resultPanel"' in index, "floating data panel missing")
    require('id="resultPanel" class="result-panel" aria-labelledby="resultHeading" hidden' in index, "floating panel must be hidden initially")
    require(index.count("data-result-resize") == 4, "four floating-panel resize handles are required")
    require('role="tablist"' in index and index.count("data-result-tab=") == 6, "six result-panel tabs are required")
    require(index.count("data-result-page=") == 6, "six result-panel pages are required")
    for control_id in ("setReference", "toggleComparison", "referenceShortLabel", "clearReference", "swapLocations", "referenceLocation", "currentLocation"):
        require(f'id="{control_id}"' in index, f"comparison control missing: {control_id}")
    for result_page in ("overview", "temperature", "precipitation", "solar", "humidity", "monthly"):
        require(f'data-result-tab="{result_page}"' in index, f"result tab missing: {result_page}")
        require(f'data-result-page="{result_page}"' in index, f"result page missing: {result_page}")
    require('id="layerPanel" class="layer-panel"' in index, "left map-layer panel missing")
    require(index.count('data-weather-layer=') == 4, "four weather-layer controls are required")
    period_select = re.search(r'<select id="layerPeriod">([\s\S]*?)</select>', index)
    require(period_select is not None and period_select.group(1).count('<option value=') == 13, "annual and monthly period selector missing")
    require('id="weatherLayerToggle"' in index and 'id="weatherLayerOpacity"' in index, "weather-layer display controls missing")
    require('id="weatherLayer"' in index and 'id="weatherImage"' in index, "weather raster layer missing")
    require("日本の気温・降水・日射・湿度は約1kmの独自推定" in index, "map-layer provenance missing")
    require("日本のメッシュをクリックしてもNASA POWERへは接続しません" in index, "Japan privacy disclosure missing")
    require('id="japanImage"' in index and 'id="japanOcclusion"' in index, "Japan map overlay missing")
    for chart_id in ("temperatureChart", "precipitationChart", "solarChart", "humidityChart"):
        require(f'id="{chart_id}"' in index, f"chart missing: {chart_id}")
    require("月別の数値表" in index, "monthly table disclosure missing")
    require("平均日最高" in index and "平均日最低" in index, "monthly high-low columns missing")
    require('id="climateToggle"' in index and 'aria-pressed="false"' in index, "climate overlay toggle missing")
    require('data-src="./data/koppen-geiger-1991-2020.png"' in index, "climate overlay asset missing")
    require("ケッペン＝ガイガー気候区分" in index and "1991–2020年・0.1°版" in index, "climate overlay disclosure missing")
    require("国・地域：—｜周辺：—" in index, "country and nearby-place placeholder missing")
    require("1:50m Admin 0 Countries / 1:10m Populated Places" in index, "country/capital source disclosure missing")

    require("https://power.larc.nasa.gov/api/temporal/climatology/point" in app, "POWER endpoint mismatch")
    require("https://power.larc.nasa.gov/api/temporal/daily/point" in app, "POWER daily endpoint mismatch")
    for parameter in ("T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M"):
        require(parameter in app, f"missing POWER parameter {parameter}")
    for parameter in ("T2M_MAX", "T2M_MIN"):
        require(parameter in app, f"missing POWER daily parameter {parameter}")
    require('const DAILY_PARAMETERS = ["T2M_MAX", "T2M_MIN", "ALLSKY_SFC_SW_DWN", "RH2M"]' in app, "daily solar or humidity parameter missing")
    require('start: "1991"' in app and 'end: "2020"' in app, "climatology window mismatch")
    require('start: "19910101"' in app and 'end: "20201231"' in app, "daily window mismatch")
    require('"time-standard": "LST"' in app, "daily time standard mismatch")
    require('credentials: "omit"' in app, "cross-origin credentials must be omitted")
    require('referrerPolicy: "no-referrer"' in app, "POWER request referrer policy missing")
    require("AbortController" in app and "requestSerial" in app, "stale-response protection missing")
    require("localStorage" not in app and "sessionStorage" not in app, "comparison state must stay memory-only")
    require("innerHTML" not in app and "outerHTML" not in app, "unsafe HTML insertion detected")
    require("Math.atan(Math.sinh(mercator))" in app, "inverse Web Mercator formula missing")
    require("Math.log((1 + sine) / (1 - sine))" in app, "forward Web Mercator formula missing")
    require("const METEOROLOGY_LAT_STEP = 0.5" in app, "meteorology latitude step missing")
    require("const METEOROLOGY_LON_STEP = 0.625" in app, "meteorology longitude step missing")
    require("gridLongitude - METEOROLOGY_LON_STEP / 2" in app, "meteorology grid boundary calculation missing")
    require("gridLatitude - METEOROLOGY_LAT_STEP / 2" in app, "meteorology grid boundary calculation missing")
    require("function wrapWorldX(value)" in app, "continuous longitude wrapper missing")
    require("state.centerX = wrapWorldX(centerX)" in app, "map center must wrap east-west")
    require("for (const offset of [-MAP_SIZE, 0, MAP_SIZE])" in app, "selection copies must wrap east-west")
    require("point.x < 0" not in app and "point.x > MAP_SIZE" not in app, "wrapped map clicks must accept repeated worlds")
    require('addEventListener("wheel", zoomFromWheel, { passive: false })' in app, "wheel zoom contract missing")
    require('addEventListener("pointerdown", beginDrag)' in app, "drag start contract missing")
    require('addEventListener("pointermove", moveDrag)' in app, "drag move contract missing")
    require("if (state.zoom < 8)" not in app, "point selection must not change zoom")
    require("r: 2.2 / state.zoom" in app and "selection-cross" not in app, "selection point must stay visually small")
    require("function averageByCalendarDay(payload, key)" in app, "daily calendar aggregation missing")
    require("function loadJapanClimate(cell, requestSerial)" in app and "function updateJapanMap()" in app,
            "Japan point or map integration missing")
    require("function loadJapanHumidityMapChunk(prefix)" in app, "Japan humidity map integration missing")
    require('"humidity", "RH2M"' in app and 'RH2M: japanMonthlySeries(perCell.humidity, "humidity")' in app,
            "Japan humidity point integration missing")
    require("function averageDailyValuesByMonth(payload, key)" in app, "monthly daily-extreme aggregation missing")
    require("function renderDailySolarChart(payload" in app, "daily solar chart missing")
    require("各暦日の平均全天日射量" in index, "daily solar chart label missing")
    require("function renderDailyHumidityChart(payload" in app, "daily humidity chart missing")
    require("各暦日の日平均相対湿度" in index, "daily humidity chart label missing")
    require("function monthlyPrecipitationTotals(payload)" in app, "monthly precipitation conversion missing")
    require("28 + 8 / 30" in app and "AVERAGE_DAYS_PER_YEAR" in app, "climatology day counts missing")
    require("cell.colSpan = 6" in app, "monthly table fallback span mismatch")
    require('model.kind === "temperature" ? 5' in app and "tick === 0 || tick === 30" in app, "temperature axis interval or emphasis missing")
    require('viewBox="0 0 360 156"' in index, "temperature chart height mismatch")
    require("chart-gridline-emphasis" in styles and "chart-axis-label-emphasis" in styles, "temperature axis emphasis style missing")
    require("./data/world-50m.geojson" in app, "Natural Earth 1:50m map path missing")
    require("function geometryContainsPoint(" in app and "function countryAt(" in app, "country lookup missing")
    require("function nearestPlace(" in app and "function describeLocation(" in app, "nearby-place location rendering missing")
    require("country.properties.capital" in app and "周辺：${location.areaLabel}" in app, "country/area rendering missing")
    require("function toggleClimateLayer(" in app and "KOPPEN_CLASSES" in app, "climate overlay interaction missing")
    require("const WEATHER_LAYERS =" in app and "function updateWeatherLayer(" in app, "weather map-layer controller missing")
    require('`./data/climate-layers/${state.weatherLayer}-${state.weatherPeriod}.png`' in app, "weather layer asset path missing")
    require("weatherLayerOpacity" in app and "setWeatherVisibility" in app, "weather layer display interaction missing")
    require("function beginResultPanelDrag(" in app and "function moveResultPanelDrag(" in app, "floating-panel drag interaction missing")
    require("function beginResultPanelResize(" in app and "function moveResultPanelResize(" in app, "floating-panel resize interaction missing")
    require("function setResultPanelPage(" in app and "function moveResultPanelTab(" in app, "result-panel tab interaction missing")
    require("function setReferenceFromCurrent(" in app, "reference-location action missing")
    require("function toggleComparison(" in app and "function clearReference(" in app, "comparison toggle or clear action missing")
    require("function activeReferenceRecord(" in app and "chart-reference-series" in app, "comparison overlay rendering missing")
    require('id="toggleSeasonShift"' in index and 'id="seasonShiftStatus"' in index, "season alignment controls missing")
    require("function seasonShiftActive(" in app and "Bの元の日付" in app and "seasonShifted" in app, "season alignment/readout missing")
    require("referenceRecord" in app and "comparisonEnabled" in app, "comparison state missing")
    require("function boundedChartWindow(" in app and "function setDailyChartWindow(" in app, "shared chart viewport missing")
    require("function chartLocationGroups(" in app and "group.name" in app, "named chart legends missing")
    require("function swapLocations(" in app, "A/B swap missing")
    require("#2463b4" in app and "#bd4818" in app, "A/B location colors missing")
    require(".chart-reference-series { opacity: 1; stroke-dasharray: none; }" in styles, "baseline curves must be solid and opaque")
    require("chart-line-outline" in app and "data-outline-for" in app and "swatch-outlined" in styles, "baseline temperature outline and matching legend missing")
    require("model.pinch" in app and 'svg.addEventListener("wheel"' in app, "chart zoom gestures missing")
    require("chart-readout-values" in app and 'event.key === "ArrowLeft"' in app, "accessible exact-value chart readout missing")
    require("resultPanelScale" in app and "0.65" in app and "1.45" in app, "floating-panel scale bounds missing")
    require(".climate-raster" in styles and ".climate-legend" in styles and ".country-border" in styles, "climate overlay style missing")
    require(".layer-panel" in styles and ".weather-layer-buttons" in styles and ".weather-legend" in styles, "left layer-panel styles missing")
    require(".weather-raster" in styles and "image-rendering: pixelated" in styles, "native-grid raster rendering missing")
    require("aspect-ratio: 16 / 9" in styles and ".panel-resize-handle" in styles, "16:9 floating-panel styles missing")
    require(".result-tabs" in styles and ".result-pages" in styles and ".result-page[hidden]" in styles, "tabbed panel styles missing")
    require(".reference-cell" in styles and ".chart-reference-series" in styles, "comparison marker or chart style missing")

    require(".table-scroll" in styles and "overflow: auto" in styles, "narrow-screen table overflow guard missing")
    require("@media (max-width: 760px)" in styles, "mobile layout missing")
    require("touch-action: none" in styles, "map pan contract missing")
    require("height: calc(100svh - 43px)" in styles, "desktop map-first viewport contract missing")

    collection = json.loads((ROOT / "data/world-50m.geojson").read_text(encoding="utf-8"))
    require(collection.get("type") == "FeatureCollection", "world map is not a FeatureCollection")
    features = collection.get("features")
    require(isinstance(features, list) and 230 <= len(features) <= 270, "unexpected Natural Earth feature count")
    verify_plant_catalog(app)
    coordinate_count = 0
    capital_count = 0
    for feature in features:
        require(set(feature) == {"type", "properties", "geometry"}, "unexpected GeoJSON feature keys")
        properties = feature.get("properties", {})
        require(set(properties) <= {"name", "code", "capital"}, "world map exposes unnecessary properties")
        require(isinstance(properties.get("name"), str) and properties["name"], "country name missing")
        require(re.fullmatch(r"[A-Z0-9-]{3}", str(properties.get("code", ""))) is not None, "country code missing")
        if "capital" in properties:
            require(isinstance(properties["capital"], str) and properties["capital"], "invalid capital name")
            capital_count += 1
        geometry = feature.get("geometry", {})
        require(geometry.get("type") in {"Polygon", "MultiPolygon"}, "unsupported world geometry")
        for coordinate in all_coordinates(geometry.get("coordinates")):
            coordinate_count += 1
            longitude, latitude = coordinate[:2]
            require(-180.000001 <= longitude <= 180.000001 and -90 <= latitude <= 90, "world coordinate out of range")
    require(coordinate_count > 50_000, "world map geometry is unexpectedly sparse")
    require(capital_count >= 200, "capital coverage is unexpectedly sparse")
    places_source = collection.get("placesSource", {})
    require(places_source.get("dataset") == "Natural Earth 1:10m Populated Places Simple", "place dataset mismatch")
    require(places_source.get("version") == "5.1.2", "place dataset version mismatch")
    require(str(places_source.get("url", "")).startswith("https://naciscdn.org/naturalearth/"), "place dataset URL mismatch")
    places = collection.get("places")
    require(isinstance(places, list) and 2_500 <= len(places) <= 3_500, "unexpected nearby-place count")
    country_codes = {feature["properties"]["code"] for feature in features}
    for place in places:
        require(set(place) == {"n", "c", "a", "x", "y", "q"}, "unexpected nearby-place keys")
        require(isinstance(place["n"], str) and place["n"], "nearby-place name missing")
        require(place["c"] in country_codes, "nearby-place country code mismatch")
        require(isinstance(place["a"], str), "nearby-place admin name invalid")
        require(isinstance(place["x"], (int, float)) and -180 <= place["x"] <= 180, "nearby-place longitude invalid")
        require(isinstance(place["y"], (int, float)) and -90 <= place["y"] <= 90, "nearby-place latitude invalid")
        require(place["q"] in {"c", "a", "p"}, "nearby-place category invalid")
    require(any(place["n"] == "Tokyo" and place["c"] == "JPN" for place in places), "Tokyo reference place missing")
    require(any(place["n"] == "Osh" and place["c"] == "KGZ" for place in places), "Osh comparison place missing")

    overlay = (ROOT / "data/koppen-geiger-1991-2020.png").read_bytes()
    require(overlay.startswith(b"\x89PNG\r\n\x1a\n"), "climate overlay is not PNG")
    width, height = struct.unpack(">II", overlay[16:24])
    require((width, height) == (4096, 4096), "climate overlay dimensions mismatch")
    require(len(overlay) < 500_000, "climate overlay is unexpectedly large")

    climate_manifest = json.loads((ROOT / "data/climate-layers/manifest.json").read_text(encoding="utf-8"))
    require(climate_manifest.get("schema_version") == 1, "climate-layer manifest schema mismatch")
    require(climate_manifest.get("product") == "plant-climate-mesh", "climate-layer manifest product mismatch")
    require(climate_manifest.get("climatology_window") == {"start": 1991, "end": 2020}, "climate-layer period mismatch")
    require(climate_manifest.get("projection") == "EPSG:3857", "climate-layer projection mismatch")
    require(climate_manifest.get("image_size") == [2048, 2048], "climate-layer image size mismatch")
    require(set(climate_manifest.get("layers", {})) == set(CLIMATE_LAYER_KEYS), "climate-layer family mismatch")
    manifest_files = set()
    for key in CLIMATE_LAYER_KEYS:
        layer = climate_manifest["layers"][key]
        require(set(layer.get("periods", {})) == set(CLIMATE_LAYER_PERIODS), f"climate-layer periods mismatch: {key}")
        for period in CLIMATE_LAYER_PERIODS:
            record = layer["periods"][period]
            relative = f"data/climate-layers/{record['file']}"
            require(relative in CLIMATE_LAYER_FILES, f"unexpected climate-layer file: {relative}")
            raw = (ROOT / relative).read_bytes()
            require(raw.startswith(b"\x89PNG\r\n\x1a\n"), f"climate layer is not PNG: {relative}")
            width, height = struct.unpack(">II", raw[16:24])
            require((width, height) == (2048, 2048), f"climate-layer dimensions mismatch: {relative}")
            require(len(raw) == record["bytes"], f"climate-layer byte count mismatch: {relative}")
            require(hashlib.sha256(raw).hexdigest() == record["sha256"], f"climate-layer checksum mismatch: {relative}")
            require(len(raw) < 500_000, f"climate-layer file is unexpectedly large: {relative}")
            manifest_files.add(relative)
    require(manifest_files == CLIMATE_LAYER_FILES, "climate-layer manifest coverage mismatch")

    japan_catalog = json.loads((ROOT / "data/japan-1km/catalog.json").read_text(encoding="utf-8"))
    require(len(japan_catalog["prefixes"]) == 176, "Japan mesh prefix coverage mismatch")
    for prefix, count in japan_catalog["prefixes"].items():
        raw = gzip.decompress((ROOT / f"data/japan-1km/map-{prefix}.bin.gz").read_bytes())
        require(len(raw) == count * (4 + 13 * 3 * 2), f"Japan map chunk length mismatch: {prefix}")
        codes = struct.unpack_from(f"<{count}I", raw)
        require(all(code // 10000 == int(prefix) for code in codes), f"Japan mesh prefix mismatch: {prefix}")
        require(all(first < second for first, second in zip(codes, codes[1:])), f"Japan mesh order mismatch: {prefix}")
        humidity_raw = gzip.decompress((ROOT / f"data/japan-1km/map-humidity-{prefix}.bin.gz").read_bytes())
        require(len(humidity_raw) == count * (4 + 13 * 2), f"Japan humidity map chunk length mismatch: {prefix}")
        require(struct.unpack_from(f"<{count}I", humidity_raw) == codes,
                f"Japan humidity map mesh order mismatch: {prefix}")
        daily_humidity = gzip.decompress((ROOT / f"data/japan-1km/daily-humidity-{prefix}.bin.gz").read_bytes())
        require(len(daily_humidity) == count * 366 * 2, f"Japan daily humidity chunk length mismatch: {prefix}")
    for layer in ("temperature", "precipitation", "solar", "humidity"):
        for period in CLIMATE_LAYER_PERIODS:
            raw = (ROOT / f"data/japan-1km/overview-{layer}-{period}.png").read_bytes()
            require(raw.startswith(b"\x89PNG\r\n\x1a\n") and struct.unpack(">II", raw[16:24]) == (2048, 2048),
                    f"Japan overview image mismatch: {layer}/{period}")
    mask = (ROOT / "data/japan-1km/overview-mask.png").read_bytes()
    require(mask.startswith(b"\x89PNG\r\n\x1a\n") and struct.unpack(">II", mask[16:24]) == (2048, 2048),
            "Japan missing-data mask mismatch")

    require("plant-climate-map/sitemap.xml" in robots, "robots sitemap mismatch")
    require("plant-climate-map/" in sitemap, "sitemap URL mismatch")
    require("deploy-pages@" in workflow and "privacy_gate.py" in workflow, "verified Pages workflow missing")
    require("permissions: {}" in workflow, "workflow must default to no permissions")

    hook = (ROOT / ".githooks/pre-push").read_text(encoding="utf-8")
    require("python3 scripts/privacy_gate.py" in hook, "pre-push privacy gate missing")
    require("git diff --check" in hook, "pre-push whitespace gate missing")

    subprocess.run(["node", "--check", str(ROOT / "app.js")], check=True)
    verify_comparison_math()
    verify_globe_math()
    verify_geography()
    subprocess.run(["node", "--check", str(ROOT / "globe.js")], check=True)
    print(json.dumps({
        "status": "ok",
        "source_files": len(actual_files),
        "deploy_files": len(DEPLOY_FILES),
        "world_features": len(features),
        "world_coordinates": coordinate_count,
        "nearby_places": len(places),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
