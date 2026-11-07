### Calendar

Use Calendar for availability and bookings:

```typescript
const calendar = await piezas.calendar.createCalendar({
  name: 'Team bookings',
  timezone: 'America/Vancouver',
});

await piezas.calendar.createAvailabilityRule({
  calendarId: calendar.id,
  ruleType: 'recurring',
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
});

const slots = await piezas.calendar.getAvailableSlots({
  calendarId: calendar.id,
  dateFrom: '2026-05-25T00:00:00Z',
  dateTo: '2026-05-26T00:00:00Z',
  slotDuration: 30,
});

await piezas.calendar.createBooking({
  calendarId: calendar.id,
  title: 'Intro call',
  startTime: slots[0].start,
  endTime: slots[0].end,
  requireAvailableSlot: true,
});
```

### Platform Contract Rules - Calendar

Hard rules learned from production apps. Each one prevents a class of bug that
looks like "the platform is broken" and costs hours to trace. Rule numbers are
stable across the whole contract; they are grouped here by topic.

- **Rule 2 — Calendar reminders have NO default.** Empty/absent `reminder_offsets_minutes`
  means no reminders ever fire. If your product expects reminders, set it
  explicitly at calendar creation — most apps want `[1440, 60]` (24h + 1h).
- **Rule 3 — Slot duration: pass it explicitly, everywhere you need it.**
  `CalendarSettings.slot_duration_minutes` is stored but never consulted by
  slot computation. The slots endpoint uses its `slot_duration` query param
  (default 30); the booking-time re-check uses `availability.slotDurationMinutes`
  (default: the start/end span). Send the value you mean to both.
- **Rule 4 — Branch on `error.code`, never on error text.** Error strings (e.g. the
  booking 409 messages) are human documentation and may change. Every
  `@piezas/sdk` (0.4+) error carries a stable `code` (`conflict`, `not_found`,
  `validation_failed`, `rate_limited`, ...); HTTP errors also keep `status`. A
  booking 409 (`code: 'conflict'`) = the time is taken → re-fetch slots and
  offer alternatives.
