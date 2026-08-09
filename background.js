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
    const days = ['CN', '2', '3', '4', '5', '6', '7'];
    const day = days[date.getDay()];
    const dateNum = date.getDate().toString();

    // Xác định số ngày trong tháng hiện tại để chọn màu viền
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const borderColor = daysInMonth === 31 ? '#ff4d4d' : '#fbbc04';

    // Dùng OffscreenCanvas (hỗ trợ trong Manifest V3 Service Worker)
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    // Xóa toàn bộ
    ctx.clearRect(0, 0, 128, 128);

    // Xác định màu nền và màu chữ cho phần "Thứ" dựa theo ngày
    let dayBgColor = '#1bb5d6';
    let dayTextColor = '#000000';

    if (date.getDay() === 0) {
        dayBgColor = '#ff4d4d'; 
        dayTextColor = '#ffffff'; 
    } else if (date.getDay() === 6) {
        dayBgColor = '#fbbc04'; 
        dayTextColor = '#ffffff'; 
    }

    // 1. Nền trên cho "Thứ" (chiều cao từ 0 đến 64)
    ctx.fillStyle = dayBgColor;
    ctx.fillRect(0, 0, 128, 64);

    // 2. Nền dưới cho "Ngày" (chiều cao từ 64 đến 128)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 64, 128, 64);

    // 3. Vẽ viền Trái, Dưới, Phải cho phần "Ngày" (Độ dày 6px)
    const borderWidth = 6;
    ctx.fillStyle = borderColor;
    ctx.fillRect(0, 64, borderWidth, 64);                           
    ctx.fillRect(128 - borderWidth, 64, borderWidth, 64);           
    ctx.fillRect(0, 128 - borderWidth, 128, borderWidth);           

    // Thiết lập chung cho text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Co giãn chiều ngang (scaleX = 1.35) để chữ bẹt và lấp đầy không gian
    ctx.save();
    ctx.scale(1.35, 1.0); 
    const scaledX = 64 / 1.35;

    // Render "Thứ" với kích thước tối đa (64px) và căn lại tâm y (34px để bù font metric)
    ctx.fillStyle = dayTextColor; 
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(day, scaledX, 34);

    // Render "Ngày" chữ đen trên nền trắng
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText(dateNum, scaledX, 97);

    ctx.restore();

    const imageData = ctx.getImageData(0, 0, 128, 128);
    chrome.action.setIcon({ imageData: imageData });
}