#!/bin/bash -e

# Firmware version stamp (written by CI from the git tag)
[ -f "${STAGE_DIR}/files/opensonix-release" ] && \
    install -m 644 "${STAGE_DIR}/files/opensonix-release" "${ROOTFS_DIR}/etc/opensonix-release"

install -d "${ROOTFS_DIR}/etc/baresip"
install -m 664 "${STAGE_DIR}/files/baresip-config/config"   "${ROOTFS_DIR}/etc/baresip/config"
install -m 664 "${STAGE_DIR}/files/baresip-config/accounts" "${ROOTFS_DIR}/etc/baresip/accounts"

install -d -m 750 "${ROOTFS_DIR}/var/lib/opensonix"

on_chroot << 'EOF'
chown root:opensonix /etc/baresip /etc/baresip/config /etc/baresip/accounts
chmod 775 /etc/baresip
chmod 664 /etc/baresip/config /etc/baresip/accounts

chown -R opensonix:opensonix /opt/opensonix
chown    opensonix:opensonix /var/lib/opensonix
EOF
