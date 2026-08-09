// Cập nhật icon khi cài đặt hoặc khi trình duyệt khởi động
chrome.runtime.onInstalled.addListener(() => setupDailyAlarm());
chrome.runtime.onStartup.addListener(() => updateIcon());

// Lắng nghe sự kiện alarm
chrome.alarms.onAlarm.addListener((alarm) => { 
    if (alarm.name === 'updateIcon') {
        updateIcon(); 
        // Sau lần nhảy đúng giao thừa đầu tiên, thiết lập chu kỳ lặp lại mỗi 24 giờ (1440 phút)
        chrome.alarms.create('updateIcon', { periodInMinutes: 1440 });
    }
});

function setupDailyAlarm() {
    updateIcon(); // Cập nhật ngay lập tức

    // Tính số phút còn lại từ bây giờ đến 00:00:01 ngày hôm sau
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const delayInMinutes = (tomorrow.getTime() - now.getTime()) / (1000 * 60);

    // Đặt lịch hẹn chính xác vào 00:00:01 sáng mai
    chrome.alarms.create('updateIcon', { delayInMinutes: delayInMinutes });
}

async function updateIcon() {
    const date = new Date();
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const day = days[date.getDay()];
    const dateNum = date.getDate().toString();

    // Dùng OffscreenCanvas (hỗ trợ trong Manifest V3 Service Worker)
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    // Nền tối
    ctx.fillStyle = '#202124';
    ctx.fillRect(0, 0, 128, 128);

    // Render "Thứ"
    ctx.fillStyle = (date.getDay() === 0 || date.getDay() === 6) ? '#fbbc04' : '#1bb5d6'; 
    ctx.font = 'bold 45px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(day, 64, 50);

    // Render "Ngày"
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(dateNum, 64, 115);

    const imageData = ctx.getImageData(0, 0, 128, 128);
    chrome.action.setIcon({ imageData: imageData });
}