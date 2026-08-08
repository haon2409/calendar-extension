let currentDate = new Date();
let accessToken = "";

// 1. Khởi tạo & Lắng nghe sự kiện
document.addEventListener('DOMContentLoaded', () => {
    // Silent login: Tự động lấy token hợp lệ (hoặc làm mới nếu đã hết hạn)
    chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (chrome.runtime.lastError || !token) {
            document.getElementById('login-google').style.display = 'inline-block';
            document.getElementById('logout-google').style.display = 'none';
        } else {
            accessToken = token;
            document.getElementById('login-google').style.display = 'none';
            document.getElementById('logout-google').style.display = 'inline-block';
            renderCalendar();
        }
    });
    
    // Khởi tạo giao diện lịch cơ bản
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

// Nút Đồng bộ / Đăng nhập
document.getElementById('login-google').addEventListener('click', () => {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError || !token) {
            console.error(chrome.runtime.lastError);
            alert('Lỗi khi đăng nhập: ' + chrome.runtime.lastError.message);
            return;
        }
        
        accessToken = token;
        document.getElementById('login-google').style.display = 'none';
        document.getElementById('logout-google').style.display = 'inline-block';
        alert('Đã kết nối thành công!');
        renderCalendar();
    });
});

// Nút Đăng xuất
document.getElementById('logout-google').addEventListener('click', () => {
    if (!accessToken) return;
    
    chrome.identity.removeCachedAuthToken({ token: accessToken }, function() {
        accessToken = "";
        document.getElementById('login-google').style.display = 'inline-block';
        document.getElementById('logout-google').style.display = 'none';
        alert('Đã đăng xuất thành công! Vui lòng bấm Đồng bộ lại để cấp đủ quyền.');
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

// 3. Logic Fetch API Google Calendar & Tasks
async function apiRequest(url) {
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
    
    // Bẫy lỗi HTTP (ví dụ: 401 Unauthorized do token hết hạn)
    if (!res.ok) {
        throw new Error(`Lỗi HTTP: ${res.status}`);
    }
    
    return res.json();
}

async function fetchMonthlyData(year, month) {
    const timeMin = new Date(year, month, 1).toISOString();
    const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    // Ép maxResults lên 2500 (mức tối đa của Calendar API) để đảm bảo gom đủ mọi sự kiện trong tháng
    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=2500`;
    
    // Đưa dueMin và dueMax trở lại để lọc đúng tháng. Kẹp thêm maxResults=100 (tối đa của Tasks API).
    const tasksUrl = `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&dueMin=${timeMin}&dueMax=${timeMax}&maxResults=100`;

    try {
        const [eventsData, tasksData] = await Promise.all([
            apiRequest(eventsUrl),
            apiRequest(tasksUrl)
        ]);

        // Đổ Events vào lịch
        if (eventsData && eventsData.items) {
            eventsData.items.forEach(ev => {
                const dateVal = ev.start.dateTime || ev.start.date;
                if (!dateVal) return;
                
                const dateStr = dateVal.split('T')[0];
                const targetCell = document.getElementById(`date-${dateStr}`);
                
                if (targetCell) {
                    const div = document.createElement('div');
                    div.className = 'event-item';
                    div.innerText = ev.summary;
                    targetCell.appendChild(div);
                }
            });
        }

        // Đổ Tasks vào lịch
        if (tasksData && tasksData.items) {
            tasksData.items.forEach(task => {
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
                    div.innerText = task.title;
                    targetCell.appendChild(div);
                }
            });
        }
    } catch (e) {
        console.error('Lỗi tải dữ liệu lịch và task:', e);
    }
}