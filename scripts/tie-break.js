// Claim Your Hero — Addons
// Per-character claim arbitration. The active GM remains the sole authority for claims.
(() => {
  const ADDON_ID = "claim-your-hero-addons";
  const CYH_ID = "claim-your-hero";
  const FLAG_KEY = "characterReactions";
  const QUERY = `${CYH_ID}.claim`;
  // Foundry registers exactly one socket channel per module: module.<module-id>.
  // Subchannels such as ".tiebreak" are not registered and silently drop broadcasts.
  const SOCKET = `module.${ADDON_ID}`;
  const SELECTION_ID = `${CYH_ID}-selection`;
  const disputes = new Map();
  const selectedHeroes = new Map();
  let originalClaim = null;

  const getReactions = user => {
    const value = user?.getFlag(ADDON_ID, FLAG_KEY);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  };
  const getColor = user => user?.color?.css ?? user?.color ?? "#888888";
  const emit = payload => game.socket.emit(SOCKET, payload);
  const isActiveGM = () => game.user === game.users.activeGM;

  function findConflicts(actorId) {
    const conflicts = [];
    for (const user of game.users) {
      if (!user.active || user.isGM) continue;
      const reactions = getReactions(user);
      const reaction = reactions[actorId];
      const reactionEntries = Object.entries(reactions).filter(([, value]) =>
        value === "favorite" || value === "interested"
      );
      const favoriteCount = reactionEntries.filter(([, value]) => value === "favorite").length;
      let reason = null;

      // Priority 1: this is the only character with any reaction,
      // whether that single reaction is "interested" or "favorite".
      if ((reaction === "interested" || reaction === "favorite") && reactionEntries.length === 1) {
        reason = "unique-interested";
      // Priority 2: this is the player's only favorite, even if they have
      // interests on other characters.
      } else if (reaction === "favorite" && favoriteCount === 1) {
        reason = "unique-favorite";
      // Priority 3: favorite, when the player has multiple favorites.
      } else if (reaction === "favorite" && favoriteCount > 1) {
        reason = "favorite";
      // Priority 4: interested here, but has at least one favorite elsewhere.
      } else if (reaction === "interested" && favoriteCount > 0) {
        reason = "interested-with-other-favorite";
      // Priority 5: interested in this character, but not exclusively.
      } else if (reaction === "interested") {
        reason = "interested";
      // Priority 6: selected in the choice screen, with no reaction on this character.
      } else if (!reaction && selectedHeroes.get(user.id) === actorId) {
        reason = "selected-in-claim";
      }

      if (reason) conflicts.push({
        userId: user.id, name: user.name, color: getColor(user), reason
      });
    }
    return conflicts;
  }

  function playerWaitingView(dispute) {
    if (game.user.isGM) return;
    const requesterIds = dispute.requesterIds ?? [dispute.requesterId];
    const isRequester = requesterIds.includes(game.user.id);
    const isContender = (dispute.players ?? []).some(player => player.userId === game.user.id);
    if (!isRequester && !isContender) return;
    document.querySelector(".claim-your-hero-tiebreak-wait")?.remove();
    const panel = document.createElement("section");
    panel.className = "claim-your-hero-tiebreak-wait";
    // Keep the player notice below Foundry character sheets and other app windows,
    // so it never covers the sheet the player may need to consult.
    Object.assign(panel.style, { position: "fixed", zIndex: "10001", top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
    panel.style.setProperty("z-index", "10001", "important");
    panel.innerHTML = `
      <div class="claim-your-hero-tiebreak-sword" aria-hidden="true"></div>
      <h2></h2>
      <img class="claim-your-hero-tiebreak-portrait" alt="">
      <p></p>
      <div class="claim-your-hero-tiebreak-avatars"></div>`;
    panel.querySelector("h2").textContent = game.i18n.format(
      "CLAIM_YOUR_HERO_ADDONS.TIEBREAK.TITLE", { name: dispute.actorName }
    );
    const actor = game.actors.get(dispute.actorId);
    const portrait = panel.querySelector(".claim-your-hero-tiebreak-portrait");
    portrait.src = actor?.img || "";
    portrait.alt = dispute.actorName || "";
    // Requesters and contenders receive the same waiting message.
    panel.querySelector("p").textContent = game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.WAITING");

    // Show every participant on every client, including the requester and
    // the local player, so all involved users see the same participant icons.
    const participants = new Map();
    for (const player of dispute.players ?? []) participants.set(player.userId, player);
    for (const userId of dispute.requesterIds ?? [dispute.requesterId]) {
      if (!participants.has(userId)) {
        const user = game.users.get(userId);
        if (user) participants.set(userId, {
          userId, name: user.name, color: getColor(user), reason: null
        });
      }
    }
    for (const player of participants.values()) {
      const avatar = document.createElement("span");
      avatar.className = "claim-your-hero-tiebreak-avatar";
      avatar.style.setProperty("--player-color", player.color || "#888888");
      avatar.textContent = (player.name || "?").slice(0, 1).toUpperCase();
      avatar.title = player.reason
        ? `${player.name} — ${reasonLabel(player.reason)}`
        : player.name;
      panel.querySelector(".claim-your-hero-tiebreak-avatars").append(avatar);
    }
    document.body.append(panel);
    makeDraggable(panel, panel.querySelector("h2"));
  }

  function makeDraggable(panel, handle) {
    if (!panel || !handle || handle.dataset.dragReady === "true") return;
    handle.dataset.dragReady = "true";
    handle.style.cursor = "move";
    handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      panel.style.transform = "none";
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      handle.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        const left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, moveEvent.clientX - offsetX));
        const top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, moveEvent.clientY - offsetY));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
      };
      const stop = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    });
  }

  function reasonLabel(reason) {
    return game.i18n.localize(`CLAIM_YOUR_HERO_ADDONS.TIEBREAK.REASONS.${reason.toUpperCase().replaceAll("-", "_")}`);
  }

  function renderGMDispute(dispute) {
    if (!game.user.isGM) return;
    let panel = document.querySelector(`[data-tiebreak-id="${dispute.id}"]`);
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "claim-your-hero-tiebreak-gm";
      panel.dataset.tiebreakId = dispute.id;
      panel.innerHTML = `<header><strong></strong></header><p></p><div class="claim-your-hero-tiebreak-contenders"></div><footer><button type="button" class="claim-your-hero-tiebreak-cancel"></button></footer>`;
      const openPanels = document.querySelectorAll(".claim-your-hero-tiebreak-gm").length;
      panel.style.top = (14 + openPanels * 4) + "vh";
      panel.style.right = (18 + (openPanels % 3) * 18) + "px";
      panel.style.zIndex = String(10050 + openPanels);
      document.body.append(panel);
      makeDraggable(panel, panel.querySelector("header"));
    }
    panel.querySelector("header strong").textContent = `Desempate — ${dispute.actorName}`;
    const contenders = dispute.players ?? [];
    panel.querySelector("p").textContent = "";
    const list = panel.querySelector(".claim-your-hero-tiebreak-contenders");
    list.replaceChildren();
    for (const player of contenders) {
      const row = document.createElement("div");
      row.className = "claim-your-hero-tiebreak-player";
      const label = document.createElement("span");
      label.textContent = `${player.name} — ${reasonLabel(player.reason)}`;
      const allow = document.createElement("button");
      allow.type = "button";
      allow.textContent = game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.ALLOW");
      allow.addEventListener("click", () => decide(dispute.id, player.userId));
      row.append(label, allow);
      list.append(row);
    }
    const cancel = panel.querySelector(".claim-your-hero-tiebreak-cancel");
    cancel.textContent = game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.CANCEL");
    cancel.onclick = () => cancelDispute(dispute.id);
  }

  function cancelDispute(disputeId) {
    if (!isActiveGM()) {
      emit({ type: "cancel-request", disputeId, from: game.user.id });
      return;
    }
    const dispute = disputes.get(disputeId);
    if (!dispute) return;
    emit({
      type: "cancel", disputeId, actorId: dispute.actorId,
      requesterIds: dispute.requesterIds ?? [dispute.requesterId],
      playerIds: (dispute.players ?? []).map(player => player.userId),
      from: game.user.id
    });
    closeDispute(disputeId);
    ui.notifications.info(game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.CANCELLED"));
  }

  async function decide(disputeId, winnerId) {
    const dispute = disputes.get(disputeId);
    if (!dispute || !isActiveGM()) {
      emit({ type: "decide", disputeId, winnerId, from: game.user.id });
      return;
    }
    if (dispute.resolving) return;
    dispute.resolving = true;
    const user = game.users.get(winnerId);
    const actor = game.actors.get(dispute.actorId);
    let result = { ok: false, reason: "missing" };
    if (user && actor && !user.character) {
      // Re-run the original GM-side claim handler; it still checks roster membership,
      // actor availability and the user's existing character before changing ownership.
      result = await originalClaim({ userId: winnerId, actorId: dispute.actorId });
    } else if (user?.character) result = { ok: false, reason: "alreadyHas" };

    emit({ type: "resolved", disputeId, actorId: dispute.actorId, requesterId: dispute.requesterId, requesterIds: dispute.requesterIds ?? [dispute.requesterId], winnerId, ok: !!result?.ok, from: game.user.id });
    if (result?.ok) {
      game.socket.emit(`module.${CYH_ID}`, { type: "claimed", userId: winnerId, actorId: dispute.actorId });
    }
    closeDispute(disputeId);
  }

  function closeDispute(id) {
    disputes.delete(id);
    document.querySelector(`[data-tiebreak-id="${id}"]`)?.remove();
  }

  function receive(payload) {
    if (!payload || payload.from === game.user.id) return;
    if (payload.type === "select") {
      if (payload.actorId) selectedHeroes.set(payload.userId, payload.actorId);
      else selectedHeroes.delete(payload.userId);
    }
    if (payload.type === "claimed") {
      for (const [userId, actorId] of selectedHeroes.entries()) {
        if (actorId === payload.actorId) selectedHeroes.delete(userId);
      }
    }
    if (payload.type === "created") {
      disputes.set(payload.dispute.id, payload.dispute);
      playerWaitingView(payload.dispute);
      renderGMDispute(payload.dispute);
    }
    if (payload.type === "decide" && isActiveGM()) {
      decide(payload.disputeId, payload.winnerId);
    }
    if (payload.type === "cancel-request" && isActiveGM()) {
      cancelDispute(payload.disputeId);
    }
    if (payload.type === "cancel") {
      document.querySelector(".claim-your-hero-tiebreak-wait")?.remove();
      if ([...(payload.requesterIds ?? []), ...(payload.playerIds ?? [])].includes(game.user.id) && !game.user.isGM) {
        ui.notifications.info(game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.CANCELLED"));
      }
      closeDispute(payload.disputeId);
    }
    if (payload.type === "resolved") {
      document.querySelector(".claim-your-hero-tiebreak-wait")?.remove();
      if (payload.winnerId === game.user.id && payload.ok) {
        ui.notifications.info(game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.CLAIM_GRANTED"));
        foundry.applications.instances.get(SELECTION_ID)?.close();
        game.actors.get(payload.actorId)?.sheet?.render({ force: true });
      } else if ((payload.requesterIds ?? [payload.requesterId]).includes(game.user.id) && !game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.NOT_SELECTED"));
      }
      closeDispute(payload.disputeId);
    }
    if (payload.type === "cancel") closeDispute(payload.disputeId);
  }

  Hooks.once("ready", () => {
    game.socket.on(SOCKET, receive);
    if (!game.user.isGM && ui.notifications?.warn) {
      const warn = ui.notifications.warn.bind(ui.notifications);
      ui.notifications.warn = (message, ...args) => {
        if (message === "CYH.Selection.Error.failed") {
          // The socket event that creates the persistent waiting panel can arrive
          // just after the base module emits its generic claim-failure warning.
          // Defer that warning briefly and discard it if arbitration is now visible.
          window.setTimeout(() => {
            if (!document.querySelector(".claim-your-hero-tiebreak-wait")) warn(message, ...args);
          }, 700);
          return;
        }
        return warn(message, ...args);
      };
    }

    // Wrap the main module's GM-side query handler. Returning a pending result stops
    // the normal claim path before it can grant ownership.
    originalClaim = CONFIG.queries?.[QUERY];
    if (typeof originalClaim !== "function") {
      console.error(`[${ADDON_ID}] Could not find the Claim Your Hero claim query.`);
      return;
    }
    CONFIG.queries[QUERY] = async data => {
      if (!isActiveGM()) return originalClaim(data);
      const actor = game.actors.get(data.actorId);
      const requester = game.users.get(data.userId);
      if (!actor || !requester) return originalClaim(data);

      const players = findConflicts(data.actorId);
      let dispute = [...disputes.values()].find(item => item.actorId === data.actorId);
      if (!players.length && !dispute) return originalClaim(data);
      if (!dispute) {
        dispute = {
          id: foundry.utils.randomID(), actorId: data.actorId, actorName: actor.name,
          requesterId: data.userId, requesterIds: [data.userId], players, createdAt: Date.now()
        };
        disputes.set(dispute.id, dispute);
        renderGMDispute(dispute);
        emit({ type: "created", dispute, from: game.user.id });
      } else {
        if (!dispute.requesterIds) dispute.requesterIds = [dispute.requesterId];
        if (!dispute.requesterIds.includes(data.userId)) {
          dispute.requesterIds.push(data.userId);
        }
        dispute.players = [...new Map([...dispute.players, ...players].map(p => [p.userId, p])).values()];
        renderGMDispute(dispute);
        emit({ type: "created", dispute, from: game.user.id });
      }
      return { ok: false, reason: "tieBreakPending", disputeId: dispute.id };
    };

    // Claim Your Hero broadcasts the currently selected actor on its own socket.
    // Mirror that ephemeral state so the GM can arbitrate based on the selection UI,
    // not on whether an Actor sheet happens to be open.
    game.socket.on(`module.${CYH_ID}`, receive);
    // Ask connected clients to re-announce their current selection when this addon starts.
    game.socket.emit(`module.${CYH_ID}`, { type: "join", userId: game.user.id });
    Hooks.on("userConnected", (user, connected) => {
      if (!connected) selectedHeroes.delete(user.id);
    });
    console.log(`[${ADDON_ID}] Character tie-break arbitration ready.`);
  });
})();
