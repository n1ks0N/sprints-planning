-- Dedicated audit database only. No cleanup of existing application data.
DO $$ BEGIN
  IF current_database() <> 'sprints_audit' THEN
    RAISE EXCEPTION 'This fixture is restricted to the dedicated sprints_audit database';
  END IF;
END $$;
BEGIN;
INSERT INTO teams(key, name) VALUES ('backend-audit', 'Backend audit: 50 participants / 500 tasks');
CREATE TEMP TABLE audit_quarters AS
SELECT g AS n, md5('backend-audit-quarter-'||g)::uuid AS id,
       (date '2026-07-01' + g * interval '3 months')::date AS start_date,
       (date '2026-07-01' + (g+1) * interval '3 months' - interval '1 day')::date AS end_date
FROM generate_series(0,3) g;
INSERT INTO quarters(id,year,number,name,start_date,end_date,team_key)
SELECT id,extract(year from start_date)::int,extract(quarter from start_date)::smallint,
       'Q'||extract(quarter from start_date)::int||' '||extract(year from start_date)::int,start_date,end_date,'backend-audit' FROM audit_quarters;
CREATE TEMP TABLE audit_sprints AS
SELECT q.n AS quarter_n,g AS n,md5('backend-audit-sprint-'||q.n||'-'||g)::uuid AS id,q.id AS quarter_id,
       q.start_date+g*14 AS start_date,q.start_date+g*14+13 AS end_date FROM audit_quarters q CROSS JOIN generate_series(0,5) g;
INSERT INTO sprints(id,quarter_id,name,start_date,end_date,working_days,"order",team_key)
SELECT id,quarter_id,'Sprint '||n,start_date,end_date,10,n,'backend-audit' FROM audit_sprints;
CREATE TEMP TABLE audit_people AS SELECT g AS n,md5('backend-audit-person-'||g)::uuid AS id FROM generate_series(0,49) g;
INSERT INTO participants(id,full_name,role,rate,display_order,team_key,active,jira_login)
SELECT id,'Audit participant '||lpad(n::text,2,'0'),CASE n%3 WHEN 0 THEN 'BE' WHEN 1 THEN 'FE' ELSE 'QA' END,1,n,'backend-audit',true,'audit-'||n FROM audit_people;
INSERT INTO participant_user_streams(participant_id,user_stream)
SELECT id,'Platform' FROM audit_people UNION ALL SELECT id,'Stream '||(n%5) FROM audit_people;
INSERT INTO participant_role_values(name,team_key) VALUES ('BE','backend-audit'),('FE','backend-audit'),('QA','backend-audit');
INSERT INTO participant_stream_values(name,team_key) SELECT DISTINCT user_stream,'backend-audit' FROM participant_user_streams;
INSERT INTO releases(id,name,prom_date,created_at,updated_at,team_key)
SELECT md5('backend-audit-release-'||quarter_n||'-'||n)::uuid,'Release '||quarter_n||'-'||n,end_date,current_date,current_date,'backend-audit' FROM audit_sprints;
CREATE TEMP TABLE audit_tasks AS SELECT g AS n,md5('backend-audit-task-'||g)::uuid AS id,g%4 AS quarter_n,1+g%10 AS assignees FROM generate_series(0,499) g;
INSERT INTO tasks(id,title,description,dod,priority,status,workspace,customer,stream,created_at,updated_at,display_order,team_key,release_date_id,initial_quarter_id,leader_participant_id,planning_quarter_ids,planning_sprint_ids,notes)
SELECT t.id,'Audit task '||lpad(t.n::text,3,'0'),repeat('Searchable task description. ',8),'Reviewed and tested',1+t.n%3,
       CASE WHEN t.n>=400 THEN 'backlog' WHEN t.n%3=0 THEN 'inprogress' WHEN t.n%3=1 THEN 'done' ELSE 'canceled' END,
       CASE WHEN t.n>=400 THEN 'BACKLOG' ELSE 'ROADMAP' END,'Customer A','Core',current_date,current_date,
       CASE WHEN t.n>=400 THEN t.n-400 ELSE t.n END,'backend-audit',md5('backend-audit-release-'||t.quarter_n||'-'||(t.n%6))::uuid,
       q.id,p.id,jsonb_build_array(q.id),(SELECT jsonb_agg(s.id ORDER BY s.n)FROM audit_sprints s WHERE s.quarter_n=t.quarter_n),'{}'::jsonb
FROM audit_tasks t JOIN audit_quarters q ON q.n=t.quarter_n JOIN audit_people p ON p.n=(t.n*7)%50;
INSERT INTO task_customers(id,name,team_key) VALUES (md5('backend-audit-customer-a')::uuid,'Customer A','backend-audit'),(md5('backend-audit-customer-b')::uuid,'Customer B','backend-audit');
INSERT INTO task_streams(id,name,team_key) VALUES (md5('backend-audit-stream-a')::uuid,'Core','backend-audit'),(md5('backend-audit-stream-b')::uuid,'Platform','backend-audit');
INSERT INTO task_customer_values(task_id,customer_id) SELECT t.id,c.id FROM audit_tasks t CROSS JOIN task_customers c WHERE c.team_key='backend-audit';
INSERT INTO task_stream_values(task_id,stream_id) SELECT t.id,s.id FROM audit_tasks t CROSS JOIN task_streams s WHERE s.team_key='backend-audit';
INSERT INTO task_participants(task_id,participant_id,display_order,team_key)
SELECT t.id,p.id,i,'backend-audit' FROM audit_tasks t CROSS JOIN LATERAL generate_series(0,t.assignees-1) i JOIN audit_people p ON p.n=(t.n*7+i)%50;
INSERT INTO task_allocations(task_id,participant_id,sprint_id,days,team_key)
SELECT t.id,p.participant_id,s.id,0.5,'backend-audit' FROM audit_tasks t JOIN task_participants p ON p.task_id=t.id JOIN audit_sprints s ON s.quarter_n=t.quarter_n;
INSERT INTO task_loads(task_id,sprint_id,days,team_key)
SELECT task_id,sprint_id,sum(days),'backend-audit' FROM task_allocations GROUP BY task_id,sprint_id;
INSERT INTO task_jira_issues(id,team_key,task_id,issue_scope,jira_issue_id,jira_issue_key,jira_issue_url,jira_project_key,status)
SELECT md5('backend-audit-jira-'||t.n)::uuid,'backend-audit',t.id,'STORY',t.n::text,'AUDIT-'||(t.n+1),'https://example.invalid/browse/AUDIT-'||(t.n+1),'AUDIT','CREATED' FROM audit_tasks t WHERE n<400;
INSERT INTO task_jira_issues(id,team_key,task_id,participant_id,planning_sprint_id,issue_scope,jira_issue_id,jira_issue_key,jira_issue_url,jira_project_key,status,parent_task_jira_issue_id)
SELECT md5('backend-audit-jira-participant-'||t.n||'-'||p.participant_id)::uuid,'backend-audit',t.id,p.participant_id,s.id,'PARTICIPANT',t.n||'-'||p.participant_id,'AUDIT-'||(1000+t.n*10+p.display_order),'https://example.invalid/browse/AUDIT-'||(1000+t.n*10+p.display_order),'AUDIT','CREATED',md5('backend-audit-jira-'||t.n)::uuid
FROM audit_tasks t JOIN task_participants p ON p.task_id=t.id JOIN audit_sprints s ON s.quarter_n=t.quarter_n AND s.n=0 WHERE t.n<400;
INSERT INTO planning_backlog_items(id,team_key,title,description,dod,priority,customers,streams,planning_demands,planning_quarter_ids,planning_sprint_ids,initial_quarter_id,release_date_id,display_order)
SELECT md5('backend-audit-item-'||t.n)::uuid,'backend-audit','Planning '||t.n,'Planning description','Ready',1+t.n%3,'["Customer A"]','["Core"]',
       (SELECT jsonb_agg(jsonb_build_object('kind','PARTICIPANT','participantId',p.id,'days',0.5)) FROM generate_series(0,t.assignees-1) i JOIN audit_people p ON p.n=(t.n*7+i)%50),
       jsonb_build_array(q.id),(SELECT jsonb_agg(s.id ORDER BY s.n)FROM audit_sprints s WHERE s.quarter_n=t.quarter_n),q.id,
       md5('backend-audit-release-'||t.quarter_n||'-'||(t.n%6))::uuid,t.n FROM audit_tasks t JOIN audit_quarters q ON q.n=t.quarter_n;
INSERT INTO api_call_history(id,session_id,user_name,action,path,http_method,status_code,created_at,team_key)
SELECT md5('backend-audit-history-'||g)::uuid,'audit-session-'||(g%50),'Audit User','Изменена задача','/backend-audit/tasks/update','POST',200,
       timestamptz '2026-11-01 12:00:00+00'+g*interval '1 second','backend-audit' FROM generate_series(1,10000)g;
INSERT INTO api_call_history(id,session_id,user_name,action,path,http_method,status_code,created_at,team_key,entity_type,entity_id,event_type,changes_json,meta_json)
SELECT md5('backend-audit-task-history-'||g)::uuid,'audit-session-'||(g%50),'Audit User','Изменена задача','/backend-audit/tasks/update','POST',200,
       timestamptz '2026-11-01 12:00:00+00'+g*interval '1 second','backend-audit','task',md5('backend-audit-task-'||(g%500))::uuid,'task.update','{"changes":[{"field":"priority","label":"Приоритет","before":1,"after":2}]}','{}' FROM generate_series(1,10000)g;
COMMIT;
ANALYZE;
