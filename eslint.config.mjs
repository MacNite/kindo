import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "public/sw.js", "public/swe-worker-*.js"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `_name` marks a value destructured only to leave it out.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      // Avatars and Immich thumbnails are arbitrary user/proxy URLs; next/image adds nothing yet.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
