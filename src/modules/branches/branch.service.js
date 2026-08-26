import branchRepository from "./branch.repository.js";
import { BusinessRuleError, ConflictError, NotFoundError } from "../../shared/errors/index.js";
import { paginateResponse } from "../../shared/utils/pagination.js";

export class BranchService {
  async listBranches(tenantContext, { page = 1, limit = 20, status }) {
    const { items, total } = await branchRepository.findBranches(tenantContext, {
      page,
      limit,
      status,
    });
    return paginateResponse(items, total, page, limit);
  }

  async getBranchById(tenantContext, branchId) {
    const branch = await branchRepository.findBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found or access denied");
    }
    return branch;
  }

  async createBranch(tenantContext, data) {

    const existingCode = await branchRepository.findBranchByCode(tenantContext, data.code);
    if (existingCode) {
      throw new ConflictError(`Branch with code '${data.code.toUpperCase()}' already exists in this restaurant`);
    }

    if (data.isMain) {
      const existingMain = await branchRepository.findMainBranch(tenantContext);
      if (existingMain) {
        throw new BusinessRuleError("Restaurant already has a main branch");
      }
    }

    return branchRepository.createBranch(tenantContext, {
      name: data.name,
      code: data.code,
      address: data.address || null,
      phone: data.phone || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      street: data.street || null,
      city: data.city || null,
      state: data.state || null,
      postalCode: data.postalCode || null,
      isMain: Boolean(data.isMain),
      status: data.status || "ACTIVE",
    });
  }

  async updateBranch(tenantContext, branchId, data) {
    const existing = await this.getBranchById(tenantContext, branchId);

    if (existing.isMain && data.status && data.status !== "ACTIVE") {
      throw new BusinessRuleError("Main branch cannot be deactivated");
    }

    if (data.code && data.code.toUpperCase() !== existing.code) {
      const existingCode = await branchRepository.findBranchByCode(tenantContext, data.code);
      if (existingCode) {
        throw new ConflictError(`Branch with code '${data.code.toUpperCase()}' already exists in this restaurant`);
      }
    }

    const updatePayload = {
      ...(data.name ? { name: data.name } : {}),
      ...(data.code ? { code: data.code } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail } : {}),
      ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone } : {}),
      ...(data.street !== undefined ? { street: data.street } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
      ...(data.status ? { status: data.status } : {}),
    };

    await branchRepository.updateBranch(tenantContext, branchId, updatePayload);
    return this.getBranchById(tenantContext, branchId);
  }

  async deleteBranch(tenantContext, branchId) {
    const existing = await this.getBranchById(tenantContext, branchId);

    if (existing.isMain) {
      throw new BusinessRuleError("Main branch cannot be deactivated/deleted");
    }

    await branchRepository.deactivateBranch(tenantContext, branchId);
    return { message: "Branch deactivated successfully" };
  }

  async getWorkingHours(tenantContext, branchId) {
    return branchRepository.getWorkingHours(tenantContext, branchId);
  }

  async updateWorkingHours(tenantContext, branchId, hoursArray) {
    const branch = await this.getBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found");
    }

    return branchRepository.upsertWorkingHours(tenantContext, branchId, hoursArray);
  }

  async getBranchSettings(tenantContext, branchId) {
    return branchRepository.getBranchSettings(tenantContext, branchId);
  }

  async updateBranchSettings(tenantContext, branchId, settingsData) {
    const branch = await this.getBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found");
    }

    return branchRepository.upsertBranchSettings(tenantContext, branchId, settingsData);
  }
}

export const branchService = new BranchService();
export default branchService;
