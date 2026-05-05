/**
 * AI Proxy — provides the base URL for ZAI API calls.
 * Routes through a Cloudflare tunnel that forwards to the internal ZAI API.
 * 
 * To update: change the TUNNEL_URL below after restarting the tunnel.
 */

const TUNNEL_URL = "https://intellectual-blah-inkjet-accessibility.trycloudflare.com/v1";

export function getZaiBaseUrl(): string {
  return TUNNEL_URL;
}
