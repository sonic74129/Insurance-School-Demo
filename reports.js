(function initSchoolDemoReports(global) {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function lookup(db, collection, id, field = "name") {
    return db[collection].find(item => item.id === id)?.[field] || "資料未對應";
  }

  function activePolicies(db) {
    return db.policies.filter(policy => policy.status === "有效"
      && policy.startDate <= db.meta.businessDate
      && policy.endDate >= db.meta.businessDate);
  }

  function policyForSchool(db, schoolId) {
    return activePolicies(db).find(policy => policy.schoolId === schoolId) || null;
  }

  function metrics(db) {
    const coveredSchoolIds = new Set(activePolicies(db).map(policy => policy.schoolId));
    const unresolvedHazards = db.hazards.filter(hazard => hazard.status !== "已銷號");
    const openClaims = db.claims.filter(claim => !["已結案", "未予受理"].includes(claim.status));
    const coverageRate = db.schools.length ? coveredSchoolIds.size / db.schools.length : 0;
    return {
      schoolCount: db.schools.length,
      coveredSchoolCount: coveredSchoolIds.size,
      activePolicyCount: activePolicies(db).length,
      coverageRate,
      unresolvedHazardCount: unresolvedHazards.length,
      openClaimCount: openClaims.length,
      inspectionTaskCount: db.inspectionTasks.length,
    };
  }

  function coverageByRegion(db) {
    const activeSchoolIds = new Set(activePolicies(db).map(policy => policy.schoolId));
    return db.regions.map(region => {
      const schools = db.schools.filter(school => school.regionId === region.id);
      const covered = schools.filter(school => activeSchoolIds.has(school.id)).length;
      return { ...region, schools: schools.length, covered, rate: schools.length ? covered / schools.length : 0 };
    });
  }

  function schoolStatus(db, school) {
    if (policyForSchool(db, school.id)) return "有效保障";
    if (db.policies.some(policy => policy.schoolId === school.id && policy.status === "有效" && policy.endDate < db.meta.businessDate)) return "保障已到期";
    if (db.applications.some(application => application.schoolId === school.id && ["待核保", "待補件"].includes(application.status))) return "投保處理中";
    return "尚無有效保單";
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("zh-Hant", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value || 0);
  }

  global.SchoolDemoReports = {
    escapeHtml,
    lookup,
    activePolicies,
    policyForSchool,
    metrics,
    coverageByRegion,
    schoolStatus,
    formatMoney,
    campusMetrics: db => global.SchoolDemoCampus.analytics(db),
  };
})(window);
