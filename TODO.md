# OpenSonix — Roadmap / TODO

Features not yet implemented, in no particular order of priority.

---

## Link statistics (baresip ctrl_tcp metrics)

Display real-time link quality metrics in the Dashboard.

baresip exposes through `ctrl_tcp`:
- `callstat` command -> jitter (ms), packet loss (%), RTT (ms), TX/RX bitrate
- `austat` command -> audio statistics (underrun, overrun)

Server-side implementation:
- During an established call, poll `callstat` every 2-5 s via `baresip.send('callstat')`
- Push the data to the frontend through WebSocket (`{ type: 'call:stats', data: {...} }`)

UI-side implementation:
- Dashboard panel, visible only during an established call
- Display jitter, packet loss and RTT as numeric values with a colored indicator
  (green / orange / red based on broadcast thresholds: jitter < 5 ms, loss < 0.1%)
- Optional 60 s sparkline history

---

## Monitoring SNMP

Expose device status via SNMP (read-only agent) so broadcast engineers can
monitor OpenSonix from their existing NMS (Nagios, Zabbix, LibreNMS, etc.).

Candidates:
- Link state (connected / disconnected)
- Audio levels (TX / RX)
- baresip daemon status
- Uptime, CPU temp (Pi-specific OIDs)

Stack: `net-snmp` daemon with a subagent, or a pure Node.js SNMP library
(e.g. `net-snmp` npm package acting as agent).

---

## GPIO / Contact-closure transport over SIP

Raspberry Pi GPIOs (GPI = input, GPO = output) transported to the remote
device in real-time, piggy-backed on the active SIP session.

Use **SIP INFO** (RFC 2976) for mid-call out-of-band signaling — not OPTIONS
(OPTIONS is capability query / keep-alive). Body: a small JSON or plain-text
payload carrying GPIO state changes.

```
INFO sip:user@remote SIP/2.0
Content-Type: application/x-opensonix-gpio
Content-Length: …

{"pin":17,"state":1}
```

Use cases: on-air tally lights, studio-to-transmitter signaling,
remote mute, cue signals — standard in broadcast STL workflows.

Implementation notes:
- baresip can send/receive SIP INFO via `ctrl_tcp` command `sipsess`
- Map Raspberry Pi GPIO pins via `onoff` npm package or `/sys/class/gpio`
- UI: GPIO pin mapping config (direction, label, active level)

---

## Serial port control (RS-232 / UART)

Control external broadcast equipment (routers, mixers, transmitters) via
serial port, or expose serial over the IP link (serial tunneling).

Two sub-features:
1. **Local serial commands** — Node.js sends commands to `/dev/ttyAMA0` (or
   USB-serial) to control local gear when call state changes.
2. **Serial tunneling** — transparent bidirectional serial data transported
   over the SIP session (via SIP INFO or a parallel TCP/UDP channel),
   so the far-end can also control equipment.

Stack: `serialport` npm package. Default: 9600 8N1, configurable in UI.

---

## Front-panel OLED display

Support small I2C OLED displays for standalone appliance builds, such as
1.3" SH1106 128x64 modules (white/blue OLED, IIC/I2C).

Display candidates:
- Device role (Sender / Receiver)
- Link state (connected / disconnected)
- Remote peer / target IP
- Call duration
- IP address and hostname
- Audio level summary or clipping warning
- Boot / update / error messages

Implementation notes:
- Use Raspberry Pi I2C (`/dev/i2c-*`)
- Render through a Node.js OLED library or a small local helper daemon
- Keep the UI optional and auto-disabled when no display is detected

---

## ON AIR status LEDs via GPIO

Support front-panel or external **ON AIR** LEDs driven by Raspberry Pi GPIO pins.

Use cases:
- Local ON AIR indicator when a SIP link is established
- TX/RX activity LEDs
- Warning LED for disconnected link, audio clipping or service fault
- Remote relay output for studio/transmitter signaling

Implementation notes:
- GPIO mapping configurable from the web UI
- Active-high / active-low option per output
- Optional blinking patterns for warning states
- Should integrate with the future GPIO / contact-closure feature

---

## OTA software update (HTTPS download)

Download and apply a new firmware image or Node.js application update
from a remote HTTPS URL without reflashing the SD card.

Two strategies (pick one or both):
1. **App-only update** — download a tarball from GitHub Releases, replace
   `/opt/opensonix/ui/`, restart the service. Fast, no reboot required.
2. **Full image update** — download a `.img.xz`, write to the inactive
   partition (A/B scheme with `rpiboot` or `mender`), reboot. Safe but
   complex to implement.

Minimum viable version: app-only update triggered from the System page.

```
POST /api/system/update   { url }   # downloads, verifies checksum, applies, restarts
GET  /api/system/version            # returns current git tag / build date
```

Security: verify HTTPS certificate + SHA-256 checksum of the downloaded
artifact before applying. Never run untrusted code.

---
