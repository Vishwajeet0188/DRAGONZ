// Reusable, dependency-free email templates. All interpolated values are HTML-escaped.
import { env } from '../../config/env.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout({ preheader, heading, body, cta, footer }) {
  const html = `<!doctype html><html><body style="margin:0;background:#0b0b0f;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e7e7ea">
<span style="display:none;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#15151c;border:1px solid #26262f;border-radius:14px">
<tr><td style="padding:28px 32px 8px;font-weight:800;letter-spacing:.14em;color:#d9a514;font-size:13px">DRZ · DRAGONZ CENTRAL</td></tr>
<tr><td style="padding:0 32px"><h1 style="margin:8px 0 12px;font-size:22px;color:#fff">${esc(heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#b9b9c3">${body}</div>
${cta ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:#ffca28;color:#0b0b0f;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;display:inline-block">${esc(cta.label)}</a></p>
<p style="font-size:12px;color:#7a7a86;word-break:break-all">Or paste this link: ${esc(cta.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:20px 32px 28px;font-size:12px;color:#6b6b76;border-top:1px solid #26262f">${footer ?? 'You received this because of activity on your Dragonz Central account.'}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, '', body.replace(/<[^>]+>/g, ''), cta ? `\n${cta.label}: ${cta.url}` : ''].join('\n');
  return { html, text };
}

export const templates = {
  verifyEmail: ({ displayName, token }) => ({
    subject: 'Verify your Dragonz Central email',
    ...layout({
      preheader: 'Confirm your email to unlock live alerts.',
      heading: `Welcome to the Dragonz, ${displayName}`,
      body: `<p>Confirm your email address to finish setting up your account. This link expires in 24 hours.</p>`,
      cta: { label: 'Verify email', url: `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}` },
      footer: "If you didn't create an account, you can safely ignore this email.",
    }),
  }),
  passwordReset: ({ displayName, token }) => ({
    subject: 'Reset your Dragonz Central password',
    ...layout({
      preheader: 'Password reset requested.',
      heading: 'Reset your password',
      body: `<p>Hi ${esc(displayName)}, we received a request to reset your password. This link expires in 1 hour and can only be used once.</p>`,
      cta: { label: 'Choose a new password', url: `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}` },
      footer: "If you didn't request this, ignore this email — your password won't change.",
    }),
  }),
  liveAlert: ({ displayName, creator, platform, streamTitle, url, thumbnailUrl }) => ({
    subject: `🔴 ${creator} is LIVE on ${platform}!`,
    ...layout({
      preheader: streamTitle || `${creator} just went live`,
      heading: `${creator} is LIVE!`,
      body: `${thumbnailUrl && /^https:\/\//.test(thumbnailUrl) ? `<p><a href="${esc(url)}"><img src="${esc(thumbnailUrl)}" alt="" width="496" style="width:100%;max-width:496px;border-radius:10px;display:block"></a></p>` : ''}
<p>Hi ${esc(displayName)}, <strong style="color:#fff">${esc(creator)}</strong> just started streaming on ${esc(platform)}.</p>
${streamTitle ? `<p style="color:#e7e7ea">“${esc(streamTitle)}”</p>` : ''}`,
      cta: { label: `Watch on ${platform}`, url },
      footer: `You get this because you follow ${esc(creator)} and turned on email live alerts. <a href="${esc(env.APP_URL)}/settings#notifications" style="color:#d9a514">Change alert settings</a>.`,
    }),
  }),
  eventReminder: ({ displayName, title, startsAt, url, streamUrl }) => ({
    subject: `⏰ Starting soon: ${title}`,
    ...layout({
      preheader: `${title} starts soon`,
      heading: `${title} starts soon`,
      body: `<p>Hi ${esc(displayName)}, you asked us to remind you — <strong style="color:#fff">${esc(title)}</strong> starts at ${esc(new Date(startsAt).toUTCString())}.</p>
${streamUrl ? `<p>Watch live: <a href="${esc(streamUrl)}" style="color:#d9a514">${esc(streamUrl)}</a></p>` : ''}`,
      cta: { label: 'Event details', url },
      footer: `You set a reminder for this event. <a href="${esc(env.APP_URL)}/settings#notifications" style="color:#d9a514">Email settings</a>.`,
    }),
  }),
  announcement: ({ displayName, title, body, url }) => ({
    subject: `📣 ${title}`,
    ...layout({
      preheader: String(body ?? '').slice(0, 90),
      heading: title,
      body: `<p>Hi ${esc(displayName)},</p><p style="white-space:pre-line">${esc(body)}</p>`,
      cta: url ? { label: 'Read more', url } : null,
      footer: `You get DRZ announcements because you opted in. <a href="${esc(env.APP_URL)}/settings#notifications" style="color:#d9a514">Unsubscribe or change settings</a>.`,
    }),
  }),
  passwordChanged: ({ displayName }) => ({
    subject: 'Your Dragonz Central password was changed',
    ...layout({
      preheader: 'Security notice',
      heading: 'Password changed',
      body: `<p>Hi ${esc(displayName)}, your password was just changed and other sessions were signed out. If this wasn't you, reset your password immediately.</p>`,
      cta: { label: 'Reset password', url: `${env.APP_URL}/forgot-password` },
    }),
  }),
};
