import { db } from "@/lib/db";

/**
 * Prisma seed — creates default feature flags on first deploy.
 * Run: npx prisma db seed
 */

async function main() {
  console.log("🌱 Seeding database...");

  // Create maintenance_mode flag if not exists
  const existingMaintenance = await db.featureFlag.findUnique({
    where: { key: "maintenance_mode" },
  });

  if (!existingMaintenance) {
    await db.featureFlag.create({
      data: {
        key: "maintenance_mode",
        name: "Технические работы",
        description: "Включает баннер о технических работах для всех пользователей и блокирует регистрацию/вход",
        enabled: false,
      },
    });
    console.log("✅ Created feature flag: maintenance_mode");
  } else {
    console.log("⏭️  Feature flag maintenance_mode already exists");
  }

  console.log("🌱 Seed completed.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
