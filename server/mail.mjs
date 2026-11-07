export function createMailer(env, fetchImpl = fetch) {
  const from = env.EMAIL_FROM;
  const ready = !!(env.RESEND_API_KEY && from && !/[\r\n]/.test(from));
  return {
    ready,
    async send({ to, kind, url }) {
      if (!ready) throw new Error('email_not_configured');
      const reset = kind === 'reset';
      const title = reset ? 'Reset your Deckhand password' : 'Verify your Deckhand email';
      const action = reset ? 'Choose a new password' : 'Verify email address';
      const expiry = reset ? '30 minutes' : '24 hours';
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + env.RESEND_API_KEY,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          from,
          to: [to],
          subject: title,
          text: `${title}\n\n${action}: ${url}\n\nThis link expires in ${expiry} and can only be used once. If you did not request this, ignore this email.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#102839"><h1 style="font-size:24px">${title}</h1><p><a style="display:inline-block;padding:14px 20px;background:#c9a24b;color:#102839;border-radius:12px;text-decoration:none" href="${url}">${action}</a></p><p>This link expires in ${expiry} and can only be used once.</p><p>If you did not request this, ignore this email.</p></div>`,
        }),
      });
      // Provider errors and email contents must never reach public responses/logs.
      await response.body?.cancel();
      if (!response.ok) throw new Error('email_delivery');
    },
  };
}
