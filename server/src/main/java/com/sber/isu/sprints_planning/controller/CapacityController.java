package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.CapacityRowDto;
import com.sber.isu.sprints_planning.service.CapacityService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class CapacityController {

    private final CapacityService capacityService;

    public CapacityController(CapacityService capacityService) {
        this.capacityService = capacityService;
    }

    @GetMapping("/capacity")
    public List<CapacityRowDto> getCapacity(@PathVariable String teamKey, @RequestParam("quarterId") String quarterId) {
        return capacityService.calculate(teamKey, UUID.fromString(quarterId));
    }
}
