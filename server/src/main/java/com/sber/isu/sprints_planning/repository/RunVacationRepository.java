package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.RunVacationEntity;
import com.sber.isu.sprints_planning.model.RunVacationId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RunVacationRepository extends JpaRepository<RunVacationEntity, RunVacationId> {

    @Query("select rv from RunVacationEntity rv where rv.sprint.quarter.id = :quarterId and rv.sprint.teamKey = :teamKey")
    List<RunVacationEntity> findByTeamKeyAndQuarterId(@Param("teamKey") String teamKey, @Param("quarterId") UUID quarterId);

    @Query("select rv from RunVacationEntity rv where rv.sprint.teamKey = :teamKey")
    List<RunVacationEntity> findByTeamKey(@Param("teamKey") String teamKey);
}
