/**
 * NYC truck-route `restrictio` text → structured dims.
 * Only the 11 known strings in the current snapshot are mapped.
 */

export type ParsedRestriction = {
  facility: string;
  heightInches?: number;
  widthInches?: number;
  weightTons?: number;
  noTrucksLower?: boolean;
  noHazmat?: boolean;
  noThroughTrucksDaytime?: boolean;
};

const TABLE: Record<string, ParsedRestriction> = {
  'InRd- Ht-12\'11" Wt-10 Tons  OutRd- Ht-13\'4" Wt-36': {
    facility: "Williamsburg Bridge",
    heightInches: 155,
    weightTons: 10,
  },
  'Frm MN- Height-13\'-5", Frm RI to QNS- Width- 12\'-0"': {
    facility: "RFK Bridge",
    heightInches: 161,
    widthInches: 144,
  },
  'Height- 12\'-1", Width- 8\'-6", Weight-7.5 Ton': {
    facility: "Hugh L. Carey Tunnel",
    heightInches: 145,
    widthInches: 102,
    weightTons: 7.5,
  },
  'Upper Rdwy- Height-11\'6" Weight-15 Tons': {
    facility: "Ed Koch Queensboro Bridge",
    heightInches: 138,
    weightTons: 15,
  },
  'Height- Up Rdwy-13\'4" Low Rdwy-13\'8" Weight-36 Ton': {
    facility: "Manhattan Bridge",
    heightInches: 160,
    weightTons: 36,
  },
  'Upper Roadway: Height- 15\'-0", No Trucks on Lower Lvl': {
    facility: "Verrazzano-Narrows Bridge",
    heightInches: 180,
    noTrucksLower: true,
  },
  'H- 12\'6" W- 8\'0", Only two and three-axle single-unit trucks allowed, No Flamm/Explosives': {
    facility: "Holland Tunnel",
    heightInches: 150,
    widthInches: 96,
    noHazmat: true,
  },
  'Height Limit- 12\' 1"  Width Limit- 8\'-6"  Weight-7.5 Tons': {
    facility: "Queens Midtown Tunnel",
    heightInches: 145,
    widthInches: 102,
    weightTons: 7.5,
  },
  'Height- 13\'0"  Width- 8\'6", No trucks in central tube, No Flammables or Explosives': {
    facility: "Lincoln Tunnel",
    heightInches: 156,
    widthInches: 102,
    noHazmat: true,
  },
  'Height- UpLevel- 13\'6" Width-8\'6", No trucks on LowLevel': {
    facility: "George Washington Bridge",
    heightInches: 162,
    widthInches: 102,
    noTrucksLower: true,
  },
  "No Through Trucks Between 11:00am and 6:00pm": {
    facility: "34th Street",
    noThroughTrucksDaytime: true,
  },
};

export function parseRestrictionText(text: string | null | undefined): ParsedRestriction | null {
  if (!text) return null;
  return TABLE[text] ?? null;
}

export function knownRestrictionTexts() {
  return Object.keys(TABLE);
}
