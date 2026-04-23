# OpenSonix — Roadmap / TODO

Features not yet implemented, in no particular order of priority.

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
