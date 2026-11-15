// Claim Your Hero — Addons
// Applies the module's localization keys to strings created dynamically by main.js.

const MODULE_ID = "claim-your-hero-addons";
const I18N_NAMESPACE = "CLAIM_YOUR_HERO_ADDONS";
const PERSISTENT_CLASS_SEARCH_SETTING = "persistentClassSearch";
const CLASS_FILTER_CLASS = "claim-your-hero-addons-class-filter";

function localizeSelectionFilters(app) {
  if (app?.options?.id !== "claim-your-hero-selection") return;

  for (const filter of app.element?.querySelectorAll?.(`.${CLASS_FILTER_CLASS}`) ?? []) {
    const key = filter.classList.contains("persistent")
      ? `${I18N_NAMESPACE}.PERSISTENT_CLASS_FILTER.ARIA_LABEL`
      : `${I18N_NAMESPACE}.CLASS_FILTER.ARIA_LABEL`;

    filter.setAttribute("aria-label", game.i18n.localize(key));
  }
}

Hooks.once("ready", () => {
  const setting = game.settings.settings.get(`${MODULE_ID}.${PERSISTENT_CLASS_SEARCH_SETTING}`);
  if (!setting) return;

  setting.name = `${I18N_NAMESPACE}.SETTINGS.PERSISTENT_CLASS_SEARCH_NAME`;
  setting.hint = `${I18N_NAMESPACE}.SETTINGS.PERSISTENT_CLASS_SEARCH_HINT`;
});

Hooks.on("renderApplicationV2", app => {
  if (app?.options?.id !== "claim-your-hero-selection") return;

  const root = app.element;
  if (!root) return;

  // main.js adds the filter during the same render cycle. Run once afterward;
  // a persistent MutationObserver would otherwise remain attached to every
  // selection window for its entire lifetime.
  setTimeout(() => {
    if (app.element === root) localizeSelectionFilters(app);
  }, 0);
});
