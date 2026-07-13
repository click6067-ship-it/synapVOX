"""캠벨 코퍼스를 seq 순으로 ingest해 그래프 DB를 만든다.

.venv/bin/python scripts/seed_graph.py
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from svx.store import Store
from svx.ingest import Ingestor
from svx.seeds import SeedDict
from svx.embedder import HashingEmbedder

ROOT = pathlib.Path(__file__).parent.parent
DB = ROOT / "synapvox_graph.db"


def load_corpus():
    data = json.loads((ROOT / "corpus" / "campbell_sessions.json").read_text())
    return data["project_id"], {s["external_id"]: {**s, "project_id": data["project_id"]}
                                for s in data["sessions"]}


def build(db_path=None, reset=True):
    project_id, corpus = load_corpus()
    seeds = SeedDict.from_file(str(ROOT / "corpus" / "seed_concepts.json"))
    store = Store(str(db_path or DB))
    if reset:
        store.reset_project(project_id)
    ing = Ingestor(store, seeds, HashingEmbedder(dim=256))
    for key in sorted(corpus, key=lambda k: corpus[k]["seq"]):
        st = ing.ingest(corpus[key], project_id=project_id)["stats"]
        print(f"  {key} seq{corpus[key]['seq']:>1} — 세그{st['segments']} 근거{st['mentions']} "
              f"개념+{st['concepts_new']} 관계+{st['relations_new']}")
    return store, project_id


if __name__ == "__main__":
    store, pid = build()
    g = store.graph(pid)
    rel = [e for e in g["edges"] if e["rel_type"] in ("CONTINUES", "EXPANDS")]
    print(f"\n노드 {len(g['nodes'])} · 엣지 {len(g['edges'])} → {DB}")
    print("세션간 의미관계:")
    for e in sorted(rel, key=lambda x: x["src"]):
        print(f"  {e['src']} →{e['rel_type']}→ {e['dst']}  ({e['concept_label']})")
