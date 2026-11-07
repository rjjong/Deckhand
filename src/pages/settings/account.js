// Optional account and cloud-sync screens.

function accountErrorMessage(error) {
  return (
    {
      credentials: 'The email or password is incorrect.',
      email: 'Enter a valid email address.',
      password: 'Use a password with 15–128 characters.',
      email_unverified:
        'Verify your email before signing in. You can request another verification email below.',
      email_not_configured:
        'Account email is not configured on this server yet. You can keep using Deckhand locally and make backups.',
      rate_limited: 'Too many attempts. Please wait before trying again.',
      busy: 'The server is busy. Please try again shortly.',
      invalid_link: 'This link has expired or was already used. Request a new email.',
      legacy_unavailable: 'This code was not found or has already moved to another account.',
      signin_required: 'Sign in again to continue.',
      csrf: 'Your session changed. Close this panel and sign in again.',
      storage: 'Could not prepare local storage. Your existing data is still kept.',
    }[error.message] || 'Could not connect. Your local data is still kept; please try again.'
  );
}

function openAccountSheet(mode, token, startup = false) {
  const signed = accountSession?.user?.id === ACCOUNT_OWNER;
  mode ||= signed ? 'profile' : 'login';
  document.getElementById('accountSheet')?.remove();
  const root = document.createElement('div');
  root.id = 'accountSheet';
  root.className = 'deckpick-scrim';
  root.innerHTML = /* HTML */ `<section
    class="deckpick transfer-dialog account-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Account & sync"
  >
    ${transferHeaderHtml('Account & sync', '', 'accountClose', '', 'Close account')}
    <div class="transfer-body" id="accountBody"></div>
  </section>`;
  brSheetOpen(
    root,
    'accountSheet',
    () => {
      if (state.screen === 'settings') render();
    },
    startup,
  );
  const close = () => brSheetClose('accountSheet');
  root.querySelector('#accountClose').onclick = close;
  root.onclick = (event) => {
    if (event.target === root) close();
  };
  wireAppDialogKeys(root, close);
  const draw = (next) => {
    mode = next;
    root.dataset.accountView = mode;
    const profile = mode === 'profile',
      password = ['login', 'register', 'reset'].includes(mode);
    const email = ['login', 'register', 'forgot', 'resend'].includes(mode);
    const title = {
      login: 'Welcome back',
      register: 'Create your account',
      forgot: 'Reset your password',
      resend: 'Verify your email',
      verify: 'Verify your email',
      reset: 'Choose a new password',
      profile: 'Your cloud saves',
    }[mode];
    const action = {
      login: 'Sign in',
      register: 'Create account',
      forgot: 'Send reset email',
      resend: 'Send verification email',
      verify: 'Verify email',
      reset: 'Save new password',
    }[mode];
    root.querySelector('#accountBody').innerHTML =
      /* HTML */ `${mode === 'login' ? '' : `<h3>${title}</h3>`}
        ${
          profile
            ? `<p class="account-email">${escapeHtml(accountSession.user.email)}</p><p id="syncLastLine" role="status">${escapeHtml(syncLastLabel())}</p><p>Decks, collection, settings and saved games sync between devices signed in to this account.</p>
        ${localStorage.getItem(LS_PREFIX + 'migrationNotice') ? `<p>${escapeHtml(localStorage.getItem(LS_PREFIX + 'migrationNotice'))}</p>` : ''}
        <div class="sync-actions"><button class="primary-btn" type="button" id="accountSync">Sync now</button><button class="ghost-btn" type="button" id="accountLegacy">Import old sync data</button><button class="ghost-btn" type="button" id="accountLogout">Sign out</button></div>`
            : `${mode === 'login' ? '' : `<p>${mode === 'register' ? 'Verify your email, then sign in on each device. A cloud account is optional.' : mode === 'verify' ? 'Confirm your email address to enable cloud saving.' : mode === 'reset' ? 'This changes your password and signs out your other sessions.' : 'Your decks and collection stay available on this device while you are offline.'}</p>`}
      <form id="accountForm" class="account-form">
        ${email ? `<label for="accountEmail">Email</label><input id="accountEmail" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required value="${escapeHtml(syncState()?.email || '')}" />` : ''}
        ${password ? `<label for="accountPassword">${mode === 'login' ? 'Password' : 'New password'}</label><input id="accountPassword" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" ${mode !== 'login' ? 'minlength="15"' : ''} maxlength="128" required />` : ''}
        ${['register', 'reset'].includes(mode) ? `<label for="accountConfirm">Confirm password</label><input id="accountConfirm" name="confirm" type="password" autocomplete="new-password" minlength="15" maxlength="128" required /><small>Use 15–128 characters. Spaces and password managers are welcome.</small>` : ''}
        ${mode === 'login' && !ACCOUNT_OWNER ? `<label class="account-include"><input type="checkbox" id="accountInclude" checked /><span>Include local decks and collection on first sign-in.</span></label>` : ''}
        <button type="submit" class="primary-btn" id="accountSubmit">${action}</button>
      </form>`
        }
        <p class="account-status" id="accountStatus" role="status" aria-live="polite"></p>
        <div class="account-links">
          ${profile ? '<button type="button" class="ghost-btn" data-account-mode="forgot">Change or reset password</button>' : `<button type="button" class="ghost-btn" data-account-mode="${mode === 'login' ? 'register' : 'login'}">${mode === 'login' ? 'Create an account' : 'Back to sign in'}</button>${mode === 'login' ? '<button type="button" class="ghost-btn" data-account-mode="forgot">Forgot password?</button><button type="button" class="ghost-btn" data-account-mode="resend">Resend verification email</button>' : ''}`}
        </div>`;
    root.querySelectorAll('[data-account-mode]').forEach((button) => {
      button.onclick = () => draw(button.dataset.accountMode);
    });
    const status = root.querySelector('#accountStatus');
    const run = async (task) => {
      if (accountChanging) return;
      accountChanging = true;
      root.setAttribute('aria-busy', 'true');
      root.querySelectorAll('button:not(#accountClose)').forEach((button) => {
        button.disabled = true;
      });
      status.textContent = 'Please wait…';
      try {
        await task(status);
      } catch (error) {
        status.textContent = accountErrorMessage(error);
      } finally {
        accountChanging = false;
        root.removeAttribute('aria-busy');
        root.querySelectorAll('button').forEach((button) => {
          button.disabled = false;
        });
      }
    };
    root.querySelector('#accountForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const emailValue = root.querySelector('#accountEmail')?.value.trim();
      const passwordValue = root.querySelector('#accountPassword')?.value;
      const confirm = root.querySelector('#accountConfirm');
      if (confirm && confirm.value !== passwordValue) {
        status.textContent = 'The passwords do not match.';
        return;
      }
      const includeLocal = root.querySelector('#accountInclude')?.checked || false;
      run(async () => {
        const result = await accountCall({
          op: mode,
          email: emailValue,
          password: passwordValue,
          token,
        });
        root.querySelectorAll('input[type="password"]').forEach((input) => {
          input.value = '';
        });
        if (mode === 'login') {
          accountSessionGeneration++;
          accountSession = result;
          if (!(await accountPrepareWorkspace(result.user, includeLocal))) draw('profile');
        } else if (mode === 'verify' || mode === 'reset') {
          const completed = mode;
          if (completed === 'reset') {
            accountSessionGeneration++;
            accountSession = null;
            if (syncState()?.accountId) {
              syncState().err = 'signin_required';
              syncSaveState();
            }
          }
          token = null;
          draw('login');
          root.querySelector('#accountStatus').textContent =
            completed === 'verify'
              ? 'Email verified. You can sign in now.'
              : 'Password saved. Sign in with your new password.';
        } else status.textContent = result.message;
      });
    });
    root.querySelector('#accountSync')?.addEventListener('click', () =>
      run(async () => {
        const synced = await syncRun('manual');
        if (synced === null) throw new Error(syncState()?.err || 'connection');
        status.textContent = 'Saved to this server.';
        root.querySelector('#syncLastLine').textContent = syncLastLabel();
      }),
    );
    root.querySelector('#accountLogout')?.addEventListener('click', () =>
      run(async () => {
        await syncRun('logout');
        try {
          await accountCall({ op: 'logout' });
        } catch (error) {
          if (error.message !== 'signin_required') throw error;
        }
        clearTimeout(_syncTimer);
        _syncController?.abort();
        _lsDelRaw.call(localStorage, ACCOUNT_OWNER_KEY);
        location.reload();
      }),
    );
    root.querySelector('#accountLegacy')?.addEventListener('click', async () => {
      close();
      await brAfterPop();
      openInAppPrompt('Import old sync data', 'Your previous sync code', '', async (code) => {
        if (code == null) return;
        openAccountSheet('profile');
        const label = document.getElementById('accountStatus');
        try {
          await accountCall({ op: 'migrate', code });
          _lsDelRaw.call(localStorage, LS_PREFIX + 'migrationNotice');
          if ((await syncRun('migration')) === null) throw new Error('connection');
          if (label?.isConnected) label.textContent = 'Old sync data moved into your account.';
        } catch (error) {
          if (label?.isConnected) label.textContent = accountErrorMessage(error);
        }
      });
    });
  };
  draw(mode);
  root.querySelector('#accountClose').focus({ preventScroll: true });
  if (!['verify', 'reset'].includes(mode)) accountRefresh();
}
