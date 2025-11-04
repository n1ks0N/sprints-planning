package com.sprints.planning.repository;

import com.sprints.planning.model.RunVacationEntity;
import com.sprints.planning.model.RunVacationId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RunVacationRepository extends JpaRepository<RunVacationEntity, RunVacationId> {

    @Query("select rv from RunVacationEntity rv where rv.sprint.quarter.id = :quarterId")
    List<RunVacationEntity> findByQuarterId(@Param("quarterId") UUID quarterId);
}
