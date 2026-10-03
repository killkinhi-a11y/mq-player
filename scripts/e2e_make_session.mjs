// Generate a valid MQ session JWT for local E2E (same algorithm as src/lib/auth.ts).
// Usage: node scripts/e2e_make_session.mjs <JWT_SECRET>
import { SignJWT } from "jose";

const secret = process.argv[2] || process.env.JWT_SECRET;
if (!secret) {
  console.error("JWT_SECRET required");
  process.exit(1);
}
const key = new TextEncoder().encode(secret);
const token = await new SignJWT({
  userId: "e2e-test-user",
  username: "e2e-tester",
  email: "e2e@example.com",
  role: "user",
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(key);
console.log(token);
