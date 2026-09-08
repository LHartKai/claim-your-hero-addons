// Claim Your Hero — Addons
// Keep the recommended-composition role strip limited to roles used by at least one roster hero.

const CYH_ID = "claim-your-hero";
const CYH_SELECTION_ID = `${CYH_ID}-selection`;
const CYH_ROSTER_SETTING = "roster";
const CYH_ROLES_SETTING = "roles";

function getRoles() {
  return game.settings.get(CYH_ID, CYH_ROLES_SETTING)?.roles ?? [];
}

function getRosterEntries() {
  return game.settings.get(CYH_ID, CYH_ROSTER_SETTING)?.entries ?? [];
}

function getAvailableRoleIds() {
  return new Set(
    getRosterEntries()
      .flatMap(entry => entry?.roles ?? [])
      .filter(Boolean)
  );
}

function syncRecommendedComposition(app) {
  if (app?.options?.id !== CYH_SELECTION_ID) return;

  const composition = app.element?.querySelector(".composition-bar");
  if (!composition) return;

  const roles = getRoles();
  const availableRoleIds = getAvailableRoleIds();
  const rolesByName = new Map(
    roles.filter(role => role?.id && role.name).map(role => [role.name, role])
  );

  let visibleCount = 0;

  for (const control of composition.querySelectorAll(".comp-role")) {
    const name = control.querySelector(".comp-name")?.textContent?.trim();
    const role = rolesByName.get(name);
    const visible = !!role && availableRoleIds.has(role.id);

    control.hidden = !visible;
    if (visible) visibleCount++;
  }

  composition.hidden = visibleCount === 0;
}

Hooks.on("renderApplicationV2", app => {
  if (app?.options?.id !== CYH_SELECTION_ID) return;

  // The main addon also enhances this same bar during its render hook. Deferring one
  // tick lets both pieces finish before we apply the visibility rule.
  setTimeout(() => syncRecommendedComposition(app), 0);
});
