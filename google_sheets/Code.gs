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

    // إدراج السطر الجديد في جوجل شيت بالتقسيم الدقيق المطلوب
    let committeeText = data.committeeMembers || "";
    if (!committeeText && (data.committeePresident || data.supervisor || data.examiner)) {
      committeeText = `الرئيس: ${data.committeePresident || ''} | المشرف: ${data.supervisor || ''} | المناقش: ${data.examiner || ''}`;
    }

    const newRow = [
      data.fullName || "",
      data.defenseHall || "",
      data.defenseDate || "",
      data.defenseTime || "",
      committeeText,
      data.photographerName || "لم يُعيّن بعد"
    ];

    sheet.appendRow(newRow);

    // تنسيق السطر الجديد
    formatLastRow(sheet);

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      message: "تم إدراج المناقشة في Google Sheets بنجاح" 
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
    maxPerDay: MAX_PER_DAY
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * حساب عدد المسجلين في يوم محدد (العمود رقم 3 هو التاريخ)
 */
function countRegistrationsForDay(sheet, dateStr) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === dateStr) { // العمود رقم 3 (C) هو التاريخ
      count++;
    }
  }
  return count;
}

/**
 * دالة تهيئة وبناء عناوين الجدول تلقائياً بألوان نادي الجسور
 * تعمل فور فتح الشيت أو عند الضغط على زر تشغيل (Run)
 */
function onOpen() {
  setupHeaders();
}

function setupHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  
  sheet.setName("سجل المناقشات");
  sheet.setRightToLeft(true);

  // عناوين الأعمدة الستة المحددة بدقة
  const headers = [
    "اسم الطالب المناقش",
    "القاعة",
    "التاريخ",
    "الساعة",
    "أسماء اللجنة",
    "اسم الذي سيصور"
  ];

  // تعيين العناوين في الصف الأول
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);

  // التنسيق الملكي لنادي الجسور (كحلي ملكي داكن مع كتابة ذهبية بارزة)
  headerRange.setBackground("#0d1a2d");
  headerRange.setFontColor("#eab308");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  headerRange.setFontSize(11);
  sheet.setRowHeight(1, 38);

  // ضبط عرض الأعمدة تلقائياً لتناسب القراءة والطباعة
  const colWidths = [220, 150, 140, 120, 340, 200];
  for (let c = 1; c <= colWidths.length; c++) {
    sheet.setColumnWidth(c, colWidths[c - 1]);
  }

  // تجميد الصف الأول ليبقى ثابتاً عند التمرير
  sheet.setFrozenRows(1);
}

/**
 * فتح الورقة المخصصة أو تهيئتها فوراً
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  
  // إذا كانت الورقة فارغة في الصف الأول، نهيئ العناوين فوراً
  if (sheet.getLastRow() === 0) {
    setupHeaders();
  }
  return sheet;
}

/**
 * تنسيق الصف المضاف حديثاً
 */
function formatLastRow(sheet) {
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(lastRow, 1, 1, 6);
  range.setVerticalAlignment("middle");
  range.setHorizontalAlignment("center");
  sheet.setRowHeight(lastRow, 28);

  // تلوين خفيف متبادل
  if (lastRow % 2 === 0) {
    range.setBackground("#f8fafc");
  } else {
    range.setBackground("#ffffff");
  }

  // تمييز خلية اسم المصور بلون زمردي خفيف (العمود 6)
  const photographerCell = sheet.getRange(lastRow, 6);
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

  const sheetUrl = "https://docs.google.com/spreadsheets/d/1KDKJxfzQ3kYwpOsvkgRoRg7a9FuBcihIvgoajNPp730/edit?gid=0#gid=0";

  const message = 
`✅ <b>تم قبول طلب توثيق مناقشة وتعيين المصور — نادي الجسور</b>

👤 <b>الطالب:</b> ${data.fullName || ''}
📚 <b>التخصص:</b> ${data.specialty || ''}
📖 <b>عنوان المذكرة:</b> ${data.thesisTitle || ''}
👨‍🏫 <b>رئيس اللجنة:</b> ${data.committeePresident || 'غير محدد'}
👨‍🏫 <b>الأستاذ المشرف:</b> ${data.supervisor || 'غير محدد'}
👨‍🏫 <b>الأستاذ المناقش:</b> ${data.examiner || 'غير محدد'}
🏛️ <b>القاعة:</b> ${data.defenseHall || ''}
📅 <b>الموعد:</b> ${dayLabel}
⏰ <b>التوقيت:</b> ${data.defenseTime || ''}
📞 <b>الهاتف:</b> <code>${data.phoneNumber || ''}</code>
💬 <b>التيليجرام:</b> ${data.telegramUser || ''}
📷 <b>المصور المتكفل بالتصوير:</b> <b>${data.photographerName || 'لم يُعيّن'}</b>
🏷️ <b>رمز الطلب:</b> <code>${data.id || "JSR"}</code>
📊 <b>الحالة:</b> أُدرجت المناقشة تلقائياً في Google Sheet 🟢`;

  const url = "https://api.telegram.org/bot" + TELEGRAM_CONFIG.BOT_TOKEN + "/sendMessage";

  const payload = {
    chat_id: TELEGRAM_CONFIG.CHAT_ID,
    text: message,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📊 فتح جدول Google Sheet المباشر",
            url: sheetUrl
          }
        ]
      ]
    }
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
