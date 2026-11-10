# Synthetic data scenarios

- Moisture contrast: North Block (`field_1a`); the final readings only are set to 27.4% (Row 3) and 39.2% (Row 6), so Row 3 drops about 7 points in its last hour; over the day the two probes agree within a few points. These are fixture values, not calibrated irrigation thresholds.
- Typical demo field: West Slope (`field_3b`); probe pH values are within the published blueberry preference; EC is illustrative only.
- pH above preference: Creekside (`field_1b`), Row 3 pH is 6.5.
- Elevated EC example: East Rows (`field_2a`), Row 3 EC is 1.35 dS/m; no soil salinity classification is implied.
- Stale sensor: `sensor_2a2` last reports soil moisture 8 hours before now.
- Dead sensor: `sensor_2b2` has no readings in the final 3 days.
- Gaps: `sensor_1b1` soil EC omits one hour.
- Glitch: `sensor_2b1` soil moisture has one 90% reading, a week before now (hour 168).
- Cold night: `sensor_3air` ends with -1.8 C; farm 3's forecast includes sub-zero periods. This is not a crop-stage frost warning.
- Rain event: farm 2 has rain in forecast hours 13 to 20, and moisture rises around the matching rain event in the historical series.

Fixed random seed: 20261107. Generated now: 2026-11-08T03:00:00Z.
