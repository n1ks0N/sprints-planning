package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.CapacityRowDto;
import com.sber.isu.sprints_planning.service.CapacityService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CapacityController {

    private final CapacityService capacityService;

    public CapacityController(CapacityService capacityService) {
        this.capacityService = capacityService;
    }

    @GetMapping("/capacity")
    public List<CapacityRowDto> getCapacity(@RequestParam("quarterId") String quarterId) {
        return capacityService.calculate(UUID.fromString(quarterId));
    }
}
