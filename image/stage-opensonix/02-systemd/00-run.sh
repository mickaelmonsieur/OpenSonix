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
systemctl enable systemd-networkd
systemctl enable systemd-resolved

# ── Mask unnecessary services ─────────────────────────────────────────────────
# ln -sf is used instead of systemctl mask so it works reliably in a chroot
# regardless of whether the unit file is already installed.
# avahi-daemon is intentionally kept: it provides opensonix.local mDNS.
for unit in \
    userconfig.service \
    systemd-timesyncd.service \
    bluetooth.service \
    wpa_supplicant.service \
    ModemManager.service \
    triggerhappy.service \
    dphys-swapfile.service \
    rsyslog.service \
    apt-daily.service \
    apt-daily-upgrade.service \
    apt-daily.timer \
    apt-daily-upgrade.timer \
    man-db.timer \
    e2scrub_all.timer; do
    ln -sf /dev/null "/etc/systemd/system/${unit}"
done
EOF
