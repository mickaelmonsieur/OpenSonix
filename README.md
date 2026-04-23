# OpenSonix

**OpenSonix** is an open-source IP audio codec (STL — Studio-to-Transmitter Link) for broadcast radio, running on a Raspberry Pi.

It wraps [baresip](https://github.com/baresip/baresip) (SIP + OPUS) with a modern web interface, giving broadcast engineers a reliable, affordable IP audio link — the open alternative to Tieline, Comrex and AEQ.

> 📸 *Screenshots coming soon — UI is fully functional today.*

---

## ✨ Features

- **SIP/OPUS audio link** — low-latency, broadcast-grade stereo audio over IP
- **Sender / Receiver modes** — one config, two roles
- **Web UI** — clean, mobile-friendly interface inspired by Deva/Barix STL devices
- **Real-time VU meters** — IN/OUT, L/R channels, green → orange → red
- **One-click pairing** — generate credentials on the receiver, paste them on the sender
- **Network config** — DHCP or static IP, hostname, all from the UI
- **NTP + timezone** — configure NTP servers and timezone from the web interface
- **Security built-in** — SSH key-only auth, brute-force protection on the web UI, forced password change on first login
- **Diagnostic report** — one-click full system dump to paste into a GitHub Issue
- **Factory reset** — restore to defaults in one click
- **Multilingual UI** — English (default) and French
- **Runs headless** — Raspberry Pi OS Lite, no desktop, no X server

---

## 🚀 Quick Start

### 1. Flash the image

Download the latest `.img.xz` from the [Releases](https://github.com/mickaelmonsieur/OpenSonix/releases) page and flash it with [Raspberry Pi Imager](https://www.raspberrypi.com/software/) or:

```bash
xz -d opensonix-*.img.xz
sudo dd if=opensonix-*.img of=/dev/sdX bs=4M status=progress
```

### 2. Boot and connect

Plug in an Ethernet cable, power on the Pi, then open:

```
http://opensonix.local
```

Default credentials: `admin` / `opensonix` — **you will be asked to change the password on first login.**

### 3. Configure

- Set the device as **Sender** or **Receiver** in the Config page
- On the **Receiver**: copy the IP address, login and password shown
- On the **Sender**: paste those three values and hit Save
- Both devices will register and the link will establish automatically

That's it. No SSH required to get started.

---

## 🔧 Compatible hardware

Any Raspberry Pi with an Ethernet port and a USB or HAT audio interface:

| Board | Status |
|---|---|
| Raspberry Pi 4 Model B | ✅ Recommended |
| Raspberry Pi 3 Model B/B+ | ✅ Supported |
| Raspberry Pi Zero 2W | ✅ Supported |
| Raspberry Pi 2 Model B | ⚠️ Untested |

Audio is handled by ALSA — any class-compliant USB audio interface works out of the box.

---

## 🏗 Stack

| Layer | Technology |
|---|---|
| OS | Raspberry Pi OS Lite (Bookworm, armhf) |
| Audio engine | baresip + OPUS |
| Backend | Node.js + Fastify |
| Frontend | React + Vite (no CSS framework) |
| Database | SQLite (better-sqlite3) |
| Audio | ALSA only — no PulseAudio, no PipeWire |
| Image build | pi-gen + GitHub Actions |

---

## 🔒 Security

OpenSonix is designed for **closed broadcast networks** (studio LAN, dedicated MPLS/VPN). Do not expose it directly to the Internet.

- The web UI uses JWT authentication with a 15-minute access token
- Brute-force protection is built in and configurable (attempts / window)
- SSH access requires a public key — password authentication is disabled
- Always change the default web password on first login

If you need to link two sites over the Internet, set up a VPN or MPLS tunnel between them first.

---

## 🤝 Contributing

Pull requests are welcome! Whether it's a bug fix, a new feature or a translation — feel free to open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/mickaelmonsieur/OpenSonix.git
cd OpenSonix/ui
npm install
npm run dev        # starts backend (port 3000) + Vite dev server (port 5173)
```

See [CLAUDE.md](CLAUDE.md) for the full architecture and coding conventions.

---

## 💼 Professional support

I'm available for consulting for radio stations interested in deploying OpenSonix in production.

👉 [mickael.be](https://www.mickael.be)

---

## ☕ Buy me a coffee

If OpenSonix saves you from buying a Tieline, consider buying me a coffee!

[![ko-fi](https://www.ko-fi.com/img/donate_sm.png)](https://ko-fi.com/Y8Y5MXCW)

---

## 📄 Licence

GNU General Public License v3.0

https://www.gnu.org/licenses/gpl-3.0.en.html
