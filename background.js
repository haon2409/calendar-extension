// Thiết lập cập nhật định kỳ (mỗi ngày một lần hoặc khi khởi động)
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('updateIcon', { periodInMinutes: 1440 }); // Cập nhật mỗi 24h
    updateIcon();
});
chrome.runtime.onStartup.addListener(() => updateIcon());

chrome.alarms.onAlarm.addListener((alarm) => { 
    if (alarm.name === 'updateIcon') {
        updateIcon(); 
    }
});

// Lấy Ngày hiện tại (trả về chuỗi ngày, ví dụ: "17")
function getCurrentDay() {
    const now = new Date();
    return now.getDate().toString();
}

// Vẽ logo và cập nhật Icon
async function updateIcon() {
    const dayText = getCurrentDay();

    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    const bw = 32; // Độ dày của viền màu

    // 1. Tạo path bo tròn 4 góc và cắt chéo góc phải dưới (hiệu ứng nếp gấp)
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(128 - 24, 0);
    ctx.quadraticCurveTo(128, 0, 128, 24);
    ctx.lineTo(128, 128 - bw); 
    ctx.lineTo(128 - bw, 128); // Cắt chéo góc phải dưới
    ctx.lineTo(24, 128);
    ctx.quadraticCurveTo(0, 128, 0, 128 - 24);
    ctx.lineTo(0, 24);
    ctx.quadraticCurveTo(0, 0, 24, 0);
    ctx.closePath();
    ctx.clip(); 

    // 2. Nền trắng giữa tâm
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 128, 128);

    // 3. Viền Xanh Dương (Trên và Trái)
    ctx.fillStyle = '#4285F4';
    ctx.fillRect(0, 0, 128, bw);
    ctx.fillRect(0, 0, bw, 128);

    // Điểm giao cắt màu Xanh Dương đậm
    ctx.fillStyle = '#1A73E8';
    ctx.fillRect(128 - bw, 0, bw, bw); // Góc trên phải
    ctx.fillRect(0, 128 - bw, bw, bw); // Góc dưới trái

    // 4. Viền Xanh Lá (Phải)
    ctx.fillStyle = '#34A853';
    ctx.fillRect(128 - bw, bw, bw, 128 - bw * 2);

    // 5. Viền Vàng (Dưới)
    ctx.fillStyle = '#FBBC05';
    ctx.fillRect(bw, 128 - bw, 128 - bw * 2, bw);

    // 6. Nếp gấp màu Đỏ (Tam giác góc dưới phải)
    ctx.fillStyle = '#EA4335';
    ctx.beginPath();
    ctx.moveTo(128 - bw, 128);
    ctx.lineTo(128, 128 - bw);
    ctx.lineTo(128 - bw, 128 - bw);
    ctx.fill();

    // 7. Render Text (Ngày hiện tại) vào chính giữa
    ctx.fillStyle = '#4285F4'; 
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    // Tăng kích thước font chữ to hơn (55px cho 2 chữ số, 60px cho 1 chữ số)
    const fontSize = dayText.length > 1 ? 60 : 65;
    ctx.font = `bold ${fontSize}px "Segoe UI", Roboto, sans-serif`;
    
    // Đặt chữ ở tọa độ (64, 64) là tâm tuyệt đối của khung hình
    ctx.fillText(dayText, 64, 66); // Offset Y xuống 2px để chữ cân bằng mặt thị giác

    // 8. Cập nhật icon và xóa Badge
    const imageData = ctx.getImageData(0, 0, 128, 128);
    chrome.action.setIcon({ imageData: imageData });
    chrome.action.setBadgeText({ text: '' }); 
}