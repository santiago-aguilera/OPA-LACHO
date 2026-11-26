/* Opa Lacho — panel de administración (/admin). Sin librerías salvo el generador de QR. */
(function () {
  "use strict";

  var KEY_STORE = "ol_admin_key";
  var key = "";
  var leads = [];
  var ESTADOS = ["nuevo", "contactado", "confirmado", "pagado", "descartado"];
  var INTERES = { comunidad: "Comunidad", comprador: "A su ritmo", cosecha1: "Cosecha #1", cosecha2: "Cosecha #2", oficina: "Oficina", prueba: "Prueba", semanal: "Semanal", quincenal: "Quincenal", no_se: "—" };
  var ENTREGA = { feria: "Hoy en la feria", domicilio: "A domicilio" };
  var timer = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------------- acceso ---------------- */
  function show(panel) {
    $("#login").hidden = panel;
    $("#panel").hidden = !panel;
  }
  function getKey() { try { return sessionStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } }
  function setKey(k) { try { if (k) sessionStorage.setItem(KEY_STORE, k); else sessionStorage.removeItem(KEY_STORE); } catch (e) { /* ignorar */ } }

  async function api(path, body) {
    var opt = { headers: { "X-Admin-Key": key } };
    if (body) { opt.method = "POST"; opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    var r = await fetch(path, opt);
    if (r.status === 401) { var e = new Error("auth"); e.auth = true; throw e; }
    return r;
  }

  async function load() {
    try {
      var r = await api("/api/admin/leads");
      var data = await r.json();
      leads = data.leads || [];
      if (data.estados) ESTADOS = data.estados;
      show(true);
      render();
    } catch (e) {
      if (e.auth) { setKey(""); key = ""; show(false); }
    }
  }

  $("#login-form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    key = $("#key-input").value.trim();
    var err = $("#login-error");
    try {
      var r = await api("/api/admin/leads");
      var data = await r.json();
      setKey(key);
      leads = data.leads || [];
      err.hidden = true;
      show(true); render(); startTimer();
    } catch (e) {
      err.textContent = "Clave incorrecta";
      err.hidden = false;
    }
  });
  $("#logout").addEventListener("click", function () { setKey(""); key = ""; clearInterval(timer); show(false); $("#key-input").value = ""; });

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(function () { if (document.visibilityState === "visible" && !$("#view-reg").hidden) load(); }, 20000);
  }

  /* ---------------- pestañas ---------------- */
  function selectTab(which) {
    var reg = which === "reg";
    $("#view-reg").hidden = !reg;
    $("#view-qr").hidden = reg;
    [["#tab-reg", reg], ["#tab-qr", !reg]].forEach(function (p) {
      var t = $(p[0]);
      t.setAttribute("aria-selected", p[1] ? "true" : "false");
      t.className = "tab rounded-full px-4 py-2 " + (p[1] ? "bg-brand text-primary-foreground" : "text-ink/70 ring-1 ring-ink/15");
    });
    if (!reg) drawQr();
  }
  $("#tab-reg").addEventListener("click", function () { selectTab("reg"); });
  $("#tab-qr").addEventListener("click", function () { selectTab("qr"); });

  /* ---------------- registros ---------------- */
  function localDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? null : d;
  }
  function fmt(iso) {
    var d = localDate(iso);
    if (!d) return "";
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }
  var DESCUENTO = { comunidad: "10% en la primera compra", semanal: "8% en el primer mes", quincenal: "4% en el primer mes" };
  function filtered() {
    var q = $("#f-search").value.trim().toLowerCase();
    var fe = $("#f-feria").value, es = $("#f-estado").value, pl = $("#f-interes").value;
    return leads.filter(function (l) {
      if (fe && l.feria !== fe) return false;
      if (es && l.estado !== es) return false;
      if (pl && l.interes !== pl) return false;
      if (q && (l.nombre + " " + l.empresa + " " + l.whatsapp + " " + l.email + " " + l.direccion + " " + (l.objetivos || "")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }
  function fillSelect(sel, values, first) {
    var cur = sel.value;
    sel.innerHTML = "";
    var o = el("option", "", first); o.value = ""; sel.appendChild(o);
    values.forEach(function (v) { var x = el("option", "", v); x.value = v; sel.appendChild(x); });
    sel.value = values.indexOf(cur) !== -1 ? cur : "";
  }
  function waLink(l) {
    if (!l.whatsapp) return "";
    var first = (l.nombre || "").split(" ")[0];
    var msg = "Hola " + first + ", le escribe Opa Lacho — Vida Buena. Gracias por su interés" +
      (l.feria && l.feria !== "web" ? " en la feria " + l.feria.replace(/[-_]+/g, " ") : "") +
      ". ¿Le confirmo su Cosecha de Bienestar" + (l.interes && l.interes !== "no_se" ? " (" + (INTERES[l.interes] || "").toLowerCase() + ")" : "") + "?";
    return "https://wa.me/" + l.whatsapp + "?text=" + encodeURIComponent(msg);
  }

  function renderStats() {
    var box = $("#stats"); box.innerHTML = "";
    var today = new Date().toDateString();
    var hoy = leads.filter(function (l) { var d = localDate(l.created_at); return d && d.toDateString() === today; }).length;
    function card(label, value, estado) {
      var b = el("button", "rounded-2xl bg-sand/60 p-4 text-left ring-1 ring-black/5 hover:ring-brand/40");
      b.type = "button";
      b.appendChild(el("p", "font-display text-3xl font-medium text-ink", String(value)));
      b.appendChild(el("p", "font-sans text-xs text-ink/70", label));
      b.addEventListener("click", function () { $("#f-estado").value = estado || ""; render(); });
      box.appendChild(b);
    }
    card("Registros totales", leads.length, "");
    card("Hoy", hoy, "");
    ESTADOS.forEach(function (e) {
      card(e.charAt(0).toUpperCase() + e.slice(1), leads.filter(function (l) { return l.estado === e; }).length, e);
    });
  }

  function render() {
    renderStats();
    var ferias = Array.from(new Set(leads.map(function (l) { return l.feria; }))).sort();
    fillSelect($("#f-feria"), ferias, "Todas las ferias");
    fillSelect($("#f-estado"), ESTADOS, "Todos los estados");

    var list = filtered();
    $("#count-line").textContent = "Mostrando " + list.length + " de " + leads.length + " registros · se actualiza solo cada 20 s";
    $("#empty").hidden = list.length > 0;
    var tb = $("#rows"); tb.innerHTML = "";
    list.forEach(function (l) {
      var tr = el("tr", "border-t border-ink/10 align-top");
      tr.appendChild(el("td", "px-4 py-3 whitespace-nowrap text-ink/70", fmt(l.created_at)));

      var c = el("td", "px-4 py-3");
      c.appendChild(el("p", "font-semibold text-ink", l.nombre));
      c.appendChild(el("p", "text-xs text-ink/70", l.whatsapp ? "+" + l.whatsapp : l.email || "—"));
      if (l.direccion) c.appendChild(el("p", "text-xs text-ink/70", l.direccion));
      tr.appendChild(c);

      var e = el("td", "px-4 py-3");
      e.appendChild(el("p", "", l.empresa || "—"));
      if (l.objetivos) e.appendChild(el("p", "text-xs text-ink/70", "Busca: " + l.objetivos));
      if (l.personas) e.appendChild(el("p", "text-xs text-ink/70", l.personas + " personas"));
      tr.appendChild(e);

      var it = el("td", "px-4 py-3");
      it.appendChild(el("p", "", INTERES[l.interes] || l.interes));
      if (DESCUENTO[l.interes]) it.appendChild(el("p", "text-xs font-semibold text-gold-deep", "Descuento: " + DESCUENTO[l.interes]));
      if (ENTREGA[l.entrega]) it.appendChild(el("p", "text-xs text-ink/70", ENTREGA[l.entrega]));
      tr.appendChild(it);
      tr.appendChild(el("td", "px-4 py-3 text-ink/70", l.feria));

      var st = el("td", "px-4 py-3");
      var sel = el("select", "rounded-lg bg-cream px-2 py-1.5 text-sm ring-1 ring-ink/15");
      sel.setAttribute("aria-label", "Estado de " + l.nombre);
      ESTADOS.forEach(function (x) { var o = el("option", "", x); o.value = x; sel.appendChild(o); });
      sel.value = l.estado;
      sel.addEventListener("change", function () {
        l.estado = sel.value;
        api("/api/admin/leads/update", { id: l.id, estado: sel.value }).then(renderStats).catch(function () { load(); });
      });
      st.appendChild(sel); tr.appendChild(st);

      var n = el("td", "px-4 py-3");
      var inp = el("input", "w-44 rounded-lg bg-cream px-2 py-1.5 text-sm ring-1 ring-ink/15");
      inp.value = l.notas || ""; inp.maxLength = 1000; inp.placeholder = "Nota…";
      inp.setAttribute("aria-label", "Notas de " + l.nombre);
      inp.addEventListener("change", function () { l.notas = inp.value; api("/api/admin/leads/update", { id: l.id, notas: inp.value }).catch(function () { load(); }); });
      n.appendChild(inp); tr.appendChild(n);

      var a = el("td", "px-4 py-3");
      var link = waLink(l);
      if (link) {
        var wa = el("a", "inline-flex rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-brand-deep", "WhatsApp");
        wa.href = link; wa.target = "_blank"; wa.rel = "noopener noreferrer";
        wa.addEventListener("click", function () {
          if (l.estado === "nuevo") { l.estado = "contactado"; sel.value = "contactado"; api("/api/admin/leads/update", { id: l.id, estado: "contactado" }).then(renderStats); }
        });
        a.appendChild(wa);
      }
      tr.appendChild(a);
      tb.appendChild(tr);
    });
  }

  ["#f-search", "#f-feria", "#f-estado", "#f-interes"].forEach(function (s) { $(s).addEventListener("input", render); });
  $("#btn-refresh").addEventListener("click", load);

  /* ---------------- Excel (CSV) ---------------- */
  function csvDate(iso) {
    var d = localDate(iso);
    if (!d) return "";
    function z(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  }
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    // evita fórmulas al abrir en Excel
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  $("#btn-csv").addEventListener("click", function () {
    var rows = [["Fecha", "Nombre", "WhatsApp", "Correo", "Empresa", "Personas", "Dirección", "Interés", "Entrega", "Feria", "Estado", "Notas", "Objetivos", "Descuento a aplicar"]];
    filtered().forEach(function (l) {
      rows.push([csvDate(l.created_at), l.nombre, l.whatsapp || "", l.email, l.empresa, l.personas || "", l.direccion, INTERES[l.interes] || l.interes, ENTREGA[l.entrega] || "", l.feria, l.estado, l.notas, l.objetivos || "", DESCUENTO[l.interes] || ""]);
    });
    var csv = "﻿" + rows.map(function (r) { return r.map(csvCell).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url; a.download = "registros-opa-lacho-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ---------------- códigos QR ---------------- */
  function slug(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, ""); }

  function drawOne(canvas, url, title, subtitle) {
    var qr = qrcode(0, "M");
    qr.addData(url); qr.make();
    var n = qr.getModuleCount(), cell = Math.max(4, Math.floor(480 / n)), margin = cell * 3;
    var size = n * cell + margin * 2, head = 70, foot = 70;
    canvas.width = size; canvas.height = size + head + foot;
    var g = canvas.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "#2b2620"; g.textAlign = "center";
    g.font = "600 " + Math.round(size / 15) + "px Georgia, serif";
    g.fillText(title, size / 2, head - 22);
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) g.fillRect(margin + c * cell, head + margin + r * cell, cell, cell);
    }
    g.fillStyle = "#2f6b58"; g.font = "600 " + Math.round(size / 22) + "px sans-serif";
    g.fillText(subtitle, size / 2, head + size + foot - 28);
  }

  function urls() {
    var base = ($("#qr-base").value.trim() || location.origin).replace(/\/+$/, "");
    var f = slug($("#qr-feria").value);
    var q = f ? "?feria=" + encodeURIComponent(f) : "";
    return { base: base, visit: base + "/feria" + q, stand: base + "/feria" + (f ? "?feria=" + encodeURIComponent(f) + "&modo=stand" : "?modo=stand") };
  }
  function drawQr() {
    var u = urls();
    var label = $("#qr-feria").value.trim();
    drawOne($("#qr-visit"), u.visit, "Opa Lacho — Vida Buena", "Escanee y reserve su cosecha");
    drawOne($("#qr-stand"), u.stand, "Modo stand" + (label ? " · " + label : ""), "Abrir en la tablet del stand");
    $("#qr-visit-url").textContent = u.visit;
    $("#qr-stand-url").textContent = u.stand;
    var warn = $("#qr-warn");
    var local = /^(https?:\/\/)?(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.base);
    warn.hidden = !local;
    if (local) warn.textContent = "Atención: esta dirección solo funciona en su red local o en este computador. Para que los visitantes escaneen con sus celulares, publique la página y escriba aquí la dirección pública (ver LEEME.md, «Para la feria»).";
  }
  $("#qr-base").addEventListener("input", drawQr);
  $("#qr-feria").addEventListener("input", drawQr);
  function download(canvas, name) {
    var a = document.createElement("a");
    a.href = canvas.toDataURL("image/png"); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  $("#dl-visit").addEventListener("click", function () { download($("#qr-visit"), "qr-visitantes-" + (slug($("#qr-feria").value) || "feria") + ".png"); });
  $("#dl-stand").addEventListener("click", function () { download($("#qr-stand"), "qr-stand-" + (slug($("#qr-feria").value) || "feria") + ".png"); });
  $("#print-visit").addEventListener("click", function () { window.print(); });

  /* ---------------- inicio ---------------- */
  selectTab("reg");
  key = getKey();
  if (key) { load().then(startTimer); } else show(false);
})();
