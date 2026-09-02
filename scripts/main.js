// Claim Your Hero — Addons
// Sheet layering fix for the Claim Your Hero selection overlay.

const MODULE_ID = "claim-your-hero-addons";
const CYH_ID = "claim-your-hero-v13-351";
const SHEET_Z_INDEX = "10000";

function hasSelectionOverlay() {
  return !!document.querySelector(`.${CYH_ID}.hero-selection`);
}

function promoteActorSheet(sheet) {
  if (!sheet?.element || !hasSelectionOverlay()) return;

  const element = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
  if (!element) return;

  element.style.setProperty("z-index", SHEET_Z_INDEX, "important");
}

function patchBringToFront(sheet) {
  if (!sheet?.actor || sheet.__claimYourHeroAddonsBringToFrontPatched) return;

  const originalBringToFront = sheet.bringToFront?.bind(sheet);
  if (!originalBringToFront) return;

  sheet.__claimYourHeroAddonsBringToFrontPatched = true;
  sheet.bringToFront = (...args) => {
    const result = originalBringToFront(...args);
    promoteActorSheet(sheet);
    return result;
  };

  promoteActorSheet(sheet);
}

Hooks.once("ready", () => {
  console.log(`[${MODULE_ID}] Sheet layering fix active.`);

  Hooks.on("renderApplicationV2", (app) => {
    if (!app?.actor) return;
    patchBringToFront(app);
    promoteActorSheet(app);
  });
});
