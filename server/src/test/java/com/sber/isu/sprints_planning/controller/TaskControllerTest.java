package com.sber.isu.sprints_planning.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.service.TaskService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(value = TaskController.class, properties = "server.servlet.context-path=/api")
@AutoConfigureMockMvc
class TaskControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TaskService taskService;

    @Test
    void patchUpdatesTask() throws Exception {
        String id = "3d081c00-7057-4a40-bee2-d35c61ed806b";
        TaskDto response = new TaskDto(
            id,
            "Updated",
            "",
            "",
            (short) 2,
            "",
            "",
            List.of(),
            Map.of(),
            Map.of(),
            Map.of(),
            null,
            null,
            null,
            "2025-11-29",
            "2025-11-29"
        );
        given(taskService.update(eq(java.util.UUID.fromString(id)), any(TaskUpdateRequest.class)))
            .willReturn(response);

        mockMvc.perform(patch("/api/tasks/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Updated\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.title").value("Updated"));
    }
}
