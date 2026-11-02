(function initSchoolDemoCampusPages(global) {
  "use strict";
  const C = global.SchoolDemoCampus;
  const R = global.SchoolDemoReports;
  const e = R.escapeHtml;
  const label = (db, list, id) => e(db[list].find(row => row.id === id)?.name || id || "無／不關聯");
  const btn = (title, action, attrs = "") => `<button class="button secondary" type="button" data-campus-action="${action}" ${attrs}>${e(title)}</button>`;
  const input = (title, name, value, type = "text") => `<label>${e(title)}<input name="${name}" type="${type}" value="${e(value)}" required></label>`;
  const area = (title, name, value) => `<label>${e(title)}<textarea name="${name}" required maxlength="600">${e(value)}</textarea></label>`;
  const select = (title, name, values, selected = "") => `<label>${e(title)}<select name="${name}">${values.map(([value, name]) => `<option value="${e(value)}"${value === selected ? " selected" : ""}>${e(name)}</option>`).join("")}</select></label>`;
  const form = (action, fields, title, hidden = {}) => `<form data-campus-form="${action}">${Object.entries(hidden).map(([key, value]) => `<input type="hidden" name="${e(key)}" value="${e(value)}">`).join("")}${fields}<button class="button" type="submit">${e(title)}</button></form>`;
  const details = (title, html) => `<details class="campus-details"><summary>${e(title)}</summary>${html}</details>`;
  const ratio = (a, b) => b ? `${a}/${b} · ${(a / b * 100).toFixed(1)}%` : "不適用（分母為0）";
  const status = text => `<span class="badge">${e(text)}</span>`;
  const note = "<p class=\"muted\">所有證據為合成示意索引，非真實現場照片、專業文件或已驗真資料。</p>";
  const taskLink = taskId => `<a class="button secondary" href="#/inspections?task=${e(taskId)}">查看任務</a>`;

  function metrics(db, h) {
    const m = C.analytics(db);
    return `<div class="metric-grid">${h.metricCard("合同校區完整覆蓋", ratio(m.covered, m.expected), "現場檢查及報告已驗收／應覆蓋校區")}
      ${h.metricCard("全部應檢校區已覆蓋學校", ratio(m.fullyCovered, m.schools), "只查一個校區不能代表整校")}
      ${h.metricCard("已建任務檢查項完成", ratio(m.checked, m.applicable), `未檢${m.unchecked}項，未提交／待錄入${m.missing}項；未派單校區另列`)}
      ${h.metricCard("到期現場任務完成", ratio(m.completedDue, m.due), "取消任務排除；未驗收不計完成")}</div>
      <div class="metric-grid compact-grid">${h.metricCard("逾期未銷號", m.overdue, `按原期限未銷號：${m.originalOverdue}`)}
      ${h.metricCard("待複查", m.awaiting, "證據不足仍保留")}
      ${h.metricCard("資料與處置缺口", m.gaps.length, "不是學校安全排名")}</div>`;
  }
  function gaps(db, h) {
    const m = C.analytics(db);
    return h.panel("監管缺口與待辦", h.table(["類型", "學校", "事項", "下鑽"], m.gaps.map(row => [
      e(row.type), label(db, "schools", row.schoolId), e(row.detail), row.taskId ? taskLink(row.taskId) : `<a href="#/services">查看計畫範圍</a>`,
    ])), "零隱患／零出險不等於安全；檢查深度、學校規模及資料缺失須共同考慮。");
  }
  function services(db, actor, h) {
    if (actor.role !== "regulator") return h.panel("沒有平台財務權限", "<p>服務計畫代辦僅在明確標記的監管演示區提供。</p>");
    const fund = db.funds[0];
    const committed = db.servicePlans.filter(plan => plan.status !== "草稿").reduce((sum, plan) => sum + plan.budget, 0);
    const funding = h.table(["來源／依據", "確認收入", "安排額", "批准預算", "計畫佔用", "支付"], [[
      e(`${fund.source}；${fund.allocationBasis}`), e(R.formatMoney(fund.confirmedIncome)), e(R.formatMoney(fund.allocated)),
      e(R.formatMoney(fund.approvedBudget)), e(R.formatMoney(committed)), status(fund.paymentStatus),
    ]]);
    const newPlan = form("createPlan",
      input("計畫名稱", "title", "平台校園巡檢服務（合成）")
      + select("對象校區", "campusId", db.campuses.map(row => [row.id, row.name]))
      + `<div class="form-row">${input("開始", "startDate", db.meta.businessDate, "date")}${input("結束", "endDate", "2026-12-31", "date")}${input("現場到期", "dueDate", "2026-11-15", "date")}</div>`
      + `<div class="form-row">${input("每校區現場次數", "visits", 1, "number")}${input("每隱患複查上限", "rechecks", 3, "number")}${input("單次預算（元）", "unitBudget", 1200, "number")}${input("計畫總預算（元）", "budget", 1200, "number")}</div>`
      + select("可選：授權保險公司代辦", "authorizedInsurerId", [["", "不授權"], ...db.insurers.map(row => [row.id, row.name])])
      + select("可選：關聯保單（不決定巡檢資格）", "policyId", [["", "不關聯保單"], ...db.policies.map(row => [row.id, `${row.policyNo}／${db.schools.find(s => s.id === row.schoolId).name}`])])
      + area("交付要求", "deliverables", "逐校區22項指定點位巡檢、報告、缺檢補查與約定複查；非專業檢測。"),
      "建立草稿");
    const plans = db.servicePlans.map(plan => {
      const actions = plan.status === "草稿" ? btn("批准計畫", "approvePlan", `data-plan-id="${plan.id}"`)
        : plan.status === "已批准" ? btn("生效計畫", "activatePlan", `data-plan-id="${plan.id}"`)
          : btn("建立後繼草稿", "revisePlan", `data-plan-id="${plan.id}"`);
      const dispatch = plan.status === "生效" ? form("createInspection",
        select("計畫授權校區", "campusId", plan.campusIds.map(value => [value, db.campuses.find(row => row.id === value).name])),
        "按計畫派單", { planId: plan.id }) : "";
      return h.panel(`${plan.id} v${plan.version} · ${plan.title}`, `<p>${status(plan.status)} 期間 ${e(plan.startDate)} 至 ${e(plan.endDate)}；現場到期 ${e(plan.dueDate)}</p>
        <p>校區：${plan.campusIds.map(value => label(db, "campuses", value)).join("、")}</p>
        <p>預算 ${e(R.formatMoney(plan.budget))}；單次 ${e(R.formatMoney(plan.unitBudget))}；每校區${plan.visits}次現場，每隱患最多${plan.rechecks}次複查（先通過則完成該項復查義務）。</p>
        <p>委託方：平台服務演示代辦；受託方：${label(db, "serviceProviders", plan.serviceProviderId)}；保險代辦授權：${label(db, "insurers", plan.authorizedInsurerId)}；保單：${e(plan.policyId || "不關聯")}</p>
        <p>${e(plan.deliverables)}</p>${actions}${plan.status === "草稿" ? details("修改草稿（批准後禁止覆寫）", form("updatePlan",
          input("計畫名稱", "title", plan.title) + input("總預算", "budget", plan.budget, "number")
          + input("單次預算", "unitBudget", plan.unitBudget, "number") + input("現場次數", "visits", plan.visits, "number")
          + input("每隱患複查上限", "rechecks", plan.rechecks, "number")
          + input("開始", "startDate", plan.startDate, "date") + input("結束", "endDate", plan.endDate, "date")
          + input("到期", "dueDate", plan.dueDate, "date") + area("交付要求", "deliverables", plan.deliverables),
          "更新草稿", { planId: plan.id })) : ""}${dispatch}${details("凍結版本與操作歷程", `<pre>${e(JSON.stringify({ versions: plan.versions, history: plan.history }, null, 2))}</pre>`)}`);
    }).join("");
    const ledger = h.table(["委託", "來源", "金額", "預算狀態", "說明"], db.serviceLedger.map(row =>
      [e(row.taskId), e(row.source), e(R.formatMoney(row.amount)), status(row.status), e(row.note)]));
    return h.pageHeading("平台服務管理（演示代辦）", "為保留四角色而設置；不代表監管人員依法兼任採購或財務。正式系統需獨立運營職責與授權。")
      + h.panel("平台收入與批准預算（合成）", funding, "20%僅為合成假設，非保費提列或全國政策；不執行付款。")
      + details("建立服務計畫草稿", newPlan) + plans + h.panel("委託預算台帳", ledger, "取消釋放但保留原記錄；驗收不等於付款。");
  }
  function editor(db, task) {
    return `<form data-campus-form="saveInspectionDraft" data-report-editor="${task.id}"><input type="hidden" name="taskId" value="${task.id}">
      <p>結果初始待錄入；文字可改。先保存草稿或主動載入混合示例，提交不會替未填項猜結果。</p>
      ${btn("載入合成示例（覆蓋草稿前確認）", "loadInspectionSample", `data-task-id="${task.id}"`)}
      ${task.draft.map((row, i) => {
        const def = C.DEFINITIONS[i];
        return `<fieldset data-check-id="${row.checkId}"><legend>${row.checkId} · ${e(def.title)}</legend><p class="muted">${e(def.basis)}；${e(def.boundary)}</p>
          <div class="form-row">${input("具體點位", `${row.checkId}.point`, row.point)}${select("檢查結果", `${row.checkId}.result`, [["", "待錄入"], ...C.RESULTS.map(value => [value, value])], row.result)}</div>
          ${area("觀察事實／不適用或未檢原因及補查安排", `${row.checkId}.fact`, row.fact)}
          <div class="form-row">${input("方法", `${row.checkId}.method`, row.method)}${input("檢查人", `${row.checkId}.checkedBy`, row.checkedBy)}${input("檢查日期", `${row.checkId}.checkedAt`, row.checkedAt, "date")}</div>
          ${input("合成證據索引（不是真實照片）", `${row.checkId}.evidence`, row.evidence)}
          <label>不適用確認人（只有不適用時必填）<input name="${row.checkId}.confirmedBy" value="${e(row.confirmedBy)}"></label>
          <label class="checkbox-label"><input type="checkbox" name="${row.checkId}.professional"${row.professional ? " checked" : ""}>需專業核查（僅用於已識別隱患）</label></fieldset>`;
      }).join("")}${note}<button class="button secondary" type="submit">保存草稿</button>
      <button class="button" type="submit" name="submitReport" value="yes">提交結構化報告</button></form>`;
  }
  function report(db, task, entry, actor, h) {
    if (!entry) return "";
    const counts = C.RESULTS.map(result => `${result}${entry.rows.filter(row => row.result === result).length}項`).join("／");
    const rows = entry.rows.map(row => [e(`${row.checkId} ${entry.checklist.find(def => def.id === row.checkId).title}`), e(row.point), status(row.result), e(row.fact),
      e(`${row.method}；${row.checkedBy}；${row.checkedAt}`), e(row.evidence), e(row.confirmedBy || "—")]);
    const acknowledgements = entry.acknowledgements.map(row => `${row.at} ${row.actorId}：${row.note}`).join("；") || "校方尚未收悉";
    return `<article class="print-report" id="report-${entry.id}"><h2>校園安全巡檢報告 ${e(entry.id)} v${entry.version}</h2>
      <p>合成演示報告，非正式安全合格證明。前版：${e(entry.previousId || "無")}</p>
      <p>學校／校區：${label(db, "schools", task.schoolId)}／${label(db, "campuses", task.campusId)}</p>
      <p>委託依據：${e(task.planId)} v${task.planSnapshot.version}；清單版本${e(entry.checklistVersion)}；約定：${e(task.planSnapshot.deliverables)}</p>
      <p>編製：${e(entry.preparedBy)}；審核：${e(entry.reviewedBy)}；提交日：${e(entry.submittedAt)}；統計日：${e(db.meta.businessDate)}</p>
      <p>範圍：${e(entry.scope)}。限制：${e(entry.limitation)}</p><p>${e(entry.summary)}</p><p>${e(counts)}</p>
      ${h.table(["項目", "點位", "結果", "事實／限制", "方法／人員／日期", "合成證據索引", "不適用確認"], rows)}
      <p>專業核查建議：${e(entry.rows.filter(row => row.professional).map(row => `${row.checkId} ${row.fact}`).join("；") || "本次未提出，不等於無風險")}</p>
      <p>收悉：${e(acknowledgements)}。簽收不等於承認法律責任。</p>${note}</article>
      ${actor.role === "school" && entry.id === task.reportId && task.status === "報告已提交" && !entry.acknowledgements.some(row => row.actorId === actor.id)
        ? btn("收悉此報告（非責任認定）", "acknowledgeReport", `data-task-id="${task.id}"`) : ""}
      ${btn("列印／另存PDF", "printReport", `data-report-id="${entry.id}"`)}`;
  }
  function hazardCard(db, actor, hazard, task, h) {
    let actions = "";
    const hidden = { hazardId: hazard.id };
    if (actor.role === "school" && actor.orgId === hazard.schoolId && hazard.status !== "已銷號") {
      if (hazard.status === "待確認") actions += form("confirmHazard",
        input("主責單位／聯絡人（合成）", "owner", "學校總務處／示例安全管理員")
        + input("協同單位（合成）", "collaborator", "示例維修服務單位")
        + input("確認整改期限", "dueDate", db.meta.businessDate, "date")
        + area("確認臨時措施及落實情況", "temporary", hazard.professional ? "已暫停使用球架並設隔離提示，安排專業核查。" : "已安排現場清理並保持通行。"),
        "確認責任及期限", hidden);
      if (hazard.status === "待整改") actions += form("rectifyHazard",
        area("整改措施（合成，可修改）", "note", hazard.professional ? "已完成專業核查要求的後續維修與復核，申請第三方複查。" : "已清理通道堆物並完成現場通行條件復核。")
        + input("整改證據索引（合成）", "evidence", `DEMO-${hazard.id}-整改示意，非真實證據`), "提交整改待複查", hidden);
      if (hazard.professional && hazard.status !== "待確認") actions += details("專業轉介與合成文件元資料",
        form("recordReferral", select("轉介狀態", "status", [["核查中", "核查中"], ["已取得結論", "已取得結論"]], hazard.referral.status === "待委託" ? "核查中" : hazard.referral.status)
          + input("專業單位（合成）", "organization", "示例專業核查機構（非真實機構）")
          + input("核查範圍，須含原項目ID", "scope", `${hazard.checkId}／${hazard.point}`)
          + input("文件索引（結論階段必填；非真實報告）", "document", `DEMO-${hazard.id}-專業處置示意`)
          + select("文件結論（不自動銷號）", "conclusion", [["符合本次處置要求", "符合本次處置要求"], ["不符合", "不符合"], ["無法判定", "無法判定"]]),
        "記錄專業轉介", hidden));
      if (hazard.status !== "待確認") actions += details("延期（保留原期限與理由）", form("extendHazard",
        input("延期至", "dueDate", "2026-12-01", "date") + area("理由", "reason", "合成延期：維修協調需追加安排；已持續落實臨時防護。"), "記錄延期與演示批准", hidden));
    }
    if (actor.role === "service" && actor.orgId === task.serviceProviderId && hazard.status === "待複查") {
      actions += form("recheckHazard", select("複查結論", "decision", [["pass", "通過"], ["return", "未通過，退回整改"], ["insufficient", "證據不足，保留待複查"]])
        + input("複查方式", "method", "合成現場復核及文件核對")
        + input("複查證據", "evidence", `DEMO-${hazard.id}-複查示意`)
        + area("複查理由", "note", "依原點位、整改措施及所需文件逐項核對；專業事項不以普通巡檢替代結論。"),
      `記錄複查（已用${hazard.rechecks.length}/${task.planSnapshot.rechecks}次）`, hidden);
    }
    return `<section class="hazard-card"><h3>${e(hazard.id)}／${e(hazard.checkId)} ${status(hazard.status)}</h3>
      <p><strong>原始事實：</strong>${e(hazard.fact)}</p><p>點位：${e(hazard.point)}；${e(hazard.basis)}</p>
      <p>業務優先級：${e(hazard.priority)}（非法定重大隱患認定）；告知：${e(hazard.notified)}</p>
      <p>臨時措施：${e(hazard.temporary)}；主責：${e(hazard.owner || "待校方確認")}；協同：${e(hazard.collaborator || "待確認")}</p>
      <p>原期限 ${e(hazard.originalDueDate)}／有效期限 ${e(hazard.dueDate)}；專業：${e(hazard.professional ? `${hazard.referral.status}／${hazard.referral.conclusion || "尚無可用結論"}` : "本項未要求")}</p>
      <p>整改：${e(hazard.rectificationNote || "待提交")}；${e(hazard.evidence)}</p>${actions}
      ${details("原始問題／整改／轉介／複查歷程", `<pre>${e(JSON.stringify(hazard.history, null, 2))}</pre>`)}</section>`;
  }
  function inspections(db, actor, h) {
    const filter = new URLSearchParams(global.location.hash.split("?")[1] || "").get("task");
    let tasks = C.taskVisible(db, actor);
    if (filter) tasks = tasks.filter(task => task.id === filter);
    const cards = tasks.map(task => {
      const plan = db.servicePlans.find(row => row.id === task.planId), entry = C.latestReport(db, task);
      const attrs = `data-task-id="${task.id}"`;
      let actions = "";
      if (C.manager(actor, plan) && task.status === "待接單") actions += btn("撤回待接任務", "cancelInspection", attrs);
      if (actor.role === "service" && task.status === "待接單") actions += btn("接受巡檢任務", "acceptInspection", attrs);
      if (actor.role === "service" && task.status === "執行中") actions += editor(db, task);
      if (actor.role === "service" && task.status === "報告已提交") actions += btn("更正／補查並出新版本", "amendReport", attrs);
      const acceptance = C.fieldAccepted(db, task);
      if (C.manager(actor, plan) && task.status === "報告已提交" && !acceptance) actions += `<section class="acceptance-callout">
        <h3>主管部門：驗收此現場報告</h3>
        <p>此區只在第三方已提交當前報告、且此版本尚未驗收時顯示。先在下拉欄選結論，再核對理由，最後按「提交現場報告驗收」。</p>
        ${form("acceptService",
          select("第1步：選擇現場交付驗收結論", "decision", [["", "請選擇結論"], ["pass", "通過現場及報告驗收"], ["return", "退回補正"]])
          + area("第2步：核對／填寫驗收理由", "note", "按委託範圍核對點位、報告完整性及未檢情況；驗收不代表隱患銷號或付款。"),
          "第3步：提交現場報告驗收", { taskId: task.id })}</section>`;
      const hazards = db.hazards.filter(row => row.taskId === task.id);
      return `<article class="task-card" data-task-card="${task.id}"><h2>任務編號 ${e(task.id)} · ${label(db, "campuses", task.campusId)}</h2>
        <p class="task-reference">角色切換後，請按這個 TASK 編號找回同一張任務卡；PLAN 是計畫編號，RPT 是報告編號，不要用它們搜尋任務。</p>
        <p>${status(task.status)} 現場交付：${status(acceptance ? "已驗收" : "未完整驗收")} 整包服務：${status(task.status === "已取消" ? "已撤回，預算釋放" : C.serviceComplete(db, task) ? "約定服務已履約（非風險清零）" : "尚有服務義務")}</p>
        <p>委託${e(task.planId)} v${task.planSnapshot.version}；保單${e(task.policyId || "不關聯，不影響計畫服務資格")}；預算${e(R.formatMoney(task.amount))}，未付款</p>
        <p>未銷號${hazards.filter(row => row.status !== "已銷號").length}項；現場到期${e(task.dueDate)}；每隱患複查上限${task.planSnapshot.rechecks}次；先通過則完成該項復查義務</p>
        ${actions}${entry ? details(`查看報告${entry.id} v${entry.version}`, report(db, task, entry, actor, h)) : ""}
        ${db.inspectionReports.filter(row => row.taskId === task.id && row.id !== task.reportId).map(row => details(`歷史報告${row.id} v${row.version}`, report(db, task, row, actor, h))).join("")}
        ${hazards.map(row => hazardCard(db, actor, row, task, h)).join("")}
        ${details("任務與驗收歷程", `<pre>${e(JSON.stringify({ history: task.history, acceptance: db.acceptances.filter(row => row.taskId === task.id) }, null, 2))}</pre>`)}</article>`;
    }).join("");
    const delegatedPlans = actor.role === "insurer" ? db.servicePlans.filter(plan => C.manager(actor, plan) && plan.status === "生效") : [];
    return h.pageHeading("校園巡檢、報告與整改", "依服務計畫派單；報告交付、約定履約、隱患銷號各自留痕。")
      + (actor.role === "regulator" ? `<a class="button" href="#/services">平台服務管理（演示代辦）</a>` : "")
      + delegatedPlans.map(plan => h.panel(`合同授權代辦 ${plan.id}`, form("createInspection", select("校區", "campusId",
        plan.campusIds.map(value => [value, db.campuses.find(row => row.id === value).name])), "按授權計畫派單", { planId: plan.id }))).join("")
      + (actor.role === "insurer" && !delegatedPlans.length ? "<p>目前無服務計畫代辦授權；有效保單本身不授予巡檢派單權。</p>" : "")
      + (filter ? '<p><a href="#/inspections">返回全部授權任務</a></p>' : "")
      + (cards || "<p class=\"empty-card\">目前沒有授權任務。平台依計畫安排服務，不能從有效保單直接生成。</p>");
  }
  function handleClick(target, commit) {
    const action = target.dataset.campusAction;
    if (!action) return false;
    if (action === "printReport") {
      const report = document.getElementById(`report-${target.dataset.reportId}`);
      if (!report) throw new Error("找不到報告列印範圍。");
      document.querySelectorAll(".print-selected").forEach(node => node.classList.remove("print-selected"));
      report.classList.add("print-selected");
      report.closest("details").open = true;
      for (let parent = report.parentElement; parent; parent = parent.parentElement) parent.classList.add("print-host");
      global.addEventListener("afterprint", () => {
        document.querySelectorAll(".print-selected,.print-host").forEach(node => node.classList.remove("print-selected", "print-host"));
      }, { once: true });
      global.print();
      return true;
    }
    if (action === "loadInspectionSample" && !global.confirm("載入合成示例會覆蓋此任務未保存及已保存草稿。是否繼續？")) return true;
    commit(action, { taskId: target.dataset.taskId, planId: target.dataset.planId, reportId: target.dataset.reportId });
    return true;
  }
  function handleForm(formNode, event, commit) {
    if (!formNode.dataset.campusForm) return false;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(formNode));
    let action = formNode.dataset.campusForm;
    if (formNode.dataset.reportEditor) {
      values.rows = C.DEFINITIONS.map(def => {
        const row = { checkId: def.id };
        ["point", "result", "fact", "method", "checkedBy", "checkedAt", "evidence", "confirmedBy"].forEach(key => { row[key] = values[`${def.id}.${key}`] || ""; });
        row.professional = values[`${def.id}.professional`] === "on";
        return row;
      });
      if (event.submitter?.name === "submitReport") action = "submitInspectionReport";
    }
    commit(action, values);
    return true;
  }
  global.SchoolDemoCampusPages = { metrics, gaps, services, inspections, handleClick, handleForm };
})(window);
