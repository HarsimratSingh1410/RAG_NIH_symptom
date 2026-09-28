import os
import re
from datasets import load_dataset
from upstash_vector import Index, Vector
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

# Load environment variables
load_dotenv(".env.local")

UPSTASH_VECTOR_REST_URL = os.environ.get("UPSTASH_VECTOR_REST_URL")
UPSTASH_VECTOR_REST_TOKEN = os.environ.get("UPSTASH_VECTOR_REST_TOKEN")

if not UPSTASH_VECTOR_REST_URL or not UPSTASH_VECTOR_REST_TOKEN:
    raise ValueError("Missing UPSTASH_VECTOR_REST_URL or UPSTASH_VECTOR_REST_TOKEN in .env.local!")

KEEP_TYPES = {
    "symptoms", "causes", "treatment", "diagnosis",
    "prevention", "complications", "susceptibility", "outlook",
}

# Initialize local embedding model (downloads automatically on first run)
print("⏳ Loading local embedding model (BAAI/bge-base-en-v1.5)...")
model = SentenceTransformer("BAAI/bge-base-en-v1.5")

def chunk(text: str, max_words: int = 180) -> list[str]:
    words = text.split()
    parts = [" ".join(words[i:i + max_words]) for i in range(0, len(words), max_words)]
    return parts or [text]

def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate 768-dim vector embeddings locally."""
    # This runs entirely on your local machine, no API keys needed
    embeddings = model.encode(texts, show_progress_bar=False).tolist()
    return embeddings

def main():
    print("=" * 60)
    print("🏥 MedQuAD Ingestion Pipeline (Local 768-dim)")
    print("=" * 60)

    print("\n📥 Loading MedQuAD dataset from HuggingFace...")
    ds = load_dataset("lavita/MedQuAD")["train"]

    rows = [r for r in ds if r["answer"] and r["question_type"].lower() in KEEP_TYPES]
    print(f"✅ Filtered {len(rows)} symptom-related QA pairs from {len(ds)} total rows.")

    index = Index(url=UPSTASH_VECTOR_REST_URL, token=UPSTASH_VECTOR_REST_TOKEN)

    items_to_embed = []
    for r in rows:
        focus = re.sub(r"[^a-zA-Z0-9]", "_", r["question_focus"] or "unknown")[:40]
        for i, part in enumerate(chunk(r["answer"])):
            vec_id = f"{focus}-{r['question_type']}-{i}-{abs(hash(r['question'])) % 100000}"
            items_to_embed.append({
                "id": vec_id,
                "text": part,
                "metadata": {
                    "question_focus": r["question_focus"],
                    "question_type": r["question_type"],
                    "source_question": r["question"],
                    "text": part,
                },
            })

    print(f"📦 Prepared {len(items_to_embed)} text chunks to embed and upsert.")

    batch_size = 100
    total = 0

    for i in range(0, len(items_to_embed), batch_size):
        chunk_batch = items_to_embed[i:i + batch_size]
        texts = [item["text"] for item in chunk_batch]

        # Generate embeddings locally
        embeddings = get_embeddings(texts)

        # Build Upstash Vector objects
        vectors = [
            Vector(id=item["id"], vector=embeddings[idx], metadata=item["metadata"])
            for idx, item in enumerate(chunk_batch)
        ]

        index.upsert(vectors=vectors)
        total += len(vectors)
        print(f"  ↑ [{total}/{len(items_to_embed)}] Embeddings generated & upserted...")

    print(f"\n🎉 Done! Successfully ingested {total} vectors into Upstash!")

if __name__ == "__main__":
    main()