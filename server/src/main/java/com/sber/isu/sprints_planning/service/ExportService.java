package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.model.RunVacationEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.RunVacationRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import jakarta.transaction.Transactional;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

@Service
public class ExportService {

    private final QuarterRepository quarterRepository;
    private final SprintRepository sprintRepository;
    private final ParticipantRepository participantRepository;
    private final RunVacationRepository runVacationRepository;
    private final TaskRepository taskRepository;
    private final ReleaseRepository releaseRepository;

    public ExportService(QuarterRepository quarterRepository,
        SprintRepository sprintRepository,
        ParticipantRepository participantRepository,
        RunVacationRepository runVacationRepository,
        TaskRepository taskRepository,
        ReleaseRepository releaseRepository) {
        this.quarterRepository = quarterRepository;
        this.sprintRepository = sprintRepository;
        this.participantRepository = participantRepository;
        this.runVacationRepository = runVacationRepository;
        this.taskRepository = taskRepository;
        this.releaseRepository = releaseRepository;
    }

    @Transactional
    public byte[] exportToExcel() {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CellStyle headerStyle = createHeaderStyle(workbook);

            Map<UUID, QuarterEntity> quarterIndex = quarterRepository.findAll().stream()
                .sorted(Comparator.comparing(QuarterEntity::getYear).thenComparing(QuarterEntity::getNumber))
                .collect(Collectors.toMap(QuarterEntity::getId, q -> q, (a, b) -> a, java.util.LinkedHashMap::new));

            Map<UUID, SprintEntity> sprintIndex = sprintRepository.findAll().stream()
                .sorted(Comparator
                    .comparing((SprintEntity s) -> s.getQuarter().getYear())
                    .thenComparing(s -> s.getQuarter().getNumber())
                    .thenComparing(SprintEntity::getOrder))
                .collect(Collectors.toMap(SprintEntity::getId, s -> s, (a, b) -> a, java.util.LinkedHashMap::new));

            Map<UUID, ParticipantEntity> participantIndex = participantRepository.findAllByOrderByDisplayOrderAsc()
                .stream()
                .collect(Collectors.toMap(ParticipantEntity::getId, p -> p, (a, b) -> a, java.util.LinkedHashMap::new));

            List<TaskEntity> tasks = taskRepository.findAllByOrderByDisplayOrderAsc();

            writeQuartersSheet(workbook, headerStyle, quarterIndex);
            writeSprintsSheet(workbook, headerStyle, sprintIndex, quarterIndex);
            writeParticipantsSheet(workbook, headerStyle, participantIndex);
            writeRunVacationSheet(workbook, headerStyle, quarterIndex, sprintIndex, participantIndex);
            writeReleasesSheet(workbook, headerStyle);
            writeTasksSheet(workbook, headerStyle, sprintIndex, participantIndex, tasks);
            writeTaskLoadsSheet(workbook, headerStyle, sprintIndex, tasks);
            writeAllocationsSheet(workbook, headerStyle, sprintIndex, participantIndex, tasks);

            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Не удалось собрать Excel", e);
        }
    }

    private void writeQuartersSheet(Workbook workbook, CellStyle headerStyle, Map<UUID, QuarterEntity> quarterIndex) {
        Sheet sheet = workbook.createSheet("Кварталы");
        Row header = sheet.createRow(0);
        createHeaderCells(header, headerStyle, "Год", "Квартал", "Название", "Начало", "Окончание");
        int rowIdx = 1;
        for (QuarterEntity quarter : quarterIndex.values()) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(quarter.getYear());
            row.createCell(col++).setCellValue(quarter.getNumber());
            row.createCell(col++).setCellValue(quarter.getName());
            row.createCell(col++).setCellValue(toIso(quarter.getStartDate()));
            row.createCell(col).setCellValue(toIso(quarter.getEndDate()));
        }
        autosize(sheet, 5);
    }

    private void writeSprintsSheet(Workbook workbook, CellStyle headerStyle, Map<UUID, SprintEntity> sprints,
        Map<UUID, QuarterEntity> quarters) {
        Sheet sheet = workbook.createSheet("Спринты");
        Row header = sheet.createRow(0);
        createHeaderCells(header, headerStyle, "Квартал", "Спринт", "Начало", "Окончание", "Рабочие дни", "Порядок");
        int rowIdx = 1;
        for (SprintEntity sprint : sprints.values()) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            QuarterEntity quarter = quarters.get(sprint.getQuarter().getId());
            row.createCell(col++).setCellValue(quarter != null ? quarter.getName() : "");
            row.createCell(col++).setCellValue(sprint.getName());
            row.createCell(col++).setCellValue(toIso(sprint.getStartDate()));
            row.createCell(col++).setCellValue(toIso(sprint.getEndDate()));
            row.createCell(col++).setCellValue(sprint.getWorkingDays());
            row.createCell(col).setCellValue(sprint.getOrder());
        }
        autosize(sheet, 6);
    }

    private void writeParticipantsSheet(Workbook workbook, CellStyle headerStyle,
        Map<UUID, ParticipantEntity> participantIndex) {
        Sheet sheet = workbook.createSheet("Участники");
        Row header = sheet.createRow(0);
        createHeaderCells(header, headerStyle, "Имя", "Роль", "Ставка", "Порядок");
        int rowIdx = 1;
        for (ParticipantEntity participant : participantIndex.values()) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(participant.getFullName());
            row.createCell(col++).setCellValue(participant.getRole());
            row.createCell(col++).setCellValue(participant.getRate() != null ? participant.getRate().doubleValue() : 0.0);
            row.createCell(col).setCellValue(participant.getDisplayOrder());
        }
        autosize(sheet, 4);
    }

    private void writeRunVacationSheet(Workbook workbook, CellStyle headerStyle, Map<UUID, QuarterEntity> quarterIndex,
        Map<UUID, SprintEntity> sprintIndex, Map<UUID, ParticipantEntity> participantIndex) {
        Sheet sheet = workbook.createSheet("Забеги и отпуска");
        Row header = sheet.createRow(0);
        createHeaderCells(header, headerStyle, "Участник", "Спринт", "Квартал", "Забег, дни", "Отпуск, дни");
        int rowIdx = 1;
        List<RunVacationEntity> runVacations = runVacationRepository.findAll();
        runVacations.sort(Comparator
            .comparing((RunVacationEntity rv) -> participantIndex.getOrDefault(rv.getParticipant().getId(), rv.getParticipant()).getDisplayOrder())
            .thenComparing(rv -> sprintIndex.getOrDefault(rv.getSprint().getId(), rv.getSprint()).getStartDate()));
        for (RunVacationEntity rv : runVacations) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            ParticipantEntity participant = participantIndex.get(rv.getParticipant().getId());
            SprintEntity sprint = sprintIndex.get(rv.getSprint().getId());
            QuarterEntity quarter = sprint != null ? quarterIndex.get(sprint.getQuarter().getId()) : null;
            row.createCell(col++).setCellValue(participant != null ? participant.getFullName() : "");
            row.createCell(col++).setCellValue(sprint != null ? sprint.getName() : "");
            row.createCell(col++).setCellValue(quarter != null ? quarter.getName() : "");
            row.createCell(col++).setCellValue(rv.getRunDays());
            row.createCell(col).setCellValue(rv.getVacationNormDays());
        }
        autosize(sheet, 5);
    }

    private void writeReleasesSheet(Workbook workbook, CellStyle headerStyle) {
        Sheet sheet = workbook.createSheet("Релизы");
        Row header = sheet.createRow(0);
        createHeaderCells(header, headerStyle, "Название", "Prom", "PSI", "OPS (старт)", "OPS (конец)",
            "Regress (старт)", "Regress (конец)", "FF", "FF внутр.", "IFT (старт)", "IFT (конец)", "Build",
            "CR", "Dev (старт)", "Dev (конец)", "ST", "Создано", "Обновлено");
        int rowIdx = 1;
        List<ReleaseEntity> releases = releaseRepository.findAllByOrderByPromDateAsc();
        for (ReleaseEntity release : releases) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(release.getName());
            row.createCell(col++).setCellValue(toIso(release.getPromDate()));
            row.createCell(col++).setCellValue(toIso(release.getPsiDate()));
            row.createCell(col++).setCellValue(toIso(release.getOpsStart()));
            row.createCell(col++).setCellValue(toIso(release.getOpsEnd()));
            row.createCell(col++).setCellValue(toIso(release.getRegressStart()));
            row.createCell(col++).setCellValue(toIso(release.getRegressEnd()));
            row.createCell(col++).setCellValue(toIso(release.getFfDate()));
            row.createCell(col++).setCellValue(toIso(release.getFfInnerDate()));
            row.createCell(col++).setCellValue(toIso(release.getIftStart()));
            row.createCell(col++).setCellValue(toIso(release.getIftEnd()));
            row.createCell(col++).setCellValue(toIso(release.getBuildDate()));
            row.createCell(col++).setCellValue(toIso(release.getCrDate()));
            row.createCell(col++).setCellValue(toIso(release.getDevStart()));
            row.createCell(col++).setCellValue(toIso(release.getDevEnd()));
            row.createCell(col++).setCellValue(toIso(release.getStDate()));
            row.createCell(col++).setCellValue(toIso(release.getCreatedAt()));
            row.createCell(col).setCellValue(toIso(release.getUpdatedAt()));
        }
        autosize(sheet, 18);
    }

    private void writeTasksSheet(Workbook workbook, CellStyle headerStyle, Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, ParticipantEntity> participantIndex, List<TaskEntity> tasks) {
        Sheet sheet = workbook.createSheet("Задачи");
        Row header = sheet.createRow(0);
        createHeaderCells(header, headerStyle, "Порядок", "Название", "Приоритет", "Заказчик", "Поток",
            "Участники", "Лидер", "Релизный спринт", "Дата релиза", "Создано", "Обновлено", "Описание", "DoD");
        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(task.getDisplayOrder());
            row.createCell(col++).setCellValue(task.getTitle());
            row.createCell(col++).setCellValue(task.getPriority());
            row.createCell(col++).setCellValue(task.getCustomer());
            row.createCell(col++).setCellValue(task.getStream());
            row.createCell(col++).setCellValue(joinParticipants(task.getParticipants(), participantIndex));
            row.createCell(col++).setCellValue(task.getLeaderParticipant() != null
                ? participantIndex.getOrDefault(task.getLeaderParticipant().getId(), task.getLeaderParticipant()).getFullName()
                : "");
            row.createCell(col++).setCellValue(task.getReleaseSprint() != null
                ? sprintIndex.getOrDefault(task.getReleaseSprint().getId(), task.getReleaseSprint()).getName()
                : "");
            row.createCell(col++).setCellValue(toIso(task.getReleaseDate()));
            row.createCell(col++).setCellValue(toIso(task.getCreatedAt()));
            row.createCell(col++).setCellValue(toIso(task.getUpdatedAt()));
            row.createCell(col++).setCellValue(task.getDescription());
            row.createCell(col).setCellValue(task.getDod());
        }
        autosize(sheet, 13);
    }

    private void writeTaskLoadsSheet(Workbook workbook, CellStyle headerStyle, Map<UUID, SprintEntity> sprintIndex,
        List<TaskEntity> tasks) {
        Sheet sheet = workbook.createSheet("Нагрузка задач");
        Row header = sheet.createRow(0);
        createHeaderCells(header, headerStyle, "Задача", "Спринт", "Дни");
        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<TaskLoadEntity> loads = task.getLoads().stream()
                .sorted(Comparator.comparing(load -> sprintIndex
                    .getOrDefault(load.getSprint().getId(), load.getSprint())
                    .getStartDate()))
                .toList();
            for (TaskLoadEntity load : loads) {
                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(task.getTitle());
                row.createCell(col++).setCellValue(
                    sprintIndex.getOrDefault(load.getSprint().getId(), load.getSprint()).getName());
                row.createCell(col).setCellValue(load.getDays().doubleValue());
            }
        }
        autosize(sheet, 3);
    }

    private void writeAllocationsSheet(Workbook workbook, CellStyle headerStyle, Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, ParticipantEntity> participantIndex, List<TaskEntity> tasks) {
        Sheet sheet = workbook.createSheet("Распределения");
        Row header = sheet.createRow(0);
        createHeaderCells(header, headerStyle, "Задача", "Участник", "Спринт", "Дни");
        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<TaskAllocationEntity> allocations = task.getAllocations().stream()
                .sorted(Comparator
                    .comparing((TaskAllocationEntity alloc) -> participantIndex
                        .getOrDefault(alloc.getParticipant().getId(), alloc.getParticipant()).getDisplayOrder())
                    .thenComparing(alloc -> sprintIndex
                        .getOrDefault(alloc.getSprint().getId(), alloc.getSprint())
                        .getStartDate()))
                .toList();
            for (TaskAllocationEntity allocation : allocations) {
                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(task.getTitle());
                row.createCell(col++).setCellValue(participantIndex
                    .getOrDefault(allocation.getParticipant().getId(), allocation.getParticipant()).getFullName());
                row.createCell(col++).setCellValue(
                    sprintIndex.getOrDefault(allocation.getSprint().getId(), allocation.getSprint()).getName());
                row.createCell(col).setCellValue(allocation.getDays().doubleValue());
            }
        }
        autosize(sheet, 4);
    }

    private CellStyle createHeaderStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        var font = workbook.createFont();
        font.setBold(true);
        style.setFont(font);
        return style;
    }

    private void createHeaderCells(Row header, CellStyle style, String... titles) {
        for (int i = 0; i < titles.length; i++) {
            Cell cell = header.createCell(i);
            cell.setCellValue(titles[i]);
            cell.setCellStyle(style);
        }
    }

    private String joinParticipants(Iterable<TaskParticipantEntity> participants, Map<UUID, ParticipantEntity> participantIndex) {
        return java.util.stream.StreamSupport.stream(participants.spliterator(), false)
            .sorted(Comparator.comparingInt(TaskParticipantEntity::getDisplayOrder))
            .map(tp -> participantIndex.getOrDefault(tp.getParticipant().getId(), tp.getParticipant()).getFullName())
            .collect(Collectors.joining(", "));
    }

    private String toIso(LocalDate date) {
        return date != null ? date.toString() : "";
    }

    private void autosize(Sheet sheet, int columns) {
        for (int i = 0; i < columns; i++) {
            sheet.autoSizeColumn(i);
        }
    }
}
