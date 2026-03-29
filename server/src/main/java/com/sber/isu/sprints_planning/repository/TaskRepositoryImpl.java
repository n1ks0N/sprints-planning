package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskCustomerEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskStreamEntity;
import com.sber.isu.sprints_planning.service.TaskFilter;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.SetJoin;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
        Predicate predicate = buildPredicate(teamKey, filter, cb, countQuery, task);
        countQuery.select(cb.count(task)).where(predicate);
        return entityManager.createQuery(countQuery).getSingleResult();
    }

    private List<UUID> findTaskIds(String teamKey, TaskFilter filter, Integer page, Integer size) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<UUID> idQuery = cb.createQuery(UUID.class);
        Root<TaskEntity> task = idQuery.from(TaskEntity.class);
        Predicate predicate = buildPredicate(teamKey, filter, cb, idQuery, task);

        Expression<?> orderValue = cb.coalesce(task.get("displayOrder"), cb.literal(Integer.MAX_VALUE));
        List<Order> ordering = new ArrayList<>();
        if (filter.pinnedTaskId() != null) {
            Expression<Integer> pinnedOrder = cb.<Integer>selectCase()
                .when(cb.equal(task.get("id"), filter.pinnedTaskId()), 0)
                .otherwise(1);
            ordering.add(cb.asc(pinnedOrder));
        }
        ordering.add(cb.asc(orderValue));
        ordering.add(cb.asc(task.get("createdAt")));

        idQuery.select(task.get("id"))
            .where(predicate)
            .orderBy(ordering);

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
        fetchCustomers(ids);
        fetchStreams(ids);
        return base;
    }

    private List<TaskEntity> fetchBaseTasks(List<UUID> ids) {
        return entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.leaderParticipant lp
                    left join fetch t.releaseDate rd
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

    private void fetchCustomers(List<UUID> ids) {
        entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.customers c
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private void fetchStreams(List<UUID> ids) {
        entityManager.createQuery(
                """
                    select distinct t from TaskEntity t
                    left join fetch t.streams s
                    where t.id in :ids
                """,
                TaskEntity.class
            )
            .setParameter("ids", ids)
            .getResultList();
    }

    private Predicate buildPredicate(
        String teamKey,
        TaskFilter filter,
        CriteriaBuilder cb,
        CriteriaQuery<?> query,
        Root<TaskEntity> task
    ) {
        List<Predicate> predicates = new ArrayList<>();
        Predicate teamPredicate = cb.equal(task.get("teamKey"), teamKey);
        predicates.add(teamPredicate);

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

        if (filter.releaseDateId() != null) {
            predicates.add(cb.equal(task.get("releaseDate").get("id"), filter.releaseDateId()));
        }

        if (!filter.streams().isEmpty() || filter.withoutStream()) {
            predicates.add(streamMatches(query, cb, task, filter.streams(), filter.withoutStream()));
        }

        if (!filter.customers().isEmpty() || filter.withoutCustomer()) {
            predicates.add(customerMatches(query, cb, task, filter.customers(), filter.withoutCustomer()));
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

        if (!filter.quarterIds().isEmpty() || filter.withoutQuarter()) {
            predicates.add(quarterMatches(query, cb, task, filter));
        }

        if (!filter.statuses().isEmpty()) {
            predicates.add(cb.lower(task.get("status")).in(filter.statuses()));
        } else {
            predicates.add(cb.or(
                cb.isNull(task.get("status")),
                cb.notEqual(cb.lower(task.get("status")), "backlog")
            ));
        }

        Predicate basePredicate = cb.and(predicates.toArray(new Predicate[0]));
        if (filter.pinnedTaskId() != null) {
            Predicate pinned = cb.and(
                teamPredicate,
                cb.equal(task.get("id"), filter.pinnedTaskId())
            );
            return cb.or(basePredicate, pinned);
        }

        return basePredicate;
    }

    private Predicate participantExists(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, Iterable<UUID> ids) {
        var sub = query.subquery(UUID.class);
        Root<TaskParticipantEntity> tp = sub.from(TaskParticipantEntity.class);
        Join<TaskParticipantEntity, ParticipantEntity> participant = tp.join("participant");

        CriteriaBuilder.In<UUID> participantIds = cb.in(tp.get("id").get("participantId"));
        ids.forEach(participantIds::value);

        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                participantIds,
                cb.equal(participant.get("teamKey"), task.get("teamKey"))
            );
        return cb.exists(sub);
    }

    private Predicate roleExists(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, Iterable<String> roles) {
        var sub = query.subquery(UUID.class);
        Root<TaskParticipantEntity> tp = sub.from(TaskParticipantEntity.class);
        CriteriaBuilder.In<String> roleFilter = cb.in(cb.lower(tp.get("participant").get("role")));
        roles.forEach(roleFilter::value);
        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                roleFilter
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
        CriteriaBuilder.In<String> streamFilter = cb.in(cb.lower(streams));
        userStreams.forEach(streamFilter::value);
        sub.select(tp.get("task").get("id"))
            .where(
                cb.equal(tp.get("task").get("id"), task.get("id")),
                streamFilter
            );
        return cb.exists(sub);
    }

    private Predicate streamExists(
        CriteriaQuery<?> query,
        CriteriaBuilder cb,
        Root<TaskEntity> task,
        Iterable<String> streamNames
    ) {
        var sub = query.subquery(UUID.class);
        Root<TaskEntity> subTask = sub.from(TaskEntity.class);
        Join<TaskEntity, TaskStreamEntity> stream = subTask.join("streams");
        CriteriaBuilder.In<String> streamFilter = cb.in(stream.get("name"));
        streamNames.forEach(streamFilter::value);
        sub.select(subTask.get("id"))
            .where(
                cb.equal(subTask.get("id"), task.get("id")),
                streamFilter
            );
        return cb.exists(sub);
    }

    private Predicate streamMissing(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task) {
        var sub = query.subquery(UUID.class);
        Root<TaskEntity> subTask = sub.from(TaskEntity.class);
        sub.select(subTask.get("id"))
            .where(
                cb.equal(subTask.get("id"), task.get("id")),
                cb.isNotEmpty(subTask.get("streams"))
            );
        return cb.not(cb.exists(sub));
    }

    private Predicate streamMatches(
        CriteriaQuery<?> query,
        CriteriaBuilder cb,
        Root<TaskEntity> task,
        Set<String> streamNames,
        boolean withoutStream
    ) {
        Predicate named = streamNames.isEmpty() ? null : streamExists(query, cb, task, streamNames);
        Predicate missing = withoutStream ? streamMissing(query, cb, task) : null;
        if (named != null && missing != null) {
            return cb.or(named, missing);
        }
        return named != null ? named : missing;
    }

    private Predicate customerExists(
        CriteriaQuery<?> query,
        CriteriaBuilder cb,
        Root<TaskEntity> task,
        Iterable<String> customerNames
    ) {
        var sub = query.subquery(UUID.class);
        Root<TaskEntity> subTask = sub.from(TaskEntity.class);
        Join<TaskEntity, TaskCustomerEntity> customer = subTask.join("customers");
        CriteriaBuilder.In<String> customerFilter = cb.in(customer.get("name"));
        customerNames.forEach(customerFilter::value);
        sub.select(subTask.get("id"))
            .where(
                cb.equal(subTask.get("id"), task.get("id")),
                customerFilter
            );
        return cb.exists(sub);
    }

    private Predicate customerMissing(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task) {
        var sub = query.subquery(UUID.class);
        Root<TaskEntity> subTask = sub.from(TaskEntity.class);
        sub.select(subTask.get("id"))
            .where(
                cb.equal(subTask.get("id"), task.get("id")),
                cb.isNotEmpty(subTask.get("customers"))
            );
        return cb.not(cb.exists(sub));
    }

    private Predicate customerMatches(
        CriteriaQuery<?> query,
        CriteriaBuilder cb,
        Root<TaskEntity> task,
        Set<String> customerNames,
        boolean withoutCustomer
    ) {
        Predicate named = customerNames.isEmpty() ? null : customerExists(query, cb, task, customerNames);
        Predicate missing = withoutCustomer ? customerMissing(query, cb, task) : null;
        if (named != null && missing != null) {
            return cb.or(named, missing);
        }
        return named != null ? named : missing;
    }

    private Predicate quarterMatches(CriteriaQuery<?> query, CriteriaBuilder cb, Root<TaskEntity> task, TaskFilter filter) {
        var loadInQuarterSub = query.subquery(UUID.class);
        Root<TaskLoadEntity> loadInQuarter = loadInQuarterSub.from(TaskLoadEntity.class);
        loadInQuarterSub.select(loadInQuarter.get("task").get("id"))
            .where(
                cb.equal(loadInQuarter.get("task").get("id"), task.get("id")),
                loadInQuarter.get("sprint").get("quarter").get("id").in(filter.quarterIds()),
                cb.greaterThan(cb.coalesce(loadInQuarter.get("days"), BigDecimal.ZERO), BigDecimal.ZERO)
            );

        var allocationInQuarterSub = query.subquery(UUID.class);
        Root<TaskAllocationEntity> allocationInQuarter = allocationInQuarterSub.from(TaskAllocationEntity.class);
        allocationInQuarterSub.select(allocationInQuarter.get("task").get("id"))
            .where(
                cb.equal(allocationInQuarter.get("task").get("id"), task.get("id")),
                allocationInQuarter.get("sprint").get("quarter").get("id").in(filter.quarterIds()),
                cb.greaterThan(cb.coalesce(allocationInQuarter.get("days"), BigDecimal.ZERO), BigDecimal.ZERO)
            );

        Predicate hasPositiveWorkInSelectedQuarter = cb.or(
            cb.exists(loadInQuarterSub),
            cb.exists(allocationInQuarterSub)
        );

        var loadAnywhereSub = query.subquery(UUID.class);
        Root<TaskLoadEntity> loadAnywhere = loadAnywhereSub.from(TaskLoadEntity.class);
        loadAnywhereSub.select(loadAnywhere.get("task").get("id"))
            .where(
                cb.equal(loadAnywhere.get("task").get("id"), task.get("id")),
                cb.greaterThan(cb.coalesce(loadAnywhere.get("days"), BigDecimal.ZERO), BigDecimal.ZERO)
            );

        var allocationAnywhereSub = query.subquery(UUID.class);
        Root<TaskAllocationEntity> allocationAnywhere = allocationAnywhereSub.from(TaskAllocationEntity.class);
        allocationAnywhereSub.select(allocationAnywhere.get("task").get("id"))
            .where(
                cb.equal(allocationAnywhere.get("task").get("id"), task.get("id")),
                cb.greaterThan(cb.coalesce(allocationAnywhere.get("days"), BigDecimal.ZERO), BigDecimal.ZERO)
            );

        Predicate hasNoPositiveWorkAnywhere = cb.and(
            cb.not(cb.exists(loadAnywhereSub)),
            cb.not(cb.exists(allocationAnywhereSub))
        );

        List<Predicate> matches = new ArrayList<>();
        if (!filter.quarterIds().isEmpty()) {
            Join<TaskEntity, ?> initialQuarter = task.join("initialQuarter", JoinType.LEFT);
            matches.add(hasPositiveWorkInSelectedQuarter);
            matches.add(cb.and(
                hasNoPositiveWorkAnywhere,
                initialQuarter.get("id").in(filter.quarterIds())
            ));
        }
        if (filter.withoutQuarter()) {
            matches.add(cb.and(
                hasNoPositiveWorkAnywhere,
                cb.isNull(task.get("initialQuarter"))
            ));
        }
        return cb.or(matches.toArray(new Predicate[0]));
    }
}
