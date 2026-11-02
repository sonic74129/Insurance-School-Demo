(function initSchoolDemoWorkflows(global) {
  "use strict";

  const Data = global.SchoolDemoData;
  const ACTIVE_STATUSES = new Set(["有效"]);

  function requireThat(condition, message) {
    if (!condition) throw new Error(message);
  }

  function item(db, collection, id, label) {
    const found = db[collection].find(entry => entry.id === id);
    requireThat(found, `找不到${label || collection}記錄。`);
    return found;
  }

  function activePolicy(db, policy) {
    return ACTIVE_STATUSES.has(policy.status)
      && policy.startDate <= db.meta.businessDate
      && policy.endDate >= db.meta.businessDate;
  }

  function appendAudit(db, actor, action, entityId) {
    db.meta.eventSequence += 1;
    db.auditLogs.unshift({
      id: `AUD-${String(db.meta.eventSequence).padStart(5, "0")}`,
      at: db.meta.businessDate,
      actorId: actor.id,
      actorRole: actor.role,
      action,
      entityId,
    });
  }

  function nextId(db, collection, prefix) {
    const largest = db[collection].reduce((current, entry) => {
      const match = new RegExp(`^${prefix}-(\\d+)$`).exec(entry.id);
      return match ? Math.max(current, Number(match[1])) : current;
    }, 1000);
    return `${prefix}-${String(largest + 1).padStart(4, "0")}`;
  }

  function run(source, accountId, action, payload = {}) {
    try {
      const errors = Data.validate(source);
      requireThat(!errors.length, `目前資料不可操作：${errors.join("；")}`);
      const db = Data.clone(source);
      const actor = item(db, "accounts", accountId, "帳號");
      if (global.SchoolDemoCampus.ACTIONS.has(action)) {
        const outcome = global.SchoolDemoCampus.run(db, actor, action, payload);
        appendAudit(db, actor, `${actor.role === "regulator" ? "平台服務演示代辦：" : ""}${outcome.message}`, outcome.targetId);
        const errors = Data.validate(db);
        requireThat(!errors.length, `操作後資料驗證失敗：${errors.join("；")}`);
        return { ok: true, db, message: outcome.message };
      }
      let message = "";

      switch (action) {
        case "submitApplication": {
          requireThat(actor.role === "school", "只有學校帳號可以提交投保申請。");
          const school = item(db, "schools", actor.orgId, "學校");
          const product = item(db, "products", payload.productId, "保險產品");
          requireThat(!db.policies.some(policy => policy.schoolId === school.id && activePolicy(db, policy)), "本校已有有效保單，不能重複提交演示投保。");
          requireThat(!db.applications.some(app => app.schoolId === school.id && ["待核保", "待補件"].includes(app.status)), "本校已有尚未完成的投保申請。");
          const insurer = item(db, "insurers", product.insurerId, "保險機構");
          const application = {
            id: nextId(db, "applications", "APP"),
            schoolId: school.id,
            insurerId: insurer.id,
            productId: product.id,
            studentCount: school.studentCount,
            estimatedPremium: school.studentCount * product.estimatePerStudent,
            submittedAt: db.meta.businessDate,
            status: "待核保",
            notes: "合成演示申請；未連接支付或保險公司核心系統。",
          };
          db.applications.unshift(application);
          message = `已提交 ${application.id}，送交${insurer.shortName}核保。`;
          break;
        }
        case "underwrite": {
          requireThat(actor.role === "insurer", "只有保險公司帳號可以處理核保。");
          const application = item(db, "applications", payload.applicationId, "投保申請");
          requireThat(application.insurerId === actor.orgId, "不能處理其他保險機構的申請。");
          requireThat(["待核保", "待補件"].includes(application.status), "此申請目前不在核保處理狀態。");
          if (payload.decision === "supplement") {
            application.status = "待補件";
            application.underwritingNote = payload.note || "請補充投保資料（合成演示）。";
            message = `已將 ${application.id} 退回補件。`;
          } else if (payload.decision === "reject") {
            application.status = "未承保";
            application.underwritingNote = payload.note || "不符合示例承保條件。";
            message = `已記錄 ${application.id} 未承保。`;
          } else {
            requireThat(payload.decision === "approve", "核保決定無效。");
            requireThat(!db.policies.some(policy => policy.schoolId === application.schoolId && activePolicy(db, policy)), "此校已有有效保單，請先檢查重複投保。");
            application.status = "已承保";
            application.underwritingNote = payload.note || "核保通過（演示）；未執行真實支付。";
            const policy = {
              id: nextId(db, "policies", "POL"),
              policyNo: `DEMO-POL-${String(db.meta.eventSequence + db.policies.length + 1).padStart(4, "0")}`,
              schoolId: application.schoolId,
              purchaser: "示例學校自主採購",
              policyholder: application.schoolId,
              insured: application.schoolId,
              payer: application.schoolId,
              insurerId: application.insurerId,
              productId: application.productId,
              startDate: db.meta.businessDate,
              endDate: `${Number(db.meta.businessDate.slice(0, 4)) + 1}${db.meta.businessDate.slice(4)}`,
              status: "有效",
              synthetic: true,
            };
            db.policies.unshift(policy);
            application.policyId = policy.id;
            message = `核保完成並生成演示保單 ${policy.policyNo}。`;
          }
          break;
        }
        case "resubmitApplication": {
          requireThat(actor.role === "school", "只有學校帳號可以補交申請資料。");
          const application = item(db, "applications", payload.applicationId, "投保申請");
          requireThat(application.schoolId === actor.orgId, "不能補交其他學校的申請資料。");
          requireThat(application.status === "待補件", "此申請目前不需要補件。");
          application.status = "待核保";
          application.notes = "學校已提交合成補充資料。";
          message = `已補交 ${application.id}，等待保險機構重新核保。`;
          break;
        }
        case "submitClaim": {
          requireThat(actor.role === "school", "只有學校帳號可以提交事故通知。");
          const policy = item(db, "policies", payload.policyId, "保單");
          requireThat(policy.schoolId === actor.orgId, "不能以其他學校的保單報案。");
          requireThat(activePolicy(db, policy), "此演示僅允許以統計日有效的保單提交事故通知。");
          const incidentType = String(payload.incidentType || "").trim();
          requireThat(incidentType.length >= 2, "請填寫事故類型。");
          const claim = {
            id: nextId(db, "claims", "CLM"),
            policyId: policy.id,
            schoolId: policy.schoolId,
            insurerId: policy.insurerId,
            incidentDate: payload.incidentDate || db.meta.businessDate,
            incidentType,
            description: String(payload.description || "合成演示案例，不含真實個人資料。").trim(),
            status: "待受理",
            reportedAt: db.meta.businessDate,
            events: [{ at: db.meta.businessDate, status: "待受理", note: "學校提交合成事故通知。" }],
          };
          db.claims.unshift(claim);
          message = `已提交演示報案 ${claim.id}。`;
          break;
        }
        case "advanceClaim": {
          requireThat(actor.role === "insurer", "只有保險公司帳號可以更新理賠進度。");
          const claim = item(db, "claims", payload.claimId, "理賠案件");
          requireThat(claim.insurerId === actor.orgId, "不能更新其他保險機構的案件。");
          requireThat(!["已結案", "未予受理"].includes(claim.status), "案件已結束，不能再推進。");
          const nextStatus = payload.status;
          requireThat(["待受理", "查勘中", "待補充資料", "核定處理中", "已結案"].includes(nextStatus), "理賠狀態無效。");
          const order = ["待受理", "查勘中", "待補充資料", "核定處理中", "已結案"];
          requireThat(order.indexOf(nextStatus) > order.indexOf(claim.status), "理賠狀態只能向前推進；待補件需由學校先補交。");
          claim.status = nextStatus;
          const note = String(payload.note || "保險機構更新演示進度。").trim();
          claim.events.push({ at: db.meta.businessDate, status: nextStatus, note });
          message = `${claim.id} 理賠進度已更新為「${nextStatus}」。`;
          break;
        }
        case "supplementClaim": {
          requireThat(actor.role === "school", "只有學校帳號可以補充理賠資料。");
          const claim = item(db, "claims", payload.claimId, "理賠案件");
          requireThat(claim.schoolId === actor.orgId, "不能補充其他學校的案件資料。");
          requireThat(claim.status === "待補充資料", "此案件目前不需要補充資料。");
          claim.status = "查勘中";
          claim.events.push({ at: db.meta.businessDate, status: "查勘中", note: "學校已提交合成補充資料。" });
          message = `已補充 ${claim.id} 的演示資料，案件返回查勘流程。`;
          break;
        }
        default:
          throw new Error("不支援此操作。");
      }

      appendAudit(db, actor, message, payload.applicationId || payload.policyId || payload.taskId || payload.hazardId || payload.claimId || "演示資料");
      const nextErrors = Data.validate(db);
      requireThat(!nextErrors.length, `操作後資料驗證失敗：${nextErrors.join("；")}`);
      return { ok: true, db, message };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  global.SchoolDemoWorkflows = { run, activePolicy };
})(window);
