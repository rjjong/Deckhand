# Home server

Deckhand runs on `rjjong@192.168.2.50` (`ssh ubuntu-server` from this PC).
Open **https://mtgdeckhand.com** and sign in through Cloudflare Access.
The login page currently offers the Cloudflare identity provider; use the
Cloudflare account linked to the allowed GitHub/email identity.
The original **http://192.168.2.50:3000** address remains available on the LAN.
Docker Engine and Compose come from Docker's official signed Ubuntu apt
repository: https://docs.docker.com/engine/install/ubuntu/.
Node 24 and SQLite are included in the image; neither needs a separate host
installation. Docker starts at boot and the container restarts automatically.

## Storage and configuration

```text
/srv/deckhand/
  .env                   Private API keys, LAN binding, data directory selection (0600)
  current -> releases/…  Active application release
  previous -> releases/… Previous successful release, after the first update
  releases/              Source archives, extracted source and per-release image tags
  data/deckhand.sqlite   Persistent sync records and server caches
  data/data-library/     Full supported Oracle catalogue and official rulings
  backups/               Private daily and pre-update backup archives (30 days)
```

`compose.server.yaml` replaces the development named volume with the server's
data directory. The app runs as UID 1000, matching the server user's UID.
The server's `.env` selects `/app/var/data-library` through `CONTAINER_DATA_DIR`.
The initial database was migrated using SQLite's online backup API, including
committed WAL data. The existing card library and private configuration were
copied without downloading another bulk library. API keys remain outside the
source releases and image. Container logs are capped at three 10 MB files.

The public HTTPS address supports service-worker offline caching, app
installation and camera access on a phone. The HTTP address remains useful
for LAN testing and migrating browser data.
Menu > Install app opens the browser's installation prompt when available,
or shows manual steps for Safari and other browsers. At the HTTP LAN address
it explains the HTTPS requirement. The card is hidden inside installed apps.
Cloudflare Tunnel provides public access through outbound connections from
the server. No router port forwarding is configured by this deployment.

Browser storage belongs to its address. Moving from `localhost` to this server
does not move unsynced decks or collections. Use Settings > Sync with the same
sync code on both origins, or export a backup on localhost and import it at the
new address. Server backups only include browser data that has reached sync.
The sync-code copy button uses a compatibility copy path on HTTP. If copying
is blocked by the browser, it selects the read-only code field for manual copy.
The join field shows grouped slots, inserts dashes while typing, and accepts
pasted codes with or without dashes.

## HTTPS through Cloudflare

The active public hostname is `mtgdeckhand.com`. A separate `deckhand-edge`
Compose project runs cloudflared 2026.10.7, pinned by image digest, on the
existing `deckhand_default` Docker network. It proxies only this hostname to
`http://deckhand:3000`; unmatched hostnames return 404. It publishes no host
ports and needs no router port forwarding. Website traffic passes through
Cloudflare; the application and SQLite remain on this server.

Create the Cloudflare Access application **before publishing the DNS route**.
Use the apex hostname, no path, and an Allow policy containing the owner's
exact email address. The current application uses the Cloudflare identity
provider. Email One-time PIN can be enabled separately if desired. Dashboard
GitHub login and the website's login policy are separate. Choose the Free
plan when onboarding Cloudflare Zero Trust for this personal setup.

Publication was checked with a temporary maintenance response before routing
to the app. Valid HTTPS and Access login redirects were verified on the root,
health, sync, judge, Scryfall and manifest paths, including unauthenticated API
POST requests. The connector's network can reach the app's health, manifest
and runtime-configuration endpoints. Public requests without login must keep
redirecting to `ancient-base-7894.cloudflareaccess.com`.

```text
/srv/deckhand/edge/
  compose.yaml             Separate connector service, copied from compose.cloudflare.yaml
  auth/.cloudflared/        Private Cloudflare account certificate for tunnel administration
  runtime/config.yml       Local tunnel ingress rules and UUID
  runtime/credentials.json  Private credentials for this tunnel only
```

The connector runs as UID 1000 with a read-only filesystem. It receives only
the runtime directory; the broader account certificate is not mounted into
the running connector. Runtime configuration and credentials are included in
the private daily backups. Account authorization can be renewed separately.

On the Ubuntu server:

```sh
bash /srv/deckhand/current/scripts/server/cloudflare-admin.sh list --name mtgdeckhand
bash /srv/deckhand/current/scripts/server/edge.sh ps
bash /srv/deckhand/current/scripts/server/edge.sh logs --tail 40
bash /srv/deckhand/current/scripts/server/edge.sh restart
```

Local ingress changes go in `edge/runtime/config.yml`, followed by a connector
restart. Update the connector image by updating `compose.cloudflare.yaml`,
copying it to `edge/compose.yaml`, and using `edge.sh up -d`. Application
deployments do not stop or replace the connector. Avoid removing the app's
Docker network while the connector is attached to it.

The tunnel target uses Docker DNS, so it does not depend on the host's LAN IP.
If moving the server to another VLAN changes its IP address, update
`BIND_ADDRESS` in `/srv/deckhand/.env` to the new LAN IP (or `127.0.0.1` for
localhost-only HTTP access), then recreate the app with `manage.sh up -d --wait`.

The app manifest uses `crossorigin="use-credentials"` so its request includes
the browser login session. Verify authenticated installation on the actual
phone after enabling the public hostname. Save the existing HTTP origin's
sync code or export an app backup before switching to HTTPS; browser-only
storage does not move automatically between addresses.

## Deploy changes from the development PC

From `/home/remodj/Projects/Deckhand`:

```sh
npm test
python3 scripts/server/deploy.py
```

The deploy command packages the current working files, including uncommitted
customizations, without `.env`, databases, generated files or dependencies.
It uploads a new release, builds a tagged image on the server, makes a consistent
backup and waits for the container health check. The `current` link changes
only after success. A failed health check restores the previous image when
one exists. Old images and source archives are retained; no automatic image
pruning is configured.

The shared server `.env` is preserved during updates. Edit it over SSH to
change configuration, then recreate the container using the management command
below with `up -d --wait`. Do not print expanded Compose configuration or
container environment variables into issue reports: they may contain private credentials.

## Check, restart or roll back

```sh
ssh ubuntu-server
bash /srv/deckhand/current/scripts/server/manage.sh ps
bash /srv/deckhand/current/scripts/server/manage.sh logs --tail 50
bash /srv/deckhand/current/scripts/server/manage.sh restart
curl --fail http://192.168.2.50:3000/api/health
```

After at least one successful update, switch back to the previous image with:

```sh
bash /srv/deckhand/current/scripts/server/rollback.sh
```

Rollback changes application files and keeps current data. If a future update
changes the database schema incompatibly, restore its pre-update database
backup as well. Never use `down -v` or delete the server's data directory as
part of an update.

## Backups

`deckhand-backup.timer` runs every day at 03:15 server time (UTC), with up to
15 minutes of random delay. Missed runs are handled after the server starts.
Each archive contains a verified SQLite snapshot, the card library, the
private environment file and the active image tag. The directory and archives
are private because sync data and API keys are included. Successful backups
remove completed archives older than 30 days.

```sh
python3 /srv/deckhand/current/scripts/server/backup.py
systemctl list-timers deckhand-backup.timer
journalctl -u deckhand-backup.service --no-pager -n 20
```

Copy archives to a different machine or disk for protection against server
disk failure. From this PC, for example:

```sh
mkdir -p -m 700 ~/.local/state/deckhand/server-backups
rsync -a ubuntu-server:/srv/deckhand/backups/ ~/.local/state/deckhand/server-backups/
```

To restore a trusted archive, extract it into a private temporary directory and
check `PRAGMA integrity_check` on its `deckhand.sqlite` before changing anything.
Make another backup, stop the app through `manage.sh stop`, replace the database,
and remove the stopped database's old `-wal` and `-shm` sidecars. Restore
`data-library/` if needed. Keep ownership UID/GID 1000 and file permissions 0600,
then run `manage.sh up -d --wait`. Restore `config.env` separately only when you
also intend to replace the server's API keys and configuration.

## Local AI and GPU acceleration

The app runs `qwen3:4b-instruct-2507-q4_K_M` through the private `ollama` Compose service.
Cloud inference is disabled. Model downloads live in `deckhand_ollama-models`; no model API is published to the LAN or Cloudflare Tunnel.
CPU operation works without NVIDIA drivers, but GPU acceleration is preferable for interactive use.

The inspected server reports a GTX 1050 Ti, Nouveau, Secure Boot enabled, and no CUDA driver.
NVIDIA 580 signed kernel modules are available for its Ubuntu kernel. An administrator must perform the driver installation; SSH automation cannot authenticate sudo.

```sh
ssh ubuntu-server
sudo bash /srv/deckhand/current/scripts/server/setup-gpu.sh
sudo reboot
```

After reconnecting:

```sh
bash /srv/deckhand/current/scripts/server/enable-gpu.sh
bash /srv/deckhand/current/scripts/server/manage.sh exec ollama ollama ps
```

The installer uses Ubuntu's signed modules for the running kernel and the official NVIDIA Container Toolkit repository. It does not reboot or restart Docker automatically.
If Secure Boot reports an enrollment prompt, complete that at the server console before expecting CUDA to work.
`enable-gpu.sh` first tests `nvidia-smi` inside a GPU container, then writes `/srv/deckhand/gpu.enabled` and recreates only Ollama with `compose.gpu.yaml`.
A warmup request verifies that model weights use VRAM; failure restores CPU mode.
Deployment and management scripts retain the GPU overlay on future updates. Remove that flag and recreate Ollama to return to CPU operation.
The model volume is unchanged and does not need downloading again.
