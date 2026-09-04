/**
 * Safe template interpolator.
 * Replaces {{variableName}} with values from the variables dictionary.
 * Does NOT use eval, function constructors, or execute code, preventing SSTI.
 *
 * @param {string} templateString - Raw template text
 * @param {Record<string, any>} variables - Key-value map of template variables
 * @returns {string} Rendered text
 */
export function renderTemplate(templateString, variables = {}) {
  if (typeof templateString !== "string") {
    return "";
  }

  return templateString.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      const val = variables[key];
      return val !== null && val !== undefined ? String(val) : "";
    }
    return "";
  });
}

export default { renderTemplate };
