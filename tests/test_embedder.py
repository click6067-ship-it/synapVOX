from app.embedder import HashingEmbedder, cosine


def test_embed_returns_fixed_dim_unit_vector():
    e = HashingEmbedder(dim=256)
    v = e.embed("결제 수수료 논의")
    assert len(v) == 256
    norm = sum(x * x for x in v) ** 0.5
    assert abs(norm - 1.0) < 1e-6
    assert e.model_name == "hash-ngram-256-v1"
    assert e.dim == 256


def test_embed_is_deterministic():
    e = HashingEmbedder(dim=256)
    assert e.embed("정산 배치") == e.embed("정산 배치")


def test_lexically_similar_texts_score_higher():
    e = HashingEmbedder(dim=256)
    q = e.embed("결제 수수료 인하 논의")
    near = e.embed("수수료 인하를 결정했다")
    far = e.embed("챗봇 프로토타입 시연 결과")
    assert cosine(q, near) > cosine(q, far)
