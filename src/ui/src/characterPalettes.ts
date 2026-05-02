/**
 * Visual palettes & style options for the voxel cast.
 *
 * Each entry maps to a persona in `docs/characters.md`. Style options
 * (hair, glasses, beard, lower body shape, etc.) let the simple block
 * character read as a distinct individual — inspired by Mojang-style
 * voxel character packs.
 */

export type HairStyle =
  | "short"
  | "afro"
  | "ponytail"
  | "bun"
  | "bald"
  | "cap"
  | "hat"
  | "hood"
  | "crown"
  | "beanie"
  | "long";

export type FacialHair = "none" | "stubble" | "beard" | "moustache";

export type LowerBody = "pants" | "skirt" | "dress";

export interface VoxelCharacterPalette {
  /** Skin tone (face, hands). */
  skin: string;
  /** Hair / hat / hood color. */
  hair: string;
  /** Torso + arm color. */
  shirt: string;
  /** Pants / skirt / dress color. */
  pants: string;
  /** Shoe color. */
  shoes: string;
  /** Optional accent color used for tie / scarf / shirt logo / hat band. */
  accent?: string;
  /** Hair / headwear shape. Defaults to "short". */
  hairStyle?: HairStyle;
  /** Optional facial hair. */
  facial?: FacialHair;
  /** Render glasses on the face. */
  glasses?: boolean;
  /** Lower body shape. Defaults to "pants". */
  lowerBody?: LowerBody;
  /** Draw a small accent square logo on the chest. */
  shirtLogo?: boolean;
  /** Eye color. Defaults to dark brown. */
  eye?: string;
}

export const PALETTES: Record<string, VoxelCharacterPalette> = {
  // ----- Customers (mapped to the 5 personas in docs/characters.md) -----
  // Michael Harris — Home Insurance Customer (stressed homeowner, cap + stubble)
  customerHome: {
    skin: "#f3c79b", hair: "#5a3a25", shirt: "#4f8fd6", pants: "#2d3344",
    shoes: "#1a1a1a", accent: "#ffffff", hairStyle: "cap", facial: "stubble",
    shirtLogo: true,
  },
  // Aisha Khan — Motor Insurance Customer (busy commuter, ponytail)
  customerMotor: {
    skin: "#e8b48a", hair: "#2d2418", shirt: "#d36b5b", pants: "#3a2f24",
    shoes: "#1a1a1a", accent: "#ffd9a8", hairStyle: "ponytail",
  },
  // Tom Bradley — Small Business Owner (café owner, beanie + beard)
  customerBusiness: {
    skin: "#f5d2b3", hair: "#9a5a2a", shirt: "#7ab97a", pants: "#2a3344",
    shoes: "#1a1a1a", accent: "#ffffff", hairStyle: "beanie", facial: "beard",
  },
  // Grace Williams — Travel Insurance Customer (frustrated traveller, bun)
  customerTravel: {
    skin: "#d9a37e", hair: "#1a1a1a", shirt: "#c188d4", pants: "#3a3a44",
    shoes: "#1a1a1a", accent: "#ffd166", hairStyle: "bun", lowerBody: "skirt",
  },
  // Robert Chen — Life Insurance Beneficiary (quiet, formal, glasses)
  customerLife: {
    skin: "#e8c69a", hair: "#1f1a18", shirt: "#3a3a44", pants: "#1c1c22",
    shoes: "#1a1a1a", accent: "#22252e", hairStyle: "short", glasses: true,
  },

  // ----- Staff (mapped to docs/characters.md staff cast) -----
  // Sarah Mitchell — Claims Intake Officer (warm, ponytail + dress)
  intakeOfficer: {
    skin: "#f3c79b", hair: "#3a2418", shirt: "#f4c463", pants: "#3a2a55",
    shoes: "#1a1a1a", accent: "#b8454a", hairStyle: "ponytail",
    lowerBody: "dress",
  },
  // Daniel Cho — Claims Assessor (analytical, glasses)
  claimsAssessor: {
    skin: "#e8b48a", hair: "#1a1a1a", shirt: "#5fb8a8", pants: "#2d3344",
    shoes: "#1a1a1a", accent: "#1c2230", hairStyle: "short", glasses: true,
    shirtLogo: true,
  },
  // Priya Nair — Loss Adjuster (field-oriented, bun)
  lossAdjuster: {
    skin: "#d9a37e", hair: "#2d1a10", shirt: "#7a9c5a", pants: "#3a2f24",
    shoes: "#1a1a1a", accent: "#3a2a20", hairStyle: "bun",
  },
  // Elena Garcia — Fraud Investigator (sharp purple suit, long hair, glasses)
  fraudInvestigator: {
    skin: "#e8b48a", hair: "#1a1a1a", shirt: "#7a4f9c", pants: "#1c2230",
    shoes: "#1a1a1a", accent: "#ffd166", hairStyle: "long", glasses: true,
  },
  // James O'Connor — Supplier Coordinator (warm orange polo, cap + beard)
  supplierCoord: {
    skin: "#f3c79b", hair: "#cfa050", shirt: "#e07a3a", pants: "#3a3a44",
    shoes: "#1a1a1a", accent: "#ffffff", hairStyle: "cap", facial: "beard",
    shirtLogo: true,
  },
  // Hannah Lee — Settlement Officer (corporate blue button-down, short hair)
  settlementOfficer: {
    skin: "#f5d2b3", hair: "#3a2418", shirt: "#3a5fb0", pants: "#1c2230",
    shoes: "#1a1a1a", accent: "#ffb347", hairStyle: "short",
  },
  // Olivia Martin — Customer Communications Specialist (friendly magenta, bun)
  commsSpecialist: {
    skin: "#e8c69a", hair: "#5a3a25", shirt: "#c14a7a", pants: "#3a3a44",
    shoes: "#1a1a1a", accent: "#ffffff", hairStyle: "bun", lowerBody: "skirt",
  },
  // Mark Reynolds — Claims Team Leader (grey suit, beard, confident)
  teamLeader: {
    skin: "#e8b48a", hair: "#5a4a35", shirt: "#cdb497", pants: "#2a2f3a",
    shoes: "#1a1a1a", accent: "#1c2230", hairStyle: "short", facial: "beard",
  },
};
