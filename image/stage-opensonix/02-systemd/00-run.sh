#!/bin/bash -e

on_chroot << 'EOF'
id -u baresip   &>/dev/null || adduser --system --no-create-home --disabled-login --shell /usr/sbin/nologin baresip
id -u opensonix &>/dev/null || adduser --system --no-create-home --disabled-login --shell /usr/sbin/nologin opensonix
usermod -aG audio baresip
usermod -aG audio opensonix
EOF

install -m 644 "${STAGE_DIR}/files/systemd/baresip.service"      "${ROOTFS_DIR}/etc/systemd/system/baresip.service"
install -m 644 "${STAGE_DIR}/files/systemd/opensonix-ui.service" "${ROOTFS_DIR}/etc/systemd/system/opensonix-ui.service"

on_chroot << 'EOF'
systemctl enable baresip
systemctl enable opensonix-ui
systemctl enable ssh
EOF
