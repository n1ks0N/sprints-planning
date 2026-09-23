package com.sber.isu.sprints_planning.repository;

import java.math.BigDecimal;
import java.util.UUID;

public interface TaskLoadValueProjection {
    UUID getSprintId();

    BigDecimal getDays();
}
