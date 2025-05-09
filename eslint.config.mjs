import eslint from "@eslint/js";
import tsEslint from "typescript-eslint";
import prettierConfig from "eslint-plugin-prettier/recommended";
import tsParser from "@typescript-eslint/parser";
import eslintPluginTSDoc from "eslint-plugin-tsdoc";
import typescriptEslintPlugin from "@typescript-eslint/eslint-plugin";

export default tsEslint.config(
  eslint.configs.recommended,
  tsEslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2021,
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslintPlugin,
      "eslint-plugin-tsdoc": eslintPluginTSDoc,
    },
  },
);
