// 테스트에서 import하지 않은 화면 모듈도 배포 전 구문 검증한다.
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let checked = 0;
for (const dir of ["assets", "src", "scripts"]) {
  for (const name of readdirSync(dir)) {
    if (!/\.(?:js|mjs)$/.test(name)) continue;
    execFileSync(process.execPath, ["--check", join(dir, name)], { stdio: "inherit" });
    checked++;
  }
}
console.log(`JavaScript 구문 검사: ${checked}개 파일 통과`);
