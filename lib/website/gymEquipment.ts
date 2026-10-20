// Equipment a strongman gym can list (Kurt 10/20). The directory's "Filter by equipment" dropdown and, later, the
// gym owner's form both draw from this list, so a tag means the same thing on every listing. Events ("Keg over
// bar") belong on shows, not here; this is what is physically in the building.
export const GYM_EQUIPMENT: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'log', label: 'Log' },
  { id: 'axle', label: 'Axle' },
  { id: 'yoke', label: 'Yoke' },
  { id: 'farmers', label: "Farmer's handles" },
  { id: 'frame', label: 'Frame carry' },
  { id: 'stones', label: 'Atlas stones' },
  { id: 'natural_stones', label: 'Natural stones' },
  { id: 'sandbags', label: 'Sandbags' },
  { id: 'kegs', label: 'Kegs' },
  { id: 'circus_db', label: 'Circus dumbbell' },
  { id: 'husafell', label: 'Husafell stone' },
  { id: 'conans_wheel', label: "Conan's wheel" },
  { id: 'viking_press', label: 'Viking press' },
  { id: 'loading_platform', label: 'Loading platform' },
  { id: 'car_deadlift', label: 'Car deadlift frame' },
  { id: 'pull_harness', label: 'Pull harness and sled' },
  { id: 'arm_over_arm', label: 'Arm-over-arm rope' },
  { id: 'tire', label: 'Tire' },
  { id: 'power_stairs', label: 'Power stairs' },
  { id: 'turf_lane', label: 'Turf or outdoor lane' },
];

const ORDER = new Map(GYM_EQUIPMENT.map((e, i) => [e.label.toLowerCase(), i]));

export function isKnownEquipment(tag: string): boolean {
  return ORDER.has(tag.trim().toLowerCase());
}

// Known equipment first in list order, then anything a listing added on its own, alphabetically.
export function sortEquipmentTags(tags: string[]): string[] {
  return [...tags].sort((a, b) => {
    const ia = ORDER.get(a.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const ib = ORDER.get(b.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return ia !== ib ? ia - ib : a.localeCompare(b);
  });
}
