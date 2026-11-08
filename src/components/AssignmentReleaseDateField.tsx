import * as React from "react";
import { useGetReleaseOptionsQuery } from "../app/api";
import { selectCurrentTeamKey } from "../app/teamSlice";
import { useAppSelector } from "../views/hooks";
import { businessToday } from "../views/useToday";
import { formatReleaseDate } from "../utils/releaseDate";
import ReleaseDateField from "./ReleaseDateField";

type Props = Omit<React.ComponentProps<typeof ReleaseDateField>, "options" | "onOpen" | "onClose" | "loading"> & {
  options?: React.ComponentProps<typeof ReleaseDateField>["options"];
};
const EMPTY_OPTIONS: NonNullable<Props["options"]> = [];

/** Assignment suggestions have their own date scope and are needed only when opened. */
export default function AssignmentReleaseDateField({ options, ...props }: Props) {
  const teamKey = useAppSelector(selectCurrentTeamKey);
  const [open, setOpen] = React.useState(false);
  const { currentData, isFetching } = useGetReleaseOptionsQuery({ teamKey, fromDate: open && !options ? businessToday() : undefined }, { skip: Boolean(options) || !open });
  const suggestions = React.useMemo(() => currentData?.map(release => ({
    value: release.id, label: formatReleaseDate(release.promDate),
  })) ?? EMPTY_OPTIONS, [currentData]);
  const handleOpen = React.useCallback(() => setOpen(true), []);
  const handleClose = React.useCallback(() => setOpen(false), []);

  return <ReleaseDateField {...props} options={options ?? suggestions} loading={isFetching} onOpen={handleOpen} onClose={handleClose} />;
}
