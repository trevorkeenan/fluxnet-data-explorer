(function () {
  function getDirectChild(element, tagName) {
    var children = element.children;
    var targetName = tagName.toUpperCase();
    var i;

    for (i = 0; i < children.length; i += 1) {
      if (children[i].tagName === targetName) {
        return children[i];
      }
    }

    return null;
  }

  function isCompactNav() {
    var mobileMenuTabWrapper = document.getElementById("mobileMenuTabWrapper");

    if (!mobileMenuTabWrapper) {
      return window.innerWidth <= 768;
    }

    return window.getComputedStyle(mobileMenuTabWrapper).display !== "none";
  }

  function setExpanded(item, expanded) {
    var submenu = getDirectChild(item, "ul");
    var trigger = getDirectChild(item, "a");
    var toggleButton = getDirectChild(item, "button");

    if (!submenu) {
      return;
    }

    item.classList.toggle("nav-open", expanded);
    submenu.style.display = expanded ? "block" : "none";
    submenu.style.opacity = expanded ? "1" : "";

    if (trigger) {
      trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    if (toggleButton) {
      toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
  }

  function closeSiblings(item) {
    var siblings = item.parentNode ? item.parentNode.children : [];
    var i;

    for (i = 0; i < siblings.length; i += 1) {
      if (siblings[i] !== item && siblings[i].classList.contains("has-submenu")) {
        setExpanded(siblings[i], false);
      }
    }
  }

  function closeAll(items) {
    var i;

    for (i = 0; i < items.length; i += 1) {
      setExpanded(items[i], false);
    }
  }

  function initialiseSiteNavigation() {
    var mobileMenuTab = document.getElementById("mobileMenuTab");
    var menuWrapper = document.getElementById("menuWrapper");
    var menu;
    var items;
    var parents = [];
    var submenuCount = 0;
    var i;

    if (!menuWrapper || menuWrapper.getAttribute("data-site-navigation") === "ready") {
      return;
    }

    menu = menuWrapper.querySelector("#menu");
    if (!menu) {
      return;
    }

    items = menu.getElementsByTagName("li");

    for (i = 0; i < items.length; i += 1) {
      (function (item) {
        var submenu = getDirectChild(item, "ul");
        var trigger = getDirectChild(item, "a");
        var toggleButton;
        var label;

        if (!submenu || !trigger) {
          return;
        }

        item.classList.add("has-submenu");
        parents.push(item);

        submenuCount += 1;
        if (!submenu.id) {
          submenu.id = "site-submenu-" + submenuCount;
        }

        trigger.setAttribute("aria-haspopup", "true");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", submenu.id);

        toggleButton = getDirectChild(item, "button");
        if (!toggleButton || !toggleButton.classList.contains("submenu-toggle")) {
          label = trigger.textContent.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
          toggleButton = document.createElement("button");
          toggleButton.type = "button";
          toggleButton.className = "submenu-toggle";
          toggleButton.setAttribute("aria-controls", submenu.id);
          toggleButton.setAttribute("aria-expanded", "false");
          toggleButton.setAttribute("aria-label", "Toggle " + label + " submenu");
          item.insertBefore(toggleButton, submenu);
        }

        toggleButton.addEventListener("click", function (event) {
          var shouldOpen = !item.classList.contains("nav-open");

          event.preventDefault();
          event.stopPropagation();
          closeSiblings(item);
          setExpanded(item, shouldOpen);
        });

        trigger.addEventListener("click", function (event) {
          if (!isCompactNav() || item.classList.contains("nav-open")) {
            return;
          }

          event.preventDefault();
          closeSiblings(item);
          setExpanded(item, true);
        });

        item.addEventListener("focusin", function () {
          if (isCompactNav()) {
            return;
          }

          closeSiblings(item);
          setExpanded(item, true);
        });

        item.addEventListener("focusout", function (event) {
          var nextTarget = event.relatedTarget;

          if (nextTarget && item.contains(nextTarget)) {
            return;
          }

          if (!isCompactNav()) {
            setExpanded(item, false);
          }
        });

        item.addEventListener("keydown", function (event) {
          if (event.key !== "Escape" && event.key !== "Esc") {
            return;
          }

          setExpanded(item, false);
          trigger.focus();
        });
      }(items[i]));
    }

    document.addEventListener("click", function (event) {
      if (!isCompactNav() || menuWrapper.contains(event.target)) {
        return;
      }

      closeAll(parents);
    });

    if (mobileMenuTab) {
      mobileMenuTab.addEventListener("click", function () {
        closeAll(parents);
      });
    }

    window.addEventListener("resize", function () {
      closeAll(parents);
    });

    menuWrapper.setAttribute("data-site-navigation", "ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseSiteNavigation);
  } else {
    initialiseSiteNavigation();
  }
}());
