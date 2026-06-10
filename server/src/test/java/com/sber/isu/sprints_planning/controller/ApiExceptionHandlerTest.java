package com.sber.isu.sprints_planning.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

class ApiExceptionHandlerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
            .standaloneSetup(new FailingController())
            .setControllerAdvice(new ApiExceptionHandler())
            .build();
    }

    @Test
    void preservesResponseStatusExceptionStatusAndReason() throws Exception {
        mockMvc.perform(get("/conflict"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("Conflict reason"));
    }

    @Test
    void sanitizesUnhandledExceptions() throws Exception {
        mockMvc.perform(get("/boom"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.error").value("Внутренняя ошибка сервера"));
    }

    @Test
    void sanitizesDataIntegrityViolations() throws Exception {
        mockMvc.perform(get("/integrity"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("Операция нарушает целостность данных"));
    }

    @RestController
    private static class FailingController {

        @GetMapping("/conflict")
        String conflict() {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conflict reason");
        }

        @GetMapping("/boom")
        String boom() {
            throw new IllegalStateException("secret-db-message");
        }

        @GetMapping("/integrity")
        String integrity() {
            throw new DataIntegrityViolationException("constraint details");
        }
    }
}
