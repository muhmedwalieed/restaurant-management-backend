import shiftService from "./shift.service.js";

export class ShiftController {
  async getCurrentShift(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId } = req.params;
      const result = await shiftService.getCurrentShift(tenantContext, branchId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async openShift(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId } = req.params;
      const result = await shiftService.openShift(tenantContext, branchId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getXReport(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, shiftId } = req.params;
      const result = await shiftService.getXReport(tenantContext, branchId, shiftId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async closeShift(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, shiftId } = req.params;
      const result = await shiftService.closeShift(tenantContext, branchId, shiftId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async addCashMovement(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, shiftId } = req.params;
      const result = await shiftService.addCashMovement(tenantContext, branchId, shiftId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getShiftDetails(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, shiftId } = req.params;
      const result = await shiftService.getShiftDetails(tenantContext, branchId, shiftId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async listShifts(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId } = req.params;
      const result = await shiftService.listShifts(tenantContext, branchId, req.query);
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }
}

export const shiftController = new ShiftController();
export default shiftController;
