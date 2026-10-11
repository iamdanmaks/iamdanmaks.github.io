# Course plan

Working plan for the lecture sequence. Not published: `*.md` is excluded in `_config.yml`.

The course is "NLP + AI" for future data scientists and ML engineers. Priority: what they will use in practice (retrieval, transformers, LLMs and their adaptation). Classic NLP is covered where it still matters: stemming vs lemmatization for BM25 (02), Word2Vec and GloVe (taught by a colleague, not in this repo). Evaluation is a thread through the course, not a single lecture.

## Lectures

| # | File | Topic | Status |
|---|---|---|---|
| 01 | — | not in this repo | — |
| 02 | `02-tfidf-bm25.html` | Text to numbers: TF-IDF, BM25, stemming vs lemmatization | done, narrated |
| 03 | `03-bpe-tokenizers.html` | Subword tokenizers: BPE, WordPiece, byte fallback, language and cost | done, narrated |
| 04 | — | not in this repo; Word2Vec and GloVe were taught by a colleague | — |
| 05 | `05-attention-transformers.html` | Attention, transformer block, encoder/decoder, BERT, XLM-R, Hugging Face | done, narrated |
| 06 | `06-heads-decoders.html` | Heads and generation | done, narrated |
| 07 | `_drafts/07-from-06.html` (part) | From base model to assistant: post-training, reasoning, MoE | draft |
| 08 | `_drafts/07-from-06.html` (part) | Adapting and evaluating LLMs | draft (adaptation part) |
| 09 | — | Semantic search: bi-encoders, contrastive training, retrieval evaluation | planned |
| 10 | — | Hybrid search, reranking and RAG | planned |
| 11 | — | Practical LLM usage + final practical task | planned |
| — | — | Efficient LLMs | optional |
| — | — | Classic NLP tools | optional, at the end if time allows |

Numbers from 07 on are provisional.

## 06 · Heads and generation

Thesis: one body, three head decisions (which vectors, which layer, which loss). Generation is just another head: classification over the vocabulary, with labels = the same text shifted by one token, so no annotation is needed.

- Go fast through encoder heads (05 already introduced them). Keep: the three decisions, head size vs body size, the "one body, different heads" demo (it includes next-token), pooling and its dependence on the mask (last token for decoders), the head-choice table, what to fine-tune.
- Collapse into `details.more` or leave to the code sections: softmax vs sigmoid, BIO and label alignment, the span search demo, bi- vs cross-encoder.
- State the thesis in s0 and the summary. Disambiguate "голова задачі" from attention heads (05 s7).
- Decoder half (LM head, causal LM, generation and KV cache, decoding, GPT → LLM, encoder vs LLM) stays.

## 07 · From base model to assistant

How modern LLMs are built after pretraining.

- Base vs instruct model, SFT, chat template and loss mask.
- Preference tuning: reward model, RLHF, DPO.
- RL with verifiable rewards → reasoning models, test-time compute as a new scaling axis.
- MoE: one section ("how DeepSeek-V3 and Qwen3 are built"): router, top-k experts, total vs active parameters.

## 08 · Adapting and evaluating LLMs

How to make an LLM do your task, and how to know that it does.

- Adaptation: prompting (zero/few-shot), label logits, new head on the last token, LoRA, QLoRA. Draft sections exist in `_drafts/07-from-06.html`.
- Evaluation: public benchmarks and contamination, pass@k for reasoning and code, building your own eval set, LLM-as-judge (concept, biases, calibration against human labels).
- Tie-in: evaluation decides between prompt, head and LoRA. Verifiable rewards in 07 are automatic evals.

## 09 · Semantic search

- Bi-encoders, mean pooling, contrastive loss with in-batch negatives, hard negatives. Bridge from Word2Vec/GloVe: static word vectors → contextual sentence vectors.
- ANN indexes (HNSW, IVF), vector databases.
- Retrieval evaluation: recall@K, MRR, NDCG (referenced in 06 s5), building a test set of queries and relevant documents.
- Bridge to recommender systems: two-tower models are the same architecture.

## 10 · Hybrid search, reranking and RAG

- Return of BM25 (↩ lecture 02): sparse + dense, score fusion (RRF).
- Cross-encoders: precision vs cost, retrieve → rerank funnel.
- LLM reranking, pointwise via yes/no logits (the label-logit trick from 06 s11). Listwise reranking with structured output only mentioned, pointing to 11.
- RAG: search → rerank → passages into the LLM's context.
- Evaluation: reranking gain in NDCG, RAG metrics (context recall, faithfulness, answer correctness), offline vs online.

## 11 · Practical LLM usage

Overview, not deep dives: what is possible, when to use it, what it costs.

- Structured outputs (JSON schema, constrained decoding).
- Tool calling and agents.
- Synthetic data pipelines, LLM labelling and distillation into small encoders.
- LLM-as-judge in pipelines (concept from 08).
- LLM wiki: the LLM maintains a knowledge base of notes instead of retrieving raw chunks.
- Final practical task that combines the course.

## Optional · Efficient LLMs

Memory, not FLOPs, is the bottleneck: KV cache, GQA/MLA, FlashAttention, quantization, speculative decoding, long context.

## Optional, at the end · Classic NLP tools

Only if time allows. spaCy/Stanza pipelines, morphological analysis and lemmatization for Ukrainian (pymorphy3), rule-based matching. Frame it as "when a small tool beats a model": cheap preprocessing, BM25 for an inflected language, fast extraction without a GPU.
