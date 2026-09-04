import templateService from "./template.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class TemplateController {
  getTemplates = asyncHandler(async (req, res) => {
    const templates = await templateService.getAllTemplates(req.tenantContext);
    res.json({
      success: true,
      data: templates,
    });
  });

  updateTemplates = asyncHandler(async (req, res) => {
    // Support payload as { templates: { ... } } or directly { KEY: "..." }
    const updates = req.body.templates || req.body;
    const templates = await templateService.updateTemplates(req.tenantContext, updates);
    res.json({
      success: true,
      message: "تم تحديث القوالب بنجاح",
      data: templates,
    });
  });

  resetTemplates = asyncHandler(async (req, res) => {
    const templateKey = req.body.templateKey || null;
    const templates = await templateService.resetTemplates(req.tenantContext, templateKey);
    res.json({
      success: true,
      message: templateKey ? "تمت استعادة القالب الافتراضي بنجاح" : "تمت استعادة كافة القوالب الافتراضية بنجاح",
      data: templates,
    });
  });
}

export const templateController = new TemplateController();
export default templateController;
