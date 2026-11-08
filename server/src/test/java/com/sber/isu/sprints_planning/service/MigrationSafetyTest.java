package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import liquibase.ChecksumVersion;
import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.Scope;
import liquibase.changelog.ChangeLogParameters;
import liquibase.changelog.FastCheckService;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.exception.LiquibaseException;
import liquibase.parser.ChangeLogParserFactory;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

class MigrationSafetyTest {
    private static final String MASTER = "database/changelog.yml";
    private static final String FILE_22 = "database/1.0.0/1.0.0_22_roadmap_backlog.sql";
    private static final String FILE_23 = "database/1.0.0/1.0.0_23_redundant_task_indexes.sql";
    // Captured from databases that applied the original files, before the migration layout correction.
    private static final Map<String, String> ORIGINAL_CHECKSUMS = Map.of(
        "1.0.0-22", "9:ac2553200a58eb37a153e037a9be53d3",
        "1.0.0-23-alloc-task-index", "9:42288ef26858366c36ab3137dfea012d",
        "1.0.0-23-load-task-index", "9:7f3fcc216b0f663be730281635d83b4b",
        "1.0.0-23-participant-task-index", "9:81e2668e5a043d178e36a6983aaf0f63"
    );

    @Test
    void migration22IsUnchangedAnd23ContainsOneNonTransactionalChangeset() throws Exception {
        try (var resources = new ClassLoaderResourceAccessor()) {
            var changelog = ChangeLogParserFactory.getInstance().getParser(MASTER, resources)
                .parse(MASTER, new ChangeLogParameters(), resources);
            var changes = changelog.getChangeSets().stream()
                .filter(change -> change.getFilePath().equals(FILE_22) || change.getFilePath().equals(FILE_23)).toList();
            assertThat(changes).extracting(change -> change.getId()).containsExactly("1.0.0-22", "1.0.0-23");
            assertThat(changes.get(0).generateCheckSum(ChecksumVersion.V9).toString()).isEqualTo(ORIGINAL_CHECKSUMS.get("1.0.0-22"));
            assertThat(changes.get(0).isRunInTransaction()).isTrue();
            assertThat(changes.get(1).isRunInTransaction()).isFalse();
            for (String file : List.of(FILE_22, FILE_23)) {
                try (var input = getClass().getClassLoader().getResourceAsStream(file)) {
                    assertThat(new String(input.readAllBytes(), StandardCharsets.UTF_8)).doesNotContain("--precondition");
                }
            }
        }
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "BACKEND_AUDIT_DB_URL", matches = ".*/sprints_audit(?:\\?.*)?")
    void populatedUpgradePartialExecutionRepeatedUpdateAndIndexRollbackPreserveData() throws Exception {
        withSchema((connection, liquibase, schema) -> {
            prepareBefore22(connection, liquibase);
            Map<String, String> expected = snapshot(connection, schema, true, false);
            liquibase.update(1, new Contexts(), new LabelExpression());
            assertThat(snapshot(connection, schema, false, false)).isEqualTo(expected);
            assertThat(scalar(connection, "select count(*) from tasks where revision=0 and workspace=case when status='backlog' then 'BACKLOG' else 'ROADMAP' end")).isEqualTo(6);
            assertThat(scalar(connection, "select count(*) from planning_backlog_items where source_task_id is null and source_revision is null and source_leader_id is null and source_notes='{}'::jsonb")).isEqualTo(6);
            assertThat(indexCount(connection, schema)).isEqualTo(3);
            verifyLedger(connection, 1);

            // Existing migration-22 data must also survive moving migration-23.
            sql(connection, "update tasks set status='canceled',workspace='BACKLOG',revision=7 where id=md5('mig-task-3')::uuid");
            sql(connection, "update planning_backlog_items set source_task_id=md5('mig-task-4')::uuid,source_revision=7,source_leader_id=md5('mig-person-1')::uuid,source_notes=jsonb_build_object(md5('mig-person-1')::uuid,'Copied note') where id=md5('mig-draft-1')::uuid");
            Map<String, String> migratedData = snapshot(connection, schema, false, true);

            // Simulate a crash after DROP but before recording the changeset.
            sql(connection, "drop index idx_task_allocations_task");
            liquibase.update(1, new Contexts(), new LabelExpression());
            assertThat(indexCount(connection, schema)).isZero();
            assertThat(liquibase.listUnrunChangeSets(new Contexts(), new LabelExpression())).isEmpty();
            verifyLedger(connection, 2);
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(migratedData);

            liquibase.validate();
            liquibase.update(new Contexts(), new LabelExpression());
            assertThat(indexCount(connection, schema)).isZero();
            verifyLedger(connection, 2);
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(migratedData);

            String ledger = scalarText(connection, "select jsonb_agg(to_jsonb(h) order by orderexecuted)::text from databasechangelog h");
            updateFromFreshConnection(connection, schema, 0);
            assertThat(scalarText(connection, "select jsonb_agg(to_jsonb(h) order by orderexecuted)::text from databasechangelog h")).isEqualTo(ledger);
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(migratedData);

            liquibase.rollback(1, new Contexts(), new LabelExpression());
            assertThat(indexCount(connection, schema)).isEqualTo(3);
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(migratedData);
            updateFromFreshConnection(connection, schema, 1);
            assertThat(indexCount(connection, schema)).isZero();
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(migratedData);
            verifyLedger(connection, 2);
        });
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 3})
    @EnabledIfEnvironmentVariable(named = "BACKEND_AUDIT_DB_URL", matches = ".*/sprints_audit(?:\\?.*)?")
    void existing22AndLegacy23HistoryRemainValid(int appliedLegacySteps) throws Exception {
        withSchema((connection, liquibase, schema) -> {
            prepareBefore22(connection, liquibase);
            liquibase.update(1, new Contexts(), new LabelExpression());
            if (appliedLegacySteps > 0) {
                try (Connection oldConnection = DriverManager.getConnection(System.getenv("BACKEND_AUDIT_DB_URL"), "audit", "audit")) {
                    oldConnection.setSchema(schema);
                    var database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(oldConnection));
                    database.setDefaultSchemaName(schema);
                    try (Liquibase legacy = new Liquibase("migration-23-legacy.sql", new ClassLoaderResourceAccessor(), database)) {
                        legacy.update(appliedLegacySteps, new Contexts(), new LabelExpression());
                    }
                }
            }
            try (Statement statement = connection.createStatement(); var rows = statement.executeQuery("select id,md5sum from databasechangelog where id like '1.0.0-23-%'")) {
                while (rows.next()) assertThat(rows.getString(2)).isEqualTo(ORIGINAL_CHECKSUMS.get(rows.getString(1)));
            }
            Map<String, String> before = snapshot(connection, schema, false, true);
            String legacyLedger = scalarText(connection, "select jsonb_agg(to_jsonb(h) order by orderexecuted)::text from databasechangelog h where id like '1.0.0-23-%'");
            updateFromFreshConnection(connection, schema, 1);
            assertThat(indexCount(connection, schema)).isZero();
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(before);
            assertThat(scalarText(connection, "select jsonb_agg(to_jsonb(h) order by orderexecuted)::text from databasechangelog h where id like '1.0.0-23-%'")).isEqualTo(legacyLedger);
            assertThat(scalar(connection, "select count(*) from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0] where i.indrelid in ('task_allocations'::regclass,'task_loads'::regclass,'task_participants'::regclass) and i.indisprimary and i.indisvalid and a.attname='task_id'")).isEqualTo(3);
            verifyLedger(connection, 2);
            updateFromFreshConnection(connection, schema, 0);
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(before);
        });
    }

    enum Rejection { DUPLICATE_RELEASE, UNKNOWN_STATUS, LATE_DDL_CONFLICT }

    @ParameterizedTest
    @EnumSource(Rejection.class)
    @EnabledIfEnvironmentVariable(named = "BACKEND_AUDIT_DB_URL", matches = ".*/sprints_audit(?:\\?.*)?")
    void rejectedUpgradeLeavesExistingDataAndSchemaIntact(Rejection reason) throws Exception {
        withSchema((connection, liquibase, schema) -> {
            prepareBefore22(connection, liquibase);
            switch (reason) {
                case DUPLICATE_RELEASE -> sql(connection, "update releases set prom_date=date '2032-01-10' where id=md5('mig-release-2')::uuid");
                case UNKNOWN_STATUS -> sql(connection, "update tasks set status='unexpected' where id=md5('mig-task-1')::uuid");
                // This fails after ALTER/UPDATE/CHECK, testing real transactional rollback.
                case LATE_DDL_CONFLICT -> sql(connection, "create index tasks_workspace_order_idx on tasks(team_key,display_order)");
            }
            Map<String, String> before = snapshot(connection, schema, false, true);
            assertThatThrownBy(() -> liquibase.update(new Contexts(), new LabelExpression())).isInstanceOf(LiquibaseException.class);
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(before);
            assertNo22(connection, schema);
        });
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "BACKEND_AUDIT_DB_URL", matches = ".*/sprints_audit(?:\\?.*)?")
    void missingIndexNeverFallsBackToAnotherSchema() throws Exception {
        withSchema((connection, liquibase, schema) -> {
            prepareBefore22(connection, liquibase);
            liquibase.update(1, new Contexts(), new LabelExpression());
            String shadow = schema + "_shadow";
            sql(connection, "drop index idx_task_allocations_task");
            sql(connection, "create schema " + shadow);
            try {
                sql(connection, "create table " + shadow + ".other_allocations(task_id uuid)");
                sql(connection, "create index idx_task_allocations_task on " + shadow + ".other_allocations(task_id)");
                sql(connection, "set search_path to " + schema + "," + shadow);
                Map<String, String> before = snapshot(connection, schema, false, true);
                liquibase.update(new Contexts(), new LabelExpression());
                assertThat(indexCount(connection, schema)).isZero();
                assertThat(snapshot(connection, schema, false, true)).isEqualTo(before);
                assertThat(scalar(connection, "select count(*) from pg_indexes where schemaname='" + shadow + "' and indexname='idx_task_allocations_task'")).isEqualTo(1);
                verifyLedger(connection, 2);
            } finally {
                sql(connection, "drop schema " + shadow + " cascade");
            }
        });
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "BACKEND_AUDIT_DB_URL", matches = ".*/sprints_audit(?:\\?.*)?")
    void aLockTimeoutRollsBackWithoutChangingExistingData() throws Exception {
        withSchema((connection, liquibase, schema) -> {
            prepareBefore22(connection, liquibase);
            Map<String, String> before = snapshot(connection, schema, false, true);
            try (Connection reader = DriverManager.getConnection(System.getenv("BACKEND_AUDIT_DB_URL"), "audit", "audit")) {
                reader.setAutoCommit(false);
                try (Statement statement = reader.createStatement()) {
                    statement.executeQuery("select id from " + schema + ".tasks").close();
                }
                sql(connection, "set lock_timeout='250ms'");
                try {
                    assertThatThrownBy(() -> liquibase.update(new Contexts(), new LabelExpression()))
                        .isInstanceOf(LiquibaseException.class).hasStackTraceContaining("lock timeout");
                } finally {
                    reader.rollback();
                }
            }
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(before);
            assertNo22(connection, schema);
        });
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "BACKEND_AUDIT_DB_URL", matches = ".*/sprints_audit(?:\\?.*)?")
    void cancelledConcurrentDropCanResumeWithoutTouchingData() throws Exception {
        withSchema((connection, liquibase, schema) -> {
            prepareBefore22(connection, liquibase);
            liquibase.update(1, new Contexts(), new LabelExpression());
            Map<String, String> before = snapshot(connection, schema, false, true);
            try (Connection reader = DriverManager.getConnection(System.getenv("BACKEND_AUDIT_DB_URL"), "audit", "audit");
                 Connection dropper = DriverManager.getConnection(System.getenv("BACKEND_AUDIT_DB_URL"), "audit", "audit")) {
                reader.setAutoCommit(false);
                try (Statement statement = reader.createStatement()) {
                    statement.executeQuery("select task_id from " + schema + ".task_allocations").close();
                }
                dropper.setSchema(schema);
                sql(dropper, "set statement_timeout='500ms'");
                try {
                    assertThatThrownBy(() -> sql(dropper, "drop index concurrently idx_task_allocations_task"))
                        .isInstanceOf(java.sql.SQLException.class).hasMessageContaining("statement timeout");
                } finally {
                    reader.rollback();
                }
            }
            assertThat(scalar(connection, "select count(*) from pg_index where indexrelid='idx_task_allocations_task'::regclass and not indisvalid")).isEqualTo(1);
            liquibase.update(new Contexts(), new LabelExpression());
            assertThat(indexCount(connection, schema)).isZero();
            verifyLedger(connection, 2);
            assertThat(snapshot(connection, schema, false, true)).isEqualTo(before);
        });
    }

    private void prepareBefore22(Connection connection, Liquibase liquibase) throws Exception {
        int priorCount = 0;
        for (var change : liquibase.getDatabaseChangeLog().getChangeSets()) {
            if (change.getId().equals("1.0.0-22")) break;
            priorCount++;
        }
        liquibase.update(priorCount, new Contexts(), new LabelExpression());
        liquibase.getDatabase().setAutoCommit(true);
        try (var input = getClass().getClassLoader().getResourceAsStream("migration-safety-fixture.sql")) {
            sql(connection, new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        assertThat(liquibase.listUnrunChangeSets(new Contexts(), new LabelExpression())).hasSize(2);
    }

    private static Map<String, String> snapshot(Connection connection, String schema, boolean normalizeStatus, boolean fullShape) throws Exception {
        Map<String, String> rows = new LinkedHashMap<>();
        List<String> tables = new java.util.ArrayList<>();
        try (var statement = connection.prepareStatement("select table_name from information_schema.tables where table_schema=? and table_type='BASE TABLE' and table_name not like 'databasechangelog%' order by table_name")) {
            statement.setString(1, schema);
            try (var result = statement.executeQuery()) { while (result.next()) tables.add(result.getString(1)); }
        }
        for (String table : tables) {
            String row = "to_jsonb(t)";
            if (!fullShape && table.equals("tasks")) row += " - 'workspace' - 'revision'";
            if (!fullShape && table.equals("planning_backlog_items")) row += " - 'source_task_id' - 'source_revision' - 'source_notes' - 'source_leader_id'";
            if (normalizeStatus && table.equals("tasks")) row = "(" + row + ") || jsonb_build_object('status',case status when 'notdone' then 'canceled' when 'partial' then 'done' else status end)";
            rows.put(table, scalarText(connection, "select coalesce(jsonb_agg(row_data order by row_data::text)::text,'[]') from (select " + row + " row_data from \"" + table + "\" t) snapshot"));
        }
        return rows;
    }

    private static void verifyLedger(Connection connection, int expected) throws Exception {
        int found = 0;
        try (Statement statement = connection.createStatement(); var rows = statement.executeQuery("select id,author,filename,md5sum from databasechangelog where id in ('1.0.0-22','1.0.0-23')")) {
            while (rows.next()) {
                String id = rows.getString(1);
                assertThat(rows.getString(2)).isEqualTo("sprints");
                assertThat(rows.getString(3)).isEqualTo(id.equals("1.0.0-22") ? FILE_22 : FILE_23);
                if (id.equals("1.0.0-22")) assertThat(rows.getString(4)).isEqualTo(ORIGINAL_CHECKSUMS.get(id));
                found++;
            }
        }
        assertThat(found).isEqualTo(expected);
    }

    private static void updateFromFreshConnection(Connection previous, String schema, int expectedPending) throws Exception {
        // A new CLI/JVM has no process-wide "up-to-date" cache from a pre-rollback update.
        // This clears only test-process memory, never DATABASECHANGELOG/checksums.
        Scope.getCurrentScope().getSingleton(FastCheckService.class).clearCache();
        if (!previous.getAutoCommit()) previous.commit();
        try (Connection connection = DriverManager.getConnection(System.getenv("BACKEND_AUDIT_DB_URL"), "audit", "audit")) {
            connection.setSchema(schema);
            var database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
            database.setDefaultSchemaName(schema);
            try (Liquibase liquibase = new Liquibase(MASTER, new ClassLoaderResourceAccessor(), database)) {
                liquibase.validate();
                assertThat(liquibase.listUnrunChangeSets(new Contexts(), new LabelExpression())).hasSize(expectedPending);
                liquibase.update(new Contexts(), new LabelExpression());
            }
        }
    }

    private static void assertNo22(Connection connection, String schema) throws Exception {
        assertThat(scalar(connection, "select count(*) from databasechangelog where id in ('1.0.0-22','1.0.0-23')")).isZero();
        assertThat(scalar(connection, "select count(*) from information_schema.columns where table_schema='" + schema + "' and table_name='tasks' and column_name in ('workspace','revision')")).isZero();
        assertThat(indexCount(connection, schema)).isEqualTo(3);
    }

    private static long indexCount(Connection connection, String schema) throws Exception {
        return scalar(connection, "select count(*) from pg_indexes where schemaname='" + schema + "' and indexname in ('idx_task_allocations_task','idx_task_loads_task','idx_task_participants_task')");
    }

    private static long scalar(Connection connection, String query) throws Exception {
        return Long.parseLong(scalarText(connection, query));
    }

    private static String scalarText(Connection connection, String query) throws Exception {
        try (Statement statement = connection.createStatement(); var rows = statement.executeQuery(query)) { rows.next(); return rows.getString(1); }
    }

    private static void sql(Connection connection, String query) throws Exception {
        try (Statement statement = connection.createStatement()) { statement.execute(query); }
        // Fixture changes precede a new Liquibase transaction; make them durable.
        if (!connection.getAutoCommit()) connection.commit();
    }

    @FunctionalInterface
    private interface AuditTest { void run(Connection connection, Liquibase liquibase, String schema) throws Exception; }

    private static void withSchema(AuditTest test) throws Exception {
        String url = System.getenv("BACKEND_AUDIT_DB_URL");
        String schema = "migration_safety_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection connection = DriverManager.getConnection(url, "audit", "audit")) {
            sql(connection, "create schema " + schema);
            try {
                connection.setSchema(schema);
                var database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
                database.setDefaultSchemaName(schema);
                try (Liquibase liquibase = new Liquibase(MASTER, new ClassLoaderResourceAccessor(), database)) {
                    test.run(connection, liquibase, schema);
                }
            } finally {
                try (Connection cleanup = DriverManager.getConnection(url, "audit", "audit")) {
                    sql(cleanup, "drop schema " + schema + " cascade");
                }
            }
        }
    }
}
