package com.sprints.planning.service;

import com.sprints.planning.dto.CapacityRowDto;
import com.sprints.planning.dto.ParticipantDto;
import com.sprints.planning.dto.QuarterDto;
import com.sprints.planning.dto.ReleaseDto;
import com.sprints.planning.dto.SprintDto;
import com.sprints.planning.dto.TaskDto;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

@Service
public class ExportService {

    private final QuarterService quarterService;
    private final SprintService sprintService;
    private final ParticipantService participantService;
    private final TaskService taskService;
    private final ReleaseService releaseService;
    private final CapacityService capacityService;

    public ExportService(QuarterService quarterService,
        SprintService sprintService,
        ParticipantService participantService,
        TaskService taskService,
        ReleaseService releaseService,
        CapacityService capacityService) {
        this.quarterService = quarterService;
        this.sprintService = sprintService;
        this.participantService = participantService;
        this.taskService = taskService;
        this.releaseService = releaseService;
        this.capacityService = capacityService;
    }

    public byte[] exportExcel() {
        List<QuarterDto> quarters = quarterService.findAll();
        List<SprintDto> sprints = sprintService.findAll(null);
        List<ParticipantDto> participants = participantService.findAll();
        List<TaskDto> tasks = taskService.findAll(null);
        List<ReleaseDto> releases = releaseService.findAll();

        Map<String, SprintDto> sprintById = sprints.stream()
            .collect(Collectors.toMap(SprintDto::id, s -> s));
        Map<String, ParticipantDto> participantById = participants.stream()
            .collect(Collectors.toMap(ParticipantDto::id, p -> p));

        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            CellStyle headerStyle = createHeaderStyle(workbook);

            writeTimeSheet(workbook, headerStyle, quarters, sprints);
            writeTeamSheet(workbook, headerStyle, participants);
            writeBacklogSheet(workbook, headerStyle, tasks, sprintById, participantById);
            writeParticipantWorkloadSheet(workbook, headerStyle, tasks, sprintById, participantById);
            writeCapacitySheet(workbook, headerStyle, quarters, sprintById);
            writeReleasesSheet(workbook, headerStyle, releases);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            workbook.write(baos);
            return baos.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to build Excel export", e);
        }
    }

    private void writeTimeSheet(XSSFWorkbook workbook, CellStyle headerStyle, List<QuarterDto> quarters,
        List<SprintDto> sprints) {
        XSSFSheet sheet = workbook.createSheet(safeSheetName("Кварталы/Спринты"));
        int rowIdx = 0;

        Row quartersTitle = sheet.createRow(rowIdx++);
        quartersTitle.createCell(0).setCellValue("Кварталы");
        rowIdx = writeHeaderRow(sheet, rowIdx, headerStyle, "Название", "Год", "Квартал", "Начало", "Конец");
        for (QuarterDto q : quarters) {
            Row row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(q.name());
            row.createCell(1).setCellValue(q.year());
            row.createCell(2).setCellValue(q.number());
            row.createCell(3).setCellValue(q.startDate());
            row.createCell(4).setCellValue(q.endDate());
        }

        rowIdx += 1;
        Row sprintsTitle = sheet.createRow(rowIdx++);
        sprintsTitle.createCell(0).setCellValue("Спринты");
        rowIdx = writeHeaderRow(sheet, rowIdx, headerStyle, "Название", "Квартал", "Начало", "Конец", "Раб. дней", "Порядок");
        for (SprintDto sprint : sprints) {
            Row row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(sprint.name());
            row.createCell(1).setCellValue(sprint.quarterId());
            row.createCell(2).setCellValue(sprint.startDate());
            row.createCell(3).setCellValue(sprint.endDate());
            row.createCell(4).setCellValue(sprint.workingDays());
            row.createCell(5).setCellValue(sprint.order());
        }

        autoSize(sheet, 6);
    }

    private void writeTeamSheet(XSSFWorkbook workbook, CellStyle headerStyle, List<ParticipantDto> participants) {
        XSSFSheet sheet = workbook.createSheet(safeSheetName("Участники"));
        int rowIdx = writeHeaderRow(sheet, 0, headerStyle, "ФИО", "Роль", "Ставка");
        for (ParticipantDto participant : participants) {
            Row row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(participant.fullName());
            row.createCell(1).setCellValue(nullToEmpty(participant.role()));
            row.createCell(2).setCellValue(participant.rate());
        }
        autoSize(sheet, 3);
    }

    private void writeBacklogSheet(XSSFWorkbook workbook, CellStyle headerStyle, List<TaskDto> tasks,
        Map<String, SprintDto> sprintById, Map<String, ParticipantDto> participantById) {
        XSSFSheet sheet = workbook.createSheet(safeSheetName("Бэклог"));
        int rowIdx = writeHeaderRow(sheet, 0, headerStyle,
            "Название",
            "Приоритет",
            "Заказчик",
            "Стрим",
            "Участники",
            "Лидер",
            "ПРОМ",
            "Спринт релиза",
            "Нагрузка по спринтам",
            "Распределение по участникам");

        List<SprintDto> sortedSprints = sprintById.values().stream()
            .sorted(Comparator.comparing(SprintDto::startDate))
            .toList();

        for (TaskDto task : tasks) {
            Row row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(task.title());
            row.createCell(1).setCellValue(task.priority());
            row.createCell(2).setCellValue(nullToEmpty(task.customer()));
            row.createCell(3).setCellValue(nullToEmpty(task.stream()));
            row.createCell(4).setCellValue(renderParticipants(task.participantIds(), participantById));
            row.createCell(5).setCellValue(renderParticipant(task.leaderId(), participantById));
            row.createCell(6).setCellValue(nullToEmpty(task.releaseDate()));
            row.createCell(7).setCellValue(renderSprint(task.releaseSprintId(), sprintById));
            row.createCell(8).setCellValue(renderLoads(task.loads(), sortedSprints));
            row.createCell(9).setCellValue(renderAllocations(task.allocations(), participantById, sprintById));
        }

        autoSize(sheet, 10);
    }

    private void writeParticipantWorkloadSheet(XSSFWorkbook workbook, CellStyle headerStyle, List<TaskDto> tasks,
        Map<String, SprintDto> sprintById, Map<String, ParticipantDto> participantById) {
        XSSFSheet sheet = workbook.createSheet(safeSheetName("По сотрудникам"));
        int rowIdx = writeHeaderRow(sheet, 0, headerStyle,
            "Участник",
            "Роль",
            "Спринт",
            "Даты",
            "Задача",
            "Приоритет",
            "Стрим",
            "Заказчик",
            "Дней");

        for (TaskDto task : tasks) {
            if (task.allocations() == null) {
                continue;
            }
            for (Map.Entry<String, Map<String, Integer>> participantAlloc : task.allocations().entrySet()) {
                ParticipantDto participant = participantById.get(participantAlloc.getKey());
                String participantName = renderParticipant(participantAlloc.getKey(), participantById);
                String participantRole = participant != null ? nullToEmpty(participant.role()) : "";
                for (Map.Entry<String, Integer> sprintAlloc : participantAlloc.getValue().entrySet()) {
                    int days = Optional.ofNullable(sprintAlloc.getValue()).orElse(0);
                    if (days <= 0) {
                        continue;
                    }
                    SprintDto sprint = sprintById.get(sprintAlloc.getKey());
                    Row row = sheet.createRow(rowIdx++);
                    row.createCell(0).setCellValue(participantName);
                    row.createCell(1).setCellValue(participantRole);
                    row.createCell(2).setCellValue(renderSprint(sprintAlloc.getKey(), sprintById));
                    row.createCell(3).setCellValue(sprint != null
                        ? sprint.startDate() + " → " + sprint.endDate()
                        : "");
                    row.createCell(4).setCellValue(task.title());
                    row.createCell(5).setCellValue(task.priority());
                    row.createCell(6).setCellValue(nullToEmpty(task.stream()));
                    row.createCell(7).setCellValue(nullToEmpty(task.customer()));
                    row.createCell(8).setCellValue(days);
                }
            }
        }

        autoSize(sheet, 9);
    }

    private void writeCapacitySheet(XSSFWorkbook workbook, CellStyle headerStyle, List<QuarterDto> quarters,
        Map<String, SprintDto> sprintById) {
        XSSFSheet sheet = workbook.createSheet(safeSheetName("Нагрузка"));
        int rowIdx = writeHeaderRow(sheet, 0, headerStyle,
            "Квартал",
            "Участник",
            "Роль",
            "Спринт",
            "Раб. дней",
            "Ставка",
            "Норм. фактор",
            "Базовая ёмкость",
            "RUN",
            "Отпуск (норм.)",
            "Доступно",
            "Итого по кварталу");

        for (QuarterDto quarter : quarters) {
            List<CapacityRowDto> rows = capacityService.calculate(java.util.UUID.fromString(quarter.id()));
            for (CapacityRowDto capacityRow : rows) {
                for (var cell : capacityRow.cells()) {
                    Row row = sheet.createRow(rowIdx++);
                    row.createCell(0).setCellValue(quarter.name());
                    row.createCell(1).setCellValue(capacityRow.participant().fullName());
                    row.createCell(2).setCellValue(nullToEmpty(capacityRow.participant().role()));
                    row.createCell(3).setCellValue(renderSprint(cell.sprintId(), sprintById));
                    row.createCell(4).setCellValue(cell.workingDays());
                    row.createCell(5).setCellValue(cell.rate());
                    row.createCell(6).setCellValue(cell.normFactor());
                    row.createCell(7).setCellValue(cell.baseCapacity());
                    row.createCell(8).setCellValue(cell.runDays());
                    row.createCell(9).setCellValue(cell.vacationNormDays());
                    row.createCell(10).setCellValue(cell.availableDays());
                    row.createCell(11).setCellValue(capacityRow.totalQuarterAvailable());
                }
            }
        }

        autoSize(sheet, 12);
    }

    private void writeReleasesSheet(XSSFWorkbook workbook, CellStyle headerStyle, List<ReleaseDto> releases) {
        XSSFSheet sheet = workbook.createSheet(safeSheetName("Релизы"));
        int rowIdx = writeHeaderRow(sheet, 0, headerStyle,
            "Название",
            "ПРОМ",
            "ПСИ",
            "OPS",
            "Регресс",
            "FF",
            "FF Inner",
            "ИФТ",
            "Сборка",
            "CR",
            "Разработка",
            "СТ");

        for (ReleaseDto release : releases) {
            Row row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(nullToEmpty(release.name()));
            row.createCell(1).setCellValue(nullToEmpty(release.promDate()));
            row.createCell(2).setCellValue(nullToEmpty(release.psiDate()));
            row.createCell(3).setCellValue(renderRange(release.opsStart(), release.opsEnd()));
            row.createCell(4).setCellValue(renderRange(release.regressStart(), release.regressEnd()));
            row.createCell(5).setCellValue(nullToEmpty(release.ffDate()));
            row.createCell(6).setCellValue(nullToEmpty(release.ffInnerDate()));
            row.createCell(7).setCellValue(renderRange(release.iftStart(), release.iftEnd()));
            row.createCell(8).setCellValue(nullToEmpty(release.buildDate()));
            row.createCell(9).setCellValue(nullToEmpty(release.crDate()));
            row.createCell(10).setCellValue(renderRange(release.devStart(), release.devEnd()));
            row.createCell(11).setCellValue(nullToEmpty(release.stDate()));
        }

        autoSize(sheet, 12);
    }

    private int writeHeaderRow(Sheet sheet, int rowIdx, CellStyle headerStyle, String... headers) {
        Row header = sheet.createRow(rowIdx++);
        for (int i = 0; i < headers.length; i++) {
            Cell cell = header.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }
        return rowIdx;
    }

    private CellStyle createHeaderStyle(XSSFWorkbook workbook) {
        Font font = workbook.createFont();
        font.setBold(true);
        CellStyle style = workbook.createCellStyle();
        style.setFont(font);
        return style;
    }

    private void autoSize(XSSFSheet sheet, int columns) {
        for (int i = 0; i < columns; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private String safeSheetName(String name) {
        try {
            return WorkbookUtil.createSafeSheetName(name);
        } catch (IllegalArgumentException e) {
            String original = name == null ? "Sheet" : name;
            StringBuilder sb = new StringBuilder(original.length());
            for (char ch : original.toCharArray()) {
                if (ch == '\\' || ch == '/' || ch == '?' || ch == '*' || ch == '[' || ch == ']' || ch == ':') {
                    sb.append(' ');
                } else {
                    sb.append(ch);
                }
            }
            String sanitized = sb.toString().trim();
            if (sanitized.isBlank()) {
                sanitized = "Sheet";
            }
            return WorkbookUtil.createSafeSheetName(sanitized);
        }
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private String renderParticipant(String participantId, Map<String, ParticipantDto> participantById) {
        if (participantId == null || participantId.isBlank()) {
            return "";
        }
        ParticipantDto participant = participantById.get(participantId);
        return participant != null ? participant.fullName() : participantId;
    }

    private String renderParticipants(List<String> participantIds, Map<String, ParticipantDto> participantById) {
        if (participantIds == null || participantIds.isEmpty()) {
            return "";
        }
        return participantIds.stream()
            .map(id -> renderParticipant(id, participantById))
            .collect(Collectors.joining(", "));
    }

    private String renderSprint(String sprintId, Map<String, SprintDto> sprintById) {
        if (sprintId == null || sprintId.isBlank()) {
            return "";
        }
        SprintDto sprint = sprintById.get(sprintId);
        return sprint != null ? sprint.name() : sprintId;
    }

    private String renderLoads(Map<String, Integer> loads, List<SprintDto> sprints) {
        if (loads == null || loads.isEmpty()) {
            return "";
        }
        List<String> chunks = new ArrayList<>();
        for (SprintDto sprint : sprints) {
            Integer days = loads.get(sprint.id());
            if (days != null && days > 0) {
                chunks.add(sprint.name() + ": " + days + " дн.");
            }
        }
        for (Map.Entry<String, Integer> entry : loads.entrySet()) {
            boolean knownSprint = sprints.stream().anyMatch(s -> Objects.equals(s.id(), entry.getKey()));
            if (!knownSprint && entry.getValue() != null && entry.getValue() > 0) {
                chunks.add(entry.getKey() + ": " + entry.getValue() + " дн.");
            }
        }
        return String.join("; ", chunks);
    }

    private String renderAllocations(Map<String, Map<String, Integer>> allocations,
        Map<String, ParticipantDto> participantById,
        Map<String, SprintDto> sprintById) {
        if (allocations == null || allocations.isEmpty()) {
            return "";
        }
        List<String> parts = new ArrayList<>();
        for (Map.Entry<String, Map<String, Integer>> entry : allocations.entrySet()) {
            String participantName = renderParticipant(entry.getKey(), participantById);
            if (entry.getValue() == null || entry.getValue().isEmpty()) {
                continue;
            }
            String perSprint = entry.getValue().entrySet().stream()
                .filter(e -> Optional.ofNullable(e.getValue()).orElse(0) > 0)
                .sorted(Comparator.comparing(e -> Optional.ofNullable(sprintById.get(e.getKey()))
                    .map(SprintDto::startDate).orElse("")))
                .map(e -> renderSprint(e.getKey(), sprintById) + ": " + e.getValue() + " дн.")
                .collect(Collectors.joining(", "));
            if (!perSprint.isBlank()) {
                parts.add(participantName + " — " + perSprint);
            }
        }
        return String.join("; ", parts);
    }

    private String renderRange(String start, String end) {
        if (start == null && end == null) {
            return "";
        }
        if (start != null && end != null) {
            return start + " → " + end;
        }
        return start != null ? start : end;
    }
}
