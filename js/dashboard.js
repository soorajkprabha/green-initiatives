/* Sustainability dashboard tab. Data: data/dashboard.json (VAST Green Campus: audits and institution records). */
(function(){
  "use strict";
  var root = document.getElementById("dashRoot"), DATA = null, charts = [], started = false;
  if (!root) return;

  function el(t, c, x){ var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function nf(n, d){ if (n == null || isNaN(n)) return "–"; return Number(n).toLocaleString("en-US", {minimumFractionDigits:d||0, maximumFractionDigits:d||0}).replace("-", "−"); }
  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function monthLabel(ym){ var p = String(ym).split("-"), d = new Date(+p[0], +p[1] - 1, 1); return d.toLocaleString("en-GB", {month:"short", year:"numeric"}); }
  function sum(rows, k){ return rows.reduce(function(a, r){ return a + (r[k] || 0); }, 0); }

  var EMISSION_COLORS = {diesel:"#9c4a34", elec:"#3b74b5", lpg:"#a9792a", biogas:"#2f6b4f", waste:"#6e4a9e", paper:"#7c8d80"};
  var SOLAR_COLORS = ["#a9792a", "#2e6b82", "#2f6b4f"];
  var MIX_COLORS = ["#9c4a34", "#3b74b5", "#a9792a", "#2f6b4f"];

  function base(){
    var ink = css("--fg") || "#15241c", ink2 = css("--muted") || "#52645a", line = css("--line") || "rgba(0,0,0,.12)";
    return {ink:ink, ink2:ink2, line:line,
      tooltip:{backgroundColor:css("--surface") || "#fff", borderColor:css("--line-strong") || "#ccc", textStyle:{color:ink, fontSize:12}},
      axis:function(o){ return Object.assign({axisLine:{lineStyle:{color:line}}, axisTick:{show:false}, splitLine:{lineStyle:{color:line}}, axisLabel:{color:ink2, fontSize:11}}, o); }};
  }
  function addChart(id, optFn){
    var node = document.getElementById(id); if (!node || typeof echarts === "undefined") return;
    var inst = echarts.getInstanceByDom(node) || echarts.init(node, null, {renderer:"canvas"});
    inst.setOption(optFn(), true); charts = charts.filter(function(c){ return c.id !== id; }); charts.push({id:id, inst:inst, fn:optFn});
  }
  function rerender(){ charts.forEach(function(c){ c.inst.setOption(c.fn(), true); }); }
  function resize(){ charts.forEach(function(c){ c.inst.resize(); }); }

  function build(){
    var D = DATA, c = D.carbon, bill = D.bill, last12 = bill.slice(-12), lastM = bill[bill.length - 1].m;
    var mitig = (c.trees + c.renewable) / c.gross * 100;
    root.textContent = "";

    var kp = el("div", "dgrid4");
    [[nf(c.gross, 2), "tCO₂e gross footprint, " + D.period],
     [nf(mitig, 1) + "%", "mitigated by trees and renewables in the audit year"],
     [nf(sum(last12, "sol") / 1000, 1) + " MWh", "solar generated, last 12 months to " + monthLabel(lastM)],
     [nf(bill[bill.length - 1].cons), "kWh electricity consumed in " + monthLabel(lastM)]
    ].forEach(function(k, i){ var f = el("div", "fact" + (i === 2 ? " gold" : "")); f.appendChild(el("b", "mono", k[0])); f.appendChild(el("span", "", k[1])); kp.appendChild(f); });
    root.appendChild(kp);

    var grid = el("div", "dgrid4");
    [["dEmis", "Emissions by source", "tCO₂e a year"], ["dSolar", "Solar by month", "kWh, last 12 months"],
     ["dMix", "Energy mix", "share of total energy"], ["dBal", "Carbon balance", "tCO₂e a year"]].forEach(function(x){
      var card = el("div", "dcard"); card.appendChild(el("h4", "", x[1])); card.appendChild(el("div", "dsub", x[2]));
      var ch = el("div", "dchart"); ch.id = x[0]; card.appendChild(ch); grid.appendChild(card); });
    root.appendChild(grid);

    // ---- indicators
    root.appendChild(el("h3", "dh", "All indicators"));
    root.appendChild(el("p", "dnote", "Every headline indicator in one place, with its unit, how the number was produced and where it comes from."));
    var themes = ["All"]; D.indicators.forEach(function(r){ if (themes.indexOf(r.theme) < 0) themes.push(r.theme); });
    var chips = el("div", "chips"); chips.style.marginTop = "14px";
    themes.forEach(function(t, i){ var b = el("button", "chip" + (i === 0 ? " active" : ""), t); b.type = "button"; b.dataset.t = t; chips.appendChild(b); });
    root.appendChild(chips);
    var ctl = el("div", "drow"), q = el("input", "dsearch"); q.type = "search"; q.placeholder = "Search indicators"; q.setAttribute("aria-label", "Search indicators"); ctl.appendChild(q);
    var clsKeys = ["reported", "update", "derived", "estimate", "proposed", "target", "none"], clsBox = {};
    clsKeys.forEach(function(k){ var l = el("label", "dchk"), i = el("input"); i.type = "checkbox"; i.checked = true; i.value = k; clsBox[k] = i;
      l.appendChild(i); var tg = el("span", "dtag " + k, D.tags[k]); l.appendChild(tg); ctl.appendChild(l); });
    root.appendChild(ctl);
    var wrap = el("div", "tbl-wrap"), tbl = el("table", "dirtbl"), thead = el("thead"), hr = el("tr");
    [["Theme", ""], ["Indicator", ""], ["Value", "n"], ["Unit", ""], ["Class", ""], ["Source", ""]].forEach(function(h){ hr.appendChild(el("th", h[1], h[0])); });
    thead.appendChild(hr); tbl.appendChild(thead); var tb = el("tbody"); tbl.appendChild(tb); wrap.appendChild(tbl); root.appendChild(wrap);
    var count = el("p", "cite"); count.style.marginTop = "8px"; root.appendChild(count);
    var noteMap = {}; (D.notes || []).forEach(function(n){ noteMap[n.id] = n; });
    var theme = "All";
    function draw(){
      var s = q.value.trim().toLowerCase(); tb.textContent = ""; var shown = 0;
      D.indicators.forEach(function(r){
        if (theme !== "All" && r.theme !== theme) return; if (!clsBox[r.cls] || !clsBox[r.cls].checked) return;
        if (s && (r.label + " " + r.theme + " " + r.source).toLowerCase().indexOf(s) < 0) return;
        var tr = el("tr"); tr.appendChild(el("td", "dsrc", r.theme));
        var td = el("td"); td.appendChild(el("strong", "", r.label));
        if (r.note && noteMap[r.note]){ var fl = el("span", "dflag", "⚑"); fl.title = noteMap[r.note].title + " (" + noteMap[r.note].state + ")"; td.appendChild(fl); }
        tr.appendChild(td); tr.appendChild(el("td", "n", r.value)); tr.appendChild(el("td", "dsrc", r.unit));
        var tg = el("td"); tg.appendChild(el("span", "dtag " + r.cls, D.tags[r.cls])); tr.appendChild(tg); tr.appendChild(el("td", "dsrc", r.source));
        tb.appendChild(tr); shown++;
      });
      if (!shown){ var e = el("tr"), t = el("td", "dempty", "No indicators match. Clear the search or tick more classes."); t.colSpan = 6; e.appendChild(t); tb.appendChild(e); }
      count.textContent = shown + " of " + D.indicators.length + " indicators shown";
    }
    chips.addEventListener("click", function(e){ var b = e.target.closest(".chip"); if (!b) return; theme = b.dataset.t;
      chips.querySelectorAll(".chip").forEach(function(x){ x.classList.toggle("active", x === b); }); draw(); });
    q.addEventListener("input", draw); clsKeys.forEach(function(k){ clsBox[k].addEventListener("change", draw); }); draw();

    // ---- trends
    root.appendChild(el("h3", "dh", "Trends and comparisons"));
    root.appendChild(el("p", "dnote", "Electricity, solar and generator records run monthly from " + monthLabel(bill[0].m) + " to " + monthLabel(lastM) + ". Carbon, water and waste are single-year audit figures, so nothing is divided by twelve to fill a gap."));
    var MEAS = {cons:["Electricity consumption", "kWh"], sol:["Solar generation", "kWh"], net:["KSEB import, net of export", "kWh"], ex:["Export to KSEB", "kWh"],
                dg:["Diesel generator units", "kWh"], co2:["Electricity emissions (estimate)", "tCO₂e"], av:["Emissions avoided by solar (estimate)", "tCO₂e"]};
    var CMP = {yoy:"Year on year", mom:"Month on month", fy:"Financial year to date", custom:"Custom range"};
    function sel(id, label, opts, val){ var f = el("label", "dfield", label), s = el("select"); s.id = id;
      Object.keys(opts).forEach(function(k){ var o = el("option", "", Array.isArray(opts[k]) ? opts[k][0] : opts[k]); o.value = k; s.appendChild(o); });
      if (val) s.value = val; f.appendChild(s); return {f:f, s:s}; }
    var tr1 = el("div", "drow"), mS = sel("dM", "Measure", MEAS, "sol"), cS = sel("dC", "Comparison", CMP, "yoy");
    var months = {}; bill.forEach(function(r){ months[r.m] = monthLabel(r.m); });
    var fS = sel("dFrom", "From", months, bill[Math.max(0, bill.length - 24)].m), tS = sel("dTo", "To", months, lastM);
    [mS, cS, fS, tS].forEach(function(x){ tr1.appendChild(x.f); }); fS.f.hidden = tS.f.hidden = true; root.appendChild(tr1);
    var out = el("div", "dcard"); root.appendChild(out);

    function idx(m){ for (var i = 0; i < bill.length; i++) if (bill[i].m === m) return i; return -1; }
    function shift(m, n){ var p = m.split("-"), d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
    function pick(ms){ return ms.map(function(m){ var i = idx(m); return i >= 0 ? bill[i] : {m:m}; }); }
    function trend(){
      var m = mS.s.value, cmp = cS.s.value, name = MEAS[m][0], unit = MEAS[m][1], dec = unit === "tCO₂e" ? 2 : 0;
      fS.f.hidden = tS.f.hidden = cmp !== "custom"; out.textContent = "";
      var cur, prev = null, title, curName = "", prevName = "";
      if (cmp === "yoy"){ cur = bill.slice(-12); prev = pick(cur.map(function(r){ return shift(r.m, -12); })); curName = "Last 12 months"; prevName = "Previous 12 months"; title = "the last 12 months against the 12 before"; }
      else if (cmp === "fy"){ var lp = lastM.split("-"), fy0 = +lp[1] >= 4 ? +lp[0] : +lp[0] - 1, ms = [], k = fy0 + "-04";
        while (k <= lastM){ ms.push(k); k = shift(k, 1); } cur = pick(ms); prev = pick(ms.map(function(x){ return shift(x, -12); })); curName = "FY " + fy0 + "–" + String(fy0 + 1).slice(2) + " so far"; prevName = "Same months a year earlier"; title = "this financial year so far against the same months a year earlier"; }
      else if (cmp === "mom"){ cur = bill.slice(-13); title = "change on the previous month"; }
      else { var a = [fS.s.value, tS.s.value].sort(), ms2 = [], k2 = a[0]; while (k2 <= a[1]){ ms2.push(k2); k2 = shift(k2, 1); } cur = pick(ms2); title = monthLabel(a[0]) + " to " + monthLabel(a[1]); }
      var tc = sum(cur, m), tp = prev ? sum(prev, m) : null;
      out.appendChild(el("h4", "", name + ": " + title));
      var sm = el("p", "dsum"); sm.innerHTML = "";
      if (prev){ var ch = tp ? ((tc - tp) / tp * 100) : null;
        sm.appendChild(document.createTextNode(curName + ": ")); sm.appendChild(el("b", "", nf(tc, dec) + " " + unit));
        sm.appendChild(document.createTextNode(" · " + prevName + ": ")); sm.appendChild(el("b", "", nf(tp, dec) + " " + unit));
        sm.appendChild(document.createTextNode(" · change ")); sm.appendChild(el("b", "", ch == null ? "–" : (ch >= 0 ? "+" : "−") + nf(Math.abs(ch), 1) + "%")); }
      else { sm.appendChild(document.createTextNode("Total ")); sm.appendChild(el("b", "", nf(tc, dec) + " " + unit)); }
      out.appendChild(sm);
      var ch2 = el("div", "dchart tall"); ch2.id = "dTrend"; out.appendChild(ch2);
      var old = echarts.getInstanceByDom(ch2); if (old) old.dispose();
      addChart("dTrend", function(){
        var b = base(), vals = function(rows){ return rows.map(function(r){ return r[m] == null ? null : (dec ? +r[m].toFixed(2) : r[m]); }); };
        var cats = cur.map(function(r){ return prev ? monthLabel(r.m).split(" ")[0] : monthLabel(r.m); });
        var tf = {valueFormatter:function(v){ return v == null ? "–" : nf(v, dec) + " " + unit; }};
        var o = {grid:{left:10, right:16, top:40, bottom:8, containLabel:true}, legend:{top:0, left:0, textStyle:{color:b.ink2}},
          tooltip:Object.assign({}, b.tooltip, {trigger:"axis", axisPointer:{type:"shadow"}}),
          xAxis:b.axis({type:"category", data:cats, axisLabel:{color:b.ink2, fontSize:11, hideOverlap:true}}),
          yAxis:[b.axis({type:"value", axisLabel:{color:b.ink2, formatter:function(v){ return nf(v); }}})]};
        if (prev) o.series = [{name:prevName, type:"bar", data:vals(prev), itemStyle:{color:"#9aa9a0"}, tooltip:tf}, {name:curName, type:"bar", data:vals(cur), itemStyle:{color:"#2f6b4f"}, tooltip:tf}];
        else if (cmp === "mom"){ var v = vals(cur); o.yAxis.push(b.axis({type:"value", splitLine:{show:false}, axisLabel:{color:b.ink2, formatter:"{value}%"}}));
          o.series = [{name:name, type:"bar", data:v, itemStyle:{color:"#2f6b4f"}, tooltip:tf},
            {name:"Change on previous month", type:"line", yAxisIndex:1, data:v.map(function(x, i){ return i === 0 || !v[i-1] || x == null ? null : +((x - v[i-1]) / v[i-1] * 100).toFixed(1); }), itemStyle:{color:"#a9792a"}, lineStyle:{type:"dashed", width:2}, tooltip:{valueFormatter:function(x){ return x == null ? "–" : x + "%"; }}}]; }
        else o.series = [{name:name, type:"bar", data:vals(cur), itemStyle:{color:"#2f6b4f"}, barMaxWidth:44, tooltip:tf}];
        return o; });
      var tg = el("p", "cite"); tg.textContent = (dec ? "Estimated from institution records." : "Institution billing records."); out.appendChild(tg);
    }
    [mS.s, cS.s, fS.s, tS.s].forEach(function(s){ s.addEventListener("change", trend); });
    var src = el("p", "cite"); src.style.marginTop = "22px";
    src.textContent = "Source: VAST Green Campus (Green Audit EA 1484/GA 2024–25, Energy Audit, Environment Audit and institution records, 2026). Figures are reproduced as published there.";
    root.appendChild(src);

    // ---- the four overview charts
    addChart("dEmis", function(){ var b = base();
      return {tooltip:Object.assign({}, b.tooltip, {trigger:"item", formatter:function(p){ return p.name + "<br><b>" + nf(p.value, 2) + " tCO₂e</b> · " + p.percent + "%"; }}),
        title:{text:nf(c.gross, 2), subtext:"tCO₂e a year", left:"center", top:"36%", textStyle:{fontSize:22, fontWeight:700, color:b.ink}, subtextStyle:{color:b.ink2, fontSize:11}},
        series:[{type:"pie", radius:["56%", "84%"], minAngle:3, itemStyle:{borderColor:css("--surface") || "#fff", borderWidth:2}, label:{show:false},
          data:c.sources.map(function(s){ return {name:s.name, value:s.t, itemStyle:{color:EMISSION_COLORS[s.key] || "#7c8d80"}}; })}]}; });
    addChart("dSolar", function(){ var b = base();
      return {grid:{left:40, right:6, top:14, bottom:24}, tooltip:Object.assign({}, b.tooltip, {trigger:"axis", axisPointer:{type:"shadow"}, valueFormatter:function(v){ return nf(v) + " kWh"; }}),
        xAxis:b.axis({type:"category", data:last12.map(function(r){ return monthLabel(r.m).slice(0, 3); }), axisLabel:{color:b.ink2, fontSize:10, interval:1}}),
        yAxis:b.axis({type:"value", axisLabel:{color:b.ink2, fontSize:10, formatter:function(v){ return v / 1000 + "k"; }}}),
        series:D.solarParts.map(function(p, k){ return {name:p[1], type:"bar", stack:"s", data:last12.map(function(r){ return r[p[0]]; }), itemStyle:{color:SOLAR_COLORS[k]}, barWidth:"62%"}; })}; });
    addChart("dMix", function(){ var b = base();
      return {tooltip:Object.assign({}, b.tooltip, {trigger:"item", formatter:function(p){ return p.name + "<br><b>" + p.data.pct + "%</b> of energy"; }}),
        series:[{type:"pie", radius:["50%", "80%"], minAngle:3, itemStyle:{borderColor:css("--surface") || "#fff", borderWidth:2},
          label:{color:b.ink, fontSize:11, formatter:function(p){ return p.name + "\n" + (p.data.pct < 1 ? "<1" : p.data.pct) + "%"; }},
          data:D.mix.map(function(x, i){ return {name:x.name, value:x.kcal, pct:x.pct, itemStyle:{color:MIX_COLORS[i % MIX_COLORS.length]}}; })}]}; });
    addChart("dBal", function(){ var b = base();
      return {grid:{left:6, right:44, top:10, bottom:6, containLabel:true},
        tooltip:Object.assign({}, b.tooltip, {trigger:"axis", axisPointer:{type:"shadow"}, valueFormatter:function(v){ return nf(v, 2) + " tCO₂e"; }}),
        xAxis:b.axis({type:"value", show:false}), yAxis:b.axis({type:"category", inverse:true, data:["Gross", "Trees", "Renewables", "Remaining"], axisLabel:{color:b.ink2, fontSize:11}, axisLine:{show:false}, splitLine:{show:false}}),
        series:[{type:"bar", barWidth:16, data:[{value:c.gross, itemStyle:{color:"#9c4a34"}}, {value:c.trees, itemStyle:{color:"#86b99b"}}, {value:c.renewable, itemStyle:{color:"#2f6b4f"}}, {value:c.remaining, itemStyle:{color:"#7c8d80"}}],
          label:{show:true, position:"right", color:b.ink, fontSize:11, formatter:function(p){ return nf(p.value, p.value < 10 ? 2 : 0); }}}]}; });
    trend();
  }

  function start(){
    if (started){ setTimeout(resize, 30); return; }
    started = true;
    root.textContent = "Loading dashboard…";
    fetch("data/dashboard.json", {cache:"no-cache"}).then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function(d){ DATA = d; if (typeof echarts === "undefined") throw new Error("chart library not loaded"); build(); })
      .catch(function(err){ started = false; root.textContent = "The dashboard could not be loaded (" + err.message + ")."; });
  }
  window.addEventListener("resize", resize);
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(){ setTimeout(rerender, 50); });
  window.VM33Dashboard = {show:start};
})();
