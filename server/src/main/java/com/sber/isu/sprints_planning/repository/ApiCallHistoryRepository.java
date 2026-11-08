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

    @Query("""
        select new com.sber.isu.sprints_planning.repository.ApiHistorySessionSummaryProjection(
            h.sessionId,
            h.userName,
            max(h.createdAt)
        )
        from ApiCallHistoryEntity h
        where h.teamKey = :teamKey
          and h.httpMethod <> 'GET'
          and (h.entityType is null or h.entityType = '')
        group by h.sessionId, h.userName
        order by max(h.createdAt) desc, h.sessionId, h.userName
        """)
    List<ApiHistorySessionSummaryProjection> findActionSessionSummaries(
        @Param("teamKey") String teamKey,
        Pageable pageable
    );

    // One indexed top-N lookup per selected pair, in one database round trip.
    @Query(value = """
        select actions.*
        from unnest(cast(:sessionIds as text[]), cast(:userNames as text[])) as sessions(session_id, user_name)
        cross join lateral (
            select h.* from {h-schema}api_call_history h
            where h.team_key = :teamKey
              and h.session_id = sessions.session_id and h.user_name = sessions.user_name
              and h.http_method <> 'GET' and (h.entity_type is null or h.entity_type = '')
            order by h.created_at desc, h.id desc
            limit :actionLimit
        ) actions
        """, nativeQuery = true)
    List<ApiCallHistoryEntity> findActionHistoryForSessions(
        @Param("teamKey") String teamKey,
        @Param("sessionIds") String[] sessionIds,
        @Param("userNames") String[] userNames,
        @Param("actionLimit") int actionLimit
    );

    Page<ApiCallHistoryEntity> findAllByTeamKeyAndEntityTypeAndEntityId(
        String teamKey,
        String entityType,
        UUID entityId,
        Pageable pageable
    );
}
