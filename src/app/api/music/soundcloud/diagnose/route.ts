import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic endpoint — tests the full SoundCloud stream resolution chain.
 *
 * Usage: GET /api/music/soundcloud/diagnose?trackId=123456
 *
 * Returns detailed step-by-step info:
 *   1. Track info fetch (SC API) — track_authorization, policy, transcodings
 *   2. Transcoding resolution — template URL → CDN URL for each transcoding
 *   3. CDN accessibility check — HEAD request to resolved URLs
 *
 * This helps identify WHERE in the chain the failure occurs for specific tracks.
 */
export const runtime = "edge";

const CLIENT_IDS = [
  "1Gbi6DBGBMULQH8MuhNvI1HzL9AiX2Pa",
  "qYUIEFbSZdXPABQbuHA2Tv8C9ndesHim",
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json({ error: "missing trackId", usage: "/api/music/soundcloud/diagnose?trackId=123456" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagnostic: any = {
    trackId,
    timestamp: new Date().toISOString(),
    steps: [],
  };

  // Step 1: Try to get track info with each client ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let trackInfo: any = null;
  let workingClientId: string | null = null;

  for (const clientId of CLIENT_IDS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(
        `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
        {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            "Accept": "application/json",
          },
        }
      );
      clearTimeout(timeout);

      diagnostic.steps.push({
        step: "track_info",
        clientId: clientId.substring(0, 8) + "...",
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
      });

      if (res.ok) {
        const data = await res.json();
        trackInfo = data;
        workingClientId = clientId;
        diagnostic.trackInfo = {
          id: data.id,
          title: data.title,
          policy: data.policy,
          duration: data.duration,
          fullDuration: data.full_duration,
          hasTrackAuthorization: !!data.track_authorization,
          trackAuthLength: data.track_authorization?.length || 0,
          transcodingsCount: data.media?.transcodings?.length || 0,
          user: data.user?.username,
        };
        break;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.name : "unknown";
      diagnostic.steps.push({
        step: "track_info",
        clientId: clientId.substring(0, 8) + "...",
        error: errMsg,
      });
    }
  }

  if (!trackInfo || !workingClientId) {
    diagnostic.result = "FAILED: Could not get track info from SC API (all client IDs failed)";
    return NextResponse.json(diagnostic);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transcodings: any[] = trackInfo.media?.transcodings || [];
  const trackAuthorization: string = trackInfo.track_authorization || "";

  // Step 2: Try to resolve each transcoding
  diagnostic.resolutions = [];
  let anyResolved = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tc of transcodings) {
    const format = tc.format || {};
    const protocol: string = format.protocol || "unknown";
    const quality: string = tc.quality || "unknown";
    const templateUrl: string = tc.url;

    if (!templateUrl) {
      diagnostic.resolutions.push({
        protocol,
        quality,
        error: "no template URL",
      });
      continue;
    }

    let resolvedUrl: string | null = null;
    let licenseAuthToken: string | null = null;
    let resolveError: string | null = null;

    // Try resolving with each client ID
    for (const clientId of CLIENT_IDS) {
      try {
        const separator = templateUrl.includes("?") ? "&" : "?";
        let resolveUrl = `${templateUrl}${separator}client_id=${clientId}`;
        if (trackAuthorization) {
          resolveUrl += `&track_authorization=${encodeURIComponent(trackAuthorization)}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(resolveUrl, {
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            resolvedUrl = data.url;
            licenseAuthToken = data.licenseAuthToken || null;
            break;
          }
        } else {
          resolveError = `HTTP ${res.status}`;
        }
      } catch (err: unknown) {
        resolveError = err instanceof Error ? err.name : "unknown";
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolution: any = {
      protocol,
      quality,
      resolved: !!resolvedUrl,
    };

    if (resolvedUrl) {
      resolution.url = resolvedUrl.substring(0, 100) + "...";
      resolution.hostname = new URL(resolvedUrl).hostname;
      resolution.hasLicenseAuthToken = !!licenseAuthToken;
      anyResolved = true;

      // Step 3: Check CDN accessibility
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const cdnRes = await fetch(resolvedUrl, {
          method: "HEAD",
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        clearTimeout(timeout);

        resolution.cdnStatus = cdnRes.status;
        resolution.cdnOk = cdnRes.ok;
        resolution.cdnContentType = cdnRes.headers.get("content-type");
        resolution.cdnContentLength = cdnRes.headers.get("content-length");
      } catch (err: unknown) {
        resolution.cdnStatus = "error";
        resolution.cdnError = err instanceof Error ? err.name : "unknown";
      }
    } else {
      resolution.error = resolveError || "all client IDs failed";
    }

    diagnostic.resolutions.push(resolution);
  }

  diagnostic.result = anyResolved
    ? "OK: At least one transcoding resolved successfully"
    : "FAILED: No transcoding could be resolved";

  return NextResponse.json(diagnostic);
}
