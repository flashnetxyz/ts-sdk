import typescript from "@rollup/plugin-typescript";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

// Get all external dependencies
const externalPackages = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  "node:crypto",
  "node:util",
  "fs",
  "path",
];

// Function to handle subpath imports (e.g., @noble/curves/secp256k1)
const external = (id) => {
  return externalPackages.some((pkg) => id === pkg || id.startsWith(pkg + "/"));
};

// Plugin to create package.json files in dist directories
const createPackageJson = (type) => ({
  name: "create-package-json",
  writeBundle(options) {
    const content = JSON.stringify({ type }, null, 2);
    writeFileSync(join(options.dir, "package.json"), content);
  },
});

export default [
  // ESM build
  {
    input: "index.ts",
    external,
    output: {
      dir: "dist/esm",
      format: "es",
      preserveModules: true,
      preserveModulesRoot: ".",
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        declarationMap: true,
        outDir: "dist/esm",
        compilerOptions: {
          module: "ESNext",
          target: "ES2022",
        },
        exclude: ["**/*.test.ts", "**/*.spec.ts"],
      }),
      createPackageJson("module"),
    ],
  },
  // CJS build
  {
    input: "index.ts",
    external,
    output: {
      dir: "dist/cjs",
      format: "cjs",
      preserveModules: true,
      preserveModulesRoot: ".",
      sourcemap: true,
      exports: "named",
      interop: "auto",
    },
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        declarationMap: true,
        outDir: "dist/cjs",
        compilerOptions: {
          module: "ESNext",
          target: "ES2022",
        },
        exclude: ["**/*.test.ts", "**/*.spec.ts"],
      }),
      createPackageJson("commonjs"),
    ],
  },
];
