# Synthetic data brief: farm sensor app

We are building a web app for farmers (starting with BC blueberry growers). Soil and air sensors in the fields send readings; the app shows each sensor, warns about soil problems and frost, and tells the farmer whether to water. We have no real sensors yet, so we need realistic fake data in the exact shapes below. Later, real hardware will send readings in the same shape, so please keep the shapes exact.

## What to deliver

Either of these is fine; the second is better:

1. Static files: `crop_profiles.json`, `farms.json`, `fields.json`, `sensors.json`, `readings.csv` (and optionally `weather_forecast.json`, `weather_history.json`).
2. A script (TypeScript or Python) that writes those same files and takes a `--now` timestamp (default: the current time), so that readings always end at "now" and the "last 6 hours" rules stay testable. Put the generator in `scripts/synthetic/` and its output in `data/synthetic/`. (Piezas has its own `scripts/seed.ts` for loading test data; leave that file alone, we will load your output from it later.)

Use a fixed random seed so the output is repeatable.

## Conventions

- Ids are short lowercase strings, such as `farm_1`, `field_1a`, `sensor_1a1`.
- Times are ISO 8601 in UTC, such as `2026-11-07T18:00:00Z`.
- Numbers are plain decimals (no units inside the number).
- Each reading type has one fixed unit:

| type | unit | typical range |
|---|---|---|
| `soil_moisture` | `%` (volumetric water content) | 5 to 50 |
| `soil_temperature` | `C` | -2 to 30 |
| `soil_ec` | `dS/m` | 0.1 to 3.0 |
| `soil_ph` | `pH` | 3.5 to 8.0 |
| `air_temperature` | `C` | -10 to 40 |
| `air_humidity` | `%` (relative humidity) | 20 to 100 |

## Shapes

### crop_profiles.json (array)

The blueberry numbers are placeholders until we check them against BC sources. Keep them in this file so they are easy to change.

```json
[
  {
    "id": "crop_blueberry",
    "crop_name": "Blueberry",
    "moisture_min": 35,
    "moisture_max": 50,
    "ph_min": 4.5,
    "ph_max": 5.5,
    "ec_max": 1.0,
    "frost_risk_temp_c": 0
  }
]
```

### farms.json (array)

Use 3 farms in blueberry areas of BC. The farms are fictional; the locations are real places.

```json
[
  { "id": "farm_1", "name": "Fraser Ridge Berries", "latitude": 49.05, "longitude": -122.30, "owner_id": "owner_demo_1" }
]
```

Suggested locations: Abbotsford (49.05, -122.30), Pitt Meadows (49.22, -122.69), Richmond (49.17, -123.14). Use `owner_demo_1` for two farms and `owner_demo_2` for the third, so we can test that farmers only see their own data.

### fields.json (array)

2 fields per farm. All use `crop_blueberry`.

```json
[
  { "id": "field_1a", "farm_id": "farm_1", "name": "North block", "crop_profile_id": "crop_blueberry", "owner_id": "owner_demo_1" }
]
```

### sensors.json (array)

2 to 4 sensors per field. A sensor is one physical probe and may report several types. Use a mix: most probes report all four soil types, and one per farm is an air-only station.

```json
[
  {
    "id": "sensor_1a1",
    "field_id": "field_1a",
    "name": "Row 3 probe",
    "reports": ["soil_moisture", "soil_temperature", "soil_ec", "soil_ph"],
    "owner_id": "owner_demo_1"
  }
]
```

Device keys are created by the app, so do not generate them.

### readings.csv

One row per reading, header row first. Hourly readings for 14 days ending at `now`. Sort by time.

```csv
sensor_id,type,value,unit,time,source
sensor_1a1,soil_moisture,27.4,%,2026-11-07T17:00:00Z,simulated
sensor_1a1,soil_ph,5.1,pH,2026-11-07T17:00:00Z,simulated
```

`source` is always `simulated`.

### weather_forecast.json (optional, for offline demos and tests)

One entry per farm: hourly values for the next 48 hours from `now`.

```json
[
  {
    "farm_id": "farm_1",
    "hours": [
      { "time": "2026-11-07T19:00:00Z", "temp_c": 6.2, "rain_mm": 0.0 }
    ]
  }
]
```

### weather_history.json (optional)

One entry per farm and week of the year (1 to 52), typical values over past years. Used for planting advice.

```json
[
  { "farm_id": "farm_1", "week": 14, "avg_temp_c": 8.5, "avg_low_c": 3.1, "frost_chance_pct": 20, "avg_rain_mm": 28 }
]
```

## What the data should look like

- Soil moisture drops slowly on dry days and jumps up after rain or irrigation. Soil temperature follows air temperature, but smoother and delayed. Air temperature and humidity follow a daily cycle, and humidity is highest when it is coldest.
- Soil pH changes very slowly (about 0.05 per day at most). Soil EC changes slowly and spikes briefly after fertilizer.
- Add small sensor noise to every series.
- Different sensors in the same field should differ a little (different spots), for example a few percent in soil moisture.

## Story cases (the app's tests and demo depend on these)

Please make sure these exist, and label each with a short comment or a `scenarios.md` note saying which sensors and fields they are:

1. **Dry field:** at least one field where one sensor's latest soil moisture is below 35 and another sensor in the same field is within range.
2. **Healthy field:** all sensors within range (moisture 35 to 50, pH 4.5 to 5.5, EC under 1.0).
3. **pH too high:** one field with latest pH around 6.5.
4. **Salty soil:** one field with latest EC above 1.0.
5. **Stale sensor:** one sensor whose last soil moisture reading is about 8 hours before `now`.
6. **Dead sensor:** one sensor with no readings in the last 3 days, with older readings before that.
7. **Gaps:** a few missing hours in a few series.
8. **Glitch:** a few spikes (for example soil moisture jumping to 90 for one reading) in one series.
9. **Cold night:** an air temperature series that drops below 0 C overnight (and, if you do the forecast file, one farm with a forecast low at or below 0 C and one with a mild night).
10. **Rain event:** a stretch of rain in the forecast file, and soil moisture rising in the readings that match it.

## Questions to send back

- If the sensors you have in mind report different types or units from the table above, tell us before generating.
- Tell us the random seed and the `now` you used.
