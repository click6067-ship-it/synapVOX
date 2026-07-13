def test_matches_alias_with_span(seeds):
    hits = seeds.match("효소는 활성화에너지를 낮춘다")
    by_concept = {h["concept_id"]: h for h in hits}
    assert "C_ENZYME" in by_concept and "C_ACT_E" in by_concept
    h = by_concept["C_ENZYME"]
    assert "효소" == "효소는 활성화에너지를 낮춘다"[h["char_start"]:h["char_end"]]
    assert h["matched_text"] == "효소"


def test_longest_match_wins_no_substring_double_count(seeds):
    # "ATP 합성효소"는 C_ATPSYNTHASE 한 개로 잡혀야 하고 ATP/효소로 쪼개지면 안 됨
    hits = seeds.match("ATP 합성효소가 화학삼투로 ATP를 만든다")
    ids = [h["concept_id"] for h in hits]
    assert "C_ATPSYNTHASE" in ids
    # 문장 끝 "ATP를"의 ATP는 별도 1건으로 잡힘(합성효소 뒤). 총 ATP 관련은 합성효소1 + ATP1
    atp_syn = [h for h in hits if h["concept_id"] == "C_ATPSYNTHASE"]
    assert len(atp_syn) == 1
    # 합성효소 구간과 겹치는 위치에서 C_ATP/C_ENZYME 매칭이 나오면 안 됨
    for h in hits:
        if h["concept_id"] in ("C_ATP", "C_ENZYME"):
            assert not (atp_syn[0]["char_start"] <= h["char_start"] < atp_syn[0]["char_end"])


def test_english_alias(seeds):
    hits = seeds.match("glycolysis produces pyruvate")
    ids = {h["concept_id"] for h in hits}
    assert "C_GLYCOLYSIS" in ids and "C_PYRUVATE" in ids


def test_stoplist_flag(seeds):
    assert seeds.is_relation_stoplist("C_ATP") is True
    assert seeds.is_relation_stoplist("C_RESP") is False
