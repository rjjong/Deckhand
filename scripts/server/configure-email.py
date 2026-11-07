#!/usr/bin/env python3
"""Prompt privately on this PC and save account-email settings on the server."""
import getpass
import json
import re
import shlex
import subprocess
import sys
import warnings

REMOTE = r'''
import json, os, pathlib, re, sys, tempfile
config = json.load(sys.stdin)
path = pathlib.Path('/srv/deckhand/.env')
lines = path.read_text().splitlines()
names = set(config)
lines = [line for line in lines if line.split('=', 1)[0] not in names]
lines.extend(name + '=' + value for name, value in config.items())
fd, temporary = tempfile.mkstemp(prefix='.email-settings-', dir=path.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(lines) + '\n')
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary): os.unlink(temporary)
print('Email settings saved privately on the server. No credentials were printed.')
'''


def normalize_api_key(value):
    """Accept common clipboard wrappers without logging any part of a secret."""
    key = value.strip()
    if key.startswith('\x1b[200~') and key.endswith('\x1b[201~'):
        key = key[len('\x1b[200~'):-len('\x1b[201~')].strip()
    # Users may copy a quoted token, an environment assignment or a Bearer
    # header. Remove only those wrappers, never characters inside the secret.
    for _ in range(4):
        if len(key) >= 2 and (key[0], key[-1]) in {
            ('"', '"'), ("'", "'"), ('`', '`'), ('“', '”'), ('‘', '’')
        }:
            key = key[1:-1].strip()
            continue
        unwrapped = re.sub(
            r'^(?:(?:export\s+)?RESEND_API_KEY\s*=\s*|(?:Authorization:\s*)?Bearer\s+)',
            '', key, count=1, flags=re.IGNORECASE,
        ).strip()
        if unwrapped == key:
            break
        key = unwrapped
    if not key:
        raise ValueError('Nothing was pasted. Copy the complete secret key from Resend.')
    if any(mask in key for mask in ('...', '…', '***', '••', '●')):
        raise ValueError(
            'This looks like a masked or shortened key. In Resend → API Keys, '
            'create a key and copy the full secret when it is first displayed. '
            'The existing-key list does not show the full secret.'
        )
    if not key.startswith('re_'):
        raise ValueError(
            'Paste the secret key beginning with re_, rather than its name or ID. '
            'Use Resend → API Keys → Create API key to obtain the full secret.'
        )
    if any(character.isspace() for character in key):
        raise ValueError('The pasted key contains spaces or line breaks. Copy just the complete secret key.')
    # Treat the token as opaque; avoid assumptions about its exact length or
    # punctuation, while keeping it safe for a single-line dotenv value.
    if len(key) > 4096 or not re.fullmatch(r're_[A-Za-z0-9._~+/=-]+', key):
        raise ValueError('The paste contains unexpected characters. Copy the full secret using Resend’s copy button.')
    return key


def read_api_key():
    for _ in range(3):
        try:
            with warnings.catch_warnings():
                # Never fall back to visibly echoing a credential.
                warnings.simplefilter('error', getpass.GetPassWarning)
                value = getpass.getpass('Resend sending API key (hidden): ')
            return normalize_api_key(value)
        except ValueError as error:
            print(str(error))
            print('Nothing has been changed. Try pasting again, or press Ctrl+C to cancel.')
        except getpass.GetPassWarning:
            raise SystemExit('Run this script in an interactive terminal so the key can stay hidden.') from None
        except (EOFError, KeyboardInterrupt):
            raise SystemExit('\nCancelled. Nothing was changed.') from None
    raise SystemExit('No settings were changed. Copy the complete secret key and run the script again.')


def main():
    host = sys.argv[1] if len(sys.argv) == 2 else 'ubuntu-server'
    if len(sys.argv) > 2 or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.@:-]*', host):
        raise SystemExit('Usage: python3 scripts/server/configure-email.py [ssh-host]')
    print('Verify mtgdeckhand.com in Resend first. This writes only the private server .env.')
    key = read_api_key()
    config = {'PUBLIC_URL': 'https://mtgdeckhand.com',
              'EMAIL_FROM': 'Deckhand <accounts@mtgdeckhand.com>',
              'RESEND_API_KEY': key, 'TRUST_CLOUDFLARE_PROXY': '1'}
    subprocess.run(['ssh', '-o', 'BatchMode=yes', '-T', host,
                    'python3 -c ' + shlex.quote(REMOTE)],
                   input=json.dumps(config), text=True, check=True)
    print('The account release must be deployed/recreated to load these settings.')


if __name__ == '__main__':
    main()
