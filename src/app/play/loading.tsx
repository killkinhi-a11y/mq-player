export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl"
          style={{ backgroundColor: "var(--mq-accent, #e03131)" }}>
          <span className="text-3xl font-black text-white">mq</span>
        </div>
      </div>
      <p className="text-sm" style={{ color: "var(--mq-text-muted, #888)" }}>
        Загрузка...
      </p>
    </div>
  );
}
