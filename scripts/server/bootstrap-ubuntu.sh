#!/usr/bin/env bash
# Run on Ubuntu through sudo; Docker's official signed apt repository is used.
set -euo pipefail
if [[ $EUID -ne 0 || $# -ne 1 ]]; then
  echo "Usage: sudo bash bootstrap-ubuntu.sh <server-user>" >&2
  exit 1
fi
deckhand_user=$1
id "$deckhand_user" >/dev/null
source /etc/os-release
[[ $ID == ubuntu ]] || { echo "This script requires Ubuntu." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl
install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --location --retry 3 \
  https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker "$deckhand_user"
deckhand_group=$(id -gn "$deckhand_user")
install -d -o "$deckhand_user" -g "$deckhand_group" -m 0750 /srv/deckhand /srv/deckhand/releases
install -d -o "$deckhand_user" -g "$deckhand_group" -m 0700 /srv/deckhand/data /srv/deckhand/backups
cat > /etc/systemd/system/deckhand-backup.service <<EOF
[Unit]
Description=Back up Deckhand SQLite, card library and private configuration
ConditionPathExists=/srv/deckhand/current/scripts/server/backup.py
ConditionPathExists=/srv/deckhand/data/deckhand.sqlite

[Service]
Type=oneshot
User=$deckhand_user
Group=$deckhand_group
UMask=0077
ExecStart=/usr/bin/python3 /srv/deckhand/current/scripts/server/backup.py
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
ReadWritePaths=/srv/deckhand/data /srv/deckhand/backups
EOF
cat > /etc/systemd/system/deckhand-backup.timer <<'EOF'
[Unit]
Description=Daily Deckhand backup

[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now deckhand-backup.timer
docker version --format 'Docker server: {{.Server.Version}}'
docker compose version
echo 'Docker and daily backup timer installed. Reconnect SSH to use the docker group.'
