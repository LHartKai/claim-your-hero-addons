// Claim Your Hero — Addons
// Sheet layering fix and pending-view synchronization for the Claim Your Hero selection flow.

const MODULE_ID = "claim-your-hero-addons";
const CYH_ID = "claim-your-hero-v13-351";
const CYH_FLAG = "pendingViews";
const SHEET_CLASS = "claim-your-hero-addons-sheet-layer";
const SHEET_Z_INDEX = "10000";
const OBSERVER = foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const OWNER = foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

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

Hooks.once("ready", async () => {
  console.log(`[${MODULE_ID}] Sheet layering and pending-view synchronization active.`);

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
