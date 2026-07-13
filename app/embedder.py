"""데모용 임베더 — 문자 n-gram 해싱 기반 결정론적 어휘 유사도.

plan v1.0의 '임베딩 모델 D1 고정' 자리에 들어가는 placeholder.
실서비스 전환 시 같은 인터페이스(embed/dim/model_name)로 임베딩 API 구현체로 교체하고,
segments.embedding_model 컬럼 값으로 재임베딩 대상을 구분한다.
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
    # embed()가 단위벡터를 반환하므로 내적 = 코사인
    return sum(x * y for x, y in zip(a, b))
