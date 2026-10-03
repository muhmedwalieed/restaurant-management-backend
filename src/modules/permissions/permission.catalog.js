export const MODULE_METADATA = {
  orders: {
    key: "orders",
    title: "Orders & POS",
    titleAr: "إدارة الطلبات ونقطة البيع (POS)",
  },
  kds: {
    key: "kds",
    title: "Kitchen Display System (KDS)",
    titleAr: "شاشة المطبخ (KDS)",
  },
  menu: {
    key: "menu",
    title: "Menu & Catalog",
    titleAr: "قائمة الطعام والمنتجات",
  },
  tables: {
    key: "tables",
    title: "Tables & Dining Room",
    titleAr: "الطاولات وصالة الطعام",
  },
  employees: {
    key: "employees",
    title: "Employees & Roles",
    titleAr: "الموظفون والأدوار الوظيفية",
  },
  branches: {
    key: "branches",
    title: "Branches & Locations",
    titleAr: "الفروع والمواقع",
  },
  customers: {
    key: "customers",
    title: "Customers Management",
    titleAr: "بيانات وإدارة العملاء",
  },
  whatsapp: {
    key: "whatsapp",
    title: "WhatsApp Channel",
    titleAr: "قناة واتساب (WhatsApp)",
  },
  chats: {
    key: "chats",
    title: "Unified Inbox",
    titleAr: "صندوق المحادثات والرسائل",
  },
  dashboard: {
    key: "dashboard",
    title: "Analytics & Dashboard",
    titleAr: "لوحة التحكم والتقارير والتحليلات",
  },
  coupons: {
    key: "coupons",
    title: "Coupons & Promotions",
    titleAr: "الكوبونات والعروض الترويجية",
  },
  notifications: {
    key: "notifications",
    title: "Notifications & Alerts",
    titleAr: "التنبيهات والإشعارات",
  },
  audit: {
    key: "audit",
    title: "Audit & Security Logs",
    titleAr: "سجلات النظام والأمان (Audit Logs)",
  },
  restaurants: {
    key: "restaurants",
    title: "Restaurant Settings",
    titleAr: "إعدادات المطعم الرئيسية",
  },
  delivery: {
    key: "delivery",
    title: "Delivery & Drivers",
    titleAr: "إدارة التوصيل ومندوبي التوصيل",
  },
};

export const GLOBAL_PERMISSIONS = [
  // --- Orders & POS ---
  {
    key: "orders.view",
    name: "View Orders",
    nameAr: "عرض قائمة الطلبات وسجل التفاصيل",
    description: "View branch orders and order timeline history",
    descriptionAr: "عرض قائمة الطلبات وتفاصيلها وسجل الحالات التشغيلية",
    module: "orders",
  },
  {
    key: "orders.create",
    name: "Create Orders",
    nameAr: "إنشاء طلبات جديدة (POS / الهاتف / QR)",
    description: "Create new branch orders",
    descriptionAr: "إنشاء طلبات جديدة عبر نقاط البيع أو الهاتف أو الصالة",
    module: "orders",
  },
  {
    key: "orders.update",
    name: "Update Orders",
    nameAr: "تعديل الطلبات وتحديث الحالات التشغيلية",
    description: "Update order details and advance order state machine",
    descriptionAr: "تعديل تفاصيل الطلبات وتغيير الحالات التشغيلية",
    module: "orders",
  },
  {
    key: "orders.discount",
    name: "Apply Discounts",
    nameAr: "تطبيق خصومات يدوية على الطلبات",
    description: "Apply manual discounts to orders",
    descriptionAr: "منح صلاحية تطبيق خصومات نقدية أو نسبية يدوية على الفاتورة",
    module: "orders",
  },
  {
    key: "orders.source_cashier",
    name: "Cashier Channel",
    nameAr: "إنشاء طلبات الكاشير (نقطة البيع)",
    description: "Create cashier-source orders (POS)",
    descriptionAr: "تسجيل الطلبات المباشرة في الكاشير ونقطة البيع",
    module: "orders",
  },
  {
    key: "orders.source_phone",
    name: "Phone Channel",
    nameAr: "إنشاء طلبات الهاتف",
    description: "Create phone-source orders",
    descriptionAr: "تسجيل طلبات العملاء عبر الهاتف والتوصيل المنزلي",
    module: "orders",
  },
  {
    key: "orders.source_whatsapp",
    name: "WhatsApp Channel",
    nameAr: "إنشاء طلبات الواتساب",
    description: "Create whatsapp-source orders",
    descriptionAr: "تسجيل واعتماد طلبات قادمة عبر محادثات الواتساب",
    module: "orders",
  },
  {
    key: "orders.source_website",
    name: "Website Channel",
    nameAr: "إنشاء واستلام طلبات الموقع",
    description: "Create website-source orders",
    descriptionAr: "استلام وإدارة الطلبات القادمة من موقع الطلب الإلكتروني",
    module: "orders",
  },
  {
    key: "orders.cancel",
    name: "Cancel Orders",
    nameAr: "إلغاء الطلبات وتوثيق السبب",
    description: "Cancel active orders and record cancellation reason",
    descriptionAr: "إلغاء الطلبات القائمة وتوثيق أسباب الإلغاء في النظام",
    module: "orders",
  },
  {
    key: "orders.payment",
    name: "Process Payments",
    nameAr: "تحصيل مدفوعات الطلبات وإصدار الفواتير",
    description: "Process order payment transactions",
    descriptionAr: "تسجيل المدفوعات النقدية والإلكترونية وإغلاق الحساب",
    module: "orders",
  },
  {
    key: "orders.refund",
    name: "Process Refunds",
    nameAr: "استرداد المبالغ المالية للطلبات",
    description: "Process order refund transactions",
    descriptionAr: "تسجيل استرداد المبالغ المالية وإرجاع المنتجات",
    module: "orders",
  },

  // --- Kitchen Display System (KDS) ---
  {
    key: "kds.view",
    name: "View KDS",
    nameAr: "عرض شاشة المطبخ (KDS)",
    description: "View active kitchen orders on KDS screen",
    descriptionAr: "متابعة الطلبات المباشرة المعروضة في شاشة المطبخ",
    module: "kds",
  },
  {
    key: "kds.manage",
    name: "Manage KDS",
    nameAr: "إدارة شاشة المطبخ وتحديث حالات الطهي",
    description: "Update kitchen preparation status and item progress",
    descriptionAr: "تحديث وتأكيد بدء وتجهيز الأصناف والطلبات داخل المطبخ",
    module: "kds",
  },

  // --- Menu & Catalog ---
  {
    key: "menu.view",
    name: "View Menu",
    nameAr: "عرض قائمة الطعام والأصناف",
    description: "View the restaurant menu (products/categories/modifiers)",
    descriptionAr: "استعراض الأصناف، الفئات، الأسعار، والإضافات في الكاشير والمنيو",
    module: "menu",
  },
  {
    key: "menu.manage",
    name: "Manage Menu",
    nameAr: "إدارة الأصناف، الفئات، الأسعار، والإضافات",
    description: "Manage restaurant categories, products, prices, and add-ons",
    descriptionAr: "إضافة وتعديل وحذف الأصناف والأسعار والفئات وخيارات التخصيص",
    module: "menu",
  },

  // --- Tables & Dining Room ---
  {
    key: "tables.view",
    name: "View Tables",
    nameAr: "عرض خريطة الطاولات والجلسات",
    description: "View branch tables (for POS and waiter view)",
    descriptionAr: "استعراض خريطة صالة الطعام، الطاولات، والحالات التشغيلية",
    module: "tables",
  },
  {
    key: "tables.manage",
    name: "Manage Tables",
    nameAr: "إدارة وتخصيص الطاولات، الجلسات، وحالات الصالة",
    description: "Manage branch tables, status, and QR codes",
    descriptionAr: "إضافة الطاولات وتعديل السعة وتوليد رموز QR وإدارة الجلسات",
    module: "tables",
  },

  // --- Employees & Roles ---
  {
    key: "employees.view",
    name: "View Employees",
    nameAr: "عرض ملفات وسجل بيانات الموظفين",
    description: "View employee profiles and list",
    descriptionAr: "عرض قائمة الموظفين وتفاصيل الحسابات وحالات التفعيل",
    module: "employees",
  },
  {
    key: "employees.manage",
    name: "Manage Employees",
    nameAr: "إضافة، تعديل، وإدارة بيانات الموظفين",
    description: "Create, update, and soft-delete employees",
    descriptionAr: "إضافة موظفين جدد، تعديل البيانات، إعادة تعيين كلمة المرور، وتعطيل الحسابات",
    module: "employees",
  },
  {
    key: "employees.manage_roles",
    name: "Manage Roles & Permissions",
    nameAr: "إنشاء وتعديل مصفوفة الأدوار والصلاحيات",
    description: "Manage roles, permissions, and role assignments",
    descriptionAr: "إنشاء الأدوار الوظيفية المخصصة وتعيين الصلاحيات لكل دور",
    module: "employees",
  },

  // --- Branches & Locations ---
  {
    key: "branches.view",
    name: "View Branches",
    nameAr: "عرض قائمة الفروع التشغيلية",
    description: "View operating branches list and branch profiles",
    descriptionAr: "عرض بيانات الفروع التشغيلية وساعات العمل والإعدادات",
    module: "branches",
  },
  {
    key: "branches.manage",
    name: "Manage Branches",
    nameAr: "إضافة وتعديل وساعات عمل الفروع",
    description: "Manage branch profiles and settings",
    descriptionAr: "إضافة فروع جديدة وتعديل العناوين وساعات العمل وصلاحيات الوصول للفروع",
    module: "branches",
  },

  // --- Customers Management ---
  {
    key: "customers.view",
    name: "View Customers",
    nameAr: "عرض سجل وبيانات العملاء",
    description: "View customer profiles, order history, and addresses",
    descriptionAr: "استعراض ملفات العملاء وسجل طلباتهم السابقة وعناوين التوصيل",
    module: "customers",
  },
  {
    key: "customers.create",
    name: "Create Customers",
    nameAr: "إضافة عملاء جدد",
    description: "Create new customer profiles",
    descriptionAr: "تسجيل بيانات عملاء جدد وإضافة أرقام هواتفهم",
    module: "customers",
  },
  {
    key: "customers.update",
    name: "Update Customers",
    nameAr: "تعديل وتحديث بيانات العملاء والعناوين",
    description: "Update customer profiles and manage addresses",
    descriptionAr: "تحديث معلومات العملاء وإضافة عناوين توصيل جديدة",
    module: "customers",
  },
  {
    key: "customers.delete",
    name: "Delete Customers",
    nameAr: "حذف وأرشفة ملفات العملاء",
    description: "Soft-delete customer profiles",
    descriptionAr: "أرشفة ملفات العملاء وحذف العناوين المسجلة",
    module: "customers",
  },

  // --- WhatsApp & Automation ---
  {
    key: "whatsapp.view",
    name: "View WhatsApp",
    nameAr: "عرض محادثات ورسائل الواتساب",
    description: "View WhatsApp connection and message history",
    descriptionAr: "استعراض سجل رسائل الواتساب وحالة الاتصال بحساب Business",
    module: "whatsapp",
  },
  {
    key: "whatsapp.manage",
    name: "Manage WhatsApp",
    nameAr: "إدارة إعدادات واتساب وإرسال الرسائل",
    description: "Connect/disconnect WhatsApp and send messages",
    descriptionAr: "ربط وفصل حساب الواتساب، وإرسال الرسائل، وإدارة الأتمتة",
    module: "whatsapp",
  },

  // --- Unified Inbox ---
  {
    key: "chats.view",
    name: "View Chats",
    nameAr: "عرض محادثات صندوق الوارد",
    description: "View the unified inbox queue and conversations",
    descriptionAr: "استعراض قائمة المحادثات الواردة والتذاكر المفتوحة",
    module: "chats",
  },
  {
    key: "chats.reply",
    name: "Reply to Chats",
    nameAr: "الرد على المحادثات وإضافة الملاحظات",
    description: "Reply to inbox conversations and add internal notes",
    descriptionAr: "إرسال ردود للعملاء داخل المحادثة وتدوين الملاحظات الداخلية",
    module: "chats",
  },
  {
    key: "chats.assign",
    name: "Assign Chats",
    nameAr: "تعيين واستلام المحادثات",
    description: "Assign and claim inbox conversations from the queue",
    descriptionAr: "استلام المحادثات أو إسنادها لموظف خدمة عملاء محدد",
    module: "chats",
  },
  {
    key: "chats.close",
    name: "Close Chats",
    nameAr: "إنهاء وإغلاق المحادثات",
    description: "Resolve and close inbox conversations",
    descriptionAr: "تسوية المشكلة وإغلاق تذكرة المحادثة",
    module: "chats",
  },
  {
    key: "chats.takeover",
    name: "Takeover Chats",
    nameAr: "استلام، قفل، وإعادة تعيين المحادثات",
    description: "Take over, lock, return and reassign inbox conversations",
    descriptionAr: "صلاحية المشرف للاستحواذ على المحادثة وقفلها أو تحويلها لوكيل آخر",
    module: "chats",
  },

  // --- Analytics & Dashboard ---
  {
    key: "dashboard.view",
    name: "View Dashboard & Reports",
    nameAr: "عرض لوحة التحكم والتقارير والتحليلات",
    description: "View restaurant analytics dashboards and reports",
    descriptionAr: "استعراض الإحصائيات المالية، المبيعات، ومؤشرات الأداء",
    module: "dashboard",
  },

  // --- Coupons & Promotions ---
  {
    key: "coupons.view",
    name: "View Coupons",
    nameAr: "عرض قائمة الكوبونات والعروض",
    description: "View discount coupons and promotions",
    descriptionAr: "استعراض الكوبونات الفعالة ونسب الخصم وتواريخ الصلاحية",
    module: "coupons",
  },
  {
    key: "coupons.manage",
    name: "Manage Coupons",
    nameAr: "إدارة وتوليد كوبونات وتخفيضات الأسعار",
    description: "Create, update, deactivate and manage discount coupons",
    descriptionAr: "إنشاء كوبونات خصم جديدة وتحديد الشروط وتفعيلها أو إيقافها",
    module: "coupons",
  },

  // --- Notifications ---
  {
    key: "notifications.view",
    name: "View Notifications",
    nameAr: "عرض التنبيهات والإشعارات",
    description: "View and manage own in-app notifications and preferences",
    descriptionAr: "استعراض الإشعارات الإدارية وتفضيلات التنبيهات في النظام",
    module: "notifications",
  },

  // --- Audit & Security ---
  {
    key: "audit.view",
    name: "View Audit Logs",
    nameAr: "عرض سجل الأمان والتدقيق الإداري (Audit Logs)",
    description: "View restaurant audit log entries and search history",
    descriptionAr: "استعراض السجلات الرقابية للعمليات الإدارية وتتبع التغييرات الحساسة",
    module: "audit",
  },

  // --- Restaurant Settings ---
  {
    key: "restaurants.view",
    name: "View Restaurant Profile",
    nameAr: "عرض بيانات وإعدادات المطعم",
    description: "View restaurant profile and settings",
    descriptionAr: "استعراض بيانات المطعم وشعاره والعملة والمنطقة الزمنية",
    module: "restaurants",
  },
  {
    key: "restaurants.manage",
    name: "Manage Restaurant",
    nameAr: "تحديث بيانات المطعم الرئيسية والهوية",
    description: "Manage restaurant profile and settings",
    descriptionAr: "تعديل اسم المطعم وبيانات الاتصال والعملة والهوية البصرية والقوالب",
    module: "restaurants",
  },
  // --- Delivery & Drivers ---
  {
    key: "delivery.view",
    name: "View Delivery Orders",
    nameAr: "عرض طلبات التوصيل ومحفظة العهدة",
    description: "View delivery orders and driver cash wallet",
    descriptionAr: "عرض قائمة طلبات التوصيل المسندة ومتابعة محفظة النقدية للطيار",
    module: "delivery",
  },
  {
    key: "delivery.update_status",
    name: "Update Delivery Status",
    nameAr: "تحديث حالة التوصيل (استلام / تسليم)",
    description: "Update order delivery progress (pickup, deliver, fail)",
    descriptionAr: "استلام الطلب من المطعم وتأكيد تسليمه للعميل أو تسجيل تعذر التسليم",
    module: "delivery",
  },
  {
    key: "delivery.settle",
    name: "Settle Driver Cash",
    nameAr: "تصفية واستلام عهدة التوصيل (COD)",
    description: "Settle cash collected by delivery drivers at cashier",
    descriptionAr: "تصفية المبالغ النقدية المحصلة مع الطيارين واستلامها في درج الكاشير",
    module: "delivery",
  },
  // --- Shifts & Cash Drawer Management ---
  {
    key: "shifts.view",
    name: "View Shifts & Reports",
    nameAr: "عرض الورديات والتقارير المالية (X/Z Report)",
    description: "View active shift status, X-Report, and past shift archives",
    descriptionAr: "استعراض حالة الوردية المفتوحة والتقرير اللحظي وسجل الورديات السابقة",
    module: "shifts",
  },
  {
    key: "shifts.open",
    name: "Open Shift",
    nameAr: "فتح وردية عمل جديدة",
    description: "Start a new shift and register opening cash float",
    descriptionAr: "بدء وردية جديدة وتحديد رصيد العهدة الافتتاحي للدرج",
    module: "shifts",
  },
  {
    key: "shifts.close",
    name: "Close Shift (Z-Report)",
    nameAr: "إغلاق الوردية وإصدار تقرير Z-Report",
    description: "Close active shift, count drawer cash, and generate Z-Report",
    descriptionAr: "إنهاء الوردية وتدقيق النقدية الفعلية وحساب الفارق وطباعة تقرير الإغلاق",
    module: "shifts",
  },
  {
    key: "shifts.manage_cash",
    name: "Manage Drawer Cash Movements",
    nameAr: "تسجيل حركات النقدية (إيداع / سحب مصروفات)",
    description: "Record Pay-In and Pay-Out cash movements during shift",
    descriptionAr: "إدخال مبالغ إضافية للدرج أو سحب نقدية للمصروفات النثرية أثناء الوردية",
    module: "shifts",
  },
];

export default GLOBAL_PERMISSIONS;
