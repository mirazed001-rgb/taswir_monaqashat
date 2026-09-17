/**
 * منطق منصة توثيق مناقشات التخرج — نادي الجسور
 * إدارة الشروط، التحقق من الحصص اليومية (5 كحد أقصى)، التخزين، والإشعار
 */

// الثوابت والإعدادات الافتراضية
const STORAGE_KEY = 'josour_monaqashat_records_v1';
const SETTINGS_KEY = 'josour_monaqashat_settings_v1';
const MAX_PER_DAY = 5;

// التواريخ المعتمدة حصراً
const VALID_DAYS = ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'];

// ==========================================================================
// تهيئة فايربيس وقاعدة بيانات فايرستور السحابية (Firebase Cloud Firestore)
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAYdprBxSxDf_2mUve4EY7t5jDgo_2_Lb4",
  authDomain: "josour-djard.firebaseapp.com",
  projectId: "josour-djard",
  storageBucket: "josour-djard.firebasestorage.app",
  messagingSenderId: "830517852419",
  appId: "1:830517852419:web:80eb5c821346aedc63d136",
  measurementId: "G-B1VH7QBJHP"
};

let db = null;
try {
  if (typeof firebase !== 'undefined') {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    console.log('تم تفعيل وربط Firebase Cloud Firestore بنجاح لنادي الجسور.');
  }
} catch (e) {
  console.warn('تنبيه تهيئة فايربيس (جاري العمل بالتخزين المحلي الاحتياطي):', e);
}

// الاستماع اللحظي للتحديثات السحابية
function setupFirestoreListener() {
  if (!db) return;
  try {
    db.collection('defense_registrations').onSnapshot((snapshot) => {
      const remoteRecords = [];
      snapshot.forEach(doc => {
        remoteRecords.push(doc.data());
      });
      if (remoteRecords.length > 0) {
        remoteRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        saveRecords(remoteRecords);
        updateDateOptionsQuota();
        if (isAdminAuthenticated) {
          renderDashboard();
        }
      }
    }, (error) => {
      console.warn('تنبيه المزامنة اللحظية مع فايربيس:', error);
    });
  } catch (err) {
    console.warn('خطأ في إعداد مستمع فايربيس:', err);
  }
}

// تحميل الإعدادات
function getSettings() {
  const defaults = {
    adminPass: 'josour2026',
    webhookUrl: '',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1KDKJxfzQ3kYwpOsvkgRoRg7a9FuBcihIvgoajNPp730/edit?gid=0#gid=0',
    botToken: '8973353664:AAHzThHxzp69jYh-A_fCU6T3U9Q-kJFf9f0', // بوت توثيق مناقشات جسور الجديد (@JosourMonaqashatBot)
    chatId: '-1002534160494', // نُشَطَاء جُسُور |7|
    topicId: '' // قناة نشطاء جسور 7
  };
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch (e) {
    return defaults;
  }
}

function saveSettingsToStorage(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// تحميل سجلات المناقشات
function getRecords() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// ==========================================================================
// إدارة التنقل بين الواجهات (Tabs)
// ==========================================================================
function showSection(sectionId) {
  const registerSec = document.getElementById('registerSection');
  const adminSec = document.getElementById('adminSection');
  const tabRegBtn = document.getElementById('tabRegisterBtn');
  const tabAdminBtn = document.getElementById('tabAdminBtn');

  if (sectionId === 'register') {
    registerSec.classList.add('active-section');
    adminSec.classList.remove('active-section');
    tabRegBtn.classList.add('active');
    tabAdminBtn.classList.remove('active');
  } else {
    registerSec.classList.remove('active-section');
    adminSec.classList.add('active-section');
    tabRegBtn.classList.remove('active');
    tabAdminBtn.classList.add('active');
    checkAdminAuth();
  }
}

// ==========================================================================
// فحص الشروط الستة وتفعيل زر الإرسال
// ==========================================================================
function validateConditions() {
  const conds = [
    document.getElementById('cond1').checked,
    document.getElementById('cond2').checked,
    document.getElementById('cond3').checked,
    document.getElementById('cond4').checked,
    document.getElementById('cond5').checked,
    document.getElementById('cond6').checked
  ];

  const allChecked = conds.every(Boolean);
  const submitBtn = document.getElementById('submitBtn');
  const alertBox = document.getElementById('conditionsAlert');

  if (allChecked) {
    alertBox.className = 'conditions-alert ready';
    alertBox.innerHTML = '<span>✅ رائع! تمت الموافقة على جميع الشروط الستة بنجاح، يمكنك الآن استكمال بياناتك وإرسال التسجيل.</span>';
    submitBtn.disabled = false;
  } else {
    alertBox.className = 'conditions-alert';
    alertBox.innerHTML = '<span>⚠️ يجب تفعيل الموافقة على جميع الشروط الستة أعلاه لفتح استمارة التسجيل.</span>';
    submitBtn.disabled = true;
  }

  // إعادة التحقق من سقف اليوم إن كان محدداً
  handleDateChange();
}

// ==========================================================================
// التحقق من حصة اليوم (5 كحد أقصى) وإغلاق الأيام المكتملة
// ==========================================================================
function updateDateOptionsQuota() {
  const dateSelect = document.getElementById('defenseDate');
  if (!dateSelect) return;
  const records = getRecords();

  const daysInfo = [
    { value: '2026-09-19', label: 'السبت 19 سبتمبر 2026' },
    { value: '2026-09-20', label: 'الأحد 20 سبتمبر 2026' },
    { value: '2026-09-21', label: 'الاثنين 21 سبتمبر 2026' },
    { value: '2026-09-22', label: 'الثلاثاء 22 سبتمبر 2026' }
  ];

  const currentVal = dateSelect.value;
  let html = '<option value="" disabled ' + (!currentVal ? 'selected' : '') + '>-- اختر تاريخ المناقشة (الحد الأقصى 5 يومياً) --</option>';

  daysInfo.forEach(day => {
    const dayCount = records.filter(r => r.defenseDate === day.value).length;
    const remaining = MAX_PER_DAY - dayCount;
    const isFull = remaining <= 0;
    const isSelected = currentVal === day.value;

    if (isFull) {
      html += `<option value="${day.value}" disabled style="color:#ef4444; background:#1e293b; font-weight:bold;">${day.label} (❌ اكتمل الحد الأقصى 5/5)</option>`;
    } else {
      html += `<option value="${day.value}" ${isSelected ? 'selected' : ''}>${day.label} (متبقي ${remaining} من 5)</option>`;
    }
  });

  dateSelect.innerHTML = html;
}

function handleDateChange() {
  const dateInput = document.getElementById('defenseDate');
  const selectedDate = dateInput.value;
  const badge = document.getElementById('dayQuotaBadge');
  const submitBtn = document.getElementById('submitBtn');

  if (!selectedDate) {
    badge.className = 'quota-badge';
    badge.textContent = 'الحد الأقصى: 5 مناقشات في اليوم الواحد';
    return;
  }

  const records = getRecords();
  const dayRecords = records.filter(r => r.defenseDate === selectedDate);
  const remaining = MAX_PER_DAY - dayRecords.length;

  if (remaining <= 0) {
    badge.className = 'quota-badge full';
    badge.innerHTML = '<strong>❌ عذراً، اكتمل العدد الأقصى لهذا اليوم (5 مناقشات). لا يمكن لأحد تسجيل المزيد في هذا اليوم.</strong>';
    submitBtn.disabled = true;
  } else {
    badge.className = 'quota-badge';
    badge.textContent = `الأماكن الشاغرة لهذا اليوم: ${remaining} من أصل 5 مناقشات.`;
    // تفعيل الزر إذا كانت الشروط مفعلة
    const conds = [
      document.getElementById('cond1').checked,
      document.getElementById('cond2').checked,
      document.getElementById('cond3').checked,
      document.getElementById('cond4').checked,
      document.getElementById('cond5').checked,
      document.getElementById('cond6').checked
    ];
    if (conds.every(Boolean)) {
      submitBtn.disabled = false;
    }
  }
}

// ==========================================================================
// معالجة إرسال النموذج (Submit Form)
// ==========================================================================
async function handleFormSubmit(event) {
  event.preventDefault();

  const conds = [
    document.getElementById('cond1').checked,
    document.getElementById('cond2').checked,
    document.getElementById('cond3').checked,
    document.getElementById('cond4').checked,
    document.getElementById('cond5').checked,
    document.getElementById('cond6').checked
  ];

  if (!conds.every(Boolean)) {
    alert('يرجى تأكيد الموافقة على جميع الشروط الستة أولاً للمتابعة.');
    return;
  }

  const dateVal = document.getElementById('defenseDate').value;
  if (!VALID_DAYS.includes(dateVal)) {
    alert('يرجى اختيار يوم من أيام المناقشات المعتمدة (19، 20، 21، 22 سبتمبر).');
    return;
  }

  // فحص سقف اليوم مجدداً لمنع التعارض
  const records = getRecords();
  const dayRecords = records.filter(r => r.defenseDate === dateVal);
  if (dayRecords.length >= MAX_PER_DAY) {
    alert('عذراً، اكتمل العدد المتاح لهذا اليوم (5 مناقشات). يرجى اختيار يوم آخر.');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳</span> جاري حفظ التسجيل والإرسال...';

  const pres = document.getElementById('committeePresident').value.trim();
  const sup = document.getElementById('supervisor').value.trim();
  const exam = document.getElementById('examiner').value.trim();

  const newRecord = {
    id: 'JSR-' + Date.now().toString().slice(-6),
    createdAt: new Date().toISOString(),
    fullName: document.getElementById('fullName').value.trim(),
    specialty: document.getElementById('specialty').value.trim(),
    thesisTitle: document.getElementById('thesisTitle').value.trim(),
    committeePresident: pres,
    supervisor: sup,
    examiner: exam,
    committeeMembers: `رئيس اللجنة: ${pres} | المشرف: ${sup} | المناقش: ${exam}`,
    defenseHall: document.getElementById('defenseHall').value.trim(),
    defenseDate: dateVal,
    defenseTime: document.getElementById('defenseTime').value,
    phoneNumber: document.getElementById('phoneNumber').value.trim(),
    telegramUser: document.getElementById('telegramUser').value.trim(),
    photographerName: '', // يحدد عند قبول الطلب لإدراجه في Google Sheet
    status: 'جديد'
  };

  // 1. الحفظ السحابي في فايربيس (Firestore)
  if (db) {
    try {
      await db.collection('defense_registrations').doc(newRecord.id).set(newRecord);
      console.log('تم حفظ التسجيل في فايربيس بنجاح:', newRecord.id);
    } catch (e) {
      console.warn('تنبيه حفظ فايربيس:', e);
    }
  }

  // 2. الحفظ المحلي الاحتياطي في المتصفح
  records.push(newRecord);
  saveRecords(records);

  // 3. إرسال إشعار فوري لبوت تيليجرام الجديد بقناة نشطاء جسور 7
  const settings = getSettings();
  sendTelegramNotification(newRecord, settings);

  // 4. إظهار بطاقة التأكيد وتفريغ النموذج
  showSuccessModal(newRecord);
  resetForm();
}

function resetForm() {
  document.getElementById('registrationForm').reset();
  const conds = document.querySelectorAll('.cond-check');
  conds.forEach(c => c.checked = false);
  validateConditions();
}

// ==========================================================================
// الإشعار الفوري عبر بوت تيليجرام
// ==========================================================================
function sendTelegramNotification(record, settings) {
  if (!settings.botToken || !settings.chatId) return;

  const dateMap = {
    '2026-09-19': 'السبت 19 سبتمبر 2026',
    '2026-09-20': 'الأحد 20 سبتمبر 2026',
    '2026-09-21': 'الاثنين 21 سبتمبر 2026',
    '2026-09-22': 'الثلاثاء 22 سبتمبر 2026'
  };

  const formattedDate = dateMap[record.defenseDate] || record.defenseDate;

  const msgHtml = 
`🎓 <b>تسجيل جديد لتوثيق مناقشة — نادي الجسور</b>

👤 <b>الطالب:</b> ${escapeHtml(record.fullName)}
📚 <b>التخصص:</b> ${escapeHtml(record.specialty)}
📖 <b>عنوان المذكرة:</b> ${escapeHtml(record.thesisTitle)}
👨‍🏫 <b>رئيس اللجنة:</b> ${escapeHtml(record.committeePresident || 'غير محدد')}
👨‍🏫 <b>الأستاذ المشرف:</b> ${escapeHtml(record.supervisor || 'غير محدد')}
👨‍🏫 <b>الأستاذ المناقش:</b> ${escapeHtml(record.examiner || 'غير محدد')}
🏛️ <b>القاعة:</b> ${escapeHtml(record.defenseHall)}
📅 <b>الموعد:</b> ${formattedDate}
⏰ <b>التوقيت:</b> ${record.defenseTime}
📞 <b>الهاتف:</b> <code>${escapeHtml(record.phoneNumber)}</code>
💬 <b>التيليجرام:</b> ${escapeHtml(record.telegramUser)}
🏷️ <b>رمز الطلب:</b> <code>${record.id}</code>
⚡ <b>الحالة:</b> قيد المراجعة في المقر`;

  const acceptUrl = `https://mirazed001-rgb.github.io/taswir_monaqashat/?accept=${encodeURIComponent(record.id)}`;

  const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;
  const payload = {
    chat_id: settings.chatId,
    text: msgHtml,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ قبول المناقشة وتعيين المصور",
            url: acceptUrl
          }
        ]
      ]
    }
  };

  if (settings.topicId) {
    payload.message_thread_id = parseInt(settings.topicId, 10);
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(e => console.error('Telegram notification error:', e));
}

// إرسال إشعار قبول الطلب وتعيين المصور إلى قناة نشطاء جسور 7
function sendAcceptanceTelegramNotification(record, settings) {
  if (!settings.botToken || !settings.chatId) return;

  const dateMap = {
    '2026-09-19': 'السبت 19 سبتمبر 2026',
    '2026-09-20': 'الأحد 20 سبتمبر 2026',
    '2026-09-21': 'الاثنين 21 سبتمبر 2026',
    '2026-09-22': 'الثلاثاء 22 سبتمبر 2026'
  };

  const formattedDate = dateMap[record.defenseDate] || record.defenseDate;

  const msgHtml = 
`✅ <b>تم قبول طلب توثيق مناقشة — نادي الجسور</b>

👤 <b>الطالب:</b> ${escapeHtml(record.fullName)}
📚 <b>التخصص:</b> ${escapeHtml(record.specialty)}
📖 <b>عنوان المذكرة:</b> ${escapeHtml(record.thesisTitle)}
🏛️ <b>القاعة:</b> ${escapeHtml(record.defenseHall)}
📅 <b>الموعد:</b> ${formattedDate} | ⏰ <b>التوقيت:</b> ${record.defenseTime}
📷 <b>المصور المتكفل بالتصوير:</b> <b>${escapeHtml(record.photographerName)}</b>
📊 <b>الحالة:</b> تم تأكيد الطلب وتعيين المصور بنجاح 🟢`;

  const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;
  const payload = {
    chat_id: settings.chatId,
    text: msgHtml,
    parse_mode: 'HTML'
  };

  if (settings.topicId) {
    payload.message_thread_id = parseInt(settings.topicId, 10);
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(e => console.error('Telegram acceptance alert error:', e));
}

// ==========================================================================
// نافذة النجاح والتأكيد
// ==========================================================================
function showSuccessModal(record) {
  const summaryBox = document.getElementById('successSummary');
  const dateMap = {
    '2026-09-19': '19 سبتمبر 2026',
    '2026-09-20': '20 سبتمبر 2026',
    '2026-09-21': '21 سبتمبر 2026',
    '2026-09-22': '22 سبتمبر 2026'
  };

  summaryBox.innerHTML = `
    <div class="summary-item">
      <span class="summary-label">اسم الطالب:</span>
      <span class="summary-val">${record.fullName}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">التاريخ المحدد:</span>
      <span class="summary-val">${dateMap[record.defenseDate] || record.defenseDate}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">التوقيت:</span>
      <span class="summary-val">${record.defenseTime}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">القاعة / المدرج:</span>
      <span class="summary-val">${record.defenseHall}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">رمز التسجيل:</span>
      <span class="summary-val">${record.id}</span>
    </div>
  `;

  document.getElementById('successModal').classList.add('active-modal');
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('active-modal');
}

// ==========================================================================
// لوحة الإدارة وحماية الدخول
// ==========================================================================
let isAdminAuthenticated = false;

function checkAdminAuth() {
  const loginBox = document.getElementById('adminLoginBox');
  const dashboard = document.getElementById('adminDashboard');

  if (isAdminAuthenticated) {
    loginBox.style.display = 'none';
    dashboard.style.display = 'block';
    renderDashboard();
  } else {
    loginBox.style.display = 'block';
    dashboard.style.display = 'none';
  }
}

function handleAdminLogin(event) {
  event.preventDefault();
  const inputPass = document.getElementById('adminPass').value;
  const settings = getSettings();
  const errorSpan = document.getElementById('loginError');

  if (inputPass === settings.adminPass) {
    isAdminAuthenticated = true;
    errorSpan.style.display = 'none';
    document.getElementById('adminPass').value = '';
    checkAdminAuth();
  } else {
    errorSpan.style.display = 'block';
  }
}

function handleAdminLogout() {
  isAdminAuthenticated = false;
  checkAdminAuth();
}

// عرض وتحديث محتوى لوحة الإدارة
function renderDashboard() {
  updateStats();
  filterTable();
}

function updateStats() {
  const records = getRecords();
  document.getElementById('statTotal').textContent = records.length;

  const days = [
    { key: '2026-09-19', idVal: 'statDay19', idHint: 'hintDay19', idCard: 'cardDay19' },
    { key: '2026-09-20', idVal: 'statDay20', idHint: 'hintDay20', idCard: 'cardDay20' },
    { key: '2026-09-21', idVal: 'statDay21', idHint: 'hintDay21', idCard: 'cardDay21' },
    { key: '2026-09-22', idVal: 'statDay22', idHint: 'hintDay22', idCard: 'cardDay22' }
  ];

  days.forEach(d => {
    const count = records.filter(r => r.defenseDate === d.key).length;
    const remaining = MAX_PER_DAY - count;
    document.getElementById(d.idVal).textContent = count;
    const hintEl = document.getElementById(d.idHint);
    const cardEl = document.getElementById(d.idCard);

    if (remaining <= 0) {
      hintEl.textContent = '❌ مكتمل بالكامل';
      hintEl.style.color = '#ef4444';
      cardEl.style.borderTopColor = '#ef4444';
    } else {
      hintEl.textContent = `الأماكن المتاحة: ${remaining}`;
      hintEl.style.color = '#cbd5e1';
      cardEl.style.borderTopColor = '#eab308';
    }
  });
}

// تصفية وعرض جدول المناقشات
function filterTable() {
  const records = getRecords();
  const searchVal = document.getElementById('adminSearchInput').value.toLowerCase().trim();
  const dayVal = document.getElementById('dayFilter').value;
  const statusVal = document.getElementById('statusFilter').value;

  const filtered = records.filter(r => {
    const matchSearch = !searchVal || 
      r.fullName.toLowerCase().includes(searchVal) ||
      r.specialty.toLowerCase().includes(searchVal) ||
      r.thesisTitle.toLowerCase().includes(searchVal) ||
      r.defenseHall.toLowerCase().includes(searchVal) ||
      r.phoneNumber.includes(searchVal);

    const matchDay = (dayVal === 'all') || (r.defenseDate === dayVal);
    const matchStatus = (statusVal === 'all') || (r.status === statusVal);

    return matchSearch && matchDay && matchStatus;
  });

  const tbody = document.getElementById('tableBody');
  const noData = document.getElementById('noDataMessage');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    noData.style.display = 'block';
    return;
  }

  noData.style.display = 'none';

  const dateShort = {
    '2026-09-19': '19 سبتمبر',
    '2026-09-20': '20 سبتمبر',
    '2026-09-21': '21 سبتمبر',
    '2026-09-22': '22 سبتمبر'
  };

  tbody.innerHTML = filtered.map((r, idx) => `
    <tr>
      <td><strong>${idx + 1}</strong></td>
      <td>
        <span class="student-name">${escapeHtml(r.fullName)}</span>
        <small style="color:#94a3b8">${r.id}</small>
      </td>
      <td>${escapeHtml(r.specialty)}</td>
      <td style="max-width: 200px; font-size: 0.85rem;">${escapeHtml(r.thesisTitle)}</td>
      <td style="font-size: 0.85rem;">${escapeHtml(r.committeeMembers || '')}</td>
      <td><strong>${escapeHtml(r.defenseHall)}</strong></td>
      <td>
        <span style="color:#eab308; font-weight:700;">${dateShort[r.defenseDate] || r.defenseDate}</span><br>
        <span style="color:#cbd5e1;">${r.defenseTime}</span>
      </td>
      <td dir="ltr" style="text-align: right;">
        <span>${escapeHtml(r.phoneNumber)}</span><br>
        <small style="color:#38bdf8">${escapeHtml(r.telegramUser)}</small>
      </td>
      <td>
        ${r.photographerName ? 
          `<span style="color:#10b981; font-weight:700;">📷 ${escapeHtml(r.photographerName)}</span>` : 
          `<span style="color:#94a3b8; font-size:0.85rem;">لم يُعيّن بعد</span>`
        }
      </td>
      <td>
        <span class="badge-status status-${r.status.replace(/\s+/g, '-')}">${r.status}</span>
      </td>
      <td class="no-print">
        <div class="table-actions">
          ${r.status === 'جديد' || !r.photographerName ? 
            `<button type="button" class="btn-icon-action" style="background:#065f46; color:#86efac; border-color:#10b981; font-weight:700; white-space:nowrap;" onclick="openAcceptModal('${r.id}')">✅ قبول وتعيين مصور</button>` : 
            `<button type="button" class="btn-icon-action" title="تعديل المصور" onclick="openAcceptModal('${r.id}')">✏️ المصور</button>`
          }
          <select onchange="changeStatus('${r.id}', this.value)" style="padding: 4px 6px; font-size: 0.8rem;">
            <option value="جديد" ${r.status === 'جديد' ? 'selected' : ''}>جديد</option>
            <option value="مؤكد" ${r.status === 'مؤكد' ? 'selected' : ''}>مؤكد</option>
            <option value="تم التصوير" ${r.status === 'تم التصوير' ? 'selected' : ''}>تم التصوير</option>
            <option value="تم نقل الفيديو" ${r.status === 'تم نقل الفيديو' ? 'selected' : ''}>تم نقل الفيديو</option>
            <option value="مكتمل" ${r.status === 'مكتمل' ? 'selected' : ''}>مكتمل</option>
          </select>
          <button type="button" class="btn-icon-action btn-delete" title="حذف الطلب" onclick="deleteRecord('${r.id}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ==========================================================================
// إدارة نافذة قبول الطلب وتعيين المصور والإدراج التلقائي في Google Sheets
// ==========================================================================
let currentAcceptingRecordId = null;

async function openAcceptModal(recordId) {
  let records = getRecords();
  let record = records.find(r => r.id === recordId);

  // إذا لم يكن السجل موجوداً في التخزين المحلي للمتصفح، نبحث عنه مباشرة في فايربيس السحابي
  if (!record && db) {
    try {
      const doc = await db.collection('defense_registrations').doc(recordId).get();
      if (doc.exists) {
        record = doc.data();
        records.push(record);
        saveRecords(records);
      }
    } catch (e) {
      console.warn('تنبيه استرجاع السجل من فايربيس:', e);
    }
  }

  if (!record) {
    alert('تعذر العثور على بيانات هذا الطلب، يرجى التحقق من لوحة الإدارة.');
    return;
  }

  currentAcceptingRecordId = recordId;
  const summaryEl = document.getElementById('acceptStudentSummary');
  const dateShort = {
    '2026-09-19': 'السبت 19 سبتمبر 2026',
    '2026-09-20': 'الأحد 20 سبتمبر 2026',
    '2026-09-21': 'الاثنين 21 سبتمبر 2026',
    '2026-09-22': 'الثلاثاء 22 سبتمبر 2026'
  };

  summaryEl.innerHTML = `
    <div class="summary-item">
      <span class="summary-label">الطالب:</span>
      <span class="summary-val">${escapeHtml(record.fullName)}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">التخصص:</span>
      <span class="summary-val">${escapeHtml(record.specialty)}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">عنوان المذكرة:</span>
      <span class="summary-val">${escapeHtml(record.thesisTitle)}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">الموعد والقاعة:</span>
      <span class="summary-val">${dateShort[record.defenseDate] || record.defenseDate} — ${record.defenseTime} (${escapeHtml(record.defenseHall)})</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">رئيس اللجنة:</span>
      <span class="summary-val">${escapeHtml(record.committeePresident || 'غير محدد')}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">الأستاذ المشرف:</span>
      <span class="summary-val">${escapeHtml(record.supervisor || 'غير محدد')}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">الأستاذ المناقش:</span>
      <span class="summary-val">${escapeHtml(record.examiner || 'غير محدد')}</span>
    </div>
  `;

  document.getElementById('photographerInput').value = record.photographerName || '';
  document.getElementById('acceptModal').classList.add('active-modal');
}

function closeAcceptModal() {
  currentAcceptingRecordId = null;
  document.getElementById('acceptModal').classList.remove('active-modal');
}

async function confirmAcceptance() {
  const photographerInput = document.getElementById('photographerInput');
  const photographer = photographerInput ? photographerInput.value.trim() : '';
  // إذا لم يُدخل المشرف اسماً، نتركه فارغاً أو نكتب لم يُعيّن بعد ليتم إضافته يدوياً في جدول Google Sheet
  const photographerText = photographer || 'لم يُعيّن بعد (يضاف يدوياً)';

  const records = getRecords();
  const record = records.find(r => r.id === currentAcceptingRecordId);
  if (!record) return;

  record.photographerName = photographerText;
  record.status = 'مؤكد';
  record.acceptedAt = new Date().toISOString();

  saveRecords(records);
  renderDashboard();

  // 1. تحديث قاعدة بيانات فايربيس السحابية
  if (db) {
    db.collection('defense_registrations').doc(record.id).update({
      photographerName: photographerText,
      status: 'مؤكد',
      acceptedAt: record.acceptedAt
    }).catch(e => console.warn('Firebase update notice:', e));
  }

  // 2. إرسال فوري وتلقائي إلى Google Sheet عبر Webhook
  const settings = getSettings();
  if (settings.webhookUrl) {
    fetch(settings.webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }).catch(e => console.warn('Google Sheets auto-sync notice:', e));
  }

  // 3. إرسال إشعار فوري لقناة نشطاء جسور 7 بقبول الطلب وتعيين المصور
  sendAcceptanceTelegramNotification(record, settings);

  closeAcceptModal();
  alert(`✅ تم بنجاح قبول طلب الطالب (${record.fullName}) وتعيين المصور (${photographerText})، وأُرسلت المعلومات تلقائياً إلى Google Sheet!`);
}

// دالة إرسال كافة المناقشات تلقائياً وبضغطة واحدة إلى Google Sheet
async function syncAllToGoogleSheets() {
  const settings = getSettings();
  if (!settings.webhookUrl) {
    alert('يرجى وضع رابط تطبيق الويب (Google Apps Script Webhook URL) في نافذة الإعدادات لتوجيه البيانات تلقائياً لجدولك.');
    openSettingsModal();
    return;
  }

  const records = getRecords();
  if (records.length === 0) {
    alert('لا توجد مناقشات مسجلة حالياً.');
    return;
  }

  const btn = document.getElementById('syncAllSheetsBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> جاري الإرسال التلقائي...';
  }

  let sent = 0;
  for (const r of records) {
    try {
      await fetch(settings.webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r)
      });
      sent++;
    } catch(e) {
      console.warn('Sync error:', e);
    }
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>🔄</span> إرسال تلقائي لـ Google Sheet';
  }

  alert(`✅ تم بنجاح إرسال جميع المناقشات (${sent}) تلقائياً إلى جدول Google Sheet! تفقد جدولك الآن.`);
}

function changeStatus(recordId, newStatus) {
  const records = getRecords();
  const item = records.find(r => r.id === recordId);
  if (item) {
    item.status = newStatus;
    saveRecords(records);
    renderDashboard();

    // تحديث فايربيس السحابي
    if (db) {
      db.collection('defense_registrations').doc(recordId).update({ status: newStatus }).catch(e => console.warn(e));
    }
  }
}

function deleteRecord(recordId) {
  if (!confirm('هل أنت متأكد من حذف هذا التسجيل؟ لا يمكن التراجع عن هذا الإجراء.')) return;
  let records = getRecords();
  records = records.filter(r => r.id !== recordId);
  saveRecords(records);
  renderDashboard();

  // حذف من فايربيس السحابي
  if (db) {
    db.collection('defense_registrations').doc(recordId).delete().catch(e => console.warn(e));
  }
}

// ==========================================================================
// التصدير إلى CSV وطباعة الجدول
// ==========================================================================
function exportDataToCSV() {
  const records = getRecords();
  if (records.length === 0) {
    alert('لا توجد بيانات مسجلة لتصديرها.');
    return;
  }

  const headers = ['رقم الطلب', 'تاريخ التسجيل', 'الاسم واللقب', 'التخصص', 'عنوان المذكرة', 'اللجنة', 'القاعة', 'يوم المناقشة', 'التوقيت', 'الهاتف', 'التيليجرام', 'المصور المتكفل', 'الحالة'];
  
  const rows = records.map(r => [
    `"${r.id}"`,
    `"${r.createdAt}"`,
    `"${r.fullName.replace(/"/g, '""')}"`,
    `"${r.specialty.replace(/"/g, '""')}"`,
    `"${r.thesisTitle.replace(/"/g, '""')}"`,
    `"${(r.committeeMembers || '').replace(/"/g, '""')}"`,
    `"${r.defenseHall.replace(/"/g, '""')}"`,
    `"${r.defenseDate}"`,
    `"${r.defenseTime}"`,
    `"${r.phoneNumber}"`,
    `"${r.telegramUser}"`,
    `"${(r.photographerName || 'لم يُعيّن').replace(/"/g, '""')}"`,
    `"${r.status}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `جدول_مناقشات_نادي_الجسور_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function printTableSchedule() {
  window.print();
}

// ==========================================================================
// نافذة الإعدادات وتغيير الكريدنشلز
// ==========================================================================
function openSettingsModal() {
  const settings = getSettings();
  document.getElementById('webhookUrlInput').value = settings.webhookUrl || '';
  document.getElementById('adminPassInput').value = settings.adminPass || '';
  document.getElementById('settingsModal').classList.add('active-modal');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('active-modal');
}

function saveSettings() {
  const settings = getSettings();
  const newWebhook = document.getElementById('webhookUrlInput').value.trim();
  const newPass = document.getElementById('adminPassInput').value.trim();

  if (newPass) settings.adminPass = newPass;
  settings.webhookUrl = newWebhook;

  saveSettingsToStorage(settings);
  closeSettingsModal();
  alert('تم حفظ الإعدادات بنجاح!');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// التهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  validateConditions();
  setupFirestoreListener();
  updateDateOptionsQuota();
  
  // فحص ما إذا كان الرابط يحتوي على معيار قبول مباشر من تيليجرام (?accept=JSR-...)
  const urlParams = new URLSearchParams(window.location.search);
  const acceptId = urlParams.get('accept');
  if (acceptId) {
    isAdminAuthenticated = true;
    showSection('admin');
    setTimeout(() => {
      openAcceptModal(acceptId);
    }, 600);
  }

  // إضافة بيانات تجريبية خفيفة إذا كان التخزين فارغاً تماماً لتسهيل المعاينة
  const existing = getRecords();
  if (existing.length === 0) {
    const sample = [
      {
        id: 'JSR-101001',
        createdAt: '2026-09-17T10:00:00.000Z',
        fullName: 'أيوب منصوري',
        specialty: 'ماستر شريعة وقانون',
        thesisTitle: 'أحكام المعاملات المالية المعاصرة في الفقه الإسلامي',
        committeePresident: 'د. لخضر',
        supervisor: 'أ.د حميدي',
        examiner: 'د. عمار',
        committeeMembers: 'رئيس اللجنة: د. لخضر | المشرف: أ.د حميدي | المناقش: د. عمار',
        defenseHall: 'قاعة 04',
        defenseDate: '2026-09-19',
        defenseTime: '09:00',
        phoneNumber: '0555123456',
        telegramUser: '@Ayoub_Mansouri',
        photographerName: 'عبد الرحيم',
        status: 'مؤكد'
      },
      {
        id: 'JSR-101002',
        createdAt: '2026-09-17T11:30:00.000Z',
        fullName: 'سارة بوجمعة',
        specialty: 'ماستر أصول الدين',
        thesisTitle: 'منهج الاستدلال العقدي عند أئمة المغرب الإسلامي',
        committeePresident: 'د. بلقاسم',
        supervisor: 'د. زروقي',
        examiner: 'د. قادري',
        committeeMembers: 'رئيس اللجنة: د. بلقاسم | المشرف: د. زروقي | المناقش: د. قادري',
        defenseHall: 'مدرج ج',
        defenseDate: '2026-09-20',
        defenseTime: '10:30',
        phoneNumber: '0666987654',
        telegramUser: '@Sarah_B',
        photographerName: '',
        status: 'جديد'
      }
    ];
    saveRecords(sample);
  }
});
