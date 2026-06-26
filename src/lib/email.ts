/**
 * Outbound email via the Cloudflare Email Routing send binding.
 *
 * Sending to *verified destination addresses* on the account is free on any
 * plan (even when only Email Routing is configured). The binding is restricted
 * to NOTIFY_EMAIL in wrangler.jsonc. No-ops gracefully if not configured.
 */
import { EmailMessage } from "cloudflare:email";
import type { Env } from "../types";

export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.EMAIL) return { ok: false, error: "Email binding (EMAIL) not configured" };
  const fromAddr = "noreply@crorn.com";
  const raw =
    `From: crorn DMS <${fromAddr}>\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `Message-ID: <${crypto.randomUUID()}@crorn.com>\r\n` +
    `Date: ${new Date().toUTCString()}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset="utf-8"\r\n` +
    `\r\n` +
    `${text}\r\n`;
  try {
    await env.EMAIL.send(new EmailMessage(fromAddr, to, raw));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
