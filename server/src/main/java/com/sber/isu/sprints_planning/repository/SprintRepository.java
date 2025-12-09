package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SprintRepository extends JpaRepository<SprintEntity, UUID> {
    List<SprintEntity> findByQuarterOrderByOrderAsc(QuarterEntity quarter);

    List<SprintEntity> findByTeamKeyAndQuarterIdOrderByOrderAsc(String teamKey, UUID quarterId);

    @Query("select s from SprintEntity s join s.quarter q where s.teamKey = :teamKey order by q.startDate asc, s.order asc")
    List<SprintEntity> findByTeamKeyOrderByQuarterAndOrder(@Param("teamKey") String teamKey);

    @Query("select s from SprintEntity s where s.id = :id and s.teamKey = :teamKey")
    Optional<SprintEntity> findByIdAndTeamKey(@Param("id") UUID id, @Param("teamKey") String teamKey);

    List<SprintEntity> findByTeamKeyAndIdIn(String teamKey, Iterable<UUID> ids);
}
