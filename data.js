(function initSchoolDemoData(global) {
  "use strict";

  const STORAGE_KEY = "school-liability-demo-v2";
  const SESSION_KEY = "school-liability-demo-account-v2";
  const BUSINESS_DATE = "2026-10-25";

  const REGIONS = [
    { id: "R01", name: "省會示例區" },
    { id: "R02", name: "東部示例區" },
    { id: "R03", name: "西部示例區" },
    { id: "R04", name: "南部示例區" },
  ];

  const SCHOOL_ROWS = [
    ["SCH-001", "青禾中學", "R01", "中學", 1280],
    ["SCH-002", "明德小學", "R01", "小學", 860],
    ["SCH-003", "向陽實驗學校", "R02", "九年一貫", 1540],
    ["SCH-004", "星河中學", "R02", "中學", 1120],
    ["SCH-005", "松林小學", "R03", "小學", 730],
    ["SCH-006", "遠山中心學校", "R03", "完全中學", 640],
    ["SCH-007", "海風中學", "R04", "中學", 980],
    ["SCH-008", "晨光幼兒園", "R04", "幼兒園", 320],
    ["SCH-009", "新橋小學", "R01", "小學", 910],
    ["SCH-010", "文昌學校", "R02", "九年一貫", 1370],
    ["SCH-011", "育才中學", "R03", "中學", 1050],
    ["SCH-012", "山海幼兒園", "R04", "幼兒園", 280],
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createSeed() {
    const schools = SCHOOL_ROWS.map(([id, name, regionId, schoolType, studentCount]) => ({
      id,
      name: `示例・${name}`,
      regionId,
      schoolType,
      studentCount,
      requiredForDemo: true,
    }));

    const insurers = [
      { id: "INS-01", name: "示例保險機構甲", shortName: "保險甲" },
      { id: "INS-02", name: "示例保險機構乙", shortName: "保險乙" },
      { id: "INS-03", name: "示例保險機構丙", shortName: "保險丙" },
    ];

    const products = [
      { id: "PRD-01", insurerId: "INS-01", name: "校園責任綜合方案", version: "Demo-1", limitPerPerson: 500000, limitAggregate: 5000000, estimatePerStudent: 18, services: ["校園安全巡檢", "風險建議"] },
      { id: "PRD-02", insurerId: "INS-01", name: "校園責任基礎方案", version: "Demo-1", limitPerPerson: 300000, limitAggregate: 3000000, estimatePerStudent: 13, services: ["線上風險諮詢"] },
      { id: "PRD-03", insurerId: "INS-02", name: "學校綜合保障方案", version: "Demo-2", limitPerPerson: 500000, limitAggregate: 6000000, estimatePerStudent: 19, services: ["校園安全巡檢", "隱患整改建議"] },
      { id: "PRD-04", insurerId: "INS-02", name: "幼兒園安全保障方案", version: "Demo-1", limitPerPerson: 400000, limitAggregate: 4000000, estimatePerStudent: 16, services: ["幼兒園專項巡檢"] },
      { id: "PRD-05", insurerId: "INS-03", name: "校園安心責任方案", version: "Demo-1", limitPerPerson: 600000, limitAggregate: 6000000, estimatePerStudent: 22, services: ["校園安全巡檢", "安全培訓"] },
      { id: "PRD-06", insurerId: "INS-03", name: "校園責任普惠方案", version: "Demo-1", limitPerPerson: 300000, limitAggregate: 2500000, estimatePerStudent: 12, services: ["線上安全指引"] },
    ];

    const accounts = [
      { id: "ACC-REG", username: "regulator", password: "demo123", name: "省級教育監管員", role: "regulator", orgId: "EDU-PROV", organization: "省級教育主管部門" },
      { id: "ACC-INS", username: "insurer", password: "demo123", name: "保險核保經理", role: "insurer", orgId: "INS-01", organization: insurers[0].name },
      { id: "ACC-SVC", username: "service", password: "demo123", name: "巡檢服務專員", role: "service", orgId: "SVC-01", organization: "示例校園安全服務機構" },
      { id: "ACC-SCH", username: "school", password: "demo123", name: "青禾中學安全管理員", role: "school", orgId: "SCH-001", organization: schools[0].name },
    ];

    const policies = [
      ["POL-1001", "SCH-003", "INS-01", "PRD-01"],
      ["POL-1002", "SCH-004", "INS-01", "PRD-02"],
      ["POL-1003", "SCH-005", "INS-01", "PRD-01"],
      ["POL-1004", "SCH-006", "INS-02", "PRD-03"],
      ["POL-1005", "SCH-007", "INS-02", "PRD-04"],
      ["POL-1006", "SCH-008", "INS-03", "PRD-05"],
    ].map(([id, schoolId, insurerId, productId], index) => ({
      id,
      policyNo: `DEMO-POL-${String(index + 1).padStart(4, "0")}`,
      schoolId,
      insurerId,
      productId,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "有效",
      synthetic: true,
    }));

    const seed = {
      schemaVersion: 2,
      meta: {
        profile: "school-liability",
        scenarioId: "baseline",
        scenarioName: "校園保障基準場景",
        businessDate: BUSINESS_DATE,
        eventSequence: 0,
      },
      regions: clone(REGIONS),
      schools,
      insurers,
      products,
      serviceProviders: [{ id: "SVC-01", name: "示例校園安全服務機構" }],
      accounts,
      applications: [{
        id: "APP-1001",
        schoolId: "SCH-002",
        insurerId: "INS-01",
        productId: "PRD-01",
        studentCount: 860,
        estimatedPremium: 15480,
        submittedAt: "2026-10-20",
        status: "待核保",
        notes: "合成樣例：等待保險機構核保。",
      }],
      policies,
      inspectionTasks: [],
      inspectionReports: [],
      hazards: [],
      claims: [{
        id: "CLM-1001",
        policyId: "POL-1002",
        schoolId: "SCH-004",
        insurerId: "INS-01",
        incidentDate: "2026-10-10",
        incidentType: "校園活動傷害（合成案例）",
        description: "合成樣例，不含真實學生或事故資料。",
        status: "查勘中",
        reportedAt: "2026-10-11",
        events: [{ at: "2026-10-11", status: "待受理", note: "學校提交合成報案。" }, { at: "2026-10-13", status: "查勘中", note: "保險機構更新演示進度。" }],
      }],
      serviceLedger: [],
      auditLogs: [{
        id: "AUD-1001",
        at: "2026-10-25",
        actorId: "SYSTEM",
        actorRole: "system",
        action: "載入合成基準資料",
        entityId: "baseline",
      }],
    };
    return global.SchoolDemoCampus.enrichSeed(seed);
  }

  function validate(db) {
    const errors = [];
    if (!db || db.schemaVersion !== 2 || db.meta?.profile !== "school-liability") return ["資料版本或業務範圍不相容"];
    const collections = ["schools", "regions", "serviceProviders", "insurers", "products", "accounts", "applications", "policies", "inspectionTasks", "inspectionReports", "hazards", "claims", "serviceLedger", "auditLogs"];
    for (const name of collections) {
      if (!Array.isArray(db[name])) {
        errors.push(`缺少資料集合：${name}`);
        continue;
      }
      const ids = db[name].map(item => item?.id);
      if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) errors.push(`${name} 存在無效或重複 ID`);
    }
    if (errors.length) return errors;

    const has = (collection, id) => db[collection].some(item => item.id === id);
    db.products.forEach(item => {
      if (!has("insurers", item.insurerId)) errors.push(`產品 ${item.id} 找不到保險機構`);
    });
    db.applications.forEach(item => {
      if (!has("schools", item.schoolId) || !has("insurers", item.insurerId) || !has("products", item.productId)) errors.push(`投保申請 ${item.id} 關聯無效`);
    });
    db.policies.forEach(item => {
      if (!has("schools", item.schoolId) || !has("insurers", item.insurerId) || !has("products", item.productId) || item.startDate > item.endDate) errors.push(`保單 ${item.id} 關聯或期間無效`);
    });
    db.inspectionTasks.forEach(item => {
      if (!has("schools", item.schoolId) || !db.serviceProviders.some(provider => provider.id === item.serviceProviderId)) errors.push(`巡檢任務 ${item.id} 關聯無效`);
      if (item.reportId && !has("inspectionReports", item.reportId)) errors.push(`巡檢任務 ${item.id} 找不到報告`);
    });
    db.inspectionReports.forEach(item => {
      if (!db.inspectionTasks.some(task => task.id === item.taskId && task.schoolId === item.schoolId)) errors.push(`巡檢報告 ${item.id} 關聯無效`);
    });
    db.hazards.forEach(item => {
      if (!db.inspectionTasks.some(task => task.id === item.taskId && task.schoolId === item.schoolId)) errors.push(`隱患 ${item.id} 關聯無效`);
    });
    db.claims.forEach(item => {
      if (!db.policies.some(policy => policy.id === item.policyId && policy.schoolId === item.schoolId && policy.insurerId === item.insurerId)) errors.push(`理賠案件 ${item.id} 關聯無效`);
      if (!Array.isArray(item.events)) errors.push(`理賠案件 ${item.id} 缺少進度歷程`);
    });
    db.serviceLedger.forEach(item => {
      if (!has("inspectionTasks", item.taskId) || !Number.isFinite(item.amount) || item.amount < 0) errors.push(`服務台帳 ${item.id} 無效`);
    });
    return errors.concat(global.SchoolDemoCampus.validate(db));
  }

  function load() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacy = global.localStorage.getItem("school-liability-demo-v1");
        return { db: createSeed(), warning: `${legacy ? "偵測到v1存檔，原資料保留且不會改寫。" : ""}請明確啟用v2合成演示場景；不會把舊文字報告補造為檢查證據。`, blocked: true };
      }
      const db = JSON.parse(raw);
      const errors = validate(db);
      if (errors.length) throw new Error(errors.join("；"));
      return { db, warning: null, blocked: false };
    } catch (error) {
      return {
        db: createSeed(),
        warning: `本機資料無法載入：${error.message}。目前只顯示暫存樣例；請明確重設演示資料後再操作。`,
        blocked: true,
      };
    }
  }

  function save(db) {
    const errors = validate(db);
    if (errors.length) throw new Error(errors.join("；"));
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  global.SchoolDemoData = {
    STORAGE_KEY,
    SESSION_KEY,
    BUSINESS_DATE,
    REGIONS,
    clone,
    createSeed,
    validate,
    load,
    save,
  };
})(window);
