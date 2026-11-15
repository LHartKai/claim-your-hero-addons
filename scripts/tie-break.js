// Claim Your Hero — Addons
// Per-character claim arbitration. The active GM remains the sole authority for claims.
(() => {
  const ADDON_ID = "claim-your-hero-addons";
  const CYH_ID = "claim-your-hero";
  const FLAG_KEY = "characterReactions";
  const QUERY = `${CYH_ID}.claim`;
  const SOCKET = `module.${ADDON_ID}.tiebreak`;
  const SELECTION_ID = `${CYH_ID}-selection`;
  const disputes = new Map();
  const selectedHeroes = new Map();
  const claimApprovals = new Map();
  let originalClaim = null;

  const getReactions = user => {
    const value = user?.getFlag(ADDON_ID, FLAG_KEY);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  };
  const getColor = user => user?.color?.css ?? user?.color ?? "#888888";
  const emit = payload => game.socket.emit(SOCKET, payload);
  const isActiveGM = () => game.user === game.users.activeGM;

  function findConflicts(requesterId, actorId) {
    const conflicts = [];
    for (const user of game.users) {
      if (!user.active || user.isGM || user.id === requesterId) continue;
      const reactions = getReactions(user);
      const reaction = reactions[actorId];
      let reason = null;
      if (reaction === "favorite") reason = "favorite";
      else if (reaction === "interested") {
        const hasOtherPriority = Object.entries(reactions).some(([otherActorId, value]) =>
          otherActorId !== actorId && (value === "favorite" || value === "interested")
        );
        if (!hasOtherPriority) reason = "unique-interested";
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
    if (!(dispute.requesterIds ?? [dispute.requesterId]).includes(game.user.id) || game.user.isGM) return;
    document.querySelector(".claim-your-hero-tiebreak-wait")?.remove();
    const panel = document.createElement("section");
    panel.className = "claim-your-hero-tiebreak-wait";
    // Claim Your Hero is a full-screen Foundry app at z-index 9998. Put the
    // waiting notice in the document root stacking layer above every app window.
    Object.assign(panel.style, { position: "fixed", zIndex: "2147483647", top: "18%", left: "50%", transform: "translateX(-50%)" });
    panel.style.setProperty("z-index", "2147483647", "important");
    panel.innerHTML = `
      <h2></h2><p>${game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.WAITING")}</p>
      <div class="claim-your-hero-tiebreak-avatars"></div>`;
    panel.querySelector("h2").textContent = game.i18n.format(
      "CLAIM_YOUR_HERO_ADDONS.TIEBREAK.TITLE", { name: dispute.actorName }
    );
    const requesterSet = new Set(dispute.requesterIds ?? [dispute.requesterId]);
    for (const player of dispute.players.filter(item => item.userId !== game.user.id && !requesterSet.has(item.userId) && item.reason !== "requester")) {
      const avatar = document.createElement("span");
      avatar.className = "claim-your-hero-tiebreak-avatar";
      avatar.style.setProperty("--player-color", player.color);
      avatar.textContent = player.name.slice(0, 1).toUpperCase();
      avatar.title = `${player.name} — ${reasonLabel(player.reason)}`;
      panel.querySelector(".claim-your-hero-tiebreak-avatars").append(avatar);
    }
    document.body.append(panel);
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
      panel.innerHTML = `<header><strong></strong></header><p></p><div class="claim-your-hero-tiebreak-requester"></div><div class="claim-your-hero-tiebreak-contenders"></div>`;
      const openPanels = document.querySelectorAll(".claim-your-hero-tiebreak-gm").length;
      panel.style.top = (14 + openPanels * 4) + "vh";
      panel.style.right = (18 + (openPanels % 3) * 18) + "px";
      panel.style.zIndex = String(10050 + openPanels);
      document.body.append(panel);
    }
    panel.querySelector("header strong").textContent = `Desempate — ${dispute.actorName}`;
    const requesterIds = [...new Set(dispute.requesterIds ?? [dispute.requesterId])];
    const requesterSet = new Set(requesterIds);
    const contenders = (dispute.players ?? []).filter(player => !requesterSet.has(player.userId) && player.reason !== "requester");
    const requesterNames = requesterIds.map(id => game.users.get(id)?.name ?? "Jogador");
    panel.querySelector("p").textContent = `Solicitante(s): ${requesterNames.join(", ")}`;
    const requesterList = panel.querySelector(".claim-your-hero-tiebreak-requester");
    requesterList.replaceChildren();
    for (const requesterId of requesterIds) {
      const requester = game.users.get(requesterId);
      if (!requester) continue;
      const row = document.createElement("div");
      row.className = "claim-your-hero-tiebreak-player is-requester";
      const label = document.createElement("span");
      label.textContent = `${requester.name} — Solicitante`;
      const allow = document.createElement("button");
      allow.type = "button";
      allow.textContent = game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.TIEBREAK.ALLOW");
      allow.addEventListener("click", () => decide(dispute.id, requesterId));
      row.append(label, allow);
      requesterList.append(row);
    }
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

  function announceSheet(app, open) {
    const actorId = (app?.actor ?? app?.document)?.id;
    if (!actorId || game.user.isGM) return;
    if (open) {
      if (!openSheets.has(game.user.id)) openSheets.set(game.user.id, new Set());
      openSheets.get(game.user.id).add(actorId);
    } else {
      const opened = openSheets.get(game.user.id);
      opened?.delete(actorId);
      if (opened?.size === 0) openSheets.delete(game.user.id);
    }
    emit({ type: "sheet", userId: game.user.id, actorId, open, from: game.user.id });
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
      const approvalKey = `${data.actorId}:${data.userId}`;
      if (claimApprovals.has(approvalKey)) {
        claimApprovals.delete(approvalKey);
        return originalClaim(data);
      }
      const actor = game.actors.get(data.actorId);
      const requester = game.users.get(data.userId);
      if (!actor || !requester) return originalClaim(data);

      const players = findConflicts(data.userId, data.actorId);
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
        const requesterSet = new Set(dispute.requesterIds);
        dispute.players = [...new Map([...dispute.players, ...players].filter(p => !requesterSet.has(p.userId) && p.reason !== "requester").map(p => [p.userId, p])).values()];
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
