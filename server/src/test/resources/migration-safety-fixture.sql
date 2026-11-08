-- Test data for upgrading an existing schema at migration 21. Never application data.
DO $$ BEGIN
    IF current_schema() !~ '^migration_merge_[0-9a-f]{32}$' THEN
        RAISE EXCEPTION 'Migration fixture requires an isolated migration_merge schema';
    END IF;
END $$;
BEGIN;
INSERT INTO teams(key,name) VALUES ('migration-audit','Migration audit'),('migration-other','Other team');
INSERT INTO quarters(id,year,number,name,start_date,end_date,team_key)
VALUES (md5('mig-quarter')::uuid,2032,1,'Q1',date '2032-01-01',date '2032-03-31','migration-audit');
INSERT INTO sprints(id,quarter_id,name,start_date,end_date,working_days,"order",team_key)
VALUES (md5('mig-sprint')::uuid,md5('mig-quarter')::uuid,'Sprint',date '2032-01-01',date '2032-01-14',10,0,'migration-audit');
INSERT INTO participants(id,full_name,role,rate,display_order,team_key,active,jira_login)
VALUES (md5('mig-person-1')::uuid,'Active person','BE',1,0,'migration-audit',true,'audit.active'),
       (md5('mig-person-2')::uuid,'Inactive, zero allocation','QA',0.5,1,'migration-audit',false,'audit.inactive');
INSERT INTO participant_user_streams(participant_id,user_stream)
VALUES (md5('mig-person-1')::uuid,'Core'),(md5('mig-person-2')::uuid,'Support');
INSERT INTO releases(id,name,prom_date,dev_start,created_at,updated_at,team_key)
VALUES (md5('mig-release-1')::uuid,'Release A',date '2032-01-10',date '2031-12-01',date '2031-11-01',date '2031-11-02','migration-audit'),
       (md5('mig-release-2')::uuid,'Release B',date '2032-02-10',date '2032-01-01',date '2031-11-03',date '2031-11-04','migration-audit');
CREATE TEMP TABLE migration_fixture_tasks AS
SELECT n,md5('mig-task-'||n)::uuid id,status FROM unnest(ARRAY['inprogress','done','canceled','backlog','notdone','partial']) WITH ORDINALITY t(status,n);
INSERT INTO tasks(id,title,description,dod,priority,customer,stream,notes,created_at,updated_at,display_order,status,team_key,leader_participant_id,initial_quarter_id,release_date_id,planning_quarter_ids,planning_sprint_ids)
SELECT id,'Задача '||n,E'First line\nSecond line',E'DOD\nVerified',2,'Customer','Core',
       jsonb_build_object(md5('mig-person-1')::uuid,E'Note\nSecond line',md5('mig-person-2')::uuid,'Retain inactive'),
       date '2031-10-01',date '2031-11-01',n,status,'migration-audit',md5('mig-person-1')::uuid,md5('mig-quarter')::uuid,
       md5('mig-release-'||(1+n%2))::uuid,jsonb_build_array(md5('mig-quarter')::uuid),jsonb_build_array(md5('mig-sprint')::uuid)
FROM migration_fixture_tasks;
INSERT INTO task_participants(task_id,participant_id,display_order,team_key)
SELECT id,md5('mig-person-1')::uuid,0,'migration-audit' FROM migration_fixture_tasks
UNION ALL SELECT id,md5('mig-person-2')::uuid,1,'migration-audit' FROM migration_fixture_tasks;
INSERT INTO task_allocations(task_id,participant_id,sprint_id,days,team_key)
SELECT id,md5('mig-person-1')::uuid,md5('mig-sprint')::uuid,2.5,'migration-audit' FROM migration_fixture_tasks;
INSERT INTO task_loads(task_id,sprint_id,days,team_key)
SELECT id,md5('mig-sprint')::uuid,2.5,'migration-audit' FROM migration_fixture_tasks;
INSERT INTO task_customers(id,name,team_key) VALUES (md5('mig-customer')::uuid,'Customer','migration-audit');
INSERT INTO task_streams(id,name,team_key) VALUES (md5('mig-stream')::uuid,'Core','migration-audit');
INSERT INTO task_customer_values(task_id,customer_id) SELECT id,md5('mig-customer')::uuid FROM migration_fixture_tasks;
INSERT INTO task_stream_values(task_id,stream_id) SELECT id,md5('mig-stream')::uuid FROM migration_fixture_tasks;
INSERT INTO task_jira_issues(id,team_key,task_id,issue_scope,jira_issue_id,jira_issue_key,jira_issue_url,jira_project_key,status)
SELECT md5('mig-jira-'||n)::uuid,'migration-audit',id,'STORY',n::text,'AUDIT-'||n,'https://example.invalid/browse/AUDIT-'||n,'AUDIT','CREATED' FROM migration_fixture_tasks;
INSERT INTO api_call_history(id,session_id,user_name,action,path,http_method,status_code,created_at,team_key,entity_type,entity_id,event_type,changes_json,meta_json)
SELECT md5('mig-history-'||n)::uuid,'migration-session','Migration audit','History','/tasks/update','POST',200,timestamptz '2031-11-01 10:00:00+00','migration-audit','task',id,'task.update',
       jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('field','status','before',status,'after',status))),'{"retained":true}'::jsonb
FROM migration_fixture_tasks;
INSERT INTO planning_backlog_items(id,team_key,title,description,dod,priority,customers,streams,planning_demands,planning_quarter_ids,planning_sprint_ids,initial_quarter_id,release_date_id,display_order,created_at,updated_at)
SELECT md5('mig-draft-'||n)::uuid,'migration-audit','Draft '||n,E'Preserve\nDescription','DoD',2,'["Customer"]','["Core"]',
       jsonb_build_array(jsonb_build_object('kind','PARTICIPANT','participantId',md5('mig-person-1')::uuid,'days',1.5)),
       jsonb_build_array(md5('mig-quarter')::uuid),jsonb_build_array(md5('mig-sprint')::uuid),md5('mig-quarter')::uuid,md5('mig-release-1')::uuid,n,date '2031-10-01',date '2031-11-01'
FROM migration_fixture_tasks;
DROP TABLE migration_fixture_tasks;
COMMIT;
