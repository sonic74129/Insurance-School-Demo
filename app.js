(function initSchoolDemoApp(global) {
  "use strict";

  const Data = global.SchoolDemoData;
  const Reports = global.SchoolDemoReports;
  const Workflows = global.SchoolDemoWorkflows;
  const escapeHtml = Reports.escapeHtml;
  const loaded = Data.load();
  const state = { db: loaded.db, warning: loaded.warning, blocked: loaded.blocked, accountId: null };
  const guidePositions = {};
  const guideScrollPositions = {};
  const guideLayout = { rect: null, maximized: false, readingScroll: 0, readingKey: "" };
  let guideReady = false;
  let guideDrag = null;
  let guideTarget = null;
  const GUIDE_DESTINATIONS = {
    inspection: [
      ["regulator", "services", 'form[data-campus-form="createInspection"] [name="campusId"]'],
      ["service", "inspections", '[data-campus-action="acceptInspection"]'],
      ["service", "inspections", '[data-campus-action="loadInspectionSample"]'],
      ["service", "inspections", 'button[name="submitReport"]'],
      ["regulator", "inspections", 'form[data-campus-form="acceptService"] [name="decision"]'],
      ["service", "inspections", '[data-campus-action="amendReport"], [name="C02.result"]'],
      ["service", "inspections", 'button[name="submitReport"]'],
      ["regulator", "inspections", 'form[data-campus-form="acceptService"] [name="decision"]'],
      ["school", "inspections", '[data-campus-action="acknowledgeReport"]'],
      ["school", "inspections", 'form[data-campus-form="confirmHazard"] button', "C05"],
      ["school", "inspections", 'form[data-campus-form="confirmHazard"] button', "C13"],
      ["school", "inspections", 'form[data-campus-form="recordReferral"] [name="status"]', "C13"],
      ["school", "inspections", 'form[data-campus-form="rectifyHazard"] button', "C05"],
      ["school", "inspections", 'form[data-campus-form="rectifyHazard"] button', "C13"],
      ["service", "inspections", 'form[data-campus-form="recheckHazard"] [name="decision"]', "C05"],
      ["service", "inspections", 'form[data-campus-form="recheckHazard"] [name="decision"]', "C13"],
      ["service", "inspections", ":scope > h2"],
    ],
    insurance: [
      ["school", "products", 'form[data-form="apply"]:has(input[value="PRD-01"]) button'],
      ["insurer", "applications", '[data-action="underwrite"][data-decision="approve"]'],
      ["regulator", "dashboard", ".metric-grid"],
    ],
    claim: [
      ["school", "claims", 'form[data-form="claim"] [name="policyId"]'],
      ["insurer", "claims", '[data-action="advanceClaim"]'],
      ["school", "claims", '[data-action="supplementClaim"]'],
      ["insurer", "claims", '[data-action="advanceClaim"]'],
      ["regulator", "claims", "td"],
    ],
  };

  function clearGuidePointer() {
    document.querySelectorAll(".guide-highlight").forEach(el => el.classList.remove("guide-highlight"));
    document.getElementById("guide-pointer").hidden = true;
  }

  function positionGuidePointer() {
    const target = document.querySelector(".guide-highlight");
    const pointer = document.getElementById("guide-pointer");
    if (!target || !guideTarget) { pointer.hidden = true; return; }
    const rect = target.getBoundingClientRect();
    const bounds = document.getElementById("app").getBoundingClientRect();
    const app = { top: Math.max(0, bounds.top), bottom: Math.min(global.innerHeight, bounds.bottom),
      left: Math.max(0, bounds.left), right: Math.min(global.innerWidth, bounds.right) };
    pointer.hidden = rect.bottom <= app.top || rect.top >= app.bottom || rect.right <= app.left || rect.left >= app.right;
    const guide = document.getElementById("demo-guide");
    if (guide.open) {
      const panel = guide.getBoundingClientRect();
      if (rect.right > panel.left && rect.left < panel.right && rect.bottom > panel.top && rect.top < panel.bottom) pointer.hidden = true;
    }
    if (pointer.hidden) return;
    pointer.textContent = rect.top - app.top >= 38 ? "↓ 点这里" : "↑ 点这里";
    pointer.style.left = `${Math.max(app.left + 8, Math.min(rect.left, app.right - 110))}px`;
    pointer.style.top = `${rect.top - app.top >= 38 ? rect.top - 34 : Math.min(rect.bottom + 4, app.bottom - 32)}px`;
  }

  function locateGuideTarget(scroll = false) {
    clearGuidePointer();
    if (!guideTarget) return;
    const { role, page, selector, taskId, checkId, recordId } = guideTarget;
    if (currentAccount()?.role !== role || currentPage() !== page) return;
    let scope = document.getElementById("app");
    if (taskId) scope = scope.querySelector(`[data-task-card="${taskId}"]`);
    if (scope && checkId) scope = Array.from(scope.querySelectorAll(".hazard-card"))
      .find(card => card.querySelector("h3").textContent.includes(`／${checkId}`));
    if (scope && recordId) scope = Array.from(scope.querySelectorAll("tr"))
      .find(row => row.querySelector("td strong")?.textContent === recordId);
    const target = scope?.querySelector(selector);
    const status = document.getElementById("guide-location");
    if (!target) {
      status.textContent = "此步按钮当前不可用：可能已完成，或前置步骤未完成。请核对本页完成标志，不会替你新建任务或重设。";
      return;
    }
    for (let parent = target.parentElement; parent && parent !== scope.parentElement; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
    target.classList.add("guide-highlight");
    status.textContent = "已定位：按箭头操作。箭头只提示，不会替你点击。";
    if (scroll) {
      closeGuide();
      target.scrollIntoView({ block: "center", inline: "nearest" });
    }
    positionGuidePointer();
  }

  function navigateGuideStep() {
    const topic = document.getElementById("guide-topic").value;
    const destination = GUIDE_DESTINATIONS[topic]?.[Number(document.getElementById("guide-step").value)];
    if (!destination) return;
    const [role, page, selector, checkId] = destination;
    const account = state.db.accounts.find(row => row.role === role);
    const switchingRole = currentAccount()?.id !== account.id;
    if (switchingRole) {
      if (!global.confirm(`這一步需要切換至「${account.name}」。確認切換並定位？只切換演示角色，不提交或修改業務資料。`)) return;
      try { setSession(account.id); } catch (_) { return; }
    }
    guideTarget = null;
    clearGuidePointer();
    let taskId = null, recordId = null;
    if (topic === "inspection" && page === "inspections") {
      const tasks = state.db.inspectionTasks.filter(task => task.campusId === "CMP-001" && task.status !== "已取消");
      const chosen = document.getElementById("guide-task").value;
      taskId = tasks.find(task => task.id === chosen)?.id || (tasks.length === 1 ? tasks[0].id : null);
      if (!taskId) {
        showToast(tasks.length ? "請先在說明書選擇要繼續的 TASK 任務。" : "尚無青禾主校區任務，請先完成派單。");
        render();
        return;
      }
    }
    if (topic === "insurance" && page === "applications") {
      const records = state.db.applications.filter(row => row.schoolId === "SCH-001" && row.insurerId === account.orgId && row.status === "待核保");
      if (records.length !== 1) { showToast("請在投保核保頁核對青禾申請編號；沒有唯一待核保申請，暫不標記。"); global.location.hash = "#/applications"; render(); return; }
      recordId = records[0].id;
    }
    if (topic === "claim" && (role === "insurer" || role === "regulator" || selector.includes("supplementClaim"))) {
      const records = state.db.claims.filter(row => row.schoolId === "SCH-001");
      if (records.length !== 1) { showToast("請在理賠頁核對青禾案件編號；沒有唯一案件，暫不標記。"); global.location.hash = "#/claims"; render(); return; }
      recordId = records[0].id;
    }
    guideTarget = { role, page, selector, taskId, checkId, recordId, scroll: true };
    const route = `#/${page}${taskId ? `?task=${taskId}` : ""}`;
    const existingPage = currentPage() === page && (!taskId || document.querySelector(`[data-task-card="${taskId}"]`));
    if (global.location.hash === route || (!switchingRole && existingPage)) {
      if (switchingRole) render();
      else {
        global.history.replaceState(null, "", route);
        locateGuideTarget(true);
      }
    }
    else global.location.hash = route;
  }

  function closeGuide() {
    const guide = document.getElementById("demo-guide");
    const restoreFocus = guide.contains(document.activeElement);
    saveGuideScroll();
    guide.close();
    document.body.classList.remove("guide-open");
    const launcher = document.getElementById("guide-launcher");
    launcher.hidden = false;
    launcher.setAttribute("aria-expanded", "false");
    if (restoreFocus) launcher.focus({ preventScroll: true });
    positionGuidePointer();
  }

  function saveGuideScroll() {
    const step = document.querySelector(".guide-step:not([hidden])");
    if (guideReady && step) {
      guideScrollPositions[`${step.dataset.guideTopic}:${guidePositions[step.dataset.guideTopic]}`] =
        document.querySelector(".guide-content").scrollTop;
    }
  }

  function openGuide() {
    if (!guideReady) showGuideStep();
    const content = document.querySelector(".guide-content");
    const topic = document.getElementById("guide-topic").value;
    const guide = document.getElementById("demo-guide");
    const scroll = guide.open ? content.scrollTop : guideScrollPositions[`${topic}:${guidePositions[topic]}`] || 0;
    document.body.classList.add("guide-open");
    applyGuideLayout();
    if (!guide.open) guide.show();
    document.getElementById("guide-launcher").hidden = true;
    document.getElementById("guide-launcher").setAttribute("aria-expanded", "true");
    content.scrollTop = scroll;
    positionGuidePointer();
  }

  function constrainGuideRect(rect) {
    const width = Math.min(global.innerWidth, Math.max(360, rect.width));
    const height = Math.min(global.innerHeight, Math.max(520, rect.height));
    return { width, height, left: Math.max(0, Math.min(rect.left, global.innerWidth - width)),
      top: Math.max(0, Math.min(rect.top, global.innerHeight - height)) };
  }

  function applyGuideLayout() {
    const guide = document.getElementById("demo-guide");
    const maximize = guide.querySelector('[data-action="guideMaximize"]');
    const label = guideLayout.maximized ? "还原操作指南（返回放大前尺寸／位置）" : "最大化操作指南";
    maximize.setAttribute("aria-label", label);
    maximize.setAttribute("title", label);
    maximize.setAttribute("aria-pressed", String(guideLayout.maximized));
    const small = global.innerWidth <= 760;
    document.body.classList.toggle("guide-floating", !small && (guideLayout.maximized || !!guideLayout.rect));
    if (small || (!guideLayout.rect && !guideLayout.maximized)) {
      guide.style.removeProperty("left");
      guide.style.removeProperty("top");
      guide.style.removeProperty("width");
      guide.style.removeProperty("height");
    } else {
      const rect = guideLayout.maximized
        ? { left: 8, top: 8, width: global.innerWidth - 16, height: global.innerHeight - 16 }
        : (guideLayout.rect = constrainGuideRect(guideLayout.rect));
      for (const [key, value] of Object.entries(rect)) guide.style[key] = `${value}px`;
    }
    positionGuidePointer();
  }

  function startGuideDrag(event) {
    const guide = document.getElementById("demo-guide");
    const handle = event.target.closest("[data-guide-resize]");
    const header = event.target.closest("#guide-titlebar");
    if ((!handle && !header) || event.target.closest("button") || event.button !== 0 || global.innerWidth <= 760) return;
    event.preventDefault();
    const rect = guide.getBoundingClientRect();
    guideLayout.maximized = false;
    guideLayout.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    guideDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      edge: handle?.dataset.guideResize || "", rect: { ...guideLayout.rect }, target: handle || header };
    guideDrag.target.setPointerCapture(event.pointerId);
    applyGuideLayout();
  }

  function moveGuideDrag(event) {
    if (!guideDrag || guideDrag.pointerId !== event.pointerId) return;
    const { rect, edge } = guideDrag;
    const dx = event.clientX - guideDrag.x, dy = event.clientY - guideDrag.y;
    const next = { ...rect };
    if (!edge) {
      next.left += dx;
      next.top += dy;
    } else {
      if (edge.includes("e")) next.width = Math.min(global.innerWidth - rect.left, Math.max(360, rect.width + dx));
      if (edge.includes("s")) next.height = Math.min(global.innerHeight - rect.top, Math.max(520, rect.height + dy));
      if (edge.includes("w")) {
        next.left = Math.max(0, Math.min(rect.left + dx, rect.left + rect.width - 360));
        next.width = rect.width + rect.left - next.left;
      }
      if (edge.includes("n")) {
        next.top = Math.max(0, Math.min(rect.top + dy, rect.top + rect.height - 520));
        next.height = rect.height + rect.top - next.top;
      }
    }
    guideLayout.rect = constrainGuideRect(next);
    applyGuideLayout();
  }

  function endGuideDrag(event) {
    if (!guideDrag || guideDrag.pointerId !== event.pointerId) return;
    if (guideDrag.target.hasPointerCapture(event.pointerId)) guideDrag.target.releasePointerCapture(event.pointerId);
    guideDrag = null;
  }

  function showGuideStep(index, focus = false) {
    saveGuideScroll();
    guideReady = true;
    guideTarget = null;
    clearGuidePointer();
    const guide = document.getElementById("demo-guide");
    const topic = document.getElementById("guide-topic").value;
    const pages = Array.from(guide.querySelectorAll(`[data-guide-topic="${topic}"]`));
    const position = Math.max(0, Math.min(index ?? guidePositions[topic] ?? 0, pages.length - 1));
    guidePositions[topic] = position;
    guide.querySelectorAll("[data-guide-topic]").forEach(page => { page.hidden = true; });
    pages[position].hidden = false;
    const steps = document.getElementById("guide-step");
    steps.replaceChildren(...pages.map((page, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `${i + 1}. ${page.querySelector("h3").textContent}`;
      return option;
    }));
    steps.value = String(position);
    document.getElementById("guide-progress").textContent = `第 ${position + 1} / ${pages.length} 步`;
    guide.querySelector('[data-action="guidePrevious"]').disabled = position === 0;
    guide.querySelector('[data-action="guideNext"]').disabled = position === pages.length - 1;
    guide.querySelector(".guide-content").scrollTop = guideScrollPositions[`${topic}:${position}`] || 0;
    document.getElementById("guide-launcher-step").textContent = `第 ${position + 1}/${pages.length} 步`;
    const tasks = state.db.inspectionTasks.filter(task => task.campusId === "CMP-001" && task.status !== "已取消");
    const taskSelect = document.getElementById("guide-task");
    const selectedTask = taskSelect.value;
    taskSelect.replaceChildren(new Option("请选择要继续的 TASK", ""), ...tasks.map(task => new Option(task.id, task.id)));
    taskSelect.value = tasks.some(task => task.id === selectedTask) ? selectedTask : tasks.length === 1 ? tasks[0].id : "";
    document.getElementById("guide-task-label").hidden = topic !== "inspection" || tasks.length === 0;
    guide.querySelector('[data-action="guideNavigate"]').hidden = !GUIDE_DESTINATIONS[topic];
    document.getElementById("guide-location").textContent = "";
    if (focus) pages[position].querySelector("h3").focus({ preventScroll: true });
  }

  const ROLE_NAMES = {
    regulator: "教育主管部門",
    insurer: "保險公司",
    service: "第三方巡檢服務",
    school: "學校",
  };

  const MENUS = {
    regulator: [
      ["dashboard", "監管總覽", "總"],
      ["schools", "學校與投保覆蓋", "校"],
      ["services", "平台服務管理（演示代辦）", "服"],
      ["policies", "保單資訊", "單"],
      ["inspections", "校園巡檢與整改", "巡"],
      ["claims", "報案理賠摘要", "賠"],
    ],
    insurer: [
      ["dashboard", "保險工作台", "首"],
      ["applications", "投保核保", "核"],
      ["policies", "保單管理", "單"],
      ["inspections", "巡檢委託", "巡"],
      ["claims", "報案理賠", "賠"],
    ],
    service: [
      ["dashboard", "服務工作台", "首"],
      ["inspections", "巡檢任務", "巡"],
    ],
    school: [
      ["dashboard", "學校工作台", "首"],
      ["products", "保險產品與投保", "保"],
      ["policies", "投保申請與保單", "單"],
      ["inspections", "校園巡檢與整改", "巡"],
      ["claims", "報案與理賠", "賠"],
    ],
  };

  const PAGE_NAMES = {
    dashboard: "業務概覽",
    schools: "學校與投保覆蓋",
    policies: "保單資訊",
    inspections: "校園巡檢與整改",
    claims: "報案與理賠",
    applications: "投保核保",
    products: "保險產品與投保",
    services: "平台服務管理（演示代辦）",
  };

  function currentAccount() {
    if (!state.accountId) return null;
    return state.db.accounts.find(account => account.id === state.accountId) || null;
  }

  function currentPage() {
    const route = global.location.hash.replace(/^#\/?/, "");
    return route.split("?")[0] || "login";
  }

  function setSession(accountId) {
    try {
      if (accountId) global.sessionStorage.setItem(Data.SESSION_KEY, accountId);
      else global.sessionStorage.removeItem(Data.SESSION_KEY);
      state.accountId = accountId;
    } catch (error) {
      showToast(`無法保存登入狀態：${error.message}`);
      throw error;
    }
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    global.clearTimeout(showToast.timer);
    showToast.timer = global.setTimeout(() => toast.classList.remove("visible"), 3600);
  }

  function icon(name) {
    return `<span class="nav-icon" aria-hidden="true">${escapeHtml(name)}</span>`;
  }

  function badge(text) {
    const tone = /有效|已承保|已完成|已閉環|核定/.test(text) ? "good" : /未|待|整改|查勘中|補件/.test(text) ? "warn" : "neutral";
    return `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
  }

  function button(label, action, attrs = "", secondary = false) {
    return `<button type="button" class="button${secondary ? " secondary" : ""}" data-action="${escapeHtml(action)}" ${attrs}>${escapeHtml(label)}</button>`;
  }

  function panel(title, content, note = "") {
    return `<section class="panel"><header class="panel-heading"><div><h2>${escapeHtml(title)}</h2>${note ? `<p>${escapeHtml(note)}</p>` : ""}</div></header>${content}</section>`;
  }

  function table(headers, rows, empty = "目前沒有符合條件的記錄。") {
    return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td class="empty" colspan="${headers.length}">${escapeHtml(empty)}</td></tr>`}</tbody></table></div>`;
  }

  function metricCard(label, value, caption) {
    return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(caption)}</small></article>`;
  }

  function schoolName(schoolId) {
    return escapeHtml(Reports.lookup(state.db, "schools", schoolId));
  }

  function productName(productId) {
    return escapeHtml(Reports.lookup(state.db, "products", productId));
  }

  function insurerName(insurerId) {
    return escapeHtml(Reports.lookup(state.db, "insurers", insurerId, "shortName"));
  }

  function noCoverageRows(db) {
    return db.schools.filter(school => !Reports.policyForSchool(db, school.id));
  }

  function renderLogin() {
    const accountButtons = state.db.accounts.map(account => `
      <article class="login-card">
        <div class="role-mark">${escapeHtml(MENUS[account.role][0][2])}</div>
        <div><span class="eyebrow">${escapeHtml(ROLE_NAMES[account.role])}</span><h2>${escapeHtml(account.name)}</h2><p>${escapeHtml(account.organization)}</p></div>
        <button class="button" data-login="${escapeHtml(account.id)}">以此角色進入</button>
      </article>`).join("");

    return `<main class="login-page">
      <header class="public-header"><a class="brand" href="#/login"><span class="brand-mark">校</span><span><strong>校方責任險協同服務平台</strong><small>教育監管 · 保險保障 · 校園安全</small></span></a><div class="top-actions">${button("Demo 说明书", "openGuide", "", true)}<span class="demo-chip">離線演示 Prototype</span></div></header>
      <section class="login-hero"><div><span class="eyebrow">SCHOOL LIABILITY INSURANCE</span><h1>讓保障狀態與校園安全服務<br>清晰可見、跨角色協同</h1><p>以合成資料演示投保承保、第三方巡檢、隱患整改、理賠進度與教育監管分析。</p></div><aside><strong>演示資料聲明</strong><p>所有學校、保單、事故及服務記錄均為合成樣例。此原型不提供真實投保、支付、核保或理賠服務。</p><p>演示日期：${escapeHtml(state.db.meta.businessDate)}</p></aside></section>
      ${state.warning ? `<div class="warning-banner"><strong>本機資料提示</strong><span>${escapeHtml(state.warning)}</span>${button("啟用v2合成場景", "activateDemo", "", true)}${button("重設演示資料", "resetDemo", "", true)}</div>` : ""}
      <section class="login-section"><div class="section-title"><div><span class="eyebrow">ROLE-BASED WORKSPACES</span><h2>選擇演示角色</h2><p>四個角色各自進入對應工作台；操作後的業務狀態會在同一瀏覽器內共享。</p></div>${button("重設演示資料", "resetDemo", "", true)}</div><div class="login-grid">${accountButtons}</div></section>
      <footer class="public-footer">演示版 · 不含真實學生個人資料 · 不構成保險條款或承保承諾</footer>
    </main>`;
  }

  function pageHeading(title, description, extra = "") {
    return `<section class="page-heading"><div><span class="eyebrow">${escapeHtml(ROLE_NAMES[currentAccount().role])} WORKSPACE</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${extra}</section>`;
  }

  function shell(account, page, content) {
    const menu = MENUS[account.role];
    const nav = menu.map(([route, label, symbol]) => `<a class="nav-link${page === route ? " active" : ""}" href="#/${route}">${icon(symbol)}<span>${escapeHtml(label)}</span></a>`).join("");
    const title = PAGE_NAMES[page] || "業務概覽";
    return `<div class="app-shell">
      <aside class="sidebar"><a class="brand sidebar-brand" href="#/${menu[0][0]}"><span class="brand-mark">校</span><span><strong>校方責任險</strong><small>協同服務平台</small></span></a><div class="side-label">工作台選單</div><nav>${nav}</nav><div class="sidebar-note"><span class="status-dot"></span><span><strong>離線演示模式</strong><small>資料保存在此瀏覽器</small></span></div></aside>
      <main class="main-area"><header class="topbar"><div><span class="breadcrumb">平台 / ${escapeHtml(title)}</span><strong>${escapeHtml(account.organization)}</strong></div><div class="top-actions">${button("Demo 说明书", "openGuide", "", true)}<span class="business-date">演示日期 ${escapeHtml(state.db.meta.businessDate)}</span><button class="user-button" data-action="logout"><span class="avatar">${escapeHtml(account.name.slice(0, 1))}</span><span>${escapeHtml(account.name)}<small>${escapeHtml(ROLE_NAMES[account.role])} · 登出</small></span></button></div></header>
        ${state.warning ? `<div class="warning-banner compact"><span>${escapeHtml(state.warning)}</span>${button("重設演示資料", "resetDemo", "", true)}</div>` : ""}
        <div class="page-content">${content}<section class="synthetic-note"><strong>演示資料</strong><span>此頁只使用本機合成樣例；不代表實際學校、保單、巡檢、事故或資金記錄。</span></section></div>
      </main></div>`;
  }

  function regulatorDashboard(db) {
    const m = Reports.metrics(db);
    const regionRows = Reports.coverageByRegion(db).map(region => {
      const percent = Math.round(region.rate * 100);
      return `<div class="coverage-row"><div><strong>${escapeHtml(region.name)}</strong><span>${region.covered} / ${region.schools} 所樣例學校</span></div><div class="progress"><i style="width:${percent}%"></i></div><b>${percent}%</b></div>`;
    }).join("");
    const uncovered = noCoverageRows(db).slice(0, 6).map(school => [
      schoolName(school.id),
      escapeHtml(Reports.lookup(db, "regions", school.regionId)),
      escapeHtml(school.schoolType),
      badge(Reports.schoolStatus(db, school)),
    ]);
    const claimRows = db.claims.slice(0, 4).map(claim => [
      `<strong>${escapeHtml(claim.id)}</strong>`,
      schoolName(claim.schoolId),
      escapeHtml(claim.incidentType),
      badge(claim.status),
    ]);
    return pageHeading("監管總覽", "掌握學校投保覆蓋、校園安全服務與理賠處理概況。統計只反映本機合成樣例。")
      + `<div class="metric-grid">${metricCard("樣例學校", m.schoolCount, "名冊均為合成資料")}${metricCard("有效保障學校", m.coveredSchoolCount, "依演示日期及有效保單去重")}${metricCard("學校覆蓋率", `${(m.coverageRate * 100).toFixed(1)}%`, "有效保障學校 / 樣例學校")}${metricCard("待整改問題", m.unresolvedHazardCount, "需由學校及服務方接續處理")}</div>`
      + `<div class="two-column">${panel("各區域保障覆蓋", `<div class="coverage-list">${regionRows}</div>`, "演示分母為目前載入的 12 所合成學校，不代表正式應保口徑。")}${panel("監管提示", `<div class="notice-list"><article><span class="notice-icon amber">!</span><div><strong>${noCoverageRows(db).length} 所樣例學校尚無有效保單</strong><p>可查看學校名冊與投保處理狀態。</p></div></article><article><span class="notice-icon blue">↗</span><div><strong>${m.openClaimCount} 件理賠仍在處理</strong><p>事故記錄不等同責任認定或學校風險結論。</p></div></article><article><span class="notice-icon green">✓</span><div><strong>${m.inspectionTaskCount} 項巡檢服務記錄</strong><p>服務預算台帳與保費及理賠金分開展示。</p></div></article></div>`)}</div>`
      + `<div class="two-column">${panel("尚未形成有效保障的學校", table(["學校", "區域", "類型", "狀態"], uncovered), "投保處理中不視為已承保。")}${panel("近期理賠進度", table(["案件", "學校", "事故類型", "狀態"], claimRows), "僅展示理賠進度摘要；不顯示學生個人資訊。")}</div>`;
  }

  function schoolTable(db, schools = db.schools) {
    const rows = schools.map(school => {
      const policy = Reports.policyForSchool(db, school.id);
      return [
      `<strong>${schoolName(school.id)}</strong><small>${escapeHtml(school.id)}</small>`,
      escapeHtml(Reports.lookup(db, "regions", school.regionId)),
      escapeHtml(school.schoolType),
      escapeHtml(String(school.studentCount)),
      badge(Reports.schoolStatus(db, school)),
      policy ? insurerName(policy.insurerId) : "—",
      ];
    });
    return table(["學校", "區域", "學校類型", "學生人數（合成）", "投保狀態", "承保機構"], rows);
  }

  function renderSchools(db) {
    return pageHeading("學校與投保覆蓋", "按學校名冊查看有效保單與投保處理狀態。示例名冊只用於原型演示。")
      + `<div class="metric-grid compact-grid">${metricCard("學校數", db.schools.length, "合成樣例")}${metricCard("尚無有效保單", noCoverageRows(db).length, "含投保中及尚未申請")}${metricCard("統計日期", db.meta.businessDate, "演示固定日期")}</div>`
      + panel("學校名冊", schoolTable(db), "覆蓋計算以有效日期內的保單為準；未確認地方適用名冊前，不作正式應保判定。");
  }

  function policyRows(db, policies) {
    return policies.map(policy => [
      `<strong>${escapeHtml(policy.policyNo)}</strong><small>${escapeHtml(policy.id)}</small>`,
      `${schoolName(policy.schoolId)}<small>採購：${escapeHtml(policy.purchaser)}；投保人／被保險人／付款方均為本校（${escapeHtml(policy.schoolId)}）</small>`,
      insurerName(policy.insurerId),
      productName(policy.productId),
      `${escapeHtml(policy.startDate)} 至 ${escapeHtml(policy.endDate)}`,
      badge(policy.status),
    ]);
  }

  function renderPolicies(db, account) {
    let policies = db.policies;
    if (account.role === "insurer") policies = policies.filter(policy => policy.insurerId === account.orgId);
    if (account.role === "school") policies = policies.filter(policy => policy.schoolId === account.orgId);
    const applications = db.applications.filter(application => account.role === "regulator"
      || (account.role === "insurer" && application.insurerId === account.orgId)
      || (account.role === "school" && application.schoolId === account.orgId));
    const appRows = applications.map(application => {
      const note = escapeHtml(application.underwritingNote || application.notes || "—");
      const schoolAction = account.role === "school" && application.status === "待補件"
        ? button("補件後重新送件", "resubmitApplication", `data-id="${escapeHtml(application.id)}"`)
        : note;
      return [
        `<strong>${escapeHtml(application.id)}</strong>`,
        schoolName(application.schoolId),
        productName(application.productId),
        escapeHtml(Reports.formatMoney(application.estimatedPremium)),
        badge(application.status),
        schoolAction,
      ];
    });
    return pageHeading(account.role === "school" ? "投保申請與保單" : "保單資訊", "投保申請與承保保單分開顯示；提交申請並不表示保障已生效。")
      + panel("投保申請", table(["申請編號", "學校", "產品", "示例保費", "狀態", "處理說明"], appRows), "保費僅為合成估算，未整合真實支付。")
      + panel(account.role === "school" ? "本校保單" : "保單清單", table(["保單編號", "學校", "保險機構", "產品版本", "保險期間", "狀態"], policyRows(db, policies)), "保單內容為演示資料，不構成保險承保或保障承諾。");
  }

  function renderProducts(db, account) {
    const products = db.products.map(product => {
      const insurer = db.insurers.find(entry => entry.id === product.insurerId);
      return `<article class="product-card"><div class="product-top"><span class="eyebrow">${escapeHtml(insurer?.shortName || "保險機構")}</span>${badge(product.version)}</div><h2>${escapeHtml(product.name)}</h2><p>每人責任限額 <strong>${escapeHtml(Reports.formatMoney(product.limitPerPerson))}</strong><br>累計責任限額 ${escapeHtml(Reports.formatMoney(product.limitAggregate))}</p><div class="service-tags">${product.services.map(service => `<span>${escapeHtml(service)}</span>`).join("")}</div><p class="product-estimate">示例保費約 ${escapeHtml(Reports.formatMoney(product.estimatePerStudent))} / 學生</p><form data-form="apply"><input type="hidden" name="productId" value="${escapeHtml(product.id)}"><button class="button" type="submit">選擇並提交投保</button></form></article>`;
    }).join("");
    return pageHeading("保險產品與投保", "學校可查看合成產品示例並提交投保申請；產品責任及增值服務以正式保險條款與合同為準。")
      + `<div class="product-grid">${products}</div>`
      + panel("投保提示", `<p class="body-copy">部分示例產品包含校園安全巡檢或風險建議，其他服務可能因產品、地區或合同而異。提交後由保險公司核保；此 Demo 不執行真實支付。</p>`);
  }

  function renderApplications(db, account) {
    const applications = db.applications.filter(application => application.insurerId === account.orgId);
    const rows = applications.map(application => {
      const actions = application.status === "待核保"
        ? `${button("同意承保", "underwrite", `data-id="${escapeHtml(application.id)}" data-decision="approve"`)} ${button("要求補件", "underwrite", `data-id="${escapeHtml(application.id)}" data-decision="supplement"`, true)} ${button("不予承保", "underwrite", `data-id="${escapeHtml(application.id)}" data-decision="reject"`, true)}`
        : escapeHtml(application.underwritingNote || "等待學校補充資料");
      return [
        `<strong>${escapeHtml(application.id)}</strong>`,
        schoolName(application.schoolId),
        productName(application.productId),
        escapeHtml(String(application.studentCount)),
        escapeHtml(Reports.formatMoney(application.estimatedPremium)),
        badge(application.status),
        actions,
      ];
    });
    return pageHeading("投保核保", "處理本機演示申請；核保操作只改變合成資料，不會建立真實保險合同。")
      + panel("待處理申請", table(["申請編號", "學校", "產品", "學生數（合成）", "示例保費", "狀態", "核保操作"], rows), "同意承保後生成關聯保單，監管覆蓋率依有效保單更新。");
  }

  function taskRowsFor(db, account) {
    return global.SchoolDemoCampus.taskVisible(db, account);
  }

  function renderInspections(db, account) {
    return global.SchoolDemoCampusPages.inspections(db, account, campusHelpers());
  }

  function renderClaims(db, account) {
    const claims = db.claims.filter(claim => account.role === "regulator"
      || (account.role === "insurer" && claim.insurerId === account.orgId)
      || (account.role === "school" && claim.schoolId === account.orgId));
    const rows = claims.map(claim => {
      const nextStatus = claim.status === "待受理" ? "查勘中"
        : claim.status === "查勘中" ? "待補充資料"
          : claim.status === "待補充資料" ? "核定處理中"
            : claim.status === "核定處理中" ? "已結案" : "";
      const control = account.role === "insurer" && nextStatus
        ? button(`更新為${nextStatus}`, "advanceClaim", `data-id="${escapeHtml(claim.id)}" data-next="${escapeHtml(nextStatus)}"`)
        : account.role === "school" && claim.status === "待補充資料"
          ? button("提交合成補充資料", "supplementClaim", `data-id="${escapeHtml(claim.id)}"`)
          : "—";
      return [
        `<strong>${escapeHtml(claim.id)}</strong>`,
        schoolName(claim.schoolId),
        escapeHtml(claim.incidentDate),
        escapeHtml(claim.incidentType),
        badge(claim.status),
        escapeHtml(claim.events.at(-1)?.note || ""),
        control,
      ];
    });
    const claimForm = account.role === "school" ? renderClaimForm(db, account) : "";
    const summary = account.role === "regulator"
      ? `<div class="metric-grid compact-grid">${metricCard("理賠案件", claims.length, "合成案件")}${metricCard("處理中", claims.filter(claim => !["已結案", "未予受理"].includes(claim.status)).length, "待保險機構更新")}${metricCard("已結案", claims.filter(claim => claim.status === "已結案").length, "不含賠付金額判斷")}</div>`
      : "";
    return pageHeading(account.role === "regulator" ? "報案理賠摘要" : "報案與理賠", "事故通知、承保責任及理賠進度由學校與保險機構依各自職責處理；監管端只展示必要摘要。")
      + summary + claimForm
      + panel("理賠進度記錄", table(["案件", "學校", "事故日期", "事故類型", "狀態", "最近更新", "操作"], rows), "不展示學生姓名、聯絡方式或真實賠款；本 Demo 不判定事故責任。")
      + (claims.length ? panel("所選案件進度歷程", claims.slice(0, 3).map(claim => `<details class="timeline-card"><summary>${escapeHtml(claim.id)} · ${escapeHtml(claim.status)}</summary><ol>${claim.events.map(event => `<li><strong>${escapeHtml(event.status)}</strong><span>${escapeHtml(event.at)} · ${escapeHtml(event.note)}</span></li>`).join("")}</ol></details>`).join("")) : "");
  }

  function renderClaimForm(db, account) {
    const policies = db.policies.filter(policy => policy.schoolId === account.orgId && Workflows.activePolicy(db, policy));
    if (!policies.length) return panel("提交事故通知", `<p class="body-copy">本校目前沒有統計日有效的演示保單。請先完成投保承保流程。</p>`);
    return panel("提交事故通知", `<form data-form="claim"><label>關聯保單<select name="policyId" required>${policies.map(policy => `<option value="${escapeHtml(policy.id)}">${escapeHtml(policy.policyNo)} · ${productName(policy.productId)}</option>`).join("")}</select></label><div class="form-row"><label>事故日期<input type="date" name="incidentDate" max="${escapeHtml(db.meta.businessDate)}" value="${escapeHtml(db.meta.businessDate)}" required></label><label>事故類型<input name="incidentType" required minlength="2" maxlength="60" value="校園活動意外傷害（合成）" placeholder="請勿輸入真實個人資料"></label></div><label>演示摘要<textarea name="description" maxlength="180" placeholder="只填合成情境，避免輸入學生姓名或聯絡資料。">合成案例：校園活動期間發生意外，已按流程報告；不含個人資料。</textarea></label><button class="button" type="submit">提交合成事故通知</button></form>`, "合成事故類型與摘要已預填；可直接提交或按需修改。");
  }

  function renderDashboard(db, account) {
    if (account.role === "regulator") return regulatorDashboard(db)
      + global.SchoolDemoCampusPages.metrics(db, campusHelpers())
      + global.SchoolDemoCampusPages.gaps(db, campusHelpers());
    if (account.role === "school") {
      const policy = Reports.policyForSchool(db, account.orgId);
      const applications = db.applications.filter(application => application.schoolId === account.orgId);
      const hazards = db.hazards.filter(hazard => hazard.schoolId === account.orgId && hazard.status !== "已銷號");
      const claims = db.claims.filter(claim => claim.schoolId === account.orgId && !["已結案", "未予受理"].includes(claim.status));
      return pageHeading("學校工作台", "查看本校保障狀態、巡檢整改與報案進度。")
        + `<div class="metric-grid">${metricCard("有效保單", policy ? 1 : 0, policy ? policy.policyNo : "尚未形成有效保障")}${metricCard("投保申請", applications.length, "含待核保或補件")}${metricCard("待整改問題", hazards.length, "需提交整改並申請複查")}${metricCard("處理中理賠", claims.length, "保險機構更新進度")}</div>`
        + `<div class="quick-grid"><a href="#/products"><span>01</span><strong>比較產品並投保</strong><small>產品 → 投保申請 → 保險核保</small></a><a href="#/inspections"><span>02</span><strong>處理巡檢整改</strong><small>查看報告、提交整改、等待複查</small></a><a href="#/claims"><span>03</span><strong>報案與理賠</strong><small>關聯本校有效保單提交合成通知</small></a></div>`
        + panel("本校資料", `<div class="profile-grid"><span>學校名稱</span><strong>${schoolName(account.orgId)}</strong><span>所在區域</span><strong>${escapeHtml(Reports.lookup(db, "regions", db.schools.find(school => school.id === account.orgId)?.regionId))}</strong><span>學校類型</span><strong>${escapeHtml(db.schools.find(school => school.id === account.orgId)?.schoolType || "")}</strong><span>學生人數（合成）</span><strong>${escapeHtml(String(db.schools.find(school => school.id === account.orgId)?.studentCount || ""))}</strong></div>`);
    }
    if (account.role === "insurer") {
      const apps = db.applications.filter(application => application.insurerId === account.orgId && ["待核保", "待補件"].includes(application.status)).length;
      const policies = db.policies.filter(policy => policy.insurerId === account.orgId && Workflows.activePolicy(db, policy)).length;
      const claims = db.claims.filter(claim => claim.insurerId === account.orgId && !["已結案", "未予受理"].includes(claim.status)).length;
      const tasks = global.SchoolDemoCampus.taskVisible(db, account).filter(task => task.status !== "已取消"
        && !global.SchoolDemoCampus.serviceComplete(db, task)).length;
      return pageHeading("保險公司工作台", "處理本機合成投保申請、保單、巡檢委託及理賠進度。")
        + `<div class="metric-grid">${metricCard("待核保申請", apps, "可補件、承保或不予承保")}${metricCard("有效保單", policies, "只計本機演示機構")}${metricCard("未完成巡檢", tasks, "由受託服務方接續處理")}${metricCard("處理中理賠", claims, "更新狀態後跨角色同步")}</div>`
        + `<div class="quick-grid"><a href="#/applications"><span>01</span><strong>處理投保申請</strong><small>核保決定會同步生成演示保單</small></a><a href="#/inspections"><span>02</span><strong>查看授權服務</strong><small>僅服務計畫明確授權可代辦；承保不自動授權</small></a><a href="#/claims"><span>03</span><strong>更新理賠進度</strong><small>保留每次進度歷程</small></a></div>`;
    }
    const tasks = db.inspectionTasks.filter(task => task.serviceProviderId === account.orgId);
    return pageHeading("巡檢服務工作台", "接收巡檢委託、提交合成現場報告，並對學校整改進行複查。")
      + `<div class="metric-grid">${metricCard("待接單", tasks.filter(task => task.status === "待接單").length, "等待服務機構接收")}${metricCard("執行中", tasks.filter(task => task.status === "執行中").length, "待提交現場報告")}${metricCard("待複查", db.hazards.filter(hazard => hazard.status === "待複查" && tasks.some(task => task.id === hazard.taskId)).length, "學校已提交整改")}${metricCard("約定服務已履約", tasks.filter(task => global.SchoolDemoCampus.serviceComplete(db, task)).length, "不代表隱患全部消除")}</div>`
      + panel("我的巡檢任務", table(["任務", "學校", "狀態", "建立日期"], tasks.map(task => [`<strong>${escapeHtml(task.id)}</strong>`, schoolName(task.schoolId), badge(task.status), escapeHtml(task.createdAt)])));
  }

  function renderPage(db, account, page) {
    if (page === "services" && account.role === "regulator") return global.SchoolDemoCampusPages.services(db, account, campusHelpers());
    if (page === "dashboard") return renderDashboard(db, account);
    if (page === "schools" && account.role === "regulator") return renderSchools(db);
    if (page === "products" && account.role === "school") return renderProducts(db, account);
    if (page === "applications" && account.role === "insurer") return renderApplications(db, account);
    if (page === "policies") return renderPolicies(db, account);
    if (page === "inspections") return renderInspections(db, account);
    if (page === "claims") return renderClaims(db, account);
    return renderDashboard(db, account);
  }

  function campusHelpers() {
    return { panel, table, pageHeading, metricCard };
  }

  function render() {
    clearGuidePointer();
    global.requestAnimationFrame(() => {
      locateGuideTarget(guideTarget?.scroll);
      if (guideTarget) guideTarget.scroll = false;
    });
    let account = currentAccount();
    const page = currentPage();
    if (!account) {
      state.accountId = null;
      if (page !== "login") global.location.hash = "#/login";
      document.getElementById("app").innerHTML = renderLogin();
      return;
    }
    const allowed = MENUS[account.role].map(menu => menu[0]);
    if (!allowed.includes(page)) {
      const home = allowed[0];
      if (page !== home) global.location.hash = `#/${home}`;
      document.getElementById("app").innerHTML = shell(account, home, renderPage(state.db, account, home));
      return;
    }
    document.title = `${PAGE_NAMES[page] || "業務概覽"} - 校方責任險協同服務平台`;
    document.getElementById("app").innerHTML = shell(account, page, renderPage(state.db, account, page));
  }

  function commit(action, payload) {
    if (state.blocked) {
      showToast("本機資料載入異常。請先使用「重設演示資料」；目前不會覆寫原存檔。");
      return false;
    }
    const result = Workflows.run(state.db, state.accountId, action, payload);
    if (!result.ok) {
      showToast(result.message);
      return false;
    }
    try {
      Data.save(result.db);
      state.db = result.db;
      render();
      showToast(result.message);
      return true;
    } catch (error) {
      showToast(`操作未保存：${error.message}`);
      return false;
    }
  }

  function login(accountId) {
    const account = state.db.accounts.find(entry => entry.id === accountId);
    if (!account) {
      showToast("找不到演示帳號。");
      return;
    }
    try {
      setSession(account.id);
      global.location.hash = `#/${MENUS[account.role][0][0]}`;
      render();
    } catch (_) {
      // The storage error is already reported by setSession.
    }
  }

  function resetDemo() {
    if (!global.confirm("重設此瀏覽器中的校方責任險 Demo 資料？目前的演示操作將被清除。")) return;
    try {
      state.db = Data.createSeed();
      Data.save(state.db);
      state.warning = null;
      state.blocked = false;
      setSession(null);
      global.location.hash = "#/login";
      render();
      showToast("已恢復校方責任險合成基準資料。");
    } catch (error) {
      showToast(`重設失敗：${error.message}`);
    }
  }

  document.addEventListener("click", event => {
    const campusTarget = event.target.closest("[data-campus-action]");
    if (campusTarget) {
      try { global.SchoolDemoCampusPages.handleClick(campusTarget, commit); }
      catch (error) { showToast(error.message); }
      return;
    }
    const loginButton = event.target.closest("[data-login]");
    if (loginButton) {
      login(loginButton.dataset.login);
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "activateDemo") {
      try {
        if (global.localStorage.getItem(Data.STORAGE_KEY)) {
          showToast("已有v2存檔；如需捨棄損壞資料，請使用需確認的重設操作。");
          return;
        }
        Data.save(state.db); state.warning = null; state.blocked = false;
        render(); showToast("v2合成場景已啟用；v1存檔保留。");
      } catch (error) { showToast(`啟用失敗：${error.message}`); }
      return;
    }
    if (action === "openGuide" || action === "reopenGuide") {
      openGuide();
      return;
    }
    if (action === "guideMaximize" || action === "guideRestore") {
      const content = document.querySelector(".guide-content");
      const topic = document.getElementById("guide-topic").value;
      const readingKey = `${topic}:${guidePositions[topic]}`;
      const restoring = guideLayout.maximized && action === "guideMaximize";
      if (!guideLayout.maximized) {
        guideLayout.readingScroll = content.scrollTop;
        guideLayout.readingKey = readingKey;
      }
      guideLayout.maximized = action === "guideMaximize" && !guideLayout.maximized;
      if (action === "guideRestore") {
        guideLayout.rect = null;
        guideLayout.readingScroll = content.scrollTop;
      }
      applyGuideLayout();
      if (restoring && guideLayout.readingKey === readingKey) content.scrollTop = guideLayout.readingScroll;
      return;
    }
    if (action === "guidePrevious" || action === "guideNext") {
      const position = Number(document.getElementById("guide-step").value);
      showGuideStep(position + (action === "guideNext" ? 1 : -1), true);
      return;
    }
    if (action === "guideNavigate") {
      navigateGuideStep();
      return;
    }
    if (action === "closeGuide") {
      closeGuide();
      return;
    }
    if (action === "logout") {
      try {
        setSession(null);
        global.location.hash = "#/login";
        render();
      } catch (_) {
        // The storage error is already reported by setSession.
      }
      return;
    }
    if (action === "resetDemo") {
      resetDemo();
      return;
    }
    if (action === "underwrite") {
      commit(action, { applicationId: target.dataset.id, decision: target.dataset.decision });
      return;
    }
    if (action === "supplementClaim") {
      commit(action, { claimId: target.dataset.id });
      return;
    }
    if (action === "resubmitApplication") {
      commit(action, { applicationId: target.dataset.id });
      return;
    }
    if (action === "advanceClaim") {
      commit(action, { claimId: target.dataset.id, status: target.dataset.next });
      return;
    }
    showToast("此操作在原型中不可用。");
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.defaultPrevented && document.getElementById("demo-guide").open) {
      event.preventDefault();
      closeGuide();
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "guide-task") { guideTarget = null; clearGuidePointer(); }
    if (event.target.id === "guide-topic") showGuideStep(undefined, true);
    if (event.target.id === "guide-step") showGuideStep(Number(event.target.value), true);
  });
  document.addEventListener("scroll", positionGuidePointer, true);
  document.getElementById("demo-guide").addEventListener("pointerdown", startGuideDrag);
  document.addEventListener("pointermove", moveGuideDrag);
  document.addEventListener("pointerup", endGuideDrag);
  document.addEventListener("pointercancel", endGuideDrag);
  global.addEventListener("resize", () => {
    guideDrag = null;
    applyGuideLayout();
  });

  document.addEventListener("submit", event => {
    const campusForm = event.target.closest("form[data-campus-form]");
    if (campusForm) {
      try { global.SchoolDemoCampusPages.handleForm(campusForm, event, commit); }
      catch (error) { event.preventDefault(); showToast(error.message); }
      return;
    }
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.form === "apply") commit("submitApplication", values);
    else if (form.dataset.form === "claim") commit("submitClaim", values);
  });

  global.addEventListener("hashchange", render);
  try {
    state.accountId = global.sessionStorage.getItem(Data.SESSION_KEY);
  } catch (error) {
    state.warning = `無法讀取演示登入狀態：${error.message}`;
  }
  render();
})(window);
