// Shared inbox layout for ZeroTacky transactional mail (031). Same frame as claimApproved.ts and emails/supabase-*.html
// so every message looks the same; claimApproved keeps its own copy of the markup until the next touch.
import { escapeHtml } from './claimApproved';

export { escapeHtml, EMAIL_FROM, EMAIL_REPLY_TO } from './claimApproved';

export interface EmailDoc {
  subject: string;
  heading: string;
  greeting: string;      // "Hi Dana,"
  lead: string;          // one sentence, also the preheader
  paragraphs: string[];  // plain sentences; rendered as <p> in HTML and as lines in text
  facts?: Array<{ label: string; value: string }>;   // small label/value table (date, division, fee)
  cta?: { label: string; url: string };
  links?: Array<{ label: string; url: string }>;
  footerNote: string;    // why the recipient got this
}

export function renderEmail(doc: EmailDoc, siteUrl: string): { subject: string; text: string; html: string } {
  const site = siteUrl.replace(/\/+$/, '');
  const h = escapeHtml;
  const textLines: string[] = [doc.greeting, '', doc.lead, ''];
  if (doc.facts?.length) { for (const f of doc.facts) textLines.push(`${f.label}: ${f.value}`); textLines.push(''); }
  for (const p of doc.paragraphs) textLines.push(p, '');
  if (doc.cta) textLines.push(`${doc.cta.label}: ${doc.cta.url}`);
  for (const l of doc.links ?? []) textLines.push(`${l.label}: ${l.url}`);
  if (doc.cta || doc.links?.length) textLines.push('');
  textLines.push('Questions? Reply to this email.', '', 'ZeroTacky, strongman meet scoring, competition registration and a gym directory. York, PA.', doc.footerNote);
  const text = textLines.join('\n');

  const P = (s: string) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#111111;">${h(s)}</p>`;
  const facts = doc.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 14px 0;font-size:14px;line-height:1.5;color:#111111;border-top:1px solid #111111;border-bottom:1px solid #111111;">${doc.facts
        .map((f) => `<tr><td style="padding:4px 14px 4px 0;color:#4f4f4f;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;vertical-align:top;">${h(f.label)}</td><td style="padding:3px 0;">${h(f.value)}</td></tr>`)
        .join('')}</table>`
    : '';
  const cta = doc.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#1d3aa8;">
          <a href="${h(doc.cta.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">${h(doc.cta.label)}</a>
        </td></tr></table>`
    : '';
  const links = (doc.links ?? [])
    .map((l) => `<p style="margin:18px 0 0 0;font-size:12px;line-height:1.6;color:#4f4f4f;">${h(l.label)}: <a href="${h(l.url)}" style="color:#1d3aa8;word-break:break-all;">${h(l.url)}</a></p>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${h(doc.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#d6d6d6;font-family:'Red Hat Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;color:#111111;">
<span style="display:none;max-height:0;overflow:hidden;color:#d6d6d6;">${h(doc.lead)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#d6d6d6;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #111111;">
      <tr><td style="padding:18px 28px;border-bottom:2px solid #111111;">
        <a href="${h(site)}" style="text-decoration:none;color:#111111;font-weight:700;letter-spacing:0.08em;"><img src="${h(site)}/email/wordmark.png" width="200" height="29" alt="ZER0TACKY" style="display:block;border:0;width:200px;height:auto;"></a>
      </td></tr>
      <tr><td style="padding:28px 28px 8px 28px;">
        <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;font-weight:700;color:#111111;">${h(doc.heading)}</h1>
        ${P(doc.greeting)}
        ${P(doc.lead)}
        ${facts}
        ${doc.paragraphs.map(P).join('\n        ')}
      </td></tr>
      <tr><td style="padding:8px 28px 28px 28px;">
        ${cta}
        ${links}
        <p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#4f4f4f;">Questions? Reply to this email.</p>
      </td></tr>
      <tr><td style="border-top:2px solid #111111;padding:16px 28px;font-size:12px;line-height:1.6;color:#4f4f4f;">
        ZeroTacky, strongman meet scoring, competition registration and a gym directory. York, PA.<br>
        ${h(doc.footerNote)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  return { subject: doc.subject, text, html };
}
