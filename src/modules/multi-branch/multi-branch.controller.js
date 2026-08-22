import multiBranchService from "./multi-branch.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class MultiBranchController {
  async listBranchUsers(req, res, next) {
    try {
      const users = await multiBranchService.listBranchUsers(req.tenantContext, req.params.branchId);
      return sendSuccess(res, { data: users });
    } catch (error) {
      next(error);
    }
  }

  async grantAccess(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const access = await multiBranchService.grantAccess(req.tenantContext, req.params.branchId, body.employeeId);
      return sendSuccess(res, { statusCode: 201, message: "Branch access granted successfully", data: access });
    } catch (error) {
      next(error);
    }
  }

  async revokeAccess(req, res, next) {
    try {
      const result = await multiBranchService.revokeAccess(req.tenantContext, req.params.branchId, req.params.employeeId);
      return sendSuccess(res, { message: result.message });
    } catch (error) {
      next(error);
    }
  }

  async listMyBranches(req, res, next) {
    try {
      const branches = await multiBranchService.listMyBranches(req.tenantContext);
      return sendSuccess(res, { data: branches });
    } catch (error) {
      next(error);
    }
  }
}

export const multiBranchController = new MultiBranchController();
export default multiBranchController;