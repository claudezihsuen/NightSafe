import type { Language } from "@/types";

type Pair = { ZH: string; TA: string };

// Runtime values are not always visible to the static JSX i18n audit. Keep
// system-generated enum/status/type labels here so values returned from the API
// follow the user's selected language as well.
const terms: Record<string, Pair> = {
  // Deposit page composition/status.
  "Finalized — composition is locked.": { ZH: "已定稿——押金组成已锁定。", TA: "இறுதிப்படுத்தப்பட்டது — வைப்பு அமைப்பு பூட்டப்பட்டுள்ளது." },
  "Draft — add items, then finalize.": { ZH: "草稿——添加项目后再定稿。", TA: "வரைவு — உருப்படிகளைச் சேர்த்து பின்னர் இறுதிப்படுத்தவும்." },
  "Finalized": { ZH: "已定稿", TA: "இறுதிப்படுத்தப்பட்டது" },
  "Draft": { ZH: "草稿", TA: "வரைவு" },
  "FINALIZED": { ZH: "已定稿", TA: "இறுதிப்படுத்தப்பட்டது" },
  "DRAFT": { ZH: "草稿", TA: "வரைவு" },

  // Deposit types supplied by NightSafe presets.
  "Rental Deposit": { ZH: "租金押金", TA: "வாடகை வைப்பு" },
  "Water Deposit": { ZH: "水费押金", TA: "தண்ணீர் வைப்பு" },
  "Electricity Deposit": { ZH: "电费押金", TA: "மின்சார வைப்பு" },
  "Utility Deposit": { ZH: "水电押金", TA: "பயன்பாட்டு சேவை வைப்பு" },
  "Key Deposit": { ZH: "钥匙押金", TA: "சாவி வைப்பு" },
  "Access Card Deposit": { ZH: "门禁卡押金", TA: "அணுகல் அட்டை வைப்பு" },
  "Parking Deposit": { ZH: "停车押金", TA: "வாகன நிறுத்த வைப்பு" },
  "Furniture Deposit": { ZH: "家具押金", TA: "மரச்சாமான் வைப்பு" },
  "Equipment Deposit": { ZH: "设备押金", TA: "உபகரண வைப்பு" },

  // Deposit payment/refund states — raw API enums and rendered labels.
  "EXPECTED": { ZH: "待支付", TA: "எதிர்பார்க்கப்படுகிறது" },
  "PARTIALLY_PAID": { ZH: "部分已付", TA: "பகுதியாக செலுத்தப்பட்டது" },
  "FULLY_PAID": { ZH: "已付清", TA: "முழுமையாக செலுத்தப்பட்டது" },
  "expected": { ZH: "待支付", TA: "எதிர்பார்க்கப்படுகிறது" },
  "partially paid": { ZH: "部分已付", TA: "பகுதியாக செலுத்தப்பட்டது" },
  "fully paid": { ZH: "已付清", TA: "முழுமையாக செலுத்தப்பட்டது" },
  "Expected": { ZH: "待支付", TA: "எதிர்பார்க்கப்படுகிறது" },
  "Partially Paid": { ZH: "部分已付", TA: "பகுதியாக செலுத்தப்பட்டது" },
  "Fully Paid": { ZH: "已付清", TA: "முழுமையாக செலுத்தப்பட்டது" },
  "NOT_APPLICABLE": { ZH: "不适用", TA: "பொருந்தாது" },
  "HELD": { ZH: "持有中", TA: "தக்கவைக்கப்பட்டுள்ளது" },
  "PARTIALLY_RETURNED": { ZH: "部分已退还", TA: "பகுதியாக திருப்பி வழங்கப்பட்டது" },
  "FULLY_RETURNED": { ZH: "已全额退还", TA: "முழுமையாக திருப்பி வழங்கப்பட்டது" },
  "Not Applicable": { ZH: "不适用", TA: "பொருந்தாது" },
  "Held": { ZH: "持有中", TA: "தக்கவைக்கப்பட்டுள்ளது" },
  "Partially Returned": { ZH: "部分已退还", TA: "பகுதியாக திருப்பி வழங்கப்பட்டது" },
  "Fully Returned": { ZH: "已全额退还", TA: "முழுமையாக திருப்பி வழங்கப்பட்டது" },

  // Payments tabs, utility types and statuses.
  "rent": { ZH: "租金", TA: "வாடகை" },
  "utilities": { ZH: "水电费", TA: "பயன்பாட்டு சேவைகள்" },
  "Rent": { ZH: "租金", TA: "வாடகை" },
  "Utilities": { ZH: "水电费", TA: "பயன்பாட்டு சேவைகள்" },
  "WATER": { ZH: "水费", TA: "தண்ணீர்" },
  "ELECTRICITY": { ZH: "电费", TA: "மின்சாரம்" },
  "Water": { ZH: "水费", TA: "தண்ணீர்" },
  "Electricity": { ZH: "电费", TA: "மின்சாரம்" },
  "WAITING_PAYMENT": { ZH: "等待付款", TA: "கட்டணம் காத்திருக்கிறது" },
  "PENDING_REVIEW": { ZH: "待审核", TA: "மதிப்பாய்வு நிலுவையில்" },
  "PAYMENT_CONFIRMED": { ZH: "付款已确认", TA: "கட்டணம் உறுதிசெய்யப்பட்டது" },
  "OVERDUE": { ZH: "已逾期", TA: "காலதாமதம்" },
  "Waiting payment": { ZH: "等待付款", TA: "கட்டணம் காத்திருக்கிறது" },
  "Pending review": { ZH: "待审核", TA: "மதிப்பாய்வு நிலுவையில்" },
  "Confirmed": { ZH: "已确认", TA: "உறுதிசெய்யப்பட்டது" },
  "Overdue": { ZH: "已逾期", TA: "காலதாமதம்" },

  // Documentation page copy specifically missed by runtime rendering.
  "Private tenancy documents, requirements, completion and version history.": { ZH: "管理租约的私人文件、要求、完成情况和版本记录。", TA: "தனியார் வாடகை ஆவணங்கள், தேவைகள், நிறைவு மற்றும் பதிப்பு வரலாறு." },
  "Create a document or tenant requirement for a tenancy.": { ZH: "为租约创建文件或租客提交要求。", TA: "ஒரு வாடகைக்கான ஆவணம் அல்லது குடியிருப்பாளர் தேவையை உருவாக்கவும்." },

  // Every current DocumentStatus value, in both raw and humanized forms.
  "REQUIRED": { ZH: "必需", TA: "கட்டாயம்" },
  "NOT_UPLOADED": { ZH: "尚未上传", TA: "பதிவேற்றப்படவில்லை" },
  "UPLOADED": { ZH: "已上传", TA: "பதிவேற்றப்பட்டது" },
  "UNDER_REVIEW": { ZH: "审核中", TA: "மதிப்பாய்வில் உள்ளது" },
  "APPROVED": { ZH: "已批准", TA: "அனுமதிக்கப்பட்டது" },
  "REJECTED": { ZH: "已拒绝", TA: "நிராகரிக்கப்பட்டது" },
  "EXPIRED": { ZH: "已过期", TA: "காலாவதியானது" },
  "ARCHIVED": { ZH: "已归档", TA: "காப்பகப்படுத்தப்பட்டது" },
  "IN_PROGRESS": { ZH: "进行中", TA: "நடைபெறுகிறது" },
  "COMPLETED": { ZH: "已完成", TA: "முடிக்கப்பட்டது" },
  "REVISION_REQUIRED": { ZH: "需要修改", TA: "திருத்தம் தேவை" },
  "Required": { ZH: "必需", TA: "கட்டாயம்" },
  "Not Uploaded": { ZH: "尚未上传", TA: "பதிவேற்றப்படவில்லை" },
  "Uploaded": { ZH: "已上传", TA: "பதிவேற்றப்பட்டது" },
  "Under Review": { ZH: "审核中", TA: "மதிப்பாய்வில் உள்ளது" },
  "Approved": { ZH: "已批准", TA: "அனுமதிக்கப்பட்டது" },
  "Rejected": { ZH: "已拒绝", TA: "நிராகரிக்கப்பட்டது" },
  "Expired": { ZH: "已过期", TA: "காலாவதியானது" },
  "Archived": { ZH: "已归档", TA: "காப்பகப்படுத்தப்பட்டது" },
  "In Progress": { ZH: "进行中", TA: "நடைபெறுகிறது" },
  "Completed": { ZH: "已完成", TA: "முடிக்கப்பட்டது" },
  "Revision Required": { ZH: "需要修改", TA: "திருத்தம் தேவை" },

  // Tenant lifecycle and account/cleanup states.
  "Not run yet": { ZH: "尚未运行", TA: "இன்னும் இயக்கப்படவில்லை" },
  "NOT_RUN": { ZH: "尚未运行", TA: "இன்னும் இயக்கப்படவில்லை" },
  "Current": { ZH: "当前", TA: "தற்போதைய" },
  "ACTIVE": { ZH: "有效", TA: "செயலில்" },
  "ENDED": { ZH: "已结束", TA: "முடிவடைந்தது" },
  "Ended": { ZH: "已结束", TA: "முடிவடைந்தது" },
  "INACTIVE": { ZH: "未启用", TA: "செயலற்றது" },
  "WAITING_FOR_ACTIVATION": { ZH: "等待激活", TA: "செயல்படுத்த காத்திருக்கிறது" },
  "No ended tenancies yet.": { ZH: "目前还没有已结束的租约。", TA: "இன்னும் முடிவடைந்த வாடகைகள் இல்லை." },
  "No active tenancies.": { ZH: "目前没有有效租约。", TA: "செயலில் உள்ள வாடகைகள் இல்லை." },
  "RUNNING": { ZH: "运行中", TA: "இயங்குகிறது" },
  "SUCCESS": { ZH: "成功", TA: "வெற்றி" },
  "FAILED": { ZH: "失败", TA: "தோல்வி" },
  "PENDING": { ZH: "等待中", TA: "நிலுவையில்" },
  "Running": { ZH: "运行中", TA: "இயங்குகிறது" },
  "Success": { ZH: "成功", TA: "வெற்றி" },
  "Failed": { ZH: "失败", TA: "தோல்வி" },
  "Pending": { ZH: "等待中", TA: "நிலுவையில்" },
};

const makeDictionary = (language: "ZH" | "TA") =>
  Object.fromEntries(Object.entries(terms).map(([source, pair]) => [source, pair[language]]));

export const dynamicLiteralTranslations: Record<Language, Record<string, string>> = {
  EN: {},
  ZH: makeDictionary("ZH"),
  TA: makeDictionary("TA"),
};
