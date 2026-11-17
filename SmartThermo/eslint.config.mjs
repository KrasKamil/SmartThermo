import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { 
          "argsIgnorePattern": "^_", 
          "varsIgnorePattern": "^_",
          "caughtErrors": "none"
        }
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "warn",
      "no-case-declarations": "off",
      "no-empty": "warn",
      "prefer-const": "warn"
    }
  },
  {
    ignores: ["dist/**", "node_modules/**", "public/**", "scripts/**", "jsons/**"]
  }
);
