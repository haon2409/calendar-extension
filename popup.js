let currentDate = new Date();
let accessToken = "";

// 1. Khởi tạo & Lắng nghe sự kiện
document.addEventListener('DOMContentLoaded', () => {
    // Silent login: Tự động lấy token hợp lệ
    chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (chrome.runtime.lastError || !token) {
            showLoginState(false);
        } else {
            accessToken = token;
            showLoginState(true);
            renderCalendar();
        }
    });
    
    // Khởi tạo giao diện lịch cơ bản nếu chưa đăng nhập
    if (!accessToken) {
        renderCalendar();
    }
});

document.getElementById('btn-prev').addEventListener('click', () => changeMonth(-1));
document.getElementById('btn-next').addEventListener('click', () => changeMonth(1));
document.getElementById('btn-today').addEventListener('click', () => {
    currentDate = new Date();
    renderCalendar();
});

// Chuyển đổi trạng thái nút Login / Logout trên UI
function showLoginState(isLoggedIn) {
    const loginBtn = document.getElementById('login-google');
    const logoutBtn = document.getElementById('logout-google');
    
    if (isLoggedIn) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
    }
}

// Nút Đồng bộ / Đăng nhập
document.getElementById('login-google').addEventListener('click', () => {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError || !token) {
            console.error(chrome.runtime.lastError);
            alert('Lỗi khi đăng nhập: ' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Không lấy được token'));
            return;
        }
        
        accessToken = token;
        showLoginState(true);
        alert('Đã kết nối thành công!');
        renderCalendar();
    });
});

// Nút Đăng xuất / Đổi tài khoản
document.getElementById('logout-google').addEventListener('click', async () => {
    if (!accessToken) return;
    
    const tokenToRevoke = accessToken;
    
    // 1. Gửi request thu hồi quyền truy cập (Revoke token trên server Google)
    try {
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${tokenToRevoke}`);
    } catch (e) {
        console.warn('Lỗi khi thu hồi token từ server Google:', e);
    }

    // 2. Xóa token lưu đệm ở trình duyệt
    chrome.identity.removeCachedAuthToken({ token: tokenToRevoke }, () => {
        accessToken = "";
        showLoginState(false);
        alert('Đã đăng xuất thành công! Bạn có thể chọn tài khoản khác khi bấm Đồng bộ.');
        renderCalendar();
    });
});

// 2. Logic Calendar
async function renderCalendar() {
    const grid = document.getElementById('days-grid');
    grid.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('month-year').innerText = `Tháng ${month + 1}, ${year}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    // Chuyển Chủ nhật (0) thành vị trí cuối cùng trong tuần (Thứ 2 bắt đầu)
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; 
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    // Render ô trống đầu tháng
    for (let i = 0; i < startOffset; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty';
        grid.appendChild(emptyCell);
    }

    // Render ngày
    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        cell.id = `date-${dateStr}`;

        const dateNum = document.createElement('div');
        dateNum.className = 'date-num';
        dateNum.innerText = i;
        
        if (isCurrentMonth && i === today.getDate()) {
            dateNum.classList.add('today');
        }
        
        cell.appendChild(dateNum);
        grid.appendChild(cell);
    }

    // Tự động tải dữ liệu nếu đã có token
    if (accessToken) {
        await fetchMonthlyData(year, month);
    }
}

function changeMonth(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar();
}

// 3. Logic Fetch API Google Calendar & Tasks (Có bẫy lỗi 401)
async function apiRequest(url) {
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
    
    // Nếu bị từ chối cấp quyền (HTTP 401 Unauthorized - token hết hạn hoặc bị hủy)
    if (res.status === 401) {
        if (accessToken) {
            chrome.identity.removeCachedAuthToken({ token: accessToken }, () => {});
            accessToken = "";
            showLoginState(false);
        }
        throw new Error('Phiên làm việc hết hạn. Vui lòng đăng nhập lại.');
    }
    
    if (!res.ok) {
        throw new Error(`Lỗi HTTP: ${res.status}`);
    }
    
    return res.json();
}

// Hàm hỗ trợ tải toàn bộ dữ liệu qua các trang (Pagination)
async function fetchAllPages(baseUrl) {
    let items = [];
    let pageToken = '';

    do {
        const separator = baseUrl.includes('?') ? '&' : '?';
        const urlWithToken = pageToken ? `${baseUrl}${separator}pageToken=${pageToken}` : baseUrl;
        const data = await apiRequest(urlWithToken);

        if (data && data.items) {
            items = items.concat(data.items);
        }
        
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return items;
}

async function fetchMonthlyData(year, month) {
    const timeMin = new Date(year, month, 1).toISOString();
    const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
    const tasksUrl = `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&dueMin=${timeMin}&dueMax=${timeMax}`;

    try {
        const [eventsItems, tasksItems] = await Promise.all([
            fetchAllPages(eventsUrl),
            fetchAllPages(tasksUrl)
        ]);

        // Đổ Events vào lịch
        eventsItems.forEach(ev => {
            const dateVal = ev.start?.dateTime || ev.start?.date;
            if (!dateVal) return;
            
            const dateStr = dateVal.split('T')[0];
            const targetCell = document.getElementById(`date-${dateStr}`);
            
            if (targetCell) {
                const div = document.createElement('div');
                div.className = 'event-item';
                div.innerText = ev.summary || '(Không có tiêu đề)';
                targetCell.appendChild(div);
            }
        });

        // Đổ Tasks vào lịch
        tasksItems.forEach(task => {
            if (!task.due) return;
            
            const dateStr = task.due.split('T')[0];
            const targetCell = document.getElementById(`date-${dateStr}`);
            
            if (targetCell) {
                const div = document.createElement('div');
                div.className = 'task-item';
                if (task.status === 'completed') {
                    div.style.textDecoration = 'line-through';
                    div.style.opacity = '0.7';
                }
                div.innerText = task.title || '(Không có tiêu đề)';
                targetCell.appendChild(div);
            }
        });
    } catch (e) {
        console.error('Lỗi tải dữ liệu lịch và task:', e);
    }
}