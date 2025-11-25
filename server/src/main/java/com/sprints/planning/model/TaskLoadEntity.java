package com.sprints.planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "task_loads")
public class TaskLoadEntity {

    @EmbeddedId
    private TaskLoadId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("taskId")
    @JoinColumn(name = "task_id")
    private TaskEntity task;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("sprintId")
    @JoinColumn(name = "sprint_id")
    private SprintEntity sprint;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal days;

    public TaskLoadId getId() {
        return id;
    }

    public void setId(TaskLoadId id) {
        this.id = id;
    }

    public TaskEntity getTask() {
        return task;
    }

    public void setTask(TaskEntity task) {
        this.task = task;
    }

    public SprintEntity getSprint() {
        return sprint;
    }

    public void setSprint(SprintEntity sprint) {
        this.sprint = sprint;
    }

    public BigDecimal getDays() {
        return days;
    }

    public void setDays(BigDecimal days) {
        this.days = days;
    }
}
