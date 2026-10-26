import type { EventDef, PlateLoad, PlateStack } from '../types';

// `collarWeightPerPair` is the meet-level fallback; an event that carries its own collar weight wins.
export function calculatePlateLoading(
  event: EventDef,
  divisionId: string,
  availablePlates: number[],
  meetCollarWeightPerPair = 0,
  overrideTargetWeight?: number | string,
  useLightTier = false
): PlateLoad {
  const rawTarget =
    overrideTargetWeight !== undefined &&
    overrideTargetWeight !== '' &&
    !isNaN(Number(overrideTargetWeight))
      ? Number(overrideTargetWeight)
      : useLightTier && event.hasTrumpWeight
      ? event.divisionLightWeights?.[divisionId] ?? 0
      : event.divisionWeights?.[divisionId] ?? 0;

  if (event.loadingPoints === 0) {
    return {
      targetInputWeight: rawTarget,
      totalSystemWeight: rawTarget,
      implementTareWeight: event.implementEmptyWeight,
      collarWeightApplied: 0,
      loadingPoints: 0,
      callOutLabel: 'Fixed Implement (No Plate Loading)',
      weightPerLoadingPoint: 0,
      platesPerPoint: [],
      remainderUnloadedTotal: 0,
    };
  }

  const collarWeightPerPair = typeof event.collarWeightPerPair === 'number' && Number.isFinite(event.collarWeightPerPair)
    ? Math.max(0, event.collarWeightPerPair)
    : Math.max(0, meetCollarWeightPerPair);
  let weightToLoadAcrossPoints = 0;
  let pointsDivisor = event.loadingPoints;
  let callOutLabel = 'Per Side';
  let totalSystemWeight = rawTarget;
  let collarApplied = 0;

  if (event.loadingPoints === 1) {
    callOutLabel = 'On the Pin (1 Point)';
    pointsDivisor = 1;
    weightToLoadAcrossPoints = Math.max(0, rawTarget - event.implementEmptyWeight);
  } else if (event.loadingPoints === 2) {
    callOutLabel = 'Per Sleeve (2 Sides)';
    pointsDivisor = 2;
    collarApplied = collarWeightPerPair;
    weightToLoadAcrossPoints = Math.max(
      0,
      rawTarget - event.implementEmptyWeight - collarApplied
    );
  } else if (event.loadingPoints === 4) {
    if (event.weightEntryMode === 'per_hand') {
      callOutLabel = 'Per Sleeve (4 Sleeves / 2 Handles)';
      pointsDivisor = 2;
      collarApplied = collarWeightPerPair;
      weightToLoadAcrossPoints = Math.max(
        0,
        rawTarget - event.implementEmptyWeight - collarApplied
      );
      totalSystemWeight = rawTarget * 2;
    } else {
      callOutLabel = 'Per Upright Post (4 Posts)';
      pointsDivisor = 4;
      weightToLoadAcrossPoints = Math.max(0, rawTarget - event.implementEmptyWeight);
    }
  }

  const exactWeightPerPoint = weightToLoadAcrossPoints / pointsDivisor;
  let remainingPerPoint = exactWeightPerPoint;

  const sortedPlates = [...availablePlates].sort((a, b) => b - a);
  const platesPerPoint: PlateStack[] = [];

  for (const plate of sortedPlates) {
    if (plate <= 0) continue;
    const count = Math.floor((remainingPerPoint + 0.001) / plate);
    if (count > 0) {
      platesPerPoint.push({ weight: plate, count });
      remainingPerPoint = Math.round((remainingPerPoint - count * plate) * 100) / 100;
    }
  }

  const remainderUnloadedTotal = Math.round(remainingPerPoint * pointsDivisor * 100) / 100;
  let warningMessage: string | undefined;

  if (rawTarget < event.implementEmptyWeight) {
    warningMessage = `Target weight (${rawTarget} lbs) is lighter than empty implement (${event.implementEmptyWeight} lbs).`;
  } else if (remainderUnloadedTotal > 0) {
    warningMessage =
      event.loadingPoints === 4 && event.weightEntryMode === 'total'
        ? `Uneven 4-Post Load: ${remainderUnloadedTotal} lbs left over. Put a ${remainderUnloadedTotal} lb plate in the center crossbar or adjust target weight.`
        : `Unloaded remainder: ${remainderUnloadedTotal} lbs total (${remainingPerPoint} lbs per point) cannot be made with selected plate inventory.`;
  }

  return {
    targetInputWeight: rawTarget,
    totalSystemWeight,
    implementTareWeight: event.implementEmptyWeight,
    collarWeightApplied: collarApplied,
    loadingPoints: event.loadingPoints,
    callOutLabel,
    weightPerLoadingPoint: Math.round(exactWeightPerPoint * 100) / 100,
    platesPerPoint,
    remainderUnloadedTotal,
    warningMessage,
  };
}
