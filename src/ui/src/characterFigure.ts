/**
 * Renders a tiny voxel-style character bust as an SVG string, mirroring the
 * look of the same persona in the 3D office (skin tone, hair color/style,
 * shirt color, optional glasses, facial hair, shirt logo). Used by the
 * agents-panel cards in the HUD and the floating profile card so the UI
 * picks up the same character "figure" theme as the office scene.
 */

import type { VoxelCharacterPalette } from "./voxelCharacter";

export function renderCharacterFigureSvg(
  palette: VoxelCharacterPalette,
  accentColor?: string,
): string {
  const skin = palette.skin;
  const hair = palette.hair;
  const shirt = palette.shirt;
  const eye = palette.eye ?? "#22252e";
  const accent = palette.accent ?? accentColor ?? "#ffb347";
  const hairStyle = palette.hairStyle ?? "short";

  // Coordinate space: 0..40 wide, 0..40 tall.
  const headX = 12;
  const headY = 8;
  const headW = 16;
  const headH = 16;

  const hairParts: string[] = [];
  switch (hairStyle) {
    case "bald":
      break;
    case "ponytail":
      hairParts.push(`<rect x="${headX - 1}" y="${headY - 3}" width="${headW + 2}" height="5" fill="${hair}"/>`);
      hairParts.push(`<rect x="${headX + headW - 1}" y="${headY + 4}" width="3" height="8" fill="${hair}"/>`);
      break;
    case "bun":
      hairParts.push(`<rect x="${headX - 1}" y="${headY - 2}" width="${headW + 2}" height="4" fill="${hair}"/>`);
      hairParts.push(`<rect x="${headX + headW / 2 - 2}" y="${headY - 5}" width="4" height="4" fill="${hair}"/>`);
      break;
    case "long":
      hairParts.push(`<rect x="${headX - 2}" y="${headY - 3}" width="${headW + 4}" height="5" fill="${hair}"/>`);
      hairParts.push(`<rect x="${headX - 2}" y="${headY + 2}" width="3" height="${headH - 2}" fill="${hair}"/>`);
      hairParts.push(`<rect x="${headX + headW - 1}" y="${headY + 2}" width="3" height="${headH - 2}" fill="${hair}"/>`);
      break;
    case "afro":
      hairParts.push(`<rect x="${headX - 2}" y="${headY - 4}" width="${headW + 4}" height="7" fill="${hair}"/>`);
      break;
    case "cap":
      hairParts.push(`<rect x="${headX - 1}" y="${headY - 2}" width="${headW + 2}" height="4" fill="${hair}"/>`);
      hairParts.push(`<rect x="${headX + 2}" y="${headY}" width="${headW - 4}" height="2" fill="${accent}"/>`);
      break;
    case "beanie":
      hairParts.push(`<rect x="${headX - 1}" y="${headY - 4}" width="${headW + 2}" height="6" fill="${hair}"/>`);
      hairParts.push(`<rect x="${headX - 1}" y="${headY + 1}" width="${headW + 2}" height="2" fill="${accent}"/>`);
      break;
    case "hat":
      hairParts.push(`<rect x="${headX - 3}" y="${headY - 1}" width="${headW + 6}" height="2" fill="${hair}"/>`);
      hairParts.push(`<rect x="${headX}" y="${headY - 5}" width="${headW}" height="5" fill="${hair}"/>`);
      break;
    case "hood":
      hairParts.push(`<rect x="${headX - 2}" y="${headY - 3}" width="${headW + 4}" height="${headH + 3}" fill="${hair}" rx="2"/>`);
      hairParts.push(`<rect x="${headX}" y="${headY + 2}" width="${headW}" height="${headH - 2}" fill="${skin}"/>`);
      break;
    case "crown":
      hairParts.push(`<rect x="${headX - 1}" y="${headY - 1}" width="${headW + 2}" height="3" fill="${hair}"/>`);
      hairParts.push(
        `<polygon points="${headX},${headY - 4} ${headX + 4},${headY - 1} ${headX + 8},${headY - 5} ${headX + 12},${headY - 1} ${headX + 16},${headY - 4} ${headX + 16},${headY - 1} ${headX},${headY - 1}" fill="${accent}"/>`,
      );
      break;
    default:
      hairParts.push(`<rect x="${headX - 1}" y="${headY - 2}" width="${headW + 2}" height="4" fill="${hair}"/>`);
      break;
  }

  const eyesGroup = `
    <rect x="${headX + 4}" y="${headY + 8}" width="2" height="2" fill="${eye}"/>
    <rect x="${headX + headW - 6}" y="${headY + 8}" width="2" height="2" fill="${eye}"/>
  `;

  const glasses = palette.glasses
    ? `
    <rect x="${headX + 3}" y="${headY + 7}" width="4" height="4" fill="none" stroke="#1c2230" stroke-width="0.7"/>
    <rect x="${headX + headW - 7}" y="${headY + 7}" width="4" height="4" fill="none" stroke="#1c2230" stroke-width="0.7"/>
    <line x1="${headX + 7}" y1="${headY + 9}" x2="${headX + headW - 7}" y2="${headY + 9}" stroke="#1c2230" stroke-width="0.7"/>
  `
    : "";

  let facial = "";
  if (palette.facial === "beard") {
    facial = `<rect x="${headX + 2}" y="${headY + 12}" width="${headW - 4}" height="4" fill="${hair}" opacity="0.85"/>`;
  } else if (palette.facial === "stubble") {
    facial = `<rect x="${headX + 2}" y="${headY + 13}" width="${headW - 4}" height="2" fill="${hair}" opacity="0.45"/>`;
  } else if (palette.facial === "moustache") {
    facial = `<rect x="${headX + 5}" y="${headY + 11}" width="${headW - 10}" height="1.5" fill="${hair}" opacity="0.85"/>`;
  }

  const shirtGroup = `
    <rect x="${headX - 4}" y="${headY + headH}" width="${headW + 8}" height="9" fill="${shirt}" rx="1"/>
    ${
      palette.shirtLogo
        ? `<rect x="${headX + headW / 2 - 1.5}" y="${headY + headH + 3}" width="3" height="3" fill="${accent}"/>`
        : ""
    }
    <rect x="${headX + 1}" y="${headY + headH}" width="${headW - 2}" height="2" fill="${skin}"/>
  `;

  return `
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="0" y="0" width="40" height="40" rx="6" fill="rgba(255,255,255,0.04)"/>
      ${shirtGroup}
      <rect x="${headX}" y="${headY}" width="${headW}" height="${headH}" fill="${skin}" rx="1"/>
      ${hairParts.join("")}
      ${eyesGroup}
      ${facial}
      ${glasses}
    </svg>
  `;
}
