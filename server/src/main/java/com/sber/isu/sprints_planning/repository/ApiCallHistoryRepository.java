package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ApiCallHistoryEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ApiCallHistoryRepository extends JpaRepository<ApiCallHistoryEntity, UUID> {
    List<ApiCallHistoryEntity> findAllByTeamKey(String teamKey, Sort sort);

    Page<ApiCallHistoryEntity> findAllByTeamKeyAndEntityTypeAndEntityId(
        String teamKey,
        String entityType,
        UUID entityId,
        Pageable pageable
    );
}
