const esbuild = require("esbuild");

const isWatch = process.argv.includes("--watch");

const build = async () => {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: "dist/extension.js",
    external: ["vscode"],
    sourcemap: true,
    minify: false,
  });

  if (isWatch) {
    await ctx.watch();
    console.log("👀 Watching...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log("✅ Build complete");
  }
};

build();
