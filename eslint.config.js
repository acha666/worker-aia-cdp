import js from "@eslint/js";
import typescriptEslint from "typescript-eslint";
import vueEslintParser from "vue-eslint-parser";
import vuePlugin from "eslint-plugin-vue";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".wrangler/**",
      "coverage/**",
      "public/**",
      "tests/web/**",
    ],
  },
  js.configs.recommended,
  ...typescriptEslint.configs.recommended,
  ...typescriptEslint.configs.stylistic,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    // Browser globals for Vue frontend
    files: ["src/web/**/*.ts", "src/web/**/*.tsx", "src/web/**/*.vue"],
    languageOptions: {
      globals: {
        // Browser APIs
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        HTMLElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLInputElement: "readonly",
        DragEvent: "readonly",
        Event: "readonly",
        File: "readonly",
        FileList: "readonly",
        TextDecoder: "readonly",
        Blob: "readonly",
        Uint8Array: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        console: "readonly",
      },
    },
  },
  {
    // Worker and contract TypeScript files
    files: ["src/worker/**/*.ts", "src/contracts/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
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
      "prefer-template": "error",
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
        "error",
        {
          ignoreRestArgs: true,
          fixToUnknown: false,
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
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
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
          modifiers: ["const"],
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
          selector: "typeProperty",
          format: ["camelCase", "UPPER_CASE"],
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE"],
        },
        {
          selector: "objectLiteralMethod",
          format: [],
        },
        {
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
    // Web frontend TypeScript files (basic linting only, no type-aware checking)
    files: ["src/web/**/*.ts", "src/web/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
    },
  },
  {
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
    rules: {
      "no-undef": "off",
    },
  },
  {
    // Vue single-file components
    files: ["src/web/**/*.vue"],
    languageOptions: {
      parser: vueEslintParser,
      parserOptions: {
        parser: typescriptEslint.parser,
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
      },
    },
    plugins: {
      vue: vuePlugin,
    },
    rules: {
      ...vuePlugin.configs.recommended.rules,
      "vue/multi-word-component-names": "off",
      "vue/no-v-html": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
];
