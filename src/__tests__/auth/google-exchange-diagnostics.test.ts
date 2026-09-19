/**
 * @vitest-environment node
 */

/**
 * Tests for the Google code-exchange diagnostics (§5 error taxonomy):
 *   - Google token-endpoint failures produce structured, SAFE error classes
 *   - invalid_client is distinguishable (server credential misconfiguration)
 *   - the diagnostic log line NEVER contains the auth code, client id or
 *     client secret (the exchange POST body carries all three)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = "123456789- test.apps.googleusercontent.com".replace(" ", "");
  process.env.GOOGLE_CLIENT_SECRET = "GOCSPX-test-secret-DO-NOT-LEAK-0001";
  process.env.JWT_SECRET = "test-secret-key-for-oauth-tests-32ch!";
});

import { exchangeGoogleCode, logAuthDiagnostic } from "@/lib/oauth";

const SECRET = process.env.GOOGLE_CLIENT_SECRET as string;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const ORIGIN = "https://mq1.vercel.app";

/** Capture console.error lines emitted by logAuthDiagnostic. */
let logLines: string[] = [];

beforeEach(() => {
  logLines = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logLines.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
}

describe("exchangeGoogleCode — error taxonomy", () => {
  it("classifies invalid_client (server credentials rejected by Google)", async () => {
    mockFetch(401, { error: "invalid_client" });
    const result = await exchangeGoogleCode(ORIGIN, "fake-code", "abc12345");
    expect(result.id_token).toBeUndefined();
    expect(result.error?.providerError).toBe("invalid_client");
    expect(result.error?.httpStatus).toBe(401);
    expect(result.error?.errorClass).toBe("invalid_client");
  });

  it("classifies invalid_grant (bad/used/expired code) with credentials intact", async () => {
    mockFetch(400, { error: "invalid_grant", error_description: "Bad Request" });
    const result = await exchangeGoogleCode(ORIGIN, "fake-code", "abc12345");
    expect(result.error?.providerError).toBe("invalid_grant");
    expect(result.error?.httpStatus).toBe(400);
  });

  it("falls back to http_error for non-JSON error bodies", async () => {
    mockFetch(500, "Not Found");
    const result = await exchangeGoogleCode(ORIGIN, "fake-code", "abc12345");
    expect(result.error?.providerError).toBeUndefined();
    expect(result.error?.errorClass).toBe("http_error");
    expect(result.error?.httpStatus).toBe(500);
  });

  it("rejects unsanitized provider error strings (injection guard)", async () => {
    mockFetch(400, { error: "evil<script>alert(1)</script>" });
    const result = await exchangeGoogleCode(ORIGIN, "fake-code", "abc12345");
    expect(result.error?.providerError).toBeUndefined();
    expect(result.error?.errorClass).toBe("http_error");
  });

  it("classifies a 200 response without id_token as missing_id_token", async () => {
    mockFetch(200, { access_token: "at", token_type: "Bearer" });
    const result = await exchangeGoogleCode(ORIGIN, "fake-code", "abc12345");
    expect(result.error?.errorClass).toBe("missing_id_token");
  });

  it("classifies network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const result = await exchangeGoogleCode(ORIGIN, "fake-code", "abc12345");
    expect(result.error?.errorClass).toBe("network");
  });

  it("classifies timeouts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("The operation was aborted due to timeout"), {
          name: "TimeoutError",
        });
      })
    );
    const result = await exchangeGoogleCode(ORIGIN, "fake-code", "abc12345");
    expect(result.error?.errorClass).toBe("timeout");
  });

  it("passes tokens through on success", async () => {
    mockFetch(200, { id_token: "header.payload.sig", access_token: "at" });
    const result = await exchangeGoogleCode(ORIGIN, "real-code", "abc12345");
    expect(result.id_token).toBe("header.payload.sig");
    expect(result.access_token).toBe("at");
    expect(result.error).toBeUndefined();
  });
});

describe("exchangeGoogleCode — diagnostic log safety (§5 + §19)", () => {
  it("logs step, class, status and correlationId — but NEVER code/id/secret", async () => {
    mockFetch(401, { error: "invalid_client" });
    await exchangeGoogleCode(ORIGIN, "SENSITIVE-CODE-123", "corr99x1");

    expect(logLines.length).toBeGreaterThan(0);
    const line = logLines.join(" ");
    expect(line).toContain("[AUTH-DIAG]");
    expect(line).toContain("google.exchange");
    expect(line).toContain("invalid_client");
    expect(line).toContain("corr99x1");
    // The three credential-bearing fields of the POST body must be absent:
    expect(line).not.toContain("SENSITIVE-CODE-123");
    expect(line).not.toContain(SECRET);
    expect(line).not.toContain(CLIENT_ID);
  });

  it("drops error_description (can echo request params) from the log", async () => {
    mockFetch(400, {
      error: "invalid_grant",
      error_description: "SECRETDATA-code-SENSITIVE-CODE-123",
    });
    await exchangeGoogleCode(ORIGIN, "SENSITIVE-CODE-123", "corr99x2");
    const line = logLines.join(" ");
    expect(line).toContain("invalid_grant");
    expect(line).not.toContain("SECRETDATA");
  });
});

describe("logAuthDiagnostic — single greppable line", () => {
  it("emits one JSON line with the required §5 fields", () => {
    logAuthDiagnostic({
      step: "google.exchange",
      errorClass: "invalid_client",
      httpStatus: 401,
      providerError: "invalid_client",
      correlationId: "abc12345",
    });
    expect(logLines).toHaveLength(1);
    const parsed = JSON.parse(logLines[0].replace("[AUTH-DIAG] ", ""));
    expect(parsed).toMatchObject({
      step: "google.exchange",
      errorClass: "invalid_client",
      httpStatus: 401,
      providerError: "invalid_client",
      correlationId: "abc12345",
    });
  });
});
