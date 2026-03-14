package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.CapacityCellDto;
import com.sber.isu.sprints_planning.dto.CapacityRowDto;
import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import jakarta.transaction.Transactional;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormat;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;

@Service
public class ExportService {

    private static final int BASE_SPRINT_COLUMN = 10; // K
    private static final DateTimeFormatter SHORT_DATE = DateTimeFormatter.ofPattern("dd.MM");

    private final SprintRepository sprintRepository;
    private final ParticipantRepository participantRepository;
    private final ReleaseRepository releaseRepository;
    private final TaskService taskService;
    private final CapacityService capacityService;

    public ExportService(
        SprintRepository sprintRepository,
        ParticipantRepository participantRepository,
        ReleaseRepository releaseRepository,
        TaskService taskService,
        CapacityService capacityService
    ) {
        this.sprintRepository = sprintRepository;
        this.participantRepository = participantRepository;
        this.releaseRepository = releaseRepository;
        this.taskService = taskService;
        this.capacityService = capacityService;
    }

    @Transactional
    public byte[] exportToExcel(String teamKey) {
        return exportToExcel(teamKey, TaskFilter.empty());
    }

    @Transactional
    public byte[] exportToExcel(String teamKey, TaskFilter filter) {
        TaskFilter effectiveFilter = filter == null ? TaskFilter.empty() : filter;
        List<UUID> quarterIds = new ArrayList<>(effectiveFilter.quarterIds());

        List<SprintEntity> sprints = quarterIds.isEmpty()
            ? sprintRepository.findByTeamKeyOrderByQuarterAndOrder(teamKey)
            : sprintRepository.findByTeamKeyAndQuarterIdsOrderByQuarterAndOrder(teamKey, quarterIds);

        List<ReleaseEntity> releases = releaseRepository.findAllByTeamKeyOrderByPromDateAsc(teamKey);
        Map<String, String> releaseLabelsBySprintId = buildReleaseLabelsBySprint(sprints, releases);

        List<ParticipantEntity> participants = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey);
        Map<String, ParticipantEntity> participantIndex = participants.stream()
            .collect(Collectors.toMap(p -> p.getId().toString(), p -> p, (a, b) -> a, LinkedHashMap::new));

        List<TaskDto> tasks = taskService.findAll(teamKey, effectiveFilter);
        List<CapacityRowDto> capacityRows = capacityService.calculate(teamKey, quarterIds, List.of(), List.of(), List.of());

        try (SXSSFWorkbook workbook = new SXSSFWorkbook(200); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            workbook.setCompressTempFiles(true);
            Styles styles = createStyles(workbook);
            Sheet sheet = workbook.createSheet("Оценка");

            int sprintColumns = sprints.size();
            int responsibleCol = BASE_SPRINT_COLUMN + sprintColumns;
            int directionCol = responsibleCol + 1;

            int matrixHeaderRow = 1;
            int matrixLastRow = writeCapacityBlock(
                sheet,
                styles,
                matrixHeaderRow,
                sprints,
                releaseLabelsBySprintId,
                capacityRows
            );

            int tableHeaderRow = Math.max(33, matrixLastRow + 2);
            writeBacklogHeader(sheet, styles, tableHeaderRow, sprints, releaseLabelsBySprintId, responsibleCol, directionCol);

            int firstDataRow = tableHeaderRow + 1;
            int lastDataRow = writeBacklogRows(
                sheet,
                styles,
                firstDataRow,
                sprints,
                tasks,
                participantIndex,
                responsibleCol,
                directionCol
            );

            int filterLastRow = Math.max(tableHeaderRow, lastDataRow);
            sheet.setAutoFilter(new CellRangeAddress(tableHeaderRow, filterLastRow, 0, directionCol));
            sheet.createFreezePane(0, tableHeaderRow + 1);
            configureColumns(sheet, sprints.size(), responsibleCol, directionCol);

            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Не удалось собрать Excel", e);
        }
    }

    private int writeCapacityBlock(
        Sheet sheet,
        Styles styles,
        int headerRowIndex,
        List<SprintEntity> sprints,
        Map<String, String> releaseLabelsBySprintId,
        List<CapacityRowDto> capacityRows
    ) {
        int sprintColumns = sprints.size();
        int limitCol = BASE_SPRINT_COLUMN + sprintColumns;
        int totalCol = limitCol + 1;
        int diffCol = limitCol + 2;

        Row titleRow = sheet.createRow(Math.max(0, headerRowIndex - 1));
        Cell titleCell = titleRow.createCell(8);
        titleCell.setCellValue("Расчет нагрузки на спринт");
        titleCell.setCellStyle(styles.section());
        sheet.addMergedRegion(new CellRangeAddress(titleRow.getRowNum(), titleRow.getRowNum(), 8, 9));

        Row header = sheet.createRow(headerRowIndex);
        createCell(header, 8, "Участник", styles.header());
        createCell(header, 9, "Роль", styles.header());

        for (int i = 0; i < sprints.size(); i++) {
            SprintEntity sprint = sprints.get(i);
            createCell(
                header,
                BASE_SPRINT_COLUMN + i,
                sprintHeader(sprint, releaseLabelsBySprintId.get(sprint.getId().toString())),
                styles.headerWrap()
            );
        }

        createCell(header, limitCol, "Предел\nнагрузки", styles.headerWrap());
        createCell(header, totalCol, "Итого\nнагрузка", styles.headerWrap());
        createCell(header, diffCol, "Разница", styles.header());

        int rowIdx = headerRowIndex + 1;
        for (CapacityRowDto rowDto : capacityRows) {
            Row row = sheet.createRow(rowIdx++);
            createCell(row, 8, rowDto.participant().fullName(), styles.base());
            createCell(row, 9, rowDto.participant().role(), styles.base());

            Map<String, Double> workloadBySprint = rowDto.cells().stream()
                .collect(Collectors.toMap(CapacityCellDto::sprintId, CapacityCellDto::workloadDays, (a, b) -> a));

            for (int i = 0; i < sprints.size(); i++) {
                String sprintId = sprints.get(i).getId().toString();
                setNumber(row, BASE_SPRINT_COLUMN + i, workloadBySprint.get(sprintId), styles.number(), false);
            }

            double limit = sprintColumns > 0 ? rowDto.totalQuarterAvailable() / sprintColumns : rowDto.totalQuarterAvailable();
            setNumber(row, limitCol, limit, styles.number(), true);
            setNumber(row, totalCol, rowDto.totalQuarterWorkload(), styles.number(), true);
            setNumber(row, diffCol, rowDto.totalQuarterAvailable() - rowDto.totalQuarterWorkload(), styles.number(), true);
        }

        return rowIdx - 1;
    }

    private void writeBacklogHeader(
        Sheet sheet,
        Styles styles,
        int rowIndex,
        List<SprintEntity> sprints,
        Map<String, String> releaseLabelsBySprintId,
        int responsibleCol,
        int directionCol
    ) {
        Row header = sheet.createRow(rowIndex);
        createCell(header, 0, "Эпик", styles.header());
        createCell(header, 1, "Бизнес-задача / ИТ-повестка", styles.header());
        createCell(header, 2, "Стрим", styles.header());
        createCell(header, 3, "DOD (название для сводной)", styles.header());
        createCell(header, 4, "Название доработки", styles.header());
        createCell(header, 5, "Детали", styles.header());
        createCell(header, 6, "CR", styles.header());
        createCell(header, 7, "приоритет", styles.header());
        createCell(header, 8, "Доля задачи", styles.header());
        createCell(header, 9, "трудозатраты", styles.header());

        for (int i = 0; i < sprints.size(); i++) {
            SprintEntity sprint = sprints.get(i);
            createCell(
                header,
                BASE_SPRINT_COLUMN + i,
                sprintHeader(sprint, releaseLabelsBySprintId.get(sprint.getId().toString())),
                styles.headerWrap()
            );
        }

        createCell(header, responsibleCol, "Ответственные", styles.header());
        createCell(header, directionCol, "направление", styles.header());
    }

    private int writeBacklogRows(
        Sheet sheet,
        Styles styles,
        int startRow,
        List<SprintEntity> sprints,
        List<TaskDto> tasks,
        Map<String, ParticipantEntity> participantIndex,
        int responsibleCol,
        int directionCol
    ) {
        List<TaskDto> orderedTasks = tasks.stream()
            .sorted(Comparator
                .comparing((TaskDto t) -> t.order() != null ? t.order() : Integer.MAX_VALUE)
                .thenComparing(t -> t.title() != null ? t.title().toLowerCase() : ""))
            .toList();

        int rowIdx = startRow;
        for (TaskDto task : orderedTasks) {
            Row summary = sheet.createRow(rowIdx++);
            createCell(summary, 0, firstOrEmpty(task.streams()), styles.summaryText());
            createCell(summary, 1, joinValues(task.customers()), styles.summaryText());
            createCell(summary, 2, joinValues(task.streams()), styles.summaryText());
            createCell(summary, 3, safe(task.dod()), styles.summaryText());
            createCell(summary, 5, safe(task.title()), styles.summaryText());
            createCell(summary, 7, String.valueOf(task.priority()), styles.summaryText());

            double taskTotal = 0.0;
            for (int i = 0; i < sprints.size(); i++) {
                SprintEntity sprint = sprints.get(i);
                Double value = decimalValue(task.loads(), sprint.getId().toString());
                if (value != null) {
                    taskTotal += value;
                }
                setNumber(summary, BASE_SPRINT_COLUMN + i, value, styles.summaryNumber(), false);
            }

            setNumber(summary, 9, taskTotal, styles.summaryNumber(), true);
            createCell(summary, responsibleCol, "Ответственные", styles.summaryText());
            createCell(summary, directionCol, firstOrEmpty(task.customers()), styles.summaryText());

            List<String> participants = task.participantIds() != null ? task.participantIds() : List.of();
            for (String participantId : participants) {
                Row detail = sheet.createRow(rowIdx++);
                ParticipantEntity participant = participantIndex.get(participantId);
                String role = participant != null ? safe(participant.getRole()) : "";
                String fullName = participant != null ? safe(participant.getFullName()) : participantId;

                createCell(detail, 4, safe(task.title()), styles.baseWrap());
                createCell(detail, 5, safe(task.description()), styles.baseWrap());
                createCell(detail, 7, String.valueOf(task.priority()), styles.base());
                createCell(detail, 8, role, styles.base());

                double personTotal = 0.0;
                Map<String, java.math.BigDecimal> allocations = task.allocations() != null
                    ? task.allocations().get(participantId)
                    : null;
                for (int i = 0; i < sprints.size(); i++) {
                    SprintEntity sprint = sprints.get(i);
                    Double value = decimalValue(allocations, sprint.getId().toString());
                    if (value != null) {
                        personTotal += value;
                    }
                    setNumber(detail, BASE_SPRINT_COLUMN + i, value, styles.number(), false);
                }

                setNumber(detail, 9, personTotal, styles.number(), false);
                createCell(detail, responsibleCol, fullName, styles.base());
                createCell(detail, directionCol, role, styles.base());
            }
        }

        return rowIdx - 1;
    }

    private Map<String, String> buildReleaseLabelsBySprint(List<SprintEntity> sprints, List<ReleaseEntity> releases) {
        Map<String, LinkedHashSet<String>> labels = new LinkedHashMap<>();

        for (ReleaseEntity release : releases) {
            LocalDate prom = release.getPromDate();
            if (prom == null) {
                continue;
            }

            SprintEntity sprint = resolveSprintByDate(sprints, prom);
            if (sprint == null) {
                continue;
            }

            labels.computeIfAbsent(sprint.getId().toString(), k -> new LinkedHashSet<>())
                .add("релиз " + SHORT_DATE.format(prom));
        }

        return labels.entrySet().stream().collect(Collectors.toMap(
            Map.Entry::getKey,
            e -> String.join(", ", e.getValue()),
            (a, b) -> a,
            LinkedHashMap::new
        ));
    }

    private SprintEntity resolveSprintByDate(List<SprintEntity> sprints, LocalDate date) {
        for (SprintEntity sprint : sprints) {
            if (!date.isBefore(sprint.getStartDate()) && !date.isAfter(sprint.getEndDate())) {
                return sprint;
            }
        }
        return null;
    }

    private String sprintHeader(SprintEntity sprint, String releaseLabel) {
        String interval = SHORT_DATE.format(sprint.getStartDate()) + "-" + SHORT_DATE.format(sprint.getEndDate());
        if (releaseLabel == null || releaseLabel.isBlank()) {
            return interval;
        }
        return interval + "\n" + releaseLabel;
    }

    private void configureColumns(Sheet sheet, int sprintColumns, int responsibleCol, int directionCol) {
        sheet.setColumnWidth(0, 14 * 256);
        sheet.setColumnWidth(1, 20 * 256);
        sheet.setColumnWidth(2, 20 * 256);
        sheet.setColumnWidth(3, 36 * 256);
        sheet.setColumnWidth(4, 28 * 256);
        sheet.setColumnWidth(5, 40 * 256);
        sheet.setColumnWidth(6, 8 * 256);
        sheet.setColumnWidth(7, 10 * 256);
        sheet.setColumnWidth(8, 10 * 256);
        sheet.setColumnWidth(9, 12 * 256);

        for (int i = 0; i < sprintColumns; i++) {
            sheet.setColumnWidth(BASE_SPRINT_COLUMN + i, 13 * 256);
        }

        sheet.setColumnWidth(responsibleCol, 26 * 256);
        sheet.setColumnWidth(directionCol, 18 * 256);
    }

    private Styles createStyles(Workbook workbook) {
        DataFormat dataFormat = workbook.createDataFormat();
        Font bold = workbook.createFont();
        bold.setBold(true);

        CellStyle section = workbook.createCellStyle();
        section.setFont(bold);
        section.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        section.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        section.setVerticalAlignment(VerticalAlignment.TOP);
        applyBorder(section);

        CellStyle header = workbook.createCellStyle();
        header.setFont(bold);
        header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        header.setVerticalAlignment(VerticalAlignment.TOP);
        applyBorder(header);

        CellStyle headerWrap = workbook.createCellStyle();
        headerWrap.cloneStyleFrom(header);
        headerWrap.setWrapText(true);

        CellStyle base = workbook.createCellStyle();
        base.setVerticalAlignment(VerticalAlignment.TOP);
        applyBorder(base);

        CellStyle baseWrap = workbook.createCellStyle();
        baseWrap.cloneStyleFrom(base);
        baseWrap.setWrapText(true);

        CellStyle number = workbook.createCellStyle();
        number.cloneStyleFrom(base);
        number.setDataFormat(dataFormat.getFormat("0.##"));

        CellStyle summaryText = workbook.createCellStyle();
        summaryText.cloneStyleFrom(baseWrap);
        summaryText.setFont(bold);
        summaryText.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex());
        summaryText.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        CellStyle summaryNumber = workbook.createCellStyle();
        summaryNumber.cloneStyleFrom(number);
        summaryNumber.setFont(bold);
        summaryNumber.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex());
        summaryNumber.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        return new Styles(section, header, headerWrap, base, baseWrap, number, summaryText, summaryNumber);
    }

    private void applyBorder(CellStyle style) {
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
    }

    private void createCell(Row row, int col, String value, CellStyle style) {
        Cell cell = row.createCell(col);
        cell.setCellValue(value);
        cell.setCellStyle(style);
    }

    private void setNumber(Row row, int col, Double value, CellStyle style, boolean forceZero) {
        if (value == null && !forceZero) {
            return;
        }

        double normalized = value != null ? value : 0.0;
        if (!forceZero && Math.abs(normalized) < 1e-9) {
            return;
        }

        Cell cell = row.createCell(col);
        cell.setCellValue(normalized);
        cell.setCellStyle(style);
    }

    private Double decimalValue(Map<String, ? extends Number> values, String key) {
        if (values == null) {
            return null;
        }
        Number value = values.get(key);
        return value != null ? value.doubleValue() : null;
    }

    private String joinValues(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "";
        }
        return values.stream()
            .filter(v -> v != null && !v.isBlank())
            .collect(Collectors.joining(", "));
    }

    private String firstOrEmpty(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String safe(String value) {
        return value != null ? value : "";
    }

    private record Styles(
        CellStyle section,
        CellStyle header,
        CellStyle headerWrap,
        CellStyle base,
        CellStyle baseWrap,
        CellStyle number,
        CellStyle summaryText,
        CellStyle summaryNumber
    ) {
    }
}
