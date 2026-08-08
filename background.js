// Cập nhật icon khi cài đặt và mỗi giờ để đảm bảo sang ngày mới luôn chính xác
chrome.runtime.onInstalled.addListener(() => updateIcon());
chrome.alarms.create('updateIcon', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => { 
    if (alarm.name === 'updateIcon') updateIcon(); 
});

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