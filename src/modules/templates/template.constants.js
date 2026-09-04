export const TEMPLATE_CATEGORIES = {
  WHATSAPP_BOT: "بوت الواتساب التفاعلي",
  ORDER_STATUS: "إشعارات حالات الطلب",
  INBOX_SUPPORT: "خدمة العملاء والدعم الفني",
};

export const DEFAULT_TEMPLATES = {
  // 1. WhatsApp Bot Automation
  WHATSAPP_WELCOME: {
    key: "WHATSAPP_WELCOME",
    category: "WHATSAPP_BOT",
    title: "رسالة الترحيب الرئيسية",
    description: "الرسالة التي يستلمها العميل عند بدء المحادثة مع البوت أو إرسال start أو reset",
    allowedVariables: ["restaurantName"],
    defaultText:
      "*أهلاً بك في مطعمنا!*\n" +
      "كيف يمكننا مساعدتك اليوم؟ يرجى اختيار أحد الأرقام التالية:\n\n" +
      "1. طلب أوردر جديد (المنيو)\n" +
      "2. الدعم الفني وخدمة العملاء\n" +
      "3. تقديم شكوى\n" +
      "4. متابعة طلباتي السابقة\n\n" +
      "أرسل رقم الخيار أو الكلمة المطلوبة.",
  },

  WHATSAPP_MENU_EMPTY: {
    key: "WHATSAPP_MENU_EMPTY",
    category: "WHATSAPP_BOT",
    title: "تنبيه عدم توفر أصناف في القسم",
    description: "يظهر للعميل عند اختيار قسم لا يحتوي على أصناف متاحة",
    allowedVariables: ["categoryName"],
    defaultText: "لا توجد منتجات متوفرة حالياً في فئة *{{categoryName}}*.\nأرسل *1* للعودة إلى الفئات.",
  },

  WHATSAPP_CART_EMPTY: {
    key: "WHATSAPP_CART_EMPTY",
    category: "WHATSAPP_BOT",
    title: "رسالة السلة الفارغة",
    description: "تظهر عندما يحاول العميل عرض السلة أو الدفع وهي فارغة",
    allowedVariables: [],
    defaultText: "سلة التسوق فارغة حالياً.\nأرسل *1* لمشاهدة المنيو وإضافة منتجات.",
  },

  WHATSAPP_ITEM_ADDED: {
    key: "WHATSAPP_ITEM_ADDED",
    category: "WHATSAPP_BOT",
    title: "تأكيد إضافة منتج للسلة",
    description: "تظهر بعد اختيار العميل لمنتج وإضافته إلى السلة بنجاح",
    allowedVariables: ["productName"],
    defaultText: "تم إضافة *{{productName}}* إلى السلة!\n\nأرسل *2* لعرض السلة، *3* لإدخال العنوان والدفع، أو *1* لمواصلة التسوق.",
  },

  WHATSAPP_ADDRESS_PROMPT: {
    key: "WHATSAPP_ADDRESS_PROMPT",
    category: "WHATSAPP_BOT",
    title: "طلب عنوان التوصيل",
    description: "تظهر لمطالبة العميل بكتابة عنوان التوصيل بالتفصيل",
    allowedVariables: [],
    defaultText: "*إدخال العنوان:*\nبرجاء كتابة عنوان التوصيل الخاص بك بالتفصيل (مثال: شارع النصر، المعادي، شقة 4).",
  },

  WHATSAPP_CART_SUMMARY: {
    key: "WHATSAPP_CART_SUMMARY",
    category: "WHATSAPP_BOT",
    title: "ملخص السلة وتأكيد الطلب",
    description: "تظهر للعميل بعد تسجيل العنوان لمراجعة الأصناف والإجمالي قبل التأكيد",
    allowedVariables: ["address", "cartSummary", "total"],
    defaultText: "تم تسجيل العنوان: *{{address}}*\n\n*ملخص الطلب:*\n{{cartSummary}}\n*الإجمالي النهائي:* {{total}} ج.م\n\nأرسل *نعم* أو *confirm* لتأكيد الطلب نهائياً.",
  },

  WHATSAPP_ORDER_CONFIRMED: {
    key: "WHATSAPP_ORDER_CONFIRMED",
    category: "WHATSAPP_BOT",
    title: "تأكيد استلام الطلب ونجاحه",
    description: "تظهر فور إنشاء الطلب بنجاح للعميل",
    allowedVariables: ["orderNumber", "total", "address", "customerName"],
    defaultText: "*تم استلام طلبك بنجاح!*\nرقم الطلب: *#{{orderNumber}}*\nالإجمالي: *{{total}} ج.م*\nالعنوان: *{{address}}*\n\nسنقوم بتجهيز وتوصيل طلبك في أقرب وقت. شكراً لاختيارك لنا!",
  },

  WHATSAPP_ORDER_TRACKING: {
    key: "WHATSAPP_ORDER_TRACKING",
    category: "WHATSAPP_BOT",
    title: "تتبع حالة الطلب الأخير",
    description: "تظهر عندما يطلب العميل تتبع أحدث طلب له",
    allowedVariables: ["orderNumber", "status", "total", "time"],
    defaultText: "*حالة طلبك الأخير (#{{orderNumber}}):*\nالحالة: *{{status}}*\nالإجمالي: *{{total}} ج.م*\nالتاريخ: {{time}}",
  },

  WHATSAPP_ORDER_NOT_FOUND: {
    key: "WHATSAPP_ORDER_NOT_FOUND",
    category: "WHATSAPP_BOT",
    title: "عدم العثور على طلبات سابقة",
    description: "تظهر عند طلب العميل التتبع ولكن لا توجد طلبات مسجلة برقم هاتفه",
    allowedVariables: [],
    defaultText: "لم نجد أوردرات سابقة مسجلة بهذا الرقم.",
  },

  WHATSAPP_HANDOFF: {
    key: "WHATSAPP_HANDOFF",
    category: "WHATSAPP_BOT",
    title: "تحويل المحادثة لموظف الدعم",
    description: "تظهر عندما يطلب العميل التحدث مع موظف بشري",
    allowedVariables: [],
    defaultText: "*تم تحويل المحادثة إلى أحد ممثلي خدمة العملاء.*\nسيتواصل معك أحد موظفينا في أقرب وقت.",
  },

  WHATSAPP_SUPPORT_CATEGORY: {
    key: "WHATSAPP_SUPPORT_CATEGORY",
    category: "WHATSAPP_BOT",
    title: "قائمة تصنيف الدعم الفني",
    description: "تسأل العميل إن كان الدعم بخصوص أوردر سابق أم استفسار آخر",
    allowedVariables: [],
    defaultText:
      "*قسم الدعم الفني وخدمة العملاء*\n\n" +
      "هل استفسارك بخصوص:\n" +
      "1. طلب أو أوردر قمت به سابقاً؟\n" +
      "2. موضوع أو استفسار آخر؟\n\n" +
      "أرسل رقم *1* أو *2*.",
  },

  WHATSAPP_SUPPORT_DETAILS_PROMPT: {
    key: "WHATSAPP_SUPPORT_DETAILS_PROMPT",
    category: "WHATSAPP_BOT",
    title: "طلب تفاصيل استفسار الدعم",
    description: "تطلب من العميل كتابة اسمه وتفاصيل استفساره أو شكواه",
    allowedVariables: [],
    defaultText:
      "*تفاصيل الاستفسار:*\n\n" +
      "يرجى كتابة اسمك الكريم وسبب أو تفاصيل استفسارك في رسالة واحدة:\n" +
      "(مثال: أحمد علي - استفسار عن حجز طاولة لمناسبة)",
  },

  WHATSAPP_COMPLAINT_REGISTERED: {
    key: "WHATSAPP_COMPLAINT_REGISTERED",
    category: "WHATSAPP_BOT",
    title: "تأكيد تسجيل تذكرة شكوى",
    description: "تظهر بعد تسجيل تذكرة شكوى للعميل وتحويله للمشرف",
    allowedVariables: ["orderReference"],
    defaultText: "*تم تسجيل تذكرة شكوى{{orderReference}}.*\n\nتم تحويل المحادثة للمشرف وسيتواصل معك لحل المشكلة في أقرب وقت.",
  },

  WHATSAPP_FAQ: {
    key: "WHATSAPP_FAQ",
    category: "WHATSAPP_BOT",
    title: "مواعيد العمل والأسئلة الشائعة",
    description: "تظهر عندما يسأل العميل عن المساعدة ومواعيد العمل",
    allowedVariables: [],
    defaultText: "*مواعيد العمل والدعم:*\nنعمل يومياً من الساعة 10 صباحاً وحتى 12 منتصف الليل.\nللتواصل المباشر مع موظف الدعم أرسل *2*.",
  },

  WHATSAPP_SUPPORT_CATEGORY_INVALID: {
    key: "WHATSAPP_SUPPORT_CATEGORY_INVALID",
    category: "WHATSAPP_BOT",
    title: "تنبيه خيار دعم غير صحيح",
    description: "تظهر عند إدخال العميل خياراً غير صحيح في قائمة تصنيف الدعم",
    allowedVariables: [],
    defaultText:
      "يرجى الرد برقم:\n" +
      "*1*: إذا كان الاستفسار بخصوص طلب سابق\n" +
      "*2*: إذا كان بخصوص موضوع أو استفسار آخر\n\n" +
      "أو أرسل *0* للرجوع للقائمة الرئيسية.",
  },

  WHATSAPP_NO_BRANCH_AVAILABLE: {
    key: "WHATSAPP_NO_BRANCH_AVAILABLE",
    category: "WHATSAPP_BOT",
    title: "تنبيه عدم توفر فرع متاح للطلب",
    description: "تظهر عند محاولة إتمام الطلب في حالة عدم وجود فرع نشط",
    allowedVariables: [],
    defaultText: "تعذر إتمام الطلب لعدم وجود فرع متاح حالياً.",
  },

  WHATSAPP_SUPPORT_LINKED_ORDER: {
    key: "WHATSAPP_SUPPORT_LINKED_ORDER",
    category: "WHATSAPP_BOT",
    title: "تأكيد ربط استفسار الدعم بالطلب الأخير",
    description: "تظهر للعميل عند فتح تذكرة دعم مرتبطة بآخر طلب قام به",
    allowedVariables: ["orderNumber", "total", "status", "ticketNumber"],
    defaultText:
      "*تم ربط استفسارك بطلبك الأخير (#{{orderNumber}})*\n" +
      "الإجمالي: {{total}} ج.م | الحالة: {{status}}\n\n" +
      "تم فتح تذكرة دعم برقم *#T-{{ticketNumber}}* وتم تحويلك لأحد ممثلي الدعم وسيتواصل معك فوراً للمساعدة.",
  },

  WHATSAPP_COMPLAINT_CREATED: {
    key: "WHATSAPP_COMPLAINT_CREATED",
    category: "WHATSAPP_BOT",
    title: "تأكيد فتح تذكرة شكوى واستفسار",
    description: "تظهر للعميل عند فتح تذكرة شكوى جديدة بعد كتابة تفاصيل استفساره",
    allowedVariables: ["customerSalutation", "ticketNumber", "reason"],
    defaultText:
      "أهلاً بك{{customerSalutation}}!\n" +
      "تم فتح تذكرة شكوى ودعم جديدة برقم *#T-{{ticketNumber}}* بعنوان: \"{{reason}}\".\n\n" +
      "تم تحويل المحادثة لمسؤول الدعم وسيتواصل معك خطوة بخطوة الآن!",
  },

  WHATSAPP_MENU_UNAVAILABLE: {
    key: "WHATSAPP_MENU_UNAVAILABLE",
    category: "WHATSAPP_BOT",
    title: "تنبيه عدم توفر قائمة الطعام حالياً",
    description: "تظهر للعميل عند طلب قائمة الطعام ولم تكن هناك فئات مدخلة",
    allowedVariables: [],
    defaultText: "قائمة الطعام غير متوفرة حالياً، يرجى المحاولة لاحقاً.",
  },

  WHATSAPP_FEEDBACK_POSITIVE: {
    key: "WHATSAPP_FEEDBACK_POSITIVE",
    category: "WHATSAPP_BOT",
    title: "شكر للتقييم الإيجابي (4-5 نجوم)",
    description: "تظهر بعد إرسال العميل تقييم 4 أو 5 نجوم للطلب",
    allowedVariables: ["rating", "orderNumber"],
    defaultText: "نشكرك جزيلاً على تقييمك الرائع ({{rating}}/5) لطلبك رقم #{{orderNumber}}! يسعدنا دائماً خدمتك ونتمنى لك يوماً سعيداً.",
  },

  WHATSAPP_FEEDBACK_CONSTRUCTIVE: {
    key: "WHATSAPP_FEEDBACK_CONSTRUCTIVE",
    category: "WHATSAPP_BOT",
    title: "شكر واعتذار للتقييم المنخفض (1-3 نجوم)",
    description: "تظهر بعد إرسال العميل تقييم 1 أو 2 أو 3 نجوم للطلب",
    allowedVariables: ["rating", "orderNumber"],
    defaultText: "نشكرك على تقييمك ومشاركتنا رأيك ({{rating}}/5) بخصوص طلبك رقم #{{orderNumber}}. نعتذر إن كانت هناك أي ملاحظات، وسنعمل فوراً على تحسين خدماتنا!",
  },

  // 2. Lifecycle Order Status Updates
  ORDER_STATUS_CONFIRMED: {
    key: "ORDER_STATUS_CONFIRMED",
    category: "ORDER_STATUS",
    title: "إشعار تأكيد وبدء تجهيز الطلب",
    description: "يُرسل عبر الواتساب للعميل فور تأكيد الطلب من الكاشير أو الإدارة",
    allowedVariables: ["orderNumber", "customerName"],
    defaultText: "*تحديث طلبك #{{orderNumber}}:*\nتم تأكيد طلبك بنجاح والمطعم بدأ الآن في تجهيزه وتحضيره بعناية!\nسنقوم بإعلامك فور خروج الطلب للتوصيل.",
  },

  ORDER_STATUS_OUT_FOR_DELIVERY: {
    key: "ORDER_STATUS_OUT_FOR_DELIVERY",
    category: "ORDER_STATUS",
    title: "إشعار خروج الطلب للتوصيل",
    description: "يُرسل للعميل فور تسليم الطلب لمندوب التوصيل",
    allowedVariables: ["orderNumber", "addressText", "customerName"],
    defaultText: "*طلبك #{{orderNumber}} في الطريق إليك!*\nمندوب التوصيل انطلق الآن لتوصيل طلبك.{{addressText}}\nيرجى الاستعداد للاستلام.",
  },

  ORDER_STATUS_DELIVERED: {
    key: "ORDER_STATUS_DELIVERED",
    category: "ORDER_STATUS",
    title: "إشعار تسليم الطلب وطلب التقييم",
    description: "يُرسل للعميل بعد تسليم الطلب مباشرة ومعه استبيان التقييم",
    allowedVariables: ["orderNumber", "customerName"],
    defaultText:
      "*تم تسليم طلبك #{{orderNumber}} بنجاح!*\nألف هنا وشفا!\nنتمنى أن تنال الوجبة وخدمة التوصيل إعجابك.\n\n" +
      "نسعد بتقييمك لتجربتك معنا بالرد برقم:\n" +
      "5: ممتاز جداً\n" +
      "4: جيد جداً\n" +
      "3: مقبول\n" +
      "2: سيء\n" +
      "1: سيء جداً",
  },

  // 3. Customer Service & Support Inbox
  INBOX_TICKET_CREATED: {
    key: "INBOX_TICKET_CREATED",
    category: "INBOX_SUPPORT",
    title: "رسالة فتح تذكرة دعم للعميل",
    description: "تُرسل للعميل عند إنشاء تذكرة دعم جديدة له في النظام",
    allowedVariables: ["ticketNumber", "subject", "customerName"],
    defaultText: "مرحباً بك! تم فتح تذكرة دعم جديدة رقم {{ticketNumber}} بعنوان \"{{subject}}\".\nسيتواصل معك أحد مسؤولي خدمة العملاء في أقرب وقت للمساعدة.",
  },

  INBOX_AGENT_ASSIGNED: {
    key: "INBOX_AGENT_ASSIGNED",
    category: "INBOX_SUPPORT",
    title: "رسالة إسناد موظف للتذكرة",
    description: "تُرسل للعميل عند استلام أحد الموظفين لتذكرته والبدء في متابعتها",
    allowedVariables: ["agentName", "ticketNumber", "customerName"],
    defaultText: "مرحباً! معك الآن الموظف ({{agentName}}) من خدمة العملاء بخصوص تذكرتك رقم {{ticketNumber}}. سأكون معك خطوة بخطوة لحل مشكلتك.",
  },

  INBOX_TICKET_CLOSED_SURVEY: {
    key: "INBOX_TICKET_CLOSED_SURVEY",
    category: "INBOX_SUPPORT",
    title: "رسالة إغلاق التذكرة واستبيان الرضا",
    description: "تُرسل للعميل عند إغلاق أو حل التذكرة لتقييم أداء موظف الدعم",
    allowedVariables: ["ticketNumber", "customerName"],
    defaultText:
      "شكراً لتواصلك معنا!\nتم إغلاق تذكرتك رقم {{ticketNumber}}.\n\n" +
      "نسعد بتقييمك لتجربتك مع خدمة العملاء بالرد برقم:\n" +
      "5: ممتاز جداً\n" +
      "4: جيد جداً\n" +
      "3: مقبول\n" +
      "2: سيء\n" +
      "1: سيء جداً\n\n" +
      "رأيك يساعدنا في تحسين وتطوير خدماتنا!",
  },

  INBOX_FEEDBACK_THANK_YOU: {
    key: "INBOX_FEEDBACK_THANK_YOU",
    category: "INBOX_SUPPORT",
    title: "شكر بعد تقييم التذكرة",
    description: "تُرسل للعميل بعد إرسال تقييمه لتجربة خدمة العملاء",
    allowedVariables: ["customerName"],
    defaultText: "نشكرك جزيلاً على تقييمك ومشاركتنا رأيك! نسعى دائماً لتقديم أفضل تجربة لك.",
  },
};

export const ALLOWED_TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);
