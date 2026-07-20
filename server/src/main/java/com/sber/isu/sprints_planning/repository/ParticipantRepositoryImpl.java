package com.sber.isu.sprints_planning.repository;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.service.TaskFilter;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.SetJoin;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

@Repository
public class ParticipantRepositoryImpl implements ParticipantRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public Page<ParticipantEntity> findWorkloadPage(String teamKey, TaskFilter filter, int page, int size) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<ParticipantEntity> query = cb.createQuery(ParticipantEntity.class);
        Root<ParticipantEntity> participant = query.from(ParticipantEntity.class);
        query.select(participant)
            .where(buildPredicate(teamKey, filter, cb, query, participant))
            .orderBy(
                cb.asc(participant.get("displayOrder")),
                cb.asc(participant.get("fullName")),
                cb.asc(participant.get("id"))
            );

        List<ParticipantEntity> content = entityManager.createQuery(query)
            .setFirstResult(Math.max(page, 0) * Math.max(size, 1))
            .setMaxResults(Math.max(size, 1))
            .getResultList();

        return new PageImpl<>(
            content,
            PageRequest.of(Math.max(page, 0), Math.max(size, 1)),
            count(teamKey, filter)
        );
    }

    private long count(String teamKey, TaskFilter filter) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Long> query = cb.createQuery(Long.class);
        Root<ParticipantEntity> participant = query.from(ParticipantEntity.class);
        query.select(cb.count(participant))
            .where(buildPredicate(teamKey, filter, cb, query, participant));
        return entityManager.createQuery(query).getSingleResult();
    }

    private Predicate buildPredicate(
        String teamKey,
        TaskFilter filter,
        CriteriaBuilder cb,
        CriteriaQuery<?> query,
        Root<ParticipantEntity> participant
    ) {
        List<Predicate> predicates = new ArrayList<>();
        predicates.add(cb.equal(participant.get("teamKey"), teamKey));

        if (!filter.participantIds().isEmpty()) {
            predicates.add(participant.get("id").in(filter.participantIds()));
        }
        if (!filter.roles().isEmpty()) {
            predicates.add(cb.lower(participant.get("role")).in(filter.roles()));
        }
        if (!filter.userStreams().isEmpty()) {
            predicates.add(userStreamExists(filter, cb, query, participant));
        }

        return cb.and(predicates.toArray(new Predicate[0]));
    }

    private Predicate userStreamExists(
        TaskFilter filter,
        CriteriaBuilder cb,
        CriteriaQuery<?> query,
        Root<ParticipantEntity> participant
    ) {
        var sub = query.subquery(String.class);
        Root<ParticipantEntity> subParticipant = sub.from(ParticipantEntity.class);
        SetJoin<ParticipantEntity, String> stream = subParticipant.joinSet("userStreams");
        sub.select(stream)
            .where(
                cb.equal(subParticipant.get("id"), participant.get("id")),
                cb.lower(stream).in(filter.userStreams())
            );
        return cb.exists(sub);
    }
}
