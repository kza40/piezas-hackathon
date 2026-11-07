# Product Spec

<!--
Piezas SPEC.md — the contract this app is built, tested and shipped against.
`npx piezas spec check` enforces these formats:

  Requirement   - R-001: <one testable claim, in the customer's words>
  Scenario      ### S-002: <short title>
                covers: R-001, R-003
                Given <starting state>
                When <the action>
                Then <the observable result>

Rules the checker applies:
  SPEC02  at least one "- R-nnn:" line under "## Requirements"
  SPEC03  every "### S-nnn:" block has Given, When and Then lines
  SPEC04  every R-nnn is named by the "covers:" line of some scenario
  SPEC05  no unresolved markers anywhere: TBD, TODO, UNRESOLVED, [?]
  SPEC06  "## Open Conflicts" reads "none"

Write provenance next to each claim (which artifact or which person it came
from). List what the app keeps under "## Data" (one line per kind of record:
"- Contact: name, email, phone"); the made-up test data is generated from it.
A scenario that depends on an outside service (Google or Microsoft sign-in,
Stripe, a real inbox, another company's system) gets a "needs: <service>" line.
Later, `npx piezas test` creates a failing test per S-nnn in tests/scenarios/
and the app goes live only when they pass.
-->

## Overview

<!-- Two or three sentences: who uses this, and what job it does for them. -->

## Requirements

<!-- One line per claim, in business language, each independently testable:
     - R-001: A guest can reserve a table for a given date and time.
     - R-002: Staff can cancel a reservation and free the slot. -->

## Data

<!-- One line per kind of record the app keeps, with its fields:
     - Reservation: guest name, email, date, party size, status -->

## Acceptance Scenarios

### S-001: Example — replace this with a real scenario

covers: R-001
Given a staff member signed in to the dashboard
When they open today's reservations
Then the reservations appear in time order

## Open Conflicts

none
