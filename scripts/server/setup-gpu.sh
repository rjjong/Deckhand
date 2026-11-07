#!/usr/bin/env bash
# Run with sudo on Ubuntu; uses signed modules that track the Ubuntu kernel.
set -euo pipefail
if [[ $(id -u) -ne 0 ]]; then
  echo 'Run this script with sudo on the Ubuntu server.' >&2
  exit 1
fi
deckhand_kernel=$(uname -r)
deckhand_modules="linux-modules-nvidia-580-${deckhand_kernel##*-}"
apt-get update
if ! apt-cache show "$deckhand_modules" >/dev/null 2>&1; then
  echo "Signed NVIDIA 580 modules are unavailable for this kernel flavour: ${deckhand_kernel##*-}." >&2
  exit 1
fi
# The tracking package provides nvidia-dkms-580 without building a DKMS
# module, and keeps signed modules installed when Ubuntu updates its kernel.
apt-get install -y --no-install-recommends "$deckhand_modules" nvidia-driver-580 nvidia-utils-580 curl gpg
install -m 0755 -d /usr/share/keyrings
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list |
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt-get update
apt-get install -y nvidia-container-toolkit
if [[ -f /etc/docker/daemon.json ]]; then
  cp -a /etc/docker/daemon.json "/etc/docker/daemon.json.before-deckhand-gpu-$(date -u +%Y%m%dT%H%M%SZ)"
fi
nvidia-ctk runtime configure --runtime=docker
echo 'GPU packages installed. Reboot when ready, then run:'
echo 'bash /srv/deckhand/current/scripts/server/enable-gpu.sh'
