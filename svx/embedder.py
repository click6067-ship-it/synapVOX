"""데모용 임베더 — 문자 n-gram 해싱 기반 결정론적 어휘 유사도.

blueprint의 '임베딩 모델 D1 고정' 자리 placeholder. 실서비스는 같은 인터페이스
(embed/dim/model_name)로 한국어 임베딩 모델 구현체로 교체하고 embedding_model 컬럼으로 구분.
"""

import hashlib


class HashingEmbedder:
    def __init__(self, dim: int = 256):
        self.dim = dim
        self.model_name = f"hash-ngram-{dim}-v1"

    def embed(self, text: str) -> list[float]:
        counts = [0.0] * self.dim
        t = " ".join(text.split())
        for n in (2, 3):
            for i in range(len(t) - n + 1):
                gram = t[i : i + n]
                h = int.from_bytes(hashlib.md5(gram.encode()).digest()[:4], "big")
                counts[h % self.dim] += 1.0
        norm = sum(x * x for x in counts) ** 0.5
        if norm == 0:
            return counts
        return [x / norm for x in counts]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))
