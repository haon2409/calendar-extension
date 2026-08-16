// Import file lunar.js để sử dụng hàm getLunarDate trong Service Worker
importScripts('lunar.js');

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
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    const lunarInfo = getLunarDate(day, month, year);
    const lunarDay = lunarInfo[0].toString();
    const lunarMonth = lunarInfo[1].toString();

    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    // 1. Cấu hình bo tròn 4 góc (Radius = 20px)
    const radius = 20;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(128 - radius, 0);
    ctx.quadraticCurveTo(128, 0, 128, radius);
    ctx.lineTo(128, 128 - radius);
    ctx.quadraticCurveTo(128, 128, 128 - radius, 128);
    ctx.lineTo(radius, 128);
    ctx.quadraticCurveTo(0, 128, 0, 128 - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip(); // Cắt toàn bộ nội dung sau này vào phạm vi bo tròn

    // 2. Nền Đen (đã nằm trong vùng bo tròn nhờ clip)
    ctx.fillStyle = '#1f1f1f';
    ctx.fillRect(0, 0, 128, 128);

    // 3. Vẽ đường gạch chéo
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(10, 118);
    ctx.lineTo(118, 10);
    ctx.stroke();

    // 4. Render text
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    // Giữ font kích thước lớn như bạn mong muốn
    ctx.font = 'bold 100px sans-serif';
    ctx.fillText(lunarDay, 38, 42);
    ctx.fillText(lunarMonth, 90, 94);

    const imageData = ctx.getImageData(0, 0, 128, 128);
    chrome.action.setIcon({ imageData: imageData });
    
    updateBadgeBackground();
}

async function updateBadgeBackground() {
    chrome.identity.getAuthToken({ interactive: false }, async function(token) {
        if (chrome.runtime.lastError || !token) return;

        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
        const url = `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&dueMin=${start}&dueMax=${end}`;

        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) return;
            const data = await res.json();
            
            if (data && data.items) {
                const count = data.items.filter(t => t.status !== 'completed').length;
                const text = count > 0 ? count.toString() : '';
                chrome.action.setBadgeText({ text: text });
                chrome.action.setBadgeBackgroundColor({ color: '#ff4d4d' });
                chrome.action.setBadgeTextColor({ color: '#ffffff' });
            }
        } catch (e) {
            console.error('Lỗi cập nhật badge:', e);
        }
    });
}