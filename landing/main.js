(function () {
  "use strict";

  var header = document.querySelector("[data-header]");
  var toggle = document.querySelector("[data-menu-toggle]");
  var nav = document.getElementById("nav");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function updateHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  function closeMenu() {
    if (!nav || !toggle) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir menu");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      var isOpen = toggle.getAttribute("aria-expanded") === "true";
      nav.classList.toggle("is-open", !isOpen);
      toggle.setAttribute("aria-expanded", String(!isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Abrir menu" : "Fechar menu");
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu();
    });

    document.addEventListener("click", function (event) {
      if (!nav.classList.contains("is-open")) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      closeMenu();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 960) closeMenu();
    });
  }

  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  function showAll() {
    revealItems.forEach(function (item) {
      item.classList.add("is-visible");
    });
  }

  if (!("IntersectionObserver" in window) || reduceMotion) {
    showAll();
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -32px 0px", threshold: 0.08 }
    );

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });

    window.setTimeout(showAll, 1300);
  }

  var numberFormatter = new Intl.NumberFormat("pt-BR");

  function animateNumber(element) {
    var target = Number(element.getAttribute("data-count"));
    if (!Number.isFinite(target) || target <= 0) return;
    if (reduceMotion) {
      element.textContent = numberFormatter.format(target);
      return;
    }

    var duration = target > 1000 ? 1250 : 900;
    var start = null;

    function frame(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = numberFormatter.format(Math.round(target * eased));
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        element.textContent = numberFormatter.format(target);
      }
    }

    window.requestAnimationFrame(frame);
  }

  var counters = Array.prototype.slice.call(document.querySelectorAll("[data-count]"));

  if (counters.length) {
    if (!("IntersectionObserver" in window) || reduceMotion) {
      counters.forEach(function (counter) {
        counter.textContent = numberFormatter.format(Number(counter.getAttribute("data-count")));
      });
    } else {
      var counterObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            animateNumber(entry.target);
            counterObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.55 }
      );

      counters.forEach(function (counter) {
        counterObserver.observe(counter);
      });
    }
  }
})();
