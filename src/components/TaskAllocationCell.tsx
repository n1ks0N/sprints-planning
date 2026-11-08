import * as React from "react";
import EditableNumberCell, { type EditableNumberCellProps } from "./EditableNumberCell";

type ChangeHandler = (taskId: string, participantId: string, sprintId: string, value: number) => void;
type Props = Pick<EditableNumberCellProps, "value" | "title" | "dataTestId"> & {
  taskId: string;
  participantId: string;
  sprintId: string;
  onChange: ChangeHandler;
  onCommit?: ChangeHandler;
};

/** Stable callbacks let unrelated cells keep their editor and avoid re-rendering. */
const TaskAllocationCell = React.memo(function TaskAllocationCell({ taskId, participantId, sprintId, onChange, onCommit, ...props }: Props) {
  const change = React.useCallback((value: number) => onChange(taskId, participantId, sprintId, value), [onChange, taskId, participantId, sprintId]);
  const commit = React.useCallback((value: number) => onCommit?.(taskId, participantId, sprintId, value), [onCommit, taskId, participantId, sprintId]);
  return <EditableNumberCell {...props} onChange={change} onCommit={commit} />;
});

export default TaskAllocationCell;
