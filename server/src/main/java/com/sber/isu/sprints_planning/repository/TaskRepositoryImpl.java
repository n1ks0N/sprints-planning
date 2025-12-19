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
import java.util.List;
import java.util.Objects;
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

        SetJoin<TaskEntity, TaskParticipantEntity> participantLinks = task.joinSet("participants", JoinType.LEFT);
        Join<TaskParticipantEntity, ParticipantEntity> participant = participantLinks.join("participant", JoinType.LEFT);
        SetJoin<ParticipantEntity, String> userStreams = participant.joinSet("userStreams", JoinType.LEFT);

        SetJoin<TaskEntity, TaskLoadEntity> loads = task.joinSet("loads", JoinType.LEFT);
        Join<TaskLoadEntity, SprintEntity> loadSprint = loads.join("sprint", JoinType.LEFT);
        Join<SprintEntity, QuarterEntity> loadQuarter = loadSprint.join("quarter", JoinType.LEFT);

        SetJoin<TaskEntity, TaskAllocationEntity> allocations = task.joinSet("allocations", JoinType.LEFT);
        Join<TaskAllocationEntity, SprintEntity> allocationSprint = allocations.join("sprint", JoinType.LEFT);
        Join<SprintEntity, QuarterEntity> allocationQuarter = allocationSprint.join("quarter", JoinType.LEFT);

        applyFetches(task);

        List<Predicate> predicates = new ArrayList<>();
        predicates.add(cb.equal(task.get("teamKey"), teamKey));

        if (!effectiveFilter.participantIds().isEmpty()) {
            predicates.add(participant.get("id").in(effectiveFilter.participantIds()));
        }

        if (!effectiveFilter.roles().isEmpty()) {
            predicates.add(cb.lower(participant.get("role")).in(effectiveFilter.roles()));
        }

        if (!effectiveFilter.userStreams().isEmpty()) {
            predicates.add(cb.lower(userStreams).in(effectiveFilter.userStreams()));
        }

        if (!effectiveFilter.priorities().isEmpty()) {
            predicates.add(task.get("priority").in(effectiveFilter.priorities()));
        }

        if (effectiveFilter.releaseDate() != null) {
            predicates.add(cb.equal(task.get("releaseDate"), effectiveFilter.releaseDate()));
        }

        if (effectiveFilter.stream() != null) {
            predicates.add(cb.like(cb.lower(task.get("stream")), "%" + effectiveFilter.stream() + "%"));
        }

        if (effectiveFilter.searchQuery() != null) {
            String like = "%" + effectiveFilter.searchQuery() + "%";
            predicates.add(cb.or(
                cb.like(cb.lower(task.get("title")), like),
                cb.like(cb.lower(task.get("description")), like),
                cb.like(cb.lower(task.get("dod")), like)
            ));
        }

        if (!effectiveFilter.quarterIds().isEmpty()) {
            Predicate loadMatches = cb.and(
                loadQuarter.get("id").in(effectiveFilter.quarterIds()),
                cb.greaterThan(cb.coalesce(loads.get("days"), BigDecimal.ZERO), BigDecimal.ZERO)
            );
            Predicate allocationMatches = allocationQuarter.get("id").in(effectiveFilter.quarterIds());
            predicates.add(cb.or(loadMatches, allocationMatches));
        }

        if (!effectiveFilter.statuses().isEmpty()) {
            predicates.add(cb.lower(task.get("status")).in(effectiveFilter.statuses()));
        }

        cq.select(task).distinct(true).where(predicates.toArray(new Predicate[0])).orderBy(cb.asc(task.get("displayOrder")));
        TypedQuery<TaskEntity> query = entityManager.createQuery(cq);
        return query.getResultList();
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
}
