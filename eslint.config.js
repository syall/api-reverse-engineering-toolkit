import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: ["node_modules/**", "**/*.md", "eslint.config.js"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Targets your test file paths exclusively
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          // Tells ESLint that node:test test() is safe to invoke without await
          allowForKnownSafeCalls: [
            {
              from: "package",
              name: ["test"],
              package: "node:test",
            },
          ],
        },
      ],
    },
  },
]);
