#!/usr/bin/env python3
"""Cross-check API results and PostgreSQL plans on the dedicated 50/500 fixture."""
import argparse
import importlib.util
import json
import math
import urllib.error
from decimal import Decimal
from pathlib import Path

spec = importlib.util.spec_from_file_location("audit_client", Path(__file__).with_name("backend-audit.py"))
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    base = "http://127.0.0.1:8081/api/v1/sprints-planning"
    container = "sprints-planning-audit-db"
    team = "/backend-audit"
    checks = []

    def req(path):
        return client.request(base, path)[0]

    def sql(query):
        return client.sql(container, query)

    expected = json.loads(sql("""select json_object_agg(workspace,ids) from (
        select workspace,json_agg(id order by id) ids from tasks
        where team_key='backend-audit' group by workspace) t"""))
    for workspace, count in (("ROADMAP", 400), ("BACKLOG", 100)):
        first = req(f"{team}/tasks?workspace={workspace}&size=200&page=0")
        rows = first["content"]
        for page in range(1, math.ceil(first["page"]["totalElements"] / 200)):
            rows += req(f"{team}/tasks?workspace={workspace}&size=200&page={page}")["content"]
        assert first["page"]["totalElements"] == count and len(rows) == count
        assert sorted(row["id"] for row in rows) == expected[workspace]
        assert all(row["workspace"] == workspace for row in rows)
        checks.append(f"{workspace}: exact IDs, count, pagination, workspace")

    expected_load = json.loads(sql("""select json_agg(row_to_json(t)) from (
        select a.participant_id,a.sprint_id,sum(a.days) days
        from task_allocations a join tasks t on t.id=a.task_id
        where a.team_key='backend-audit' and t.workspace='ROADMAP'
        group by a.participant_id,a.sprint_id) t"""))
    expected_cells = {(row["participant_id"], row["sprint_id"]): Decimal(str(row["days"])) for row in expected_load}
    capacity = req(f"{team}/capacity")
    assert len(capacity) == 50
    for row in capacity:
        for cell in row["cells"]:
            assert Decimal(str(cell["workloadDays"])) == expected_cells.get((cell["participantId"], cell["sprintId"]), Decimal(0))
    assert {row["status"] for row in req(f"{team}/tasks?workspace=ROADMAP&size=200")["content"]} == {"done", "canceled", "inprogress"}
    checks.append("Capacity equals SQL for all ROADMAP statuses; BACKLOG allocations excluded")

    quarter = client.identifier("quarter", 1)
    workload = req(f"{team}/participant-workload?quarterId={quarter}&size=50")
    assert workload["page"]["totalElements"] == 50 and len(workload["content"]) == 50
    assert all(task["id"] in expected["ROADMAP"] for row in workload["content"] for task in row["tasks"])
    checks.append("Participant workload: 50 participants, ROADMAP tasks only")

    for path, status in ((f"{team}/participant-workload", 400),
                         (f"/missing-audit-team/tasks/{client.identifier('task', 9)}", 404)):
        try:
            req(path)
            raise AssertionError(f"Unexpected success: {path}")
        except urllib.error.HTTPError as error:
            assert error.code == status, (path, error.code)
    checks.append("Missing quarter returns 400; foreign-team task returns 404")

    plans = {}
    task_id = client.identifier("task", 9)
    for table in ("task_participants", "task_allocations", "task_loads"):
        plan = json.loads(sql(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM {table} WHERE task_id='{task_id}'"))
        assert f"{table}_pkey" in json.dumps(plan), (table, plan)
        plans[table] = plan
    assert sql("select count(*) from pg_indexes where schemaname='public' and indexname in ('idx_task_participants_task','idx_task_allocations_task','idx_task_loads_task')") == "0"
    checks.append("EXPLAIN ANALYZE uses composite PKs after removal of the three standalone indexes")
    result = {"passed": len(checks), "checks": checks, "plans": plans}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    for check in checks:
        print("PASS", check)


if __name__ == "__main__":
    main()
