/**
 * Track contract (shared with Android). Source of truth:
 * `shared/contracts/track.contract.json`.
 */
import type { Track } from "@/lib/musicApi";
import trackContractJson from "../../../shared/contracts/track.contract.json";
import { applyDefaults, validateAgainst, type Contract, type ValidationResult } from "./validate";

export const TRACK_CONTRACT = trackContractJson as Contract;
export const TRACK_CONTRACT_VERSION = TRACK_CONTRACT.version;

export function validateTrack(payload: unknown): ValidationResult {
  return validateAgainst(TRACK_CONTRACT, payload);
}

export type ParsedTrack =
  | { ok: true; track: Track; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Validates an untrusted payload (sync, import, server response) and fills the
 * same defaults the Android model uses. Unknown fields are preserved.
 */
export function parseTrack(payload: unknown): ParsedTrack {
  const res = validateTrack(payload);
  if (!res.valid) return { ok: false, errors: res.errors };
  const track = applyDefaults(TRACK_CONTRACT, payload as Record<string, unknown>) as unknown as Track;
  return { ok: true, track, warnings: res.warnings };
}
