package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.QuarterEntity;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuarterRepository extends JpaRepository<QuarterEntity, UUID> {
    @org.springframework.data.jpa.repository.Query("""
        select q from QuarterEntity q where q.teamKey = :team and
        ((:search = '' and q.startDate < :until and q.endDate >= :fromDate)
         or (:search <> '' and locate(lower(:search), lower(q.name)) > 0))
        order by q.startDate, q.id
        """)
    List<QuarterEntity> findOptions(String team, String search, java.time.LocalDate fromDate,
        java.time.LocalDate until, org.springframework.data.domain.Pageable pageable);

    Optional<QuarterEntity> findByNameIgnoreCaseAndTeamKey(String name, String teamKey);

    Optional<QuarterEntity> findByIdAndTeamKey(UUID id, String teamKey);

    List<QuarterEntity> findByTeamKeyOrderByStartDateAsc(String teamKey);

    List<QuarterEntity> findByTeamKeyOrderByEndDateAsc(String teamKey);
}
