// Claim Your Hero — Addons
// Applies the module's localization keys to strings created dynamically by main.js.

const MODULE_ID = "claim-your-hero-addons";
const I18N_NAMESPACE = "CLAIM_YOUR_HERO_ADDONS";
const PERSISTENT_CLASS_SEARCH_SETTING = "persistentClassSearch";
const CLASS_FILTER_CLASS = "claim-your-hero-addons-class-filter";

Hooks.once("init", () => {
  const setting = game.settings.settings.get(`${MODULE_ID}.${PERSISTENT_CLASS_SEARCH_SETTING}`);
  if (!setting) return;

  setting.name = `${I18N_NAMESPACE}.SETTINGS.PERSISTENT_CLASS_SEARCH_NAME`;
  setting.hint = `${I18N_NAMESPACE}.SETTINGS.PERSISTENT_CLASS_SEARCH_HINT`;
});

Hooks.on("renderApplicationV2", app => {
  if (app?.options?.id !== "claim-your-hero-selection") return;

  for (const filter of app.element?.querySelectorAll?.(`.${CLASS_FILTER_CLASS}`) ?? []) {
    filter.setAttribute(
      "aria-label",
      game.i18n.localize(`${I18N_NAMESPACE}.CLASS_FILTER.ARIA_LABEL`)
    );
  }
});
