// Claim Your Hero — Addons
// Sheet layering, pending-view synchronization, and independent class filtering.

const MODULE_ID = "claim-your-hero-addons";
const CYH_ID = "claim-your-hero";
const CYH_FLAG = "pendingViews";
const CYH_ROSTER_SETTING = "roster";
const CYH_ROLES_SETTING = "roles";
const SHEET_CLASS = "claim-your-hero-addons-sheet-layer";
const SHEET_Z_INDEX = "10000";
const CLASS_FILTER_CLASS = "claim-your-hero-addons-class-filter";
const OBSERVER = foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const OWNER = foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

// The filter is UI-local: each open selection application keeps its own choice.
const classFilters = new WeakMap();

function hasSelectionOverlay() {
  return !!document.querySelector(`.${CYH_ID}.hero-selection`);
}

function promoteActorSheet(sheet) {
  if (!sheet?.element || !hasSelectionOverlay()) return;

  const element = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
  if (!element) return;

  element.classList.add(SHEET_CLASS);
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

function getPendingViews(user) {
  return user?.getFlag(CYH_ID, CYH_FLAG) ?? [];
}

/**
 * Remove one player's module-granted view entries and matching ownership grants.
 * The caller must be the active GM. Only Actors recorded in pendingViews are touched.
 * The newly claimed Actor is explicitly excluded from revocation.
 */
async function cleanupPendingViews(user, claimedActorId = null) {
  if (!user || user.isGM || game.user !== game.users.activeGM) return;

  const pending = [...getPendingViews(user)];
  if (!pending.length) return;

  const removals = [];
  const remaining = [];

  for (const actorId of pending) {
    if (actorId === claimedActorId) continue;

    const actor = game.actors.get(actorId);
    if (!actor) continue;

    const level = actor.getUserLevel(user);
    if (level >= OBSERVER) {
      const ownership = { ...actor.ownership };
      if (user.id in ownership) {
        delete ownership[user.id];
        removals.push({ _id: actor.id, ownership });
      }
    }
    // Whether the ownership was already gone or was just removed, this entry is
    // no longer a live module grant and should not remain in pendingViews.
  }

  if (removals.length) {
    await Actor.implementation.updateDocuments(removals, { recursive: false, diff: false });
  }

  // The claimed Actor is not a pending view anymore either; every other pending
  // entry was consumed by this cleanup pass.
  remaining.push(...pending.filter(id => id === claimedActorId));
  if (remaining.length !== pending.length) {
    await user.setFlag(CYH_ID, CYH_FLAG, remaining);
  }
}

/**
 * Reconcile stale pending-view records against actual Actor ownership without
 * changing ownership. This is safe to run after world load and keeps the module's
 * bookkeeping synchronized with the real Foundry state.
 */
async function reconcilePendingViewRecords(user) {
  if (!user || user.isGM || game.user !== game.users.activeGM) return;

  const pending = [...getPendingViews(user)];
  if (!pending.length) return;

  const valid = pending.filter(actorId => {
    const actor = game.actors.get(actorId);
    if (!actor) return false;
    const level = actor.getUserLevel(user);
    return level >= OBSERVER && level < OWNER;
  });

  if (valid.length !== pending.length) {
    await user.setFlag(CYH_ID, CYH_FLAG, valid);
  }
}

/**
 * Refresh the GM roster viewer indicators from actual ownership. The Claim Your Hero
 * panel uses pendingViews as its source, so the addon additionally hides stale viewer
 * entries when a grant no longer exists in Foundry.
 */
function syncRosterViewerIndicators(app) {
  if (!game.user.isGM || app?.options?.id !== `${CYH_ID}-roster-config`) return;

  for (const row of app.element?.querySelectorAll?.(".hero-row[data-actor-id]") ?? []) {
    const actor = game.actors.get(row.dataset.actorId);
    const viewerIds = game.users
      .filter(user => !user.isGM && getPendingViews(user).includes(row.dataset.actorId))
      .filter(user => actor?.getUserLevel(user) >= OBSERVER && actor.getUserLevel(user) < OWNER)
      .map(user => user.id);

    const existing = row.querySelector(".viewers");
    if (!viewerIds.length) {
      existing?.remove();
      continue;
    }

    const names = viewerIds.map(id => game.users.get(id)?.name).filter(Boolean);
    const tooltip = `${game.i18n.localize("CYH.RosterConfig.ViewersTip")}: ${names.join(", ")}`;
    if (existing) {
      existing.dataset.tooltip = tooltip;
      existing.querySelector(".count").textContent = String(viewerIds.length);
      continue;
    }

    const viewers = document.createElement("span");
    viewers.className = "viewers";
    viewers.dataset.tooltip = tooltip;
    viewers.innerHTML = `<i class="fa-solid fa-eye"></i><span class="count">${viewerIds.length}</span>`;
    row.querySelector(".info")?.after(viewers);
  }
}

/**
 * Read the Claim Your Hero role catalog. The addon intentionally reads the public
 * world setting instead of importing the main module's private implementation.
 */
function getClassCatalog() {
  return game.settings.get(CYH_ID, CYH_ROLES_SETTING)?.roles ?? [];
}

/**
 * Read the configured roster entries so the filter can match each visible card's
 * Actor id against the role ids assigned to that hero.
 */
function getRosterEntries() {
  return game.settings.get(CYH_ID, CYH_ROSTER_SETTING)?.entries ?? [];
}

/**
 * Return only roles which are actually assigned to at least one roster entry.
 * This keeps the independent search strip useful and prevents an empty search UI
 * when the world has no heroes assigned to any role.
 */
function getAvailableClassRoles(roles) {
  const assignedRoleIds = new Set(
    getRosterEntries().flatMap(entry => entry?.roles ?? []).filter(Boolean)
  );
  return roles.filter(role => role?.id && role.name && assignedRoleIds.has(role.id));
}

/**
 * Update the visual/ARIA state of whichever class controls are currently rendered.
 */
function syncClassFilterControls(app) {
  const selectedRoleId = classFilters.get(app) ?? null;
  const root = app.element;
  if (!root) return;

  const controls = root.querySelectorAll(
    `.${CLASS_FILTER_CLASS} [data-role-id], .composition-bar .comp-role[data-role-id]`
  );
  for (const control of controls) {
    const active = control.dataset.roleId === selectedRoleId;
    control.classList.toggle("active", active);
    control.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

/**
 * Apply the currently selected class to the hero cards without modifying the main
 * Claim Your Hero application. `null` means show the complete roster.
 */
function applyClassFilter(app) {
  const selectedRoleId = classFilters.get(app) ?? null;
  const entries = getRosterEntries();
  const rolesByActor = new Map(entries.map(entry => [entry.actorId, new Set(entry.roles ?? [])]));

  for (const card of app.element?.querySelectorAll?.(".hero-card[data-actor-id]") ?? []) {
    const roleIds = rolesByActor.get(card.dataset.actorId) ?? new Set();
    const visible = !selectedRoleId || roleIds.has(selectedRoleId);
    card.hidden = !visible;
  }

  syncClassFilterControls(app);

  // If the main app currently has a selected hero that disappeared from the filter,
  // close its detail panel so the visible selection remains consistent with the grid.
  if (selectedRoleId) {
    const selectedCard = app.element?.querySelector(".hero-card.selected");
    if (selectedCard?.hidden) {
      app.element?.querySelector('[data-action="clearSelection"]')?.click();
    }
  }
}

/**
 * Handle a class selection. Clicking the active class clears the filter; clicking
 * another class replaces the current filter.
 */
function toggleClassFilter(app, roleId) {
  const current = classFilters.get(app) ?? null;
  classFilters.set(app, current === roleId ? null : roleId);
  applyClassFilter(app);
}

/**
 * Enhance the main module's recommended-composition roles with the same filter
 * behavior as the independent class-search controls. Existing image, name,
 * description, and covered/missing state remain untouched.
 */
function enhanceCompositionFilter(app, roles) {
  const root = app.element;
  const composition = root?.querySelector(".composition-bar");
  if (!composition) return false;

  const byName = new Map(roles.filter(r => r?.id && r.name).map(r => [r.name, r]));
  for (const control of composition.querySelectorAll(".comp-role")) {
    const name = control.querySelector(".comp-name")?.textContent?.trim();
    const role = byName.get(name);
    if (!role) continue;

    control.dataset.roleId = role.id;
    control.setAttribute("role", "button");
    control.setAttribute("tabindex", "0");
    control.setAttribute("aria-pressed", "false");
    if (role.description) control.dataset.tooltip = role.description;

    control.addEventListener("click", () => toggleClassFilter(app, role.id));
    control.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleClassFilter(app, role.id);
    });
  }

  return true;
}

/**
 * Build the independent class-search strip. When the main module's recommended
 * composition exists, that existing strip is enhanced instead and no second bar
 * is rendered. Without a composition, the independent filter remains available,
 * but only when at least one configured roster entry actually has a role.
 */
function ensureClassFilter(app) {
  if (!app?.element || app?.options?.id !== `${CYH_ID}-selection`) return;

  const root = app.element;
  const roles = getClassCatalog();
  if (!roles.length) return;

  const composition = root.querySelector(".composition-bar");
  const existingFilter = root.querySelector(`.${CLASS_FILTER_CLASS}`);

  if (composition) {
    existingFilter?.remove();
    enhanceCompositionFilter(app, roles);
    applyClassFilter(app);
    return;
  }

  const availableRoles = getAvailableClassRoles(roles);

  if (!availableRoles.length) {
    existingFilter?.remove();
    classFilters.delete(app);
    return;
  }

  if (existingFilter) {
    applyClassFilter(app);
    return;
  }

  const filter = document.createElement("div");
  filter.className = CLASS_FILTER_CLASS;
  filter.setAttribute("aria-label", "Filtro por classe");

  const buttons = document.createElement("div");
  buttons.className = "class-filter-roles";

  for (const role of availableRoles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "class-filter-role";
    button.dataset.roleId = role.id;
    button.setAttribute("aria-pressed", "false");
    if (role.description) button.dataset.tooltip = role.description;

    if (role.img) {
      const img = document.createElement("img");
      img.src = role.img;
      img.alt = "";
      button.appendChild(img);
    }

    const name = document.createElement("span");
    name.className = "class-filter-name";
    name.textContent = role.name;
    button.appendChild(name);

    button.addEventListener("click", () => toggleClassFilter(app, role.id));
    buttons.appendChild(button);
  }

  filter.appendChild(buttons);

  const header = root.querySelector(".stage-header");
  if (header) header.after(filter);
  else root.querySelector(".stage")?.prepend(filter);

  applyClassFilter(app);
}

Hooks.once("ready", async () => {
  console.log(`[${MODULE_ID}] Sheet layering, pending-view synchronization, and class filtering active.`);

  if (game.user === game.users.activeGM) {
    for (const user of game.users.filter(u => !u.isGM)) {
      await reconcilePendingViewRecords(user);
    }
  }

  Hooks.on("renderApplicationV2", (app) => {
    if (app?.actor) {
      patchBringToFront(app);
      promoteActorSheet(app);
    }
    syncRosterViewerIndicators(app);
    ensureClassFilter(app);
  });

  Hooks.on("updateUser", async (user, changes) => {
    if (game.user !== game.users.activeGM || user.isGM || !("character" in changes)) return;
    await cleanupPendingViews(user, changes.character ?? null);
  });

  Hooks.on("renderApplicationV2", (app) => {
    if (app?.options?.id !== `${CYH_ID}-roster-config`) return;
    setTimeout(() => syncRosterViewerIndicators(app), 0);
  });
});
