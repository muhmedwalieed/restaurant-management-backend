import shiftRepository from "./shift.repository.js";
import prisma from "../../lib/prisma.js";
import {
  NotFoundError,
  BusinessRuleError,
  ConflictError,
} from "../../shared/errors/index.js";
import { assertTenantContext } from "../../shared/repositories/base.repository.js";

export class ShiftService {
  async verifyBranchOwnership(tenantContext, branchId) {
    assertTenantContext(tenantContext);
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        restaurantId: tenantContext.restaurantId,
      },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundError("Branch not found in this restaurant");
    }
    return branch;
  }

  /**
   * Get currently active open shift for the logged in staff or branch.
   */
  async getCurrentShift(tenantContext, branchId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const employeeId = tenantContext.employeeId;
    if (!employeeId) throw new BusinessRuleError("Employee ID is required");

    const shift = await shiftRepository.findActiveShiftByEmployee(tenantContext, branchId, employeeId);
    if (!shift) {
      return { activeShift: null };
    }

    const liveTotals = await shiftRepository.calculateLiveShiftTotals(tenantContext, shift.id);

    return {
      activeShift: {
        ...shift,
        ...liveTotals,
      },
    };
  }

  /**
   * Open a new shift for the staff.
   */
  async openShift(tenantContext, branchId, { startingCash = 0, openNotes = "" } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const employeeId = tenantContext.employeeId;
    if (!employeeId) throw new BusinessRuleError("Employee ID is required");

    // Check if employee already has an active open shift in this branch
    const existing = await shiftRepository.findActiveShiftByEmployee(tenantContext, branchId, employeeId);
    if (existing) {
      throw new ConflictError(`لديك بالفعل وردية مفتوحة حالياً (وردية #${existing.shiftNumber})`);
    }

    const numStartingCash = Number(startingCash) || 0;
    if (numStartingCash < 0) {
      throw new BusinessRuleError("رصيد بداية الوردية لا يمكن أن يكون سالباً");
    }

    const shiftNumber = await shiftRepository.getNextShiftNumber(tenantContext, branchId);

    const newShift = await shiftRepository.createShift(tenantContext, {
      branchId,
      employeeId,
      shiftNumber,
      status: "OPEN",
      startingCash: numStartingCash,
      expectedCash: numStartingCash,
      openNotes: openNotes?.trim() || null,
      openedByEmployeeId: employeeId,
    });

    await prisma.auditLog.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        actorEmployeeId: employeeId,
        action: "SHIFT_OPENED",
        entityType: "Shift",
        entityId: newShift.id,
        metadata: {
          shiftNumber,
          startingCash: numStartingCash,
        },
      },
    });

    return {
      shift: newShift,
      message: `تم فتح الوردية #${shiftNumber} بنجاح برصيد بداية ${numStartingCash.toFixed(2)}`,
    };
  }

  /**
   * Get interim financial report (X-Report) without closing shift.
   */
  async getXReport(tenantContext, branchId, shiftId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const shift = await shiftRepository.findShiftById(tenantContext, shiftId);
    if (!shift) throw new NotFoundError("الوردية غير موجودة");

    const liveTotals = await shiftRepository.calculateLiveShiftTotals(tenantContext, shiftId);

    return {
      shiftId: shift.id,
      shiftNumber: shift.shiftNumber,
      status: shift.status,
      openedAt: shift.openedAt,
      employee: shift.employee,
      reportType: "X_REPORT",
      generatedAt: new Date(),
      ...liveTotals,
    };
  }

  /**
   * Close active shift and generate final Z-Report.
   */
  async closeShift(tenantContext, branchId, shiftId, { actualCash, closeNotes = "" } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const employeeId = tenantContext.employeeId;

    const shift = await shiftRepository.findShiftById(tenantContext, shiftId);
    if (!shift) throw new NotFoundError("الوردية غير موجودة");
    if (shift.status !== "OPEN") {
      throw new BusinessRuleError("هذه الوردية مغلقة بالفعل");
    }

    const numActualCash = Number(actualCash);
    if (isNaN(numActualCash) || numActualCash < 0) {
      throw new BusinessRuleError("يرجى إدخال مبلغ النقدية الفعلي في الدرج بشكل صحيح");
    }

    // Compute all finalized numbers
    const totals = await shiftRepository.calculateLiveShiftTotals(tenantContext, shiftId);
    const cashDifference = numActualCash - totals.expectedCash;

    const closePayload = {
      actualCash: numActualCash,
      expectedCash: totals.expectedCash,
      cashDifference,
      totalSales: totals.totalSales,
      cashSales: totals.cashSales,
      cardSales: totals.cardSales,
      instaPaySales: totals.instaPaySales,
      walletSales: totals.walletSales,
      driverSettlementCash: totals.driverSettlementCash,
      cashIn: totals.cashIn,
      cashOut: totals.cashOut,
      ordersCount: totals.ordersCount,
      refundsCount: totals.refundsCount,
      totalRefunds: totals.totalRefunds,
      totalDiscounts: totals.totalDiscounts,
      closeNotes: closeNotes?.trim() || null,
      closedByEmployeeId: employeeId || null,
    };

    await shiftRepository.closeShift(tenantContext, shiftId, closePayload);

    await prisma.auditLog.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        actorEmployeeId: employeeId || null,
        action: "SHIFT_CLOSED",
        entityType: "Shift",
        entityId: shift.id,
        metadata: {
          shiftNumber: shift.shiftNumber,
          expectedCash: totals.expectedCash,
          actualCash: numActualCash,
          cashDifference,
        },
      },
    });

    const finalizedShift = await shiftRepository.findShiftById(tenantContext, shiftId);

    return {
      shift: finalizedShift,
      reportType: "Z_REPORT",
      message: `تم إغلاق الوردية #${shift.shiftNumber} بنجاح`,
    };
  }

  /**
   * Record Pay In / Pay Out cash movement.
   */
  async addCashMovement(tenantContext, branchId, shiftId, { type, amount, reason }) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const employeeId = tenantContext.employeeId;

    const shift = await shiftRepository.findShiftById(tenantContext, shiftId);
    if (!shift) throw new NotFoundError("الوردية غير موجودة");
    if (shift.status !== "OPEN") {
      throw new BusinessRuleError("لا يمكن إضافة حركات نقدية لوردية مغلقة");
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new BusinessRuleError("المبلغ يجب أن يكون أكبر من صفر");
    }

    if (!reason || !reason.trim()) {
      throw new BusinessRuleError("سبب الحركة النقدية مطلوب");
    }

    const movement = await shiftRepository.addCashMovement(tenantContext, {
      shiftId,
      type,
      amount: numAmount,
      reason: reason.trim(),
      employeeId: employeeId || "SYSTEM",
    });

    const liveTotals = await shiftRepository.calculateLiveShiftTotals(tenantContext, shiftId);

    return {
      movement,
      liveTotals,
      message: `تم تسجيل حركة ${type === "CASH_IN" ? "إيداع نقدية" : "سحب مصروفات"} بمبلغ ${numAmount.toFixed(2)} بنجاح`,
    };
  }

  /**
   * Get shift details by ID.
   */
  async getShiftDetails(tenantContext, branchId, shiftId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const shift = await shiftRepository.findShiftById(tenantContext, shiftId);
    if (!shift) throw new NotFoundError("الوردية غير موجودة");

    let totals;
    if (shift.status === "OPEN") {
      totals = await shiftRepository.calculateLiveShiftTotals(tenantContext, shiftId);
    }

    return {
      shift: {
        ...shift,
        ...(totals || {}),
      },
    };
  }

  /**
   * List past shifts archive.
   */
  async listShifts(tenantContext, branchId, query = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    return shiftRepository.listShifts(tenantContext, branchId, query);
  }
}

export const shiftService = new ShiftService();
export default shiftService;
