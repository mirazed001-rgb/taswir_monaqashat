# -*- coding: utf-8 -*-
"""
بوت إشعارات وإدارة منصة توثيق المناقشات — نادي الجسور
يتيح إرسال تنبيهات فورية، والاستعلام الآمن عن حجوزات الأيام الأربعة (19 - 22 سبتمبر)
"""

import json
import logging
import os
import sys
import urllib.request
import urllib.parse

# إعداد التسجيل
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')

BOT_TOKEN = os.getenv("JOSOUR_BOT_TOKEN", "8509092860:AAET4WCXrx2MD2QVb0yrRCql5lAXoy-UhyY")
CHAT_ID = os.getenv("JOSOUR_CHAT_ID", "-1004497345814")  # حقيبة نشطاء جسور
TOPIC_ID = int(os.getenv("JOSOUR_TOPIC_ID", "30"))       # موضوع تقارير المداومة

# قائمة المشرفين المصرح لهم بالاستعلام
AUTHORIZED_USER_IDS = [5795723111]  # آية (@Ayazaidi)

def send_telegram_alert(record):
    """
    إرسال إشعار فوري بحجز مناقشة جديدة
    """
    date_labels = {
        "2026-09-19": "السبت 19 سبتمبر 2026",
        "2026-09-20": "الأحد 20 سبتمبر 2026",
        "2026-09-21": "الاثنين 21 سبتمبر 2026",
        "2026-09-22": "الثلاثاء 22 سبتمبر 2026"
    }
    day_str = date_labels.get(record.get("defenseDate", ""), record.get("defenseDate", ""))

    text = f"""🎓 *تسجيل جديد لتوثيق مناقشة — نادي الجسور*

👤 *الطالب:* {record.get('fullName', '')}
📚 *التخصص:* {record.get('specialty', '')}
📖 *عنوان المذكرة:* {record.get('thesisTitle', '')}
👥 *اللجنة:* {record.get('committeeMembers', '')}
🏛️ *القاعة:* {record.get('defenseHall', '')}
📅 *الموعد:* {day_str}
⏰ *التوقيت:* {record.get('defenseTime', '')}
📞 *الهاتف:* `{record.get('phoneNumber', '')}`
💬 *التيليجرام:* {record.get('telegramUser', '')}
🏷️ *رمز الطلب:* `{record.get('id', 'JSR')}`
⚡ *الحالة:* قيد المراجعة في المقر"""

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
        "message_thread_id": TOPIC_ID
    }

    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as response:
            res = response.read().decode('utf-8')
            logging.info("Telegram alert sent successfully.")
            return json.loads(res)
    except Exception as e:
        logging.error(f"Failed to send Telegram alert: {e}")
        return None

def test_connection():
    """
    اختبار اتصال البوت والتحقق من صلاحياته
    """
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getMe"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get("ok"):
                bot_info = data.get("result", {})
                logging.info(f"Bot connected: @{bot_info.get('username')} ({bot_info.get('first_name')})")
                return True
    except Exception as e:
        logging.error(f"Bot connection test failed: {e}")
    return False

if __name__ == "__main__":
    logging.info("Testing Telegram Bot Connection...")
    if test_connection():
        logging.info("Bot is ready and authenticated.")
        # اختبار إرسال تجريبي اختياري
        if len(sys.argv) > 1 and sys.argv[1] == "--test-send":
            test_record = {
                "id": "JSR-TEST01",
                "fullName": "طالب تجريبي",
                "specialty": "ماستر تجريبي",
                "thesisTitle": "تجربة إشعار منصة المناقشات",
                "committeeMembers": "د. فلان، د. علان",
                "defenseHall": "قاعة 01",
                "defenseDate": "2026-09-19",
                "defenseTime": "09:00",
                "phoneNumber": "0555000000",
                "telegramUser": "@test_user"
            }
            send_telegram_alert(test_record)
    else:
        logging.warning("Please check your internet connection or bot token.")
