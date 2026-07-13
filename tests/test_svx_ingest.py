def _edges(store, project_id, rel_type):
    return [e for e in store.graph(project_id)["edges"] if e["rel_type"] == rel_type]


def test_ingest_creates_mentions_and_backbone(ingested):
    g = ingested.graph("P-T")
    node_ids = {n["id"] for n in g["nodes"]}
    assert "T1" in node_ids and "C_ENZYME" in node_ids
    backbone = _edges(ingested, "P-T", "SESSION_MENTIONS_CONCEPT")
    # 효소가 T1,T2,T3에 걸쳐 backbone으로 연결
    enzyme_sessions = {e["src"] for e in backbone if e["dst"] == "C_ENZYME"} | \
                      {e["dst"] for e in backbone if e["src"] == "C_ENZYME"}
    assert {"T1", "T2", "T3"} <= enzyme_sessions


def test_continues_same_chapter(ingested):
    cont = _edges(ingested, "P-T", "CONTINUES")
    pairs = {(e["src"], e["dst"]) for e in cont}
    assert ("T1", "T2") in pairs  # 효소·활성화에너지, 같은 chapter '대사'


def test_expands_cross_chapter(ingested):
    exp = _edges(ingested, "P-T", "EXPANDS")
    pairs = {(e["src"], e["dst"]) for e in exp}
    assert ("T2", "T3") in pairs  # 효소, chapter 대사→광합성


def test_stoplist_concept_makes_no_relation(ingested):
    # ATP는 T1에만 있고 stoplist라 관계 후보 아님 → ATP 유래 CONTINUES/EXPANDS 없음
    for rel in ("CONTINUES", "EXPANDS"):
        for e in _edges(ingested, "P-T", rel):
            assert e.get("concept_label") != "ATP"


def test_project_isolation(ingested):
    node_ids = {n["id"] for n in ingested.graph("P-T")["nodes"]}
    assert "TX" not in node_ids
    other = {n["id"] for n in ingested.graph("P-OTHER")["nodes"]}
    assert "TX" in other and "T1" not in other


def test_reingest_is_idempotent(ingestor, mini):
    for key in ["T1", "T2", "T3"]:
        d = mini[key]
        ingestor.ingest(d, project_id="P-T")

    def weight_T1_T2():
        bb = {(e["src"], e["dst"], e["rel_type"]): e["weight"]
              for e in ingestor.store.graph("P-T")["edges"]}
        return bb

    before = weight_T1_T2()
    cont_before = len([e for e in ingestor.store.graph("P-T")["edges"] if e["rel_type"] == "CONTINUES"])
    # 같은 세션 재-ingest
    ingestor.ingest(mini["T2"], project_id="P-T")
    after = weight_T1_T2()
    cont_after = len([e for e in ingestor.store.graph("P-T")["edges"] if e["rel_type"] == "CONTINUES"])
    assert before == after  # weight 누적 없음
    assert cont_before == cont_after  # 관계 중복 없음


def test_ingest_returns_pipeline_stats(ingestor, mini):
    stats = ingestor.ingest(mini["T1"], project_id="P-T")
    assert stats["stats"]["segments"] == 1
    assert stats["stats"]["mentions"] >= 3  # 효소, 활성화에너지, ATP
    steps = [p["step"] for p in stats["pipeline"]]
    assert len(steps) == 5
