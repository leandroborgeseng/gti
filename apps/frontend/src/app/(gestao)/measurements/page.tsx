import { MeasurementsView } from "@/components/measurements/measurements-view";
import { getMeasurements } from "@/lib/api";

export default async function MeasurementsPage(): Promise<JSX.Element> {
  const measurements = await getMeasurements().catch(() => []);
  return <MeasurementsView measurements={measurements} />;
}
