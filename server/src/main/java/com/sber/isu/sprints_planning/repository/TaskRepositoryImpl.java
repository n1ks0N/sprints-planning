package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
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
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.SetJoin;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
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
        List<UUID> ids = findTaskIds(teamKey, effectiveFilter, null, null);
        if (ids.isEmpty()) {
            return List.of();
        }
        List<TaskEntity> tasks = loadDetails(ids);
        Map<UUID, TaskEntity> byId = tasks.stream()
            .collect(Collectors.toMap(TaskEntity::getId, Function.identity()));
        return ids.stream()
            .map(byId::get)
            .filter(Objects::nonNull)
            .toList();
    }

    @Override
    public Page<TaskEntity> findFilteredPageWithDetails(String teamKey, TaskFilter filter, int page, int size) {
        TaskFilter effectiveFilter = Objects.requireNonNullElseGet(filter, TaskFilter::empty);
        Pageable pageable = Pageable.ofSize(size).withPage(page);

        long total = countTasks(teamKey, effectiveFilter);
        if (total == 0) {
            return new PageImpl<>(List.of(), pageable, total);
        }

        List<UUID> ids = findTaskIds(teamKey, effectiveFilter, page, size);
        if (ids.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, total);
        }

        List<TaskEntity> tasks = loadDetails(ids);
        Map<UUID, TaskEntity> byId = tasks.stream()
            .collect(Collectors.toMap(TaskEntity::getId, Function.identity()));
        List<TaskEntity> ordered = ids.stream()
            .map(byId::get)
            .filter(Objects::nonNull)
            .toList();

        return new PageImpl<>(ordered, pageable, total);
    }

    private long countTasks(String teamKey, TaskFilter filter) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<TaskEntity> task = countQuery.from(TaskEntity.class);
        List<Predicate> predicates = buildPredicates(teamKey, filter, cb, countQuery, task);
        countQuery.select(cb.count(task)).where(predicates.toArray(new Predicate[0]));
        return entityManager.createQuery(countQuery).getSingleResult();
    }

    private List<UUID> findTaskIds(String teamKey, TaskFilter filter, Integer page, Integer size) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<UUID> idQuery = cb.createQuery(UUID.class);
        Root<TaskEntity> task = idQuery.from(TaskEntity.class);
        List<Predicate> predicates = buildPredicates(teamKey, filter, cb, idQuery, task);

        Expression<?> orderValue = cb.coalesce(task.get("displayOrder"), cb.literal(Integer.MAX_VALUE));
        idQuery.select(task.get("id"))
            .where(predicates.toArray(new Predicate[0]))
            .orderBy(cb.asc(orderValue), cb.asc(task.get("createdAt")));

        TypedQuery<UUID> query = entityManager.createQuery(idQuery);
        if (page != null && size != null) {
            int safePage = Math.max(page, 0);
            int safeSize = Math.max(size, 1);
            query.setFirstResult(safePage * safeSize);
            query.setMaxResults(safeSize);
        }
        return query.getResultList();
    }

    private List<TaskEntity> loadDetails(List<UUID> ids) {
        List<TaskEntity> base = fetchBaseTasks(ids);
        if (base.isEmpty()) {
            return base;
        }
        fetchParticipants(ids);
        fetchAllocations(ids);
        fetchLoads(ids);
        return base;
    }

    private List<TaskEntity> fetchBaseTasks(List<UUID> ids) {
        return entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.leaderParticipant lp
                    left join fetch t.releaseSprint rs
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private void fetchParticipants(List<UUID> ids) {
        entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.participants tp
                    left join fetch tp.participant p
                    left join fetch p.userStreams
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private void fetchAllocations(List<UUID> ids) {
        entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.allocations a
                    left join fetch a.sprint s
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private void fetchLoads(List<UUID> ids) {
        entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.loads l
                    left join fetch l.sprint s
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private List<Predicate> buildPredicates(
        String teamKey,
        TaskFilter filter,
        CriteriaBuilder cb,
        CriteriaQuery<?> query,
        Root<TaskEntity> task
    ) {
        List<Predicate> predicates = new ArrayList<>();
        predicates.add(cb.equal(task.get("teamKey"), teamKey));

        if (!filter.participantIds().isEmpty()) {
            predicates.add(participantExists(query, cb, task, filter.participantIds()));
        }

        if (!filter.roles().isEmpty()) {
            predicates.add(roleExists(query, cb, task, filter.roles()));
        }

        if (!filter.userStreams().isEmpty()) {
            predicates.add(userStreamExists(query, cb, task, filter.userStreams()));
        }

        if (!filter.priorities().isEmpty()) {
            predicates.add(task.get("priority").in(filter.priorities()));
        }

        if (filter.releaseDate() != null) {
            predicates.add(cb.equal(task.get("releaseDate"), filter.releaseDate()));
        }

        if (filter.stream() != null) {
            predicates.add(cb.like(cb.lower(task.get("stream")), "%" + filter.stream() + "%"));
        }

        if (filter.searchQuery() != null) {
            String like = "%" + filter.searchQuery() + "%";
            predicates.add(cb.or(
                cb.like(cb.lower(task.get("title")), like),
                cb.like(cb.lower(task.get("description")), like),
                cb.like(cb.lower(task.get("dod")), like),
                cb.like(cb.lower(task.get("customer")), like),
                cb.like(cb.lower(task.get("stream")), like)
            ));
        }

        if (!filter.quarterIds().isEmpty()) {
            predicates.add(quarterMatches(query, cb, task, filter));
        }

        if (!filter.statuses().isEmpty()) {
            predicates.add(cb.lower(task.get("status")).in(filter.statuses()));
        }

        return predicates;
    }

    private Predicate participantExists(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, Iterable<UUID> ids) {
        var sub = query.subquery(UUID.class);
        Root<TaskParticipantEntity> tp = sub.from(TaskParticipantEntity.class);
        Join<TaskParticipantEntity, ParticipantEntity> participant = tp.join("participant");
        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                participant.get("id").in(ids)
            );
        return cb.exists(sub);
    }

    private Predicate roleExists(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, Iterable<String> roles) {
        var sub = query.subquery(UUID.class);
        Root<TaskParticipantEntity> tp = sub.from(TaskParticipantEntity.class);
        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                cb.lower(tp.get("participant").get("role")).in(roles)
            );
        return cb.exists(sub);
    }

    private Predicate userStreamExists(
        CriteriaQuery<?> query,
        CriteriaBuilder cb,
        Root<TaskEntity> task,
        Iterable<String> userStreams
    ) {
        var sub = query.subquery(UUID.class);
        Root<TaskParticipantEntity> tp = sub.from(TaskParticipantEntity.class);
        Join<TaskParticipantEntity, ParticipantEntity> participant = tp.join("participant");
        SetJoin<ParticipantEntity, String> streams = participant.joinSet("userStreams");
        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                cb.lower(streams).in(userStreams)
            );
        return cb.exists(sub);
    }

    private Predicate quarterMatches(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, TaskFilter filter) {
        var loadSub = query.subquery(UUID.class);
        Root<TaskLoadEntity> load = loadSub.from(TaskLoadEntity.class);
        loadSub.select(load.get("task").get("id"))
            .where(
                cb.equal(load.get("task").get("id"), task.get("id")),
                load.get("sprint").get("quarter").get("id").in(filter.quarterIds()),
                cb.greaterThan(cb.coalesce(load.get("days"), BigDecimal.ZERO), BigDecimal.ZERO)
            );

        var allocationSub = query.subquery(UUID.class);
        Root<TaskAllocationEntity> allocation = allocationSub.from(TaskAllocationEntity.class);
        allocationSub.select(allocation.get("task").get("id"))
            .where(
                cb.equal(allocation.get("task").get("id"), task.get("id")),
                allocation.get("sprint").get("quarter").get("id").in(filter.quarterIds())
            );

        return cb.or(cb.exists(loadSub), cb.exists(allocationSub));
    }
}
