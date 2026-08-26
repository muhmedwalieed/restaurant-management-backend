import branchService from "./branch.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class BranchController {
  listBranches = asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;
    const { items, pagination } = await branchService.listBranches(req.tenantContext, {
      page,
      limit,
      status,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  getBranchById = asyncHandler(async (req, res) => {
    const branch = await branchService.getBranchById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: branch });
  });

  createBranch = asyncHandler(async (req, res) => {
    const branch = await branchService.createBranch(req.tenantContext, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Branch created successfully",
      data: branch,
    });
  });

  updateBranch = asyncHandler(async (req, res) => {
    const branch = await branchService.updateBranch(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      message: "Branch updated successfully",
      data: branch,
    });
  });

  deleteBranch = asyncHandler(async (req, res) => {
    const result = await branchService.deleteBranch(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: result.message });
  });

  getWorkingHours = asyncHandler(async (req, res) => {
    const hours = await branchService.getWorkingHours(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: hours });
  });

  updateWorkingHours = asyncHandler(async (req, res) => {
    const hours = await branchService.updateWorkingHours(req.tenantContext, req.params.id, req.body.workingHours);
    return sendSuccess(res, {
      message: "Branch working hours updated successfully",
      data: hours,
    });
  });

  getBranchSettings = asyncHandler(async (req, res) => {
    const settings = await branchService.getBranchSettings(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: settings });
  });

  updateBranchSettings = asyncHandler(async (req, res) => {
    const settings = await branchService.updateBranchSettings(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      message: "Branch settings updated successfully",
      data: settings,
    });
  });
}

export const branchController = new BranchController();
export default branchController;
