(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".menu-toggle");
  const drawer = document.querySelector(".nav-drawer");

  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const setDrawer = (open) => {
    if (!toggle || !drawer) return;
    drawer.classList.toggle("is-open", open);
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  };

  if (toggle && drawer) {
    toggle.addEventListener("click", () => setDrawer(!drawer.classList.contains("is-open")));
    drawer.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setDrawer(false));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setDrawer(false);
    });
  }

  const reveals = document.querySelectorAll(".reveal");
  if (reduced) {
    reveals.forEach((el) => el.classList.add("is-in"));
  } else if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => observer.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  const form = document.getElementById("orderForm");
  const qty = document.getElementById("quantity");
  const minus = document.getElementById("qtyMinus");
  const plus = document.getElementById("qtyPlus");
  const submit = document.getElementById("submitBtn");
  const success = document.getElementById("formSuccess");
  const errorBox = document.getElementById("formError");
  const errorMsg = document.getElementById("formErrorMsg");

  if (minus && plus && qty) {
    minus.addEventListener("click", () => {
      const value = parseInt(qty.value, 10);
      if (value > 1) qty.value = String(value - 1);
    });
    plus.addEventListener("click", () => {
      const value = parseInt(qty.value, 10);
      if (value < 20) qty.value = String(value + 1);
    });
  }

  const setError = (id, message) => {
    const hint = document.getElementById("err-" + id);
    const input = document.getElementById(id);
    if (hint) hint.textContent = message;
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  };

  const clearErrors = () => {
    ["firstName", "lastName", "email", "country"].forEach((id) => setError(id, ""));
    errorBox?.classList.remove("is-visible");
  };

  ["firstName", "lastName", "email", "country"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => setError(id, ""));
  });

  const injectToken = async () => {
    try {
      const res = await fetch("token.php", { credentials: "same-origin" });
      const data = await res.json();
      if (!data.token || !form) return;
      let input = document.getElementById("csrfToken");
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "_csrf";
        input.id = "csrfToken";
        form.appendChild(input);
      }
      input.value = data.token;
    } catch (err) {
      console.warn("Could not load security token", err);
    }
  };

  injectToken();

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const email = document.getElementById("email").value.trim();
    const country = document.getElementById("country").value.trim();
    let valid = true;

    if (!firstName) {
      setError("firstName", "Required");
      valid = false;
    }
    if (!lastName) {
      setError("lastName", "Required");
      valid = false;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("email", "Valid email required");
      valid = false;
    }
    if (!country) {
      setError("country", "Required");
      valid = false;
    }
    if (!valid) return;

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Sending your reserve…";
    }

    try {
      const res = await fetch("mail.php", { method: "POST", body: new FormData(form) });
      const data = await res.json();

      if (res.ok && data.ok) {
        form.style.display = "none";
        success?.classList.add("is-visible");
        errorBox?.classList.remove("is-visible");
        const named = document.getElementById("successName");
        if (named) named.textContent = firstName;
        return;
      }

      if (Array.isArray(data.errors)) {
        const fieldMap = {
          "First name": "firstName",
          "Last name": "lastName",
          email: "email",
          Email: "email",
          Country: "country",
        };
        const unmatched = [];
        data.errors.forEach((msg) => {
          let matched = false;
          Object.entries(fieldMap).forEach(([key, id]) => {
            if (matched || !id) return;
            if (String(msg).toLowerCase().includes(key.toLowerCase())) {
              setError(id, msg);
              matched = true;
            }
          });
          if (!matched) unmatched.push(msg);
        });
        if (unmatched.length && errorMsg && errorBox) {
          errorMsg.textContent = unmatched.join(" ");
          errorBox.classList.add("is-visible");
        }
      } else if (errorMsg && errorBox) {
        if (data.error) errorMsg.textContent = data.error;
        errorBox.classList.add("is-visible");
      }
    } catch (err) {
      if (errorBox) errorBox.classList.add("is-visible");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Reserve this roast";
      }
      injectToken();
    }
  });

  document.getElementById("sendAnother")?.addEventListener("click", (event) => {
    event.preventDefault();
    success?.classList.remove("is-visible");
    if (form) {
      form.reset();
      if (qty) qty.value = "1";
      form.style.display = "";
      form.querySelector("input")?.focus();
    }
    injectToken();
  });
})();
