// ===== Timetable Planner =====
(function () {
    'use strict';

    const APP_VERSION = '20260527-5';

    // --- Constants ---
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const START_HOUR = 8;
    const END_HOUR = 20;
    const HOURS = END_HOUR - START_HOUR; // 12 rows
    const COLOR_COUNT = 8;
    const LS_COURSES = 'course_select_helper_timetable';         // array of course codes
    const LS_STATE = 'course_select_helper_timetable_state';      // array of placed blocks

    // --- State ---
    let allCourses = [];          // full course data from JSON
    let bankCodes = [];           // codes the user has added
    let placedBlocks = [];        // [{code, day, startHour, duration}]
    let colorMap = {};            // code -> colorIndex
    let nextColor = 0;
    let dragData = null;          // currently dragged item info

    // --- DOM refs ---
    const grid = document.getElementById('timetableGrid');
    const blocksLayer = document.getElementById('blocksLayer');
    const bankList = document.getElementById('bankList');
    const bankEmpty = document.getElementById('bankEmpty');
    const bankCount = document.getElementById('bankCount');
    const unitsBadge = document.getElementById('unitsBadge');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const exportBtn = document.getElementById('exportBtn');
    const toastEl = document.getElementById('toast');

    // ===== Init =====
    async function init() {
        buildGrid();
        await loadCourses();
        loadState();
        render();
        bindToolbarEvents();
    }

    // ===== Build the weekly grid cells =====
    function buildGrid() {
        for (let h = 0; h < HOURS; h++) {
            const hour = START_HOUR + h;
            const label = document.createElement('div');
            label.className = 'tt-time-label';
            label.textContent = formatHour(hour);
            grid.appendChild(label);

            for (let d = 0; d < 5; d++) {
                const cell = document.createElement('div');
                cell.className = 'tt-cell';
                cell.dataset.day = d;
                cell.dataset.hour = hour;
                // Drop target events
                cell.addEventListener('dragover', onCellDragOver);
                cell.addEventListener('dragleave', onCellDragLeave);
                cell.addEventListener('drop', onCellDrop);
                grid.appendChild(cell);
            }
        }
    }

    function formatHour(h) {
        if (h === 0 || h === 12) return '12:00 ' + (h < 12 ? 'AM' : 'PM');
        return (h > 12 ? h - 12 : h) + ':00 ' + (h >= 12 ? 'PM' : 'AM');
    }

    // ===== Load course data =====
    async function loadCourses() {
        try {
            const resp = await fetch('data/courses.json?v=' + APP_VERSION + '&t=' + Date.now(), { cache: 'no-store' });
            const json = await resp.json();
            allCourses = json.courses || [];
        } catch (e) {
            console.warn('Could not load courses.json:', e);
            allCourses = [];
        }
        bankCodes = JSON.parse(localStorage.getItem(LS_COURSES) || '[]');
    }

    // ===== Load timetable state from localStorage =====
    function loadState() {
        try {
            placedBlocks = JSON.parse(localStorage.getItem(LS_STATE) || '[]');
        } catch {
            placedBlocks = [];
        }
        // Clean up blocks whose code is not in bank
        placedBlocks = placedBlocks.filter(b => bankCodes.includes(b.code));
        assignColors();
    }

    function saveState() {
        localStorage.setItem(LS_STATE, JSON.stringify(placedBlocks));
        localStorage.setItem(LS_COURSES, JSON.stringify(bankCodes));
    }

    // ===== Color assignment =====
    function assignColors() {
        colorMap = {};
        nextColor = 0;
        bankCodes.forEach(code => {
            if (!(code in colorMap)) {
                colorMap[code] = nextColor % COLOR_COUNT;
                nextColor++;
            }
        });
    }

    function getColor(code) {
        if (!(code in colorMap)) {
            colorMap[code] = nextColor % COLOR_COUNT;
            nextColor++;
        }
        return colorMap[code];
    }

    // ===== Rendering =====
    function render() {
        renderBank();
        renderBlocks();
        updateUnitsBadge();
    }

    // --- Bank ---
    function renderBank() {
        bankList.innerHTML = '';
        const hasCourses = bankCodes.length > 0;

        bankEmpty.classList.toggle('visible', !hasCourses);
        bankCount.textContent = bankCodes.length;

        bankCodes.forEach(code => {
            const course = findCourse(code);
            const ci = getColor(code);
            const item = document.createElement('div');
            item.className = 'tt-bank-item';
            item.draggable = true;
            item.dataset.code = code;

            const title = course ? course.title : code;
            const units = course ? course.units : '?';

            item.innerHTML =
                '<span class="tt-bank-dot tt-bank-dot-' + ci + '"></span>' +
                '<div class="tt-bank-item-info">' +
                '<div class="tt-bank-item-code">' + code + '</div>' +
                '<div class="tt-bank-item-title">' + escapeHtml(title) + '</div>' +
                '</div>' +
                '<span class="tt-bank-item-units">' + units + 'u</span>' +
                '<button class="tt-bank-item-remove" title="Remove course"><i class="ci-Close_MD"></i></button>';

            // Drag from bank
            item.addEventListener('dragstart', (e) => {
                dragData = { source: 'bank', code: code };
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', code);
                requestAnimationFrame(() => item.classList.add('dragging'));
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                dragData = null;
                clearDropHighlights();
            });

            // Remove from bank
            item.querySelector('.tt-bank-item-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                removeCourseFromBank(code);
            });

            bankList.appendChild(item);
        });
    }

    function removeCourseFromBank(code) {
        bankCodes = bankCodes.filter(c => c !== code);
        placedBlocks = placedBlocks.filter(b => b.code !== code);
        delete colorMap[code];
        saveState();
        render();
    }

    // --- Blocks on grid ---
    function renderBlocks() {
        blocksLayer.innerHTML = '';
        detectClashes();

        placedBlocks.forEach((block, idx) => {
            const ci = getColor(block.code);
            const course = findCourse(block.code);
            const title = course ? course.title : '';

            const el = document.createElement('div');
            el.className = 'tt-block tt-color-' + ci;
            if (block.clash) el.classList.add('tt-clash');
            el.draggable = true;
            el.dataset.blockIdx = idx;

            el.innerHTML =
                '<span class="tt-block-code">' + block.code + '</span>' +
                '<span class="tt-block-title">' + escapeHtml(title) + '</span>' +
                '<button class="tt-block-remove" title="Remove">&times;</button>';

            // Position
            positionBlock(el, block);

            // Drag placed block
            el.addEventListener('dragstart', (e) => {
                dragData = { source: 'grid', code: block.code, blockIdx: idx };
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', block.code);
                requestAnimationFrame(() => el.classList.add('dragging'));
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
                dragData = null;
                clearDropHighlights();
            });

            // Remove block
            el.querySelector('.tt-block-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                placedBlocks.splice(idx, 1);
                saveState();
                render();
            });

            // Right-click remove
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                placedBlocks.splice(idx, 1);
                saveState();
                render();
            });

            blocksLayer.appendChild(el);
        });
    }

    function positionBlock(el, block) {
        const dayIndex = block.day;
        const rowStart = block.startHour - START_HOUR;
        const duration = block.duration || 1;

        // Calculate position as percentages of the blocks layer
        const colWidth = 100 / 5;
        const rowHeight = 60; // matches grid-auto-rows

        const left = dayIndex * colWidth;
        const top = rowStart * rowHeight;
        const height = duration * rowHeight;

        el.style.left = left + '%';
        el.style.width = colWidth + '%';
        el.style.top = top + 'px';
        el.style.height = height + 'px';
        el.style.padding = '6px 8px';
    }

    // ===== Clash detection =====
    function detectClashes() {
        // Reset
        placedBlocks.forEach(b => b.clash = false);

        for (let i = 0; i < placedBlocks.length; i++) {
            for (let j = i + 1; j < placedBlocks.length; j++) {
                const a = placedBlocks[i];
                const b = placedBlocks[j];
                if (a.day === b.day) {
                    const aEnd = a.startHour + (a.duration || 1);
                    const bEnd = b.startHour + (b.duration || 1);
                    if (a.startHour < bEnd && b.startHour < aEnd) {
                        a.clash = true;
                        b.clash = true;
                    }
                }
            }
        }
    }

    // ===== Drag & Drop on grid cells =====
    function onCellDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('tt-cell-drop-target');

        // Also highlight cells below for multi-hour blocks
        const day = parseInt(this.dataset.day);
        const hour = parseInt(this.dataset.hour);
        const duration = getDragDuration();
        highlightCells(day, hour, duration);
    }

    function onCellDragLeave(e) {
        this.classList.remove('tt-cell-drop-target');
        // Delayed clear to avoid flicker
        requestAnimationFrame(() => clearDropHighlights());
    }

    function onCellDrop(e) {
        e.preventDefault();
        clearDropHighlights();

        const day = parseInt(this.dataset.day);
        const hour = parseInt(this.dataset.hour);

        if (!dragData) return;

        const code = dragData.code;
        const duration = getDragDuration();

        // Validate bounds
        if (hour + duration > END_HOUR) {
            showToast('Not enough room - extends past 8:00 PM');
            return;
        }

        if (dragData.source === 'grid') {
            // Move existing block
            placedBlocks[dragData.blockIdx].day = day;
            placedBlocks[dragData.blockIdx].startHour = hour;
        } else {
            // Place new block from bank
            placedBlocks.push({
                code: code,
                day: day,
                startHour: hour,
                duration: duration
            });
        }

        saveState();
        render();
    }

    function getDragDuration() {
        if (!dragData) return 1;
        const course = findCourse(dragData.code);
        if (!course || !course.contact_hours) return 2;
        const total = (course.contact_hours.lecture || 0) +
            (course.contact_hours.tutorial || 0) +
            (course.contact_hours.practical || 0);
        if (total >= 3) return 2;
        return total > 0 ? Math.max(1, Math.min(total, 3)) : 2;
    }

    function highlightCells(day, startHour, duration) {
        clearDropHighlights();
        for (let h = 0; h < duration; h++) {
            const hour = startHour + h;
            if (hour >= END_HOUR) break;
            const cell = grid.querySelector('.tt-cell[data-day="' + day + '"][data-hour="' + hour + '"]');
            if (cell) cell.classList.add('tt-cell-drop-target');
        }
    }

    function clearDropHighlights() {
        grid.querySelectorAll('.tt-cell-drop-target').forEach(c => c.classList.remove('tt-cell-drop-target'));
    }

    // ===== Units badge =====
    function updateUnitsBadge() {
        let total = 0;
        bankCodes.forEach(code => {
            const course = findCourse(code);
            if (course) total += (course.units || 0);
        });
        unitsBadge.textContent = total + ' Unit' + (total !== 1 ? 's' : '');
    }

    // ===== Toolbar events =====
    function bindToolbarEvents() {
        clearAllBtn.addEventListener('click', () => {
            const confirmed = confirm('Clear all courses and timetable blocks?');

            if (!confirmed) return;

            bankCodes = [];
            placedBlocks = [];
            colorMap = {};
            nextColor = 0;

            saveState();
            render();

            showToast('All courses cleared');
        });

        exportBtn.addEventListener('click', exportTimetable);
    }

    // ===== Export =====
    function exportTimetable() {
        if (placedBlocks.length === 0) {
            showToast('Nothing to export - place courses on the grid first');
            return;
        }

        const lines = ['My UQ Timetable', '================'];
        const semester = document.getElementById('semesterSelect');
        if (semester) lines.push(semester.options[semester.selectedIndex].text);
        lines.push('');

        // Group by day
        DAYS.forEach((dayName, dayIdx) => {
            const dayBlocks = placedBlocks
                .filter(b => b.day === dayIdx)
                .sort((a, b) => a.startHour - b.startHour);

            if (dayBlocks.length > 0) {
                lines.push(dayName + ':');
                dayBlocks.forEach(b => {
                    const end = b.startHour + (b.duration || 1);
                    const course = findCourse(b.code);
                    const title = course ? course.title : '';
                    lines.push('  ' + formatHour(b.startHour) + ' - ' + formatHour(end) + '  ' + b.code + (title ? ' (' + title + ')' : ''));
                });
                lines.push('');
            }
        });

        const totalUnits = bankCodes.reduce((sum, code) => {
            const c = findCourse(code);
            return sum + (c ? c.units || 0 : 0);
        }, 0);
        lines.push('Total: ' + totalUnits + ' units, ' + bankCodes.length + ' courses');

        const text = lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showToast('Timetable copied to clipboard');
        }).catch(() => {
            showToast('Could not copy - check browser permissions');
        });
    }

    // ===== Helpers =====
    function findCourse(code) {
        return allCourses.find(c => c.code === code) || null;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastEl._timer);
        toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2500);
    }

    // ===== Start =====
    document.addEventListener('DOMContentLoaded', init);
})();

