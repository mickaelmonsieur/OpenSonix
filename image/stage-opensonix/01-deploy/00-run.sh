#!/bin/bash -e

# All source files are copied into files/ by the CI workflow before pi-gen runs.
# For a manual build: populate image/stage-opensonix/files/ yourself (see build-image.yml).

install -d "${ROOTFS_DIR}/opt/opensonix/ui"
rsync -a "${STAGE_DIR}/files/ui/." "${ROOTFS_DIR}/opt/opensonix/ui/"

# dist/ must be pre-built outside the chroot (Vite runs on the host in CI).
[ -f "${ROOTFS_DIR}/opt/opensonix/ui/dist/index.html" ] \
    || { echo "[01-deploy] dist/ missing — run 'npm ci && npm run build' in ui/ first"; exit 1; }

# Install production-only deps in the ARM chroot (compiles native addons for ARM via QEMU).
# Force a working resolv.conf — the chroot's copy can be stale or overwritten by
# a previous stage. 03-config will replace it with the systemd-resolved symlink later.
on_chroot << 'EOF'
printf 'nameserver 8.8.8.8\nnameserver 1.1.1.1\n' > /etc/resolv.conf
cd /opt/opensonix/ui
npm ci --omit=dev
EOF
