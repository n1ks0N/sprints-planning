package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.service.TaskFilter;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Fetch;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.SetJoin;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

@Repository
public class TaskRepositoryImpl implements TaskRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public List<TaskEntity> findFilteredWithDetails(String teamKey, TaskFilter filter) {
        TaskFilter effectiveFilter = Objects.requireNonNullElseGet(filter, TaskFilter::empty);
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<TaskEntity> cq = cb.createQuery(TaskEntity.class);
        Root<TaskEntity> task = cq.from(TaskEntity.class);
        Joins joins = createJoins(task);
        applyFetches(task);
        List<Predicate> predicates = buildPredicates(teamKey, effectiveFilter, cb, joins);

        cq.select(task).distinct(true).where(predicates.toArray(new Predicate[0])).orderBy(cb.asc(task.get("displayOrder")));
        TypedQuery<TaskEntity> query = entityManager.createQuery(cq);
        return query.getResultList();
    }

    @Override
    public Page<TaskEntity> findFilteredPageWithDetails(String teamKey, TaskFilter filter, int page, int size) {
        TaskFilter effectiveFilter = Objects.requireNonNullElseGet(filter, TaskFilter::empty);
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();

        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<TaskEntity> countRoot = countQuery.from(TaskEntity.class);
        Joins countJoins = createJoins(countRoot);
        List<Predicate> countPredicates = buildPredicates(teamKey, effectiveFilter, cb, countJoins);
        countQuery.select(cb.countDistinct(countRoot)).where(countPredicates.toArray(new Predicate[0]));
        long total = entityManager.createQuery(countQuery).getSingleResult();

        Pageable pageable = Pageable.ofSize(size).withPage(page);
        if (total == 0) {
            return new PageImpl<>(List.of(), pageable, total);
        }

        CriteriaQuery<Object[]> idQuery = cb.createQuery(Object[].class);
        Root<TaskEntity> idRoot = idQuery.from(TaskEntity.class);
        Joins idJoins = createJoins(idRoot);
        List<Predicate> idPredicates = buildPredicates(teamKey, effectiveFilter, cb, idJoins);
        idQuery.multiselect(idRoot.get("id"), idRoot.get("displayOrder"))
            .where(idPredicates.toArray(new Predicate[0]))
            .groupBy(idRoot.get("id"), idRoot.get("displayOrder"))
            .orderBy(cb.asc(idRoot.get("displayOrder")));
        TypedQuery<Object[]> pagedIds = entityManager.createQuery(idQuery);
        pagedIds.setFirstResult(Math.max(page, 0) * Math.max(size, 1));
        pagedIds.setMaxResults(Math.max(size, 1));
        List<UUID> ids = pagedIds.getResultList().stream()
            .map(row -> (UUID) row[0])
            .toList();

        if (ids.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, total);
        }

        CriteriaQuery<TaskEntity> dataQuery = cb.createQuery(TaskEntity.class);
        Root<TaskEntity> dataRoot = dataQuery.from(TaskEntity.class);
        applyFetches(dataRoot);
        Joins dataJoins = createJoins(dataRoot);
        List<Predicate> dataPredicates = buildPredicates(teamKey, effectiveFilter, cb, dataJoins);
        dataPredicates.add(dataRoot.get("id").in(ids));
        dataQuery.select(dataRoot)
            .distinct(true)
            .where(dataPredicates.toArray(new Predicate[0]))
            .orderBy(cb.asc(dataRoot.get("displayOrder")));

        List<TaskEntity> results = entityManager.createQuery(dataQuery).getResultList();
        results.sort(Comparator.comparingInt(TaskEntity::getDisplayOrder));
        return new PageImpl<>(results, pageable, total);
    }

    private void applyFetches(Root<TaskEntity> task) {
        Fetch<TaskEntity, TaskParticipantEntity> participantFetch = task.fetch("participants", JoinType.LEFT);
        Fetch<TaskParticipantEntity, ParticipantEntity> participantEntityFetch = participantFetch.fetch("participant", JoinType.LEFT);
        participantEntityFetch.fetch("userStreams", JoinType.LEFT);

        Fetch<TaskEntity, TaskLoadEntity> loadFetch = task.fetch("loads", JoinType.LEFT);
        loadFetch.fetch("sprint", JoinType.LEFT);

        Fetch<TaskEntity, TaskAllocationEntity> allocationFetch = task.fetch("allocations", JoinType.LEFT);
        allocationFetch.fetch("participant", JoinType.LEFT);
        allocationFetch.fetch("sprint", JoinType.LEFT);

        task.fetch("leaderParticipant", JoinType.LEFT);
        task.fetch("releaseSprint", JoinType.LEFT);
    }

    private Joins createJoins(Root<TaskEntity> task) {
        SetJoin<TaskEntity, TaskParticipantEntity> participantLinks = task.joinSet("participants", JoinType.LEFT);
        Join<TaskParticipantEntity, ParticipantEntity> participant = participantLinks.join("participant", JoinType.LEFT);
        SetJoin<ParticipantEntity, String> userStreams = participant.joinSet("userStreams", JoinType.LEFT);

        SetJoin<TaskEntity, TaskLoadEntity> loads = task.joinSet("loads", JoinType.LEFT);
        Join<TaskLoadEntity, SprintEntity> loadSprint = loads.join("sprint", JoinType.LEFT);
        Join<SprintEntity, QuarterEntity> loadQuarter = loadSprint.join("quarter", JoinType.LEFT);

        SetJoin<TaskEntity, TaskAllocationEntity> allocations = task.joinSet("allocations", JoinType.LEFT);
        Join<TaskAllocationEntity, SprintEntity> allocationSprint = allocations.join("sprint", JoinType.LEFT);
        Join<SprintEntity, QuarterEntity> allocationQuarter = allocationSprint.join("quarter", JoinType.LEFT);

        return new Joins(task, participantLinks, participant, userStreams, loads, loadSprint, loadQuarter, allocations, allocationSprint, allocationQuarter);
    }

    private List<Predicate> buildPredicates(String teamKey, TaskFilter effectiveFilter, CriteriaBuilder cb, Joins joins) {
        List<Predicate> predicates = new ArrayList<>();
        predicates.add(cb.equal(joins.task().get("teamKey"), teamKey));

        if (!effectiveFilter.participantIds().isEmpty()) {
            predicates.add(joins.participant().get("id").in(effectiveFilter.participantIds()));
        }

        if (!effectiveFilter.roles().isEmpty()) {
            predicates.add(cb.lower(joins.participant().get("role")).in(effectiveFilter.roles()));
        }

        if (!effectiveFilter.userStreams().isEmpty()) {
            predicates.add(cb.lower(joins.userStreams()).in(effectiveFilter.userStreams()));
        }

        if (!effectiveFilter.priorities().isEmpty()) {
            predicates.add(joins.task().get("priority").in(effectiveFilter.priorities()));
        }

        if (effectiveFilter.releaseDate() != null) {
            predicates.add(cb.equal(joins.task().get("releaseDate"), effectiveFilter.releaseDate()));
        }

        if (effectiveFilter.stream() != null) {
            predicates.add(cb.like(cb.lower(joins.task().get("stream")), "%" + effectiveFilter.stream() + "%"));
        }

        if (effectiveFilter.searchQuery() != null) {
            String like = "%" + effectiveFilter.searchQuery() + "%";
            predicates.add(cb.or(
                cb.like(cb.lower(joins.task().get("title")), like),
                cb.like(cb.lower(joins.task().get("description")), like),
                cb.like(cb.lower(joins.task().get("dod")), like)
            ));
        }

        if (!effectiveFilter.quarterIds().isEmpty()) {
            Predicate loadMatches = cb.and(
                joins.loadQuarter().get("id").in(effectiveFilter.quarterIds()),
                cb.greaterThan(cb.coalesce(joins.loads().get("days"), BigDecimal.ZERO), BigDecimal.ZERO)
            );
            Predicate allocationMatches = joins.allocationQuarter().get("id").in(effectiveFilter.quarterIds());
            predicates.add(cb.or(loadMatches, allocationMatches));
        }

        if (!effectiveFilter.statuses().isEmpty()) {
            predicates.add(cb.lower(joins.task().get("status")).in(effectiveFilter.statuses()));
        }

        return predicates;
    }

    private record Joins(
        Root<TaskEntity> task,
        SetJoin<TaskEntity, TaskParticipantEntity> participantLinks,
        Join<TaskParticipantEntity, ParticipantEntity> participant,
        SetJoin<ParticipantEntity, String> userStreams,
        SetJoin<TaskEntity, TaskLoadEntity> loads,
        Join<TaskLoadEntity, SprintEntity> loadSprint,
        Join<SprintEntity, QuarterEntity> loadQuarter,
        SetJoin<TaskEntity, TaskAllocationEntity> allocations,
        Join<TaskAllocationEntity, SprintEntity> allocationSprint,
        Join<SprintEntity, QuarterEntity> allocationQuarter
    ) {
    }
}
