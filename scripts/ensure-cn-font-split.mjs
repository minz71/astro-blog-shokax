// 构建前确保 cn-font-split 的原生库存在。
//
// cn-font-split 的 postinstall（dist/init.sh）不带版本时会去 ungh.cc 查最新版，
// 查询失败就拼出 `releases/download//libffi-*.so` 这种空版本 URL，curl 404 后
// 脚本仍然 exit 0，直到 astro build 加载字体插件才以 ERR_FFI 崩溃（CF 构建踩过）。
// 这里固定版本补下载，并在下载后再次校验，失败就在构建最前面明确报错。
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// 与本机验证过的组合一致：npm 包 7.4.3 + 原生库 7.6.8
const CORE_VERSION = "7.6.8";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("cn-font-split/package.json"));
const { getBinName, matchPlatform } = require(join(pkgDir, "dist/load.js"));
const { isMusl } = require(join(pkgDir, "dist/node/isMusl.js"));

// 与 cn-font-split 自身加载逻辑一致：设置了 CN_FONT_SPLIT_BIN 就用它
const binPath =
  process.env.CN_FONT_SPLIT_BIN ||
  join(pkgDir, "dist", getBinName(matchPlatform(process.platform, process.arch, isMusl)));

const isReady = () => existsSync(binPath) && statSync(binPath).size > 0;

if (isReady()) process.exit(0);

if (process.env.CN_FONT_SPLIT_BIN) {
  console.error(`[cn-font-split] CN_FONT_SPLIT_BIN 指向的文件不存在：${binPath}`);
  process.exit(1);
}

console.log(`[cn-font-split] 缺少原生库，下载 ${CORE_VERSION}：${binPath}`);
spawnSync(process.execPath, [join(pkgDir, "dist/cli.js"), "i", `default@${CORE_VERSION}`], {
  stdio: "inherit",
});

if (!isReady()) {
  console.error(
    `[cn-font-split] 原生库下载失败：${binPath}\n` +
      `  可手动执行：node ${join(pkgDir, "dist/cli.js")} i default@${CORE_VERSION}`,
  );
  process.exit(1);
}
