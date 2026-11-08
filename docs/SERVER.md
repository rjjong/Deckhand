# Home server

Deckhand runs on `rjjong@192.168.3.50` (`ssh ubuntu-server` from this PC).
Open **https://mtgdeckhand.com**. The site is public; its Cloudflare Access
sign-in requirement has been removed. Cloudflare Tunnel still provides HTTPS.
The **http://192.168.3.50:3000** address is available to clients permitted by
the VLAN firewall.
Docker Engine and Compose come from Docker's official signed Ubuntu apt
repository: https://docs.docker.com/engine/install/ubuntu/.
Node 24 and SQLite are included in the image; neither needs a separate host
installation. Docker starts at boot and the container restarts automatically.

The UCG Ultra routes the server's `192.168.3.0/24` network through
`192.168.3.1`. This development PC currently uses `192.168.1.5`, with gateway
`192.168.1.1`. UniFi's classic LAN In rules allow TCP from this PC to the
server's port 22, plus established/related replies from server port 22 to the
PC's client ports. Both allow rules precede VLAN blocking rules. The SSH
shortcut uses the new address and the existing key. UniFi reserves the server
address through DHCP.

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

Frontend deployments generate a content-based build ID and automatically
replace each device's previous app-shell cache when it next connects. Devices
check at launch, on return/reconnect and every five minutes while visible.
The app refreshes at launch/return when safe, or offers **Update ready — reload**
while an editor, dialog, draft or life game is open. Decks, collections, settings,
saved games, card images and fonts remain stored. Offline devices update after
reconnecting. Devices predating this updater need one full refresh/relaunch to
load it; future deployments use the new process automatically.

Browser storage belongs to its address. Moving from localhost or HTTP to HTTPS
does not move local data. Export a backup and restore it at the new address, or
sign in to the same account when both origins use this server. Server backups
only contain browser data that has actually reached synchronization.

## Accounts and recovery email

Account signup requires a verified sending domain and a Resend sending API key.
A free Resend account currently supports 100 emails/day; Deckhand's combined
verification/recovery budget is limited to 80/day. Domain verification requires
the DNS records shown by Resend. Add these in Cloudflare without replacing the
website's tunnel record. Verify `mtgdeckhand.com` itself so the sender can be
`Deckhand <accounts@mtgdeckhand.com>`. Disable link/open tracking for account emails.

Once verified, run this on the development PC:

```sh
cd /home/remodj/Projects/Deckhand
python3 scripts/server/configure-email.py
```

The script reads the sending key using a hidden terminal prompt and writes only
`PUBLIC_URL`, `EMAIL_FROM`, `RESEND_API_KEY` and `TRUST_CLOUDFLARE_PROXY` into the
server's private `/srv/deckhand/.env` over SSH. It preserves other settings and
mode 0600. It does not print the key or copy it into a release. Deploy the account
release (or recreate its app container) afterward to load the settings. Development
can use the same environment keys locally; `.env` remains ignored by Git. Never
paste account passwords or API keys into chat or commit them.

Users create an account under **Menu → Account & sync**, verify their email,
then sign in on each device. Passwords are salted scrypt hashes in SQLite, never
reversibly encrypted. Recovery emails contain single-use 30-minute links and a
successful reset signs out every session. Session cookies use HTTPS, HttpOnly,
SameSite=Lax and CSRF protection. Cloudflare visitor IPs are trusted only when
they arrive through the internal Docker network and the proxy flag is enabled.

Guests can keep using Deckhand. Their Decks, Collection and Menu pages explain
that data is not saved in the cloud and can be lost without backups. Signing in
can copy guest data once; account workspaces stay separate when switching users.
Signing out returns to the guest workspace without deleting the account's local
cache. Signed-out or offline account edits remain on the device until sign-in
and sync succeed. The original legacy sync rows remain in SQLite; importing an
old sync code assigns its contents once to an authenticated account. Code-only
access to `/api/sync` is disabled. Back up SQLite before deploying this migration;
the normal deploy script does this automatically. It is safe to roll back the
application image: the additional tables do not modify the legacy schema.

The email setup still requires the operator to verify their domain and supply
a sending API key. Do not claim recovery works in production until those settings
have been loaded. Tests use an in-memory email sink, not real mail delivery.

References: https://resend.com/docs/dashboard/domains/introduction,
https://resend.com/pricing,
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html,
https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html.

## HTTPS through Cloudflare

The active public hostname is `mtgdeckhand.com`. A separate `deckhand-edge`
Compose project runs cloudflared 2026.10.7, pinned by image digest, on the
existing `deckhand_default` Docker network. It proxies only this hostname to
`http://deckhand:3000`; unmatched hostnames return 404. It publishes no host
ports and needs no router port forwarding. Website traffic passes through
Cloudflare; the application and SQLite remain on this server.

Cloudflare Access is currently disabled for the public website. Sync data
requires a verified account session. Public API traffic can reach AI and account
endpoints; authentication/email limits and per-account sync storage limits apply.
AI requests retain their existing per-device and global allowances.
To restrict the website again, create an Access application for the apex
hostname with no path and an Allow policy for the desired identities.

Public requests to the root and `/api/health` now return HTTP 200 without a
login redirect. The public Judge endpoint was also verified without login.
The connector's network can reach the app's health, manifest and
runtime-configuration endpoints.

If Access is enabled again, an expired session can leave cached decks and Scryfall card images
working while news and other server requests fail. Deckhand checks
`/api/health`, distinguishes a login redirect or HTTP 401 from an outage,
and offers **Sign in again**. This opens `/api/login` as a full navigation
outside the service-worker cache, then returns to the app after authentication.
The logo falls back to its cached image if the network requests a new login.
For an older installed version without this link, open
**https://mtgdeckhand.com/api/login** in that app or browser and sign in.
Do not clear browser storage to recover a login; it may contain unsynced decks.
Cloudflare documents the AJAX `X-Requested-With` header used to receive HTTP
401 instead of following a login redirect:
https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax.

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
The server's `BIND_ADDRESS` is now `192.168.3.50`.
If moving the server to another VLAN changes its IP address, update
`BIND_ADDRESS` in `/srv/deckhand/.env` to the new LAN IP (or `127.0.0.1` for
localhost-only HTTP access), then recreate the app with `manage.sh up -d --wait`.
An existing container can remain healthy internally while its old host binding
and Docker network endpoint are unavailable after a network change. In that
case cloudflared can report `lookup deckhand ... server misbehaving`. Updating
the binding and recreating the app restores its network endpoint and service
name. Verify `/api/health` and the tunnel's `/ready` endpoint afterward.

The app manifest uses `crossorigin="use-credentials"` so its request includes
the browser login session. Verify authenticated installation on the actual
phone after enabling the public hostname. Save the existing HTTP origin's
account access or export an app backup before switching to HTTPS; browser-only
storage does not move automatically between addresses.

## Deploy changes from the development PC

From `/home/remodj/Projects/Deckhand`:

```sh
npm test
python3 scripts/server/deploy.py
```

The deploy command packages the current working files, including uncommitted
customizations, without `.env`, databases, generated frontend bundles or dependencies.
The public CollectorVision models/catalog are prepared locally and included
under `assets/scanner/generated/`; these contain no user photos or private data.
It reserves the next **Major.Minor.Build** number in the development checkout's
`version.json` before packaging. The image build and server startup reuse that
number, so a deployment increments only once. A new major/minor starts at build
zero; choose it with `npm run version:set -- 2.1` (or `3.0`) before deploying.
Failed attempts can consume a number. Commit the updated version file with the
source to preserve the counter in other checkouts. See
[app versions](DEVELOPMENT.md#app-versions) for local and Docker builds.
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
curl --fail http://192.168.3.50:3000/api/health
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

The server now has a GTX 1650 with 4 GiB VRAM, replacing the previously inspected GTX 1050 Ti.
NVIDIA driver 580.178.04 and the Container Toolkit are installed, Secure Boot remains enabled, and Ubuntu boots kernel 7.0.0-43-generic.
GPU mode is enabled and verified: Ollama uses about 2610 MiB of VRAM and reports a 21% CPU / 79% GPU split for the 4096-token context.
Before acceleration, a small uncached Judge request took 20 seconds and a larger request failed after about 70 seconds.
Driver installation requires interactive sudo authentication. The following commands are for installation or recovery:

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

The installer uses Ubuntu's signed module tracking package (`linux-modules-nvidia-580-generic` on this server) and the official NVIDIA Container Toolkit repository.
The tracking package satisfies the driver's DKMS dependency with prebuilt modules and follows kernel updates; installing only the individual running-kernel package can still pull in DKMS.
It may install a newer Ubuntu kernel. It does not reboot or restart Docker automatically.
If Secure Boot reports an enrollment prompt, complete that at the server console before expecting CUDA to work.
`enable-gpu.sh` first tests `nvidia-smi` inside a GPU container, then writes `/srv/deckhand/gpu.enabled` and recreates only Ollama with `compose.gpu.yaml`.
A warmup request verifies that model weights use VRAM; failure restores CPU mode.
Deployment and management scripts retain the GPU overlay on future updates. Remove that flag and recreate Ollama to return to CPU operation.
The model volume is unchanged and does not need downloading again.

The Judge page requests a streamed response with `Accept: text/event-stream`.
Ollama produces NDJSON tokens; the backend emits readable answer/explanation
progress and a final result after parsing and checking citations. Heartbeats
keep the connection active while the model reads the prompt. Cache hits and
early errors retain ordinary JSON responses. Leaving the page aborts the
request, including active local inference. Failed or incomplete
streams show the rules fallback and are not cached as completed rulings.

Public Judge protection defaults to **10 new questions per account per day**, a
**30-second cooldown**, and **100 new questions per day across the server**.
Guests have a separate allowance per browser/IP. All daily budgets reset at
midnight UTC. Configure `JUDGE_DAILY`, `JUDGE_GLOBAL` and
`JUDGE_COOLDOWN_SECONDS` in `/srv/deckhand/.env`, then deploy or recreate the app.
Counts and cooldowns persist in SQLite; no schema migration is needed.

Judge and deck advice share one model slot. Other requests receive an immediate
busy response rather than joining a queue. The Judge page shows live availability
without exposing questions, identities or answers, and polls only while visible.
Busy requests, unavailable-model responses and cached rulings do not use a
question; accepted generations count even if their output is invalid or cancelled.
Cached rulings remain available after a daily budget is used.

Known accuracy limitation: a live multipart test about zero toughness and
indestructible produced an answer that contradicted its own explanation.
Prompt-only consistency instructions did not resolve that case and were not
retained. Citation validation checks references, not the truth of a ruling;
streaming does not change model accuracy. Prefer one ruling per question and
verify it against the supplied official rules.
