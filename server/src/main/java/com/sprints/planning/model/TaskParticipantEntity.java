package com.sprints.planning.model;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import jakarta.persistence.Column;

@Entity
@Table(name = "task_participants")
public class TaskParticipantEntity {

    @EmbeddedId
    private TaskParticipantId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("taskId")
    @JoinColumn(name = "task_id")
    private TaskEntity task;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("participantId")
    @JoinColumn(name = "participant_id")
    private ParticipantEntity participant;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    public TaskParticipantId getId() {
        return id;
    }

    public void setId(TaskParticipantId id) {
        this.id = id;
    }

    public TaskEntity getTask() {
        return task;
    }

    public void setTask(TaskEntity task) {
        this.task = task;
    }

    public ParticipantEntity getParticipant() {
        return participant;
    }

    public void setParticipant(ParticipantEntity participant) {
        this.participant = participant;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
