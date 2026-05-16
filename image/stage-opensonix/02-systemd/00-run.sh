#!/bin/bash -e

on_chroot << 'EOF'
getent group baresip   || groupadd --system baresip
getent group opensonix || groupadd opensonix
for group in gpio i2c spi; do
    getent group "${group}" || groupadd --system "${group}"
done

id -u baresip   &>/dev/null || adduser --system --no-create-home --disabled-login --shell /usr/sbin/nologin --ingroup baresip   baresip

# In CI pi-gen creates this user from FIRST_USER_* before this stage runs,
# but keep the custom stage self-contained for manual builds as well. The
# initial password is locked later; the web first-login flow sets the real
# system password together with the UI password.
if ! id -u opensonix &>/dev/null; then
    useradd --create-home --shell /bin/bash --gid opensonix opensonix
fi
usermod --shell /bin/bash --home /home/opensonix opensonix
install -d -m 755 -o opensonix -g opensonix /home/opensonix
echo 'opensonix:opensonix' | chpasswd

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
systemctl enable ssh
systemctl enable avahi-daemon
systemctl enable getty@tty1.service
systemctl set-default multi-user.target

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
    triggerhappy.socket \
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

# triggerhappy also installs a udev rule that calls th-cmd for every input
# device. With the daemon disabled that only creates boot warnings.
mkdir -p /etc/udev/rules.d
ln -sf /dev/null /etc/udev/rules.d/60-triggerhappy.rules
EOF
