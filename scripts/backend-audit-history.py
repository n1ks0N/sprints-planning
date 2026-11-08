#!/usr/bin/env python3
"""Verify task history through the HTTP API, using disposable teams on the audit API."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import subprocess
import time
import threading
import urllib.error
import urllib.parse
import uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location("audit_client", Path(__file__).with_name("backend-audit.py"))
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8081/api/v1/sprints-planning")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    location = urllib.parse.urlparse(args.base_url)
    if location.hostname not in {"localhost", "127.0.0.1", "::1"} or location.port != 8081:
        raise SystemExit("Use the isolated audit API on local port 8081")
    config = json.loads(subprocess.check_output(["docker", "inspect", "sprints-planning-audit-api"], text=True))[0]["Config"]
    if config.get("Labels", {}).get("codex.audit") != "sprints-backend" or "APP_JIRA_MOCK_ENABLED=true" not in config.get("Env", []):
        raise SystemExit("History checks require the dedicated API container with Jira mock enabled")
    team = "history-audit-" + uuid.uuid4().hex[:12]
    user = "Backend Audit Иван"
    session = ""
    reports = []

    def req(path, body=None, method=None):
        return client.request(args.base_url, path, body, {"X-Session-Id": session, "X-User-Name": urllib.parse.quote(user)}, method)[0]

    def post(path, body):
        return req(path, body, "POST")

    def check(name, operation, task_id=None, expected_fields=(), expected_values=None, no_event=False):
        nonlocal session
        session = "history-check-" + uuid.uuid4().hex
        result = operation()
        target = task_id or result["id"]
        events = [event for event in req(f"/{team}/tasks/{target}/history?size=200")["content"] if event["sessionId"] == session]
        try:
            if no_event:
                assert not events, events
            else:
                assert len(events) == 1, events
                assert events[0]["userName"] == user, events[0]
                changes = {change["field"]: change for event in events for change in event["changes"]}
                assert set(expected_fields) <= changes.keys(), {"expected": expected_fields, "actual": changes}
                for field, (before, after) in (expected_values or {}).items():
                    assert changes[field]["before"] == before and changes[field]["after"] == after, changes[field]
            reports.append({"name": name, "passed": True, "events": events})
        except AssertionError as error:
            reports.append({"name": name, "passed": False, "error": str(error), "events": events})
        print(name, "PASS" if reports[-1]["passed"] else "FAIL", flush=True)
        return result

    post("/teams", {"key": team, "name": team})
    try:
        people = [post(f"/{team}/participants", {"fullName": f"History person {i}", "role": "BE", "rate": 1, "jiraLogin": f"audit.person{i}"})["id"] for i in range(4)]
        quarters = [post(f"/{team}/quarters", {"year": 2027, "number": i + 1, "name": f"History Q{i + 1}", "startDate": f"2027-0{1+i*3}-01", "endDate": f"2027-0{3+i*3}-28"})["id"] for i in range(2)]
        sprints = [post(f"/{team}/sprints", {"quarterId": quarters[i], "name": f"History sprint {i}", "startDate": f"2027-0{1+i*3}-01", "endDate": f"2027-0{1+i*3}-14", "workingDays": 10, "order": i})["id"] for i in range(2)]
        releases = [post(f"/{team}/releases", {"promDate": f"2027-0{1+i*3}-10"})["id"] for i in range(2)]
        initial = {"title": "History task", "description": "Initial", "dod": "Ready", "priority": 1, "status": "inprogress", "workspace": "ROADMAP", "initialQuarterId": quarters[0], "participantIds": people[:2], "allocations": {people[0]: {sprints[0]: 1}, people[1]: {sprints[0]: .5}}, "customers": ["A"], "streams": ["Core"]}
        task = check("create_with_allocations", lambda: post(f"/{team}/tasks", initial), expected_fields=("title", "participantIds", "workspace", "allocations", "loads"))
        tid = task["id"]
        patch = {"id": tid, "title": "Edited", "description": "First\nSecond", "dod": "Checked", "priority": 3, "status": "done", "customers": ["B"], "streams": ["Platform"], "notes": {people[0]: "Note"}, "leaderId": people[0], "releaseDateId": releases[0], "initialQuarterId": quarters[1], "planningQuarterIds": quarters, "planningSprintIds": sprints, "order": 0}
        check("update_metadata", lambda: post(f"/{team}/tasks/update", patch), tid, ("title", "description", "dod", "priority", "status", "customers", "streams", "notes", "leaderId", "releaseDateId", "initialQuarterId", "planningQuarterIds", "planningSprintIds"), {"title": ("History task", "Edited"), "status": ("inprogress", "done")})
        check("update_allocations_via_task", lambda: post(f"/{team}/tasks/update", {"id": tid, "allocations": {people[0]: {sprints[0]: 2}}}), tid, ("allocations", "loads"))
        check("clear_metadata", lambda: post(f"/{team}/tasks/update", {"id": tid, "releaseDateId": "", "leaderId": "", "initialQuarterId": "", "notes": {}, "customers": [], "streams": []}), tid, ("releaseDateId", "leaderId", "initialQuarterId", "notes", "customers", "streams"), {"releaseDateId": (releases[0], None), "leaderId": (people[0], None)})
        check("move_to_backlog", lambda: post(f"/{team}/tasks/update", {"id": tid, "status": "backlog"}), tid, ("status", "workspace"), {"workspace": ("ROADMAP", "BACKLOG")})
        check("return_to_roadmap", lambda: post(f"/{team}/tasks/update", {"id": tid, "status": "inprogress"}), tid, ("status", "workspace"))
        check("no_op_metadata", lambda: post(f"/{team}/tasks/update", {"id": tid, "title": "Edited"}), tid, no_event=True)
        cells = {"changes": [{"participantId": people[0], "sprintId": sprints[0], "days": 3}, {"participantId": people[0], "sprintId": sprints[1], "days": .5}]}
        check("allocation_cells", lambda: req(f"/{team}/tasks/{tid}/allocations", cells, "PUT"), tid, ("allocationDays",))
        check("no_op_allocation_cells", lambda: req(f"/{team}/tasks/{tid}/allocations", cells, "PUT"), tid, no_event=True)
        check("legacy_single_allocation", lambda: post(f"/{team}/taskalloc", {"taskId": tid, "participantId": people[0], "sprintId": sprints[0], "days": 3.5}), tid, ("allocationDays",), {"allocationDays": (3, 3.5)})
        check("legacy_row_allocation", lambda: post(f"/{team}/taskalloc/bulk", {"taskId": tid, "participantId": people[0], "allocations": {sprints[0]: 4, sprints[1]: 1}}), tid, ("allocationDays",))
        check("legacy_multi_allocation", lambda: post(f"/{team}/taskalloc/bulk/multi", {"taskId": tid, "allocations": {people[0]: {sprints[0]: 2}, people[1]: {sprints[0]: 2.5}}}), tid, ("allocationDays",))
        check("add_zero_load_participant", lambda: post(f"/{team}/tasks/{tid}/participants", {"participantId": people[2]}), tid, ("participantIds",))
        check("replace_participant", lambda: req(f"/{team}/tasks/{tid}/participants/{people[2]}", {"participantId": people[3]}, "PUT"), tid, ("participantIds",))
        check("remove_participant", lambda: req(f"/{team}/tasks/{tid}/participants/{people[1]}", method="DELETE"), tid, ("participantIds",))
        jira_links = {"storyUrl": "https://example.invalid/browse/AUDIT-1", "participantLinks": [{"participantId": people[0], "planningSprintId": sprints[0], "jiraIssueUrl": "https://example.invalid/browse/AUDIT-2"}]}
        check("manual_jira_links", lambda: post(f"/{team}/tasks/{tid}/jira-links", jira_links), tid, ("jiraStoryIssue", "jiraIssues"))
        check("no_op_manual_jira_links", lambda: post(f"/{team}/tasks/{tid}/jira-links", jira_links), tid, no_event=True)
        unassigned = post(f"/{team}/tasks", {"title": "Unassigned", "priority": 1, "status": "inprogress"})["id"]
        check("unassigned_load", lambda: post(f"/{team}/taskload", {"taskId": unassigned, "sprintId": sprints[0], "days": 3}), unassigned, ("loadDays",), {"loadDays": (0, 3)})
        check("clear_unassigned_load", lambda: post(f"/{team}/taskload", {"taskId": unassigned, "sprintId": sprints[0], "days": 0}), unassigned, ("loadDays",), {"loadDays": (3, 0)})
        check("no_op_unassigned_load", lambda: post(f"/{team}/taskload", {"taskId": unassigned, "sprintId": sprints[0], "days": 0}), unassigned, no_event=True)
        def rejected_update():
            before = req(f"/{team}/tasks/{tid}")
            try:
                post(f"/{team}/tasks/update", {"id": tid, "title": "Must roll back", "priority": 0})
                raise AssertionError("Invalid update unexpectedly succeeded")
            except urllib.error.HTTPError as error:
                assert error.code in {400, 409}, error.code
            after = req(f"/{team}/tasks/{tid}")
            assert after["title"] == before["title"], after
            return after
        check("failed_update_rolls_back_without_event", rejected_update, tid, no_event=True)
        source = post(f"/{team}/tasks", {**initial, "title": "Linked source", "status": "backlog", "workspace": "BACKLOG"})
        before_transfer = req(f"/{team}/tasks/{source['id']}/history")["content"]
        linked = post(f"/{team}/planning-workbench/from-task/{source['id']}", {})
        assert len(req(f"/{team}/tasks/{source['id']}/history")["content"]) == len(before_transfer)
        check("apply_linked_planning", lambda: post(f"/{team}/planning-workbench/apply", {"itemIds": [linked["id"]], "allocations": {linked["id"]: {people[0]: {sprints[0]: 2}}}}), source["id"], ("status", "workspace", "allocations", "loads"))
        item = post(f"/{team}/planning-workbench/items", {"title": "Independent planning", "priority": 1, "initialQuarterId": quarters[0], "planningSprintIds": [sprints[0]], "planningDemands": [{"kind": "PARTICIPANT", "participantId": people[0], "days": 1}]})
        applied = check("apply_independent_planning", lambda: post(f"/{team}/planning-workbench/apply", {"itemIds": [item["id"]], "allocations": {item["id"]: {people[0]: {sprints[0]: 1}}}})[0], expected_fields=("title", "participantIds", "allocations", "loads"))
        # A real order change, after other tasks exist.
        check("reorder_task", lambda: post(f"/{team}/tasks/update", {"id": tid, "order": 0 if req(f"/{team}/tasks/{tid}")["order"] != 0 else 2}), tid, ("order",))
        check("delete_task_retains_history", lambda: post(f"/{team}/tasks/delete", {"id": tid}), tid, ("title", "allocations", "loads"), {"title": ("Edited", None)})
        assert req(f"/{team}/tasks/{tid}/history")["content"], "History disappeared with task deletion"
        # The isolated API must have APP_JIRA_MOCK_ENABLED=true; no external Jira writes.
        jira_task = post(f"/{team}/tasks", {**initial, "title": "Mock Jira export", "leaderId": people[3]})["id"]
        session = "history-jira-" + uuid.uuid4().hex
        batch = post(f"/{team}/jira/issues", {"taskIds": [jira_task], "createStoryByTaskId": {jira_task: True}, "planningSprintId": sprints[0], "jiraSprintId": "1", "projectKey": "AUDIT"})
        deadline = time.monotonic() + 20
        while True:
            status = req(f"/{team}/jira/issues/batches/{batch['batchId']}")
            if status["processedItems"] == status["totalItems"] or time.monotonic() > deadline:
                break
            time.sleep(.1)
        events = [event for event in req(f"/{team}/tasks/{jira_task}/history?size=200")["content"] if event["sessionId"] == session]
        story = next((item for item in status["items"] if item["issueScope"] == "STORY"), {})
        assignee = story.get("jiraRequest", {}).get("body", {}).get("fields", {}).get("assignee", {}).get("name")
        passed = status["createdItems"] == 3 and assignee == "audit.person3" and len(events) == 3 and all(event["userName"] == user and event["eventType"] == "task.jira.export" for event in events)
        reports.append({"name": "mock_jira_export_history", "passed": passed, "events": events, "batch": status})
        print("mock_jira_export_history", "PASS" if passed else "FAIL", flush=True)
        for race in ("apply_twice", "apply_and_delete"):
            source = post(f"/{team}/tasks", {**initial, "title": race, "workspace": "BACKLOG", "status": "backlog"})
            draft = post(f"/{team}/planning-workbench/from-task/{source['id']}", {})
            session = "history-race-" + uuid.uuid4().hex
            barrier = threading.Barrier(2)
            apply = {"itemIds": [draft["id"]], "allocations": {draft["id"]: {people[0]: {sprints[0]: 2}}}}
            def competing_request(delete):
                barrier.wait(timeout=5)
                endpoint = f"/{team}/tasks/delete" if delete else f"/{team}/planning-workbench/apply"
                try:
                    client.request(args.base_url, endpoint, {"id": source["id"]} if delete else apply,
                                   {"X-Session-Id": session, "X-User-Name": urllib.parse.quote(user)})
                    return 200
                except urllib.error.HTTPError as error:
                    return error.code
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(competing_request, False), pool.submit(competing_request, race == "apply_and_delete")]
                statuses = [future.result(timeout=30) for future in futures]
            events = [event for event in req(f"/{team}/tasks/{source['id']}/history?size=200")["content"] if event["sessionId"] == session]
            if race == "apply_twice":
                passed = sorted(statuses) in ([200, 400], [200, 409]) and len(events) == 1
            else:
                passed = statuses[0] in {200, 400, 404, 409} and statuses[1] == 200 and sum(event["eventType"] == "task.delete" for event in events) == 1
            reports.append({"name": race, "passed": passed, "statuses": statuses, "events": events})
            print(race, "PASS" if passed else "FAIL", statuses, flush=True)
    finally:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"cases": reports, "passed": sum(r["passed"] for r in reports), "failed": sum(not r["passed"] for r in reports)}, ensure_ascii=False, indent=2))
        req(f"/teams/{team}?deleteData=true", method="DELETE")
    if any(not r["passed"] for r in reports):
        raise SystemExit("Task history checks failed")


if __name__ == "__main__":
    main()
