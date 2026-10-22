/* Radar de Comércios: Overpass (OpenStreetMap) + Nominatim + Leaflet. Sem chave de API. */
(() => {
  "use strict";

  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  const NOMINATIM = "https://nominatim.openstreetmap.org/search";

  // Cada categoria vira uma lista de seletores [chave, valores|null]. null = qualquer valor.
  const CATS = {
    food:     { label: "Alimentação", sel: [["amenity", "restaurant|cafe|bar|fast_food|pub|ice_cream"], ["shop", "bakery|confectionery|butcher|deli|pastry|coffee"]] },
    beauty:   { label: "Beleza", sel: [["shop", "hairdresser|beauty|cosmetics|massage|tattoo|nails"]] },
    health:   { label: "Saúde", sel: [["amenity", "pharmacy|dentist|clinic|doctors|veterinary"], ["shop", "optician|chemist|medical_supply"], ["healthcare", null]] },
    retail:   { label: "Lojas", sel: [["shop", null]] },
    auto:     { label: "Automotivo", sel: [["shop", "car|car_repair|car_parts|tyres|motorcycle|motorcycle_repair"], ["amenity", "car_wash|car_rental"]] },
    services: { label: "Serviços", sel: [["office", null], ["craft", null], ["shop", "laundry|copyshop|locksmith|travel_agency|dry_cleaning"]] },
    fitness:  { label: "Academia e lazer", sel: [["leisure", "fitness_centre|sports_centre|dance|yoga"]] },
    edu:      { label: "Educação", sel: [["amenity", "language_school|driving_school|music_school|tutoring|kindergarten"]] }
  };

  const STATUS = {
    none:   { label: "Sem site", color: "#d62f3a" },
    social: { label: "Só rede social", color: "#c97a00" },
    site:   { label: "Com site", color: "#178a58" }
  };

  const PT = {
    restaurant: "Restaurante", cafe: "Café", bar: "Bar", fast_food: "Lanchonete", pub: "Pub", ice_cream: "Sorveteria",
    bakery: "Padaria", confectionery: "Confeitaria", butcher: "Açougue", deli: "Delicatessen", pastry: "Pastelaria", coffee: "Cafeteria",
    hairdresser: "Cabeleireiro", beauty: "Salão de beleza", cosmetics: "Cosméticos", massage: "Massagem", tattoo: "Tatuagem", nails: "Manicure",
    pharmacy: "Farmácia", dentist: "Dentista", clinic: "Clínica", doctors: "Consultório", veterinary: "Veterinário", optician: "Ótica",
    chemist: "Drogaria", medical_supply: "Material médico", car: "Concessionária", car_repair: "Oficina", car_parts: "Autopeças", tyres: "Pneus",
    motorcycle: "Motos", motorcycle_repair: "Oficina de motos", car_wash: "Lava-rápido", car_rental: "Locadora de veículos",
    laundry: "Lavanderia", copyshop: "Copiadora", locksmith: "Chaveiro", travel_agency: "Agência de viagens", dry_cleaning: "Lavanderia a seco",
    fitness_centre: "Academia", sports_centre: "Centro esportivo", dance: "Dança", yoga: "Yoga",
    language_school: "Escola de idiomas", driving_school: "Autoescola", music_school: "Escola de música", tutoring: "Reforço escolar", kindergarten: "Educação infantil",
    supermarket: "Supermercado", convenience: "Conveniência", clothes: "Roupas", shoes: "Calçados", florist: "Floricultura", hardware: "Ferragens",
    electronics: "Eletrônicos", mobile_phone: "Celulares", books: "Livraria", gift: "Presentes", jewelry: "Joalheria", furniture: "Móveis",
    pet: "Pet shop", bicycle: "Bicicletas", stationery: "Papelaria", toys: "Brinquedos", variety_store: "Variedades", greengrocer: "Hortifruti",
    accountant: "Contabilidade", lawyer: "Advocacia", estate_agent: "Imobiliária", insurance: "Seguros", architect: "Arquitetura", company: "Empresa",
    carpenter: "Marcenaria", electrician: "Eletricista", plumber: "Encanador", tailor: "Costureira", photographer: "Fotografia", craft: "Ofício"
  };

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const state = { center: null, label: "", items: [], markers: new Map(), activeId: null, loading: false };

  /* ---------- Mapa ---------- */
  const map = L.map("map", { zoomControl: true }).setView([-23.5505, -46.6333], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; colaboradores do OpenStreetMap"
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  let centerMarker = null, radiusCircle = null;

  map.on("click", e => setCenter(e.latlng.lat, e.latlng.lng, "Ponto marcado no mapa", false));

  function setCenter(lat, lon, label, fly = true) {
    state.center = { lat, lon };
    state.label = label;
    $("#place-label").textContent = label;
    if (centerMarker) centerMarker.remove();
    centerMarker = L.circleMarker([lat, lon], { radius: 7, color: "#fff", weight: 3, fillColor: "#0a5fd0", fillOpacity: 1 }).addTo(map);
    drawRadius();
    if (fly) map.setView([lat, lon], radiusZoom(), { animate: true });
  }
  function radiusZoom() { const r = +$("#radius").value; return r <= 500 ? 17 : r <= 1000 ? 16 : r <= 2000 ? 15 : r <= 3500 ? 14 : 13; }
  function drawRadius() {
    if (!state.center) return;
    if (radiusCircle) radiusCircle.remove();
    radiusCircle = L.circle([state.center.lat, state.center.lon], {
      radius: +$("#radius").value, color: "#0a5fd0", weight: 1.5, fillOpacity: .05, interactive: false
    }).addTo(map);
  }

  /* ---------- Filtros (UI) ---------- */
  function chip(host, name, value, text, checked, dotClass) {
    const l = document.createElement("label");
    l.className = "chip";
    l.innerHTML = `<input type="checkbox" name="${name}" value="${value}" ${checked ? "checked" : ""}><span>${dotClass ? `<i class="dot ${dotClass}"></i>` : ""}${esc(text)}</span>`;
    host.appendChild(l);
  }
  Object.entries(STATUS).forEach(([k, v]) => chip($("#status-chips"), "status", k, v.label, k !== "site", k));
  Object.entries(CATS).forEach(([k, v]) => chip($("#cat-chips"), "cat", k, v.label, true));

  const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
  const fmtKm = m => (m / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " km";

  $("#radius").addEventListener("input", () => { $("#radius-out").textContent = fmtKm(+$("#radius").value); drawRadius(); });
  ["status", "cat"].forEach(n => document.addEventListener("change", e => { if (e.target.name === n && n === "status") render(); }));
  $("#name-filter").addEventListener("input", render);
  $("#only-phone").addEventListener("change", render);
  $("#sort").addEventListener("change", render);

  /* ---------- Localização ---------- */
  $("#btn-geo").addEventListener("click", () => {
    if (!navigator.geolocation) return msg("Seu navegador não oferece geolocalização. Digite um endereço.", true);
    msg("Obtendo sua localização…");
    navigator.geolocation.getCurrentPosition(
      p => { setCenter(p.coords.latitude, p.coords.longitude, "Minha localização"); search(); },
      err => msg(err.code === 1 ? "Permissão de localização negada. Digite um endereço ou marque um ponto no mapa." : "Não consegui obter sua localização. Digite um endereço.", true),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });

  async function geocode() {
    const q = $("#address").value.trim();
    if (!q) return msg("Digite um endereço, bairro ou cidade.", true);
    msg("Procurando endereço…");
    try {
      const r = await fetch(`${NOMINATIM}?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!j.length) return msg("Endereço não encontrado. Tente incluir a cidade.", true);
      setCenter(+j[0].lat, +j[0].lon, j[0].display_name.split(",").slice(0, 3).join(","));
      msg("Ponto definido. Toque em buscar.");
    } catch { msg("Falha ao consultar o endereço. Verifique a conexão.", true); }
  }
  $("#btn-address").addEventListener("click", geocode);
  $("#address").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); geocode(); } });

  /* ---------- Busca (Overpass) ---------- */
  function buildQuery(lat, lon, radius, cats) {
    const parts = [];
    for (const c of cats) for (const [key, vals] of CATS[c].sel) {
      const filt = vals ? `["${key}"~"^(${vals})$"]` : `["${key}"]`;
      parts.push(`nwr(around:${radius},${lat},${lon})${filt}["name"];`);
    }
    return `[out:json][timeout:30];(${parts.join("")});out center tags 500;`;
  }

  async function overpass(query) {
    let lastErr;
    for (const url of OVERPASS) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 35000);
        const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query), signal: ctl.signal,
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } });
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  $("#form").addEventListener("submit", e => { e.preventDefault(); search(); });

  async function search() {
    if (state.loading) return;
    if (!state.center) return msg("Escolha um ponto: use sua localização, digite um endereço ou clique no mapa.", true);
    const cats = checked("cat");
    if (!cats.length) return msg("Marque ao menos um tipo de comércio.", true);
    state.loading = true;
    $("#btn-search").disabled = true; $("#btn-search").textContent = "Buscando…";
    msg("Consultando o OpenStreetMap…");
    try {
      const { lat, lon } = state.center;
      const data = await overpass(buildQuery(lat, lon, +$("#radius").value, cats));
      const seen = new Set();
      state.items = data.elements.map(el => toItem(el, lat, lon)).filter(it => it && !seen.has(it.id) && seen.add(it.id));
      state.activeId = null;
      render(true);
      if (!state.items.length) msg("Nada encontrado nesse raio. Aumente o raio ou marque mais tipos.");
    } catch {
      msg("O serviço de dados está lento ou fora do ar. Tente de novo em instantes.", true);
    } finally {
      state.loading = false;
      $("#btn-search").disabled = false; $("#btn-search").textContent = "Buscar comércios";
    }
  }

  /* ---------- Classificação ---------- */
  const SOCIAL_RE = /(facebook\.com|fb\.com|instagram\.com|linktr\.ee|wa\.me|whatsapp\.com)/i;
  function normUrl(u) { u = String(u).trim(); return /^https?:\/\//i.test(u) ? u : "https://" + u; }

  function toItem(el, clat, clon) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || !t.name) return null;
    const rawSite = t.website || t["contact:website"] || t.url || "";
    const social = t["contact:instagram"] || t.instagram || t["contact:facebook"] || t.facebook || "";
    let status = "none", site = "";
    if (rawSite && !SOCIAL_RE.test(rawSite)) { status = "site"; site = normUrl(rawSite); }
    else if (rawSite || social) status = "social";
    const kind = t.shop || t.amenity || t.office || t.craft || t.leisure || t.healthcare || "";
    const phone = t.phone || t["contact:phone"] || t["contact:mobile"] || t.mobile || "";
    const addr = [[t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", "), t["addr:suburb"] || t["addr:neighbourhood"], t["addr:city"]].filter(Boolean).join(" · ");
    return {
      id: el.type + el.id, name: t.name, kind: PT[kind] || (kind ? kind.replace(/_/g, " ") : "Comércio"),
      lat, lon, status, site, social, phone, addr, city: t["addr:city"] || "",
      dist: haversine(clat, clon, lat, lon), osm: `https://www.openstreetmap.org/${el.type}/${el.id}`
    };
  }
  function haversine(a, b, c, d) {
    const R = 6371000, r = x => x * Math.PI / 180;
    const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* ---------- Render ---------- */
  function visible() {
    const st = new Set(checked("status"));
    const q = $("#name-filter").value.trim().toLowerCase();
    const onlyPhone = $("#only-phone").checked;
    const list = state.items.filter(i => st.has(i.status) && (!q || i.name.toLowerCase().includes(q)) && (!onlyPhone || i.phone));
    list.sort($("#sort").value === "name" ? (a, b) => a.name.localeCompare(b.name, "pt-BR") : (a, b) => a.dist - b.dist);
    return list;
  }

  function render(fit = false) {
    if (fit !== true) fit = false;
    const list = visible();
    layer.clearLayers(); state.markers.clear();
    const total = state.items.length;
    $("#count").textContent = total ? `${list.length} de ${total} comércios` : "Resultados";
    $("#btn-csv").disabled = !list.length;
    if (total) msg(summary());

    $("#list").innerHTML = list.map(cardHtml).join("");
    for (const it of list) {
      const m = L.circleMarker([it.lat, it.lon], { radius: 8, color: "#fff", weight: 2, fillColor: STATUS[it.status].color, fillOpacity: .95 })
        .bindPopup(`<div class="pop"><strong>${esc(it.name)}</strong>${esc(it.kind)} · ${esc(STATUS[it.status].label)}</div>`)
        .on("click", () => focusItem(it.id, false)).addTo(layer);
      state.markers.set(it.id, m);
    }
    if (fit && list.length) {
      const b = L.latLngBounds(list.map(i => [i.lat, i.lon]));
      b.extend([state.center.lat, state.center.lon]);
      map.fitBounds(b, { padding: [30, 30], maxZoom: 17 });
    }
  }

  function summary() {
    const c = { none: 0, social: 0, site: 0 };
    state.items.forEach(i => c[i.status]++);
    return `${c.none} sem site, ${c.social} só com rede social, ${c.site} com site.`;
  }

  function cardHtml(i) {
    const tel = i.phone ? `<a class="btn" href="${waLink(i.phone) || "tel:" + esc(i.phone.replace(/[^\d+]/g, ""))}" target="_blank" rel="noopener">${waLink(i.phone) ? "WhatsApp" : "Ligar"}</a>` : "";
    const check = `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent([i.name, i.city || i.addr.split("·").pop().trim(), "site"].filter(Boolean).join(" "))}">Conferir no Google</a>`;
    const speed = i.site ? `<a class="btn" target="_blank" rel="noopener" href="https://pagespeed.web.dev/analysis?url=${encodeURIComponent(i.site)}">Analisar site</a><a class="btn" target="_blank" rel="noopener" href="${esc(i.site)}">Abrir site</a>` : "";
    return `<li class="card${i.id === state.activeId ? " active" : ""}" data-id="${i.id}">
      <div class="card-top"><h3>${esc(i.name)}</h3><span class="dist">${i.dist < 1000 ? Math.round(i.dist) + " m" : fmtKm(i.dist)}</span></div>
      <span class="badge ${i.status}"><i class="dot ${i.status}"></i>${STATUS[i.status].label}</span>
      <p class="meta">${esc(i.kind)}${i.addr ? " · " + esc(i.addr) : ""}${i.phone ? " · " + esc(i.phone) : ""}</p>
      <div class="actions">
        <button class="btn" data-act="map">Ver no mapa</button>
        <button class="btn" data-act="pitch">Gerar proposta</button>
        ${tel}${speed}${check}
        <a class="btn" target="_blank" rel="noopener" href="${i.osm}">Dados no OSM</a>
      </div></li>`;
  }

  function waLink(phone) {
    let d = String(phone).replace(/\D/g, "");
    if (d.length < 10) return "";
    if (!d.startsWith("55")) d = "55" + d;
    // Celular brasileiro: 55 + DDD + 9 + 8 dígitos = 13 dígitos
    return d.length === 13 ? `https://wa.me/${d}` : "";
  }

  $("#list").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const id = b.closest(".card").dataset.id;
    if (b.dataset.act === "map") focusItem(id, true);
    if (b.dataset.act === "pitch") openPitch(state.items.find(i => i.id === id));
  });

  function focusItem(id, pan) {
    state.activeId = id;
    document.querySelectorAll(".card").forEach(c => c.classList.toggle("active", c.dataset.id === id));
    const m = state.markers.get(id);
    if (!m) return;
    if (pan) map.setView(m.getLatLng(), Math.max(map.getZoom(), 17));
    m.openPopup();
    if (!pan) document.querySelector(`.card[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* ---------- Proposta ---------- */
  function openPitch(i) {
    const text = i.status === "site"
      ? `Olá! Tudo bem? Aqui é [seu nome]. Dei uma olhada no site da ${i.name} e vi alguns pontos que podem trazer mais clientes: velocidade no celular, visual atualizado e um botão direto para WhatsApp. Posso te mostrar um exemplo rápido, sem compromisso?`
      : `Olá! Tudo bem? Aqui é [seu nome]. Procurei a ${i.name} na internet e não encontrei um site próprio${i.status === "social" ? ", só as redes sociais" : ""}. Um site simples ajuda quem busca no Google por "${i.kind.toLowerCase()} perto de mim" a chegar até vocês, com endereço, horários e WhatsApp. Posso te mostrar um exemplo, sem compromisso?`;
    $("#dlg-title").textContent = "Proposta para " + i.name;
    $("#dlg-text").value = text;
    const wa = waLink(i.phone), a = $("#dlg-wa");
    a.hidden = !wa;
    if (wa) a.href = wa + "?text=" + encodeURIComponent(text);
    $("#dlg-text").oninput = () => { if (wa) a.href = wa + "?text=" + encodeURIComponent($("#dlg-text").value); };
    $("#dlg").showModal();
  }
  $("#dlg-copy").addEventListener("click", async () => {
    const ta = $("#dlg-text"), btn = $("#dlg-copy");
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand("copy"); }
    btn.textContent = "Copiado"; setTimeout(() => btn.textContent = "Copiar", 1500);
  });

  /* ---------- CSV ---------- */
  $("#btn-csv").addEventListener("click", () => {
    const rows = [["Nome", "Categoria", "Situação", "Site", "Rede social", "Telefone", "Endereço", "Distância (m)", "Latitude", "Longitude", "OSM"]];
    visible().forEach(i => rows.push([i.name, i.kind, STATUS[i.status].label, i.site, i.social, i.phone, i.addr, Math.round(i.dist), i.lat, i.lon, i.osm]));
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "comercios.csv" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  function msg(t, err = false) { const m = $("#status-msg"); m.textContent = t; m.classList.toggle("error", err); }
})();