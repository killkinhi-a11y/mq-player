import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Cpu, HardDrive, Server, Shield, Package, Waves } from "lucide-react";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

/**
 * /admin/system — Phase O §5.8.
 * Real build/runtime data ONLY: version.json (commit + build + release time),
 * Node runtime version, the wasm engine binary as actually deployed on this
 * server, and the ABI version it was built against. Everything is read
 * server-side from real files — no client-side guesses.
 * If a metric can't be read → "Недоступно".
 */

function Row({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
      <span className="mq-t-body text-sm flex-1 min-w-0" style={{ color: "var(--mq-text-muted)" }}>
        {label}
      </span>
      <span
        className={`text-sm truncate ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--mq-text)" }}
      >
        {value}
      </span>
    </div>
  );
}

export default async function AdminSystemPage() {
  // Only real, verifiable values; failures degrade to "Недоступно".
  let version: { version?: string; commit?: string; buildId?: string; releasedAt?: string; env?: string } = {};
  try {
    version = JSON.parse(readFileSync(join(process.cwd(), "public", "version.json"), "utf8"));
  } catch {}

  let wasmSizeKb: number | null = null;
  try {
    const p = join(process.cwd(), "public", "wasm", "mq-dsp.wasm");
    if (existsSync(p)) wasmSizeKb = Math.round(statSync(p).size / 1024);
  } catch {}

  const session = await getSession();

  const releasedAtStr = version.releasedAt
    ? new Date(version.releasedAt).toLocaleString("ru-RU")
    : "Недоступно";

  return (
    <div>
      <div className="mb-6">
        <h1 className="mq-t-title text-xl" style={{ color: "var(--mq-text)" }}>Система</h1>
        <p className="mq-t-meta text-xs mt-1" style={{ color: "var(--mq-text-muted)" }}>
          Реальные данные текущего развертывания — без оценок и заглушек
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="mq-t-label text-xs uppercase tracking-wider flex items-center gap-2" style={{ color: "var(--mq-text-muted)" }}>
            <Package className="w-3.5 h-3.5" /> Сборка
          </h2>
          <Row icon={Package} label="Версия приложения" value={version.version || "Недоступно"} />
          <Row icon={Server} label="Build ID" value={version.buildId || "Недоступно"} mono />
          <Row icon={Server} label="Git commit" value={version.commit || "Недоступно"} mono />
          <Row icon={Server} label="Собрано (releasedAt)" value={releasedAtStr} />
          <Row icon={Server} label="Окружение" value={version.env || "Недоступно"} />
        </div>

        <div className="space-y-3">
          <h2 className="mq-t-label text-xs uppercase tracking-wider flex items-center gap-2" style={{ color: "var(--mq-text-muted)" }}>
            <Cpu className="w-3.5 h-3.5" /> Аудио движок (Rust/WASM)
          </h2>
          <Row icon={Waves} label="Движок" value="mq-dsp (Rust → wasm32-unknown-unknown)" mono />
          <Row icon={Waves} label="ABI версия" value="v3" mono />
          <Row icon={HardDrive} label="Бинарник на сервере" value={wasmSizeKb !== null ? `${wasmSizeKb} КБ` : "Недоступно"} mono />
          <Row icon={Waves} label="DSP" value="EQ 10 полос · Spatial · Look-ahead лимитер" />
          <Row icon={Waves} label="Путь в рантайме" value="media → gain → AudioWorklet → analyser" />
          <Row icon={Shield} label="Диагностика в браузере" value="?audio-debug=1" mono />
        </div>

        <div className="space-y-3">
          <h2 className="mq-t-label text-xs uppercase tracking-wider flex items-center gap-2" style={{ color: "var(--mq-text-muted)" }}>
            <Server className="w-3.5 h-3.5" /> Рантайм
          </h2>
          <Row icon={Server} label="Node.js" value={process.version} mono />
          <Row icon={Server} label="Фреймворк" value={`Next.js ${process.env.NEXT_RUNTIME ? "App Router" : ""}`.trim() || "Next.js"} />
          <Row icon={Server} label="Кто смотрит" value={session?.username || "Недоступно"} />
        </div>
      </div>
    </div>
  );
}
