let currentDate = new Date();
let accessToken = "";
let activeTaskContext = null;
let activeCellDateStr = null;
let createType = null; // 'task' hoặc 'event'

document.addEventListener('DOMContentLoaded', () => {
    chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (chrome.runtime.lastError || !token) {
            showLoginState(false);
        } else {
            accessToken = token;
            showLoginState(true);
            renderCalendar();
        }
    });
    
    if (!accessToken) {
        renderCalendar();
    }
});

// Ẩn context menu khi click ra ngoài
document.addEventListener('click', (e) => {
    const menu = document.getElementById('custom-context-menu');
    if (menu && !menu.contains(e.target)) {
        hideContextMenu();
    }
});

function hideContextMenu() {
    const menu = document.getElementById('custom-context-menu');
    if (menu) menu.style.display = 'none';
}

// Xử lý click tùy chọn trong context menu
document.getElementById('ctx-toggle-status').addEventListener('click', () => {
    hideContextMenu();
    if (activeTaskContext) {
        toggleTaskStatus(activeTaskContext.id, activeTaskContext.status);
    }
});

document.getElementById('ctx-add-task').addEventListener('click', () => {
    hideContextMenu();
    openAddModal('task');
});

document.getElementById('ctx-add-event').addEventListener('click', () => {
    hideContextMenu();
    openAddModal('event');
});

// Quản lý Modal nhập title
function openAddModal(type) {
    if (!accessToken) {
        alert('Vui lòng đồng bộ với Google (Đăng nhập) để sử dụng tính năng này!');
        return;
    }
    createType = type;
    const modal = document.getElementById('add-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input-title');

    modalTitle.innerText = type === 'event' 
        ? `Thêm Sự kiện (${activeCellDateStr})` 
        : `Thêm Công việc (${activeCellDateStr})`;
    
    modalInput.value = '';
    modal.style.display = 'flex';
    modalInput.focus();
}

function closeAddModal() {
    document.getElementById('add-modal').style.display = 'none';
    createType = null;
}

document.getElementById('modal-btn-cancel').addEventListener('click', closeAddModal);
document.getElementById('modal-btn-ok').addEventListener('click', submitAddItem);

document.getElementById('modal-input-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        submitAddItem();
    } else if (e.key === 'Escape') {
        closeAddModal();
    }
});

async function submitAddItem() {
    const titleInput = document.getElementById('modal-input-title');
    const title = titleInput.value.trim();
    if (!title) {
        alert('Vui lòng nhập tiêu đề!');
        return;
    }

    try {
        if (createType === 'event') {
            const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
            await apiRequest(url, {
                method: 'POST',
                body: JSON.stringify({
                    summary: title,
                    start: { date: activeCellDateStr },
                    end: { date: activeCellDateStr }
                })
            });
        } else if (createType === 'task') {
            const url = 'https://www.googleapis.com/tasks/v1/lists/@default/tasks';
            await apiRequest(url, {
                method: 'POST',
                body: JSON.stringify({
                    title: title,
                    due: `${activeCellDateStr}T00:00:00.000Z`
                })
            });
        }
        closeAddModal();
        renderCalendar();
    } catch (e) {
        console.error('Lỗi khi tạo mới:', e);
        alert('Không thể tạo mới: ' + e.message);
    }
}

document.getElementById('btn-prev').addEventListener('click', () => changeMonth(-1));
document.getElementById('btn-next').addEventListener('click', () => changeMonth(1));
document.getElementById('btn-today').addEventListener('click', () => {
    currentDate = new Date();
    renderCalendar();
});

function showLoginState(isLoggedIn) {
    const logoutBtn = document.getElementById('logout-google');
    const iconSvg = document.getElementById('icon-login-state');
    
    logoutBtn.style.display = 'flex';

    if (isLoggedIn) {
        logoutBtn.title = "Đăng xuất / Đổi tài khoản";
        iconSvg.innerHTML = `
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
        `;
    } else {
        logoutBtn.title = "Đồng bộ với Google";
        iconSvg.innerHTML = `
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" y1="12" x2="3" y2="12"></line>
        `;
    }
}

document.getElementById('logout-google').addEventListener('click', async () => {
    if (!accessToken) {
        // Trạng thái chưa login -> Thực hiện hành động Đăng nhập (thay thế nút "Đồng bộ với Google")[cite: 1]
        chrome.identity.getAuthToken({ interactive: true }, function(token) {
            if (chrome.runtime.lastError || !token) {
                console.error(chrome.runtime.lastError);
                alert('Lỗi khi đăng nhập: ' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Không lấy được token'));
                return;
            }
            accessToken = token;
            showLoginState(true);
            renderCalendar();
        });
    } else {
        // Trạng thái đã login -> Thực hiện hành động Đăng xuất
        const tokenToRevoke = accessToken;
        try {
            await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${tokenToRevoke}`);
        } catch (e) {
            console.warn('Lỗi khi thu hồi token:', e);
        }

        chrome.identity.removeCachedAuthToken({ token: tokenToRevoke }, () => {
            accessToken = "";
            showLoginState(false);
            renderCalendar();
        });
    }
});

function changeMonth(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar();
}

async function apiRequest(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    
    if (res.status === 401) {
        if (accessToken) {
            chrome.identity.removeCachedAuthToken({ token: accessToken }, () => {});
            accessToken = "";
            showLoginState(false);
        }
        throw new Error('Phiên làm việc hết hạn.');
    }
    
    if (!res.ok) {
        throw new Error(`Lỗi HTTP: ${res.status}`);
    }
    
    if (res.status === 204) return true;
    return res.json();
}

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

async function deleteItem(type, id, title) {
    const label = type === 'event' ? 'sự kiện' : 'công việc';
    const isConfirmed = confirm(`Bạn có chắc chắn muốn xóa ${label}: "${title}"?`);
    if (!isConfirmed) return;

    try {
        if (type === 'event') {
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`;
            await apiRequest(url, { method: 'DELETE' });
        } else if (type === 'task') {
            const url = `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`;
            await apiRequest(url, { method: 'DELETE' });
        }
        renderCalendar();
    } catch (e) {
        console.error('Lỗi khi xóa:', e);
        alert('Lỗi khi xóa: ' + e.message);
    }
}

async function toggleTaskStatus(taskId, currentStatus) {
    const isCompleted = currentStatus === 'completed';
    const newStatus = isCompleted ? 'needsAction' : 'completed';
    const url = `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`;

    try {
        await apiRequest(url, {
            method: 'PATCH',
            body: JSON.stringify({
                status: newStatus,
                completed: newStatus === 'completed' ? new Date().toISOString() : null
            })
        });
        renderCalendar();
    } catch (e) {
        console.error('Lỗi đổi trạng thái task:', e);
        alert('Không thể cập nhật trạng thái công việc: ' + e.message);
    }
}

function attachCellContextMenu(cell, dateStr) {
    cell.addEventListener('contextmenu', (e) => {
        // Nếu chưa login thì không cho hiện menu
        if (!accessToken) {
            e.preventDefault();
            return;
        }

        if (e.target.closest('.task-item') || e.target.closest('.event-item')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();

        activeCellDateStr = dateStr;

        const menu = document.getElementById('custom-context-menu');
        document.getElementById('ctx-toggle-status').style.display = 'none';
        document.getElementById('ctx-add-task').style.display = 'block';
        document.getElementById('ctx-add-event').style.display = 'block';

        menu.style.display = 'block';
        const rect = document.body.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    });
}

async function renderCalendar() {
    const grid = document.getElementById('days-grid');
    grid.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('month-year').innerText = `Tháng ${month + 1}, ${year}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    // Vô hiệu hóa nút btn-today nếu đang ở tháng hiện tại
    const btnToday = document.getElementById('btn-today');
    if (btnToday) {
        btnToday.disabled = isCurrentMonth;
    }
    
    let minFetchDate = new Date(year, month, 1 - startOffset);
    let totalCells = startOffset + daysInMonth;
    let remainder = totalCells % 7;
    let endOffset = remainder === 0 ? 0 : 7 - remainder;
    let maxFetchDate = new Date(year, month, daysInMonth + endOffset);

    // 1. Vòng lặp: Render các ngày của tháng trước
    for (let i = startOffset - 1; i >= 0; i--) {
        const dayNum = prevMonthDays - i;
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        
        const cell = document.createElement('div');
        cell.className = 'day-cell other-month';
        cell.id = `date-${dateStr}`;

        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';

        const dateNum = document.createElement('div');
        dateNum.className = 'date-num';
        dateNum.innerText = dayNum;
        
        const lunarDate = document.createElement('div');
        lunarDate.className = 'lunar-date';
        const lunarInfo = getLunarDate(dayNum, prevMonth + 1, prevYear);
        lunarDate.innerText = `${lunarInfo[0]}/${lunarInfo[1]}`;

        dateHeader.appendChild(dateNum);
        dateHeader.appendChild(lunarDate);
        cell.appendChild(dateHeader);
        
        attachCellContextMenu(cell, dateStr);
        grid.appendChild(cell);
    }

    // 2. Vòng lặp: Render các ngày của tháng hiện tại
    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        cell.id = `date-${dateStr}`;

        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';

        const dateNum = document.createElement('div');
        dateNum.className = 'date-num';
        dateNum.innerText = i;
        
        if (isCurrentMonth && i === today.getDate()) {
            dateNum.classList.add('today');
        }
        
        const lunarDate = document.createElement('div');
        lunarDate.className = 'lunar-date';
        const lunarInfo = getLunarDate(i, month + 1, year);
        lunarDate.innerText = `${lunarInfo[0]}/${lunarInfo[1]}`;

        dateHeader.appendChild(dateNum);
        dateHeader.appendChild(lunarDate);
        cell.appendChild(dateHeader);

        attachCellContextMenu(cell, dateStr);
        grid.appendChild(cell);
    }

    // 3. Vòng lặp: Render các ngày của tháng sau
    for (let i = 1; i <= endOffset; i++) {
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        const cell = document.createElement('div');
        cell.className = 'day-cell other-month';
        cell.id = `date-${dateStr}`;

        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';

        const dateNum = document.createElement('div');
        dateNum.className = 'date-num';
        dateNum.innerText = i;
        
        const lunarDate = document.createElement('div');
        lunarDate.className = 'lunar-date';
        const lunarInfo = getLunarDate(i, nextMonth + 1, nextYear);
        lunarDate.innerText = `${lunarInfo[0]}/${lunarInfo[1]}`;

        dateHeader.appendChild(dateNum);
        dateHeader.appendChild(lunarDate);
        cell.appendChild(dateHeader);

        attachCellContextMenu(cell, dateStr);
        grid.appendChild(cell);
    }

    if (accessToken) {
        await fetchMonthlyData(minFetchDate, maxFetchDate);
    }
}

async function fetchMonthlyData(minDate, maxDate) {
    const timeMin = minDate.toISOString();
    const timeMax = new Date(maxDate.setHours(23, 59, 59, 999)).toISOString();

    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
    const tasksUrl = `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&dueMin=${timeMin}&dueMax=${timeMax}`;

    try {
        const [eventsItems, tasksItems] = await Promise.all([
            fetchAllPages(eventsUrl),
            fetchAllPages(tasksUrl)
        ]);

        eventsItems.forEach(ev => {
            const dateVal = ev.start?.dateTime || ev.start?.date;
            if (!dateVal) return;
            
            const dateStr = dateVal.split('T')[0];
            const targetCell = document.getElementById(`date-${dateStr}`);
            
            if (targetCell) {
                const div = document.createElement('div');
                div.className = 'event-item';
                
                const fullTitle = ev.summary || '(Không có tiêu đề)';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'item-title';
                titleSpan.innerText = fullTitle;
                titleSpan.title = fullTitle;

                const delBtn = document.createElement('span');
                delBtn.className = 'delete-btn';
                delBtn.innerText = '×';
                delBtn.title = 'Xóa sự kiện';
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteItem('event', ev.id, fullTitle);
                });

                div.appendChild(titleSpan);
                div.appendChild(delBtn);
                targetCell.appendChild(div);
            }
        });

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
                
                const fullTitle = task.title || '(No tittle)';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'item-title';
                titleSpan.innerText = fullTitle;
                titleSpan.title = fullTitle;

                const delBtn = document.createElement('span');
                delBtn.className = 'delete-btn';
                delBtn.innerText = '×';
                delBtn.title = '    Delete';
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteItem('task', task.id, fullTitle);
                });

                div.appendChild(titleSpan);
                div.appendChild(delBtn);

                div.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    activeTaskContext = task;

                    const menu = document.getElementById('custom-context-menu');
                    const toggleItem = document.getElementById('ctx-toggle-status');

                    toggleItem.innerText = task.status === 'completed' 
                        ? 'Incomplete' 
                        : 'Complete';

                    toggleItem.style.display = 'block';
                    document.getElementById('ctx-add-task').style.display = 'none';
                    document.getElementById('ctx-add-event').style.display = 'none';

                    menu.style.display = 'block';
                    
                    const rect = document.body.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;

                    menu.style.left = `${x}px`;
                    menu.style.top = `${y}px`;
                });

                targetCell.appendChild(div);
            }
        });
    } catch (e) {
        console.error('Lỗi tải dữ liệu lịch:', e);
    }
}