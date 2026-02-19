package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.CapacityCellDto;
import com.sber.isu.sprints_planning.dto.CapacityRowDto;
import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.model.ApiCallHistoryEntity;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskCustomerEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskStreamEntity;
import com.sber.isu.sprints_planning.repository.ApiCallHistoryRepository;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import jakarta.transaction.Transactional;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CreationHelper;
import org.apache.poi.ss.usermodel.DataFormat;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

@Service
public class ExportService {

    private static final String PLACEHOLDER_NO_PARTICIPANT = "[Без участника]";
    private static final String PLACEHOLDER_NO_CUSTOMER = "[Без заказчика]";
    private static final String PLACEHOLDER_NO_STREAM = "[Без стрима]";

    private final QuarterRepository quarterRepository;
    private final SprintRepository sprintRepository;
    private final ParticipantRepository participantRepository;
    private final TaskRepository taskRepository;
    private final CapacityService capacityService;
    private final ApiCallHistoryRepository apiCallHistoryRepository;

    public ExportService(
        QuarterRepository quarterRepository,
        SprintRepository sprintRepository,
        ParticipantRepository participantRepository,
        TaskRepository taskRepository,
        CapacityService capacityService,
        ApiCallHistoryRepository apiCallHistoryRepository
    ) {
        this.quarterRepository = quarterRepository;
        this.sprintRepository = sprintRepository;
        this.participantRepository = participantRepository;
        this.taskRepository = taskRepository;
        this.capacityService = capacityService;
        this.apiCallHistoryRepository = apiCallHistoryRepository;
    }

    @Transactional
    public byte[] exportToExcel(String teamKey) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ExportStyles styles = createStyles(workbook);

            Map<UUID, QuarterEntity> quarterIndex = quarterRepository.findByTeamKeyOrderByStartDateAsc(teamKey).stream()
                .sorted(Comparator.comparing(QuarterEntity::getYear).thenComparing(QuarterEntity::getNumber))
                .collect(Collectors.toMap(QuarterEntity::getId, q -> q, (a, b) -> a, LinkedHashMap::new));

            Map<UUID, SprintEntity> sprintIndex = sprintRepository.findByTeamKeyOrderByQuarterAndOrder(teamKey).stream()
                .sorted(Comparator
                    .comparing((SprintEntity s) -> s.getQuarter().getYear())
                    .thenComparing(s -> s.getQuarter().getNumber())
                    .thenComparing(SprintEntity::getOrder))
                .collect(Collectors.toMap(SprintEntity::getId, s -> s, (a, b) -> a, LinkedHashMap::new));

            Map<UUID, ParticipantEntity> participantIndex = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey)
                .stream()
                .collect(Collectors.toMap(ParticipantEntity::getId, p -> p, (a, b) -> a, LinkedHashMap::new));

            List<TaskEntity> tasks = taskRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey);
            int backlogFilterRows = countBacklogFilterRows(tasks, participantIndex);
            List<CapacityRowDto> capacityRows = capacityService.calculate(
                teamKey,
                List.of(),
                List.of(),
                List.of(),
                List.of()
            );
            List<ApiCallHistoryEntity> historyEntries = apiCallHistoryRepository.findAllByTeamKey(
                teamKey,
                Sort.by(Sort.Direction.DESC, "createdAt")
            );

            writeReadmeSheet(workbook, styles, teamKey, tasks, backlogFilterRows, capacityRows, historyEntries);
            writeViewBacklogSheet(workbook, styles, sprintIndex, quarterIndex, participantIndex, tasks);
            writeViewBacklogFilterSheet(workbook, styles, sprintIndex, quarterIndex, participantIndex, tasks);
            writeViewCapacitySheet(workbook, styles, sprintIndex, quarterIndex, capacityRows);
            writeViewParticipantsSheet(workbook, styles, sprintIndex, quarterIndex, participantIndex, tasks);
            writeViewHistorySheet(workbook, styles, historyEntries);

            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Не удалось собрать Excel", e);
        }
    }

    private void writeReadmeSheet(
        Workbook workbook,
        ExportStyles styles,
        String teamKey,
        List<TaskEntity> tasks,
        int backlogFilterRows,
        List<CapacityRowDto> capacityRows,
        List<ApiCallHistoryEntity> historyEntries
    ) {
        final int columns = 2;
        Sheet sheet = workbook.createSheet("README");
        Row header = sheet.createRow(0);
        createHeaderCells(header, styles.header(), "Параметр", "Значение");

        int rowIdx = 1;
        rowIdx = writeReadmeRow(sheet, rowIdx, "Профиль экспорта", "human");
        rowIdx = writeReadmeRow(sheet, rowIdx, "Команда", teamKey);
        rowIdx = writeReadmeRow(sheet, rowIdx, "Дата выгрузки", OffsetDateTime.now().toString());
        rowIdx = writeReadmeRow(sheet, rowIdx, "Лист 1", "README — описание структуры выгрузки");
        rowIdx = writeReadmeRow(sheet, rowIdx, "Лист 2", "View_Бэклог — задачи (1 строка = 1 задача)");
        rowIdx = writeReadmeRow(sheet, rowIdx, "Лист 3", "View_Бэклог_Фильтр — задача x участник x заказчик x стрим");
        rowIdx = writeReadmeRow(sheet, rowIdx, "Лист 4", "View_Нагрузка — участник x спринт");
        rowIdx = writeReadmeRow(sheet, rowIdx, "Лист 5", "View_ПоСотрудникам — участник x задача x спринт");
        rowIdx = writeReadmeRow(sheet, rowIdx, "Лист 6", "View_История — действия пользователей (без GET)");
        rowIdx = writeReadmeRow(sheet, rowIdx, "Количество задач", String.valueOf(tasks.size()));
        rowIdx = writeReadmeRow(sheet, rowIdx, "Количество строк View_Бэклог_Фильтр", String.valueOf(backlogFilterRows));
        rowIdx = writeReadmeRow(sheet, rowIdx, "Количество строк нагрузки", String.valueOf(countCapacityRows(capacityRows)));
        rowIdx = writeReadmeRow(
            sheet,
            rowIdx,
            "Количество записей истории (без GET)",
            String.valueOf(countActionHistoryRows(historyEntries))
        );

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private int writeReadmeRow(Sheet sheet, int rowIdx, String key, String value) {
        Row row = sheet.createRow(rowIdx++);
        row.createCell(0).setCellValue(nullToEmpty(key));
        row.createCell(1).setCellValue(nullToEmpty(value));
        return rowIdx;
    }

    private int countCapacityRows(List<CapacityRowDto> capacityRows) {
        int count = 0;
        for (CapacityRowDto row : capacityRows) {
            if (row.cells() != null) {
                count += row.cells().size();
            }
        }
        return count;
    }

    private int countActionHistoryRows(List<ApiCallHistoryEntity> historyEntries) {
        int count = 0;
        for (ApiCallHistoryEntity entry : historyEntries) {
            if (isActionHistory(entry)) {
                count++;
            }
        }
        return count;
    }

    private int countBacklogFilterRows(List<TaskEntity> tasks, Map<UUID, ParticipantEntity> participantIndex) {
        int count = 0;
        for (TaskEntity task : tasks) {
            int participantCount = 0;
            for (TaskParticipantEntity taskParticipant : sortedTaskParticipants(task.getParticipants())) {
                ParticipantEntity participant = resolveParticipant(taskParticipant.getParticipant(), participantIndex);
                if (participant != null) {
                    participantCount++;
                }
            }
            participantCount = Math.max(1, participantCount);
            int customerCount = Math.max(1, collectTaskCustomers(task).size());
            int streamCount = Math.max(1, collectTaskStreams(task).size());
            count += participantCount * customerCount * streamCount;
        }
        return count;
    }

    private void writeQuartersSheet(Workbook workbook, ExportStyles styles, Map<UUID, QuarterEntity> quarterIndex) {
        final int columns = 6;
        Sheet sheet = workbook.createSheet("Кварталы");
        Row header = sheet.createRow(0);
        createHeaderCells(header, styles.header(), "ID", "Год", "Квартал", "Название", "Начало", "Окончание");

        int rowIdx = 1;
        for (QuarterEntity quarter : quarterIndex.values()) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(quarter.getId().toString());
            setIntegerCell(row, col++, quarter.getYear(), styles.integer());
            setIntegerCell(row, col++, quarter.getNumber(), styles.integer());
            row.createCell(col++).setCellValue(nullToEmpty(quarter.getName()));
            setDateCell(row, col++, quarter.getStartDate(), styles.date());
            setDateCell(row, col, quarter.getEndDate(), styles.date());
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeSprintsSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex
    ) {
        final int columns = 8;
        Sheet sheet = workbook.createSheet("Спринты");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "ID",
            "Квартал ID",
            "Квартал",
            "Спринт",
            "Начало",
            "Окончание",
            "Рабочие дни",
            "Порядок"
        );

        int rowIdx = 1;
        for (SprintEntity sprint : sprintIndex.values()) {
            QuarterEntity quarter = resolveQuarter(sprint, quarterIndex);
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(sprint.getId().toString());
            row.createCell(col++).setCellValue(quarter != null ? quarter.getId().toString() : "");
            row.createCell(col++).setCellValue(quarter != null ? nullToEmpty(quarter.getName()) : "");
            row.createCell(col++).setCellValue(nullToEmpty(sprint.getName()));
            setDateCell(row, col++, sprint.getStartDate(), styles.date());
            setDateCell(row, col++, sprint.getEndDate(), styles.date());
            setIntegerCell(row, col++, sprint.getWorkingDays(), styles.integer());
            setIntegerCell(row, col, sprint.getOrder(), styles.integer());
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeParticipantsSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, ParticipantEntity> participantIndex
    ) {
        final int columns = 6;
        Sheet sheet = workbook.createSheet("Участники");
        Row header = sheet.createRow(0);
        createHeaderCells(header, styles.header(), "ID", "Имя", "Роль", "Стримы участника", "Ставка", "Порядок");

        int rowIdx = 1;
        for (ParticipantEntity participant : participantIndex.values()) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(participant.getId().toString());
            row.createCell(col++).setCellValue(nullToEmpty(participant.getFullName()));
            row.createCell(col++).setCellValue(nullToEmpty(participant.getRole()));
            row.createCell(col++).setCellValue(joinUserStreams(participant));
            setDecimalCell(row, col++, toDouble(participant.getRate()), styles.decimal());
            setIntegerCell(row, col, participant.getDisplayOrder(), styles.integer());
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeReleasesSheet(Workbook workbook, ExportStyles styles, List<ReleaseEntity> releases) {
        final int columns = 19;
        Sheet sheet = workbook.createSheet("Релизы");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "ID",
            "Название",
            "Prom",
            "PSI",
            "OPS (старт)",
            "OPS (конец)",
            "Regress (старт)",
            "Regress (конец)",
            "FF",
            "FF внутр.",
            "IFT (старт)",
            "IFT (конец)",
            "Build",
            "CR",
            "Dev (старт)",
            "Dev (конец)",
            "ST",
            "Создано",
            "Обновлено"
        );

        int rowIdx = 1;
        for (ReleaseEntity release : releases) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(release.getId().toString());
            row.createCell(col++).setCellValue(nullToEmpty(release.getName()));
            setDateCell(row, col++, release.getPromDate(), styles.date());
            setDateCell(row, col++, release.getPsiDate(), styles.date());
            setDateCell(row, col++, release.getOpsStart(), styles.date());
            setDateCell(row, col++, release.getOpsEnd(), styles.date());
            setDateCell(row, col++, release.getRegressStart(), styles.date());
            setDateCell(row, col++, release.getRegressEnd(), styles.date());
            setDateCell(row, col++, release.getFfDate(), styles.date());
            setDateCell(row, col++, release.getFfInnerDate(), styles.date());
            setDateCell(row, col++, release.getIftStart(), styles.date());
            setDateCell(row, col++, release.getIftEnd(), styles.date());
            setDateCell(row, col++, release.getBuildDate(), styles.date());
            setDateCell(row, col++, release.getCrDate(), styles.date());
            setDateCell(row, col++, release.getDevStart(), styles.date());
            setDateCell(row, col++, release.getDevEnd(), styles.date());
            setDateCell(row, col++, release.getStDate(), styles.date());
            setDateCell(row, col++, release.getCreatedAt(), styles.date());
            setDateCell(row, col, release.getUpdatedAt(), styles.date());
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeViewBacklogSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        Map<UUID, ParticipantEntity> participantIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 17;
        Sheet sheet = workbook.createSheet("View_Бэклог");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "ID",
            "Порядок",
            "Название",
            "Приоритет",
            "Статус",
            "Заказчики",
            "Стримы",
            "Участники",
            "Лидер",
            "Релиз",
            "Релизный спринт",
            "Дата релиза",
            "Кварталы по нагрузке",
            "Создано",
            "Обновлено",
            "Описание",
            "DoD"
        );

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(task.getId().toString());
            setIntegerCell(row, col++, task.getDisplayOrder(), styles.integer());
            row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
            setIntegerCell(row, col++, task.getPriority(), styles.integer());
            row.createCell(col++).setCellValue(nullToEmpty(task.getStatus()));
            row.createCell(col++).setCellValue(String.join(", ", collectTaskCustomers(task)));
            row.createCell(col++).setCellValue(String.join(", ", collectTaskStreams(task)));
            row.createCell(col++).setCellValue(joinParticipants(task.getParticipants(), participantIndex));
            row.createCell(col++).setCellValue(resolveLeaderName(task, participantIndex));
            row.createCell(col++).setCellValue(resolveReleaseName(task));
            row.createCell(col++).setCellValue(resolveReleaseSprintName(task, sprintIndex));
            setDateCell(row, col++, resolveReleasePromDate(task), styles.date());
            row.createCell(col++).setCellValue(joinTaskQuarterNames(task, sprintIndex, quarterIndex));
            setDateCell(row, col++, task.getCreatedAt(), styles.date());
            setDateCell(row, col++, task.getUpdatedAt(), styles.date());
            Cell descriptionCell = row.createCell(col++);
            descriptionCell.setCellValue(nullToEmpty(task.getDescription()));
            descriptionCell.setCellStyle(styles.wrappedText());
            Cell dodCell = row.createCell(col);
            dodCell.setCellValue(nullToEmpty(task.getDod()));
            dodCell.setCellStyle(styles.wrappedText());
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeViewBacklogFilterSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        Map<UUID, ParticipantEntity> participantIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 16;
        Sheet sheet = workbook.createSheet("View_Бэклог_Фильтр");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "ID",
            "Порядок",
            "Название",
            "Статус",
            "Приоритет",
            "Релиз",
            "Релизный спринт",
            "Дата релиза",
            "Кварталы по нагрузке",
            "Участник ID",
            "Участник",
            "Роль участника",
            "Заказчик",
            "Стрим",
            "Лидер",
            "Первая строка задачи"
        );

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<FilterParticipantRow> participantsForRows = new ArrayList<>();
            for (TaskParticipantEntity taskParticipant : sortedTaskParticipants(task.getParticipants())) {
                ParticipantEntity participant = resolveParticipant(taskParticipant.getParticipant(), participantIndex);
                if (participant == null) {
                    continue;
                }
                participantsForRows.add(
                    new FilterParticipantRow(
                        participant.getId().toString(),
                        nullToEmpty(participant.getFullName()),
                        nullToEmpty(participant.getRole())
                    )
                );
            }
            if (participantsForRows.isEmpty()) {
                participantsForRows.add(new FilterParticipantRow("", PLACEHOLDER_NO_PARTICIPANT, ""));
            }

            List<String> customersForRows = withFallbackValue(collectTaskCustomers(task), PLACEHOLDER_NO_CUSTOMER);
            List<String> streamsForRows = withFallbackValue(collectTaskStreams(task), PLACEHOLDER_NO_STREAM);
            boolean firstRowForTask = true;

            for (FilterParticipantRow participant : participantsForRows) {
                for (String customer : customersForRows) {
                    for (String stream : streamsForRows) {
                        Row row = sheet.createRow(rowIdx++);
                        int col = 0;
                        row.createCell(col++).setCellValue(task.getId().toString());
                        setIntegerCell(row, col++, task.getDisplayOrder(), styles.integer());
                        row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
                        row.createCell(col++).setCellValue(nullToEmpty(task.getStatus()));
                        setIntegerCell(row, col++, task.getPriority(), styles.integer());
                        row.createCell(col++).setCellValue(resolveReleaseName(task));
                        row.createCell(col++).setCellValue(resolveReleaseSprintName(task, sprintIndex));
                        setDateCell(row, col++, resolveReleasePromDate(task), styles.date());
                        row.createCell(col++).setCellValue(joinTaskQuarterNames(task, sprintIndex, quarterIndex));
                        row.createCell(col++).setCellValue(nullToEmpty(participant.id()));
                        row.createCell(col++).setCellValue(nullToEmpty(participant.name()));
                        row.createCell(col++).setCellValue(nullToEmpty(participant.role()));
                        row.createCell(col++).setCellValue(nullToEmpty(customer));
                        row.createCell(col++).setCellValue(nullToEmpty(stream));
                        row.createCell(col++).setCellValue(resolveLeaderName(task, participantIndex));
                        setIntegerCell(row, col, firstRowForTask ? 1 : 0, styles.integer());
                        firstRowForTask = false;
                    }
                }
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeTaskLoadsSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 6;
        Sheet sheet = workbook.createSheet("Нагрузка задач");
        Row header = sheet.createRow(0);
        createHeaderCells(header, styles.header(), "Задача ID", "Задача", "Спринт ID", "Спринт", "Квартал", "Дни");

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<TaskLoadEntity> loads = task.getLoads().stream()
                .sorted(Comparator.comparing(load -> resolveSprint(load.getSprint(), sprintIndex).getStartDate()))
                .toList();
            for (TaskLoadEntity load : loads) {
                SprintEntity sprint = resolveSprint(load.getSprint(), sprintIndex);
                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(task.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(col++).setCellValue(sprint.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(sprint.getName()));
                row.createCell(col++).setCellValue(resolveQuarterName(sprint, quarterIndex));
                setDecimalCell(row, col, toDouble(load.getDays()), styles.decimal());
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeAllocationsSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        Map<UUID, ParticipantEntity> participantIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 8;
        Sheet sheet = workbook.createSheet("Распределения");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "Задача ID",
            "Задача",
            "Участник ID",
            "Участник",
            "Спринт ID",
            "Спринт",
            "Квартал",
            "Дни"
        );

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<TaskAllocationEntity> allocations = task.getAllocations().stream()
                .sorted(Comparator
                    .comparing((TaskAllocationEntity alloc) -> participantOrder(alloc.getParticipant(), participantIndex))
                    .thenComparing(alloc -> resolveSprint(alloc.getSprint(), sprintIndex).getStartDate()))
                .toList();
            for (TaskAllocationEntity allocation : allocations) {
                SprintEntity sprint = resolveSprint(allocation.getSprint(), sprintIndex);
                ParticipantEntity participant = resolveParticipant(allocation.getParticipant(), participantIndex);
                if (sprint == null || participant == null) {
                    continue;
                }
                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(task.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(col++).setCellValue(participant.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(participant.getFullName()));
                row.createCell(col++).setCellValue(sprint.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(sprint.getName()));
                row.createCell(col++).setCellValue(resolveQuarterName(sprint, quarterIndex));
                setDecimalCell(row, col, toDouble(allocation.getDays()), styles.decimal());
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeDataTasksSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        Map<UUID, ParticipantEntity> participantIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 20;
        Sheet sheet = workbook.createSheet("Data_Tasks");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "task_id",
            "title",
            "display_order",
            "priority",
            "status",
            "customers",
            "streams",
            "leader_id",
            "leader_name",
            "participant_ids",
            "participant_names",
            "release_id",
            "release_name",
            "release_prom_date",
            "release_sprint",
            "quarter_names",
            "created_at",
            "updated_at",
            "description",
            "dod"
        );

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<TaskParticipantEntity> participants = sortedTaskParticipants(task.getParticipants());
            String participantIds = participants.stream()
                .map(tp -> tp.getParticipant().getId().toString())
                .collect(Collectors.joining(","));
            String participantNames = participants.stream()
                .map(tp -> resolveParticipant(tp.getParticipant(), participantIndex))
                .filter(participant -> participant != null && hasText(participant.getFullName()))
                .map(ParticipantEntity::getFullName)
                .collect(Collectors.joining(", "));

            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(task.getId().toString());
            row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
            setIntegerCell(row, col++, task.getDisplayOrder(), styles.integer());
            setIntegerCell(row, col++, task.getPriority(), styles.integer());
            row.createCell(col++).setCellValue(nullToEmpty(task.getStatus()));
            row.createCell(col++).setCellValue(String.join(", ", collectTaskCustomers(task)));
            row.createCell(col++).setCellValue(String.join(", ", collectTaskStreams(task)));
            row.createCell(col++).setCellValue(task.getLeaderParticipant() != null ? task.getLeaderParticipant().getId().toString() : "");
            row.createCell(col++).setCellValue(resolveLeaderName(task, participantIndex));
            row.createCell(col++).setCellValue(participantIds);
            row.createCell(col++).setCellValue(participantNames);
            row.createCell(col++).setCellValue(task.getReleaseDate() != null ? task.getReleaseDate().getId().toString() : "");
            row.createCell(col++).setCellValue(resolveReleaseName(task));
            setDateCell(row, col++, resolveReleasePromDate(task), styles.date());
            row.createCell(col++).setCellValue(resolveReleaseSprintName(task, sprintIndex));
            row.createCell(col++).setCellValue(joinTaskQuarterNames(task, sprintIndex, quarterIndex));
            setDateCell(row, col++, task.getCreatedAt(), styles.date());
            setDateCell(row, col++, task.getUpdatedAt(), styles.date());
            Cell descriptionCell = row.createCell(col++);
            descriptionCell.setCellValue(nullToEmpty(task.getDescription()));
            descriptionCell.setCellStyle(styles.wrappedText());
            Cell dodCell = row.createCell(col);
            dodCell.setCellValue(nullToEmpty(task.getDod()));
            dodCell.setCellStyle(styles.wrappedText());
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeDataTaskStreamsSheet(Workbook workbook, ExportStyles styles, List<TaskEntity> tasks) {
        final int columns = 3;
        Sheet sheet = workbook.createSheet("Data_TaskStreams");
        Row header = sheet.createRow(0);
        createHeaderCells(header, styles.header(), "task_id", "task_title", "stream");

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<String> streams = collectTaskStreams(task);
            if (streams.isEmpty()) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(task.getId().toString());
                row.createCell(1).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(2).setCellValue("");
                continue;
            }

            for (String stream : streams) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(task.getId().toString());
                row.createCell(1).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(2).setCellValue(stream);
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeDataTaskCustomersSheet(Workbook workbook, ExportStyles styles, List<TaskEntity> tasks) {
        final int columns = 3;
        Sheet sheet = workbook.createSheet("Data_TaskCustomers");
        Row header = sheet.createRow(0);
        createHeaderCells(header, styles.header(), "task_id", "task_title", "customer");

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<String> customers = collectTaskCustomers(task);
            if (customers.isEmpty()) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(task.getId().toString());
                row.createCell(1).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(2).setCellValue("");
                continue;
            }

            for (String customer : customers) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(task.getId().toString());
                row.createCell(1).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(2).setCellValue(customer);
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeDataTaskParticipantsSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, ParticipantEntity> participantIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 7;
        Sheet sheet = workbook.createSheet("Data_TaskParticipants");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "task_id",
            "task_title",
            "participant_id",
            "participant_name",
            "participant_role",
            "participant_order",
            "is_leader"
        );

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<TaskParticipantEntity> participants = sortedTaskParticipants(task.getParticipants());
            if (participants.isEmpty()) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(task.getId().toString());
                row.createCell(1).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(2).setCellValue("");
                row.createCell(3).setCellValue("");
                row.createCell(4).setCellValue("");
                row.createCell(5).setCellValue("");
                row.createCell(6).setCellValue("Нет");
                continue;
            }

            for (TaskParticipantEntity taskParticipant : participants) {
                ParticipantEntity participant = resolveParticipant(taskParticipant.getParticipant(), participantIndex);
                if (participant == null) {
                    continue;
                }
                boolean isLeader = task.getLeaderParticipant() != null
                    && task.getLeaderParticipant().getId().equals(participant.getId());
                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(task.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(col++).setCellValue(participant.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(participant.getFullName()));
                row.createCell(col++).setCellValue(nullToEmpty(participant.getRole()));
                setIntegerCell(row, col++, taskParticipant.getDisplayOrder(), styles.integer());
                row.createCell(col).setCellValue(isLeader ? "Да" : "Нет");
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeDataTaskLoadsSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 7;
        Sheet sheet = workbook.createSheet("Data_TaskLoads");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "task_id",
            "task_title",
            "sprint_id",
            "sprint_name",
            "quarter_id",
            "quarter_name",
            "days"
        );

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<TaskLoadEntity> loads = task.getLoads().stream()
                .sorted(Comparator.comparing(load -> resolveSprint(load.getSprint(), sprintIndex).getStartDate()))
                .toList();
            for (TaskLoadEntity load : loads) {
                SprintEntity sprint = resolveSprint(load.getSprint(), sprintIndex);
                QuarterEntity quarter = resolveQuarter(sprint, quarterIndex);
                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(task.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(col++).setCellValue(sprint.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(sprint.getName()));
                row.createCell(col++).setCellValue(quarter != null ? quarter.getId().toString() : "");
                row.createCell(col++).setCellValue(quarter != null ? nullToEmpty(quarter.getName()) : "");
                setDecimalCell(row, col, toDouble(load.getDays()), styles.decimal());
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeDataTaskAllocationsSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        Map<UUID, ParticipantEntity> participantIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 10;
        Sheet sheet = workbook.createSheet("Data_TaskAllocations");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "task_id",
            "task_title",
            "participant_id",
            "participant_name",
            "participant_role",
            "sprint_id",
            "sprint_name",
            "quarter_id",
            "quarter_name",
            "days"
        );

        int rowIdx = 1;
        for (TaskEntity task : tasks) {
            List<TaskAllocationEntity> allocations = task.getAllocations().stream()
                .sorted(Comparator
                    .comparing((TaskAllocationEntity alloc) -> participantOrder(alloc.getParticipant(), participantIndex))
                    .thenComparing(alloc -> resolveSprint(alloc.getSprint(), sprintIndex).getStartDate()))
                .toList();
            for (TaskAllocationEntity allocation : allocations) {
                SprintEntity sprint = resolveSprint(allocation.getSprint(), sprintIndex);
                QuarterEntity quarter = resolveQuarter(sprint, quarterIndex);
                ParticipantEntity participant = resolveParticipant(allocation.getParticipant(), participantIndex);
                if (sprint == null || participant == null) {
                    continue;
                }
                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(task.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
                row.createCell(col++).setCellValue(participant.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(participant.getFullName()));
                row.createCell(col++).setCellValue(nullToEmpty(participant.getRole()));
                row.createCell(col++).setCellValue(sprint.getId().toString());
                row.createCell(col++).setCellValue(nullToEmpty(sprint.getName()));
                row.createCell(col++).setCellValue(quarter != null ? quarter.getId().toString() : "");
                row.createCell(col++).setCellValue(quarter != null ? nullToEmpty(quarter.getName()) : "");
                setDecimalCell(row, col, toDouble(allocation.getDays()), styles.decimal());
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeDataCapacitySheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        List<CapacityRowDto> capacityRows
    ) {
        final int columns = 18;
        Sheet sheet = workbook.createSheet("Data_Capacity");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "participant_id",
            "participant_name",
            "participant_role",
            "participant_streams",
            "sprint_id",
            "sprint_name",
            "quarter_id",
            "quarter_name",
            "working_days",
            "rate",
            "norm_factor",
            "capacity_factor",
            "base_capacity",
            "available_days",
            "workload_days",
            "total_available",
            "total_workload",
            "balance_days"
        );

        int rowIdx = 1;
        for (CapacityRowDto rowDto : capacityRows) {
            ParticipantDto participant = rowDto.participant();
            String participantStreams = participant.userStreams() == null
                ? ""
                : participant.userStreams().stream()
                    .filter(this::hasText)
                    .sorted(String.CASE_INSENSITIVE_ORDER)
                    .collect(Collectors.joining(", "));

            for (CapacityCellDto cell : rowDto.cells()) {
                SprintEntity sprint = resolveSprint(parseUuid(cell.sprintId()), sprintIndex);
                QuarterEntity quarter = resolveQuarter(sprint, quarterIndex);
                double available = cell.availableDays();
                double workload = cell.workloadDays();
                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(nullToEmpty(participant.id()));
                row.createCell(col++).setCellValue(nullToEmpty(participant.fullName()));
                row.createCell(col++).setCellValue(nullToEmpty(participant.role()));
                row.createCell(col++).setCellValue(participantStreams);
                row.createCell(col++).setCellValue(nullToEmpty(cell.sprintId()));
                row.createCell(col++).setCellValue(sprint != null ? nullToEmpty(sprint.getName()) : "");
                row.createCell(col++).setCellValue(quarter != null ? quarter.getId().toString() : "");
                row.createCell(col++).setCellValue(quarter != null ? nullToEmpty(quarter.getName()) : "");
                setIntegerCell(row, col++, cell.workingDays(), styles.integer());
                setDecimalCell(row, col++, cell.rate(), styles.decimal());
                setDecimalCell(row, col++, cell.normFactor(), styles.decimal());
                setDecimalCell(row, col++, cell.capacityFactor(), styles.decimal());
                setDecimalCell(row, col++, cell.baseCapacity(), styles.decimal());
                setDecimalCell(row, col++, available, styles.decimal());
                setDecimalCell(row, col++, workload, styles.decimal());
                setDecimalCell(row, col++, rowDto.totalQuarterAvailable(), styles.decimal());
                setDecimalCell(row, col++, rowDto.totalQuarterWorkload(), styles.decimal());
                setDecimalCell(row, col, roundToOneDecimal(available - workload), styles.decimal());
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeDataHistorySheet(Workbook workbook, ExportStyles styles, List<ApiCallHistoryEntity> historyEntries) {
        final int columns = 8;
        Sheet sheet = workbook.createSheet("Data_History");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "history_id",
            "created_at",
            "user_name",
            "session_id",
            "http_method",
            "path",
            "action",
            "status_code"
        );

        int rowIdx = 1;
        for (ApiCallHistoryEntity history : historyEntries) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            row.createCell(col++).setCellValue(history.getId().toString());
            setDateTimeCell(row, col++, history.getCreatedAt(), styles.dateTime());
            row.createCell(col++).setCellValue(nullToEmpty(history.getUserName()));
            row.createCell(col++).setCellValue(nullToEmpty(history.getSessionId()));
            row.createCell(col++).setCellValue(nullToEmpty(history.getHttpMethod()));
            row.createCell(col++).setCellValue(nullToEmpty(history.getPath()));
            row.createCell(col++).setCellValue(nullToEmpty(history.getAction()));
            setIntegerCell(row, col, history.getStatusCode(), styles.integer());
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeViewCapacitySheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        List<CapacityRowDto> capacityRows
    ) {
        final int columns = 12;
        Sheet sheet = workbook.createSheet("View_Нагрузка");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "Участник",
            "Роль",
            "Стримы участника",
            "Квартал",
            "Спринт",
            "Рабочие дни",
            "Ставка",
            "Доступно, дн",
            "Нагрузка, дн",
            "Баланс, дн",
            "Заполнение, %",
            "Статус"
        );

        int rowIdx = 1;
        for (CapacityRowDto rowDto : capacityRows) {
            ParticipantDto participant = rowDto.participant();
            String streams = participant.userStreams() == null
                ? ""
                : participant.userStreams().stream()
                    .filter(this::hasText)
                    .sorted(String.CASE_INSENSITIVE_ORDER)
                    .collect(Collectors.joining(", "));

            for (CapacityCellDto cell : rowDto.cells()) {
                SprintEntity sprint = resolveSprint(parseUuid(cell.sprintId()), sprintIndex);
                QuarterEntity quarter = resolveQuarter(sprint, quarterIndex);
                double available = cell.availableDays();
                double workload = cell.workloadDays();
                double balance = roundToOneDecimal(available - workload);
                double utilization = available == 0
                    ? (workload > 0 ? 100.0 : 0.0)
                    : roundToOneDecimal((workload / available) * 100.0);

                Row row = sheet.createRow(rowIdx++);
                int col = 0;
                row.createCell(col++).setCellValue(nullToEmpty(participant.fullName()));
                row.createCell(col++).setCellValue(nullToEmpty(participant.role()));
                row.createCell(col++).setCellValue(streams);
                row.createCell(col++).setCellValue(quarter != null ? nullToEmpty(quarter.getName()) : "");
                row.createCell(col++).setCellValue(sprint != null ? nullToEmpty(sprint.getName()) : "");
                setIntegerCell(row, col++, cell.workingDays(), styles.integer());
                setDecimalCell(row, col++, cell.rate(), styles.decimal());
                setDecimalCell(row, col++, available, styles.decimal());
                setDecimalCell(row, col++, workload, styles.decimal());
                setDecimalCell(row, col++, balance, styles.decimal());
                setDecimalCell(row, col++, utilization, styles.decimal());
                row.createCell(col).setCellValue(resolveCapacityStatus(workload, available, cell.capacityFactor()));
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeViewParticipantsSheet(
        Workbook workbook,
        ExportStyles styles,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex,
        Map<UUID, ParticipantEntity> participantIndex,
        List<TaskEntity> tasks
    ) {
        final int columns = 14;
        Sheet sheet = workbook.createSheet("View_ПоСотрудникам");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "Участник",
            "Роль",
            "Стримы участника",
            "Задача",
            "Приоритет",
            "Статус задачи",
            "Заказчики",
            "Стримы задачи",
            "Релиз",
            "Спринт",
            "Квартал",
            "Аллокация, дн",
            "Нагрузка задачи, дн",
            "Комментарий"
        );

        Map<String, Double> taskLoadByTaskAndSprint = buildTaskLoadByTaskAndSprint(tasks);
        int rowIdx = 1;

        for (TaskEntity task : tasks) {
            Set<String> participantsWithAllocation = new LinkedHashSet<>();
            List<TaskAllocationEntity> allocations = task.getAllocations().stream()
                .sorted(Comparator
                    .comparing((TaskAllocationEntity alloc) -> participantOrder(alloc.getParticipant(), participantIndex))
                    .thenComparing(alloc -> resolveSprint(alloc.getSprint(), sprintIndex).getStartDate()))
                .toList();

            for (TaskAllocationEntity allocation : allocations) {
                SprintEntity sprint = resolveSprint(allocation.getSprint(), sprintIndex);
                QuarterEntity quarter = resolveQuarter(sprint, quarterIndex);
                ParticipantEntity participant = resolveParticipant(allocation.getParticipant(), participantIndex);
                if (participant == null) {
                    continue;
                }
                participantsWithAllocation.add(participant.getId().toString());
                Row row = sheet.createRow(rowIdx++);
                writeParticipantTaskViewRow(
                    row,
                    styles,
                    taskLoadByTaskAndSprint,
                    task,
                    participant,
                    sprint,
                    quarter,
                    toDouble(allocation.getDays()),
                    ""
                );
            }

            List<TaskParticipantEntity> members = sortedTaskParticipants(task.getParticipants());
            for (TaskParticipantEntity member : members) {
                ParticipantEntity participant = resolveParticipant(member.getParticipant(), participantIndex);
                if (participant == null) {
                    continue;
                }
                if (participantsWithAllocation.contains(participant.getId().toString())) {
                    continue;
                }
                Row row = sheet.createRow(rowIdx++);
                writeParticipantTaskViewRow(
                    row,
                    styles,
                    taskLoadByTaskAndSprint,
                    task,
                    participant,
                    null,
                    null,
                    0.0,
                    "Участник в задаче без аллокации"
                );
            }
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private void writeParticipantTaskViewRow(
        Row row,
        ExportStyles styles,
        Map<String, Double> taskLoadByTaskAndSprint,
        TaskEntity task,
        ParticipantEntity participant,
        SprintEntity sprint,
        QuarterEntity quarter,
        double allocationDays,
        String comment
    ) {
        int col = 0;
        row.createCell(col++).setCellValue(nullToEmpty(participant.getFullName()));
        row.createCell(col++).setCellValue(nullToEmpty(participant.getRole()));
        row.createCell(col++).setCellValue(joinUserStreams(participant));
        row.createCell(col++).setCellValue(nullToEmpty(task.getTitle()));
        setIntegerCell(row, col++, task.getPriority(), styles.integer());
        row.createCell(col++).setCellValue(nullToEmpty(task.getStatus()));
        row.createCell(col++).setCellValue(String.join(", ", collectTaskCustomers(task)));
        row.createCell(col++).setCellValue(String.join(", ", collectTaskStreams(task)));
        row.createCell(col++).setCellValue(resolveReleaseName(task));
        row.createCell(col++).setCellValue(sprint != null ? nullToEmpty(sprint.getName()) : "");
        row.createCell(col++).setCellValue(quarter != null ? nullToEmpty(quarter.getName()) : "");
        setDecimalCell(row, col++, allocationDays, styles.decimal());
        double taskLoad = sprint == null
            ? 0.0
            : taskLoadByTaskAndSprint.getOrDefault(task.getId() + "|" + sprint.getId(), 0.0);
        setDecimalCell(row, col++, taskLoad, styles.decimal());
        row.createCell(col).setCellValue(comment);
    }

    private void writeViewHistorySheet(Workbook workbook, ExportStyles styles, List<ApiCallHistoryEntity> historyEntries) {
        final int columns = 7;
        Sheet sheet = workbook.createSheet("View_История");
        Row header = sheet.createRow(0);
        createHeaderCells(
            header,
            styles.header(),
            "Дата/время",
            "Пользователь",
            "Сессия",
            "Действие",
            "Метод",
            "Путь",
            "Код ответа"
        );

        List<ApiCallHistoryEntity> actions = historyEntries.stream()
            .filter(this::isActionHistory)
            .sorted(Comparator.comparing(ApiCallHistoryEntity::getCreatedAt).reversed())
            .toList();

        int rowIdx = 1;
        for (ApiCallHistoryEntity action : actions) {
            Row row = sheet.createRow(rowIdx++);
            int col = 0;
            setDateTimeCell(row, col++, action.getCreatedAt(), styles.dateTime());
            row.createCell(col++).setCellValue(nullToEmpty(action.getUserName()));
            row.createCell(col++).setCellValue(nullToEmpty(action.getSessionId()));
            row.createCell(col++).setCellValue(nullToEmpty(action.getAction()));
            row.createCell(col++).setCellValue(nullToEmpty(action.getHttpMethod()));
            row.createCell(col++).setCellValue(nullToEmpty(action.getPath()));
            setIntegerCell(row, col, action.getStatusCode(), styles.integer());
        }

        finalizeSheet(sheet, columns, rowIdx - 1);
    }

    private ExportStyles createStyles(Workbook workbook) {
        CreationHelper creationHelper = workbook.getCreationHelper();
        DataFormat dataFormat = creationHelper.createDataFormat();

        CellStyle header = workbook.createCellStyle();
        var headerFont = workbook.createFont();
        headerFont.setBold(true);
        header.setFont(headerFont);
        header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        header.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        CellStyle date = workbook.createCellStyle();
        date.setDataFormat(dataFormat.getFormat("yyyy-mm-dd"));

        CellStyle dateTime = workbook.createCellStyle();
        dateTime.setDataFormat(dataFormat.getFormat("yyyy-mm-dd hh:mm"));

        CellStyle decimal = workbook.createCellStyle();
        decimal.setDataFormat(dataFormat.getFormat("#,##0.0#"));

        CellStyle integer = workbook.createCellStyle();
        integer.setDataFormat(dataFormat.getFormat("0"));

        CellStyle wrappedText = workbook.createCellStyle();
        wrappedText.setWrapText(true);
        wrappedText.setVerticalAlignment(VerticalAlignment.TOP);

        return new ExportStyles(header, date, dateTime, decimal, integer, wrappedText);
    }

    private void createHeaderCells(Row header, CellStyle style, String... titles) {
        for (int i = 0; i < titles.length; i++) {
            Cell cell = header.createCell(i);
            cell.setCellValue(titles[i]);
            cell.setCellStyle(style);
        }
    }

    private void finalizeSheet(Sheet sheet, int columns, int lastRow) {
        if (columns <= 0) {
            return;
        }
        sheet.createFreezePane(0, 1);
        sheet.setAutoFilter(new CellRangeAddress(0, Math.max(lastRow, 0), 0, columns - 1));
        autosize(sheet, columns);
    }

    private void setDateCell(Row row, int columnIndex, LocalDate date, CellStyle style) {
        Cell cell = row.createCell(columnIndex);
        if (date == null) {
            cell.setCellValue("");
            return;
        }
        cell.setCellValue(java.sql.Date.valueOf(date));
        cell.setCellStyle(style);
    }

    private void setDateTimeCell(Row row, int columnIndex, OffsetDateTime dateTime, CellStyle style) {
        Cell cell = row.createCell(columnIndex);
        if (dateTime == null) {
            cell.setCellValue("");
            return;
        }
        cell.setCellValue(java.util.Date.from(dateTime.toInstant()));
        cell.setCellStyle(style);
    }

    private void setDecimalCell(Row row, int columnIndex, double value, CellStyle style) {
        Cell cell = row.createCell(columnIndex);
        cell.setCellValue(value);
        cell.setCellStyle(style);
    }

    private void setIntegerCell(Row row, int columnIndex, int value, CellStyle style) {
        Cell cell = row.createCell(columnIndex);
        cell.setCellValue(value);
        cell.setCellStyle(style);
    }

    private String joinParticipants(Iterable<TaskParticipantEntity> participants, Map<UUID, ParticipantEntity> participantIndex) {
        return sortedTaskParticipants(participants).stream()
            .map(tp -> resolveParticipant(tp.getParticipant(), participantIndex))
            .filter(participant -> participant != null && hasText(participant.getFullName()))
            .map(ParticipantEntity::getFullName)
            .collect(Collectors.joining(", "));
    }

    private List<TaskParticipantEntity> sortedTaskParticipants(Iterable<TaskParticipantEntity> participants) {
        List<TaskParticipantEntity> list = new ArrayList<>();
        for (TaskParticipantEntity participant : participants) {
            list.add(participant);
        }
        list.sort(Comparator.comparingInt(TaskParticipantEntity::getDisplayOrder));
        return list;
    }

    private List<String> collectTaskCustomers(TaskEntity task) {
        Set<String> result = new LinkedHashSet<>();
        if (task.getCustomers() != null) {
            for (TaskCustomerEntity customer : task.getCustomers()) {
                addIfHasText(result, customer.getName());
            }
        }
        if (result.isEmpty()) {
            addIfHasText(result, task.getCustomer());
        }
        return result.stream().sorted(String.CASE_INSENSITIVE_ORDER).toList();
    }

    private List<String> collectTaskStreams(TaskEntity task) {
        Set<String> result = new LinkedHashSet<>();
        if (task.getStreams() != null) {
            for (TaskStreamEntity stream : task.getStreams()) {
                addIfHasText(result, stream.getName());
            }
        }
        if (result.isEmpty()) {
            addIfHasText(result, task.getStream());
        }
        return result.stream().sorted(String.CASE_INSENSITIVE_ORDER).toList();
    }

    private String resolveLeaderName(TaskEntity task, Map<UUID, ParticipantEntity> participantIndex) {
        if (task.getLeaderParticipant() == null) {
            return "";
        }
        ParticipantEntity leader = resolveParticipant(task.getLeaderParticipant(), participantIndex);
        return leader != null ? nullToEmpty(leader.getFullName()) : "";
    }

    private LocalDate resolveReleasePromDate(TaskEntity task) {
        if (task.getReleaseDate() == null) {
            return null;
        }
        return task.getReleaseDate().getPromDate();
    }

    private String resolveReleaseName(TaskEntity task) {
        if (task.getReleaseDate() == null) {
            return "";
        }
        ReleaseEntity release = task.getReleaseDate();
        if (hasText(release.getName())) {
            return release.getName().trim();
        }
        if (release.getPromDate() != null) {
            return "Релиз " + release.getPromDate();
        }
        return "";
    }

    private String resolveReleaseSprintName(TaskEntity task, Map<UUID, SprintEntity> sprintIndex) {
        if (task.getReleaseDate() == null || task.getReleaseDate().getPromDate() == null) {
            return "";
        }
        LocalDate releaseDate = task.getReleaseDate().getPromDate();
        for (SprintEntity sprint : sprintIndex.values()) {
            if (!releaseDate.isBefore(sprint.getStartDate()) && !releaseDate.isAfter(sprint.getEndDate())) {
                return nullToEmpty(sprint.getName());
            }
        }
        return "";
    }

    private String joinTaskQuarterNames(
        TaskEntity task,
        Map<UUID, SprintEntity> sprintIndex,
        Map<UUID, QuarterEntity> quarterIndex
    ) {
        Set<String> names = new LinkedHashSet<>();
        for (TaskLoadEntity load : task.getLoads()) {
            SprintEntity sprint = resolveSprint(load.getSprint(), sprintIndex);
            addIfHasText(names, resolveQuarterName(sprint, quarterIndex));
        }
        return names.stream().sorted(String.CASE_INSENSITIVE_ORDER).collect(Collectors.joining(", "));
    }

    private String joinUserStreams(ParticipantEntity participant) {
        if (participant.getUserStreams() == null || participant.getUserStreams().isEmpty()) {
            return "";
        }
        return participant.getUserStreams().stream()
            .filter(this::hasText)
            .map(String::trim)
            .sorted(String.CASE_INSENSITIVE_ORDER)
            .collect(Collectors.joining(", "));
    }

    private ParticipantEntity resolveParticipant(
        ParticipantEntity participant,
        Map<UUID, ParticipantEntity> participantIndex
    ) {
        if (participant == null) {
            return null;
        }
        return participantIndex.getOrDefault(participant.getId(), participant);
    }

    private int participantOrder(ParticipantEntity participant, Map<UUID, ParticipantEntity> participantIndex) {
        ParticipantEntity resolved = resolveParticipant(participant, participantIndex);
        return resolved == null ? Integer.MAX_VALUE : resolved.getDisplayOrder();
    }

    private SprintEntity resolveSprint(SprintEntity sprint, Map<UUID, SprintEntity> sprintIndex) {
        if (sprint == null) {
            return null;
        }
        return sprintIndex.getOrDefault(sprint.getId(), sprint);
    }

    private SprintEntity resolveSprint(UUID sprintId, Map<UUID, SprintEntity> sprintIndex) {
        if (sprintId == null) {
            return null;
        }
        return sprintIndex.get(sprintId);
    }

    private QuarterEntity resolveQuarter(SprintEntity sprint, Map<UUID, QuarterEntity> quarterIndex) {
        if (sprint == null || sprint.getQuarter() == null) {
            return null;
        }
        return quarterIndex.getOrDefault(sprint.getQuarter().getId(), sprint.getQuarter());
    }

    private String resolveQuarterName(SprintEntity sprint, Map<UUID, QuarterEntity> quarterIndex) {
        QuarterEntity quarter = resolveQuarter(sprint, quarterIndex);
        return quarter != null ? nullToEmpty(quarter.getName()) : "";
    }

    private Map<String, Double> buildTaskLoadByTaskAndSprint(List<TaskEntity> tasks) {
        Map<String, Double> result = new LinkedHashMap<>();
        for (TaskEntity task : tasks) {
            for (TaskLoadEntity load : task.getLoads()) {
                if (load.getSprint() == null) {
                    continue;
                }
                String key = task.getId() + "|" + load.getSprint().getId();
                result.merge(key, toDouble(load.getDays()), Double::sum);
            }
        }
        return result;
    }

    private String resolveCapacityStatus(double workload, double available, double capacityFactor) {
        if (available == 0.0) {
            return workload > 0.0 ? "Перегруз" : "Нет нагрузки";
        }
        double low = capacityFactor * available;
        double high = (2.0 - capacityFactor) * available;
        if (workload < low) {
            return "Недозагрузка";
        }
        if (workload > high) {
            return "Перегруз";
        }
        return "Норма";
    }

    private boolean isActionHistory(ApiCallHistoryEntity entity) {
        return !"GET".equalsIgnoreCase(entity.getHttpMethod());
    }

    private UUID parseUuid(String value) {
        if (!hasText(value)) {
            return null;
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private void addIfHasText(Set<String> values, String value) {
        if (hasText(value)) {
            values.add(value.trim());
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String nullToEmpty(String value) {
        return value != null ? value : "";
    }

    private List<String> withFallbackValue(List<String> values, String fallback) {
        if (values == null || values.isEmpty()) {
            return List.of(fallback);
        }
        return values;
    }

    private double toDouble(BigDecimal value) {
        return value == null ? 0.0 : value.doubleValue();
    }

    private double roundToOneDecimal(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private void autosize(Sheet sheet, int columns) {
        for (int i = 0; i < columns; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private record ExportStyles(
        CellStyle header,
        CellStyle date,
        CellStyle dateTime,
        CellStyle decimal,
        CellStyle integer,
        CellStyle wrappedText
    ) {
    }

    private record FilterParticipantRow(String id, String name, String role) {
    }
}
