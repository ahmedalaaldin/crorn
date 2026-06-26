/**
 * Outbound email via the Cloudflare Email Routing send binding.
 *
 * Sending to *verified destination addresses* on the account is free on any
 * plan (even when only Email Routing is configured). The binding is restricted
 * to NOTIFY_EMAIL in wrangler.jsonc. No-ops gracefully if not configured.
 *
 * Emails are sent multipart/alternative: a branded, Aconex-style HTML body plus
 * a plain-text fallback. HTML is email-client-safe (table layout, inline styles).
 */
import { EmailMessage } from "cloudflare:email";
import type { Env } from "../types";

const APP_URL = "https://www.crorn.com";
const FROM_ADDR = "noreply@crorn.com";

function escHtml(s: string): string {
  return String(s == null ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string),
  );
}

interface Badge { label: string; color: string; bg: string; border: string; }

/** Map a notification type to a status badge style (matches the app's pills). */
function badgeFor(type: string): Badge {
  const t = (type || "").toLowerCase();
  if (t === "approved") return { label: "Approved", color: "#1e8e3e", bg: "#e6f4ea", border: "#bbdfc6" };
  if (t === "revision") return { label: "Revise & Resubmit", color: "#b5710a", bg: "#fbefd6", border: "#efd49a" };
  if (t === "rejected") return { label: "Rejected", color: "#c5221f", bg: "#fce8e6", border: "#f3c2c0" };
  if (t === "overdue") return { label: "Overdue", color: "#c5221f", bg: "#fce8e6", border: "#f3c2c0" };
  if (t === "escalation") return { label: "Escalation", color: "#c5221f", bg: "#fce8e6", border: "#f3c2c0" };
  if (t === "review_required") return { label: "Action required", color: "#b5710a", bg: "#fbefd6", border: "#efd49a" };
  if (t === "received") return { label: "Received", color: "#0b6cbf", bg: "#e7f1fb", border: "#bfd9f2" };
  return { label: type || "Notification", color: "#5c6b7a", bg: "#eef1f4", border: "#c7cdd6" };
}

export interface NotificationEmail { type: string; title: string; body?: string; }

/** Build a branded HTML + plain-text email for a notification. */
export function buildNotificationEmail(n: NotificationEmail): { html: string; text: string } {
  const b = badgeFor(n.type);
  const title = escHtml(n.title);
  const bodyHtml = escHtml(n.body || "").replace(/\n/g, "<br>");
  const text =
    `${n.title}\n\n${n.body || ""}\n\nOpen crorn DMS: ${APP_URL}\n\n` +
    `— crorn DMS · construction document management`;

  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting"></head>' +
    '<body style="margin:0;padding:0;background:#f4f5f7;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">' +
    '<tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e1e5ea;border-radius:6px;overflow:hidden;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">' +
    // orange accent bar
    '<tr><td style="height:4px;background:#EE7203;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    // brand header
    '<tr><td style="padding:18px 28px;border-bottom:1px solid #eef1f4;">' +
    '<span style="display:inline-block;width:13px;height:13px;border:3px solid #EE7203;border-radius:50%;vertical-align:middle;"></span>' +
    '<span style="font-size:18px;font-weight:700;color:#21384d;vertical-align:middle;margin-left:8px;">crorn</span>' +
    '<span style="font-size:11px;font-weight:700;color:#EE7203;letter-spacing:1px;vertical-align:middle;margin-left:3px;">DMS</span>' +
    '</td></tr>' +
    // status badge
    '<tr><td style="padding:26px 28px 6px;">' +
    '<span style="display:inline-block;background:' + b.bg + ';color:' + b.color + ';border:1px solid ' + b.border + ';border-radius:11px;font-size:12px;font-weight:600;padding:3px 11px;">' + escHtml(b.label) + '</span>' +
    '</td></tr>' +
    // title
    '<tr><td style="padding:8px 28px 4px;font-size:18px;line-height:1.4;font-weight:700;color:#1f2a36;">' + title + '</td></tr>' +
    // body
    (bodyHtml ? '<tr><td style="padding:6px 28px 0;font-size:14px;line-height:1.6;color:#4a5663;">' + bodyHtml + '</td></tr>' : '') +
    // CTA button
    '<tr><td style="padding:24px 28px 28px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="background:#EE7203;border-radius:5px;">' +
    '<a href="' + APP_URL + '" style="display:inline-block;padding:11px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Open in crorn DMS</a>' +
    '</td></tr></table>' +
    '</td></tr>' +
    // footer
    '<tr><td style="padding:16px 28px;background:#f7f8fa;border-top:1px solid #eef1f4;font-size:12px;line-height:1.6;color:#8893a0;">' +
    "You're receiving this because workflow notifications for crorn DMS are routed to this address.<br>" +
    '<span style="color:#6b7785;font-weight:600;">crorn DMS</span> · Aconex-style construction document management' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  return { html, text };
}

/** Send an email (HTML + text fallback when html is given) to a verified destination. */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.EMAIL) return { ok: false, error: "Email binding (EMAIL) not configured" };
  const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");
  const headers =
    `From: crorn DMS <${FROM_ADDR}>\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `Message-ID: <${crypto.randomUUID()}@crorn.com>\r\n` +
    `Date: ${new Date().toUTCString()}\r\n` +
    `MIME-Version: 1.0\r\n`;
  let raw: string;
  if (html) {
    const boundary = "b" + crypto.randomUUID().replace(/-/g, "");
    raw =
      headers +
      `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
      `--${boundary}\r\nContent-Type: text/plain; charset="utf-8"\r\n\r\n` + crlf(text) + `\r\n\r\n` +
      `--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\n\r\n` + crlf(html) + `\r\n\r\n` +
      `--${boundary}--\r\n`;
  } else {
    raw = headers + `Content-Type: text/plain; charset="utf-8"\r\n\r\n` + crlf(text) + `\r\n`;
  }
  try {
    await env.EMAIL.send(new EmailMessage(FROM_ADDR, to, raw));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
