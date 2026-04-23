#!/bin/bash -e

on_chroot << 'EOF'
getent group baresip   || groupadd --system baresip
getent group opensonix || groupadd --system opensonix

id -u baresip   &>/dev/null || adduser --system --no-create-home --disabled-login --shell /usr/sbin/nologin --ingroup baresip   baresip
id -u opensonix &>/dev/null || adduser --system --no-create-home --disabled-login --shell /usr/sbin/nologin --ingroup opensonix opensonix

usermod -aG audio baresip
usermod -aG audio opensonix
EOF

install -m 644 "${STAGE_DIR}/files/systemd/baresip.service"      "${ROOTFS_DIR}/etc/systemd/system/baresip.service"
install -m 644 "${STAGE_DIR}/files/systemd/opensonix-ui.service" "${ROOTFS_DIR}/etc/systemd/system/opensonix-ui.service"

on_chroot << 'EOF'
systemctl enable baresip
systemctl enable opensonix-ui
systemctl enable chrony
EOF
