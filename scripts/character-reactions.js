// Claim Your Hero — Addons
// Shared character reactions for the Claim Your Hero selection screen.
// Each player stores one reaction per Actor; favorites are intentionally not global-exclusive.

(() => {
  const MODULE_ID = "claim-your-hero-addons";
  const FLAG_KEY = "characterReactions";
  const SELECTION_ID = "claim-your-hero-selection";
  const CARD_SELECTOR = ".hero-card[data-actor-id]";
  const RAIL_CLASS = "claim-your-hero-reaction-rail";
  const MENU_CLASS = "claim-your-hero-reaction-menu";
  const REACTIONS = [
    { id: "favorite", icon: "fa-star", label: "FAVORITE" },
    { id: "interested", icon: "fa-eye", label: "INTERESTED" },
    { id: "not-wanted", icon: "fa-xmark", label: "NOT_WANTED" }
  ];

  const enhancedRoots = new WeakSet();
  let openMenu = null;

  function getPlayerColor(user) {
    const color = user?.color;
    if (typeof color === "string") return color;
    return color?.css ?? color?.toString?.() ?? "#777777";
  }

  function getContrastColor(color) {
    let rgb = null;
    const hex = String(color).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      let value = hex[1];
      if (value.length === 3) value = [...value].map(char => char + char).join("");
      rgb = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
    } else {
      const match = String(color).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match) rgb = match.slice(1, 4).map(Number);
    }

    if (!rgb) return "#ffffff";
    const [r, g, b] = rgb.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.42 ? "#111111" : "#ffffff";
  }

  function getUserReactions(user) {
    return user?.getFlag(MODULE_ID, FLAG_KEY) ?? {};
  }

  function getReactionLabel(reactionId) {
    const reaction = REACTIONS.find(item => item.id === reactionId);
    return reaction ? game.i18n.localize(`CLAIM_YOUR_HERO_ADDONS.REACTIONS.${reaction.label}`) : "";
  }

  function makeReactionBadge(user, reactionId) {
    const reaction = REACTIONS.find(item => item.id === reactionId);
    if (!reaction) return null;

    const color = getPlayerColor(user);
    const badge = document.createElement("span");
    badge.className = "claim-your-hero-reaction";
    badge.style.setProperty("--reaction-player-color", color);
    badge.style.setProperty("--reaction-icon-color", getContrastColor(color));
    badge.dataset.userId = user.id;
    badge.dataset.reaction = reactionId;
    badge.title = `${user.name} — ${getReactionLabel(reactionId)}`;
    badge.setAttribute("aria-label", badge.title);

    const icon = document.createElement("i");
    icon.className = `fa-solid ${reaction.icon}`;
    icon.setAttribute("aria-hidden", "true");
    badge.appendChild(icon);
    return badge;
  }

  function renderReactionIndicators(root) {
    if (!root?.querySelectorAll) return;

    for (const card of root.querySelectorAll(CARD_SELECTOR)) {
      const actorId = card.dataset.actorId;
      let rail = card.querySelector(`:scope > .${RAIL_CLASS}`);
      if (!rail) {
        rail = document.createElement("div");
        rail.className = RAIL_CLASS;
        rail.setAttribute("aria-label", game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.REACTIONS.RAIL_LABEL"));
        card.appendChild(rail);
      }

      rail.replaceChildren();
      for (const user of game.users) {
        const reactionId = getUserReactions(user)[actorId];
        if (!reactionId) continue;
        const badge = makeReactionBadge(user, reactionId);
        if (badge) rail.appendChild(badge);
      }
      rail.hidden = rail.childElementCount === 0;
    }
  }

  function refreshOpenSelectionScreens() {
    for (const root of document.querySelectorAll(".claim-your-hero.hero-selection")) {
      renderReactionIndicators(root);
    }
  }

  function closeMenu() {
    openMenu?.remove();
    openMenu = null;
  }

  function openReactionMenu(event, actorId) {
    closeMenu();

    const menu = document.createElement("div");
    menu.className = MENU_CLASS;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.REACTIONS.MENU_LABEL"));

    for (const reaction of REACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "claim-your-hero-reaction-option";
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-label", getReactionLabel(reaction.id));
      button.title = getReactionLabel(reaction.id);

      const icon = document.createElement("i");
      icon.className = `fa-solid ${reaction.icon}`;
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);

      const label = document.createElement("span");
      label.textContent = getReactionLabel(reaction.id);
      button.appendChild(label);

      button.addEventListener("click", async () => {
        const reactions = { ...getUserReactions(game.user), [actorId]: reaction.id };
        try {
          await game.user.setFlag(MODULE_ID, FLAG_KEY, reactions);
          closeMenu();
          refreshOpenSelectionScreens();
        } catch (error) {
          console.error(`[${MODULE_ID}] Could not save character reaction.`, error);
          ui.notifications?.error(game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.REACTIONS.SAVE_ERROR"));
        }
      });
      menu.appendChild(button);
    }

    document.body.appendChild(menu);
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    openMenu = menu;

    const dismiss = pointerEvent => {
      if (!menu.contains(pointerEvent.target)) closeMenu();
    };
    const escape = keyEvent => {
      if (keyEvent.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", dismiss, { once: true });
    document.addEventListener("keydown", escape, { once: true });
    menu.querySelector("button")?.focus();
  }

  function handleCharacterContextMenu(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const card = target?.closest(CARD_SELECTOR);
    if (!card) return;

    const root = card.closest(".claim-your-hero.hero-selection");
    if (!root) return;

    // Capture phase is intentional: the selection UI may stop contextmenu
    // propagation on the card itself. Intercept before those handlers run.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openReactionMenu(event, card.dataset.actorId);
  }

  function enhanceSelection(app) {
    if (app?.options?.id !== SELECTION_ID || !app.element) return;
    renderReactionIndicators(app.element);
  }

  Hooks.once("ready", () => {
    // Listen on document in capture phase so inner card handlers cannot swallow
    // the right-click before the reaction menu sees it.
    document.addEventListener("contextmenu", handleCharacterContextMenu, true);
    Hooks.on("renderApplicationV2", enhanceSelection);
    Hooks.on("updateUser", refreshOpenSelectionScreens);
    console.log(`[${MODULE_ID}] Character reactions ready.`);
  });
})();
