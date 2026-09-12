/**
 * Stub for the optional @upstash/redis dependency (not installed locally).
 * rate-limit.ts imports it dynamically at runtime and catches failures —
 * this stub satisfies vitest's transform-time resolution.
 */
export class Redis {
  async incr(): Promise<number> {
    return 1;
  }
  async expire(): Promise<void> {}
}
export default { Redis };
