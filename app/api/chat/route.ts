import path from "node:path";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { groq } from "@ai-sdk/groq";
import { Index } from "@upstash/vector";
import { pipeline, env } from "@huggingface/transformers";

// ---- Embedding model setup -------------------------------------------------
// Never look for model files on disk that we did not download ourselves.
env.allowLocalModels = false;
// Fixed cache folder so the model is only downloaded once.
// (On Vercel the project folder is read-only, so use /tmp there.)
env.cacheDir = process.env.VERCEL
  ? "/tmp/.hf-cache"
  : path.join(process.cwd(), ".hf-cache");

// The embedding model + onnxruntime need the Node.js runtime (not Edge)
export const runtime = "nodejs";
export const maxDuration = 30;

// Ignore search hits below this cosine score.
const MIN_SCORE = 0.72;

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

const BASE_PROMPT = `You are a medical-FAQ assistant grounded in NIH sources.
Rules:
- Answer ONLY using facts from the NIH CONTEXT section below. If it says no
  relevant passages were found, say plainly that you don't have grounded
  information on that.
- Never diagnose. Never give dosing/prescription instructions.
- If the user describes an emergency (chest pain, trouble breathing, suicidal
  thoughts, severe bleeding, stroke signs), tell them to contact emergency
  services immediately instead of answering normally.
- Cite the "question_focus" for each fact you use, like: (source: Diabetes).
- Always end every answer with: "This is general information, not medical advice."`;

function buildSystemPrompt(passages: unknown[]): string {
  if (passages.length === 0) {
    return `${BASE_PROMPT}\n\nNIH CONTEXT:\n(no relevant passages found)`;
  }
  const context = passages
    .map((p, i) => `[${i + 1}] ${JSON.stringify(p)}`)
    .join("\n");
  return `${BASE_PROMPT}\n\nNIH CONTEXT:\n${context}`;
}

// The pipeline() type is huge; treat it loosely to avoid TS "too complex" errors.
const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>
) => Promise<any>;

// Keep ONE loaded model per server process. Stored on globalThis so Next.js
// hot reloads in dev don't reload it, and stored as a promise so two requests
// arriving together don't both start loading it.
const globalForEmbedder = globalThis as unknown as {
  __embedderPromise?: Promise<any>;
};

function getEmbedder(): Promise<any> {
  if (!globalForEmbedder.__embedderPromise) {
    console.log("[rag] loading embedding model (first time can take a while)...");
    const t0 = Date.now();
    globalForEmbedder.__embedderPromise = createPipeline(
      "feature-extraction",
      "Xenova/bge-base-en-v1.5",
      { dtype: "q8" } // the 110 MB quantized file
    )
      .then((model) => {
        console.log(`[rag] embedding model ready in ${Date.now() - t0}ms`);
        return model;
      })
      .catch((err) => {
        // Allow a retry on the next request instead of caching the failure.
        globalForEmbedder.__embedderPromise = undefined;
        console.error("[rag] embedding model failed to load:", err);
        throw err;
      });
  }
  return globalForEmbedder.__embedderPromise;
}

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

/**
 * Search text = the latest user message. If it is very short ("how is it
 * treated?"), prepend the previous user message so the search has context.
 */
function buildSearchQuery(messages: UIMessage[]): string {
  const userTexts = messages
    .filter((m) => m.role === "user")
    .map(textOf)
    .filter((t) => t.trim().length > 0);
  const last = userTexts[userTexts.length - 1] ?? "";
  const previous = userTexts[userTexts.length - 2];
  const wordCount = last.trim().split(/\s+/).filter(Boolean).length;
  return wordCount < 5 && previous ? `${previous} ${last}` : last;
}

async function retrievePassages(query: string): Promise<unknown[]> {
  if (!query.trim()) return [];
  const t0 = Date.now();
  console.log(`[rag] search: "${query}"`);

  // 1. Load the local Hugging Face model (cached after the first time)
  const embedder = await getEmbedder();

  // 2. Turn the text query into a 768-dimensional vector
  const output = await embedder(query, { pooling: "mean", normalize: true });
  const queryVector = Array.from(output.data as ArrayLike<number>);

  // 3. Query the Upstash index using the vector
  const res = await index.query({
    vector: queryVector,
    topK: 4,
    includeMetadata: true,
  });
  console.log(
    `[rag] upstash returned ${res.length} hits, scores: [${res
      .map((r) => r.score.toFixed(3))
      .join(", ")}] in ${Date.now() - t0}ms`
  );

  const hits = res
    .filter((r) => r.score > MIN_SCORE && r.metadata)
    .map((r) => r.metadata);
  console.log(`[rag] keeping ${hits.length} hits above ${MIN_SCORE}`);
  return hits;
}

export async function POST(req: Request) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages || []; // Fallback to empty array

  // Retrieve the NIH passages first, on the server, so the model never has to
  // decide whether to call a tool.
  let passages: unknown[];
  try {
    passages = await retrievePassages(buildSearchQuery(messages));
  } catch (error) {
    console.error("[rag] retrieval failed:", error);
    const detail =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : "Could not search the medical sources. Please try again.";
    return new Response(detail, { status: 500 });
  }

  // `await` is harmless on older versions (sync) and required on newer ones (async).
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    // Direct Groq provider: free tier, needs GROQ_API_KEY in .env.local.
    // (llama-3.1-8b-instant was shut down on Groq's free plan on 2026-08-16.)
    model: groq("openai/gpt-oss-20b"),
    system: buildSystemPrompt(passages),
    messages: modelMessages,
    onFinish: (event) => {
      console.log(
        `[chat] done: finishReason=${event.finishReason}, textChars=${event.text?.length ?? 0}`
      );
    },
  });

  return result.toUIMessageStreamResponse({
    // By default the client only sees a generic "An error occurred."
    // Show the real message in dev so problems are easy to diagnose.
    onError: (error) => {
      console.error("[chat] stream error:", error);
      if (process.env.NODE_ENV === "development") {
        return error instanceof Error ? error.message : String(error);
      }
      return "Something went wrong. Please try again.";
    },
  });
}