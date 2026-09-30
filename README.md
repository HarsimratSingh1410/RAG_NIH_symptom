# Symptom-Info Assistant

A chat application that answers general health questions using a database of NIH-sourced medical question-and-answer content. It is a retrieval-augmented generation (RAG) project: instead of letting a language model answer from memory, the app first searches a vector database for relevant passages and then asks the model to answer using only what was found.

This project is for learning and demonstration. It provides general information only and is not medical advice. Always consult a qualified healthcare professional.

This version is designed to run on your own computer. See the "Deployment" section for why it is not set up for Vercel or other serverless hosting.

## What it does

- Shows a chat interface with suggested questions you can click to get started.
- Converts each question into a vector using an embedding model that runs locally inside the app's server.
- Searches an Upstash Vector index of NIH-sourced medical passages for the closest matches.
- Sends the best matches to a language model (Groq, free tier) with strict instructions to answer only from those passages and to cite the source topic.
- Streams the answer back word by word and renders it as formatted text.
- Refuses to diagnose or give dosing instructions, and tells the user to contact emergency services if they describe an emergency such as chest pain, trouble breathing, stroke signs, severe bleeding or suicidal thoughts.
- Says plainly when it has no grounded information on a topic, instead of guessing.

## How it works

```
Browser (chat page)
      |
      |  POST /api/chat  (the conversation so far)
      v
Next.js API route  (app/api/chat/route.ts)
      |
      |  1. Build a search query from the latest user message
      |  2. Turn the query into a 768-number vector with the local
      |     embedding model (BAAI/bge-base-en-v1.5, quantized)
      v
Upstash Vector index
      |   3. Return the 4 closest passages with similarity scores
      v
Next.js API route
      |  4. Keep only passages with a score above 0.72
      |  5. Put the kept passages into the system prompt as "NIH CONTEXT"
      |  6. Call the language model and stream the reply
      v
Groq (openai/gpt-oss-20b)
      |
      v
Browser shows the streamed answer
```

Key design choices:

- Retrieval happens on the server before the model is called. The model never has to decide whether to search, which makes the behavior predictable with a small model.
- Short follow-up questions such as "how is it treated?" are combined with the previous user question so the search still has context.
- The embedding model runs inside the Next.js server using Transformers.js and ONNX Runtime. The first time it is needed, it is downloaded (about 110 MB) and saved in a `.hf-cache` folder in the project root. After that it loads from disk.
- The same embedding model must be used to fill the index and to search it. Vectors from different models are not comparable.
- If no passage scores above the threshold, the model is told nothing relevant was found and answers accordingly.

## Tech stack

| Part | Technology |
| --- | --- |
| Framework | Next.js (App Router), React, TypeScript |
| Styling | Tailwind CSS plus custom CSS in `app/globals.css` |
| Chat state and streaming | Vercel AI SDK (`ai`, `@ai-sdk/react`) |
| Language model | Groq, `openai/gpt-oss-20b`, through `@ai-sdk/groq` |
| Embeddings | `Xenova/bge-base-en-v1.5` (BAAI bge-base-en-v1.5, 8-bit quantized) through `@huggingface/transformers` |
| Vector database | Upstash Vector (768 dimensions, cosine similarity) |
| Answer formatting | `react-markdown` with `remark-gfm` |
| Data loading | Python script in `rag-data/` |

## Project structure

```
app/
  api/chat/route.ts    Server endpoint: embedding, search, prompt building, model call
  layout.tsx           Page layout
  page.tsx             Chat interface
  globals.css          Styles
rag-data/
  ingest.py            One-time script that loads the NIH data into the index
download-model.mjs     Optional script that downloads the embedding model ahead of time
package.json           Node dependencies and scripts
.hf-cache/             Created automatically; holds the downloaded embedding model (not committed)
```

The `.env.local` file holds your secret keys. You create it yourself, it is listed in `.gitignore`, and it must never be committed.

## Prerequisites

- Node.js 20 or newer, with npm (check with `node -v`)
- Git
- Python 3 (only needed to load the data once)
- An internet connection for the first run (to install packages and download the embedding model)
- About 500 MB of free disk space
- A free Groq account
- A free Upstash account

No credit card is needed for the free plans of Groq or Upstash.

## Setup

### 1. Clone the repository and install dependencies

```
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
npm install
```

Replace the address with the real repository address. Keep the internet connection on during `npm install`, because one of the packages downloads a native library for your operating system.

### 2. Get a Groq API key

1. Go to https://console.groq.com and sign up.
2. Open API Keys, create a key and copy it. It starts with `gsk_`.

### 3. Create the Upstash Vector index

1. Go to https://console.upstash.com and open the Vector section.
2. Click Create Index and choose:
   - A name of your choice
   - Any region
   - Similarity function: Cosine
   - Dimensions: 768
   - Do not select a built-in embedding model. This project creates its own vectors.
3. Create the index and copy its REST URL and REST token.

Free accounts may be limited in how many indexes they can hold, so delete an unused one if the console refuses to create a new index.

### 4. Create the environment file

In the project root (the folder that contains `package.json`), create a file named `.env.local` with these three lines, using your own values:

```
GROQ_API_KEY=gsk_your_key_here
UPSTASH_VECTOR_REST_URL=https://your-index-url.upstash.io
UPSTASH_VECTOR_REST_TOKEN=your_upstash_token_here
```

Do not add quotes or spaces around the values.

### 5. Load the data into the index

The `rag-data` folder contains `ingest.py`, the one-time script that fills the index. It uploads the NIH question-and-answer records together with their metadata (including the `question_focus` field that the assistant cites in its answers).

The vectors stored in the index must be created with the BAAI/bge-base-en-v1.5 model, the same model the app uses when searching. If a different model is used to fill the index, the search results will be poor or meaningless.

Run the script once from inside the `rag-data` folder, using a Python virtual environment.

Windows (PowerShell):

```
cd rag-data
python -m venv venv
venv\Scripts\Activate.ps1
```

macOS or Linux:

```
cd rag-data
python3 -m venv venv
source venv/bin/activate
```

Then install the packages that `ingest.py` imports (the import lines at the top of the file list them) and run it:

```
python ingest.py
```

The script needs the same Upstash URL and token as the app. The top of `ingest.py` shows how it reads them.

The free Upstash plan allows 10,000 queries or updates per day, and uploaded records count toward that limit. If the dataset is larger than that, spread the upload over more than one day. This step only has to be done once per index.

### 6. Download the embedding model (recommended)

Go back to the project root and run:

```
node download-model.mjs
```

This downloads the embedding model (about 110 MB) into `.hf-cache` and shows a progress bar. It prints an OK message when finished. You only need to do this once.

You can skip this step. If you do, the model is downloaded during your first question instead, and that first answer can take a minute or more depending on your connection.

### 7. Run the app

From the project root:

```
npm run dev
```

Open http://localhost:3000 in a browser and click one of the suggested questions or type your own.

Whenever you change `.env.local`, stop the server with Ctrl+C and start it again. Next.js only reads environment files at startup.

## Configuration

These values are in `app/api/chat/route.ts`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `MIN_SCORE` | `0.72` | Minimum similarity score for a passage to be used. Lower it (for example to 0.6) if good matches are being discarded, raise it to be stricter. |
| `topK` (in `retrievePassages`) | `4` | How many passages are fetched from the index per question. |
| Model name (in `streamText`) | `openai/gpt-oss-20b` | The Groq model used to write the answer. |
| `dtype` (in `getEmbedder`) | `q8` | Uses the 110 MB quantized embedding model instead of the 436 MB full-size one. |

While the app runs, the terminal prints lines starting with `[rag]` (the embedding model, the search and its scores) and `[chat]` (the model result). These are the fastest way to see what is happening.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| The first question shows the typing dots for a minute or more | The embedding model is downloading. This happens once. Run `node download-model.mjs` to see the progress, or wait for it to finish. |
| The model download fails or stalls | Your network may be blocking huggingface.co. Try another network. Running `node download-model.mjs` shows the exact error. |
| Error: Cannot find module 'onnxruntime-node' | The dependencies did not install fully. Delete the `node_modules` folder and run `npm install` again with an internet connection. This error also happens when deploying to Vercel, which this version does not support. |
| Text box or suggestion buttons do nothing | Make sure the installed `ai` and `@ai-sdk/react` packages are recent versions (`npm ls ai @ai-sdk/react`). This project uses the current chat API. |
| Red error banner mentioning an API key or 401 | The Groq key is missing, mistyped or has extra spaces. Fix `.env.local` and restart the server. |
| Error saying the model does not exist | Groq retired or renamed the model. See the deprecations page above and update the model name. |
| Error from Upstash about vector dimensions | The index must have exactly 768 dimensions. Create a new index as described in step 3 and reload the data. |
| Every answer says there is no grounded information | Look at the `[rag]` lines in the terminal. If the index returns 0 hits, the data was not loaded. If the scores are just under 0.72, lower `MIN_SCORE`. If the scores are all low for clearly relevant questions, the index may have been filled with a different embedding model. |
| "The assistant did not return an answer" notice | The model call finished without text. Check the terminal for a `[chat] stream error` line. |
| Port 3000 is already in use | Run `npm run dev -- -p 3001` and open http://localhost:3001. |

## Limitations

- Answers are only as good as the data in the index. Topics that are not in the data will get a "no grounded information" reply.
- The language model is small and can still make mistakes or misread a passage. Treat every answer as a starting point, not as an authority.
- The assistant is not a diagnostic tool and cannot replace a doctor.
- If you or someone else is in an emergency, contact your local emergency services immediately.

## Data

The medical passages come from NIH-sourced question-and-answer content loaded by `rag-data/ingest.py`. Follow the terms of use of the original data source if you redistribute the dataset or the index.
