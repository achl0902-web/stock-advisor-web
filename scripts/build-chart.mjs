import { build } from "esbuild";

// GitHub Pages는 정적 파일만 배포한다. npm ci + npm run build:chart로
// React/Funnest 소스에서 배포 번들을 반복 생성할 수 있다.
await build({
  entryPoints: ["src/chart-app.jsx"],
  outfile: "assets/sise.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  charset: "utf8",
  legalComments: "inline",
  banner: {
    js: "/* Generated from src/chart-app.jsx — npm run build:chart. Do not edit directly. */",
  },
  logLevel: "info",
});
