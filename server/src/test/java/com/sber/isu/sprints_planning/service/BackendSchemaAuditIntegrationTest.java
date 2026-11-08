package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.sber.isu.sprints_planning.SprintsPlanningApplication;
import com.sber.isu.sprints_planning.model.ApiCallHistoryEntity;
import com.sber.isu.sprints_planning.model.PlanningBacklogItemEntity;
import com.sber.isu.sprints_planning.model.TaskPlanningDemandValue;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.UUID;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.hibernate.SessionFactory;

/** Opt-in real PostgreSQL test; all DDL is confined to a randomly named audit schema. */
@EnabledIfEnvironmentVariable(named = "BACKEND_AUDIT_DB_URL", matches = ".*/sprints_audit(?:\\?.*)?")
class BackendSchemaAuditIntegrationTest {
    @Test
    void migrationRollbackPreservesDataAndQueriesRespectTheMappedSchema() throws Exception {
        String url = System.getenv("BACKEND_AUDIT_DB_URL");
        String schema = "audit_schema_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection connection = DriverManager.getConnection(url, "audit", "audit")) {
            long publicTasks = scalar(connection, "select count(*) from public.tasks");
            try (Statement statement = connection.createStatement()) {
                statement.execute("create schema " + schema);
            }
            try {
                connection.setSchema(schema);
                var database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
                database.setDefaultSchemaName(schema);
                try (Liquibase liquibase = new Liquibase("database/changelog.yml", new ClassLoaderResourceAccessor(), database)) {
                    liquibase.update(new Contexts(), new LabelExpression());
                    assertThat(redundantIndexCount(connection, schema)).isZero();
                    liquibase.rollback(1, new Contexts(), new LabelExpression());
                    assertThat(redundantIndexCount(connection, schema)).isEqualTo(3);
                    UUID quarter = UUID.randomUUID(), sprint = UUID.randomUUID(), participant = UUID.randomUUID(), task = UUID.randomUUID(), leader = UUID.randomUUID();
                    try (Statement statement = connection.createStatement()) {
                        statement.execute("insert into teams(key,name) values ('schema-audit','Schema audit')");
                        statement.execute("insert into quarters(id,team_key,year,number,name,start_date,end_date) values ('" + quarter + "','schema-audit',2032,1,'Q1',date '2032-01-01',date '2032-03-31')");
                        statement.execute("insert into sprints(id,quarter_id,team_key,name,start_date,end_date,working_days,\"order\") values ('" + sprint + "','" + quarter + "','schema-audit','Sprint',date '2032-01-01',date '2032-01-14',10,0)");
                        statement.execute("insert into participants(id,full_name,role,rate,display_order,team_key) values ('" + participant + "','Person','BE',1,0,'schema-audit')");
                        statement.execute("insert into participants(id,full_name,role,rate,display_order,team_key,jira_login) values ('" + leader + "','Separate leader','BE',1,1,'schema-audit','audit.leader')");
                        statement.execute("insert into tasks(id,title,priority,status,workspace,created_at,updated_at,display_order,team_key,initial_quarter_id) values ('" + task + "','Preserved',1,'inprogress','ROADMAP',current_date,current_date,0,'schema-audit','" + quarter + "')");
                        statement.execute("update tasks set leader_participant_id='" + leader + "' where id='" + task + "'");
                        statement.execute("insert into task_participants(task_id,participant_id,team_key) values ('" + task + "','" + participant + "','schema-audit')");
                        statement.execute("insert into task_allocations(task_id,participant_id,sprint_id,days,team_key) values ('" + task + "','" + participant + "','" + sprint + "',2.5,'schema-audit')");
                        statement.execute("insert into task_loads(task_id,sprint_id,days,team_key) values ('" + task + "','" + sprint + "',2.5,'schema-audit')");
                        statement.execute("insert into api_call_history(id,session_id,user_name,action,path,http_method,status_code,created_at,team_key) values (gen_random_uuid(),'shared-session','User A','First','/tasks/update','POST',200,now()-interval '1 minute','schema-audit'),(gen_random_uuid(),'shared-session','User B','Second','/tasks/update','POST',200,now(),'schema-audit')");
                    }
                    liquibase.update(new Contexts(), new LabelExpression());
                    assertThat(redundantIndexCount(connection, schema)).isZero();
                    assertThat(scalar(connection, "select count(*) from task_participants")).isEqualTo(1);
                    assertThat(scalar(connection, "select count(*) from task_allocations where days=2.5")).isEqualTo(1);
                    assertThat(scalar(connection, "select count(*) from task_loads where days=2.5")).isEqualTo(1);
                    assertThat(scalar(connection, "select count(*) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='" + schema + "' and c.contype='p' and t.relname in ('task_participants','task_allocations','task_loads')")).isEqualTo(3);

                    // The runtime search_path remains public: native SQL must use {h-schema}.
                    try (var context = new SpringApplicationBuilder(SprintsPlanningApplication.class).web(WebApplicationType.NONE).run(
                        "--spring.datasource.url=" + url,
                        "--spring.datasource.username=audit", "--spring.datasource.password=audit",
                        "--spring.jpa.properties.hibernate.default_schema=" + schema,
                        "--spring.jpa.hibernate.ddl-auto=validate", "--spring.liquibase.enabled=false", "--app.jira.mock-enabled=true")) {
                        var history = context.getBean(ApiHistoryService.class).getHistory("schema-audit", 0, 10);
                        assertThat(history).extracting(item -> item.userName()).containsExactly("User B", "User A");
                        var tasks = context.getBean(TaskService.class);
                        var dto = tasks.findById("schema-audit", task);
                        assertThat(dto.title()).isEqualTo("Preserved");
                        assertThat(dto.leaderId()).isEqualTo(leader.toString());
                        assertThat(dto.allocations().get(participant.toString()).get(sprint.toString())).isEqualByComparingTo("2.5");
                        assertThat(tasks.findPage("schema-audit", TaskFilter.empty(), 0, 20, "releaseDate", "asc").getTotalElements()).isEqualTo(1);
                        var repository = context.getBean(TaskRepository.class);
                        // Both methods return detached entities to Jira; the leader need not be an assignee.
                        assertThat(repository.findWithDetailsById(task, "schema-audit").getLeaderParticipant().getFullName()).isEqualTo("Separate leader");
                        assertThat(repository.findAllByIdInAndTeamKey(List.of(task), "schema-audit").get(0).getLeaderParticipant().getJiraLogin()).isEqualTo("audit.leader");
                        verifyJsonDirtyChecking(context.getBean(EntityManagerFactory.class), participant);
                        var cleanup = context.getBean(TeamCleanupService.class);
                        assertThat(cleanup.countTeamData("schema-audit")).isPositive();
                        cleanup.deleteTeamData("schema-audit");
                        assertThat(cleanup.countTeamData("schema-audit")).isZero();
                    }
                }
            } finally {
                // Liquibase may close its connection; use a separate one for cleanup.
                try (Connection cleanup = DriverManager.getConnection(url, "audit", "audit"); Statement statement = cleanup.createStatement()) {
                    statement.execute("drop schema if exists " + schema + " cascade");
                    assertThat(scalar(cleanup, "select count(*) from public.tasks")).isEqualTo(publicTasks);
                }
            }
        }
    }

    private static void verifyJsonDirtyChecking(EntityManagerFactory factory, UUID participant) {
        var statistics = factory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        try (var entityManager = factory.createEntityManager()) {
            entityManager.getTransaction().begin();
            try {
                var item = new PlanningBacklogItemEntity();
                item.setTeamKey("schema-audit");
                item.setTitle("JSON dirty checking");
                item.setDescription(""); item.setDod(""); item.setPriority((short) 1);
                item.setCreatedAt(LocalDate.now()); item.setUpdatedAt(LocalDate.now());
                item.setPlanningDemands(new ArrayList<>(List.of(new TaskPlanningDemandValue(
                    "PARTICIPANT", null, participant, null, new BigDecimal("0.5")))));
                entityManager.persist(item);
                var event = new ApiCallHistoryEntity();
                event.setTeamKey("schema-audit"); event.setSessionId("json-check"); event.setUserName("Audit");
                event.setAction("JSON check"); event.setPath("/tasks/update"); event.setHttpMethod("POST"); event.setStatusCode(200);
                event.setChangesJson(Map.of("days", new BigDecimal("2.5")));
                entityManager.persist(event);
                entityManager.flush();
                statistics.clear();
                entityManager.flush(); entityManager.flush();
                assertThat(statistics.getEntityUpdateCount()).as("Unchanged JSON and append-only history must not generate UPDATEs").isZero();
                item.getPlanningDemands().get(0).setDays(new BigDecimal("1.5"));
                entityManager.flush();
                assertThat(statistics.getEntityUpdateCount()).isEqualTo(1);
                entityManager.clear();
                assertThat(entityManager.find(PlanningBacklogItemEntity.class, item.getId()).getPlanningDemands().get(0).getDays())
                    .isEqualByComparingTo("1.5");
            } finally {
                entityManager.getTransaction().rollback();
            }
        } finally {
            statistics.setStatisticsEnabled(false);
        }
    }

    private static long scalar(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement(); var rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private static long redundantIndexCount(Connection connection, String schema) throws Exception {
        return scalar(connection, "select count(*) from pg_indexes where schemaname='" + schema + "' and indexname in ('idx_task_allocations_task','idx_task_loads_task','idx_task_participants_task')");
    }
}
