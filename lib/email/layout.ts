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

  const P = (s: string) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#3f3f46;">${h(s)}</p>`;
  const facts = doc.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px 0;font-size:14px;line-height:1.5;color:#18181b;">${doc.facts
        .map((f) => `<tr><td style="padding:3px 14px 3px 0;color:#71717a;font-weight:700;white-space:nowrap;vertical-align:top;">${h(f.label)}</td><td style="padding:3px 0;">${h(f.value)}</td></tr>`)
        .join('')}</table>`
    : '';
  const cta = doc.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#e11d48;border-radius:12px;">
          <a href="${h(doc.cta.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:0.04em;">${h(doc.cta.label)}</a>
        </td></tr></table>`
    : '';
  const links = (doc.links ?? [])
    .map((l) => `<p style="margin:18px 0 0 0;font-size:12px;line-height:1.6;color:#71717a;">${h(l.label)}: <a href="${h(l.url)}" style="color:#e11d48;word-break:break-all;">${h(l.url)}</a></p>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${h(doc.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
<span style="display:none;max-height:0;overflow:hidden;color:#f4f4f5;">${h(doc.lead)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
      <tr><td style="background:#0a0b0e;padding:20px 28px;">
        <a href="${h(site)}" style="color:#f4f4f5;text-decoration:none;font-size:18px;font-weight:900;letter-spacing:0.18em;">ZERO<span style="color:#e11d48;">TACKY</span></a>
      </td></tr>
      <tr><td style="padding:28px 28px 8px 28px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:800;color:#18181b;">${h(doc.heading)}</h1>
        ${P(doc.greeting)}
        ${P(doc.lead)}
        ${facts}
        ${doc.paragraphs.map(P).join('\n        ')}
      </td></tr>
      <tr><td style="padding:8px 28px 28px 28px;">
        ${cta}
        ${links}
        <p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#71717a;">Questions? Reply to this email.</p>
      </td></tr>
      <tr><td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:16px 28px;font-size:12px;line-height:1.6;color:#71717a;">
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
