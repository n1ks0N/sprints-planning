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
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
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

    private static final int BUSINESS_COL = 0; // A
    private static final int STREAM_COL = 1; // B
    private static final int DOD_COL = 2; // C
    private static final int TITLE_COL = 3; // D
    private static final int DETAILS_COL = 4; // E
    private static final int PRIORITY_COL = 5; // F
    private static final int TOTAL_COL = 6; // G
    private static final int BASE_SPRINT_COLUMN = 7; // H
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
        Map<String, String> releaseLabelsById = buildReleaseLabelsById(releases);

        List<ParticipantEntity> participants = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey);
        Map<String, ParticipantEntity> participantIndex = participants.stream()
            .collect(Collectors.toMap(p -> p.getId().toString(), p -> p, (a, b) -> a, LinkedHashMap::new));

        List<TaskDto> tasks = taskService.findAll(teamKey, effectiveFilter);
        List<CapacityRowDto> capacityRows = capacityService.calculate(teamKey, quarterIds, List.of(), List.of(), List.of());

        try (SXSSFWorkbook workbook = new SXSSFWorkbook(200); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            workbook.setCompressTempFiles(true);
            Styles styles = createStyles(workbook);
            Sheet backlogSheet = workbook.createSheet("Оценка");
            Sheet workloadSheet = workbook.createSheet("Нагрузка");

            int sprintColumns = sprints.size();
            int responsibleCol = BASE_SPRINT_COLUMN + sprintColumns;
            int directionCol = responsibleCol + 1;

            int tableHeaderRow = 0;
            writeBacklogHeader(backlogSheet, styles, tableHeaderRow, sprints, responsibleCol, directionCol);

            int firstDataRow = tableHeaderRow + 1;
            int lastDataRow = writeBacklogRows(
                backlogSheet,
                styles,
                firstDataRow,
                sprints,
                tasks,
                releaseLabelsById,
                participantIndex,
                responsibleCol,
                directionCol
            );

            int filterLastRow = Math.max(tableHeaderRow, lastDataRow);
            backlogSheet.setAutoFilter(new CellRangeAddress(tableHeaderRow, filterLastRow, 0, directionCol));
            backlogSheet.createFreezePane(0, tableHeaderRow + 1);
            configureBacklogColumns(backlogSheet, sprintColumns, responsibleCol, directionCol);

            int matrixHeaderRow = 1;
            int matrixLastRow = writeCapacityBlock(
                workloadSheet,
                styles,
                matrixHeaderRow,
                0,
                sprints,
                capacityRows
            );
            int workloadLastCol = sprintColumns + 4;
            workloadSheet.setAutoFilter(new CellRangeAddress(matrixHeaderRow, Math.max(matrixHeaderRow, matrixLastRow), 0, workloadLastCol));
            workloadSheet.createFreezePane(0, matrixHeaderRow + 1);
            configureCapacityColumns(workloadSheet, sprintColumns);

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
        int matrixStartCol,
        List<SprintEntity> sprints,
        List<CapacityRowDto> capacityRows
    ) {
        int sprintColumns = sprints.size();
        int matrixSprintStartCol = matrixStartCol + 2;
        int limitCol = matrixSprintStartCol + sprintColumns;
        int totalCol = limitCol + 1;
        int diffCol = limitCol + 2;

        Row titleRow = sheet.createRow(Math.max(0, headerRowIndex - 1));
        Cell titleCell = titleRow.createCell(matrixStartCol);
        titleCell.setCellValue("Расчет нагрузки на спринт");
        titleCell.setCellStyle(styles.section());
        sheet.addMergedRegion(new CellRangeAddress(
            titleRow.getRowNum(),
            titleRow.getRowNum(),
            matrixStartCol,
            matrixStartCol + 1
        ));

        Row header = sheet.createRow(headerRowIndex);
        createCell(header, matrixStartCol, "Участник", styles.header());
        createCell(header, matrixStartCol + 1, "Роль", styles.header());

        for (int i = 0; i < sprints.size(); i++) {
            SprintEntity sprint = sprints.get(i);
            createCell(
                header,
                matrixSprintStartCol + i,
                sprintHeader(sprint),
                styles.headerWrap()
            );
        }

        createCell(header, limitCol, "Предел\nнагрузки", styles.headerWrap());
        createCell(header, totalCol, "Итого\nнагрузка", styles.headerWrap());
        createCell(header, diffCol, "Разница", styles.header());

        int rowIdx = headerRowIndex + 1;
        for (CapacityRowDto rowDto : capacityRows) {
            Row row = sheet.createRow(rowIdx++);
            createCell(row, matrixStartCol, rowDto.participant().fullName(), styles.base());
            createCell(row, matrixStartCol + 1, rowDto.participant().role(), styles.base());

            Map<String, Double> workloadBySprint = rowDto.cells().stream()
                .collect(Collectors.toMap(CapacityCellDto::sprintId, CapacityCellDto::workloadDays, (a, b) -> a));

            for (int i = 0; i < sprints.size(); i++) {
                String sprintId = sprints.get(i).getId().toString();
                setNumber(
                    row,
                    matrixSprintStartCol + i,
                    workloadBySprint.get(sprintId),
                    styles.integerNumber(),
                    styles.decimalNumber(),
                    false
                );
            }

            double limit = sprintColumns > 0 ? rowDto.totalQuarterAvailable() / sprintColumns : rowDto.totalQuarterAvailable();
            setNumber(row, limitCol, limit, styles.integerNumber(), styles.decimalNumber(), true);
            setNumber(
                row,
                totalCol,
                rowDto.totalQuarterWorkload(),
                styles.integerNumber(),
                styles.decimalNumber(),
                true
            );
            setNumber(
                row,
                diffCol,
                rowDto.totalQuarterAvailable() - rowDto.totalQuarterWorkload(),
                styles.integerNumber(),
                styles.decimalNumber(),
                true
            );
        }

        return rowIdx - 1;
    }

    private void writeBacklogHeader(
        Sheet sheet,
        Styles styles,
        int rowIndex,
        List<SprintEntity> sprints,
        int responsibleCol,
        int directionCol
    ) {
        Row header = sheet.createRow(rowIndex);
        createCell(header, BUSINESS_COL, "Заказчик", styles.header());
        createCell(header, STREAM_COL, "Стрим", styles.header());
        createCell(header, DOD_COL, "DOD (название для сводной)", styles.header());
        createCell(header, TITLE_COL, "Название доработки", styles.header());
        createCell(header, DETAILS_COL, "Описание", styles.header());
        createCell(header, PRIORITY_COL, "Приоритет", styles.header());
        createCell(header, TOTAL_COL, "Трудозатраты", styles.header());

        for (int i = 0; i < sprints.size(); i++) {
            SprintEntity sprint = sprints.get(i);
            createCell(
                header,
                BASE_SPRINT_COLUMN + i,
                sprintHeader(sprint),
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
        Map<String, String> releaseLabelsById,
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
            createCell(summary, BUSINESS_COL, joinValues(task.customers()), styles.summaryText());
            createCell(summary, STREAM_COL, joinValues(task.streams()), styles.summaryText());
            createCell(summary, DOD_COL, safe(task.dod()), styles.summaryText());
            createCell(summary, TITLE_COL, safe(task.title()), styles.summaryText());
            createCell(summary, DETAILS_COL, safe(task.description()), styles.summaryText());
            createCell(summary, PRIORITY_COL, String.valueOf(task.priority()), styles.summaryText());

            double taskTotal = 0.0;
            for (int i = 0; i < sprints.size(); i++) {
                SprintEntity sprint = sprints.get(i);
                Double value = decimalValue(task.loads(), sprint.getId().toString());
                if (value != null) {
                    taskTotal += value;
                }
                if (isReleaseSprint(task, sprint)) {
                    createCell(
                        summary,
                        BASE_SPRINT_COLUMN + i,
                        releaseCellValue(value, releaseLabelsById.get(task.releaseDateId())),
                        styles.summaryWrap()
                    );
                } else {
                    setNumber(
                        summary,
                        BASE_SPRINT_COLUMN + i,
                        value,
                        styles.integerSummaryNumber(),
                        styles.decimalSummaryNumber(),
                        false
                    );
                }
            }

            setNumber(summary, TOTAL_COL, taskTotal, styles.integerSummaryNumber(), styles.decimalSummaryNumber(), true);
            createCell(summary, responsibleCol, "Ответственные", styles.summaryText());
            createCell(summary, directionCol, firstOrEmpty(task.customers()), styles.summaryText());

            List<String> participants = task.participantIds() != null ? task.participantIds() : List.of();
            for (String participantId : participants) {
                Row detail = sheet.createRow(rowIdx++);
                ParticipantEntity participant = participantIndex.get(participantId);
                String role = participant != null ? safe(participant.getRole()) : "";
                String fullName = participant != null ? safe(participant.getFullName()) : participantId;

                createCell(detail, TITLE_COL, safe(task.title()), styles.baseWrap());
                createCell(detail, DETAILS_COL, safe(task.description()), styles.baseWrap());
                createCell(detail, PRIORITY_COL, String.valueOf(task.priority()), styles.base());

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
                    setNumber(
                        detail,
                        BASE_SPRINT_COLUMN + i,
                        value,
                        styles.integerNumber(),
                        styles.decimalNumber(),
                        false
                    );
                }

                setNumber(detail, TOTAL_COL, personTotal, styles.integerNumber(), styles.decimalNumber(), false);
                createCell(detail, responsibleCol, fullName, styles.base());
                createCell(detail, directionCol, role, styles.base());
            }
        }

        return rowIdx - 1;
    }

    private Map<String, String> buildReleaseLabelsById(List<ReleaseEntity> releases) {
        return releases.stream()
            .filter(release -> release.getId() != null && release.getPromDate() != null)
            .collect(Collectors.toMap(
                release -> release.getId().toString(),
                release -> "релиз " + SHORT_DATE.format(release.getPromDate()),
                (a, b) -> a,
                LinkedHashMap::new
            ));
    }

    private boolean isReleaseSprint(TaskDto task, SprintEntity sprint) {
        return task.releaseSprintId() != null
            && sprint.getId() != null
            && task.releaseSprintId().equals(sprint.getId().toString());
    }

    private String releaseCellValue(Double value, String releaseLabel) {
        String load = formatNumber(value);
        if (releaseLabel == null || releaseLabel.isBlank()) {
            return load;
        }
        if (load.isBlank()) {
            return releaseLabel;
        }
        return load + "\n" + releaseLabel;
    }

    private String sprintHeader(SprintEntity sprint) {
        return SHORT_DATE.format(sprint.getStartDate()) + "-" + SHORT_DATE.format(sprint.getEndDate());
    }

    private void configureBacklogColumns(Sheet sheet, int sprintColumns, int responsibleCol, int directionCol) {
        sheet.setColumnWidth(BUSINESS_COL, 20 * 256);
        sheet.setColumnWidth(STREAM_COL, 20 * 256);
        sheet.setColumnWidth(DOD_COL, 36 * 256);
        sheet.setColumnWidth(TITLE_COL, 28 * 256);
        sheet.setColumnWidth(DETAILS_COL, 40 * 256);
        sheet.setColumnWidth(PRIORITY_COL, 10 * 256);
        sheet.setColumnWidth(TOTAL_COL, 12 * 256);

        for (int i = 0; i < sprintColumns; i++) {
            sheet.setColumnWidth(BASE_SPRINT_COLUMN + i, 13 * 256);
        }

        sheet.setColumnWidth(responsibleCol, 26 * 256);
        sheet.setColumnWidth(directionCol, 18 * 256);
    }

    private void configureCapacityColumns(Sheet sheet, int sprintColumns) {
        sheet.setColumnWidth(0, 20 * 256);
        sheet.setColumnWidth(1, 14 * 256);
        for (int i = 0; i < sprintColumns; i++) {
            sheet.setColumnWidth(2 + i, 13 * 256);
        }
        sheet.setColumnWidth(2 + sprintColumns, 14 * 256);
        sheet.setColumnWidth(3 + sprintColumns, 14 * 256);
        sheet.setColumnWidth(4 + sprintColumns, 12 * 256);
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

        CellStyle integerNumber = workbook.createCellStyle();
        integerNumber.cloneStyleFrom(base);
        integerNumber.setDataFormat(dataFormat.getFormat("0"));

        CellStyle decimalNumber = workbook.createCellStyle();
        decimalNumber.cloneStyleFrom(base);
        decimalNumber.setDataFormat(dataFormat.getFormat("0.##"));

        CellStyle summaryText = workbook.createCellStyle();
        summaryText.cloneStyleFrom(baseWrap);
        summaryText.setFont(bold);
        summaryText.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex());
        summaryText.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        CellStyle summaryWrap = workbook.createCellStyle();
        summaryWrap.cloneStyleFrom(summaryText);

        CellStyle integerSummaryNumber = workbook.createCellStyle();
        integerSummaryNumber.cloneStyleFrom(integerNumber);
        integerSummaryNumber.setFont(bold);
        integerSummaryNumber.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex());
        integerSummaryNumber.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        CellStyle decimalSummaryNumber = workbook.createCellStyle();
        decimalSummaryNumber.cloneStyleFrom(decimalNumber);
        decimalSummaryNumber.setFont(bold);
        decimalSummaryNumber.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex());
        decimalSummaryNumber.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        return new Styles(
            section,
            header,
            headerWrap,
            base,
            baseWrap,
            integerNumber,
            decimalNumber,
            summaryText,
            summaryWrap,
            integerSummaryNumber,
            decimalSummaryNumber
        );
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

    private void setNumber(
        Row row,
        int col,
        Double value,
        CellStyle integerStyle,
        CellStyle decimalStyle,
        boolean forceZero
    ) {
        if (value == null && !forceZero) {
            return;
        }

        double normalized = value != null ? value : 0.0;
        if (!forceZero && Math.abs(normalized) < 1e-9) {
            return;
        }

        Cell cell = row.createCell(col);
        cell.setCellValue(normalized);
        cell.setCellStyle(isWholeNumber(normalized) ? integerStyle : decimalStyle);
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

    private boolean isWholeNumber(double value) {
        return Math.abs(value - Math.rint(value)) < 1e-9;
    }

    private String formatNumber(Double value) {
        if (value == null) {
            return "";
        }
        if (isWholeNumber(value)) {
            return String.valueOf((long) Math.rint(value));
        }
        return java.math.BigDecimal.valueOf(value)
            .stripTrailingZeros()
            .toPlainString();
    }

    private record Styles(
        CellStyle section,
        CellStyle header,
        CellStyle headerWrap,
        CellStyle base,
        CellStyle baseWrap,
        CellStyle integerNumber,
        CellStyle decimalNumber,
        CellStyle summaryText,
        CellStyle summaryWrap,
        CellStyle integerSummaryNumber,
        CellStyle decimalSummaryNumber
    ) {
    }
}
