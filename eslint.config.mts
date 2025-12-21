import nx from "@nx/eslint-plugin";
import security from "eslint-plugin-security";
import importPlugin from "eslint-plugin-import";
import unicorn from "eslint-plugin-unicorn";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";

const unicornRecommendedRules =
  unicorn.configs["recommended"]?.rules ?? unicorn.configs.recommended.rules;

export default defineConfig(
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  ...nx.configs["flat/javascript"],
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    ignores: [
      "node_modules",
      "**/dist",
      "**/out-tsc",
      "**/vitest.config.*.timestamp*",
      "vite.config.mts",
      "eslint.config.mts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      security,
      import: importPlugin,
      unicorn,
      sonarjs,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.lib.json",
      },
    },
    rules: {
      ...unicornRecommendedRules,
      ...security.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-this-assignment": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      import: importPlugin,
      unicorn,
      vitest,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.spec.json",
      },
    },
    rules: {
      ...unicornRecommendedRules,
      ...vitest.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ["**/*.json"],
    rules: {
      "@nx/dependency-checks": "off",
    },
  },
);
