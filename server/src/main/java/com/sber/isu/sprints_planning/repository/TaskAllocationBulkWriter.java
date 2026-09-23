package com.sber.isu.sprints_planning.repository;

import java.math.BigDecimal;
import java.sql.Types;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TaskAllocationBulkWriter {

    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedJdbcTemplate;

    public TaskAllocationBulkWriter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.namedJdbcTemplate = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    public void apply(List<AllocationValue> values) {
        List<AllocationValue> positive = values.stream().filter(value -> value.days().signum() > 0).toList();
        if (!positive.isEmpty()) {
            jdbcTemplate.batchUpdate("""
                insert into task_allocations (task_id, participant_id, sprint_id, days, team_key)
                values (?, ?, ?, ?, ?)
                on conflict (task_id, participant_id, sprint_id)
                do update set days = excluded.days, team_key = excluded.team_key
                """, positive, positive.size(), (statement, value) -> {
                    statement.setObject(1, value.taskId(), Types.OTHER);
                    statement.setObject(2, value.participantId(), Types.OTHER);
                    statement.setObject(3, value.sprintId(), Types.OTHER);
                    statement.setBigDecimal(4, value.days());
                    statement.setString(5, value.teamKey());
                });
        }

        List<AllocationValue> zero = values.stream().filter(value -> value.days().signum() == 0).toList();
        if (!zero.isEmpty()) {
            jdbcTemplate.batchUpdate("""
                delete from task_allocations
                where task_id = ? and participant_id = ? and sprint_id = ? and team_key = ?
                """, zero, zero.size(), (statement, value) -> {
                    statement.setObject(1, value.taskId(), Types.OTHER);
                    statement.setObject(2, value.participantId(), Types.OTHER);
                    statement.setObject(3, value.sprintId(), Types.OTHER);
                    statement.setString(4, value.teamKey());
                });
        }
    }

    public void rebuildLoads(UUID taskId, String teamKey, List<UUID> sprintIds) {
        if (sprintIds.isEmpty()) return;
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("taskId", taskId)
            .addValue("teamKey", teamKey)
            .addValue("sprintIds", sprintIds);
        namedJdbcTemplate.update("""
            delete from task_loads
            where task_id = :taskId and team_key = :teamKey and sprint_id in (:sprintIds)
            """, parameters);
        namedJdbcTemplate.update("""
            insert into task_loads (task_id, sprint_id, days, team_key)
            select task_id, sprint_id, sum(days), :teamKey
            from task_allocations
            where task_id = :taskId and team_key = :teamKey and sprint_id in (:sprintIds)
            group by task_id, sprint_id
            having sum(days) > 0
            """, parameters);
    }

    public record AllocationValue(
        UUID taskId,
        UUID participantId,
        UUID sprintId,
        BigDecimal days,
        String teamKey
    ) {
    }
}
