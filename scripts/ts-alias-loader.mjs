import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  let candidate = specifier;
  if (specifier.startsWith("@/")) {
    candidate = pathToFileURL(path.join(projectRoot, "src", specifier.slice(2))).href;
  } else if (specifier.startsWith(".")) {
    candidate = new URL(specifier, context.parentURL).href;
  }

  try {
    return await nextResolve(candidate, context);
  } catch (error) {
    if (candidate.startsWith("file:")) {
      const file = fileURLToPath(candidate);
      for (const suffix of [".ts", ".tsx", ".js", "/index.ts"]) {
        try {
          return await nextResolve(pathToFileURL(file + suffix).href, context);
        } catch {
          // Try the next supported source extension.
        }
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const value = JSON.parse(fs.readFileSync(fileURLToPath(url), "utf8"));
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(value)};`,
    };
  }
  return nextLoad(url, context);
}
