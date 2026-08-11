(() => {
  const modal = document.querySelector("#download-modal");
  const openButtons = document.querySelectorAll(".js-download");
  const closeButton = document.querySelector(".modal-close");
  const menuButton = document.querySelector(".js-menu");
  const mobileNav = document.querySelector(".mobile-nav");

  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
  };

  openButtons.forEach((button) => {
    button.addEventListener("click", () => {
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      closeButton.focus();
    });
  });
  closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Open menu" : "Close menu");
    menuButton.querySelector("span").textContent = isOpen ? "menu" : "close";
    mobileNav.hidden = isOpen;
  });
  mobileNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mobileNav.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open menu");
      menuButton.querySelector("span").textContent = "menu";
    });
  });

  document.querySelectorAll(".faq-item button").forEach((button) => {
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      document.querySelectorAll(".faq-item button").forEach((otherButton) => {
        otherButton.setAttribute("aria-expanded", "false");
        otherButton.nextElementSibling.hidden = true;
      });
      button.setAttribute("aria-expanded", String(!expanded));
      button.nextElementSibling.hidden = expanded;
    });
  });
})();