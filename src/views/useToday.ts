import * as React from "react";
const businessDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" });
export const businessToday = () => businessDateFormatter.format(new Date());
export default function useToday() {
  const [today, setToday] = React.useState(businessToday);
  React.useEffect(() => {
    const update = () => setToday(businessToday());
    const timer = setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return today;
}
