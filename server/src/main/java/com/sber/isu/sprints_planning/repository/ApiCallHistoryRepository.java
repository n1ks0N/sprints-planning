package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ApiCallHistoryEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ApiCallHistoryRepository extends JpaRepository<ApiCallHistoryEntity, UUID> {

    @Query(
        value = """
            SELECT
                h.session_id AS sessionId,
                h.user_name AS userName,
                MAX(h.created_at) AS latestCreatedAt
            FROM api_call_history h
            WHERE h.team_key = :teamKey
              AND UPPER(h.http_method) <> 'GET'
              AND (h.entity_type IS NULL OR h.entity_type = '')
            GROUP BY h.session_id, h.user_name
            ORDER BY MAX(h.created_at) DESC
            """,
        countQuery = """
            SELECT COUNT(*) FROM (
                SELECT 1
                FROM api_call_history h
                WHERE h.team_key = :teamKey
                  AND UPPER(h.http_method) <> 'GET'
                  AND (h.entity_type IS NULL OR h.entity_type = '')
                GROUP BY h.session_id, h.user_name
            ) grouped_sessions
            """,
        nativeQuery = true
    )
    Page<ApiHistorySessionSummaryProjection> findActionSessionSummaries(
        @Param("teamKey") String teamKey,
        Pageable pageable
    );

    @Query("""
        select h
        from ApiCallHistoryEntity h
        where h.teamKey = :teamKey
          and h.sessionId in :sessionIds
          and upper(h.httpMethod) <> 'GET'
          and (h.entityType is null or h.entityType = '')
        order by h.createdAt desc
        """)
    List<ApiCallHistoryEntity> findActionHistoryByTeamKeyAndSessionIds(
        @Param("teamKey") String teamKey,
        @Param("sessionIds") List<String> sessionIds
    );

    Page<ApiCallHistoryEntity> findAllByTeamKeyAndEntityTypeAndEntityId(
        String teamKey,
        String entityType,
        UUID entityId,
        Pageable pageable
    );
}
