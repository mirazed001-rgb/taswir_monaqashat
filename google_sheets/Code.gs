/**
 * ==============================================================================
 * كود الأتمتة والربط السحابي — منصة توثيق مناقشات التخرج (نادي الجسور)
 * Google Apps Script Webhook + Google Sheets Auto-Archiving + Telegram Bot Alert
 * ==============================================================================
 */

// إعدادات بوت توثيق مناقشات جسور الجديد وقناة نشطاء جسور 7
const TELEGRAM_CONFIG = {
  BOT_TOKEN: "8973353664:AAHzThHxzp69jYh-A_fCU6T3U9Q-kJFf9f0", // بوت توثيق مناقشات جسور الجديد (@JosourMonaqashatBot)
  CHAT_ID: "-1002534160494", // نُشَطَاء جُسُور |7|
  TOPIC_ID: null
};

const SHEET_NAME = "سجل المناقشات المقبولة";
const MAX_PER_DAY = 5;

/**
 * دالة استقبال الطلبات المقبولة عبر POST Webhook
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

    // إدراج السطر الجديد في جوجل شيت متضمناً اسم المصور وتفاصيل اللجنة
    const newRow = [
      data.id || ("JSR-" + new Date().getTime().toString().slice(-6)),
      new Date().toLocaleString("ar-DZ", { timeZone: "Africa/Algiers" }),
      data.fullName || "",
      data.specialty || "",
      data.thesisTitle || "",
      data.committeePresident || "",
      data.supervisor || "",
      data.examiner || "",
      data.defenseHall || "",
      data.defenseDate || "",
      data.defenseTime || "",
      data.phoneNumber || "",
      data.telegramUser || "",
      data.photographerName || "لم يُعيّن",
      data.status || "مؤكد"
    ];

    sheet.appendRow(newRow);

    // تنسيق السطر الجديد
    formatLastRow(sheet);

    // إرسال إشعار تأكيد بقناة نشطاء جسور 7
    sendTelegramAlert(data);

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      id: newRow[0],
      message: "تم إدراج المناقشة المقبولة واسم المصور في Google Sheets بنجاح" 
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
    bot: "@JosourMonaqashatBot",
    channel: "نُشَطَاء جُسُور |7|",
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
    if (data[i][9] === dateStr) { // العمود رقم 10 هو يوم المناقشة
      count++;
    }
  }
  return count;
}

/**
 * فتح الورقة المخصصة أو إنشاؤها وتنسيقها بألوان وهوية نادي الجسور
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    
    // عناوين الأعمدة الخمسة عشر
    const headers = [
      "رمز الطلب",
      "تاريخ القبول / التسجيل",
      "الاسم واللقب",
      "التخصص",
      "عنوان المذكرة",
      "رئيس اللجنة",
      "الأستاذ المشرف",
      "الأستاذ المناقش",
      "القاعة",
      "يوم المناقشة",
      "التوقيت",
      "رقم الهاتف",
      "معرف التيليجرام",
      "المصور المتكفل بالتصوير",
      "الحالة"
    ];

    sheet.appendRow(headers);

    // ترويسة نيلي وذهب ملكي
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0d1a2d");
    headerRange.setFontColor("#eab308");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setFontSize(11);
    sheet.setRowHeight(1, 36);
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
  const range = sheet.getRange(lastRow, 1, 1, 15);
  range.setVerticalAlignment("middle");
  range.setHorizontalAlignment("center");
  sheet.setRowHeight(lastRow, 28);

  // تلوين خفيف متبادل
  if (lastRow % 2 === 0) {
    range.setBackground("#f8fafc");
  } else {
    range.setBackground("#ffffff");
  }

  // تمييز خلية اسم المصور بلون زمردي خفيف
  const photographerCell = sheet.getRange(lastRow, 14);
  photographerCell.setFontWeight("bold");
  photographerCell.setFontColor("#065f46");
}

/**
 * إرسال إشعار فوري بقناة نشطاء جسور 7 عند قبول الطلب وتعيين المصور
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
`✅ *تم قبول طلب توثيق مناقشة وتعيين المصور — نادي الجسور*

👤 *الطالب:* ${data.fullName}
📚 *التخصص:* ${data.specialty}
📖 *عنوان المذكرة:* ${data.thesisTitle}
👨‍🏫 *رئيس اللجنة:* ${data.committeePresident || 'غير محدد'}
👨‍🏫 *الأستاذ المشرف:* ${data.supervisor || 'غير محدد'}
👨‍🏫 *الأستاذ المناقش:* ${data.examiner || 'غير محدد'}
🏛️ *القاعة:* ${data.defenseHall}
📅 *الموعد:* ${dayLabel}
⏰ *التوقيت:* ${data.defenseTime}
📞 *الهاتف:* \`${data.phoneNumber}\`
💬 *التيليجرام:* ${data.telegramUser}
📷 *المصور المتكفل بالتصوير:* *${data.photographerName || 'لم يُعيّن'}*
🏷️ *رمز الطلب:* \`${data.id || "JSR"}\`
📊 *الحالة:* أُدرجت المناقشة تلقائياً في Google Sheet 🟢`;

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
