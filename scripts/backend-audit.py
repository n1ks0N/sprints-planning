#!/usr/bin/env python3
"""Repeatable HTTP/SQL benchmark against an isolated, migrated audit database.

Start a dedicated PostgreSQL with pg_stat_statements and the API on port 8081,
apply server/src/test/resources/backend-audit-fixture.sql, then run:
  python3 scripts/backend-audit.py --output /tmp/backend-before.json
Only the dedicated sprints_audit database is queried/reset by this script.
"""
import argparse
import hashlib
import json
import math
import statistics
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


def identifier(kind, number):
    return str(uuid.UUID(hashlib.md5(f"backend-audit-{kind}-{number}".encode()).hexdigest()))


def sql(container, text):
    result = subprocess.run(["docker", "exec", "-i", container, "psql", "-X", "-U", "audit", "-d", "sprints_audit", "-Atq", "-v", "ON_ERROR_STOP=1"], input=text, text=True, capture_output=True, check=True)
    return result.stdout.strip()


def request(base, endpoint, body=None, headers=None, method=None):
    payload = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + endpoint, data=payload, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=120) as response:
        data = response.read()
        content_type = response.headers.get("Content-Type", "")
        elapsed = (time.perf_counter() - started) * 1000
        return (json.loads(data) if data and "json" in content_type else data), elapsed, len(data)


def stats(container):
    return json.loads(sql(container, """
        SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM (
          SELECT query, calls, rows, total_exec_time, shared_blks_hit, shared_blks_read
          FROM pg_stat_statements
          WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
            AND query NOT LIKE '%pg_stat_statements%'
            AND query NOT LIKE '/* audit-control */%'
          ORDER BY total_exec_time DESC
        ) s;
    """))


def run_case(args, name, endpoint, body=None):
    for _ in range(args.warmup):
        request(args.base_url, endpoint, body)
    sql(args.container, "SELECT pg_stat_statements_reset();")
    durations, sizes = [], []
    for _ in range(args.samples):
        _, elapsed, size = request(args.base_url, endpoint, body)
        durations.append(elapsed)
        sizes.append(size)
    queries = stats(args.container)
    data_queries = [q for q in queries if q["query"].lstrip().lower().startswith(("select", "with", "insert", "update", "delete"))]
    return {
        "name": name, "method": "GET" if body is None else "POST", "endpoint": endpoint,
        "samples": args.samples, "p50_ms": round(statistics.median(durations), 2),
        "p95_ms": round(sorted(durations)[math.ceil(len(durations) * .95) - 1], 2),
        "sql_calls_per_request": round(sum(q["calls"] for q in data_queries) / args.samples, 2),
        "sql_rows_per_request": round(sum(q["rows"] for q in data_queries) / args.samples, 2),
        "db_exec_ms_per_request": round(sum(q["total_exec_time"] for q in data_queries) / args.samples, 2),
        "response_bytes": round(statistics.mean(sizes)), "sql": queries,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8081/api/v1/sprints-planning")
    parser.add_argument("--container", default="sprints-planning-audit-db")
    parser.add_argument("--samples", type=int, default=20)
    parser.add_argument("--warmup", type=int, default=5)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--only", default="", help="Substring of benchmark case name")
    args = parser.parse_args()
    if urllib.parse.urlparse(args.base_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Only a local audit API is allowed")
    label = subprocess.check_output(["docker", "inspect", "--format", '{{index .Config.Labels "codex.audit"}}', args.container], text=True).strip()
    if label != "sprints-backend":
        raise SystemExit("Refusing to reset SQL statistics outside the dedicated audit container")
    if args.samples < 1 or args.warmup < 0:
        raise SystemExit("Invalid sample count")
    counts = json.loads(sql(args.container, """/* audit-control */ SELECT json_build_object(
      'participants',(SELECT count(*) FROM participants WHERE team_key='backend-audit'),
      'tasks',(SELECT count(*) FROM tasks WHERE team_key='backend-audit'),
      'max_assignees',(SELECT max(n) FROM (SELECT count(*) n FROM task_participants WHERE team_key='backend-audit' GROUP BY task_id) x),
      'allocations',(SELECT count(*) FROM task_allocations WHERE team_key='backend-audit'),
      'planning_items',(SELECT count(*) FROM planning_backlog_items WHERE team_key='backend-audit'),
      'history',(SELECT count(*) FROM api_call_history WHERE team_key='backend-audit'));
    """))
    assert counts["participants"] == 50 and counts["tasks"] == 500 and counts["max_assignees"] == 10, counts
    team = "/backend-audit"
    quarter = identifier("quarter", 1)
    task = identifier("task", 9)
    cases = [
        ("tasks_first20", f"{team}/tasks?workspace=ROADMAP&page=0&size=20", None),
        ("tasks_page10", f"{team}/tasks?workspace=ROADMAP&page=10&size=20", None),
        ("tasks_200", f"{team}/tasks?workspace=ROADMAP&page=0&size=200", None),
        ("tasks_quarter", f"{team}/tasks?workspace=ROADMAP&quarterId={quarter}&page=0&size=20", None),
        ("tasks_search", f"{team}/tasks?workspace=ROADMAP&search=task%2001&page=0&size=20", None),
        ("tasks_load_sort", f"{team}/tasks?workspace=ROADMAP&sortBy=load&sortDirection=desc&quarterId={quarter}&size=20", None),
        ("tasks_release_sort", f"{team}/tasks?workspace=ROADMAP&sortBy=releaseDate&size=20", None),
        ("backlog_first20", f"{team}/tasks?workspace=BACKLOG&page=0&size=20", None),
        ("task_detail_10_assignees", f"{team}/tasks/{task}", None),
        ("participant_workload_10", f"{team}/participant-workload?quarterId={quarter}&page=0&size=10", None),
        ("participant_workload_50", f"{team}/participant-workload?quarterId={quarter}&page=0&size=50", None),
        ("capacity_quarter", f"{team}/capacity?quarterId={quarter}", None),
        ("capacity_all", f"{team}/capacity", None),
        ("participants", f"{team}/participants", None),
        ("filters", f"{team}/filters", None),
        ("release_options", f"{team}/releases/options?quarterId={quarter}", None),
        ("quarter_options", f"{team}/quarters/options", None),
        ("sprints", f"{team}/sprints", None),
        ("planning_first20", f"{team}/planning-workbench/backlog?page=0&size=20", None),
        ("planning_quarter_load", f"{team}/planning-workbench/backlog?quarterIds={quarter}&sortBy=load&page=0&size=20", None),
        ("planning_release_sort", f"{team}/planning-workbench/backlog?sortBy=releaseDate&page=0&size=20", None),
        ("planning_preview20", f"{team}/planning-workbench/preview", {"plannerType": "ALGORITHM", "itemIds": [identifier("item", i) for i in range(20)]}),
        ("planning_preview100", f"{team}/planning-workbench/preview", {"plannerType": "ALGORITHM", "itemIds": [identifier("item", i) for i in range(100)]}),
        ("history_sessions10", f"{team}/history?page=0&size=10", None),
        ("history_sessions25", f"{team}/history?page=0&size=25", None),
        ("history_task", f"{team}/tasks/{task}/history?page=0&size=30", None),
        ("excel_export", f"{team}/export/excel?workspace=ROADMAP", None),
    ]
    results = []
    for name, endpoint, body in cases:
        if args.only and args.only not in name:
            continue
        try:
            result = run_case(args, name, endpoint, body)
            results.append(result)
            print(f"{name}: p50={result['p50_ms']}ms p95={result['p95_ms']}ms SQL={result['sql_calls_per_request']} rows={result['sql_rows_per_request']}", flush=True)
        except urllib.error.HTTPError as error:
            results.append({"name": name, "error": error.code, "body": error.read().decode()})
            print(f"{name}: HTTP {error.code}", flush=True)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"dataset": counts, "base_url": args.base_url, "warmup": args.warmup, "results": results}, ensure_ascii=False, indent=2))
    if any("error" in result for result in results):
        raise SystemExit("Some API cases failed; inspect the report")


if __name__ == "__main__":
    main()
