import fs from "fs/promises";

const ZAI_CONFIG = {
  baseUrl: "http://172.25.136.193:8080/v1",
  apiKey: "Z.ai",
  chatId: "chat-f627c430-51b8-4238-88e1-3d877d8a89f5",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMWIyNTlhMmYtYmU1YS00YmY0LThhZGMtOTYwYzdiMzUyZGIwIiwiY2hhdF9pZCI6ImNoYXQtZjYyN2M0MzAtNTFiOC00MjM4LTg4ZTEtM2Q4NzdkOGE4OWY1IiwicGxhdGZvcm0iOiJ6YWkifQ.mTWVI2wVacuZHssX9w5kZYCI9999GmYbCWhJTgCykwU",
  userId: "1b259a2f-be5a-4bf4-8adc-960c7b352db0",
};

// Patch fs.readFile so ZAI SDK can find config on any platform (Vercel serverless, etc.)
const originalReadFile = fs.readFile.bind(fs);
const configJson = JSON.stringify(ZAI_CONFIG);

(fs as any).readFile = async (filePath: any, ...args: any[]) => {
  if (typeof filePath === "string" && filePath.endsWith(".z-ai-config")) {
    return configJson;
  }
  return originalReadFile(filePath, ...args);
};

import ZAI from "z-ai-web-dev-sdk";

export async function createZAI() {
  return ZAI.create();
}
