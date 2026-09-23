package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record TaskAllocationsSetRequest(
    @NotEmpty List<@Valid TaskAllocationChangeRequest> changes
) {
}
