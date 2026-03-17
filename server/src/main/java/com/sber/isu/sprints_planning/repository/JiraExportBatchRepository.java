package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.JiraExportBatchEntity;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JiraExportBatchRepository extends JpaRepository<JiraExportBatchEntity, UUID> {

    Optional<JiraExportBatchEntity> findByIdAndTeamKey(UUID id, String teamKey);
}
