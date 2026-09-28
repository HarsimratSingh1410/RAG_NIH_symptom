// Run once from the project root:  node download-model.mjs
// Downloads the embedding model into ./.hf-cache so the first chat request
// doesn't have to. Uses the same settings as app/api/chat/route.ts.
import path from "node:path";
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.cacheDir = path.join(process.cwd(), ".hf-cache");

console.log("Downloading Xenova/bge-base-en-v1.5 (about 110 MB, one time)...");
const start = Date.now();

const extractor = await pipeline("feature-extraction", "Xenova/bge-base-en-v1.5", {
  dtype: "q8",
  progress_callback: (p) => {
    if (p.status === "progress") {
      process.stdout.write(`\r  ${p.file}: ${Math.round(p.progress)}%   `);
    } else if (p.status === "done") {
      process.stdout.write(`\r  ${p.file}: done          \n`);
    }
  },
});

const out = await extractor("test sentence", { pooling: "mean", normalize: true });
const seconds = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\nOK: model works (vector size ${out.dims.at(-1)}), took ${seconds}s.`);
