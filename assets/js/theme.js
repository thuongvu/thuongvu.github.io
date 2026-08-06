(function () {
  var root = document.documentElement;
  var storageKey = "theme";

  function systemIsDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function effectiveTheme() {
    return root.dataset.theme || (systemIsDark() ? "dark" : "light");
  }

  function updateToggleLabel(button) {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", "Switch to " + next + " mode");
  }

  function initToggle() {
    var button = document.querySelector("[data-theme-toggle]");
    if (!button) return;

    updateToggleLabel(button);

    button.addEventListener("click", function () {
      var nextTheme = effectiveTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = nextTheme;
      localStorage.setItem(storageKey, nextTheme);
      updateToggleLabel(button);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initToggle);
  } else {
    initToggle();
  }
})();
