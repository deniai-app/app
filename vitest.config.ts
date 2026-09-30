import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tools/*.test.ts", "src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
      BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
      NEXT_PUBLIC_BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
