import prisma from "../../lib/prisma.js";
import redis from "../../config/redis.js";
import logger from "../../config/logger.js";
import { DEFAULT_TEMPLATES, ALLOWED_TEMPLATE_KEYS } from "./template.constants.js";
import { renderTemplate } from "./template.engine.js";
import { auditLogService } from "../audit-logs/audit-log.service.js";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";

const CACHE_TTL_SECONDS = 3600; // 1 hour

export class TemplateService {
  getCacheKey(restaurantId) {
    return `templates:${restaurantId}`;
  }

  /**
   * Retrieves the raw custom templates object saved for a given restaurant.
   * Utilizes Redis caching for high-speed access.
   */
  async getRawCustomTemplates(tenantContext) {
    const restaurantId = tenantContext?.restaurantId;
    if (!restaurantId) return {};

    const cacheKey = this.getCacheKey(restaurantId);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (cacheErr) {
      logger.warn({ err: cacheErr.message, restaurantId }, "Failed to read templates from Redis cache");
    }

    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { templates: true },
      });

      const templates = restaurant?.templates && typeof restaurant.templates === "object"
        ? restaurant.templates
        : {};

      try {
        await redis.set(cacheKey, JSON.stringify(templates), "EX", CACHE_TTL_SECONDS);
      } catch (cacheSetErr) {
        logger.warn({ err: cacheSetErr.message, restaurantId }, "Failed to cache templates in Redis");
      }

      return templates;
    } catch (dbErr) {
      logger.error({ err: dbErr.message, restaurantId }, "Failed to fetch restaurant templates from database");
      return {};
    }
  }

  /**
   * Returns all available templates with system defaults and custom overrides.
   */
  async getAllTemplates(tenantContext) {
    const rawTemplates = await this.getRawCustomTemplates(tenantContext);
    const customRegistry =
      rawTemplates?._customTemplates && typeof rawTemplates._customTemplates === "object"
        ? rawTemplates._customTemplates
        : {};

    const systemList = Object.values(DEFAULT_TEMPLATES).map((def) => {
      const customValue = rawTemplates[def.key];
      const isCustom = typeof customValue === "string" && customValue.trim().length > 0;
      return {
        key: def.key,
        category: def.category,
        title: def.title,
        description: def.description,
        allowedVariables: def.allowedVariables,
        defaultText: def.defaultText,
        activeText: isCustom ? customValue : def.defaultText,
        isCustom,
        isUserCreated: false,
      };
    });

    const userList = Object.values(customRegistry).map((item) => ({
      key: item.key,
      category: item.category || "INBOX_SUPPORT",
      title: item.title,
      description: item.description || "",
      allowedVariables: Array.isArray(item.allowedVariables) ? item.allowedVariables : [],
      defaultText: item.activeText || item.text || "",
      activeText: item.activeText || item.text || "",
      isCustom: true,
      isUserCreated: true,
      createdAt: item.createdAt,
    }));

    return [...systemList, ...userList];
  }

  /**
   * Creates a new custom template for the restaurant.
   */
  async createTemplate(tenantContext, data) {
    const restaurantId = tenantContext?.restaurantId;
    if (!restaurantId) {
      throw new BusinessRuleError("Tenant context is required");
    }

    const { title, text, category = "INBOX_SUPPORT", description = "", allowedVariables = [] } = data;
    if (!title || !text) {
      throw new BusinessRuleError("Template title and text are required");
    }

    // Generate or sanitize key
    let finalKey;
    if (data.key && typeof data.key === "string" && data.key.trim().length > 0) {
      const sanitized = data.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      finalKey = sanitized.startsWith("CUSTOM_") ? sanitized : `CUSTOM_${sanitized}`;
    } else {
      const slug = title
        .trim()
        .slice(0, 20)
        .replace(/[\s\W]+/g, "_")
        .toUpperCase();
      finalKey = `CUSTOM_${slug || "TPL"}_${Date.now().toString(36).toUpperCase()}`;
    }

    if (ALLOWED_TEMPLATE_KEYS.includes(finalKey)) {
      throw new BusinessRuleError(`Template key '${finalKey}' conflicts with a system key`);
    }

    const currentRestaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { templates: true },
    });

    if (!currentRestaurant) {
      throw new NotFoundError("Restaurant not found");
    }

    const currentTemplates =
      currentRestaurant.templates && typeof currentRestaurant.templates === "object"
        ? { ...currentRestaurant.templates }
        : {};

    const customRegistry = { ...(currentTemplates._customTemplates || {}) };

    if (customRegistry[finalKey]) {
      throw new BusinessRuleError(`Template with key '${finalKey}' already exists`);
    }

    // Auto-detect variables in text e.g. {{customerName}}
    const detectedVariables = [...new Set((text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, "")))];
    const mergedVariables = [...new Set([...(allowedVariables || []), ...detectedVariables])];

    const newCustomTemplate = {
      key: finalKey,
      title: title.trim(),
      category,
      description: description?.trim() || "",
      activeText: text.trim(),
      allowedVariables: mergedVariables,
      isCustom: true,
      isUserCreated: true,
      createdAt: new Date().toISOString(),
    };

    customRegistry[finalKey] = newCustomTemplate;
    currentTemplates._customTemplates = customRegistry;

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { templates: currentTemplates },
    });

    await this.invalidateCache(restaurantId);

    try {
      await auditLogService.logAction(tenantContext, {
        action: "CREATE_TEMPLATE",
        entityType: "RestaurantTemplates",
        entityId: restaurantId,
        metadata: { templateKey: finalKey, title },
      });
    } catch (_) {}

    return newCustomTemplate;
  }

  /**
   * Updates one or multiple template strings for the restaurant.
   */
  async updateTemplates(tenantContext, updates) {
    const restaurantId = tenantContext?.restaurantId;
    if (!restaurantId) {
      throw new BusinessRuleError("Tenant context is required");
    }

    if (!updates || typeof updates !== "object") {
      throw new BusinessRuleError("Updates payload must be an object");
    }

    // Fetch existing custom templates
    const currentRestaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { templates: true },
    });

    if (!currentRestaurant) {
      throw new NotFoundError("Restaurant not found");
    }

    const currentTemplates =
      currentRestaurant.templates && typeof currentRestaurant.templates === "object"
        ? { ...currentRestaurant.templates }
        : {};

    const customRegistry = { ...(currentTemplates._customTemplates || {}) };

    // Verify and apply updates
    for (const [key, val] of Object.entries(updates)) {
      if (ALLOWED_TEMPLATE_KEYS.includes(key)) {
        if (typeof val === "string" && val.trim().length > 0) {
          currentTemplates[key] = val.trim();
        } else if (val === null || val === "") {
          delete currentTemplates[key]; // Reset to default
        }
      } else if (customRegistry[key]) {
        if (typeof val === "string") {
          customRegistry[key] = {
            ...customRegistry[key],
            activeText: val.trim(),
          };
        } else if (val && typeof val === "object") {
          customRegistry[key] = {
            ...customRegistry[key],
            title: val.title || customRegistry[key].title,
            category: val.category || customRegistry[key].category,
            description: val.description !== undefined ? val.description : customRegistry[key].description,
            activeText:
              val.text !== undefined
                ? val.text.trim()
                : val.activeText !== undefined
                ? val.activeText.trim()
                : customRegistry[key].activeText,
            allowedVariables: Array.isArray(val.allowedVariables)
              ? val.allowedVariables
              : customRegistry[key].allowedVariables,
            updatedAt: new Date().toISOString(),
          };
        }
      } else {
        throw new BusinessRuleError(`Template key '${key}' is not recognized`);
      }
    }

    currentTemplates._customTemplates = customRegistry;

    // Update in Database
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { templates: currentTemplates },
      select: { templates: true },
    });

    // Invalidate Redis Cache
    await this.invalidateCache(restaurantId);

    // Audit Log
    try {
      await auditLogService.logAction(tenantContext, {
        action: "UPDATE_TEMPLATES",
        entityType: "RestaurantTemplates",
        entityId: restaurantId,
        metadata: { updatedKeys: Object.keys(updates) },
      });
    } catch (_) {}

    return this.getAllTemplates(tenantContext);
  }

  /**
   * Deletes a user-created template or resets a system template override.
   */
  async deleteTemplate(tenantContext, templateKey) {
    const restaurantId = tenantContext?.restaurantId;
    if (!restaurantId) {
      throw new BusinessRuleError("Tenant context is required");
    }

    const currentRestaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { templates: true },
    });

    if (!currentRestaurant) {
      throw new NotFoundError("Restaurant not found");
    }

    const currentTemplates =
      currentRestaurant.templates && typeof currentRestaurant.templates === "object"
        ? { ...currentRestaurant.templates }
        : {};

    const customRegistry = { ...(currentTemplates._customTemplates || {}) };

    if (customRegistry[templateKey]) {
      delete customRegistry[templateKey];
      currentTemplates._customTemplates = customRegistry;
    } else if (ALLOWED_TEMPLATE_KEYS.includes(templateKey)) {
      delete currentTemplates[templateKey]; // Reset override
    } else {
      throw new NotFoundError(`Template '${templateKey}' not found`);
    }

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { templates: currentTemplates },
    });

    await this.invalidateCache(restaurantId);

    try {
      await auditLogService.logAction(tenantContext, {
        action: "DELETE_TEMPLATE",
        entityType: "RestaurantTemplates",
        entityId: restaurantId,
        metadata: { templateKey },
      });
    } catch (_) {}

    return this.getAllTemplates(tenantContext);
  }

  /**
   * Resets a specific template or all templates back to system defaults.
   */
  async resetTemplates(tenantContext, templateKey = null) {
    const restaurantId = tenantContext?.restaurantId;
    if (!restaurantId) {
      throw new BusinessRuleError("Tenant context is required");
    }

    const currentRestaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { templates: true },
    });

    if (!currentRestaurant) {
      throw new NotFoundError("Restaurant not found");
    }

    let newTemplates = {};

    if (templateKey) {
      newTemplates = { ...(currentRestaurant.templates || {}) };
      if (newTemplates._customTemplates?.[templateKey]) {
        delete newTemplates._customTemplates[templateKey];
      } else if (ALLOWED_TEMPLATE_KEYS.includes(templateKey)) {
        delete newTemplates[templateKey];
      } else {
        throw new BusinessRuleError(`Template key '${templateKey}' is not recognized`);
      }
    }

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { templates: newTemplates },
    });

    await this.invalidateCache(restaurantId);

    try {
      await auditLogService.logAction(tenantContext, {
        action: "RESET_TEMPLATES",
        entityType: "RestaurantTemplates",
        entityId: restaurantId,
        metadata: { templateKey: templateKey || "ALL" },
      });
    } catch (_) {}

    return this.getAllTemplates(tenantContext);
  }

  /**
   * Invalidate Redis cache for a restaurant.
   */
  async invalidateCache(restaurantId) {
    try {
      await redis.del(this.getCacheKey(restaurantId));
    } catch (err) {
      logger.warn({ err: err.message, restaurantId }, "Failed to invalidate template cache");
    }
  }

  /**
   * Renders the given template key for the current restaurant context with provided variables.
   * Falls back safely to default template text if custom template is not set or on error.
   *
   * @param {string} templateKey - Key from ALLOWED_TEMPLATE_KEYS or custom key
   * @param {object} tenantContext - Must contain restaurantId
   * @param {Record<string, any>} variables - Template variables
   * @returns {Promise<string>} Rendered message
   */
  async render(templateKey, tenantContext, variables = {}) {
    try {
      const customTemplates = await this.getRawCustomTemplates(tenantContext);

      // Check user-created custom templates
      if (customTemplates?._customTemplates?.[templateKey]) {
        const item = customTemplates._customTemplates[templateKey];
        return renderTemplate(item.activeText || item.text || "", variables);
      }

      // Check system template with custom override
      const defaultDef = DEFAULT_TEMPLATES[templateKey];
      const defaultText = defaultDef?.defaultText || "";
      const customText = customTemplates[templateKey];

      const templateString =
        typeof customText === "string" && customText.trim().length > 0
          ? customText
          : defaultText;

      return renderTemplate(templateString, variables);
    } catch (err) {
      logger.error({ err: err.message, templateKey }, "Error rendering template, falling back to default");
      const defaultDef = DEFAULT_TEMPLATES[templateKey];
      return renderTemplate(defaultDef?.defaultText || "", variables);
    }
  }
}

export const templateService = new TemplateService();
export default templateService;
