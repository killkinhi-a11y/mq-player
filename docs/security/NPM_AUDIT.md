# npm audit — Stage V (chore/deps-security)

Generated from `npm audit --json` (root and `desktop/`). Only semver-compatible (patch/minor) fixes were applied; majors are listed for a separate decision.

| scope | before | after |
|---|---|---|
| root | {"info":0,"low":1,"moderate":34,"high":33,"critical":5,"total":73} | {"info":0,"low":0,"moderate":16,"high":10,"critical":0,"total":26} |
| desktop | {"info":0,"low":0,"moderate":0,"high":2,"critical":0,"total":2} | 0 |

## Direct dependencies changed

| package | before | after | type |
|---|---|---|---|
| next | 16.2.6 | 16.4.5 | minor |
| eslint-config-next | 16.2.6 | 16.4.5 | minor |
| @sentry/nextjs | 10.53.1 | 10.78.0 | minor |
| @capacitor/android | 8.4.1 | 8.6.0 | minor |
| @opennextjs/cloudflare | 1.19.11 | 1.20.16 | minor |
| wrangler | 4.94.0 | 4.158.0 | minor |
| vitest | 4.1.7 | 4.1.12 | patch |
| electron | 36.5.0 | 36.9.5 | minor |
| electron-builder | 26.0.12 | 26.18.0 | minor |
| desktop: vite | 7.3.6 | 7.3.7 | patch |

## Root findings before → status

| package | severity | direct | advisory | fix offered | status after |
|---|---|---|---|---|---|
| @capacitor/android | critical | yes | Capacitor Android and iOS: remote content can be loaded at the app origin via the internal HTTP proxy path | yes (in range) | fixed |
| @electron/node-gyp | high | no | via make-fetch-happen, tar | electron-builder@26.18.0 | fixed |
| @electron/rebuild | high | no | via @electron/node-gyp, tar | electron-builder@26.18.0 | fixed |
| @electron/universal | moderate | no | via minimatch | electron-builder@26.18.0 | **open** (moderate; electron-builder@25.1.0 **MAJOR**) |
| @fastify/otel | moderate | no | via minimatch | yes (in range) | fixed |
| @node-minify/core | moderate | no | via glob | yes (in range) | **open** (high; @opennextjs/cloudflare@0.3.0 **MAJOR**) |
| @opennextjs/aws | moderate | no | via @node-minify/core | yes (in range) | **open** (high; @opennextjs/cloudflare@0.3.0 **MAJOR**) |
| @opennextjs/cloudflare | high | yes | OpenNext Cloudflare: Cache interception can bypass middleware protection for encoded paths | yes (in range) | **open** (high; @opennextjs/cloudflare@0.3.0 **MAJOR**) |
| @opentelemetry/core | moderate | no | OpenTelemetry Core: Unbounded memory allocation in W3C Baggage propagation | yes (in range) | fixed |
| @opentelemetry/instrumentation-http | moderate | no | via @opentelemetry/core | yes (in range) | fixed |
| @opentelemetry/instrumentation-knex | moderate | no | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute | yes (in range) | fixed |
| @opentelemetry/instrumentation-mongoose | moderate | no | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute | yes (in range) | fixed |
| @opentelemetry/instrumentation-mysql | moderate | no | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute | yes (in range) | fixed |
| @opentelemetry/instrumentation-mysql2 | moderate | no | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute | yes (in range) | fixed |
| @opentelemetry/instrumentation-pg | moderate | no | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute | yes (in range) | fixed |
| @opentelemetry/instrumentation-tedious | moderate | no | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute | yes (in range) | fixed |
| @opentelemetry/resources | moderate | no | via @opentelemetry/core | yes (in range) | fixed |
| @opentelemetry/sdk-trace-base | moderate | no | via @opentelemetry/core, @opentelemetry/resources | yes (in range) | fixed |
| @prisma/config | high | no | via deepmerge-ts | prisma@7.10.1 **MAJOR** | **open** (high; prisma@7.10.1 **MAJOR**) |
| @sentry/bundler-plugin-core | moderate | no | via glob | yes (in range) | fixed |
| @sentry/nextjs | critical | yes | Sentry-Javascript: Middleware Bypass when using Tunnel route | yes (in range) | **open** (moderate; yes (in range)) |
| @sentry/node | moderate | no | via @fastify/otel, @opentelemetry/instrumentation-http, @opentelemetry/instrumentation-knex, @opentelemetry/instrumentation-mongoose, @opentelemetry/instrumentation-mysql, @opentelemetry/instrumentation-mysql2, @opentelemetry/instrumentation-pg, @opentelemetry/instrumentation-tedious | yes (in range) | fixed |
| @sentry/webpack-plugin | moderate | no | via @sentry/bundler-plugin-core | yes (in range) | **open** (moderate; yes (in range)) |
| @typescript-eslint/eslint-plugin | moderate | no | via @typescript-eslint/parser, @typescript-eslint/type-utils, @typescript-eslint/utils | typescript-eslint@8.36.0 **MAJOR** | **open** (moderate; typescript-eslint@8.36.0 **MAJOR**) |
| @typescript-eslint/parser | moderate | no | via @typescript-eslint/typescript-estree | typescript-eslint@8.36.0 **MAJOR** | **open** (moderate; typescript-eslint@8.36.0 **MAJOR**) |
| @typescript-eslint/type-utils | moderate | no | via @typescript-eslint/typescript-estree, @typescript-eslint/utils | typescript-eslint@8.36.0 **MAJOR** | **open** (moderate; typescript-eslint@8.36.0 **MAJOR**) |
| @typescript-eslint/typescript-estree | moderate | no | via minimatch | typescript-eslint@8.36.0 **MAJOR** | **open** (moderate; typescript-eslint@8.36.0 **MAJOR**) |
| @typescript-eslint/utils | moderate | no | via @typescript-eslint/typescript-estree | typescript-eslint@8.36.0 **MAJOR** | **open** (moderate; typescript-eslint@8.36.0 **MAJOR**) |
| @vitest/mocker | moderate | no | Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock; Vitest: Code injection via unauthenticated manual mock registration | yes (in range) | fixed |
| @xmldom/xmldom | high | no | xmldom: XML fragment injection via invalid EntityReference.nodeName during requireWellFormed serialization; xmldom: Element name injection via createElement() bypasses requireWellFormed | yes (in range) | fixed |
| app-builder-lib | high | no | electron-updater: Uncontrolled search path elements within `AppImage` built by `app-builder-lib` | electron-builder@26.18.0 | **open** (moderate; electron-builder@25.1.0 **MAJOR**) |
| baseline-browser-mapping | moderate | no | baseline-browser-mapping process termination on invalid input causes denial of service | yes (in range) | fixed |
| body-parser | high | no | body-parser vulnerable to denial of service when invalid limit value silently disables size enforcement; body-parser vulnerable to Denial of Service via trailing bytes after a compressed request body | yes (in range) | fixed |
| brace-expansion | high | no | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups; brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | yes (in range) | fixed |
| browserslist | high | no | Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM; Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats) | yes (in range) | fixed |
| builder-util | high | no | via builder-util-runtime | electron-builder@26.18.0 | fixed |
| builder-util-runtime | high | no | electron-updater: Cross-origin redirect leaks `PRIVATE-TOKEN` and mixed-case `Authorization` credentials in `builder-util-runtime` | electron-builder@26.18.0 | fixed |
| cacache | high | no | via tar | electron-builder@26.18.0 | fixed |
| config-file-ts | moderate | no | via glob | electron-builder@26.18.0 | fixed |
| deepmerge-ts | high | no | DeepmergeTS has stack exhaustion when merging recursive object graphs | prisma@7.10.1 **MAJOR** | **open** (high; prisma@7.10.1 **MAJOR**) |
| dmg-builder | high | no | via app-builder-lib, builder-util, builder-util-runtime | electron-builder@26.18.0 | **open** (moderate; electron-builder@25.1.0 **MAJOR**) |
| electron | high | yes | Electron has ASAR Integrity Bypass via resource modification; Electron: AppleScript injection in app.moveToApplicationsFolder on macOS | electron@36.9.5 | **open** (high; electron@45.2.3 **MAJOR**) |
| electron-builder | high | yes | via app-builder-lib, builder-util, builder-util-runtime, dmg-builder | electron-builder@26.18.0 | **open** (moderate; electron-builder@25.1.0 **MAJOR**) |
| electron-builder-squirrel-windows | high | no | via app-builder-lib, builder-util | electron-builder@26.18.0 | **open** (moderate; electron-builder@25.1.0 **MAJOR**) |
| electron-publish | high | no | via builder-util, builder-util-runtime | electron-builder@26.18.0 | fixed |
| esbuild | low | no | esbuild allows arbitrary file read when running the development server on Windows | yes (in range) | fixed |
| eslint-config-next | moderate | yes | via typescript-eslint | eslint-config-next@15.5.29 **MAJOR** | **open** (moderate; eslint-config-next@15.5.29 **MAJOR**) |
| extract-zip | high | no | extract-zip unvalidated symlink path traversal; extract-zip allows arbitrary file writes through symlink archive entries | electron@36.9.5 | **open** (high; electron@45.2.3 **MAJOR**) |
| fast-uri | moderate | no | fast-uri vulnerable to inconsistent host case normalization via percent-encoded octets; fast-uri vulnerable to URI scheme spoofing via percent-encoded scheme decoding | yes (in range) | fixed |
| form-data | high | no | form-data: CRLF injection in form-data via unescaped multipart field names and filenames | yes (in range) | fixed |
| glob | moderate | no | Glob: AbortSignal cancellation bypass allows post-timeout filesystem traversal | electron-builder@26.18.0 | **open** (high; @opennextjs/cloudflare@0.3.0 **MAJOR**) |
| ip-address | high | no | ip-address: Address4 decodes leading-zero octets as decimal while resolvers decode them as octal, allowing SSRF and trust-boundary bypass; ip-address: a CIDR suffix on the parsed address suppresses special-use classification and can bypass SSRF and trust-boundary checks | yes (in range) | fixed |
| make-fetch-happen | high | no | via cacache | electron-builder@26.18.0 | fixed |
| miniflare | high | no | via sharp, undici, ws | yes (in range) | fixed |
| minimatch | moderate | no | minimatch has potential denial of service via globparts amplification | typescript-eslint@8.36.0 **MAJOR** | **open** (moderate; @opennextjs/cloudflare@0.3.0 **MAJOR**) |
| nanoid | high | no | nanoid: non-secure generators can loop indefinitely with negative size; nanoid: custom generators can loop indefinitely when size is zero | yes (in range) | fixed |
| next | critical | yes | Next.js: Middleware / Proxy bypass in App Router applications using Turbopack and single locale; Next.js: Denial of Service in App Router using Server Actions | yes (in range) | fixed |
| postcss | high | no | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output; PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments | yes (in range) | fixed |
| prisma | high | yes | via @prisma/config | prisma@7.10.1 **MAJOR** | **open** (high; prisma@7.10.1 **MAJOR**) |
| proxy-addr | critical | no | proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet | yes (in range) | fixed |
| qs | moderate | no | qs array-limit bypass via bracket-key comma parsing; qs: Denial of Service via Attacker Controlled isBuffer | yes (in range) | fixed |
| rimraf | moderate | no | via glob | yes (in range) | fixed |
| sharp | high | yes | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591; sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545 | sharp@0.35.5 **MAJOR** | **open** (high; sharp@0.35.5 **MAJOR**) |
| source-map-js | high | no | source-map-js allows event-loop denial of service through indexed source-map section offsets | yes (in range) | fixed |
| tar | critical | no | node-tar Vulnerable to Arbitrary File Creation/Overwrite via Hardlink Path Traversal; node-tar is Vulnerable to Arbitrary File Overwrite and Symlink Poisoning via Insufficient Path Sanitization | electron-builder@26.18.0 | fixed |
| tmp | high | no | tmp has Path Traversal via unsanitized prefix/postfix that enables directory escape | yes (in range) | fixed |
| typescript-eslint | moderate | yes | via @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/typescript-estree, @typescript-eslint/utils | typescript-eslint@8.36.0 **MAJOR** | **open** (moderate; typescript-eslint@8.36.0 **MAJOR**) |
| undici | high | no | undici vulnerable to TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent; undici vulnerable to HTTP header injection via Set-Cookie percent-decoding | yes (in range) | fixed |
| vite | high | no | launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows; launch-editor: escapeCmdArgs() omits % escaping on Windows | yes (in range) | fixed |
| vitest | moderate | yes | Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock | yes (in range) | fixed |
| wrangler | moderate | yes | via esbuild, miniflare | yes (in range) | fixed |
| ws | high | no | ws: Memory exhaustion DoS from tiny fragments and data chunks | yes (in range) | fixed |
| zod | high | no | Zod can exhaust memory while validating oversized constrained collections | yes (in range) | fixed |

## Remaining (need a major upgrade — not applied)

| package | severity | needed |
|---|---|---|
| @opennextjs/cloudflare | high | @opennextjs/cloudflare@0.3.0 **MAJOR** |
| @sentry/nextjs | moderate | yes (in range) |
| electron | high | electron@45.2.3 **MAJOR** |
| electron-builder | moderate | electron-builder@25.1.0 **MAJOR** |
| eslint-config-next | moderate | eslint-config-next@15.5.29 **MAJOR** |
| prisma | high | prisma@7.10.1 **MAJOR** |
| sharp | high | sharp@0.35.5 **MAJOR** |
| typescript-eslint | moderate | typescript-eslint@8.36.0 **MAJOR** |

Notes:
- `@sentry/nextjs` remains flagged only via `glob` in its bundler plugins (build-time); no fix inside 10.x.
- `electron` 36.x is end-of-life upstream; the remaining electron advisories require a major (45.x) — separate PR with desktop smoke testing.
- `@opennextjs/cloudflare` "fix" suggested by npm is a *downgrade* to 0.3.0 — do not apply.
- `prisma` 7, `sharp` 0.35, `typescript-eslint`/`eslint-config-next` majors suggested by npm are partly downgrades (npm's resolver output); evaluate individually.

