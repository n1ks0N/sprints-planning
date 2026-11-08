#!/usr/bin/env python3
"""Measure writes against the 50/500 fixture; restore only owned audit rows between samples."""
import argparse
import importlib.util
import json
import math
import statistics
import time
import urllib.parse
import uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location("audit_client", Path(__file__).with_name("backend-audit.py"))
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8081/api/v1/sprints-planning")
    parser.add_argument("--container", default="sprints-planning-audit-db")
    parser.add_argument("--samples", type=int, default=10)
    parser.add_argument("--warmup", type=int, default=2)
    parser.add_argument("--only", default="", help="Comma-separated case names; empty runs all cases")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    parsed = urllib.parse.urlparse(args.base_url)
    if parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.port not in {8081, 8082}:
        raise SystemExit("Use an isolated audit API on port 8081 or 8082")
    import subprocess
    assert subprocess.check_output(["docker", "inspect", "--format", '{{index .Config.Labels "codex.audit"}}', args.container], text=True).strip() == "sprints-backend"
    api_container = "sprints-planning-audit-api" if parsed.port == 8081 else "sprints-planning-audit-baseline"
    assert subprocess.check_output(["docker", "inspect", "--format", '{{index .Config.Labels "codex.audit"}}', api_container], text=True).strip() == "sprints-backend"
    selected = set(args.only.split(",")) if args.only else set()
    known = {"update_task_metadata", "allocation_one_cell", "legacy_allocation_60_cells", "create_task_10_assignees", "planning_apply20_new", "planning_apply20_linked"}
    if selected - known or args.samples < 1 or args.warmup < 0:
        raise SystemExit("Invalid case name or sample count")
    team = "/backend-audit"
    run_id = "audit-write-" + uuid.uuid4().hex
    headers = {"X-Session-Id": run_id, "X-User-Name": "Backend write benchmark"}

    def sql(text):
        return client.sql(args.container, text)

    def control(text):
        return sql("\n".join("/* audit-control */ " + statement.strip() + ";" for statement in text.split(";") if statement.strip()))

    def api(path, body=None, method=None):
        return client.request(args.base_url, path, body, headers, method)

    task = api(f"{team}/tasks/{client.identifier('task',9)}")[0]
    tid, pid = task["id"], task["participantIds"][0]
    sid = task["planningSprintIds"][0]
    # All destructive restoration statements are restricted to the dedicated fixture.
    assert sql("select count(*) from tasks where team_key='backend-audit'") == "500"
    records = []

    def bench(name, path, make_body, restore, method="POST"):
        if selected and name not in selected:
            return
        times, sizes = [], []
        for i in range(args.warmup + args.samples):
            if i == args.warmup:
                time.sleep(.15)
                sql("SELECT pg_stat_statements_reset();")
            response, duration, size = api(path, make_body(i), method)
            restore(response)
            if i >= args.warmup:
                times.append(duration); sizes.append(size)
        time.sleep(.2)  # Include completed auxiliary API-history writes in the SQL count.
        queries = client.stats(args.container)
        queries = [q for q in queries if q["query"].lstrip().lower().startswith(("select", "with", "insert", "update", "delete"))]
        result = {"name": name, "samples": args.samples, "p50_ms": round(statistics.median(times), 2),
                  "p95_ms": round(sorted(times)[math.ceil(len(times)*.95)-1],2),
                  "sql_calls_per_request": round(sum(q["calls"]for q in queries)/args.samples,2),
                  "sql_rows_per_request": round(sum(q["rows"]for q in queries)/args.samples,2),
                  "db_exec_ms_per_request": round(sum(q["total_exec_time"]for q in queries)/args.samples,2),
                  "response_bytes": round(statistics.mean(sizes)), "sql": queries}
        records.append(result)
        print(f"{name}: p50={result['p50_ms']}ms p95={result['p95_ms']}ms SQL={result['sql_calls_per_request']}",flush=True)
        control(f"delete from api_call_history where session_id='{run_id}'")
        args.output.write_text(json.dumps({"samples": args.samples, "warmup": args.warmup, "results": records},indent=2))

    def restore_cell(_):
        control(f"update task_allocations set days=0.5 where task_id='{tid}' and participant_id='{pid}' and sprint_id='{sid}'; update task_loads set days=5 where task_id='{tid}' and sprint_id='{sid}'")

    def restore_matrix(_):
        control(f"update task_allocations set days=0.5 where task_id='{tid}'; update task_loads set days=5 where task_id='{tid}'")

    def remove_created(response):
        ids = [response["id"]] if isinstance(response,dict) else [row["id"]for row in response]
        literals = ",".join("'"+str(uuid.UUID(value))+"'"for value in ids)
        control(f"delete from tasks where team_key='backend-audit' and id in ({literals})")

    args.output.parent.mkdir(parents=True,exist_ok=True)
    try:
        bench("update_task_metadata",f"{team}/tasks/update",lambda i:{"id":tid,"title":f"Write benchmark {i}"},lambda _:control(f"update tasks set title='Audit task 009' where id='{tid}' and team_key='backend-audit'"))
        bench("allocation_one_cell",f"{team}/tasks/{tid}/allocations",lambda i:{"changes":[{"participantId":pid,"sprintId":sid,"days":1}]},restore_cell,"PUT")
        bench("legacy_allocation_60_cells",f"{team}/taskalloc/bulk/multi",lambda i:{"taskId":tid,"allocations":{p:{s:1 for s in row}for p,row in task['allocations'].items()}},restore_matrix)
        create_body={key:task[key]for key in ["title","description","dod","priority","customers","streams","participantIds","planningQuarterIds","planningSprintIds","allocations","initialQuarterId","leaderId","releaseDateId"]}
        create_body.update(title="Audit created task",status="inprogress",workspace="ROADMAP")
        bench("create_task_10_assignees",f"{team}/tasks",lambda i:create_body,remove_created)

        if not selected or "planning_apply20_new" in selected:
            items=api(f"{team}/planning-workbench/backlog?size=20")[0]["content"]
            item_ids=[item['id']for item in items]
            literals=",".join("'"+value+"'"for value in item_ids)
            control(f"create table audit_write_item_backup as select * from planning_backlog_items where team_key='backend-audit' and id in ({literals})")
            matrix={item['id']:{d['participantId']:{item['planningSprintIds'][0]:.5} for d in item['planningDemands']}for item in items}
            def restore_apply(response):
                remove_created(response)
                control("insert into planning_backlog_items select * from audit_write_item_backup on conflict do nothing")
            bench("planning_apply20_new",f"{team}/planning-workbench/apply",lambda i:{"itemIds":item_ids,"allocations":matrix},restore_apply)
            control("drop table audit_write_item_backup")

        if not selected or "planning_apply20_linked" in selected:
            source_ids=[client.identifier('task',i)for i in range(400,420)]
            linked=[api(f"{team}/planning-workbench/from-task/{source_id}",{})[0]for source_id in source_ids]
            linked_ids=[item['id']for item in linked]
            source_literals=",".join("'"+value+"'"for value in source_ids)
            linked_literals=",".join("'"+value+"'"for value in linked_ids)
            control(f"create table audit_write_linked_backup as select * from planning_backlog_items where id in ({linked_literals}); create table audit_write_alloc_backup as select * from task_allocations where task_id in ({source_literals}); create table audit_write_load_backup as select * from task_loads where task_id in ({source_literals}); create table audit_write_source_backup as select id,display_order,revision from tasks where id in ({source_literals})")
            linked_matrix={item['id']:{d['participantId']:{item['planningSprintIds'][0]:.5}for d in item['planningDemands']}for item in linked}
            def restore_linked(_):
                control(f"delete from task_allocations where task_id in ({source_literals}); delete from task_loads where task_id in ({source_literals}); insert into task_allocations select * from audit_write_alloc_backup; insert into task_loads select * from audit_write_load_backup; update tasks t set workspace='BACKLOG',status='backlog',display_order=b.display_order,revision=b.revision from audit_write_source_backup b where t.id=b.id and t.team_key='backend-audit'; insert into planning_backlog_items select * from audit_write_linked_backup on conflict do nothing")
            bench("planning_apply20_linked",f"{team}/planning-workbench/apply",lambda i:{"itemIds":linked_ids,"allocations":linked_matrix},restore_linked)
            control(f"delete from planning_backlog_items where id in ({linked_literals}); drop table audit_write_linked_backup; drop table audit_write_alloc_backup; drop table audit_write_load_backup; drop table audit_write_source_backup")
    finally:
        time.sleep(.2)
        control(f"delete from api_call_history where session_id='{run_id}'")
    assert sql("select count(*) from tasks where team_key='backend-audit'") == "500"
    assert sql("select count(*) from planning_backlog_items where team_key='backend-audit'") == "500"
    assert sql("select count(*) from task_allocations where team_key='backend-audit'") == "16500"


if __name__=="__main__":
    main()
