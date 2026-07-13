"""실제 LLM 레이어 (OpenAI) — 임베딩·개념추출·관계판정·RAG 답변.

blueprint §4 원칙: 무거운 호출(임베딩·추출·판정)은 ingest 시 1회 → DB 캐시(멱등).
쿼리 시 유일한 LLM 호출은 /ask의 최종 답변 1회. 키가 없으면 이 레이어는 비활성(규칙/해싱 폴백).
"""

import hashlib
import json

from openai import OpenAI

CHAT_MODEL = "gpt-5.6-sol"          # 최신 세대 flagship
EMBED_MODEL = "text-embedding-3-large"   # 3072차원, 최상위 임베딩
PROMPT_VERSION = "v1"


class LLM:
    def __init__(self, api_key, store, chat_model=CHAT_MODEL, embed_model=EMBED_MODEL):
        self.client = OpenAI(api_key=api_key)
        self.store = store
        self.chat_model = chat_model
        self.embed_model = embed_model
        self.embed_dim = 3072 if "large" in embed_model else 1536

    def _key(self, kind, *parts):
        raw = "|".join([kind, self.chat_model, self.embed_model, PROMPT_VERSION] + [str(p) for p in parts])
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _chat_json(self, system, user, max_tokens=1200):
        r = self.client.chat.completions.create(
            model=self.chat_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"}, max_completion_tokens=max_tokens)
        return json.loads(r.choices[0].message.content)

    # ── 임베딩 (캐시) ──
    def embed(self, text: str) -> list[float]:
        key = self._key("embed", text)
        c = self.store.cache_get(key)
        if c is not None:
            return c
        v = self.client.embeddings.create(model=self.embed_model, input=text).data[0].embedding
        self.store.cache_put(key, "embed", v)
        return v

    # ── 같은-맥락 판정 (캐시) : blueprint의 CONTINUES/EXPANDS LLM 판정 ──
    def judge_relation(self, concept_label, prior_title, prior_text, new_title, new_text) -> dict:
        key = self._key("rel", concept_label, prior_text, new_text)
        c = self.store.cache_get(key)
        if c is not None:
            return c
        sys = ("너는 강의/회의 지식 그래프에서 개념이 세션을 가로질러 어떻게 이어지는지 판정한다. "
               "반드시 JSON만 출력한다.")
        usr = (f'개념: "{concept_label}"\n'
               f'[이전 세션] {prior_title}: "{prior_text[:800]}"\n'
               f'[새 세션] {new_title}: "{new_text[:800]}"\n\n'
               '두 세션이 이 개념을 다루는 맥락 관계를 판정하라:\n'
               '- CONTINUES: 같은 맥락을 이어감(다음 단계/직접 후속)\n'
               '- EXPANDS: 개념을 새로운 맥락/응용으로 확장\n'
               '- UNRELATED: 우연히 같은 단어일 뿐 실제로는 무관 → 잇지 않음\n'
               '{"rel":"CONTINUES|EXPANDS|UNRELATED","reason":"한 문장 근거"}')
        out = self._chat_json(sys, usr, max_tokens=2500)
        rel = out.get("rel", "UNRELATED")
        if rel not in ("CONTINUES", "EXPANDS", "UNRELATED"):
            rel = "UNRELATED"
        res = {"rel": rel, "reason": out.get("reason", "")}
        self.store.cache_put(key, "rel", res)
        return res

    # ── 개념 추출 (하이브리드 LLM 보완, 캐시) : seed로 못 잡은 개념 ──
    def extract_concepts(self, text, existing_labels) -> list[str]:
        key = self._key("extract", text, ",".join(sorted(existing_labels)))
        c = self.store.cache_get(key)
        if c is not None:
            return c
        sys = "너는 강의 텍스트에서 핵심 개념(용어)만 뽑는다. JSON만 출력."
        usr = (f'텍스트: "{text[:1500]}"\n\n'
               f'이미 등록된 개념: {sorted(existing_labels)[:60]}\n'
               '이 텍스트의 핵심 개념(명사형 용어)을 최대 6개 뽑아라. '
               '이미 등록된 것과 같은 개념이면 그 표기를 그대로 재사용(신조어 금지). '
               '너무 일반적인 단어(예: 과정, 세포, 에너지 단독)는 제외. '
               '{"concepts":["개념1","개념2",...]}')
        out = self._chat_json(sys, usr, max_tokens=1500)
        cs = [c.strip() for c in out.get("concepts", []) if isinstance(c, str) and c.strip()][:6]
        self.store.cache_put(key, "extract", cs)
        return cs

    # ── RAG 답변 (쿼리 시 유일한 LLM 호출, 캐시 안 함) ──
    def answer(self, question, context) -> str:
        sys = ("너는 강의 지식 그래프 기반 어시스턴트다. 주어진 근거(여러 세션에 걸친 발췌 + 세션 간 개념 연결)"
               "만 사용해 한국어로 답하라. 근거에 없으면 모른다고 하라. 답에 출처를 [세션 제목]으로 표시하라.")
        usr = f"질문: {question}\n\n=== 근거 ===\n{context}\n\n위 근거로만 답하라."
        r = self.client.chat.completions.create(
            model=self.chat_model,
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": usr}],
            max_completion_tokens=3000)
        return r.choices[0].message.content


class OpenAIEmbedder:
    """Ingestor용 임베더 어댑터 — HashingEmbedder와 동일 인터페이스(embed/dim/model_name)."""
    def __init__(self, llm: LLM):
        self._llm = llm
        self.dim = llm.embed_dim
        self.model_name = llm.embed_model

    def embed(self, text: str) -> list[float]:
        return self._llm.embed(text)
