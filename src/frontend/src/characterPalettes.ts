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
  // Michael — Home Insurance Customer (stressed homeowner, cap + stubble)
  customerHome: {
    skin: "#f3c79b", hair: "#5a3a25", shirt: "#4f8fd6", pants: "#2d3344",
    shoes: "#1a1a1a", accent: "#ffffff", hairStyle: "cap", facial: "stubble",
    shirtLogo: true,
  },
  // Aisha — Motor Insurance Customer (busy commuter, ponytail)
  customerMotor: {
    skin: "#e8b48a", hair: "#2d2418", shirt: "#d36b5b", pants: "#3a2f24",
    shoes: "#1a1a1a", accent: "#ffd9a8", hairStyle: "ponytail",
  },
  // Tom — Small Business Owner (café owner, beanie + beard)
  customerBusiness: {
    skin: "#f5d2b3", hair: "#9a5a2a", shirt: "#7ab97a", pants: "#2a3344",
    shoes: "#1a1a1a", accent: "#ffffff", hairStyle: "beanie", facial: "beard",
  },
  // Grace — Travel Insurance Customer (frustrated traveller, bun)
  customerTravel: {
    skin: "#d9a37e", hair: "#1a1a1a", shirt: "#c188d4", pants: "#3a3a44",
    shoes: "#1a1a1a", accent: "#ffd166", hairStyle: "bun", lowerBody: "skirt",
  },
  // Robert — Life Insurance Beneficiary (quiet, formal, glasses)
  customerLife: {
    skin: "#e8c69a", hair: "#1f1a18", shirt: "#3a3a44", pants: "#1c1c22",
    shoes: "#1a1a1a", accent: "#22252e", hairStyle: "short", glasses: true,
  },

  // ----- Staff (mapped to docs/characters.md staff cast) -----
  // Staff shirts are deliberately matched to each cubicle's accent floor
  // mat colour (see `cubicles` in officeScene.ts) so each role reads
  // visually with their department zone at a glance.
  // Iris — Claims Intake Officer (intake blue cubicle)
  intakeOfficer: {
    skin: "#f3c79b", hair: "#3a2418", shirt: "#3a5fb0", pants: "#3a2a55",
    shoes: "#1a1a1a", accent: "#f4c463", hairStyle: "ponytail",
    lowerBody: "dress",
  },
  // Adam — Claims Assessor (assessor light-blue cubicle)
  claimsAssessor: {
    skin: "#e8b48a", hair: "#1a1a1a", shirt: "#6ec1ff", pants: "#2d3344",
    shoes: "#1a1a1a", accent: "#1c2230", hairStyle: "short", glasses: true,
    shirtLogo: true,
  },
  // Lara — Loss Adjuster (loss-adjuster orange cubicle)
  lossAdjuster: {
    skin: "#d9a37e", hair: "#2d1a10", shirt: "#ffb347", pants: "#3a2f24",
    shoes: "#1a1a1a", accent: "#3a2a20", hairStyle: "bun",
  },
  // Felix — Fraud Investigator (fraud red cubicle)
  fraudInvestigator: {
    skin: "#e8b48a", hair: "#1a1a1a", shirt: "#e8504c", pants: "#1c2230",
    shoes: "#1a1a1a", accent: "#ffd166", hairStyle: "long", glasses: true,
  },
  // Sam — Supplier Coordinator (supplier green cubicle)
  supplierCoord: {
    skin: "#f3c79b", hair: "#cfa050", shirt: "#2e8a6e", pants: "#3a3a44",
    shoes: "#1a1a1a", accent: "#ffffff", hairStyle: "cap", facial: "beard",
    shirtLogo: true,
  },
  // Seth — Settlement Officer (settlement brown cubicle)
  settlementOfficer: {
    skin: "#f5d2b3", hair: "#3a2418", shirt: "#a06a4c", pants: "#1c2230",
    shoes: "#1a1a1a", accent: "#ffb347", hairStyle: "short",
  },
  // Cara — Customer Communications Specialist (comms magenta cubicle)
  commsSpecialist: {
    skin: "#e8c69a", hair: "#5a3a25", shirt: "#b56fbf", pants: "#3a3a44",
    shoes: "#1a1a1a", accent: "#ffffff", hairStyle: "bun", lowerBody: "skirt",
  },
  // Theo — Claims Team Leader (grey suit, beard, confident)
  teamLeader: {
    skin: "#e8b48a", hair: "#5a4a35", shirt: "#cdb497", pants: "#2a2f3a",
    shoes: "#1a1a1a", accent: "#1c2230", hairStyle: "short", facial: "beard",
  },
  // Jordan Pierce — Contents Claimant (apartment block, under fraud review)
  customerContents: {
    skin: "#c69770", hair: "#1a1a1a", shirt: "#7a6a8a", pants: "#2a2a32",
    shoes: "#1a1a1a", accent: "#cfcfcf", hairStyle: "short", facial: "stubble",
  },

  // ----- Ambient lobby cast (visual-only background staff) -----
  // Reception greeter — front-of-house in the lobby, smart navy dress,
  // long hair, friendly accent scarf. Distinct from intakeOfficer so the
  // two read as different roles when visible together.
  receptionGreeter: {
    skin: "#f0c8a4", hair: "#2a1a12", shirt: "#2a3a5c", pants: "#2a3a5c",
    shoes: "#1a1a1a", accent: "#ffd166", hairStyle: "long",
    lowerBody: "dress", shirtLogo: true,
  },
  // Cleaner — teal cleaner's smock, hair tied up in a bun, sturdy shoes.
  cleaner: {
    skin: "#e8b48a", hair: "#3a2418", shirt: "#2e8a6e", pants: "#3a3a44",
    shoes: "#5a3a25", accent: "#ffd166", hairStyle: "bun",
  },
  // Parcel courier — brown delivery uniform, cap, short beard.
  parcelCourier: {
    skin: "#d9a37e", hair: "#3a2418", shirt: "#7a4f2a", pants: "#3a2a20",
    shoes: "#1a1a1a", accent: "#ffb347", hairStyle: "cap", facial: "beard",
    shirtLogo: true,
  },
};
