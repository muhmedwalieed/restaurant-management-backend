/**
 * Utility functions for standardized pagination across services and repositories.
 */

export function getPaginationOffset(page = 1, limit = 20) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;
  const take = limitNum;

  return { skip, take, page: pageNum, limit: limitNum };
}

export function buildPaginationMeta(total, page = 1, limit = 20) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const totalNum = Math.max(0, Number(total) || 0);
  const totalPages = Math.ceil(totalNum / limitNum) || 1;

  return {
    page: pageNum,
    limit: limitNum,
    total: totalNum,
    totalPages,
  };
}

export function paginateResponse(items = [], total = 0, page = 1, limit = 20) {
  return {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  };
}

export default {
  getPaginationOffset,
  buildPaginationMeta,
  paginateResponse,
};
