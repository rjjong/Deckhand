#!/usr/bin/env bash
# Run with sudo on Ubuntu; uses signed modules for the currently running kernel.
set -euo pipefail
if [[ $(id -u) -ne 0 ]]; then
  echo 'Run this script with sudo on the Ubuntu server.' >&2
  exit 1
fi
deckhand_kernel=$(uname -r)
if ! apt-cache show "linux-modules-nvidia-580-$deckhand_kernel" >/dev/null 2>&1; then
  echo 'Signed NVIDIA 580 modules are unavailable for this kernel. Update Ubuntu and reboot first.' >&2
  exit 1
fi
apt-get update
apt-get install -y --no-install-recommends "linux-modules-nvidia-580-$deckhand_kernel" nvidia-driver-580 nvidia-utils-580 curl gpg
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
