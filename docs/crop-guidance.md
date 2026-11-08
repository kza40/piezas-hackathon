# Crop guidance and its limits

The app publishes agronomic thresholds only when a suitable source supports both
the crop and the measurement being compared. A missing value means the app has no
validated threshold; it must not be filled with a generic guess.

## Values currently published

| Crop | Preferred soil pH | Basis |
|---|---:|---|
| Wheat | 5.8–6.5 | BC Ministry of Agriculture pH preference table |
| Barley | 5.8–6.5 | BC Ministry of Agriculture pH preference table |
| Oats | 5.8–6.5 | BC Ministry of Agriculture pH preference table |
| Alfalfa | 6.5–7.5 | BC Ministry of Agriculture pH preference table |
| Highbush blueberries | 4.5–5.2 | BC blueberry production guide |
| Canola | Not set | The selected BC pH preference table does not give a target range. A cited tolerance point is not an optimum range. |

The pH source cautions that crops may tolerate values outside its preferred
ranges. These ranges are screening guidance, not a substitute for a soil test
or local agronomist's advice.

## Values intentionally unset

- **Soil moisture min/max:** The app's sensor unit is volumetric percentage, but
  a useful irrigation trigger depends on soil texture, rooting depth, sensor
  depth and calibration, crop stage, weather, and irrigation system. BC guidance
  recommends site- and crop-specific scheduling and notes that surface moisture
  alone is not enough. The current profiles therefore do not claim universal
  VWC thresholds.
- **Soil EC maximum:** EC depends on the extraction method and crop. BC's
  blueberry guide's EC below 1.2 dS/m is a limit for *irrigation water*, not a
  soil-sensor threshold. The app's current soil EC series does not record a lab
  method, so comparing it with that water limit would be misleading.
- **Frost temperature:** Injury thresholds vary by crop and developmental
  stage. BC's frost guide, for example, gives a blueberry threshold at the
  showing-colour stage, while other blueberry stages have different values.
  The app's crop profile is not yet stage-specific, so a single value is not
  published.

Before adding a moisture or EC warning, record the sensor's measurement method,
installation depth, and field calibration. Before adding frost warnings, map
the field's actual growth stage to a source-backed critical temperature.

## References

- [BC Ministry of Agriculture, Soil pH (Factsheet 637.100-1)](https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/agriculture-and-seafood/agricultural-land-and-environment/soil-nutrients/600-series/637100-1_soil_ph.pdf) — preferred ranges for blueberries, cereal grains, and alfalfa.
- [BC Ministry of Agriculture, Blueberry production guide](https://www2.gov.bc.ca/gov/content/industry/agriculture-seafood/agriservice-bc/production-guides/berries/blueberry) — blueberry pH, irrigation, water quality, and the factors needed to schedule irrigation.
- [BC Ministry of Agriculture, Irrigation scheduling](https://www2.gov.bc.ca/gov/content/industry/agriculture-seafood/agricultural-land-and-environment/water/irrigation) — schedule by farm location, crop, soil, and local climate.
- [BC Ministry of Agriculture, Key drought management tips](https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/agriculture-and-seafood/agricultural-land-and-environment/water/drought/665000-2_key_drought_mgmt_tips-drought_factsheet_no2.pdf) — use measured soil moisture or ET and account for rooting depth, crop, and soil.
- [BC Ministry of Agriculture, Frost Protection Guide](https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/agriculture-and-seafood/agricultural-land-and-environment/water/irrigation/670100-1_bc_frost_protection_guide.pdf) — critical temperatures vary by crop stage.
- [BC Ministry of Agriculture, Soil and plant tissue testing methods](https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/agriculture-and-seafood/agricultural-land-and-environment/soil-nutrients/600-series/634200-3_soil_and_plant_tissue_testing_methods.pdf) — EC values depend on soil extraction method.
