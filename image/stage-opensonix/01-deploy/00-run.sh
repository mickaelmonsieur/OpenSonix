#!/bin/bash -e

# All source files are copied into files/ by the CI workflow before pi-gen runs.
# For a manual build: populate image/stage-opensonix/files/ yourself (see build-image.yml).

install -d "${ROOTFS_DIR}/opt/opensonix/ui"
rsync -a "${STAGE_DIR}/files/ui/." "${ROOTFS_DIR}/opt/opensonix/ui/"

# dist/ must be pre-built outside the chroot (Vite runs on the host in CI).
[ -f "${ROOTFS_DIR}/opt/opensonix/ui/dist/index.html" ] \
    || { echo "[01-deploy] dist/ missing — run 'npm ci && npm run build' in ui/ first"; exit 1; }

# Debian Bookworm debootstrap creates /etc/resolv.conf as a dangling symlink to
# /run/systemd/resolve/stub-resolv.conf (target doesn't exist yet in the chroot).
# Remove it and write a real file so npm can resolve hostnames.
# 03-config will restore the symlink afterwards.
rm -f "${ROOTFS_DIR}/etc/resolv.conf"
printf 'nameserver 8.8.8.8\nnameserver 1.1.1.1\n' > "${ROOTFS_DIR}/etc/resolv.conf"

# Install production-only deps in the ARM chroot (compiles native addons for ARM via QEMU).
on_chroot << 'EOF'
cd /opt/opensonix/ui
npm ci --omit=dev
EOF
