package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.TaskFiltersDto;
import com.sber.isu.sprints_planning.repository.TaskLookupRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class TaskFiltersService {

    private static final List<String> TASK_STATUSES = List.of(
        "inprogress",
        "done",
        "notdone",
        "canceled",
        "partial"
    );

    private final QuarterService quarterService;
    private final TaskLookupRepository taskLookupRepository;

    public TaskFiltersService(QuarterService quarterService, TaskLookupRepository taskLookupRepository) {
        this.quarterService = quarterService;
        this.taskLookupRepository = taskLookupRepository;
    }

    public TaskFiltersDto getFilters(String teamKey) {
        return new TaskFiltersDto(
            quarterService.findAll(teamKey),
            TASK_STATUSES,
            taskLookupRepository.findCustomers(teamKey),
            taskLookupRepository.findStreams(teamKey)
        );
    }
}
