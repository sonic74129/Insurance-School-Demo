(function initSchoolDemoCampus(global) {
  "use strict";

  const clone = value => JSON.parse(JSON.stringify(value));
  const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
  const get = (db, list, id) => {
    const entry = db[list].find(row => row.id === id);
    requireThat(entry, `找不到${list}記錄：${id}`);
    return entry;
  };
  const text = (value, label, min = 2, max = 600) => {
    requireThat(typeof value === "string" && value.trim().length >= min && value.trim().length <= max, `${label}須為${min}至${max}字。`);
    return value.trim();
  };
  function date(value, label) {
    requireThat(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
      && new Date(value).toISOString().slice(0, 10) === value, `${label}日期無效。`);
    return value;
  }
  function number(value, label, min = 1) {
    const n = Number(value);
    requireThat(Number.isSafeInteger(n) && n >= min && n <= 100000000, `${label}須為${min}以上的整數。`);
    return n;
  }
  function id(db, list, prefix) {
    return `${prefix}-${db[list].reduce((max, row) => Math.max(max, Number(row.id.split("-").at(-1)) || 0), 1000) + 1}`;
  }
  const DEFINITIONS = [
    ["校舍圍牆", "校舍圍牆可見裂縫、傾斜與危險區域防護", "", "不判危房等級"],
    ["校舍圍牆", "雨棚外牆吊頂及懸掛物可見鬆脫", "", "不攀爬探查"],
    ["通行設施", "樓梯扶手護欄可見缺損", "", "不證明承載性能"],
    ["通行設施", "地面井蓋破損、濕滑與防護", "", "記錄具體點位"],
    ["消防疏散", "疏散通道及安全出口堆物、鎖閉", "", "非整體消防合格結論"],
    ["消防疏散", "滅火器消火栓缺失、遮擋與外觀", "", "不代替系統檢測"],
    ["消防疏散", "應急照明及疏散標志可見異常", "", "功能操作由授權人員執行"],
    ["消防疏散", "消防檢測維保與問題處置記錄", "", "資料核驗非本次性能檢測"],
    ["水電燃氣", "用電設施可見破損及不當使用", "", "不開櫃不帶電"],
    ["水電燃氣", "燃氣巡查維修及異常處置記錄", "gas", "不試漏不操作閥門"],
    ["特種設備", "特種設備登記、檢驗及維保資料", "lift", "週期按適用規則核驗"],
    ["體育設施", "跑道操場坑洞、翹邊與障礙", "", "不判材料性能"],
    ["體育設施", "球架等器材可見異常及停用措施", "", "疑點轉專業核查"],
    ["實驗室", "實驗室制度、標籤與試劑帳冊", "lab", "不開封未知試劑"],
    ["實驗室", "實驗廢棄物標識與移交記錄", "lab", "不自行處理洩漏或廢物"],
    ["食品安全", "食堂供餐資質、健康及採購追溯資料", "canteen", "不複製敏感名冊"],
    ["食品安全", "食品留樣、消毒、儲存記錄", "canteen", "依學段，不直接套高校"],
    ["住宿安全", "宿舍護欄、通道與夜間值班", "dorm", "避開學生隱私"],
    ["衛生急救", "飲水維護、水質報告與急救物資", "", "外觀不代水質檢驗"],
    ["校門交通", "校門人車、訪客與接送管理", "", "限本次觀察時段"],
    ["校車管理", "校車證照、隨車照管與交接資料", "bus", "適用範圍細則待核驗"],
    ["制度培訓", "安全責任、預案演練與歷史隱患整改", "", "有記錄不等於全員掌握"],
  ].map(([domain, title, facility, boundary], index) => ({
    id: `C${String(index + 1).padStart(2, "0")}`, version: "DEMO-2.0", domain, title, facility, boundary,
    basis: "產品演示建議；正式依據與技術閾值待目標地區核驗",
    method: index === 7 || index >= 13 ? "資料抽查及陪同觀察" : "目視檢查及資料核驗",
  }));
  const RESULTS = ["合格", "存在隱患", "不適用", "未檢查"];
  const COLLECTIONS = ["campuses", "funds", "servicePlans", "acceptances"];
  const ACTIONS = new Set(["createPlan", "updatePlan", "approvePlan", "activatePlan", "revisePlan", "createInspection", "cancelInspection",
    "acceptInspection", "saveInspectionDraft", "loadInspectionSample", "submitInspectionReport", "amendReport",
    "acknowledgeReport", "confirmHazard", "extendHazard", "recordReferral", "rectifyHazard", "recheckHazard", "acceptService"]);

  function authorized(db, actor, task) {
    const plan = get(db, "servicePlans", task.planId);
    return actor.role === "regulator"
      || (actor.role === "school" && actor.orgId === task.schoolId)
      || (actor.role === "service" && actor.orgId === plan.serviceProviderId)
      || (actor.role === "insurer" && actor.orgId === plan.authorizedInsurerId);
  }
  function manager(actor, plan) {
    return actor.role === "regulator" || (actor.role === "insurer" && plan.authorizedInsurerId === actor.orgId);
  }
  function history(db, entry, actor, action, detail) {
    entry.history ||= [];
    entry.history.push({ at: db.meta.businessDate, actorId: actor.id, action, detail: clone(detail) });
  }
  function draftFor(db, campusId) {
    const campus = get(db, "campuses", campusId);
    return DEFINITIONS.map(def => ({
      checkId: def.id, point: `${campus.name}／${def.domain}示例點位`, result: "",
      fact: def.facility && !campus.facilities.includes(def.facility) ? "合成資料：本校區沒有此項設施，請確認適用性。" : "合成記錄：已按本次方法觀察或抽查所列點位，詳見證據索引。",
      method: def.method, checkedBy: "示例巡檢專員", checkedAt: db.meta.businessDate,
      evidence: `DEMO-${campus.id}-${def.id}（合成示意索引，非真實照片或專業文件）`,
      professional: false, confirmedBy: "",
    }));
  }
  function sample(db, task) {
    const campus = get(db, "campuses", task.campusId);
    return draftFor(db, task.campusId).map((row, i) => {
      const def = DEFINITIONS[i];
      row.result = def.facility && !campus.facilities.includes(def.facility) ? "不適用" : "合格";
      if (row.result === "不適用") row.confirmedBy = "校方陪同人員（合成確認）";
      if (row.checkId === "C05") {
        row.result = "存在隱患"; row.fact = "合成現場：一層東側疏散通道有兩組課桌堆放，影響通行。";
      }
      if (row.checkId === "C13") {
        row.result = "存在隱患"; row.professional = true; row.fact = "合成現場：球架固定部位可見異常，已提示暫停使用，待專業核查。";
      }
      if (row.checkId === "C02") {
        row.result = "未檢查"; row.fact = "合成限制：雨棚區域維修暫未進入，安排補查後更新報告，不代表已排除風險。";
      }
      return row;
    });
  }
  function validateRows(rows, db, task, complete) {
    requireThat(Array.isArray(rows) && rows.length === DEFINITIONS.length, "應檢表必須保留全部22項。");
    const campus = get(db, "campuses", task.campusId);
    rows.forEach((row, i) => {
      const def = DEFINITIONS[i];
      requireThat(row && row.checkId === def.id, "檢查項缺漏、重複或順序不符。");
      requireThat(["", ...RESULTS].includes(row.result), "檢查結果無效。");
      ["point", "fact", "method", "checkedBy", "evidence"].forEach(key => text(row[key], key));
      date(row.checkedAt, "檢查");
      const plan = get(db, "servicePlans", task.planId);
      requireThat(row.checkedAt <= db.meta.businessDate && row.checkedAt >= plan.startDate && row.checkedAt <= plan.endDate, "檢查時間超出可用期間。");
      requireThat(typeof row.professional === "boolean", "專業核查標記無效。");
      if (complete) requireThat(row.result, `${def.id}尚待錄入，請選擇結果。`);
      if (row.result === "不適用") {
        requireThat(def.facility && !campus.facilities.includes(def.facility), "此項設施適用，不能以不適用跳過。");
        text(row.confirmedBy, "適用性確認人");
      }
      requireThat(!row.professional || row.result === "存在隱患", "專業轉介須關聯已識別的風險事項。");
    });
  }
  function snapshot(plan) {
    const copy = clone(plan);
    delete copy.versions;
    return copy;
  }
  function enrichSeed(db) {
    db.meta.scenarioName = "v2 保障、服務與整改分離";
    db.campuses = db.schools.map((school, index) => ({
      id: `CMP-${String(index + 1).padStart(3, "0")}`, schoolId: school.id, name: `${school.name}主校區`,
      facilities: index === 0 ? ["lab", "canteen", "dorm"] : ["canteen"],
    }));
    db.campuses.push({ id: "CMP-013", schoolId: "SCH-001", name: "青禾中學分校區", facilities: [] });
    db.funds = [{ id: "FUND-1001", source: "平台營業收入（合成；非保費／理賠款）", confirmedIncome: 100000,
      allocationRate: 0.2, allocationBasis: "DEMO-FUND-v2：20%僅為合成演示假設，非政策比例", allocated: 20000,
      approvedBudget: 12000, confirmed: true, approved: true, paymentStatus: "未付款" }];
    db.servicePlans = [{
      id: "PLAN-1001", version: 1, title: "平台秋季校園巡檢計畫（合成）", status: "生效",
      fundId: "FUND-1001", campusIds: ["CMP-001", "CMP-013", "CMP-005"], serviceProviderId: "SVC-01",
      authorizedInsurerId: "", policyId: "", startDate: "2026-10-01", endDate: "2026-12-31",
      checklistVersion: "DEMO-2.0",
      dueDate: "2026-10-20", visits: 1, rechecks: 1, unitBudget: 1200, budget: 3600,
      deliverables: "逐校區22項點位檢查、報告、缺檢補查及一次複查服務；非專業檢測",
      versions: [], history: [],
    }];
    db.servicePlans[0].versions.push(snapshot(db.servicePlans[0]));
    db.inspectionTasks = [];
    db.inspectionReports = [];
    db.hazards = [];
    db.serviceLedger = [];
    db.acceptances = [];
    db.policies.forEach(policy => {
      policy.purchaser = "示例學校自主採購";
      policy.policyholder = policy.schoolId; policy.insured = policy.schoolId; policy.payer = policy.schoolId;
    });
    const regulator = db.accounts.find(row => row.role === "regulator");
    const service = db.accounts.find(row => row.role === "service");
    const backgroundSchool = { id: "DEMO-SCHOOL-005", role: "school", orgId: "SCH-005" };
    run(db, regulator, "createInspection", { planId: "PLAN-1001", campusId: "CMP-005" });
    const task = db.inspectionTasks[0];
    run(db, service, "acceptInspection", { taskId: task.id });
    const rows = sample(db, task);
    rows.find(row => row.checkId === "C02").result = "合格";
    rows.find(row => row.checkId === "C02").fact = "合成背景：雨棚指定地面觀察點位未發現本項可見異常。";
    run(db, service, "submitInspectionReport", { taskId: task.id, rows });
    run(db, regulator, "acceptService", { taskId: task.id, decision: "pass", note: "合成背景：現場及報告已驗收，後續複查尚未履約。" });
    db.hazards.forEach(hazard => {
      run(db, backgroundSchool, "confirmHazard", { hazardId: hazard.id, owner: "合成背景學校總務處", collaborator: "示例維修單位",
        dueDate: "2026-10-20", temporary: "合成：已清理通道或隔離停用相關設施，持續落實防護。" });
      if (!hazard.professional) run(db, backgroundSchool, "rectifyHazard", {
        hazardId: hazard.id, note: "合成背景：已清理堆物並提請複查，尚未銷號。", evidence: "DEMO-BACKGROUND-整改索引（合成）",
      });
    });
    return db;
  }
  function validate(db) {
    const errors = [];
    try {
      for (const list of COLLECTIONS) {
        requireThat(Array.isArray(db[list]), `缺少${list}`);
        const ids = db[list].map(row => row?.id);
        requireThat(ids.every(value => typeof value === "string" && value) && new Set(ids).size === ids.length, `${list}識別碼無效`);
      }
      db.campuses.forEach(row => { get(db, "schools", row.schoolId); requireThat(Array.isArray(row.facilities), "校區設施無效"); });
      db.funds.forEach(fund => {
        requireThat(Number.isSafeInteger(fund.approvedBudget) && fund.approvedBudget >= 0
          && fund.approvedBudget <= fund.allocated && fund.allocated <= fund.confirmedIncome, "資金預算無效");
        requireThat(fund.paymentStatus === "未付款", "本演示不支援實際付款");
      });
      db.servicePlans.forEach(plan => {
        get(db, "funds", plan.fundId); get(db, "serviceProviders", plan.serviceProviderId);
        requireThat(["草稿", "已批准", "生效"].includes(plan.status) && Number.isSafeInteger(plan.version) && plan.version > 0, "計畫狀態／版本無效");
        requireThat(plan.checklistVersion === DEFINITIONS[0].version, "計畫清單版本無效");
        requireThat(Array.isArray(plan.campusIds) && plan.campusIds.length > 0 && new Set(plan.campusIds).size === plan.campusIds.length, "計畫校區無效");
        plan.campusIds.forEach(value => get(db, "campuses", value));
        if (plan.authorizedInsurerId) get(db, "insurers", plan.authorizedInsurerId);
        if (plan.policyId) {
          const policy = get(db, "policies", plan.policyId);
          requireThat(plan.campusIds.every(value => get(db, "campuses", value).schoolId === policy.schoolId), "保單和計畫校區不匹配");
        }
        date(plan.startDate, "開始"); date(plan.endDate, "結束"); date(plan.dueDate, "到期");
        requireThat(plan.startDate <= plan.dueDate && plan.dueDate <= plan.endDate, "計畫期間無效");
        ["visits", "unitBudget", "budget"].forEach(key => number(plan[key], key));
        number(plan.rechecks, "復查次數", 0);
        requireThat(plan.budget >= plan.unitBudget && Array.isArray(plan.versions), "計畫預算／快照無效");
      });
      db.funds.forEach(fund => {
        const reserved = db.servicePlans.filter(plan => plan.fundId === fund.id && plan.status !== "草稿").reduce((sum, plan) => sum + plan.budget, 0);
        requireThat(reserved <= fund.approvedBudget, "計畫批准總額超出預算");
      });
      db.inspectionTasks.forEach(task => {
        const plan = get(db, "servicePlans", task.planId), campus = get(db, "campuses", task.campusId);
        requireThat(plan.campusIds.includes(campus.id) && campus.schoolId === task.schoolId && task.serviceProviderId === plan.serviceProviderId, "任務範圍無效");
        requireThat(["待接單", "執行中", "報告已提交", "已取消"].includes(task.status), "任務狀態無效");
        requireThat(task.planSnapshot && task.planSnapshot.id === plan.id, "缺少委託快照");
        requireThat(task.planSnapshot.version === plan.version && task.amount === task.planSnapshot.unitBudget
          && task.planSnapshot.rechecks === plan.rechecks, "委託版本、金額或複查約定不匹配");
        if (task.reportId) requireThat(get(db, "inspectionReports", task.reportId).taskId === task.id, "任務引用其他報告");
        requireThat(Array.isArray(task.draft) && Array.isArray(task.history), "任務草稿／歷程無效");
        if (task.status !== "已取消") validateRows(task.draft, db, task, false);
      });
      db.servicePlans.forEach(plan => {
        const tasks = db.inspectionTasks.filter(task => task.planId === plan.id && task.status !== "已取消");
        requireThat(tasks.reduce((sum, task) => sum + task.amount, 0) <= plan.budget, "委託佔用超過計畫預算");
        plan.campusIds.forEach(campusId => requireThat(tasks.filter(task => task.campusId === campusId).length <= plan.visits, "委託超過現場次數"));
      });
      db.inspectionTasks.forEach(task => {
        const ledgers = db.serviceLedger.filter(entry => entry.taskId === task.id);
        requireThat(ledgers.length === 1 && ledgers[0].amount === task.amount
          && ledgers[0].status === (task.status === "已取消" ? "預算釋放・未付款" : "預算佔用・未付款"), "委託台帳或釋放狀態不一致");
      });
      db.inspectionReports.forEach(report => {
        const task = get(db, "inspectionTasks", report.taskId);
        requireThat(report.schoolId === task.schoolId && report.campusId === task.campusId, "報告校區無效");
        requireThat(report.checklistVersion === task.planSnapshot.checklistVersion && Array.isArray(report.checklist)
          && report.checklist.length === DEFINITIONS.length && report.checklist.every((row, i) => row.id === DEFINITIONS[i].id && row.version === report.checklistVersion), "報告清單快照無效");
        validateRows(report.rows, db, task, true);
        requireThat(Number.isSafeInteger(report.version) && report.version > 0, "報告版本無效");
      });
      db.inspectionTasks.forEach(task => {
        const reports = db.inspectionReports.filter(row => row.taskId === task.id).sort((a, b) => a.version - b.version);
        reports.forEach((row, i) => requireThat(row.version === i + 1 && row.previousId === (i ? reports[i - 1].id : null), "報告版本鏈無效"));
        requireThat(task.reportId === (reports.at(-1)?.id || null), "任務未引用最新報告版本");
        if (task.status === "報告已提交") requireThat(reports.length > 0, "報告已提交狀態缺少報告");
      });
      db.hazards.forEach(hazard => {
        const task = get(db, "inspectionTasks", hazard.taskId);
        const report = get(db, "inspectionReports", hazard.reportId);
        requireThat(report.taskId === task.id && report.rows.some(row => row.checkId === hazard.checkId && row.result === "存在隱患" && row.fact === hazard.fact), "隱患來源或原始事實無效");
        requireThat(task.schoolId === hazard.schoolId && ["待確認", "待整改", "待複查", "已銷號"].includes(hazard.status), "隱患狀態／關聯無效");
        date(hazard.originalDueDate, "原期限"); date(hazard.dueDate, "期限");
        requireThat(Array.isArray(hazard.history) && Array.isArray(hazard.rechecks), "缺少整改歷程");
        requireThat(hazard.rechecks.length <= task.planSnapshot.rechecks
          && hazard.rechecks.every(row => ["pass", "return", "insufficient"].includes(row.decision)), "複查超次數或結論無效");
        if (hazard.status === "已銷號") requireThat(hazard.rechecks.at(-1)?.decision === "pass" && professionalReady(hazard), "銷號缺少通過證據");
      });
      const hazardKeys = db.hazards.map(row => `${row.taskId}/${row.checkId}`);
      requireThat(new Set(hazardKeys).size === hazardKeys.length, "同一來源重複生成隱患");
      db.acceptances.forEach(entry => {
        const report = get(db, "inspectionReports", entry.reportId);
        requireThat(report.taskId === entry.taskId && ["通過", "退回補正"].includes(entry.result), "驗收關聯無效");
        if (entry.result === "通過") requireThat(report.rows.every(row => row.result !== "未檢查"), "未檢報告不能完整驗收");
      });
    } catch (error) { errors.push(error.message); }
    return errors;
  }
  function professionalReady(hazard) {
    return !hazard.professional || (hazard.referral.status === "已取得結論" && hazard.referral.conclusion === "符合本次處置要求"
      && Boolean(hazard.referral.document && hazard.referral.organization) && matchingScope(hazard.referral.scope, hazard.checkId));
  }
  function matchingScope(scope, checkId) { return typeof scope === "string" && new RegExp(`(^|[^A-Z0-9])${checkId}($|[^A-Z0-9])`).test(scope); }
  function latestReport(db, task) { return task.reportId ? get(db, "inspectionReports", task.reportId) : null; }
  function fieldAccepted(db, task) {
    return task.status === "報告已提交"
      && db.acceptances.some(entry => entry.taskId === task.id && entry.reportId === task.reportId && entry.result === "通過");
  }
  function serviceComplete(db, task) {
    if (!fieldAccepted(db, task)) return false;
    const hazards = db.hazards.filter(row => row.taskId === task.id);
    return hazards.every(row => row.status === "已銷號" || row.rechecks.length >= task.planSnapshot.rechecks);
  }
  function taskVisible(db, actor) { return db.inspectionTasks.filter(task => authorized(db, actor, task)); }
  function rowsOf(db) {
    return db.inspectionTasks.filter(task => task.status !== "已取消")
      .flatMap(task => task.status === "報告已提交" ? latestReport(db, task).rows : task.draft.map(row => ({ ...row, result: "" })));
  }
  function analytics(db) {
    const day = db.meta.businessDate;
    const plans = db.servicePlans.filter(plan => plan.status === "生效" && plan.startDate <= day && plan.endDate >= day);
    const expected = [...new Set(plans.flatMap(plan => plan.campusIds))];
    const covered = expected.filter(campusId => plans.filter(plan => plan.campusIds.includes(campusId)).every(plan =>
      db.inspectionTasks.filter(task => task.planId === plan.id && task.campusId === campusId && fieldAccepted(db, task)).length >= plan.visits));
    const schools = [...new Set(expected.map(value => get(db, "campuses", value).schoolId))];
    const fullyCovered = schools.filter(schoolId => expected.filter(value => get(db, "campuses", value).schoolId === schoolId).every(value => covered.includes(value)));
    const rows = rowsOf(db), applicable = rows.filter(row => row.result !== "不適用");
    const dueTasks = db.inspectionTasks.filter(task => task.status !== "已取消" && task.dueDate <= day);
    const gaps = [];
    expected.filter(value => !covered.includes(value)).forEach(value => {
      const campus = get(db, "campuses", value);
      const overdue = plans.some(plan => plan.campusIds.includes(value) && plan.dueDate < day
        && db.inspectionTasks.filter(task => task.planId === plan.id && task.campusId === value && fieldAccepted(db, task)).length < plan.visits);
      gaps.push({ type: overdue ? "計畫到期未完成現場覆蓋" : "應檢校區未完整驗收", schoolId: campus.schoolId, campusId: value, taskId: "", detail: campus.name });
    });
    db.inspectionTasks.filter(task => task.status !== "已取消").forEach(task => {
      const records = task.status === "報告已提交" ? latestReport(db, task).rows : task.draft.map(row => ({ ...row, result: "" }));
      records.filter(row => !row.result || row.result === "未檢查").forEach(row =>
        gaps.push({ type: row.result ? "明確未檢" : "草稿未提交／待錄入", schoolId: task.schoolId, campusId: task.campusId, taskId: task.id, detail: `${row.checkId} ${row.point}：${row.fact}` }));
    });
    db.hazards.filter(row => row.status !== "已銷號").forEach(hazard => {
      if (hazard.dueDate < day) gaps.push({ type: "逾期未銷號", schoolId: hazard.schoolId, taskId: hazard.taskId, detail: `${hazard.id} ${hazard.fact}` });
      if (hazard.status === "待複查") gaps.push({ type: "待複查", schoolId: hazard.schoolId, taskId: hazard.taskId, detail: hazard.id });
      if (hazard.professional && (!professionalReady(hazard) || hazard.status !== "已銷號")) gaps.push({ type: "專業轉介／後續處置待辦", schoolId: hazard.schoolId, taskId: hazard.taskId, detail: `${hazard.id} ${hazard.referral.status}` });
    });
    return { expected: expected.length, covered: covered.length, schools: schools.length, fullyCovered: fullyCovered.length,
      missing: rows.filter(row => !row.result).length, unchecked: rows.filter(row => row.result === "未檢查").length,
      applicable: applicable.length, checked: rows.filter(row => ["合格", "存在隱患"].includes(row.result)).length,
      due: dueTasks.length, completedDue: dueTasks.filter(task => fieldAccepted(db, task)).length,
      overdue: db.hazards.filter(row => row.status !== "已銷號" && row.dueDate < day).length,
      originalOverdue: db.hazards.filter(row => row.status !== "已銷號" && row.originalDueDate < day).length,
      awaiting: db.hazards.filter(row => row.status === "待複查").length, gaps };
  }
  function run(db, actor, action, payload) {
    let targetId = "", message = "";
    const day = db.meta.businessDate;
    const taskFor = () => {
      const task = get(db, "inspectionTasks", payload.taskId);
      requireThat(authorized(db, actor, task), "無權操作此任務。");
      return task;
    };
    const serviceTask = () => {
      const task = taskFor();
      requireThat(actor.role === "service" && actor.orgId === task.serviceProviderId, "只有受託服務機構可操作。");
      return task;
    };
    const hazardFor = () => {
      const hazard = get(db, "hazards", payload.hazardId);
      const task = get(db, "inspectionTasks", hazard.taskId);
      requireThat(authorized(db, actor, task), "無權操作此隱患。");
      return { hazard, task };
    };
    switch (action) {
      case "createPlan": {
        requireThat(actor.role === "regulator", "只有平台演示代辦可建立計畫。");
        const campusIds = Array.isArray(payload.campusIds) ? payload.campusIds : [payload.campusId];
        requireThat(campusIds.length && new Set(campusIds).size === campusIds.length, "請選擇不重複的校區。");
        campusIds.forEach(value => get(db, "campuses", value));
        const plan = { id: id(db, "servicePlans", "PLAN"), version: 1, title: text(payload.title, "計畫名稱"),
          status: "草稿", fundId: payload.fundId || "FUND-1001", campusIds, serviceProviderId: "SVC-01",
          authorizedInsurerId: payload.authorizedInsurerId || "", policyId: payload.policyId || "",
          checklistVersion: "DEMO-2.0",
          startDate: date(payload.startDate, "開始"), endDate: date(payload.endDate, "結束"), dueDate: date(payload.dueDate, "到期"),
          visits: number(payload.visits, "現場次數"), rechecks: number(payload.rechecks, "復查次數", 0),
          unitBudget: number(payload.unitBudget, "單次預算"), budget: number(payload.budget, "總預算"),
          deliverables: text(payload.deliverables, "交付要求"), versions: [], history: [] };
        db.servicePlans.unshift(plan); targetId = plan.id; message = "服務計畫草稿已建立。"; break;
      }
      case "revisePlan": {
        requireThat(actor.role === "regulator", "只有平台演示代辦可建立後繼版本。");
        const previous = get(db, "servicePlans", payload.planId);
        requireThat(previous.status !== "草稿", "草稿尚無凍結版本。");
        const next = clone(previous);
        next.id = id(db, "servicePlans", "PLAN"); next.previousPlanId = previous.id; next.version++;
        next.status = "草稿"; next.title += "（後繼草稿）"; next.history = []; next.versions = [];
        db.servicePlans.unshift(next); targetId = next.id; message = "已建立後繼草稿；原計畫與任務不變，批准仍需獨立預算。"; break;
      }
      case "updatePlan": {
        requireThat(actor.role === "regulator", "只有平台演示代辦可修改草稿。");
        const plan = get(db, "servicePlans", payload.planId);
        requireThat(plan.status === "草稿", "批准後不可覆寫，請建立後繼版本。");
        plan.title = text(payload.title, "計畫名稱");
        plan.deliverables = text(payload.deliverables, "交付要求");
        plan.budget = number(payload.budget, "總預算");
        plan.unitBudget = number(payload.unitBudget, "單次預算");
        plan.visits = number(payload.visits, "現場次數");
        plan.rechecks = number(payload.rechecks, "復查上限", 0);
        plan.startDate = date(payload.startDate, "開始"); plan.endDate = date(payload.endDate, "結束"); plan.dueDate = date(payload.dueDate, "到期");
        history(db, plan, actor, action, "更新未批准草稿");
        targetId = plan.id; message = "草稿已更新，批准後凍結。"; break;
      }
      case "approvePlan":
      case "activatePlan": {
        requireThat(actor.role === "regulator", "只有平台演示代辦可批准／生效。");
        const plan = get(db, "servicePlans", payload.planId), fund = get(db, "funds", plan.fundId);
        requireThat(fund.confirmed && fund.approved, "收入及預算尚未確認批准。");
        requireThat(plan.status === (action === "approvePlan" ? "草稿" : "已批准"), "計畫狀態不允許此操作。");
        plan.status = action === "approvePlan" ? "已批准" : "生效";
        plan.versions.push(snapshot(plan)); history(db, plan, actor, action, "平台服務演示代辦");
        targetId = plan.id; message = `計畫已${plan.status}，版本凍結。`; break;
      }
      case "createInspection": {
        const plan = get(db, "servicePlans", payload.planId);
        const fund = get(db, "funds", plan.fundId);
        requireThat(manager(actor, plan), "沒有此計畫的派單授權，承保關係不等於授權。");
        requireThat(fund.confirmed && fund.approved, "收入或預算尚未確認批准，不能分配新委託。");
        requireThat(plan.status === "生效" && plan.startDate <= day && plan.endDate >= day, "計畫未生效或不在服務期間。");
        requireThat(plan.campusIds.includes(payload.campusId), "校區不在委託範圍。");
        const campus = get(db, "campuses", payload.campusId), tasks = db.inspectionTasks.filter(task => task.planId === plan.id && task.status !== "已取消");
        requireThat(tasks.filter(task => task.campusId === campus.id).length < plan.visits, "此校區超過現場次數。");
        requireThat(!db.inspectionTasks.some(task => task.campusId === campus.id && task.status !== "已取消" && !serviceComplete(db, task)), "此校區已有未完成服務委託。");
        requireThat(tasks.reduce((sum, task) => sum + task.amount, 0) + plan.unitBudget <= plan.budget, "計畫預算不足。");
        const task = { id: id(db, "inspectionTasks", "TASK"), planId: plan.id, planSnapshot: snapshot(plan),
          campusId: campus.id, schoolId: campus.schoolId, serviceProviderId: plan.serviceProviderId,
          policyId: plan.policyId || null, insurerId: plan.authorizedInsurerId || null,
          title: plan.title, status: "待接單", createdAt: day, dueDate: plan.dueDate, amount: plan.unitBudget,
          reportId: null, draft: draftFor(db, campus.id), history: [] };
        db.inspectionTasks.unshift(task);
        db.serviceLedger.unshift({ id: id(db, "serviceLedger", "LED"), taskId: task.id, source: "平台營業收入安排之批准預算（合成）",
          amount: task.amount, status: "預算佔用・未付款", note: `委託${plan.id} v${plan.version}；與保費及理賠款分離` });
        targetId = task.id; message = "已依服務計畫派單；不要求有效保單。"; break;
      }
      case "cancelInspection": {
        const task = taskFor(), plan = get(db, "servicePlans", task.planId);
        requireThat(manager(actor, plan) && task.status === "待接單", "只有授權代辦可撤回待接單委託。");
        task.status = "已取消";
        get(db, "serviceLedger", db.serviceLedger.find(row => row.taskId === task.id).id).status = "預算釋放・未付款";
        history(db, task, actor, action, "保留取消與釋放記錄");
        targetId = task.id; message = "已撤回，次數與預算已釋放。"; break;
      }
      case "acceptInspection": {
        const task = serviceTask(); requireThat(task.status === "待接單", "此任務不能接單。");
        task.status = "執行中"; history(db, task, actor, action, "接單");
        targetId = task.id; message = "已接單，檢查結果仍待錄入。"; break;
      }
      case "loadInspectionSample":
      case "saveInspectionDraft": {
        const task = serviceTask(); requireThat(task.status === "執行中", "只有執行中可修改草稿。");
        const rows = action === "loadInspectionSample" ? sample(db, task) : clone(payload.rows);
        validateRows(rows, db, task, false); task.draft = rows;
        history(db, task, actor, action, "合成草稿，尚未提交");
        targetId = task.id; message = action === "loadInspectionSample" ? "已載入混合合成示例，請確認後提交。" : "檢查草稿已保存。"; break;
      }
      case "submitInspectionReport": {
        const task = serviceTask(); requireThat(task.status === "執行中", "報告已提交，請用更正流程。");
        const rows = payload.rows ? clone(payload.rows) : clone(task.draft);
        validateRows(rows, db, task, true);
        const previous = latestReport(db, task);
        const report = { id: id(db, "inspectionReports", "RPT"), version: previous ? previous.version + 1 : 1,
          previousId: previous?.id || null, taskId: task.id, schoolId: task.schoolId, campusId: task.campusId,
          submittedAt: day, preparedBy: actor.id, reviewedBy: text(payload.reviewedBy || "示例服務機構審核人", "審核人"),
          checklistVersion: task.planSnapshot.checklistVersion, checklist: clone(DEFINITIONS),
          scope: `${get(db, "campuses", task.campusId).name}／22項指定示例點位，非全校安全保證`,
          limitation: "目視與資料抽查；未檢項另列；非結構鑑定、消防性能或法定設備檢驗。",
          summary: text(payload.summary || "本次依委託完成所列點位檢查，結果僅限本次時間、區域和方法。", "報告摘要"),
          rows, acknowledgements: [], synthetic: true };
        db.inspectionReports.unshift(report); task.reportId = report.id; task.draft = clone(rows); task.status = "報告已提交";
        rows.filter(row => row.result === "存在隱患").forEach(row => {
          const existing = db.hazards.find(hazard => hazard.taskId === task.id && hazard.checkId === row.checkId);
          if (existing) {
            if (row.professional && !existing.professional) {
              existing.professional = true;
              if (existing.status === "已銷號") existing.status = "待整改";
              history(db, existing, actor, "更正追加專業需求", { reportId: report.id, fact: row.fact });
            }
            return;
          }
          db.hazards.unshift({ id: id(db, "hazards", "HAZ"), taskId: task.id, checkId: row.checkId, reportId: report.id,
            schoolId: task.schoolId, campusId: task.campusId, fact: row.fact, description: row.fact, point: row.point,
            basis: DEFINITIONS.find(def => def.id === row.checkId).basis, status: "待確認",
            priority: row.professional ? "優先處理" : "常規處理", professional: row.professional,
            notified: "合成：已向校方陪同人員提示；收悉不等於承認法律責任",
            temporary: row.professional ? "建議暫停使用並隔離，待學校確認落實" : "建議立即清理及保持通行",
            originalDueDate: day, dueDate: day, owner: "", collaborator: "", rectificationNote: "", evidence: "",
            referral: { status: "待委託", conclusion: "", document: "", organization: "", scope: "" },
            rechecks: [], history: [] });
        });
        history(db, task, actor, action, { reportId: report.id, version: report.version });
        targetId = task.id; message = `報告v${report.version}已提交；隱患依檢查結果建立，未檢項仍待補查。`; break;
      }
      case "amendReport": {
        const task = serviceTask(); requireThat(task.status === "報告已提交", "尚無可更正報告。");
        task.status = "執行中"; history(db, task, actor, action, "保留原報告快照與隱患，更正後須重新驗收");
        targetId = task.id; message = "已開啟更正草稿，原版本不變。"; break;
      }
      case "acknowledgeReport": {
        const task = taskFor(); requireThat(actor.role === "school" && actor.orgId === task.schoolId, "只有本校可收悉。");
        const report = latestReport(db, task); requireThat(report && task.status === "報告已提交", "當前報告尚未提交或正在更正。");
        requireThat(!report.acknowledgements.some(row => row.actorId === actor.id), "此版本已收悉。");
        report.acknowledgements.push({ at: day, actorId: actor.id, note: "僅收悉，不代表承認法律責任" });
        targetId = task.id; message = "已記錄報告收悉。"; break;
      }
      case "confirmHazard":
      case "extendHazard":
      case "recordReferral":
      case "rectifyHazard": {
        const { hazard, task } = hazardFor();
        requireThat(actor.role === "school" && actor.orgId === task.schoolId, "只有本校可確認及提交整改。");
        requireThat(hazard.status !== "已銷號", "此問題已銷號，不可覆寫。");
        if (action === "confirmHazard") {
          requireThat(hazard.status === "待確認", "責任與期限已確認。");
          hazard.owner = text(payload.owner, "主責單位／人員"); hazard.collaborator = String(payload.collaborator || "");
          hazard.temporary = text(payload.temporary, "臨時措施");
          hazard.dueDate = date(payload.dueDate, "整改期限"); hazard.originalDueDate = hazard.dueDate; hazard.status = "待整改";
        } else if (action === "extendHazard") {
          requireThat(hazard.status !== "待確認", "請先確認責任及期限。");
          const newDate = date(payload.dueDate, "延期");
          requireThat(newDate > hazard.dueDate, "延期日期須晚於目前期限。");
          history(db, hazard, actor, "延期申請及演示批准", { previous: hazard.dueDate, next: newDate, reason: text(payload.reason, "延期理由") });
          hazard.dueDate = newDate;
        } else if (action === "recordReferral") {
          requireThat(hazard.professional && hazard.status !== "待確認", "此項尚未確認或不需專業轉介。");
          requireThat(["核查中", "已取得結論"].includes(payload.status), "轉介狀態無效。");
          const referral = { status: payload.status, organization: text(payload.organization, "專業單位（合成）"),
            scope: text(payload.scope, "核查範圍"), document: "", conclusion: "" };
          requireThat(matchingScope(referral.scope, hazard.checkId), `核查範圍須包含對應項目${hazard.checkId}。`);
          if (payload.status === "已取得結論") {
            referral.document = text(payload.document, "文件索引");
            requireThat(["符合本次處置要求", "不符合", "無法判定"].includes(payload.conclusion), "專業結論無效。");
            referral.conclusion = payload.conclusion;
          }
          hazard.referral = referral;
        } else {
          requireThat(hazard.status === "待整改", "請先確認責任，或等待複查。");
          hazard.rectificationNote = text(payload.note, "整改說明", 5);
          hazard.evidence = text(payload.evidence, "整改證據索引");
          hazard.status = "待複查";
        }
        history(db, hazard, actor, action, payload);
        targetId = hazard.id; message = "已追加學校處理記錄；未自動銷號。"; break;
      }
      case "recheckHazard": {
        const { hazard, task } = hazardFor();
        requireThat(actor.role === "service" && actor.orgId === task.serviceProviderId && hazard.status === "待複查", "只有受託機構可複查已提交的整改。");
        requireThat(["pass", "return", "insufficient"].includes(payload.decision), "複查決定無效。");
        requireThat(hazard.rechecks.length < task.planSnapshot.rechecks, "約定複查次數已用完，需後續服務計畫，不能無限次履約。");
        if (payload.decision === "pass") requireThat(professionalReady(hazard), "缺少符合範圍及要求的專業結論，不能銷號。");
        const recheck = { at: day, actorId: actor.id, decision: payload.decision, method: text(payload.method, "複查方式"),
          evidence: text(payload.evidence, "複查證據"), note: text(payload.note, "複查理由") };
        hazard.rechecks.push(recheck);
        hazard.status = payload.decision === "pass" ? "已銷號" : payload.decision === "return" ? "待整改" : "待複查";
        history(db, hazard, actor, action, recheck);
        targetId = hazard.id; message = "已追加複查記錄；服務履約與整改結果分開。"; break;
      }
      case "acceptService": {
        const task = taskFor(), plan = get(db, "servicePlans", task.planId), report = latestReport(db, task);
        requireThat(manager(actor, plan) && task.status === "報告已提交" && report, "只有授權代辦可驗收已提交報告。");
        requireThat(["pass", "return"].includes(payload.decision), "驗收決定無效。");
        requireThat(!fieldAccepted(db, task), "此版本已通過現場驗收。");
        if (payload.decision === "pass") requireThat(report.rows.every(row => row.result && row.result !== "未檢查"), "仍有未檢／缺失，請補查並更正報告後再完整驗收。");
        db.acceptances.unshift({ id: id(db, "acceptances", "ACC"), taskId: task.id, reportId: report.id, stage: "現場檢查及報告",
          result: payload.decision === "pass" ? "通過" : "退回補正", at: day, actorId: actor.id,
          note: text(payload.note, "驗收理由"), agent: actor.role === "regulator" ? "平台服務演示代辦" : "合同授權代辦" });
        targetId = task.id; message = "現場交付驗收已記錄；不自動消除隱患或付款。"; break;
      }
      default: throw new Error("不支援的校園安全操作。");
    }
    return { message, targetId };
  }
  global.SchoolDemoCampus = { DEFINITIONS, RESULTS, ACTIONS, enrichSeed, validate, run, authorized, manager, draftFor,
    sample, analytics, taskVisible, latestReport, fieldAccepted, serviceComplete, professionalReady };
})(window);
