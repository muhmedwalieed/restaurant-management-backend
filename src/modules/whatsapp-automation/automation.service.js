import automationRepository from "./automation.repository.js";
import menuRepository from "../menu/menu.repository.js";
import branchRepository from "../branches/branch.repository.js";
import whatsAppService from "../whatsapp/whatsapp.service.js";
import prisma from "../../lib/prisma.js";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";

const WELCOME_TEXT =
  "👋 *أهلاً بك في مطعمنا!*\nكيف يمكننا خدمتك اليوم؟\n\n" +
  "1. 📋 عرض المنيو والمنتجات\n" +
  "2. 🛒 عرض سلة التسوق\n" +
  "3. 📍 الدفع وتحديد العنوان\n" +
  "4. 📦 تتبع أحدث طلب\n" +
  "5. ❓ الأسئلة الشائعة ومواعيد العمل\n" +
  "6. 👨‍💼 التحدث مع خدمة العملاء\n\n" +
  "أرسل رقم الخيار أو الكلمة المطلوبة.";

const RESET_KEYWORDS = new Set([
  "start",
  "restart",
  "bot",
  "reset",
  "بداية",
  "اعادة",
  "إعادة",
  "0",
]);

export class WhatsAppAutomationService {

  async getOrCreateConversation(tenantContext, connection, customerPhone) {
    let conv = await automationRepository.findConversationByPhone(
      tenantContext,
      connection.id,
      customerPhone
    );

    if (!conv) {
      conv = await automationRepository.createConversation(tenantContext, {
        connectionId: connection.id,
        customerPhone,
        state: "WELCOME",
        status: "ACTIVE",
        cart: [],
      });
    } else if (conv.status === "CLOSED") {
      await automationRepository.resetConversation(tenantContext, conv.id);
      conv = await automationRepository.findConversationById(tenantContext, conv.id);
    }

    return conv;
  }

  async handleInboundMessage(tenantContext, connection, messageData) {
    const customerPhone = messageData.fromPhone;
    const content = (messageData.content || "").trim();
    if (!content || !customerPhone) return;

    const conv = await this.getOrCreateConversation(tenantContext, connection, customerPhone);
    const normalized = content.toLowerCase();

    if (RESET_KEYWORDS.has(normalized)) {
      await automationRepository.resetConversation(tenantContext, conv.id);
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: WELCOME_TEXT,
      });
      return;
    }

    if (conv.status === "WAITING_AGENT") {

      try {
        const { inboxService } = await import("../inbox/inbox.service.js");
        await inboxService.recordCustomerMessage(tenantContext, conv.id, customerPhone, content);
      } catch (err) {

      }
      return;
    }

    const currentCart = Array.isArray(conv.cart) ? conv.cart : [];

    if (normalized.includes("menu") || normalized.includes("منيو") || normalized.includes("قائمة")) {
      return this.sendCategoriesMenu(tenantContext, conv, customerPhone);
    }

    if (normalized.includes("cart") || normalized.includes("سلة") || normalized.includes("سله")) {
      return this.sendCartSummary(tenantContext, conv, customerPhone, currentCart);
    }

    if (normalized.includes("checkout") || normalized.includes("دفع") || normalized.includes("عنوان")) {
      return this.promptAddress(tenantContext, conv, customerPhone, currentCart);
    }

    if (normalized.includes("track") || normalized.includes("تتبع") || normalized.includes("طلب")) {
      return this.trackOrder(tenantContext, customerPhone);
    }

    if (normalized.includes("help") || normalized.includes("faq") || normalized.includes("مساعدة")) {
      return this.sendFaq(tenantContext, customerPhone);
    }

    if (normalized.includes("agent") || normalized.includes("human") || normalized.includes("خدمة العملاء") || normalized.includes("موظف")) {
      return this.triggerHandoff(tenantContext, conv, customerPhone);
    }

    if (conv.state === "MAIN_MENU" || conv.state === "MENU_CATEGORY") {
      const selectedIndex = parseInt(content, 10) - 1;
      const { items: categories } = await menuRepository.findCategories(tenantContext, { limit: 20 });

      if (!isNaN(selectedIndex) && categories && categories[selectedIndex]) {
        const targetCategory = categories[selectedIndex];
        const { items: products } = await menuRepository.findProducts(tenantContext, {
          categoryId: targetCategory.id,
          limit: 20,
        });

        if (!products || products.length === 0) {
          await whatsAppService.sendMessage(tenantContext, {
            to: customerPhone,
            text: `🍕 لا توجد منتجات متوفرة حالياً في فئة *${targetCategory.name}*.\nأرسل *1* للعودة إلى الفئات.`,
          });
          return;
        }

        let text = `🍕 *منتجات فئة ${targetCategory.name}:*\n\n`;
        products.forEach((prod, idx) => {
          text += `${idx + 1}. ${prod.name} (${Number(prod.price).toFixed(2)} ج.م)\n`;
        });
        text += "\nأرسل رقم المنتج لإضافته إلى السلة.";

        await automationRepository.updateConversation(tenantContext, conv.id, {
          state: "PRODUCT_SELECT",
          selectedCategoryId: targetCategory.id,
          lastInboundAt: new Date(),
        });

        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text,
        });
        return;
      }
    }

    if (conv.state === "PRODUCT_SELECT" && conv.selectedCategoryId) {
      const selectedIndex = parseInt(content, 10) - 1;
      const { items: products } = await menuRepository.findProducts(tenantContext, {
        categoryId: conv.selectedCategoryId,
        limit: 20,
      });

      if (!isNaN(selectedIndex) && products && products[selectedIndex]) {
        const targetProduct = products[selectedIndex];
        const newCart = [...currentCart];

        const existingItem = newCart.find((i) => i.productId === targetProduct.id);
        if (existingItem) {
          existingItem.quantity += 1;
        } else {
          newCart.push({
            productId: targetProduct.id,
            productName: targetProduct.name,
            unitPrice: Number(targetProduct.price),
            quantity: 1,
          });
        }

        await automationRepository.updateConversation(tenantContext, conv.id, {
          state: "CART",
          cart: newCart,
          lastInboundAt: new Date(),
        });

        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: `✅ تم إضافة *${targetProduct.name}* إلى السلة!\n\nأرسل *2* لعرض السلة، *3* لإدخال العنوان والدفع، أو *1* لمواصلة التسوق.`,
        });
        return;
      }
    }

    if (conv.state === "ADDRESS") {
      await automationRepository.updateConversation(tenantContext, conv.id, {
        state: "CONFIRM_ORDER",
        address: content,
        lastInboundAt: new Date(),
      });

      let total = 0;
      let cartSummary = "";
      currentCart.forEach((item, idx) => {
        const itemTotal = Number(item.unitPrice) * item.quantity;
        total += itemTotal;
        cartSummary += `${idx + 1}. ${item.quantity}x ${item.productName} (${itemTotal.toFixed(2)} ج.م)\n`;
      });

      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: `📍 تم تسجيل العنوان: *${content}*\n\n🛒 *ملخص الطلب:*\n${cartSummary}\n*الإجمالي النهائي:* ${total.toFixed(2)} ج.م\n\nأرسل *نعم* أو *confirm* لتأكيد الطلب نهائياً.`,
      });
      return;
    }

    if (conv.state === "CONFIRM_ORDER" && (normalized === "confirm" || normalized === "نعم" || normalized === "تاكيد" || normalized === "تأكيد")) {
      if (currentCart.length === 0) {
        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: "🛒 سلتك فارغة! أرسل *1* لاختيار منتجات أولاً.",
        });
        return;
      }

      const { items: branches } = await branchRepository.findBranches(
        tenantContext,
        { limit: 20 }
      ).catch(() => ({ items: [] }));

      const mainBranch = branches.find((b) => b.isMain) || branches[0];
      if (!mainBranch) {
        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: "⚠️ تعذر العثور على فرع نشط للمطعم. يرجى التواصل معنا مباشرة.",
        });
        return;
      }

      const orderService = (await import("../orders/order.service.js")).default;

      const orderPayload = {
        source: "WHATSAPP",
        type: "DELIVERY",
        customerPhone,
        customerName: "عميل واتساب",
        notes: conv.address ? `توصيل واتساب - العنوان: ${conv.address}` : "توصيل واتساب",
        items: currentCart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      };

      try {
        const orderResult = await orderService.createOrder(tenantContext, mainBranch.id, orderPayload);
        const orderData = orderResult.data || orderResult;

        await automationRepository.updateConversation(tenantContext, conv.id, {
          state: "WELCOME",
          cart: [],
          address: null,
          selectedCategoryId: null,
          lastInboundAt: new Date(),
        });

        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: `🎉 *تم تسجيل طلبك بنجاح!*\n\nرقم الطلب: *#${orderData.orderNumber || orderData.id}*\nالإجمالي: *${Number(orderData.total || 0).toFixed(2)} ج.م*\n\nسنقوم بمتابعة طلبك وإبلاغك بالتحديثات. شكراً لك!`,
        });
        return;
      } catch (err) {
        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: "⚠️ حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة لاحقاً أو التواصل معنا مباشرة.",
        });
        return;
      }
    }

    if (normalized === "1") {
      return this.sendCategoriesMenu(tenantContext, conv, customerPhone);
    }
    if (normalized === "2") {
      return this.sendCartSummary(tenantContext, conv, customerPhone, currentCart);
    }
    if (normalized === "3") {
      return this.promptAddress(tenantContext, conv, customerPhone, currentCart);
    }
    if (normalized === "4") {
      return this.trackOrder(tenantContext, customerPhone);
    }
    if (normalized === "5") {
      return this.sendFaq(tenantContext, customerPhone);
    }
    if (normalized === "6") {
      return this.triggerHandoff(tenantContext, conv, customerPhone);
    }

    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: WELCOME_TEXT,
    });
  }

  async sendCategoriesMenu(tenantContext, conv, customerPhone) {
    const { items: categories } = await menuRepository.findCategories(tenantContext, { limit: 20 });
    if (!categories || categories.length === 0) {
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: "📋 المنيو غير متوفر حالياً. يرجى المحاولة لاحقاً.",
      });
      return;
    }

    let text = "📋 *قائمة الطعام:*\n\n";
    categories.forEach((cat, idx) => {
      text += `${idx + 1}. ${cat.name}\n`;
    });
    text += "\nأرسل رقم الفئة لعرض منتجاتها (مثال: 1).";

    await automationRepository.updateConversation(tenantContext, conv.id, {
      state: "MAIN_MENU",
      lastInboundAt: new Date(),
    });

    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text,
    });
  }

  async sendCartSummary(tenantContext, conv, customerPhone, currentCart) {
    if (currentCart.length === 0) {
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: "🛒 سلة التسوق فارغة حالياً.\nأرسل *1* لمشاهدة المنيو وإضافة منتجات.",
      });
      return;
    }

    let total = 0;
    let text = "🛒 *سلة التسوق الحالية:*\n\n";
    currentCart.forEach((item, idx) => {
      const itemTotal = Number(item.unitPrice) * item.quantity;
      total += itemTotal;
      text += `${idx + 1}. ${item.quantity}x ${item.productName} (${itemTotal.toFixed(2)} ج.م)\n`;
    });
    text += `\n*الإجمالي:* ${total.toFixed(2)} ج.م\n\nأرسل *3* لتحديد العنوان والدفع، أو *0* للبدء من جديد.`;

    await automationRepository.updateConversation(tenantContext, conv.id, {
      state: "CART",
      lastInboundAt: new Date(),
    });

    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text,
    });
  }

  async promptAddress(tenantContext, conv, customerPhone, currentCart) {
    if (currentCart.length === 0) {
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: "🛒 سلتك فارغة! يرجى أرسل *1* لاختيار منتجات أولاً.",
      });
      return;
    }

    await automationRepository.updateConversation(tenantContext, conv.id, {
      state: "ADDRESS",
      lastInboundAt: new Date(),
    });

    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: "📍 *إدخال العنوان:*\nبرجاء كتابة عنوان التوصيل الخاص بك بالتفصيل (مثال: شارع النصر، المعادي، شقة 4).",
    });
  }

  async trackOrder(tenantContext, customerPhone) {
    const lastOrder = await prisma.order.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        customer: { phone: customerPhone },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lastOrder) {
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: "📦 لم نجد أوردرات سابقة مسجلة بهذا الرقم.",
      });
      return;
    }

    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: `📦 *حالة طلبك الأخير (#${lastOrder.orderNumber}):*\nالحالة: *${lastOrder.status}*\nالإجمالي: *${lastOrder.total} ج.م*\nالتاريخ: ${new Date(lastOrder.createdAt).toLocaleTimeString("ar-EG")}`,
    });
  }

  async sendFaq(tenantContext, customerPhone) {
    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: "❓ *مواعيد العمل والدعم:*\nنعمل يومياً من الساعة 10 صباحاً وحتى 12 منتصف الليل.\nللتواصل المباشر مع موظف الدعم أرسل *6* أو *agent*.",
    });
  }

  async triggerHandoff(tenantContext, conv, customerPhone) {
    await automationRepository.updateConversationStatus(tenantContext, conv.id, "WAITING_AGENT");
    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: "👨‍💼 *تم تحويل المحادثة إلى أحد ممثلي خدمة العملاء.*\nسيتواصل معك أحد موظفينا في أقرب وقت.",
    });

    try {
      const { inboxService } = await import("../inbox/inbox.service.js");
      await inboxService.createFromWhatsApp(tenantContext, conv, customerPhone);
    } catch (err) {

    }
  }

  async listConversations(tenantContext, query = {}) {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

    const result = await automationRepository.listConversations(tenantContext, {
      page,
      limit,
      status: query.status,
    });

    const totalPages = Math.ceil(result.total / limit) || 1;

    return {
      items: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
      },
    };
  }

  async getConversationById(tenantContext, id) {
    const conv = await automationRepository.findConversationById(tenantContext, id);
    if (!conv) {
      throw new NotFoundError("Conversation not found or access denied");
    }
    return conv;
  }

  async handoffConversation(tenantContext, id) {
    await this.getConversationById(tenantContext, id);
    await automationRepository.updateConversationStatus(tenantContext, id, "WAITING_AGENT");
    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      action: "handoff",
    });
    return this.getConversationById(tenantContext, id);
  }

  async closeConversation(tenantContext, id) {
    await this.getConversationById(tenantContext, id);
    await automationRepository.updateConversationStatus(tenantContext, id, "CLOSED");
    emitEvent(DomainEvent.CONVERSATION_UPDATED, {
      restaurantId: tenantContext.restaurantId,
      conversationId: id,
      action: "closed",
    });
    return this.getConversationById(tenantContext, id);
  }
}

export const whatsAppAutomationService = new WhatsAppAutomationService();
export default whatsAppAutomationService;
