package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.FiltersDto;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.TaskCustomerRepository;
import com.sber.isu.sprints_planning.repository.TaskStreamRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class FiltersService {

    private final QuarterRepository quarterRepository;
    private final ReleaseRepository releaseRepository;
    private final TaskStreamRepository taskStreamRepository;
    private final TaskCustomerRepository taskCustomerRepository;

    private static final List<String> TASK_STATUSES = List.of(
        "inprogress",
        "done",
        "notdone",
        "canceled",
        "partial",
        "backlog"
    );

    private static final List<Integer> TASK_PRIORITIES = List.of(1, 2, 3);

    public FiltersService(
        QuarterRepository quarterRepository,
        ReleaseRepository releaseRepository,
        TaskStreamRepository taskStreamRepository,
        TaskCustomerRepository taskCustomerRepository
    ) {
        this.quarterRepository = quarterRepository;
        this.releaseRepository = releaseRepository;
        this.taskStreamRepository = taskStreamRepository;
        this.taskCustomerRepository = taskCustomerRepository;
    }

    public FiltersDto getFilters(String teamKey) {
        List<FiltersDto.QuarterOption> quarters = quarterRepository.findByTeamKeyOrderByEndDateAsc(teamKey)
            .stream()
            .map(q -> new FiltersDto.QuarterOption(q.getId().toString(), q.getName()))
            .toList();

        List<FiltersDto.ReleaseOption> releases = releaseRepository.findAllByTeamKeyOrderByPromDateAsc(teamKey)
            .stream()
            .filter(r -> r.getPromDate() != null)
            .map(r -> new FiltersDto.ReleaseOption(
                r.getId().toString(),
                r.getPromDate().toString()
            ))
            .toList();

        List<String> streams = taskStreamRepository.findAllNamesByTeamKey(teamKey);
        List<String> customers = taskCustomerRepository.findAllNamesByTeamKey(teamKey);

        return new FiltersDto(
            quarters,
            TASK_STATUSES,
            TASK_PRIORITIES,
            streams,
            customers,
            releases
        );
    }
}
