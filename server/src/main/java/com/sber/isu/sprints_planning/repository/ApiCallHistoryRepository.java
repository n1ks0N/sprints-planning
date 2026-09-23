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
        order by max(h.createdAt) desc
        """)
    List<ApiHistorySessionSummaryProjection> findActionSessionSummaries(
        @Param("teamKey") String teamKey,
        Pageable pageable
    );

    @Query("""
        select h
        from ApiCallHistoryEntity h
        where h.teamKey = :teamKey
          and h.sessionId = :sessionId
          and h.userName = :userName
          and h.httpMethod <> 'GET'
          and (h.entityType is null or h.entityType = '')
        order by h.createdAt desc
        """)
    List<ApiCallHistoryEntity> findActionHistoryByTeamKeyAndSession(
        @Param("teamKey") String teamKey,
        @Param("sessionId") String sessionId,
        @Param("userName") String userName,
        Pageable pageable
    );

    Page<ApiCallHistoryEntity> findAllByTeamKeyAndEntityTypeAndEntityId(
        String teamKey,
        String entityType,
        UUID entityId,
        Pageable pageable
    );
}
