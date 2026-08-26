import multiBranchService from "./multi-branch.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class MultiBranchController {
  listBranchUsers = asyncHandler(async (req, res) => {
    const users = await multiBranchService.listBranchUsers(req.tenantContext, req.params.branchId);
    return sendSuccess(res, { data: users });
  });

  grantAccess = asyncHandler(async (req, res) => {
    const access = await multiBranchService.grantAccess(req.tenantContext, req.params.branchId, req.body.employeeId);
    return sendSuccess(res, { statusCode: 201, message: "Branch access granted successfully", data: access });
  });

  revokeAccess = asyncHandler(async (req, res) => {
    const result = await multiBranchService.revokeAccess(req.tenantContext, req.params.branchId, req.params.employeeId);
    return sendSuccess(res, { message: result.message });
  });

  listMyBranches = asyncHandler(async (req, res) => {
    const branches = await multiBranchService.listMyBranches(req.tenantContext);
    return sendSuccess(res, { data: branches });
  });
}

export const multiBranchController = new MultiBranchController();
export default multiBranchController;
