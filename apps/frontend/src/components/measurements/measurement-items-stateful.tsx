"use client";

import { useEffect, useState } from "react";
import type { MeasurementItemRow } from "@/lib/api";
import { MeasurementItemsList } from "@/components/measurements/measurement-items-list";

type Props = {
  measurementId: string;
  measurementStatus: string;
  /** Muda quando o servidor revalida (ex.: Calcular, nova linha); alinha a lista local. */
  serverSnapshotKey: string;
  items: MeasurementItemRow[];
};

/**
 * Mantém a lista de itens em estado local após PATCH/DELETE sem `router.refresh()`,
 * alinhando de novo com o servidor quando `serverSnapshotKey` mudar.
 */
export function MeasurementItemsStateful(props: Props): JSX.Element | null {
  const [items, setItems] = useState<MeasurementItemRow[]>(props.items);

  useEffect(() => {
    setItems(props.items);
  }, [props.serverSnapshotKey]);

  return (
    <MeasurementItemsList
      measurementId={props.measurementId}
      measurementStatus={props.measurementStatus}
      items={items}
      onMeasurementUpdate={(m) => setItems((m.items ?? []) as MeasurementItemRow[])}
    />
  );
}
