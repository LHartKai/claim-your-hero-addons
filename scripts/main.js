// Claim Your Hero — Addons
// Sheet layering fix for the Claim Your Hero selection overlay.

const MODULE_ID = "claim-your-hero-addons";
const CYH_ID = "claim-your-hero-v13-351";
const SHEET_Z_INDEX = "10000";

function promoteActorSheet(sheet) {
  if (!sheet?.element) return;

  const element = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
  if (!element) return;

  const selectionOverlay = document.querySelector(`.${CYH_ID}.hero-selection`);
  if (!selectionOverlay) return;

  element.style.setProperty("z-index", SHEET_Z_INDEX, "important");
}

Hooks.once("ready", () => {
  console.log(`[${MODULE_ID}] Sheet layering fix active.`);

  Hooks.on("renderActorSheet", (app) => {
    promoteActorSheet(app);
  });

  Hooks.on("activateApplicationListeners", (app) => {
    if (app?.actor) promoteActorSheet(app);
  });

  Hooks.on("renderApplicationV2", (app) => {
    if (app?.actor) promoteActorSheet(app);
  });
});
