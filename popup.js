let currentDate = new Date();
let accessToken = "";
let activeTaskContext = null;
let activeCellDateStr = null;
let createType = null; // 'task' hoặc 'event'
let modalMode = 'create'; // 'create' hoặc 'edit'
let activeItemContext = null; // Lưu trữ đối tượng task/event đang được chọn
let activeItemNode = null;

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

    // Khởi tạo các tùy chọn từ 1 đến 30 cho repeat-interval
    const intervalSelect = document.getElementById('repeat-interval');
    if (intervalSelect) {
        for (let i = 1; i <= 30; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.innerText = i;
            intervalSelect.appendChild(option);
        }
    }

    // Xử lý ẩn hiện vùng tùy chọn repeat
    document.getElementById('modal-checkbox-repeat').addEventListener('change', (e) => {
        document.getElementById('repeat-options').style.display = e.target.checked ? 'flex' : 'none';
    });
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

document.getElementById('ctx-edit-item').addEventListener('click', () => {
    hideContextMenu();
    openEditModal();
});

function openEditModal() {
    modalMode = 'edit';
    const modal = document.getElementById('add-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input-title');
    const modalDesc = document.getElementById('modal-input-desc');

    modalTitle.innerText = createType === 'event' ? 'Sửa Sự kiện' : 'Sửa Công việc';
    
    // Đổ dữ liệu cũ vào form
    modalInput.value = createType === 'event' ? (activeItemContext.summary || '') : (activeItemContext.title || '');
    modalDesc.value = createType === 'event' ? (activeItemContext.description || '') : (activeItemContext.notes || '');
    
    modal.style.display = 'flex';
    modalInput.focus();
}

function openAddModal(type) {
    if (!accessToken) {
        alert('Vui lòng đồng bộ với Google (Đăng nhập) để sử dụng tính năng này!');
        return;
    }
    modalMode = 'create'; 
    createType = type;
    const modal = document.getElementById('add-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input-title');
    const modalDesc = document.getElementById('modal-input-desc');

    modalTitle.innerText = type === 'event' 
        ? `Thêm Sự kiện (${activeCellDateStr})` 
        : `Thêm Công việc (${activeCellDateStr})`;
    
    modalInput.value = '';
    modalDesc.value = ''; 
    
    // Cập nhật trạng thái hiển thị của tính năng Repeat
    const repeatContainer = document.getElementById('repeat-container');
    const checkboxRepeat = document.getElementById('modal-checkbox-repeat');
    const repeatOptions = document.getElementById('repeat-options');
    
    if (type === 'task') {
        repeatContainer.style.display = 'block';
        checkboxRepeat.checked = false;
        repeatOptions.style.display = 'none';
        document.getElementById('repeat-times').value = 3;
    } else {
        repeatContainer.style.display = 'none';
    }

    modal.style.display = 'flex';
    modalInput.focus();
}

function calculateNextDate(dateString, interval, unit) {
    let d = new Date(dateString);
    interval = parseInt(interval);
    
    switch(unit) {
        case 'days':
            d.setDate(d.getDate() + interval);
            break;
        case 'weeks':
            d.setDate(d.getDate() + (interval * 7));
            break;
        case 'months':
            d.setMonth(d.getMonth() + interval);
            break;
        case 'years':
            d.setFullYear(d.getFullYear() + interval);
            break;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    const descInput = document.getElementById('modal-input-desc');
    const title = titleInput.value.trim();
    const description = descInput.value.trim();

    if (!title) {
        alert('Vui lòng nhập tiêu đề!');
        return;
    }

    // --- BẢO LƯU CÁC BIẾN TRƯỚC KHI ĐÓNG MODAL ---
    const typeToCreate = createType;
    const mode = modalMode;
    const targetDate = activeCellDateStr;
    const itemContext = activeItemContext;
    const itemNode = activeItemNode;

    closeAddModal(); // Hành động này sẽ set createType = null để reset form

    try {
        if (typeToCreate === 'event') {
            const body = { summary: title, description: description };
            
            if (mode === 'create') {
                body.start = { date: targetDate };
                body.end = { date: targetDate };
                
                const cell = document.getElementById(`date-${targetDate}`);
                const tempDiv = createTempNode(title, 'event');
                if (cell) cell.appendChild(tempDiv);

                const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
                const res = await apiRequest(url, { method: 'POST', body: JSON.stringify(body) });
                
                if (cell) tempDiv.replaceWith(buildItemElement(res, 'event', targetDate));

            } else if (mode === 'edit') {
                itemNode.querySelector('.item-title').innerText = title;
                itemNode.style.opacity = '0.5';

                const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${itemContext.id}`;
                const res = await apiRequest(url, { method: 'PATCH', body: JSON.stringify(body) });
                
                itemNode.replaceWith(buildItemElement(res, 'event', targetDate));
            }
        } else if (typeToCreate === 'task') {
            if (mode === 'create') {
                const checkboxRepeat = document.getElementById('modal-checkbox-repeat');
                const isRepeat = checkboxRepeat ? checkboxRepeat.checked : false;
                
                if (isRepeat) {
                    const interval = document.getElementById('repeat-interval').value;
                    const unit = document.getElementById('repeat-unit').value;
                    let times = parseInt(document.getElementById('repeat-times').value);
                    if (isNaN(times) || times < 1) times = 1;
                    if (times > 100) times = 100;
                    
                    let currentDateStr = targetDate;
                    
                    for (let i = 0; i < times; i++) {
                        const body = { title: title, notes: description, due: `${currentDateStr}T00:00:00.000Z` };
                        
                        const cell = document.getElementById(`date-${currentDateStr}`);
                        let tempDiv = null;
                        if (cell) {
                            tempDiv = createTempNode(title, 'task');
                            cell.appendChild(tempDiv);
                        }

                        const url = 'https://www.googleapis.com/tasks/v1/lists/@default/tasks';
                        const res = await apiRequest(url, { method: 'POST', body: JSON.stringify(body) });
                        
                        if (cell && tempDiv) {
                            tempDiv.replaceWith(buildItemElement(res, 'task', currentDateStr));
                        }
                        
                        currentDateStr = calculateNextDate(currentDateStr, interval, unit);
                    }
                } else {
                    const body = { title: title, notes: description, due: `${targetDate}T00:00:00.000Z` };
                    
                    const cell = document.getElementById(`date-${targetDate}`);
                    const tempDiv = createTempNode(title, 'task');
                    if (cell) cell.appendChild(tempDiv);

                    const url = 'https://www.googleapis.com/tasks/v1/lists/@default/tasks';
                    const res = await apiRequest(url, { method: 'POST', body: JSON.stringify(body) });
                    
                    if (cell) tempDiv.replaceWith(buildItemElement(res, 'task', targetDate));
                }
            } else if (mode === 'edit') {
                itemNode.querySelector('.item-title').innerText = title;
                itemNode.style.opacity = '0.5';

                const body = { title: title, notes: description };
                const url = `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${itemContext.id}`;
                const res = await apiRequest(url, { method: 'PATCH', body: JSON.stringify(body) });
                
                itemNode.replaceWith(buildItemElement(res, 'task', targetDate));
            }
        }
    } catch (e) {
        console.error('Lỗi khi lưu:', e);
        alert('Đã xảy ra lỗi, hệ thống sẽ tự đồng bộ lại!');
        renderCalendar(); // Rollback toàn cục
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
    const avatarImg = document.getElementById('user-avatar');
    
    logoutBtn.style.display = 'flex';

    if (isLoggedIn) {
        logoutBtn.title = "Đăng xuất / Đổi tài khoản";
        iconSvg.innerHTML = `
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
        `;
        // Gọi hàm lấy avatar khi đã đăng nhập thành công
        fetchUserProfile();
    } else {
        logoutBtn.title = "Đồng bộ với Google";
        iconSvg.innerHTML = `
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" y1="12" x2="3" y2="12"></line>
        `;
        // Ẩn avatar khi đăng xuất
        if (avatarImg) {
            avatarImg.src = '';
            avatarImg.style.display = 'none';
        }
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

async function deleteItem(type, id, title, elementNode) {
    const label = type === 'event' ? 'sự kiện' : 'công việc';
    const isConfirmed = confirm(`Bạn có chắc chắn muốn xóa ${label}: "${title}"?`);
    if (!isConfirmed) return;

    const originalDisplay = elementNode.style.display;
    elementNode.style.display = 'none';

    try {
        if (type === 'event') {
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`;
            await apiRequest(url, { method: 'DELETE' });
        } else if (type === 'task') {
            const url = `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`;
            await apiRequest(url, { method: 'DELETE' });
        }
        elementNode.remove();
    } catch (e) {
        elementNode.style.display = originalDisplay; 
        console.error('Lỗi khi xóa:', e);
        alert('Lỗi khi xóa: ' + e.message);
    }
}

async function toggleTaskStatus(taskId, currentStatus) {
    const node = activeItemNode;
    if (!node) return;

    const isCompleted = currentStatus === 'completed';
    const newStatus = isCompleted ? 'needsAction' : 'completed';
    
    const originalTextDeco = node.style.textDecoration;
    const originalOpacity = node.style.opacity;

    node.style.textDecoration = newStatus === 'completed' ? 'line-through' : 'none';
    node.style.opacity = newStatus === 'completed' ? '0.7' : '1';

    const url = `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`;

    try {
        await apiRequest(url, {
            method: 'PATCH',
            body: JSON.stringify({
                status: newStatus,
                completed: newStatus === 'completed' ? new Date().toISOString() : null
            })
        });
        activeTaskContext.status = newStatus;
    } catch (e) {
        node.style.textDecoration = originalTextDeco;
        node.style.opacity = originalOpacity;
        console.error('Lỗi đổi trạng thái task:', e);
        alert('Không thể cập nhật trạng thái: ' + e.message);
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
        
        // --- BỔ SUNG: Ẩn Edit và Toggle Status, chỉ hiển thị chức năng thêm mới cho Cell ---
        document.getElementById('ctx-toggle-status').style.display = 'none';
        document.getElementById('ctx-edit-item').style.display = 'none'; // Thêm dòng này để ẩn Edit
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
            if (targetCell) targetCell.appendChild(buildItemElement(ev, 'event', dateStr));
        });

        tasksItems.forEach(task => {
            if (!task.due) return;
            const dateStr = task.due.split('T')[0];
            const targetCell = document.getElementById(`date-${dateStr}`);
            if (targetCell) targetCell.appendChild(buildItemElement(task, 'task', dateStr));
        });
    } catch (e) {
        console.error('Lỗi tải dữ liệu lịch:', e);
    }
}

function createTempNode(title, type) {
    const div = document.createElement('div');
    div.className = type === 'event' ? 'event-item' : 'task-item';
    div.style.opacity = '0.5'; // Làm mờ để biểu thị trạng thái đang xử lý (Optimistic)
    div.innerHTML = `<span class="item-title">${title}</span><span class="delete-btn">×</span>`;
    return div;
}

function buildItemElement(item, type, dateStr) {
    const div = document.createElement('div');
    div.className = type === 'event' ? 'event-item' : 'task-item';
    
    let fullTitle = type === 'event' ? (item.summary || '(Không có tiêu đề)') : (item.title || '(No tittle)');
    let tooltipText = fullTitle;
    
    if (type === 'event' && item.description) tooltipText += `\n${item.description}`;
    if (type === 'task' && item.notes) tooltipText += `\n\n${item.notes}`;

    if (type === 'task' && item.status === 'completed') {
        div.style.textDecoration = 'line-through';
        div.style.opacity = '0.7';
    }

    const titleSpan = document.createElement('span');
    titleSpan.className = 'item-title';
    titleSpan.innerText = fullTitle;
    titleSpan.title = tooltipText; 

    const delBtn = document.createElement('span');
    delBtn.className = 'delete-btn';
    delBtn.innerText = '×';
    delBtn.title = type === 'event' ? 'Xóa sự kiện' : 'Xóa công việc';
    
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(type, item.id, fullTitle, div);
    });

    div.appendChild(titleSpan);
    div.appendChild(delBtn);

    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
    
        activeItemContext = item;
        activeItemNode = div; 
        createType = type;
        activeCellDateStr = dateStr; // Bổ sung dòng này để fix lỗi thiếu ngày khi Edit
    
        const menu = document.getElementById('custom-context-menu');
        const toggleItem = document.getElementById('ctx-toggle-status');
    
        if (type === 'event') {
            toggleItem.style.display = 'none';
        } else {
            activeTaskContext = item;
            toggleItem.innerText = item.status === 'completed' ? 'Incomplete' : 'Complete';
            toggleItem.style.display = 'block';
        }

        document.getElementById('ctx-add-task').style.display = 'none';
        document.getElementById('ctx-add-event').style.display = 'none';
        document.getElementById('ctx-edit-item').style.display = 'block'; 
    
        menu.style.display = 'block';
        const rect = document.body.getBoundingClientRect();
        menu.style.left = `${e.clientX - rect.left}px`;
        menu.style.top = `${e.clientY - rect.top}px`;
    });

    return div;
}

async function fetchUserProfile() {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            const avatarImg = document.getElementById('user-avatar');
            if (data.picture && avatarImg) {
                avatarImg.src = data.picture;
                avatarImg.style.display = 'block'; // Hiển thị avatar khi đã có ảnh
            }

            console.log('avatarImg: ', avatarImg);
        }
    } catch (e) {
        console.warn('Không thể lấy thông tin profile:', e);
    }
}