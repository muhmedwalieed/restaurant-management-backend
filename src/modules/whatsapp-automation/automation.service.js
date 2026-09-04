import automationRepository from "./automation.repository.js";
import menuRepository from "../menu/menu.repository.js";
import branchRepository from "../branches/branch.repository.js";
import whatsAppService from "../whatsapp/whatsapp.service.js";
import orderService from "../orders/order.service.js";
import prisma from "../../lib/prisma.js";
import logger from "../../config/logger.js";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
import { paginateResponse } from "../../shared/utils/pagination.js";

import templateService from "../templates/template.service.js";
import { parseFeedbackRating, isExplicitFeedbackText } from "./feedback.parser.js";

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
      const welcomeText = await templateService.render("WHATSAPP_WELCOME", tenantContext);
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: welcomeText,
      });
      return;
    }

    // 1. Check if customer is rating (either explicit feedback text or single digit '5'/'٥' which is not in welcome menu 1-4)
    const ratingValue = parseFeedbackRating(content);
    const isExplicitRating = isExplicitFeedbackText(content);
    const isFiveRating = ratingValue === 5 && (normalized === "5" || normalized === "٥");

    if (ratingValue !== null && (isExplicitRating || isFiveRating)) {
      try {
        const { inboxRepository } = await import("../inbox/inbox.repository.js");
        const lastClosed = await inboxRepository.findLastClosedTicketByPhone(tenantContext, customerPhone);
        if (lastClosed && lastClosed.ticketType !== "ORDER" && !lastClosed.feedbackRating && lastClosed.closedAt) {
          const hoursSinceClose = (Date.now() - new Date(lastClosed.closedAt).getTime()) / (1000 * 60 * 60);
          if (hoursSinceClose <= 48) {
            const { inboxService } = await import("../inbox/inbox.service.js");
            await inboxService.submitCustomerFeedback(tenantContext, lastClosed.id, {
              rating: ratingValue,
              resolved: ratingValue >= 3,
            });
            await automationRepository.updateConversation(tenantContext, conv.id, {
              state: "WELCOME",
              status: "ACTIVE",
              cart: [],
              selectedCategoryId: null,
              address: null,
              lastInboundAt: new Date(),
            });
            return;
          }
        }

        // Check if rating is for a recently delivered order
        const { getPhoneVariants } = await import("../../shared/utils/phone.js");
        const variants = getPhoneVariants(customerPhone);

        const ratedLogs = await prisma.auditLog.findMany({
          where: {
            restaurantId: tenantContext.restaurantId,
            action: "ORDER_RATED",
            entityType: "Order",
          },
          select: { entityId: true },
        });
        const ratedOrderIds = ratedLogs.map((l) => l.entityId).filter(Boolean);

        const lastDeliveredOrder = await prisma.order.findFirst({
          where: {
            restaurantId: tenantContext.restaurantId,
            customer: { phone: { in: variants } },
            status: "DELIVERED",
            ...(ratedOrderIds.length > 0 ? { id: { notIn: ratedOrderIds } } : {}),
          },
          orderBy: { updatedAt: "desc" },
        });

        if (lastDeliveredOrder) {
          const hoursSinceDelivery = (Date.now() - new Date(lastDeliveredOrder.updatedAt).getTime()) / (1000 * 60 * 60);
          if (hoursSinceDelivery <= 48) {
            await prisma.auditLog.create({
              data: {
                restaurantId: tenantContext.restaurantId,
                action: "ORDER_RATED",
                entityType: "Order",
                entityId: lastDeliveredOrder.id,
                metadata: {
                  rating: ratingValue,
                  customerPhone,
                  orderNumber: lastDeliveredOrder.orderNumber,
                },
              },
            });

            const thankYou =
              ratingValue >= 4
                ? await templateService.render("WHATSAPP_FEEDBACK_POSITIVE", tenantContext, {
                    rating: ratingValue,
                    orderNumber: lastDeliveredOrder.orderNumber,
                  })
                : await templateService.render("WHATSAPP_FEEDBACK_CONSTRUCTIVE", tenantContext, {
                    rating: ratingValue,
                    orderNumber: lastDeliveredOrder.orderNumber,
                  });

            await whatsAppService.sendMessage(tenantContext, {
              to: customerPhone,
              text: thankYou,
            });
            await automationRepository.updateConversation(tenantContext, conv.id, {
              state: "WELCOME",
              status: "ACTIVE",
              cart: [],
              selectedCategoryId: null,
              address: null,
              lastInboundAt: new Date(),
            });
            return;
          }
        }
      } catch (err) {
        console.error("Error processing customer feedback rating:", err);
      }
    }

    // 2. If conversation is currently assigned to a human agent, forward message directly to the ticket
    if (conv.status === "WAITING_AGENT") {
      try {
        const { inboxService } = await import("../inbox/inbox.service.js");
        await inboxService.recordCustomerMessage(
          tenantContext,
          conv.id,
          customerPhone,
          content
        );
      } catch (inboxErr) {
        console.error("Error forwarding customer message to inbox:", inboxErr);
      }
      return;
    }

    // 3. State: SUPPORT_CATEGORY_SELECT (هل بخصوص أوردر سابق أم موضوع آخر)
    if (conv.state === "SUPPORT_CATEGORY_SELECT") {
      if (content === "1" || normalized.includes("طلب") || normalized.includes("اوردر") || normalized.includes("أوردر") || normalized.includes("سابق")) {
        return this.handleSupportForPreviousOrder(tenantContext, conv, customerPhone);
      }

      if (content === "2" || normalized.includes("اخر") || normalized.includes("أخر") || normalized.includes("تاني") || normalized.includes("تانية") || normalized.includes("موضوع")) {
        await automationRepository.updateConversation(tenantContext, conv.id, {
          state: "SUPPORT_DETAILS_PROMPT",
          lastInboundAt: new Date(),
        });

        const promptText = await templateService.render("WHATSAPP_SUPPORT_DETAILS_PROMPT", tenantContext);
        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: promptText,
        });
        return;
      }

      // Invalid input in support category
      const invalidCatText = await templateService.render("WHATSAPP_SUPPORT_CATEGORY_INVALID", tenantContext);
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: invalidCatText,
      });
      return;
    }

    // 4. State: SUPPORT_DETAILS_PROMPT (كتابة الاسم والسبب وفتح تذكرة شكوى)
    if (conv.state === "SUPPORT_DETAILS_PROMPT") {
      return this.handleSupportDetailsSubmit(tenantContext, conv, customerPhone, content);
    }

    const currentCart = Array.isArray(conv.cart) ? conv.cart : [];

    // 5. State: CONFIRM_ORDER
    if (conv.state === "CONFIRM_ORDER" && (normalized === "confirm" || normalized === "نعم" || normalized === "تاكيد" || normalized === "تأكيد")) {
      if (currentCart.length === 0) {
        const emptyCartText = await templateService.render("WHATSAPP_CART_EMPTY", tenantContext);
        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: emptyCartText,
        });
        return;
      }

      const { items: branches } = await branchRepository.findBranches(
        tenantContext,
        { limit: 20 }
      ).catch(() => ({ items: [] }));

      const mainBranch = branches.find((b) => b.isMain) || branches[0];
      if (!mainBranch) {
        const noBranchText = await templateService.render("WHATSAPP_NO_BRANCH_AVAILABLE", tenantContext);
        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: noBranchText,
        });
        return;
      }

      let subtotal = 0;
      const orderItemsData = currentCart.map((item) => {
        const itemTotal = Number(item.unitPrice) * item.quantity;
        subtotal += itemTotal;
        return {
          restaurantId: tenantContext.restaurantId,
          productId: item.productId,
          productName: item.productName,
          unitPrice: Number(item.unitPrice),
          quantity: item.quantity,
          subtotal: itemTotal,
        };
      });

      let customer = await prisma.customer.findFirst({
        where: { restaurantId: tenantContext.restaurantId, phone: customerPhone },
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            restaurantId: tenantContext.restaurantId,
            name: `عميل واتساب (${customerPhone.slice(-4)})`,
            phone: customerPhone,
          },
        });
      }

      const orderResult = await orderService.createOrder(tenantContext, mainBranch.id, {
        source: "WHATSAPP",
        type: "DELIVERY",
        customerId: customer.id,
        customerPhone,
        customerName: customer.name,
        address: conv.address || "العنوان عبر الواتساب",
        items: currentCart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });

      const createdOrder = orderResult.data;

      await automationRepository.updateConversation(tenantContext, conv.id, {
        state: "WELCOME",
        status: "ACTIVE",
        cart: [],
        address: null,
      });

      const totalFormatted = Number(createdOrder.total).toFixed(2);
      const confirmText = await templateService.render("WHATSAPP_ORDER_CONFIRMED", tenantContext, {
        orderNumber: createdOrder.orderNumber,
        total: totalFormatted,
        address: createdOrder.address || "العنوان عبر الواتساب",
        customerName: customer?.name || customerPhone,
      });
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: confirmText,
      });

      return;
    }

    // 6. State: ADDRESS
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

      const summaryText = await templateService.render("WHATSAPP_CART_SUMMARY", tenantContext, {
        address: content,
        cartSummary: cartSummary.trimEnd(),
        total: total.toFixed(2),
      });

      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: summaryText,
      });
      return;
    }

    // 7. State: PRODUCT_SELECT
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

        const addedText = await templateService.render("WHATSAPP_ITEM_ADDED", tenantContext, {
          productName: targetProduct.name,
        });
        await whatsAppService.sendMessage(tenantContext, {
          to: customerPhone,
          text: addedText,
        });
        return;
      }
    }

    // 8. State: MAIN_MENU / MENU_CATEGORY
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
          const emptyMenuText = await templateService.render("WHATSAPP_MENU_EMPTY", tenantContext, {
            categoryName: targetCategory.name,
          });
          await whatsAppService.sendMessage(tenantContext, {
            to: customerPhone,
            text: emptyMenuText,
          });
          return;
        }

        let text = `*منتجات فئة ${targetCategory.name}:*\n\n`;
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

    // 9. State: CART specific actions
    if (conv.state === "CART") {
      if (normalized === "2" || normalized.includes("سلة") || normalized.includes("cart")) {
        return this.sendCartSummary(tenantContext, conv, customerPhone, currentCart);
      }
      if (normalized === "3" || normalized.includes("دفع") || normalized.includes("checkout") || normalized.includes("عنوان")) {
        return this.promptAddress(tenantContext, conv, customerPhone, currentCart);
      }
      if (normalized === "1" || normalized.includes("منيو") || normalized.includes("menu")) {
        return this.sendCategoriesMenu(tenantContext, conv, customerPhone);
      }
    }

    // 10. Main Menu / General Intents
    if (normalized === "6" || normalized.includes("human") || normalized.includes("موظف")) {
      try {
        const res = await this.triggerHandoff(tenantContext, conv, customerPhone);
        return res;
      } catch (err) {
        logger.error({ err: err.message }, "Error calling triggerHandoff");
      }
    }

    if (normalized === "2" || normalized.includes("دعم") || normalized.includes("support") || normalized.includes("خدمة العملاء") || normalized.includes("agent")) {
      return this.promptSupportCategory(tenantContext, conv, customerPhone);
    }

    if (normalized === "3" || normalized.includes("شكوى") || normalized.includes("شكوي") || normalized.includes("complaint") || normalized === "7") {
      return this.handleComplaintRequest(tenantContext, conv, customerPhone);
    }

    if (normalized === "4" || normalized.includes("track") || normalized.includes("تتبع") || normalized.includes("طلباتي")) {
      return this.trackOrder(tenantContext, customerPhone);
    }

    if (normalized === "1" || normalized.includes("menu") || normalized.includes("منيو") || normalized.includes("قائمة") || normalized.includes("طلب طعام")) {
      return this.sendCategoriesMenu(tenantContext, conv, customerPhone);
    }

    if (normalized.includes("help") || normalized.includes("faq") || normalized.includes("مساعدة")) {
      return this.sendFaq(tenantContext, customerPhone);
    }

    // Default Fallback
    const welcomeText = await templateService.render("WHATSAPP_WELCOME", tenantContext);
    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: welcomeText,
    });
  }

  async triggerHandoff(tenantContext, conv, customerPhone) {
    await automationRepository.updateConversationStatus(tenantContext, conv.id, "WAITING_AGENT");
    const handoffText = await templateService.render("WHATSAPP_HANDOFF", tenantContext);
    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: handoffText,
    });

    try {
      const { inboxService } = await import("../inbox/inbox.service.js");
      await inboxService.createFromWhatsApp(tenantContext, conv, customerPhone, {
        ticketType: "SUPPORT",
        subject: "طلب دعم فني من العميل",
      });
    } catch (inboxErr) {
      logger.warn({ err: inboxErr.message }, "Inbox handoff error in WhatsApp automation");
    }
  }

  async promptSupportCategory(tenantContext, conv, customerPhone) {
    await automationRepository.updateConversation(tenantContext, conv.id, {
      state: "SUPPORT_CATEGORY_SELECT",
      lastInboundAt: new Date(),
    });

    const supportCatText = await templateService.render("WHATSAPP_SUPPORT_CATEGORY", tenantContext);
    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: supportCatText,
    });
  }

  async handleSupportForPreviousOrder(tenantContext, conv, customerPhone) {
    let lastOrder = null;
    try {
      lastOrder = await prisma.order.findFirst({
        where: {
          restaurantId: tenantContext.restaurantId,
          customer: { phone: customerPhone },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (_) {}

    if (!lastOrder) {
      await automationRepository.updateConversation(tenantContext, conv.id, {
        state: "SUPPORT_DETAILS_PROMPT",
        lastInboundAt: new Date(),
      });

      const detailsPrompt = await templateService.render("WHATSAPP_SUPPORT_DETAILS_PROMPT", tenantContext);
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: detailsPrompt,
      });
      return;
    }

    await automationRepository.updateConversationStatus(tenantContext, conv.id, "WAITING_AGENT");

    try {
      const { inboxService } = await import("../inbox/inbox.service.js");
      const ticket = await inboxService.createFromWhatsApp(tenantContext, conv, customerPhone, {
        ticketType: "SUPPORT",
        subject: `استفسار دعم بخصوص أوردر #${lastOrder.orderNumber}`,
        relatedOrderId: lastOrder.id,
      });

      const ticketNum = ticket.ticketNumber ? `${ticket.ticketNumber}` : `${ticket.id.slice(-4)}`;
      const linkedOrderText = await templateService.render("WHATSAPP_SUPPORT_LINKED_ORDER", tenantContext, {
        orderNumber: lastOrder.orderNumber,
        total: Number(lastOrder.total).toFixed(2),
        status: lastOrder.status,
        ticketNumber: ticketNum,
      });
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: linkedOrderText,
      });
    } catch (_) {
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: "تم تحويل استفسارك بخصوص الطلب إلى أحد ممثلي الدعم وسيتواصل معك فوراً.",
      });
    }
  }

  async handleSupportDetailsSubmit(tenantContext, conv, customerPhone, content) {
    let customerName = "";
    let reason = content;

    if (content.includes("-") || content.includes(":") || content.includes("–")) {
      const parts = content.split(/[-:–]/);
      customerName = parts[0].trim();
      reason = parts.slice(1).join("-").trim();
    } else if (content.split(" ").length >= 2) {
      const words = content.split(" ");
      customerName = `${words[0]} ${words[1]}`;
      reason = content;
    }

    // Update or create Customer name in DB
    try {
      if (customerName) {
        await prisma.customer.upsert({
          where: {
            restaurantId_phone: {
              restaurantId: tenantContext.restaurantId,
              phone: customerPhone,
            },
          },
          update: { name: customerName },
          create: {
            restaurantId: tenantContext.restaurantId,
            phone: customerPhone,
            name: customerName,
          },
        });
      }
    } catch (_) {}

    await automationRepository.updateConversationStatus(tenantContext, conv.id, "WAITING_AGENT");

    try {
      const { inboxService } = await import("../inbox/inbox.service.js");
      const ticket = await inboxService.createFromWhatsApp(tenantContext, conv, customerPhone, {
        ticketType: "COMPLAINT",
        subject: reason || `شكوى واستفسار من ${customerName || customerPhone}`,
      });

      const ticketNum = ticket.ticketNumber ? `${ticket.ticketNumber}` : `${ticket.id.slice(-4)}`;
      const complaintCreatedText = await templateService.render("WHATSAPP_COMPLAINT_CREATED", tenantContext, {
        customerSalutation: customerName ? ` يا *${customerName}*` : "",
        ticketNumber: ticketNum,
        reason: reason || content,
      });
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: complaintCreatedText,
      });
    } catch (_) {
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: `شكراً لك! تم تسجيل استفسارك وتم تحويل المحادثة للموظف المختص وسيتواصل معك فوراً.`,
      });
    }
  }

  async sendCategoriesMenu(tenantContext, conv, customerPhone) {
    const { items: categories } = await menuRepository.findCategories(tenantContext, { limit: 20 });
    if (!categories || categories.length === 0) {
      const menuUnavailableText = await templateService.render("WHATSAPP_MENU_UNAVAILABLE", tenantContext);
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: menuUnavailableText,
      });
      return;
    }

    let text = "*قائمة الطعام (الأقسام):*\n\n";
    categories.forEach((cat, idx) => {
      text += `${idx + 1}. ${cat.name}\n`;
    });
    text += "\nأرسل رقم القسم لعرض الأصناف والأسعار.";

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
      const emptyCartText = await templateService.render("WHATSAPP_CART_EMPTY", tenantContext);
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: emptyCartText,
      });
      return;
    }

    let total = 0;
    let text = "*سلة التسوق الحالية:*\n\n";
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
      const emptyCartText = await templateService.render("WHATSAPP_CART_EMPTY", tenantContext);
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: emptyCartText,
      });
      return;
    }

    await automationRepository.updateConversation(tenantContext, conv.id, {
      state: "ADDRESS",
      lastInboundAt: new Date(),
    });

    const addressPromptText = await templateService.render("WHATSAPP_ADDRESS_PROMPT", tenantContext);
    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: addressPromptText,
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
      const notFoundText = await templateService.render("WHATSAPP_ORDER_NOT_FOUND", tenantContext);
      await whatsAppService.sendMessage(tenantContext, {
        to: customerPhone,
        text: notFoundText,
      });
      return;
    }

    const trackingText = await templateService.render("WHATSAPP_ORDER_TRACKING", tenantContext, {
      orderNumber: lastOrder.orderNumber,
      status: lastOrder.status,
      total: lastOrder.total,
      time: new Date(lastOrder.createdAt).toLocaleTimeString("ar-EG"),
    });

    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: trackingText,
    });
  }

  async sendFaq(tenantContext, customerPhone) {
    const faqText = await templateService.render("WHATSAPP_FAQ", tenantContext);
    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: faqText,
    });
  }

  async handleComplaintRequest(tenantContext, conv, customerPhone) {
    let lastOrder = null;
    try {
      lastOrder = await prisma.order.findFirst({
        where: {
          restaurantId: tenantContext.restaurantId,
          customer: { phone: customerPhone },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (_) {}

    const subject = lastOrder ? `شكوى بخصوص أوردر #${lastOrder.orderNumber}` : "شكوى من العميل";

    await automationRepository.updateConversationStatus(tenantContext, conv.id, "WAITING_AGENT");
    const orderRef = lastOrder ? ` بخصوص طلبك الأخير (#${lastOrder.orderNumber})` : "";
    const complaintText = await templateService.render("WHATSAPP_COMPLAINT_REGISTERED", tenantContext, {
      orderReference: orderRef,
    });
    await whatsAppService.sendMessage(tenantContext, {
      to: customerPhone,
      text: complaintText,
    });

    try {
      const { inboxService } = await import("../inbox/inbox.service.js");
      await inboxService.createFromWhatsApp(tenantContext, conv, customerPhone, {
        ticketType: "COMPLAINT",
        subject,
        relatedOrderId: lastOrder?.id || null,
      });
    } catch (_) {}
  }

  async listConversations(tenantContext, query = {}) {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

    const result = await automationRepository.listConversations(tenantContext, {
      page,
      limit,
      status: query.status,
    });

    return paginateResponse(result.items, result.total, page, limit);
  }

  async getConversationById(tenantContext, id) {
    const conv = await automationRepository.findConversationById(tenantContext, id);
    if (!conv) {
      throw new NotFoundError("Conversation not found or access denied");
    }
    return conv;
  }

  async handoffConversation(tenantContext, id) {
    const conv = await this.getConversationById(tenantContext, id);
    await automationRepository.updateConversationStatus(tenantContext, conv.id, "WAITING_AGENT");
    return automationRepository.findConversationById(tenantContext, conv.id);
  }

  async closeConversation(tenantContext, id) {
    const conv = await this.getConversationById(tenantContext, id);
    await automationRepository.updateConversationStatus(tenantContext, conv.id, "CLOSED");
    return automationRepository.findConversationById(tenantContext, conv.id);
  }
}

export const automationService = new WhatsAppAutomationService();
export const whatsAppAutomationService = automationService;
export default automationService;
