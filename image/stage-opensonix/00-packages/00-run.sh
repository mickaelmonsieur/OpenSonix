#!/bin/bash -e

KEYMAP="${KEYBOARD_KEYMAP:-fr}"

on_chroot << EOF
debconf-set-selections << 'DEBCONFEOF'
keyboard-configuration keyboard-configuration/altgr select The default for the keyboard layout
keyboard-configuration keyboard-configuration/compose select No compose key
keyboard-configuration keyboard-configuration/ctrl_alt_bksp boolean true
keyboard-configuration keyboard-configuration/layoutcode string ${KEYMAP}
keyboard-configuration keyboard-configuration/model select Generic 105-key PC
keyboard-configuration keyboard-configuration/modelcode string pc105
keyboard-configuration keyboard-configuration/optionscode string
keyboard-configuration keyboard-configuration/variantcode string
keyboard-configuration keyboard-configuration/xkb-keymap select ${KEYMAP}
console-setup console-setup/charmap47 select UTF-8
console-setup console-setup/codeset47 select Guess optimal character set
console-setup console-setup/fontface47 select Fixed
console-setup console-setup/fontsize-fb47 select 8x16
DEBCONFEOF

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    baresip \
    alsa-utils \
    console-setup \
    keyboard-configuration \
    nodejs \
    npm \
    openssh-server \
    avahi-daemon \
    build-essential \
    python3 \
    chrony \
    systemd-resolved
EOF
