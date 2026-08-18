import branchService from "./branch.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class BranchController {
  async listBranches(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;
      const status = query.status;

      const { items, pagination } = await branchService.listBranches(req.tenantContext, {
        page,
        limit,
        status,
      });

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getBranchById(req, res, next) {
    try {
      const branch = await branchService.getBranchById(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: branch,
      });
    } catch (error) {
      next(error);
    }
  }

  async createBranch(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const branch = await branchService.createBranch(req.tenantContext, body);
      return sendSuccess(res, {
        statusCode: 201,
        message: "Branch created successfully",
        data: branch,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateBranch(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const branch = await branchService.updateBranch(req.tenantContext, req.params.id, body);
      return sendSuccess(res, {
        message: "Branch updated successfully",
        data: branch,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteBranch(req, res, next) {
    try {
      const result = await branchService.deleteBranch(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async getWorkingHours(req, res, next) {
    try {
      const hours = await branchService.getWorkingHours(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: hours,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateWorkingHours(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const hours = await branchService.updateWorkingHours(req.tenantContext, req.params.id, body.workingHours);
      return sendSuccess(res, {
        message: "Branch working hours updated successfully",
        data: hours,
      });
    } catch (error) {
      next(error);
    }
  }

  async getBranchSettings(req, res, next) {
    try {
      const settings = await branchService.getBranchSettings(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateBranchSettings(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const settings = await branchService.updateBranchSettings(req.tenantContext, req.params.id, body);
      return sendSuccess(res, {
        message: "Branch settings updated successfully",
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const branchController = new BranchController();
export default branchController;
