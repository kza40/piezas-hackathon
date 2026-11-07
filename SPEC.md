# Product Spec

## Overview

A web app for farmers (starting with BC blueberry growers) that collects soil and air readings from sensors in their fields, combines them with the weather forecast, and tells the farmer in plain words when to water each field and which week is best to plant. Readings come from a simulator at first, through the same ingest endpoint that real sensor hardware will use later.
Provenance: idea and decisions from the team's planning chat, 2026-11-07.

## Requirements

- R-001: A farmer can sign up and sign in with an email and password. (source: team decision)
- R-002: A farmer can create a farm with a name and a location, and add fields to it. (source: team decision)
- R-003: Each field has a crop profile; blueberry is provided, with a target soil moisture range, a soil pH range and a frost-risk temperature. (source: team decision, blueberry first)
- R-004: A farmer can register a sensor on a field and receive a device key for it; the farmer can revoke that key. (source: real-equipment plan)
- R-005: The app accepts a sensor reading (device, type, value, unit, time) through an ingest endpoint when the device key is valid, and rejects it when the key is missing, wrong or revoked. (source: real-equipment plan)
- R-006: A built-in simulator can generate realistic readings for a field's sensors in the same format as real devices. (source: team decision, simulated data first)
- R-007: A field page shows the latest reading of each type and a trend over the last 7 days. (source: team decision)
- R-008: The app shows the weather forecast for the farm's location, including expected rain over the next 48 hours and the overnight low. (source: team decision, uses weather data)
- R-009: Each field shows a "Water today" or "Wait" recommendation with the reason in plain words, based on the latest soil moisture, the crop's moisture range and the 48-hour rain forecast. (source: team decision)
- R-010: Each field shows a ranked list of the best planting weeks for its crop, with the reason for each, based on soil temperature, frost risk and expected rain. The method is rule-based for now and can be replaced later without changing the page. (source: team decision, method left open)
- R-011: When a field needs water, the farmer sees an in-app alert and can mark it done. (source: team decision, in-app alerts only)
- R-012: A farmer can see only their own farms, fields, sensors and alerts. (source: platform rule)

## Data

- Farmer: name, email, owner id
- Farm: name, location (latitude, longitude), owner id
- Crop profile: crop name, moisture min, moisture max, pH min, pH max, frost-risk temperature
- Field: name, farm, crop profile, planting date
- Sensor: name, field, reading type, device key status (active or revoked)
- Reading: sensor, type, value, unit, time, source (real or simulated)
- Alert: field, message, created time, status (open or done)

## Acceptance Scenarios

### S-001: Farmer signs up and sees an empty dashboard
covers: R-001
Given a visitor with no account
When they sign up with an email and password
Then they are signed in and see a dashboard with no farms yet

### S-002: Farmer creates a farm and a blueberry field
covers: R-002, R-003
Given a signed-in farmer with no farms
When they create a farm with a location and add a field using the blueberry profile
Then the field appears under the farm with the blueberry moisture and pH ranges shown

### S-003: Farmer registers a sensor and gets a device key
covers: R-004
Given a signed-in farmer with a field
When they register a soil moisture sensor on the field
Then a device key is shown once and the sensor is listed as active

### S-004: Valid key is accepted, bad key is rejected
covers: R-005
Given a registered sensor with an active device key
When a reading is sent with that key, and another is sent with a wrong key
Then the first reading is saved and the second is rejected with an error

### S-005: Revoked key stops working
covers: R-004, R-005
Given a registered sensor
When the farmer revokes its key and a reading is then sent with that key
Then the reading is rejected

### S-006: Simulator fills a field with readings
covers: R-006, R-007
Given a field with a soil moisture sensor and no readings
When the farmer starts the simulator for the field
Then readings appear on the field page with the latest value and a 7-day trend

### S-007: Dry soil and no rain gives Water today
covers: R-008, R-009
needs: weather forecast service
Given a blueberry field whose latest soil moisture is below the blueberry minimum, and a forecast with no rain in the next 48 hours
When the farmer opens the field page
Then the field shows "Water today" and a reason that mentions the low moisture and the dry forecast

### S-008: Dry soil but rain coming gives Wait
covers: R-008, R-009
needs: weather forecast service
Given a blueberry field whose latest soil moisture is below the blueberry minimum, and a forecast with heavy rain in the next 48 hours
When the farmer opens the field page
Then the field shows "Wait" and a reason that mentions the coming rain

### S-009: Planting weeks are ranked with reasons
covers: R-010
needs: weather forecast service
Given a farm with a location and a field using the blueberry profile
When the farmer opens the planting advice for the field
Then a ranked list of weeks is shown and each week has a plain-words reason

### S-010: Watering alert can be marked done
covers: R-011
Given a field that has been flagged as needing water
When the farmer opens the alerts list and marks the alert done
Then the alert moves from open to done and no longer counts as open

### S-011: Farmers cannot see each other's data
covers: R-012
Given two farmers who each have a farm
When the first farmer signs in and lists farms, fields, sensors and alerts
Then only the first farmer's own items appear

## Open Conflicts

none
