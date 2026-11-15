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

  let openMenu = null;
  let openMenuCard = null;

  function getPlayerColor(user) {
    const color = user?.color;
    if (typeof color === "string") return color;
    return color?.css ?? color?.toString?.() ?? "#777777";
  }


  function getUserReactions(user) {
    const value = user?.getFlag(MODULE_ID, FLAG_KEY);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    badge.className = `claim-your-hero-reaction${user.id === game.user.id ? " is-current-player" : " is-other-player"}`;
    badge.style.setProperty("--reaction-player-color", color);
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
    if (!openMenu) return;
    document.removeEventListener("pointerdown", dismissOpenMenu);
    document.removeEventListener("keydown", handleMenuKeydown);
    openMenu.remove();
    openMenuCard?.classList.remove("reaction-menu-open");
    openMenu = null;
    openMenuCard = null;
  }

  function dismissOpenMenu(event) {
    if (openMenu && !openMenu.contains(event.target)) closeMenu();
  }

  function handleMenuKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  function openReactionMenu(event, actorId, card) {
    closeMenu();

    const menu = document.createElement("div");
    menu.className = MENU_CLASS;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", game.i18n.localize("CLAIM_YOUR_HERO_ADDONS.REACTIONS.MENU_LABEL"));

    const currentReaction = getUserReactions(game.user)[actorId];

    for (const reaction of REACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `claim-your-hero-reaction-option${currentReaction === reaction.id ? " is-selected" : ""}`;
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
        const reactions = { ...getUserReactions(game.user) };
        const isRemoving = reactions[actorId] === reaction.id;
        try {
          if (isRemoving) {
            // Foundry merges object flags recursively; setFlag with a map that
            // omits actorId does not delete that nested key. Use -= deletion.
            await game.user.update({
              [`flags.${MODULE_ID}.${FLAG_KEY}.-=${actorId}`]: null
            });
            const remaining = { ...reactions };
            delete remaining[actorId];
            if (Object.keys(remaining).length === 0) {
              await game.user.unsetFlag(MODULE_ID, FLAG_KEY);
            }
          } else {
            reactions[actorId] = reaction.id;
            await game.user.setFlag(MODULE_ID, FLAG_KEY, reactions);
          }
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
    // Offset from the context-click point so the pointer does not hover Favorito on open.
    const left = Math.max(8, Math.min(event.clientX + 14, window.innerWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(event.clientY + 14, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    openMenu = menu;
    openMenuCard = card;
    card.classList.add("reaction-menu-open");

    document.addEventListener("pointerdown", dismissOpenMenu);
    document.addEventListener("keydown", handleMenuKeydown);
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
    openReactionMenu(event, card.dataset.actorId, card);
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
