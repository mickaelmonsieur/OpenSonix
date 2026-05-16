# OpenSonix

[![Release](https://img.shields.io/github/v/release/mickaelmonsieur/OpenSonix?include_prereleases)](https://github.com/mickaelmonsieur/OpenSonix/releases)
[![Build Raspberry Pi Image](https://github.com/mickaelmonsieur/OpenSonix/actions/workflows/build-image.yml/badge.svg)](https://github.com/mickaelmonsieur/OpenSonix/actions/workflows/build-image.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

**OpenSonix** is an open-source IP audio codec (STL — Studio-to-Transmitter Link) for broadcast radio, running on a Raspberry Pi.

It wraps [baresip](https://github.com/baresip/baresip) (SIP + OPUS) with a modern web interface, giving broadcast engineers a reliable, affordable IP audio link — the open alternative to Tieline, Comrex and AEQ.

> 📸 *Screenshots coming soon — UI is fully functional today.*

---

## 🚧 Project status

OpenSonix is currently in **beta**. It has been tested in lab and real remote Pi-to-Pi links, but you should still test your exact network, audio interface and failure scenarios before using it for unattended critical broadcast service.

---

## ✨ Features

- **SIP/OPUS audio link** — low-latency, broadcast-grade stereo audio over IP
- **Sender / Receiver modes** — one config, two roles
- **Web UI** — clean, mobile-friendly interface inspired by Deva/Barix STL devices
- **Real-time VU meters** — IN/OUT, L/R channels, green → orange → red
- **One-click pairing** — generate credentials on the receiver, paste them on the sender
- **Network config** — DHCP or static IP, hostname, all from the UI
- **NTP + timezone** — configure NTP servers and timezone from the web interface
- **Security built-in** — Brute-force protection on the web UI, forced password change on first login
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

That's it.

---

## 🌐 Network requirements

OpenSonix is designed for closed networks such as studio LANs, VPNs or dedicated MPLS links.

| Service | Port | Notes |
|---|---:|---|
| Web UI | `80/tcp` | Browser access to the configuration interface |
| SSH | `22/tcp` | Enabled for maintenance and diagnostics |
| SIP | `7060/udp` | Default SIP listen port, configurable in the UI |
| mDNS / Bonjour | `5353/udp` | Used for `http://opensonix.local` discovery on local networks |
| RTP media | dynamic UDP | Negotiated by baresip during calls; keep both devices on a trusted LAN/VPN or allow media traffic between them |

NAT traversal has not been tested yet. For Internet links, use a VPN or a properly controlled routed network; future versions may add SIP relay support.

---

## 🔄 Upgrades

At the moment, upgrading to a newer OpenSonix image requires reflashing the SD card.

Before reflashing, export your configuration from the **System → Backup / Restore** page. After booting the new image, import the saved configuration to restore credentials, SIP settings, network settings and audio configuration.

---

## 🔧 Compatible hardware

Any Raspberry Pi with an Ethernet port and a USB or HAT audio interface:

| Board | Status |
|---|---|
| Raspberry Pi 4 Model B | ✅ Recommended |
| Raspberry Pi 3 Model B+ | ✅ Tested |
| Raspberry Pi 3 Model B | ✅ Supported |
| Raspberry Pi Zero 2W | ✅ Supported |
| Raspberry Pi 2 Model B | ⚠️ Untested |

Audio is handled by ALSA. Class-compliant USB audio interfaces should work out of the box, while Raspberry Pi audio HATs provide a clean internal add-on option.

### Recommended audio interfaces

#### Raspberry Pi audio HATs

The HiFiBerry DAC+ ADC family is recommended for internal Raspberry Pi builds:

| Interface | Status |
|---|---|
| [HiFiBerry DAC+ ADC](https://www.hifiberry.com/shop/boards/dacplus-adc/) | ✅ Tested |
| [HiFiBerry DAC+ ADC Pro](https://www.hifiberry.com/shop/boards/hifiberry-dac-adc-pro/) | Recommended |
| [HiFiBerry DAC2 ADC Pro](https://www.hifiberry.com/shop/boards/dac2adcpro/) | Recommended |
| [HiFiBerry DAC+ ADC Stage Development Kit](https://www.hifiberry.com/shop/0-development-kits/stage-devkit/) | Recommended |

#### USB audio interfaces

USB interfaces are an economical option and are easy to replace in the field:

| Interface | Status |
|---|---|
| [Behringer U-Control UCA202](https://thmn.to/thoprod/191768) | ✅ Tested |
| [Behringer U-Control UCA222](https://thmn.to/thoprod/246611) | Recommended |

For balanced audio wiring, small line transformers such as the [Neutrik NTE1](https://thmn.to/thoprod/167616) can be used with USB interfaces for less than EUR 15 per channel.

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

OpenSonix is designed for **closed broadcast networks** (studio LAN, dedicated MPLS/VPN). Do not expose it directly to the Internet unless you really know what you are doing and have a strict NAT/firewall setup in place.

- The web UI uses JWT authentication with a 15-minute access token
- Brute-force protection is built in and configurable (attempts / window)
- Always change the default web password on first login

If you need to link two sites over the Internet, set up a VPN or MPLS tunnel between them first.

### Known limitations

- NAT traversal has not been tested yet
- Upgrades currently require reflashing the SD card, then importing a backup
- OpenSonix is still beta software and should be validated on your own hardware before production use

### Broadcast disclaimer

OpenSonix is provided without warranty. It is your responsibility to test the system before on-air use, provide backup links where needed, and ensure that your deployment meets your operational, legal and safety requirements. The authors are not responsible for broadcast outages, lost revenue, equipment damage, data loss or misuse.

---

## 🤝 Contributing

Pull requests are welcome! Whether it's a bug fix, a new feature or a translation — feel free to open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/mickaelmonsieur/OpenSonix.git
cd OpenSonix/ui
npm install
npm run dev        # starts backend (port 3000) + Vite dev server (port 5173)
```

---

## 💼 Professional support

I'm available for consulting for radio stations interested in deploying OpenSonix in production.

👉 [mickael.be](https://www.mickael.be)

---

## ☕ Buy me a coffee

If OpenSonix saves you from buying a Tieline, consider buying me a coffee!

[![ko-fi](https://www.ko-fi.com/img/donate_sm.png)](https://ko-fi.com/Y8Y5MXCW)

You can also help expand OpenSonix hardware support through the [Amazon wishlist](https://www.amazon.fr/hz/wishlist/ls/3PY89LUR6FVNP?ref_=wl_share), which includes HiFiBerry boards I would like to test and document.

<small>Some product links are affiliate links. They help fund OpenSonix development and test hardware such as Raspberry Pi boards, HiFiBerry HATs and professional audio interfaces.</small>

---

## 📄 License

GNU General Public License v3.0

https://www.gnu.org/licenses/gpl-3.0.en.html

<small>Tieline, Comrex, AEQ, Deva and Barix are trademarks of their respective owners. OpenSonix is not affiliated with, endorsed by, or sponsored by these companies.</small>
