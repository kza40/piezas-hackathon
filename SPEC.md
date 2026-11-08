# Product Spec

## Overview

A web app for farmers growing wheat, canola, barley, oats, alfalfa or blueberries that collects soil and air readings from sensors in their fields, shows what each sensor is reporting, combines the readings with weather data, and tells the farmer in plain words when to water each field, when frost is coming, and which weeks are best to plant. Planting advice is a recommendation only. Readings come from a simulator at first, through the same ingest endpoint that real sensor hardware will use later.
Provenance: idea and decisions from the team's planning chat, 2026-11-07.

## Requirements

- R-001: A farmer can sign up and sign in with an email and password. (source: team decision)
- R-002: A farmer can create a farm with a name and a location, and add fields to it. (source: team decision)
- R-003: Each field has one of six crop profiles. Profiles show only sourced guidance: preferred soil pH is 5.8–6.5 for wheat, barley and oats; 6.5–7.5 for alfalfa; and 4.5–5.2 for highbush blueberries. The selected BC source does not give a canola preference range. Soil-moisture triggers require field and sensor calibration; soil EC requires a defined measurement method; frost thresholds require crop stage. Those values remain unset until configured from appropriate evidence. (source: BC Ministry of Agriculture factsheets and production guides; see `docs/crop-guidance.md`)
- R-004: A farmer can register a sensor on a field and receive a device key for it; the farmer can revoke that key. A sensor is one physical device and can report any of the six reading types. (source: real-equipment plan, review fix 1)
- R-005: The app accepts a sensor reading (device, type, value, unit, time) through an ingest endpoint when the device key is valid, and rejects it when the key is missing, wrong or revoked. (source: real-equipment plan)
- R-006: A built-in simulator can generate realistic readings of all six reading types for a field's sensors in the same format as real devices. (source: team decision, simulated data first)
- R-007: A field page shows, for each sensor, its latest reading of each type it reports and a trend over the last 7 days. (source: team decision, each sensor shown separately)
- R-008: The app shows the weather forecast for the farm's location, including expected rain over the next 48 hours and the overnight low. (source: team decision, uses weather data)
- R-009: A field shows "Water today" or "Wait" only when a field-specific soil-moisture trigger has been calibrated and saved. The recommendation uses the 48-hour rain forecast and the driest fresh reading from the calibrated sensor depth; its reason names that sensor. Without a configured trigger, show the reading and explain that irrigation guidance is not configured. (source: BC irrigation guidance; see `docs/crop-guidance.md`)
- R-010: Each field shows a ranked list of the best weeks to plant its crop, with the reason for each, based on typical historical weather at the farm's location (frost risk, temperature and rain). This is a recommendation only; the app does not store planting dates. The method is rule-based for now and can be replaced later without changing the page. (source: team decision, review fix 5)
- R-011: When a field's recommendation becomes "Water today", the farmer sees one in-app alert for that field and can mark it done. Opening the page again does not create a second open alert for the same field. (source: team decision, review fix 6)
- R-012: A farmer can see only their own farms, fields, sensors and alerts. (source: platform rule)
- R-013: The app supports six reading types: soil moisture, soil temperature, soil EC, soil pH, air temperature and air humidity, each in one fixed unit (percent for soil moisture and air humidity, degrees Celsius for soil and air temperature, dS/m for soil EC, and pH). A reading of any other type is rejected. (source: team decision, tier 1 factors)
- R-014: A field page shows a plain-words pH warning when a supported crop pH preference is exceeded. It shows a salt warning only when the EC reading and crop limit use a documented, matching test method; otherwise it does not infer a soil-salinity warning from an uncalibrated sensor value. (source: BC soil-testing and crop guidance; see `docs/crop-guidance.md`)
- R-015: A soil moisture reading older than 6 hours counts as stale. A sensor with only stale readings is marked "No recent reading" on the field page and is left out of the watering recommendation. When no sensor in a field has a fresh soil moisture reading, the field shows "No recent reading" instead of "Water today" or "Wait", and no watering alert is created. (source: review fix 3)
- R-016: A field page shows a frost warning only when the crop stage and a sourced critical temperature are available, and a forecast overnight low in the next 48 hours reaches that threshold. Otherwise the app does not claim a crop-specific frost threshold. (source: BC frost-protection guidance; see `docs/crop-guidance.md`)
- R-017: A wrong email or password keeps the farmer on the sign-in screen with an error. (source: frontend branch)
- R-018: Signing out returns the farmer to the sign-in screen and hides the farm. (source: frontend branch)
- R-019: A signed-in farmer can remove one of their fields, and it no longer appears on their farm. (source: frontend branch)
- R-020: A farmer can keep a name and a phone number on their profile. (source: frontend branch)

## Data

Farmer accounts (name, email, password) are held by Piezas's user service and are not stored as records here. Every record below carries the owner id of the signed-in farmer.

- Crop profile: crop name and sourced guidance where available (soil-moisture min/max, pH min/max, EC max with measurement method, frost-risk temperature with crop stage); unset thresholds are omitted
- Farm: name, location (latitude, longitude)
- Profile: name, phone
- Field: name, farm, crop profile, acres, growth stage, soil type
- Sensor: name, field, device key status (active or revoked)
- Reading: sensor, type (soil moisture, soil temperature, soil EC, soil pH, air temperature, air humidity), value, unit, time, source (real or simulated)
- Alert: field, message, created time, status (open or done)

## Acceptance Scenarios

### S-001: Farmer signs up and sees an empty dashboard
covers: R-001
Given a visitor with no account
When they sign up with an email and password
Then they are signed in and see a dashboard with no farms yet

### S-002: Farmer creates a farm and a blueberry field with sourced pH guidance
covers: R-002, R-003
Given a signed-in farmer with no farms
When they create a farm with a location and add a field using the blueberry profile
Then the field appears under the farm with the blueberry pH preference shown and no uncalibrated moisture target

### S-003: Farmer registers a sensor and gets a device key
covers: R-004
Given a signed-in farmer with a field
When they register a sensor on the field
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

### S-006: Simulator fills each sensor with readings
covers: R-006, R-007
Given a field with two registered sensors and no readings
When the farmer starts the simulator for the field
Then each sensor on the field page shows its own latest reading of every type it reports, each with a 7-day trend

### S-007: Calibrated dry soil and no rain gives Water today
covers: R-008, R-009
needs: calibrated field moisture trigger and weather forecast service
Given a blueberry field with two calibrated sensors, one below its configured trigger and one within range, and a forecast with no rain in the next 48 hours
When the farmer opens the field page
Then the field shows "Water today" and a reason that names the dry sensor, the low moisture and the dry forecast

### S-008: Calibrated dry soil but rain coming gives Wait
covers: R-008, R-009
needs: calibrated field moisture trigger and weather forecast service
Given a blueberry field whose latest calibrated soil moisture is below its configured trigger, and a forecast with heavy rain in the next 48 hours
When the farmer opens the field page
Then the field shows "Wait" and a reason that mentions the coming rain

### S-009: Planting weeks are ranked with reasons
covers: R-010
needs: weather history service
Given a farm with a location and a field using the blueberry profile
When the farmer opens the planting advice for the field
Then a ranked list of weeks is shown, each week has a plain-words reason, and no planting date is saved

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

### S-012: Only the six reading types are accepted
covers: R-013
Given a registered sensor with an active device key
When a reading of each of the six supported types is sent, and then a reading of an unsupported type
Then the six readings are saved and the unsupported one is rejected with an error

### S-013: Out-of-range pH shows a soil warning
covers: R-014
Given a blueberry field whose latest soil pH is 6.5
When the farmer opens the field page
Then a soil warning explains that the pH is above the blueberry preference range

### S-014: In-range soil pH shows no pH warning
covers: R-014
Given a blueberry field whose latest soil pH is 5.0
When the farmer opens the field page
Then no pH warning is shown

### S-015: Stale readings give No recent reading
covers: R-015
Given a blueberry field whose only sensor last reported soil moisture 8 hours ago
When the farmer opens the field page
Then the sensor is marked "No recent reading", the field shows "No recent reading" instead of a watering recommendation, and no watering alert is created

### S-016: Cold forecast at a sourced crop stage shows a frost warning
covers: R-016
needs: weather forecast service and a sourced crop-stage critical temperature
Given a blueberry field at a stage with a known critical temperature and a forecast overnight low at or below that temperature within 48 hours
When the farmer opens the field page
Then a frost warning is shown with the forecast low

### S-017: Mild forecast above the sourced crop-stage threshold shows no frost warning
covers: R-016
needs: weather forecast service and a sourced crop-stage critical temperature
Given a blueberry field at a stage with a known critical temperature and a forecast overnight low above that temperature for the next 48 hours
When the farmer opens the field page
Then no frost warning is shown

### S-018: Repeat visits do not duplicate the watering alert
covers: R-011
needs: weather forecast service
Given a blueberry field whose recommendation is "Water today"
When the farmer opens the field page three times
Then exactly one open watering alert exists for the field

### S-019: Farmer signs in and opens their farm
covers: R-001
Given a demo farmer account with a farm
When they enter its email and password on the sign-in screen and submit
Then the farm map for their farm is shown

### S-020: Wrong password is rejected
covers: R-017
Given a visitor on the sign-in screen
When they enter a known email with the wrong password and submit
Then they stay on the sign-in screen and see an error

### S-021: Sign out leaves the farm
covers: R-018
Given a farmer signed in on the farm map
When they sign out
Then the sign-in screen is shown again and the farm is no longer reachable

### S-022: Farmer adds and removes a field from their profile
covers: R-002, R-019
Given a signed-in farmer on their profile
When they add a field named South Pasture with the crop Oats
Then South Pasture appears in their field list
When they remove South Pasture
Then it no longer appears in their field list

### S-023: Profile details are saved
covers: R-020
Given a signed-in farmer on their profile
When they save a name and a phone number and reload the page
Then the same name and phone number are shown

## Open Conflicts

none
