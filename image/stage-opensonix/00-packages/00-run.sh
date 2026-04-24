#!/bin/bash -e
on_chroot << 'EOF'
apt-get update
apt-get install -y --no-install-recommends \
    baresip \
    alsa-utils \
    nodejs \
    npm \
    build-essential \
    python3 \
    chrony \
    systemd-resolved
EOF
