/**
 * ==============================================================================
 * كود الأتمتة والربط السحابي — منصة توثيق مناقشات التخرج (نادي الجسور)
 * Google Apps Script Webhook + Google Sheets Auto-Archiving + Telegram Bot Alert
 * ==============================================================================
 */

// إعدادات البوت وتيليجرام
const TELEGRAM_CONFIG = {
  BOT_TOKEN: "8509092860:AAET4WCXrx2MD2QVb0yrRCql5lAXoy-UhyY", // بوت المداومة والتقارير
  CHAT_ID: "-1004497345814", // حقيبة نشطاء جسور
  TOPIC_ID: 30 // موضوع تقارير المداومة
};

const SHEET_NAME = "سجل طلبات المناقشات";
const MAX_PER_DAY = 5;

/**
 * دالة استقبال الطلبات عبر POST Webhook
 */
function doPost(e) {
  try {
    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "لا توجد بيانات مستلمة" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // فتح وتجهيز الجدول
    const sheet = getOrCreateSheet();

    // فحص سقف المناقشات (5 في اليوم)
    const dayCount = countRegistrationsForDay(sheet, data.defenseDate);
    if (dayCount >= MAX_PER_DAY) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "quota_full", 
        message: "اكتمل الحد الأقصى للمناقشات في هذا اليوم (5 مناقشات)." 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // إدراج السطر الجديد في جوجل شيت
    const newRow = [
      data.id || ("JSR-" + new Date().getTime().toString().slice(-6)),
      new Date().toLocaleString("ar-DZ", { timeZone: "Africa/Algiers" }),
      data.fullName || "",
      data.specialty || "",
      data.thesisTitle || "",
      data.committeeMembers || "",
      data.defenseHall || "",
      data.defenseDate || "",
      data.defenseTime || "",
      data.phoneNumber || "",
      data.telegramUser || "",
      data.status || "جديد"
    ];

    sheet.appendRow(newRow);

    // تنسيق السطر الجديد
    formatLastRow(sheet);

    // إرسال إشعار فوري لبوت تيليجرام
    sendTelegramAlert(data);

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      id: newRow[0],
      message: "تم حفظ التسجيل في Google Sheets وإشعار تيليجرام بنجاح" 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * دالة اختبار أو فحص عبر GET
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "active",
    club: "نادي الجسور الجامعي",
    service: "خدمة توثيق مناقشات التخرج 2026",
    maxPerDay: MAX_PER_DAY,
    days: ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * حساب عدد المسجلين في يوم محدد
 */
function countRegistrationsForDay(sheet, dateStr) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][7] === dateStr) { // العمود رقم 8 هو يوم المناقشة
      count++;
    }
  }
  return count;
}

/**
 * فتح الورقة المخصصة أو إنشاؤها وتنسيقها بألوان نادي الجسور
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    
    // عناوين الأعمدة
    const headers = [
      "رمز الطلب",
      "تاريخ التسجيل",
      "الاسم واللقب",
      "التخصص",
      "عنوان المذكرة",
      "لجنة المناقشة",
      "القاعة",
      "يوم المناقشة",
      "التوقيت",
      "رقم الهاتف",
      "معرف التيليجرام",
      "الحالة"
    ];

    sheet.appendRow(headers);

    // ترويسة ذهبية وخط كوفي/نسخي أنيق
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0d1a2d");
    headerRange.setFontColor("#eab308");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setFontSize(11);
    sheet.setRowHeight(1, 35);
    sheet.setRightToLeft(true);

    // ضبط عرض الأعمدة تلقائياً
    for (let c = 1; c <= headers.length; c++) {
      sheet.autoResizeColumn(c);
    }
  }

  return sheet;
}

/**
 * تنسيق الصف المضاف حديثاً
 */
function formatLastRow(sheet) {
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(lastRow, 1, 1, 12);
  range.setVerticalAlignment("middle");
  range.setHorizontalAlignment("center");
  sheet.setRowHeight(lastRow, 28);

  // تلوين خفيف متبادل
  if (lastRow % 2 === 0) {
    range.setBackground("#f8fafc");
  } else {
    range.setBackground("#ffffff");
  }
}

/**
 * إرسال إشعار فوري ومنسق عبر بوت تيليجرام
 */
function sendTelegramAlert(data) {
  if (!TELEGRAM_CONFIG.BOT_TOKEN || !TELEGRAM_CONFIG.CHAT_ID) return;

  const dateLabels = {
    "2026-09-19": "السبت 19 سبتمبر 2026",
    "2026-09-20": "الأحد 20 سبتمبر 2026",
    "2026-09-21": "الاثنين 21 سبتمبر 2026",
    "2026-09-22": "الثلاثاء 22 سبتمبر 2026"
  };

  const dayLabel = dateLabels[data.defenseDate] || data.defenseDate;

  const message = 
`🎓 *تسجيل جديد لتوثيق مناقشة — نادي الجسور*

👤 *الطالب:* ${data.fullName}
📚 *التخصص:* ${data.specialty}
📖 *عنوان المذكرة:* ${data.thesisTitle}
👥 *اللجنة:* ${data.committeeMembers}
🏛️ *القاعة:* ${data.defenseHall}
📅 *الموعد:* ${dayLabel}
⏰ *التوقيت:* ${data.defenseTime}
📞 *الهاتف:* \`${data.phoneNumber}\`
💬 *التيليجرام:* ${data.telegramUser}
🏷️ *رمز الطلب:* \`${data.id || "JSR"}\`
⚡ *الحالة:* قيد المراجعة في المقر`;

  const url = "https://api.telegram.org/bot" + TELEGRAM_CONFIG.BOT_TOKEN + "/sendMessage";

  const payload = {
    chat_id: TELEGRAM_CONFIG.CHAT_ID,
    text: message,
    parse_mode: "Markdown"
  };

  if (TELEGRAM_CONFIG.TOPIC_ID) {
    payload.message_thread_id = TELEGRAM_CONFIG.TOPIC_ID;
  }

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    UrlFetchApp.fetch(url, options);
  } catch (err) {
    Logger.log("Telegram notification error: " + err);
  }
}
