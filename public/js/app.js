/* Opa Lacho — comportamiento de la página (JavaScript simple, sin librerías). */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Precios (igual que el backend: server.py)                           */
  /* ------------------------------------------------------------------ */
  // Precios reales (volante del cliente). Productos de 500 g.
  var COSECHAS = { cosecha1: 82000, cosecha2: 62000 };
  function cop(n) {
    return "$" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " COP";
  }

  /* ------------------------------------------------------------------ */
  /* Analítica ligera (se guarda en SQLite vía /api/events)              */
  /* ------------------------------------------------------------------ */
  function sessionId() {
    try {
      var id = sessionStorage.getItem("ol_sid");
      if (!id) {
        id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
        sessionStorage.setItem("ol_sid", id);
      }
      return id;
    } catch (e) {
      return "anon";
    }
  }
  function track(event, properties) {
    try {
      var props = Object.assign({}, properties || {}, { path: location.pathname });
      fetch("/api/events", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId(), event_name: event, properties: props }),
      }).catch(function () {});
    } catch (e) {
      /* ignorar */
    }
  }

  function initSectionTracking(ids) {
    var seen = {};
    var seenCount = 0;
    var last = ids[0];
    var sent = false;
    if ("IntersectionObserver" in window) {
      var obs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            var id = e.target.id;
            last = id;
            if (!seen[id]) {
              seen[id] = true;
              seenCount++;
              track("section_view", { section: id });
            }
          });
        },
        { threshold: 0.4 }
      );
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) obs.observe(el);
      });
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && !sent) {
        sent = true;
        track("section_exit", { last_section: last, sections_seen: seenCount });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function setClasses(el, add, remove) {
    remove.split(" ").forEach(function (c) { if (c) el.classList.remove(c); });
    add.split(" ").forEach(function (c) { if (c) el.classList.add(c); });
  }
  // Clases de los botones "activo / inactivo" (iguales a las del diseño original)
  var ACTIVE = "bg-brand text-primary-foreground ring-brand";
  var CHIP_OFF = "text-ink/75 ring-ink/15";
  var PLAN_FREQ_OFF = "text-ink ring-ink/15";
  var WAIT_FREQ_OFF = "bg-cream text-ink ring-ink/15";

  /* ------------------------------------------------------------------ */
  /* Suscripción (Comunidad / Semanal / Quincenal)                       */
  /* ------------------------------------------------------------------ */
  var PLAN_INFO = {
    comunidad: { hint: "Gratis. 10% de descuento en su primera compra.", ok: "Le escribiremos con su descuento del 10% para cuando haga su primera compra." },
    semanal: { hint: "Cosecha #1 ($301.760) o #2 ($228.160) por 4 entregas, con 8% de descuento el primer mes.", ok: "Le escribiremos para confirmar su cosecha, su entrega semanal y el pago del primer mes con 8% de descuento." },
    quincenal: { hint: "Cosecha #1 ($157.440) o #2 ($119.040) por 2 entregas, con 4% de descuento el primer mes.", ok: "Le escribiremos para confirmar su cosecha, su entrega quincenal y el pago del primer mes con 4% de descuento." }
  };
  var PLAN_OFF = "bg-cream text-ink ring-ink/15";
  function initSuscripcion() {
    var form = $("#sub-form");
    if (!form) return;
    var planBtns = $$("[data-sub-plan]", form);
    var chips = $$("[data-obj]", form);
    var submit = $("button[type=submit]", form);
    var dir = $("#sub-direccion");
    var hint = $("#sub-plan-hint");
    var plan = "comunidad";
    var objetivos = [];
    var errorEl = null;

    function showError(msg) {
      if (!msg) { if (errorEl) { errorEl.remove(); errorEl = null; } return; }
      if (!errorEl) {
        errorEl = document.createElement("p");
        errorEl.className = "text-sm text-destructive";
        errorEl.setAttribute("role", "alert");
        submit.insertAdjacentElement("beforebegin", errorEl);
      }
      errorEl.textContent = msg;
    }
    function setPlan(p) {
      if (!PLAN_INFO[p]) return;
      plan = p;
      planBtns.forEach(function (b) {
        var on = b.dataset.subPlan === p;
        b.setAttribute("aria-checked", on ? "true" : "false");
        setClasses(b, on ? ACTIVE : PLAN_OFF, on ? PLAN_OFF : ACTIVE);
      });
      if (hint) hint.textContent = PLAN_INFO[p].hint;
      if (dir) dir.placeholder = p === "comunidad" ? "Dirección de entrega (opcional)" : "Dirección de entrega";
    }
    planBtns.forEach(function (b) {
      b.addEventListener("click", function () { setPlan(b.dataset.subPlan); track("plan_select", { plan: b.dataset.subPlan, source: "form" }); });
    });
    $$("[data-plan-pick]").forEach(function (a) {
      a.addEventListener("click", function () { setPlan(a.dataset.planPick); track("cta_click", { location: "membresia", plan: a.dataset.planPick }); });
    });
    $$("[data-pricing-plan]").forEach(function (a) {
      a.addEventListener("click", function () { setPlan("semanal"); });
    });
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        var g = c.dataset.obj, i = objetivos.indexOf(g), on = i < 0;
        if (on) objetivos.push(g); else objetivos.splice(i, 1);
        c.setAttribute("aria-pressed", on ? "true" : "false");
        setClasses(c, on ? ACTIVE : CHIP_OFF, on ? CHIP_OFF : ACTIVE);
      });
    });
    setPlan("comunidad");

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {
        plan: plan,
        nombre: String(fd.get("nombre") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        direccion: String(fd.get("direccion") || "").trim(),
        objetivos: objetivos.slice(),
        consent: fd.get("consent") === "on"
      };
      var msg = null;
      if (!payload.nombre) msg = "Ingrese su nombre";
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) msg = "Correo inválido";
      else if (plan !== "comunidad" && !payload.direccion) msg = "Ingrese su dirección de entrega";
      else if (!payload.consent) msg = "Necesitamos su autorización";
      if (msg) { showError(msg); track("subscription_error", { reason: "validation" }); return; }
      showError(null);
      submit.disabled = true;
      submit.textContent = "Enviando…";
      try {
        var res = await fetch("/api/suscripciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { var j = await res.json().catch(function () { return {}; }); throw new Error(j.error || "db"); }
      } catch (err) {
        submit.disabled = false;
        submit.textContent = "Suscribirme";
        showError(err.message && err.message !== "db" ? err.message : "No pudimos registrarle. Intente de nuevo.");
        track("subscription_error", { reason: "server" });
        return;
      }
      track("subscription_submit", { plan: plan, objetivos: objetivos.length });
      var done = document.createElement("div");
      done.className = "rounded-3xl bg-cream p-8 text-center ring-1 ring-black/5";
      var h3 = document.createElement("h3"); h3.className = "font-display text-2xl font-medium text-ink"; h3.textContent = "¡Bienvenido a Vida Buena, " + payload.nombre.split(" ")[0] + "!";
      var p1 = document.createElement("p"); p1.className = "mt-2 text-sm text-ink/70"; p1.textContent = PLAN_INFO[plan].ok;
      done.appendChild(h3); done.appendChild(p1);
      if (objetivos.length) { var p2 = document.createElement("p"); p2.className = "mt-2 text-sm text-ink/70"; p2.textContent = "Guardamos sus objetivos: " + objetivos.join(", ") + "."; done.appendChild(p2); }
      form.replaceWith(done);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Copiar llave de pago                                                */
  /* ------------------------------------------------------------------ */
  function initPayment() {
    var btn = $("#copy-key");
    if (!btn) return;
    var key = $("#payment-key").textContent.trim();
    var status = $("#copy-status");
    var label = $("#copy-key-label");
    var icon = $("svg", btn);
    var COPY_ICON = icon.innerHTML;
    var CHECK_ICON = '<path d="M20 6 9 17l-5-5"></path>';

    function fallbackCopy() {
      var ta = document.createElement("textarea");
      ta.value = key;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }

    btn.addEventListener("click", async function () {
      var ok = false;
      try {
        await navigator.clipboard.writeText(key);
        ok = true;
      } catch (e) {
        ok = fallbackCopy();
      }
      if (ok) {
        icon.innerHTML = CHECK_ICON;
        label.textContent = "Llave copiada";
        status.textContent = "Llave lista para pegar en su banco.";
      } else {
        icon.innerHTML = COPY_ICON;
        label.textContent = "Copiar llave";
        status.textContent = "No se pudo copiar. Seleccione la llave y cópiela manualmente.";
      }
    });
  }


  /* ------------------------------------------------------------------ */
  /* Contenido editable (public/contenido.json): WhatsApp, gramos, testimonios */
  /* ------------------------------------------------------------------ */
  function initContent() {
    // Precios dinámicos (una sola fuente de verdad)
    var hp = $("#hero-price");
    if (hp) hp.textContent = "Desde " + cop(Math.min(COSECHAS.cosecha1, COSECHAS.cosecha2));

    fetch("/contenido.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (c) {
        // WhatsApp
        var num = String(c.whatsapp || "").replace(/\D/g, "");
        if (num) {
          var msg = c.whatsapp_mensaje || "Hola, quiero reservar mi Cosecha de Bienestar";
          var href = "https://wa.me/" + num + "?text=" + encodeURIComponent(msg);
          $$("[data-wa]").forEach(function (a) {
            a.href = href;
            a.hidden = false;
            a.addEventListener("click", function () { track("whatsapp_click", { location: a.id || "enlace" }); });
          });
        }
        var yt = String(c.youtube || "").trim();
        if (/^https?:\/\//.test(yt)) $$("[data-yt]").forEach(function (a) { a.href = yt; a.hidden = false; });
        var ig = String(c.instagram || "").trim();
        if (/^https?:\/\//.test(ig)) $$('a[href*="instagram.com"]').forEach(function (a) { a.href = ig; });
        // Gramos por producto
        var g = c.gramos || {};
        Object.keys(g).forEach(function (k) {
          var el = $('[data-gramos="' + k + '"]');
          if (el && g[k]) { el.textContent = g[k]; el.hidden = false; }
        });
        // Testimonios reales
        var list = Array.isArray(c.testimonios) ? c.testimonios.filter(function (t) { return t && t.texto && t.nombre; }) : [];
        var sec = $("#testimonios");
        if (sec && list.length) {
          var box = $("#testimonios-lista");
          list.slice(0, 6).forEach(function (t) {
            var card = document.createElement("figure");
            card.className = "rounded-3xl bg-cream p-7 ring-1 ring-black/5";
            var q = document.createElement("blockquote");
            q.className = "font-sans text-sm leading-relaxed text-ink/80";
            q.textContent = "“" + t.texto + "”";
            var cap = document.createElement("figcaption");
            cap.className = "mt-5 flex items-center gap-3";
            if (t.foto) {
              var im = document.createElement("img");
              im.src = t.foto; im.alt = ""; im.loading = "lazy";
              im.className = "size-11 rounded-full object-cover";
              cap.appendChild(im);
            }
            var who = document.createElement("div");
            var n = document.createElement("p");
            n.className = "font-display text-base font-medium text-ink";
            n.textContent = t.nombre;
            who.appendChild(n);
            if (t.ciudad) {
              var ci = document.createElement("p");
              ci.className = "font-sans text-xs text-ink/70";
              ci.textContent = t.ciudad;
              who.appendChild(ci);
            }
            cap.appendChild(who);
            card.appendChild(q); card.appendChild(cap);
            box.appendChild(card);
          });
          sec.hidden = false;
        }
      });
  }

  /* ------------------------------------------------------------------ */
  /* Barra fija en celular                                               */
  /* ------------------------------------------------------------------ */
  function initStickyCta() {
    var bar = $("#sticky-cta");
    var hero = $("#inicio");
    var cta = $("#cta");
    if (!bar || !hero || !cta || !("IntersectionObserver" in window)) return;
    var heroVisible = true, ctaVisible = false;
    function update() {
      var show = !heroVisible && !ctaVisible;
      bar.classList.toggle("translate-y-full", !show);
      bar.classList.toggle("pointer-events-none", !show);
    }
    new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; update(); }).observe(hero);
    new IntersectionObserver(function (e) { ctaVisible = e[0].isIntersecting; update(); }, { threshold: 0.1 }).observe(cta);
  }

  /* ------------------------------------------------------------------ */
  /* Aparición suave al hacer scroll                                     */
  /* ------------------------------------------------------------------ */
  function initReveal() {
    if (!("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    var targets = [];
    $$("main section:not(#inicio):not(#cta) > div").forEach(function (box) {
      Array.prototype.forEach.call(box.children, function (child) {
        if (child.classList.contains("grid") || child.tagName === "UL") {
          Array.prototype.forEach.call(child.children, function (c, i) { c.style.transitionDelay = i * 70 + "ms"; targets.push(c); });
        } else targets.push(child);
      });
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
        setTimeout(function () { e.target.style.transitionDelay = ""; }, 900);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    targets.forEach(function (t) { t.classList.add("reveal"); io.observe(t); });
  }

  /* ------------------------------------------------------------------ */
  /* Inicio                                                              */
  /* ------------------------------------------------------------------ */
  function initVideo() {
    var b = $("#yt-play");
    if (!b) return;
    b.addEventListener("click", function () {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + b.dataset.ytId + "?autoplay=1&rel=0";
      f.title = "Video de Opa Lacho";
      f.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      f.className = "absolute inset-0 h-full w-full";
      b.replaceWith(f);
      track("video_play", { video: b.dataset.ytId });
    });
  }

  function init() {
    initSectionTracking(["inicio", "problema", "solucion", "bolsa", "video", "precios", "membresia", "como", "beneficios", "nosotros", "testimonios", "cta", "faq"]);
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href^='#']");
      if (a) track("cta_click", { label: (a.textContent || "").trim().slice(0, 60), target: a.getAttribute("href") });
    });
    // Botones "Elegir semanal/quincenal" de la sección de precios
    $$("[data-pricing-plan]").forEach(function (a) {
      a.addEventListener("click", function () {
        track("cta_click", { location: "pricing", plan: a.dataset.pricingPlan });
      });
    });
    initSuscripcion();
    initVideo();
    initPayment();
    initContent();
    initStickyCta();
    initReveal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
