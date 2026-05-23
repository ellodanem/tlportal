# Traqcare — Live Tracking API

Reference for Traqcare’s **Live Tracking** HTTP API (from vendor PDF *Live Tracking API Documentation*).  
**TL Portal today:** portal links only (`ProviderDeviceLink`, `lib/adapters/gps/traqcare/adapter.ts`) — **no live API calls yet**.

---

## Overview

| Item | Value |
|------|--------|
| **Purpose** | Fetch current live position / status for one or more tracked objects |
| **Method** | `GET` |
| **Path** | `/live` (on vendor `{BASE_URL}`) |
| **Auth** | API key as query parameter `key` (not `Authorization` header) |
| **Response** | JSON object: `{ "data": [ … ], "count": number }` |

Full URL pattern:

```http
GET {BASE_URL}/live?key={API_KEY}&clientid=…&imei=…&oname=…&includeSubClients=false&attributes=…
```

`{BASE_URL}` is the **tracking API prefix** Traqcare assigns (host + API version path). It is **not** the same as the staff portal URL (`traqcarePortalUrl` / `ProviderDeviceLink.portalUrl` → often `https://www.traqcare.com/`).

### TL-confirmed base (2026-05-23)

Vendor supplied for TL Portal integration:

| Item | Value |
|------|--------|
| **Base URL** | `https://a1.traqcare.com/v2.12/tracking` |
| **Minimal live call** | `GET https://a1.traqcare.com/v2.12/tracking/live?key={API_KEY}` |

Use env `TRAQCARE_LIVE_API_BASE_URL` = that base **without** a trailing slash; the app appends `/live`. Store the real `key` in `TRAQCARE_LIVE_API_KEY` only (`.env` / Vercel secrets) — **never** commit the production key to git or this doc.

---

## Query parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | **Yes** | API key for authorization |
| `clientid` | string | No | In the vendor PDF only. **TL smoke test (2026-05-23) on `v2.12/tracking/live`:** `400` — `"clientid" is not allowed`. Confirm correct filter name with Traqcare before relying on fleet filtering. |
| `imei` | string | No | Device IMEI (matches TL `Device.imei` when applicable) |
| `oname` | string | No | Object name in Traqcare (e.g. `GT11`, `AR5221XXX`) |
| `includeSubClients` | boolean | No | Include sub-client data (`true` / `false`) |
| `attributes` | string | No | Comma-separated extra keys returned under `additionInfo` (see below) |

### Example request (from vendor doc)

```text
https://{BASE_URL}/live?key=ea340xxx-1b16-44cf-xxxx-c61b944dx586&clientid=66792bb8c6ccef30453xxxxx&imei=864943043626569&oname=AR5221XXX&includeSubClients=false&attributes=pressureHigh,pressureLow,heartRate,temp1,bloodOxygen
```

### `attributes` (optional telemetry)

When set, matching fields may appear on each row under `additionInfo`. Vendor example list:

`pressureHigh`, `pressureLow`, `heartRate`, `temp1`, `bloodOxygen`

Only request attributes your hardware actually reports.

---

## Response shape

### Top level

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | Live tracking records |
| `count` | number | Number of entries in `data` |

### Each element of `data`

| Field | Type | Notes |
|-------|------|--------|
| `address` | string | Reverse-geocoded or vendor address text |
| `serverTime` | string | ISO 8601 UTC (e.g. `2025-07-15T06:06:55.076Z`) |
| `lat` | number | Latitude |
| `lng` | number | Longitude |
| `orientation` | number | Heading / bearing |
| `speed` | number | Speed (vendor units; often km/h when stationary = 0) |
| `vehicleStatus` | string | Short code (example: `"s"` = stopped) |
| `vehicleStatusStart` | string | ISO 8601 when current status began |
| `objectName` | string | Traqcare object label |
| `deviceId` | string | Vendor device id (may differ from IMEI) |
| `cumulativeDistance` | number | Total distance |
| `additionInfo` | object | Extra fields (e.g. from `attributes` query) |
| `nearPois` | object | Nearby POIs (may be empty `{}`) |
| `acc` | number | Example: ignition / accessory (0/1) |
| `power` | number | Example: external power state |
| `voltage_level` | number | Example: battery / voltage indicator |

Types in the wild: some numeric-looking values are **strings** (e.g. `pressureHigh`: `"125"`). Parse defensively in TL code.

### Example response (abbreviated)

```json
{
  "data": [
    {
      "acc": 0,
      "power": 0,
      "address": "…",
      "serverTime": "2025-07-15T06:06:55.076Z",
      "lat": 25.095279,
      "lng": 55.1588632,
      "orientation": 0,
      "speed": 0,
      "voltage_level": 45,
      "vehicleStatus": "s",
      "vehicleStatusStart": "2025-07-11T11:58:18.000Z",
      "objectName": "GT11",
      "deviceId": "9705332549",
      "cumulativeDistance": 100.1829,
      "additionInfo": {
        "pressureHigh": "125",
        "pressureLow": "68",
        "heartRate": 79,
        "temp1": 1,
        "bloodOxygen": 99
      },
      "nearPois": {}
    }
  ],
  "count": 1
}
```

---

## Mapping to TL Portal (when implemented)

| Traqcare API | TL Portal field / concept |
|--------------|---------------------------|
| `imei` | `Device.imei` |
| `clientid` | `Customer.traqcareClientId` (edit customer once). Optional per-device override: `ProviderDeviceLink.externalAccountRef`. Not in `.env`. |
| `oname` | Traqcare object name on the device row — `ProviderDeviceLink.externalDeviceId` when it is the object label (not always IMEI) |
| `imei` | `Device.imei` when the unit reports IMEI |
| `deviceId` | Vendor id if different from IMEI — store on link metadata |
| Portal UI | `ProviderDeviceLink.portalUrl` → `resolveGpsPortalUrl()` (today) |

Suggested env (not implemented):

```bash
TRAQCARE_LIVE_API_BASE_URL=https://a1.traqcare.com/v2.12/tracking
TRAQCARE_LIVE_API_KEY=your-uuid-from-traqcare
```

Keep keys **server-only** (cron, API routes, services) — never expose to the browser.

---

## Implementation notes (future)

1. Add `fetchLivePositions()` under `lib/adapters/gps/traqcare/` (extend `GpsPort` or sibling module).
2. Call from server-only code (device detail, customer fleet summary, optional cron cache).
3. Respect rate limits (vendor doc silent — cache snapshots, avoid per-page hammering).
4. Phase 1 architecture explicitly deferred **telemetry ingest**; this API is the likely source when ingest is approved.

**Out of scope for a first slice:** historical trips, geofences, commands, customer-facing map tiles.

---

## Related TL Portal docs

| Doc | Topic |
|-----|--------|
| [vendor-agnostic-architecture.md](./vendor-agnostic-architecture.md) | `GpsPort`, `ProviderDeviceLink`, telemetry deferred |
| [phase-1-vendor-foundation-plan.md](./phase-1-vendor-foundation-plan.md) | Traqcare link UI on device edit |

---

## Changelog

| Date | Note |
|------|------|
| 2026-05-23 | Doc added from vendor *Live Tracking API Documentation* PDF (3 pages) |
| 2026-05-23 | Base URL confirmed: `https://a1.traqcare.com/v2.12/tracking` (vendor chat; key via env only) |
| 2026-05-23 | `clientid` query rejected on live endpoint (`400` not allowed) — PDF vs deployed API mismatch; verify with vendor |
