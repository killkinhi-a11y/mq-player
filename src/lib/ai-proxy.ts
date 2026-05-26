/**
 * AI Proxy — provides the base URL for ZAI API calls.
 * Routes through a Cloudflare tunnel that forwards to the internal ZAI API.
 *
 * SECURITY: The tunnel URL is now loaded from environment variables
 * to avoid exposing internal URLs in source code.
 * Set ZAI_TUNNEL_URL env var to the tunnel URL.
 */

const TUNNEL_URL = process.env.ZAI_TUNNEL_URL || "";

export function getZaiBaseUrl(): string {
  if (!TUNNEL_URL) {
    console.warn("[AI Proxy] ZAI_TUNNEL_URL not set — AI features will use direct SDK");
  }
  return TUNNEL_URL;
}
