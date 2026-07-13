"""하이브리드 개념 추출의 seed 층 — 캠벨 목차 기반 사전 매칭(비-LLM).

blueprint §7-4: seed exact/alias 매칭 우선. LLM 보완층은 D5+ 옵션이라 MVP는 이 층으로 그래프가 뜬다.
"""

import json


class SeedDict:
    def __init__(self, concepts: list[dict], seed_version: str = "seed-v1"):
        self.seed_version = seed_version
        self._by_id = {}
        # (alias_lower, concept_id) — 긴 alias 우선 매칭 위해 길이 desc 정렬
        self._aliases: list[tuple[str, str]] = []
        for c in concepts:
            self._by_id[c["concept_id"]] = {
                "concept_id": c["concept_id"],
                "label": c["label"],
                "aliases": c["aliases"],
                "relation_stoplist": bool(c.get("relation_stoplist", False)),
            }
            for a in c["aliases"]:
                self._aliases.append((a.lower(), c["concept_id"]))
        self._aliases.sort(key=lambda t: len(t[0]), reverse=True)

    @classmethod
    def from_file(cls, path: str) -> "SeedDict":
        data = json.loads(open(path, encoding="utf-8").read())
        return cls(data["concepts"], data.get("seed_version", "seed-v1"))

    def merged(self, extra: list[dict]) -> "SeedDict":
        """기존 사전 + 사용자 제공 개념(keyword)을 합친 새 매처. concept_id 안정 = 세션 간 공유."""
        base = [
            {"concept_id": c["concept_id"], "label": c["label"], "aliases": c["aliases"],
             "relation_stoplist": c["relation_stoplist"]}
            for c in self._by_id.values()
        ]
        seen = {c["concept_id"] for c in base}
        for e in extra:
            if e["concept_id"] not in seen:
                base.append(e)
                seen.add(e["concept_id"])
        return SeedDict(base, self.seed_version)

    def concept(self, concept_id: str) -> dict:
        return self._by_id[concept_id]

    def is_relation_stoplist(self, concept_id: str) -> bool:
        return self._by_id[concept_id]["relation_stoplist"]

    def all_concepts(self) -> list[dict]:
        return list(self._by_id.values())

    def match(self, text: str) -> list[dict]:
        """비겹침 최장 매칭. 각 매칭 = {concept_id,label,matched_text,char_start,char_end}."""
        low = text.lower()
        occupied = [False] * len(text)
        hits = []
        for alias_low, cid in self._aliases:
            start = 0
            while True:
                idx = low.find(alias_low, start)
                if idx < 0:
                    break
                end = idx + len(alias_low)
                if not any(occupied[idx:end]):
                    for i in range(idx, end):
                        occupied[i] = True
                    hits.append({
                        "concept_id": cid,
                        "label": self._by_id[cid]["label"],
                        "matched_text": text[idx:end],
                        "char_start": idx,
                        "char_end": end,
                    })
                start = idx + 1
        hits.sort(key=lambda h: h["char_start"])
        return hits
