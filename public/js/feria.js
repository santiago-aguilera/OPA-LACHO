/* Opa Lacho — página de feria (/feria) y modo stand (/feria?modo=stand). */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var feria = (params.get("feria") || "").trim();
  var stand = params.get("modo") === "stand";
  var interes = "no_se";
  var entrega = "";
  var objetivos = [];

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function setClasses(el, add, remove) {
    remove.split(" ").forEach(function (c) { if (c) el.classList.remove(c); });
    add.split(" ").forEach(function (c) { if (c) el.classList.add(c); });
  }
  var ON = "bg-brand text-primary-foreground ring-brand";
  var OFF = "bg-sand/60 ring-ink/15";
  var ENT_OFF = "bg-cream text-ink ring-ink/15";

  /* ---- analítica ligera ---- */
  var sid = (function () {
    try {
      var v = sessionStorage.getItem("ol_sid");
      if (!v) { v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); sessionStorage.setItem("ol_sid", v); }
      return v;
    } catch (e) { return "anon"; }
  })();
  function track(name, props) {
    try {
      fetch("/api/events", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, event_name: name, properties: Object.assign({ feria: feria || "web", modo: stand ? "stand" : "movil" }, props || {}) }) }).catch(function () {});
    } catch (e) { /* ignorar */ }
  }

  /* ---- modo stand: sin textos de venta, campos grandes ---- */
  if (stand) {
    $$("[data-hide-stand]").forEach(function (el) { el.hidden = true; });
    document.body.classList.add("stand");
    $("#next-person").hidden = false;
  }

  var tag = $("#feria-tag");
  if (feria && tag) {
    tag.textContent = "Feria: " + feria.replace(/[-_]+/g, " ");
    tag.hidden = false;
  }

  /* ---- cosecha ---- */
  var cards = $$(".oferta");
  function paintCard(c, on) {
    c.setAttribute("aria-checked", on ? "true" : "false");
    setClasses(c, on ? ON : OFF, on ? OFF : ON);
    $$('[data-f]', c).forEach(function (n) {
      var f = n.dataset.f;
      if (f === "titulo") { n.classList.toggle("text-ink", !on); n.classList.toggle("text-primary-foreground", on); }
      else if (f === "precio") { n.classList.toggle("text-brand-deep", !on); n.classList.toggle("text-primary-foreground", on); }
      else { n.classList.toggle("text-ink/70", !on); n.classList.toggle("text-primary-foreground/80", on); }
    });
  }
  function updateFields() {
    var p = $("#f-personas");
    p.hidden = interes !== "oficina";
    if (interes !== "oficina") p.value = "";
    var d = $("#f-direccion");
    d.hidden = !(entrega === "domicilio" || interes === "oficina");
    if (d.hidden) d.value = "";
  }
  function setInteres(v) {
    interes = v;
    cards.forEach(function (c) { paintCard(c, c.dataset.interes === v); });
    updateFields();
  }
  cards.forEach(function (c) {
    c.addEventListener("click", function () { setInteres(c.dataset.interes); track("oferta_select", { interes: c.dataset.interes }); });
  });

  /* ---- hoy en la feria / a domicilio ---- */
  var ents = $$(".entrega");
  function setEntrega(v) {
    entrega = v;
    ents.forEach(function (b) {
      var on = b.dataset.entrega === v;
      b.setAttribute("aria-checked", on ? "true" : "false");
      setClasses(b, on ? ON : ENT_OFF, on ? ENT_OFF : ON);
    });
    updateFields();
  }
  ents.forEach(function (b) { b.addEventListener("click", function () { setEntrega(b.dataset.entrega); track("entrega_select", { entrega: b.dataset.entrega }); }); });
  setInteres("no_se"); setEntrega("");

  $$("[data-obj]").forEach(function (c) {
    c.addEventListener("click", function () {
      var g = c.dataset.obj, i = objetivos.indexOf(g), on = i < 0;
      if (on) objetivos.push(g); else objetivos.splice(i, 1);
      c.setAttribute("aria-pressed", on ? "true" : "false");
      setClasses(c, on ? ON : "text-ink/75 ring-ink/15", on ? "text-ink/75 ring-ink/15" : ON);
    });
  });

  /* ---- contenido editable (public/contenido.json) ---- */
  var waHref = "";
  fetch("/contenido.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (c) {
    var f = c.feria || {};
    if (f.banner) { var b = $("#feria-banner"); b.textContent = f.banner; b.hidden = false; }
    var of = f.ofertas || {};
    Object.keys(of).forEach(function (k) {
      var card = $('.oferta[data-interes="' + k + '"]');
      if (!card) return;
      ["titulo", "detalle", "precio", "ahorro"].forEach(function (field) {
        var node = $('[data-f="' + field + '"]', card);
        if (node && of[k] && of[k][field]) node.textContent = of[k][field];
      });
    });
    var yt = String(c.youtube || "").trim();
    if (/^https?:\/\//.test(yt)) $$("[data-yt]").forEach(function (a) { a.href = yt; a.hidden = false; });
    var num = String(c.whatsapp || "").replace(/\D/g, "");
    if (num) {
      waHref = "https://wa.me/" + num + "?text=" + encodeURIComponent(c.whatsapp_mensaje || "Hola, quiero reservar mi Cosecha de Bienestar");
      var fw = $("#foot-wa"); if (fw) fw.href = waHref;
    }
  });

  /* ---- copiar llave ---- */
  $("#pay-copy").addEventListener("click", async function () {
    var key = $("#pay-key").textContent.trim(), btn = this, ok = false;
    try { await navigator.clipboard.writeText(key); ok = true; } catch (e) {
      var ta = document.createElement("textarea"); ta.value = key; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } ta.remove();
    }
    btn.textContent = ok ? "¡Copiada!" : "Cópiala a mano";
    setTimeout(function () { btn.textContent = "Copiar"; }, 2000);
  });

  /* ---- contador del stand (solo en este equipo) ---- */
  function countKey() { return "ol_stand_" + (feria || "web"); }
  function renderCount() {
    var el = $("#stand-count");
    if (!stand || !el) return;
    var n = 0;
    try { n = parseInt(localStorage.getItem(countKey()) || "0", 10) || 0; } catch (e) { /* ignorar */ }
    el.textContent = "Registros hechos en este equipo: " + n;
    el.hidden = false;
  }
  function bumpCount() {
    try { localStorage.setItem(countKey(), String((parseInt(localStorage.getItem(countKey()) || "0", 10) || 0) + 1)); } catch (e) { /* ignorar */ }
    renderCount();
  }
  renderCount();

  /* ---- formulario ---- */
  var form = $("#lead-form"), done = $("#lead-done"), err = $("#lead-error"), btn = $("#lead-submit");
  var resetTimer = null;
  function showError(m) { err.textContent = m || ""; err.hidden = !m; }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var payload = {
      nombre: String(fd.get("nombre") || "").trim(),
      whatsapp: String(fd.get("whatsapp") || "").trim(),
      empresa: String(fd.get("empresa") || "").trim(),
      personas: fd.get("personas") ? parseInt(fd.get("personas"), 10) : null,
      direccion: String(fd.get("direccion") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      objetivos: objetivos.slice(),
      interes: interes,
      entrega: entrega,
      feria: feria,
      consent: fd.get("consent") === "on",
    };
    var digits = payload.whatsapp.replace(/\D/g, "");
    if (!payload.nombre) return showError("Escribe tu nombre");
    if (digits.length < 8 || digits.length > 15) return showError("Revisa tu número de WhatsApp");
    if (!payload.consent) return showError("Necesitamos tu autorización para contactarte");
    showError("");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      var res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { var j = await res.json().catch(function () { return {}; }); throw new Error(j.error || "No pudimos registrarte. Intenta de nuevo."); }
    } catch (ex) {
      btn.disabled = false; btn.textContent = "Quiero mi cosecha";
      showError(ex.message || "No pudimos registrarte. Intenta de nuevo.");
      return;
    }
    track("lead_submit", { interes: interes, entrega: entrega });
    $("#done-name").textContent = payload.nombre.split(" ")[0];
    var wa = $("#done-wa");
    if (waHref && !stand) { wa.href = waHref; wa.hidden = false; } else wa.hidden = true;
    form.hidden = true; done.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (stand) {
      bumpCount();
      resetTimer = setTimeout(resetForm, 25000); // da tiempo de pagar; o pulse «Siguiente persona»
    }
  });

  function resetForm() {
    clearTimeout(resetTimer);
    form.reset(); setInteres("no_se"); setEntrega("");
    objetivos = []; $$("[data-obj]").forEach(function (c) { c.setAttribute("aria-pressed", "false"); setClasses(c, "text-ink/75 ring-ink/15", ON); });
    btn.disabled = false; btn.textContent = "Quiero mi cosecha";
    done.hidden = true; form.hidden = false; showError("");
    window.scrollTo({ top: 0 });
  }
  $("#next-person").addEventListener("click", resetForm);

  track("feria_view");
})();
