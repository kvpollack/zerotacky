// Claim-approved email (027, 10/27). Pure: builds subject, text and HTML from a payload; the API route sends it.
// Layout mirrors emails/supabase-*.html so every ZeroTacky message looks the same in the inbox.

export const EMAIL_FROM = 'ZeroTacky <no-reply@zerotacky.com>';
export const EMAIL_REPLY_TO = 'admin@zerotacky.com';

export interface ClaimApprovedInput {
  toName: string;
  gymName: string;
  gymSlug: string;
  siteUrl: string; // origin, no trailing slash
  newListing?: boolean; // the owner added the gym themselves (status was 'pending'); approval publishes it
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function claimApprovedEmail(input: ClaimApprovedInput): { subject: string; text: string; html: string } {
  const site = input.siteUrl.replace(/\/+$/, '');
  const gymUrl = `${site}/gyms/${encodeURIComponent(input.gymSlug)}`;
  const manageUrl = `${site}/website/account`;
  const firstName = (input.toName.trim().split(/\s+/)[0] || '').slice(0, 40);
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const subject = input.newListing
    ? `${input.gymName} is live on ZeroTacky`
    : `You now manage ${input.gymName} on ZeroTacky`;
  const lead = input.newListing
    ? `Your listing for ${input.gymName} has been reviewed and published in the ZeroTacky Gym Directory.`
    : `Your claim for ${input.gymName} has been approved. You are the listed owner in the ZeroTacky Gym Directory.`;

  const text = [
    greeting,
    '',
    lead,
    '',
    `Edit the listing (hours, day passes, equipment, contact) from My Gym: ${manageUrl}`,
    `Public page: ${gymUrl}`,
    '',
    'Promoters who host a show at your gym can link it from their listing, and it shows up on your page.',
    '',
    'Questions? Reply to this email.',
    '',
    'ZeroTacky, strongman meet scoring, competition registration and a gym directory. York, PA.',
  ].join('\n');

  const h = escapeHtml;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${h(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#d6d6d6;font-family:'Red Hat Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;color:#111111;">
<span style="display:none;max-height:0;overflow:hidden;color:#d6d6d6;">${h(lead)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#d6d6d6;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #111111;">
      <tr><td style="padding:18px 28px;border-bottom:2px solid #111111;">
        <a href="${h(site)}" style="text-decoration:none;color:#111111;font-weight:700;letter-spacing:0.08em;"><img src="${h(site)}/email/wordmark.png" width="200" height="29" alt="ZER0TACKY" style="display:block;border:0;width:200px;height:auto;"></a>
      </td></tr>
      <tr><td style="padding:28px 28px 8px 28px;">
        <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;font-weight:700;color:#111111;">${h(input.newListing ? 'Your gym is live' : 'Your claim is approved')}</h1>
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#111111;">${h(greeting)}</p>
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#111111;">${h(lead)}</p>
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#111111;">Edit the listing (hours, day passes, equipment, contact) from <strong>My Gym</strong> on your account page. Promoters who host a show at your gym can link it from their listing, and it shows up on your page.</p>
      </td></tr>
      <tr><td style="padding:8px 28px 28px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#1d3aa8;">
          <a href="${h(manageUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">Open My Gym</a>
        </td></tr></table>
        <p style="margin:18px 0 0 0;font-size:12px;line-height:1.6;color:#4f4f4f;">Public page: <a href="${h(gymUrl)}" style="color:#1d3aa8;word-break:break-all;">${h(gymUrl)}</a></p>
        <p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#4f4f4f;">Questions? Reply to this email.</p>
      </td></tr>
      <tr><td style="border-top:2px solid #111111;padding:16px 28px;font-size:12px;line-height:1.6;color:#4f4f4f;">
        ZeroTacky, strongman meet scoring, competition registration and a gym directory. York, PA.<br>
        This is a one-time message about your gym listing, not a mailing list.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
