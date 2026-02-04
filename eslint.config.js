import js from "@eslint/js";
import typescriptEslint from "typescript-eslint";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".wrangler/**",
      "coverage/**",
      "frontend/**",
      "public/**",
      "tests/frontend/**",
    ],
  },
  js.configs.recommended,
  ...typescriptEslint.configs.recommended,
  ...typescriptEslint.configs.stylistic,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        console: "readonly",
      },
    },
    rules: {
      // Core ESLint Rules
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "prefer-template": "warn",
      curly: ["error", "all"],
      semi: ["error", "always"],

      // TypeScript-specific rules
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-types": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": [
        "warn",
        {
          ignoreRestArgs: true,
          fixToUnknown: false,
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE"],
        },
        {
          // Allow OID notation (1.2.3.4) in object literal methods
          selector: "objectLiteralMethod",
          format: [],
        },
        {
          // Allow special headers like Content-Type
          selector: "objectLiteralProperty",
          format: [],
        },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/array-type": ["warn", { default: "array" }],
    },
  },
  {
    // Relax rules for test files
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Config files (JS only, no TypeScript parsing)
    files: ["vite.config.js", "eslint.config.js"],
    languageOptions: {
      parser: undefined,
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
];
