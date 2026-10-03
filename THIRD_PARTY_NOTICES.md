# Third-party data notices

## Japan 1 km estimated climate values

The Japan-only temperature (daily mean, maximum and minimum), precipitation, and all-sky solar irradiance values are derived from the Japan Meteorological Agency (JMA) 1991–2020 station daily normals and existing independently estimated monthly 1 km meshes. Japan relative humidity is independently estimated on the same grid from 1991–2020 station daily mean humidity observations and official station monthly normals. They are **not** official JMA daily 1 km normals or observations at every mesh. The public tiles contain only derived mesh values; they do not include station records or source archives. Solar estimates have particularly sparse supporting observations. Humidity values are unavailable in cells too far from the supporting stations; missing cells are not filled with NASA values.

- JMA 1991–2020 normals: <https://www.data.jma.go.jp/stats/data/mdrr/normal/index.html>
- Japan's Standard Regional Mesh: <https://www.stat.go.jp/data/mesh/m_tuite.html>

The 1 km descriptor is the output grid spacing, not a claim of 1 km observational accuracy. This product is not endorsed by JMA.

## NASA POWER

Outside Japan, climate values are retrieved at runtime from the NASA Langley Research Center POWER Project Climatology and Daily APIs. The site requests temperature, corrected precipitation, all-sky surface shortwave downward irradiance, relative humidity, daily maximum temperature, and daily minimum temperature for January 1991 through December 2020. Daily maximum temperature, daily minimum temperature, daily all-sky surface shortwave downward irradiance, and daily mean relative humidity are averaged by calendar day in the browser. Japan selections use the derived 1 km values above for all displayed fields and do not request NASA POWER data.

The global annual and monthly map layers are derived from the public POWER Data v10 monthly Zarr datasets in the NASA POWER AWS Open Data store. Meteorological layers use the MERRA-2 monthly LST source grid. Solar layers combine SRB for 1991–2000 and SYN1deg for 2001–2020, following the source periods used by POWER for the selected 1991–2020 climatology. Source-grid values are aggregated to monthly climatologies and day-weighted annual values, colorized, and reprojected to Web Mercator without smoothing between source cells.

- POWER: <https://power.larc.nasa.gov/>
- Referencing guidance: <https://power.larc.nasa.gov/docs/referencing/>
- NASA Earthdata data use policy: <https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy>
- POWER AWS access: <https://power.larc.nasa.gov/docs/services/aws/>

NASA does not endorse this site. NASA names and identifiers are not used as product branding.

## Natural Earth

The world boundary layer and country names are derived from Natural Earth 1:50m Admin 0 Countries. Capital names and the nearby-place index are derived from Natural Earth 1:10m Populated Places Simple version 5.1.2. The nearby-place index retains places with `SCALERANK <= 5`, admin-0 capitals, or admin-1 capitals. Natural Earth data is in the public domain.

- Source: <https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/>
- Capital source: <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/>
- Terms: <https://www.naturalearthdata.com/about/terms-of-use/>

Country label anchors and regional membership in `data/geography.json` are extracted from Natural Earth 1:50m Admin 0 Countries v5.1.1, using `LABEL_X`, `LABEL_Y`, `LABELRANK` and `SUBREGION`. European and Oceanian subdivisions are combined; Russia remains entirely in the Europe group, explicitly labelled Europe and Russia. Regions keep whole countries, including their offshore territories as represented by the source. Regional outlines remove shared country edges from the existing boundary layer, retaining separate islands. They are navigation guides, not botanical ranges or climate classifications. Capital markers use the existing populated-place records flagged as admin-0 capitals, including multiple capitals and administrative seats. Dense labels are omitted to avoid overlap.

- Rebuild metadata: `python3 scripts/build_geography.py --countries-zip ne_50m_admin_0_countries.zip` (pinned source checksum verified by the script).

Country boundaries are shown only as geographic context and do not express a legal position.

## Plant catalog and native-region guide

The names, accepted taxonomic concepts and native botanical-region lists in `data/plants.json` are adapted from Royal Botanic Gardens, Kew, Plants of the World Online / Kew Names and Taxonomic Backbone / Kew Backbone Distributions (World Checklist of Vascular Plants), checked 2026-09-26. Each plant includes a direct source link. Introduced regions are excluded. Species, natural varieties, subspecies and cultigens are labelled separately. Dracaena trifasciata is the snake-plant species, not the entire former Sansevieria genus. Common genus names are represented by an explicitly named species. Birkin is retained as a requested horticultural name with unresolved species origin and no native outline.

- Kew: <https://powo.science.kew.org/>
- Names and native-region lists: CC BY 3.0, <https://creativecommons.org/licenses/by/3.0/>
- Taxonomic revision, native-region selection, Japanese descriptions and cartographic conversion are our adaptations. Kew does not endorse this site.

### WGSRPD geographic regions

The display-only outlines join the listed botanical regions from the TDWG World Geographical Scheme for Recording Plant Distributions (WGSRPD), Level 3. They are **not** observed or modelled wild-range or habitat boundaries and do not imply presence throughout an enclosed region. Contiguous regions share an outside outline; disconnected regions/islands have separate outlines. Interior holes are omitted. The outer rings are simplified by 0.025 degrees for drawing. No occurrence observations or habitat polygons are distributed.

- TDWG repository: <https://github.com/tdwg/wgsrpd>
- Pinned source: <https://github.com/tdwg/wgsrpd/blob/52da7828aba9d461dd133c27b3bd7a4407161f54/geojson/level3.geojson>
- SHA-256: `c172bcf6aba20e19477adc60aebf0023068f0175dca8480f0760b090dcf64840`
- Source metadata: <https://github.com/tdwg/wgsrpd/blob/52da7828aba9d461dd133c27b3bd7a4407161f54/level3/level3.shp.xml>

TDWG credits R. Brummitt, F. Pando and S. Hollis, and thanks Royal Botanic Gardens, Kew for supplying the shapefiles. The source metadata declares no access or use constraints, but retains this third-party notice: Administrative boundary files are the intellectual property of ESRI and its licensors and are used therein with permission. © 1992–1997 ESRI, GMi. All Rights Reserved. This boundary source is not labelled CC0 or public domain here. Its historical region labels are geographic references, not a legal position. Our union/simplification does not extend the Kew data license to these boundaries.

### Reference ratings and horticultural names

Stars are our **provisional editorial screening** of how readily native climate can inform cultivation, not hardiness ratings, growing suitability scores, evidence confidence scores, or official ratings from the cited institutions. Reasons and source links accompany every entry. The default rating uses distribution breadth, cultigen status and horticultural category; where species/cultivar comparisons are unassessed, that limitation is stated. Individual ratings draw on the linked cultivation guidance or original studies. No universal equality between wild and cultivar temperature tolerance is claimed.

- Tillandsia research covers 20 original species, with species-specific notes and ratings; two previously registered species remain available. Sources include Kew distributions, NC State species profiles, [RHS air-plant guidance](https://www.rhs.org.uk/plants/types/houseplants/air-plants), RHS profiles for T. streptophylla and T. bergeri, [Universidad Francisco Marroquín's T. butzii profile](https://arboretum.ufm.edu/plantas/tillandsia-butzii/), and NParks species profiles and [air-plant guidance](https://www.nparks.gov.sg/publications-resources/articles/eight-air-plants-for-your-home). Genus guidance is identified as such. Fog, dew, elevation, wind, attachment position and drying speed are research/observation factors, not new map layers or measured values in this tool. Natural varieties and forms are distinguished from horticultural hybrids; the displayed regions remain species-wide. No general frost tolerance is inferred from southern South American origin.

- RHS horticultural name references: <https://www.rhs.org.uk/plants/505239/philodendron-birkin-v/details> and <https://www.rhs.org.uk/plants/79003/dracaena-fragrans-massangeana-v/details>
- Annual and perennial flower cultivation guidance: North Carolina Extension Gardener Plant Toolbox, each species page linked in its entry, <https://plants.ces.ncsu.edu/>; Clarkia: <https://www.rhs.org.uk/plants/84578/clarkia-amoena/details>; herbaceous peonies: <https://www.rhs.org.uk/plants/peony/herbaceous/growing-guide>
- Flowering tree cultivation guidance: the same NC State species pages, including cultivar changes to cold tolerance, heat tolerance, chilling requirements and reblooming; Enkianthus: <https://www.rhs.org.uk/plants/6395/enkianthus-perulatus/details>. Winter survival and frost damage to spring flowers are distinguished in our descriptions.
- Australian plant guidance: Australian Native Plants Society (Australia), <https://anpsa.org.au/plant_profiles/>; Australian National Botanic Gardens profiles for Boronia heterophylla and Leucophyta brownii; RHS species profiles for Eucalyptus gunnii and Westringia fruticosa. Leptospermum petersonii habitat is from the Royal Botanic Gardens Sydney's PlantNET. Every individual reference has a direct link in the catalog. Grafted Eremophila, hybrid cultivars and provenance differences are explicitly distinguished from the wild species.
- Succulent guidance: NC State and RHS species profiles, plus SANBI PlantZAfrica, <https://pza.sanbi.org/>. The Haworthia cooperi example is specifically var. picturata; H. cymbiformis and H. truncata guidance is specifically the nominal variety. Their outline still represents the species-level botanical regions. Aeonium arboreum is the wild green-leaved species, with black-leaved garden cultivars distinguished in the note; RHS Aeonium trial results supply that horticultural comparison. These are short factual paraphrases, with no source photos or full profiles redistributed.
- Caudex references: Kew species and subspecies distributions, SANBI PlantZAfrica species profiles and its 2023 succulent identification guide, and NC State profiles for Adenium obesum and Jatropha podagrica. Pachypodium rosulatum subsp. gracilius is distinguished from the parent species and hybrids. Tylecodon reticulatus uses explicitly identified genus-level seasonal guidance. Notes distinguish rooted, established plants on their own roots from unrooted or grafted stock, and exposed tubers from their native underground environment. Direct links accompany the individual factual paraphrases; no source photos or full profiles are redistributed.
- Vegetable cultivation guidance and original studies: direct links in each entry's `reference.sourceUrl`. These supply short factual paraphrases; no source photos, full articles, figures or plant-profile text are redistributed.
- Tagetes patula is treated as a synonym of T. erecta by Kew and as a separate horticultural profile by NC State: <https://powo.science.kew.org/taxon/252146-1>, <https://plants.ces.ncsu.edu/plants/tagetes-patula/>. Both common names resolve to one catalog entry; the note distinguishes their garden groups.

## Köppen–Geiger climate classification

The optional climate-classification overlay is derived from the 1991–2020, 0.1-degree map in Beck et al. (2023). The distributed raster is reprojected to Web Mercator with nearest-neighbour sampling and retains the source class colors. The Figshare dataset is distributed under CC0 1.0.

- Dataset: <https://doi.org/10.6084/m9.figshare.c.6395666>
- Article: <https://doi.org/10.1038/s41597-023-02549-6>
- License: <https://creativecommons.org/publicdomain/zero/1.0/>

Citation: Beck, H. E., McVicar, T. R., Vergopolan, N., et al. (2023), “High-resolution (1 km) Köppen-Geiger maps for 1901–2099 based on constrained CMIP6 projections,” *Scientific Data*, 10, 724.

## Globe projection libraries

D3 geo 3.1.1 and D3 array 3.2.4 are distributed locally, without runtime CDN requests. They provide orthographic projection and clipping. Unmodified release files and license notices are included under `vendor/`.

- D3 geo: https://github.com/d3/d3-geo/tree/v3.1.1
- D3 array: https://github.com/d3/d3-array/tree/v3.2.4
- License notices: `vendor/d3-geo-LICENSE.txt`, `vendor/d3-array-LICENSE.txt`

## GSI context maps and terrain

Runtime viewport tiles from the Geospatial Information Authority of Japan (GSI) are optional display layers. No tile files are redistributed in this repository. Detail maps use `std`; aerial/satellite imagery uses `seamlessphoto`; monochrome relief uses Japan `hillshademap` or global `earthhillshade`; color relief uses Japan `relief`. Overseas color relief is our colorization of GSI global RGB elevation tiles (`demgm_png`) with global hillshade. It does not alter the climate or selected-location values.

- Tile catalog, coverage, credit and use guidance: https://maps.gsi.go.jp/development/ichiran.html
- RGB elevation encoding: https://maps.gsi.go.jp/development/demtile.html
- Detail and satellite coverage outside Japan is limited to global overview zoom levels. Parent-tile crops retain this source resolution when zoomed further. Missing context tiles remain transparent.
- Bathymetry: GEBCO, BODC on behalf of IOC and IHO (2003); Japan Coast Guard permission No. 292502. Global shoreline: NIMA VMAP0, as credited by GSI.
- Satellite imagery: NASA LP DAAC / USGS EROS (https://lpdaac.usgs.gov/data_access); Landsat 8 (GSI, TSIC, GEO Grid/AIST), USGS; GRUS imagery © Axelspace. Ocean relief portions use Japan Coast Guard Hydrographic and Oceanographic Department materials.

GSI and these providers do not endorse this tool. Context maps are geographic imagery, not current observations or climate data. Tile requests include the viewed area tile numbers and ordinary network information; they are made only while the corresponding map or terrain layer has nonzero opacity.
