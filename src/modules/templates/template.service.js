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
    const customTemplates = await this.getRawCustomTemplates(tenantContext);

    return Object.values(DEFAULT_TEMPLATES).map((def) => {
      const customValue = customTemplates[def.key];
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
      };
    });
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

    // Verify all keys are allowed
    for (const key of Object.keys(updates)) {
      if (!ALLOWED_TEMPLATE_KEYS.includes(key)) {
        throw new BusinessRuleError(`Template key '${key}' is not recognized`);
      }
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
        ? currentRestaurant.templates
        : {};

    const newTemplates = { ...currentTemplates };

    for (const [key, val] of Object.entries(updates)) {
      if (typeof val === "string" && val.trim().length > 0) {
        newTemplates[key] = val.trim();
      } else if (val === null || val === "") {
        delete newTemplates[key]; // Reset to default
      }
    }

    // Update in Database
    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { templates: newTemplates },
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
      if (!ALLOWED_TEMPLATE_KEYS.includes(templateKey)) {
        throw new BusinessRuleError(`Template key '${templateKey}' is not recognized`);
      }
      newTemplates = { ...(currentRestaurant.templates || {}) };
      delete newTemplates[templateKey];
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
   * @param {string} templateKey - Key from ALLOWED_TEMPLATE_KEYS
   * @param {object} tenantContext - Must contain restaurantId
   * @param {Record<string, any>} variables - Template variables
   * @returns {Promise<string>} Rendered message
   */
  async render(templateKey, tenantContext, variables = {}) {
    const defaultDef = DEFAULT_TEMPLATES[templateKey];
    const defaultText = defaultDef?.defaultText || "";

    try {
      const customTemplates = await this.getRawCustomTemplates(tenantContext);
      const customText = customTemplates[templateKey];

      const templateString =
        typeof customText === "string" && customText.trim().length > 0
          ? customText
          : defaultText;

      return renderTemplate(templateString, variables);
    } catch (err) {
      logger.error({ err: err.message, templateKey }, "Error rendering template, falling back to default");
      return renderTemplate(defaultText, variables);
    }
  }
}

export const templateService = new TemplateService();
export default templateService;
