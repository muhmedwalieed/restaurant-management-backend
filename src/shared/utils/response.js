
export function sendSuccess(res, { data = null, message = null, statusCode = 200, pagination = null } = {}) {
  const requestId = res.req?.requestId || res.req?.id || "N/A";

  const responseBody = {
    success: true,
    ...(message ? { message } : {}),
    ...(data !== null ? { data } : {}),
    ...(pagination ? { pagination } : {}),
    requestId,
  };

  return res.status(statusCode).json(responseBody);
}

export default sendSuccess;
