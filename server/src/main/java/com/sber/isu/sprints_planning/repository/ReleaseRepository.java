package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ReleaseEntity;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReleaseRepository extends JpaRepository<ReleaseEntity, UUID> {
    interface OptionRow { UUID getId(); String getName(); LocalDate getPromDate(); }
    List<ReleaseEntity> findAllByTeamKeyOrderByPromDateAsc(String teamKey);

    Optional<ReleaseEntity> findByIdAndTeamKey(UUID id, String teamKey);

    List<ReleaseEntity> findByTeamKeyAndIdIn(String teamKey, Iterable<UUID> ids);

    Optional<ReleaseEntity> findByTeamKeyAndPromDate(String teamKey, LocalDate promDate);

    @org.springframework.data.jpa.repository.Query("""
        select r.id as id, r.name as name, r.promDate as promDate from ReleaseEntity r where r.teamKey = :team
        and r.promDate >= :fromDate
        and (:allQuarters = true or exists (select q.id from QuarterEntity q where q.teamKey = :team and q.id in :quarterIds and r.promDate between q.startDate and q.endDate))
        order by r.promDate, r.id
        """)
    List<OptionRow> findOptions(@org.springframework.data.repository.query.Param("team") String team,
        @org.springframework.data.repository.query.Param("fromDate") LocalDate fromDate,
        @org.springframework.data.repository.query.Param("allQuarters") boolean allQuarters,
        @org.springframework.data.repository.query.Param("quarterIds") List<UUID> quarterIds);

    boolean existsByTeamKeyAndPromDate(String teamKey, LocalDate promDate);

    @org.springframework.data.jpa.repository.Query("""
        select r.id as id, r.name as name, r.promDate as promDate from ReleaseEntity r where r.teamKey = :team
        and (locate(:search, cast(r.promDate as string)) > 0
             or locate(:search, function('to_char', r.promDate, 'DD.MM.YYYY')) > 0)
        order by r.promDate, r.id
        """)
    List<OptionRow> searchOptions(String team, String search, org.springframework.data.domain.Pageable pageable);

    @org.springframework.data.jpa.repository.Query("""
        select r.id as id, r.name as name, r.promDate as promDate from ReleaseEntity r
        where r.teamKey = :team and r.id in :ids order by r.promDate, r.id
        """)
    List<OptionRow> findSelectedOptions(String team, List<UUID> ids);

    boolean existsByTeamKeyAndPromDateAndIdNot(String teamKey, LocalDate promDate, UUID id);
}
