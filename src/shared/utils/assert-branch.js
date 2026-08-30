import branchRepository from "../../modules/branches/branch.repository.js";

export async function assertBranchInTenant(tenantContext, branchId) {
  return branchRepository.requireBranch(tenantContext, branchId);
}

export default assertBranchInTenant;
