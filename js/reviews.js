// Course Reviews page logic.
(function () {
    'use strict';

    const APP_VERSION = '20260527-5';
    const STORAGE_KEY = 'course_select_helper_reviews';
    const LEGACY_STORAGE_KEY = 'course_select_helper_legacy_reviews';
    const DIFF_LABELS = {
        en: ['', 'Easy', 'Moderate', 'Hard', 'Very Hard', 'Extreme'],
        zh: ['', '\u7b80\u5355', '\u4e2d\u7b49', '\u56f0\u96be', '\u5f88\u56f0\u96be', '\u6781\u96be']
    };
    const DIFF_CLASSES = ['', 'easy', 'moderate', 'hard', 'very-hard', 'extreme'];

    let allCourses = [];
    let seedReviews = [];
    let selectedCourse = null;
    let currentSort = 'recent';

    const courseSearchInput = document.getElementById('courseSearchInput');
    const courseDropdown = document.getElementById('courseDropdown');
    const selectedCourseBadge = document.getElementById('selectedCourseBadge');
    const badgeCode = document.getElementById('badgeCode');
    const badgeTitle = document.getElementById('badgeTitle');
    const badgeRemove = document.getElementById('badgeRemove');
    const reviewSummary = document.getElementById('reviewSummary');
    const reviewsToolbar = document.getElementById('reviewsToolbar');
    const reviewFormWrapper = document.getElementById('reviewFormWrapper');
    const reviewForm = document.getElementById('reviewForm');
    const reviewsList = document.getElementById('reviewsList');
    const reviewsEmpty = document.getElementById('reviewsEmpty');
    const reviewsPlaceholder = document.getElementById('reviewsPlaceholder');
    const sortSelect = document.getElementById('sortReviews');
    const filterRating = document.getElementById('filterRating');
    const filterDifficulty = document.getElementById('filterDifficulty');
    const filterKeyword = document.getElementById('filterKeyword');
    const writeReviewToggle = document.getElementById('writeReviewToggle');
    const formCancel = document.getElementById('formCancel');
    const starPicker = document.getElementById('starPicker');
    const difficultyPicker = document.getElementById('difficultyPicker');
    const reviewedCourseChips = document.getElementById('reviewedCourseChips');
    const reviewDatasetCount = document.getElementById('reviewDatasetCount');
    const allCourseGrid = document.getElementById('allCourseGrid');
    const allCourseCount = document.getElementById('allCourseCount');
    const reviewCourseFacultyFilter = document.getElementById('reviewCourseFacultyFilter');

    async function init() {
        await loadData();
        setupCourseSelector();
        setupStarPicker();
        setupDifficultyPicker();
        setupFormHandlers();
        setupFilterHandlers();
        renderReviewedCourseChips();
        renderAllCoursePicker();

        const params = new URLSearchParams(window.location.search);
        const codeParam = normalizeCourseCode(params.get('code') || params.get('course_code') || params.get('course'));
        if (codeParam) {
            const course = allCourses.find((c) => getCourseCode(c) === codeParam);
            if (course) selectCourse(course);
        }
    }

    async function loadData() {
        try {
            const [coursesRes, reviewsRes] = await Promise.all([
                fetch('data/courses.json?v=' + APP_VERSION + '&t=' + Date.now(), { cache: 'no-store' }),
                fetch('data/reviews-seed.json?v=' + APP_VERSION + '&t=' + Date.now(), { cache: 'no-store' })
            ]);
            const coursesData = await coursesRes.json();
            allCourses = Array.isArray(coursesData) ? coursesData : (coursesData.courses || []);
            seedReviews = await reviewsRes.json();
        } catch (err) {
            console.error('Failed to load review data:', err);
            allCourses = [];
            seedReviews = [];
        }

        migrateLegacyReviews();
        if (reviewDatasetCount) {
            reviewDatasetCount.textContent = String(seedReviews.length);
        }
    }

    function migrateLegacyReviews() {
        const existing = localStorage.getItem(STORAGE_KEY);
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!existing && legacy) {
            localStorage.setItem(STORAGE_KEY, legacy);
        }
    }

    function setupCourseSelector() {
        let debounceTimer;

        courseSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = courseSearchInput.value.trim().toLowerCase();
                if (!query) {
                    hideDropdown();
                    renderAllCoursePicker();
                    return;
                }

                const matches = allCourses
                    .filter((course) => {
                        const code = getCourseCode(course).toLowerCase();
                        const title = (course.title || '').toLowerCase();
                        return code.includes(query) || title.includes(query);
                    })
                    .slice(0, 15);

                renderDropdown(matches);
                renderAllCoursePicker();
            }, 120);
        });

        courseSearchInput.addEventListener('focus', () => {
            if (courseSearchInput.value.trim()) {
                courseSearchInput.dispatchEvent(new Event('input'));
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.course-selector')) hideDropdown();
        });

        badgeRemove.addEventListener('click', clearSelection);
        reviewCourseFacultyFilter.addEventListener('change', renderAllCoursePicker);
    }

    function renderDropdown(courses) {
        if (!courses.length) {
            courseDropdown.innerHTML = '<div class="course-dropdown-empty">No matching courses found</div>';
            courseDropdown.classList.add('show');
            return;
        }

        courseDropdown.innerHTML = courses.map((course) => (
            '<button type="button" class="course-dropdown-item" data-code="' + escapeAttr(getCourseCode(course)) + '">' +
                '<span class="dd-code">' + escapeHTML(getCourseCode(course)) + '</span>' +
                '<span class="dd-title">' + escapeHTML(course.title) + '</span>' +
            '</button>'
        )).join('');
        courseDropdown.classList.add('show');

        courseDropdown.querySelectorAll('.course-dropdown-item').forEach((item) => {
            item.addEventListener('click', () => {
                const course = allCourses.find((c) => getCourseCode(c) === item.dataset.code);
                if (course) selectCourse(course);
            });
        });
    }

    function renderAllCoursePicker() {
        if (!allCourseGrid || !allCourseCount) return;

        const query = courseSearchInput.value.trim().toLowerCase();
        const faculty = reviewCourseFacultyFilter.value;
        const filtered = allCourses.filter((course) => {
            const code = getCourseCode(course);
            const title = course.title || '';
            const haystack = (code + ' ' + title + ' ' + (course.description || '')).toLowerCase();
            if (query && !haystack.includes(query)) return false;
            if (faculty && normalizeFaculty(course.faculty) !== faculty) return false;
            return Boolean(code);
        });

        allCourseCount.textContent = filtered.length + ' of ' + allCourses.length + ' courses shown';

        if (!filtered.length) {
            allCourseGrid.innerHTML = '<div class="all-course-empty">No courses match the current search.</div>';
            return;
        }

        allCourseGrid.innerHTML = filtered.map((course) => {
            const code = getCourseCode(course);
            const reviewCount = getReviewsForCourse(code).length;
            const isSelected = selectedCourse && getCourseCode(selectedCourse) === code;
            return '<button type="button" class="all-course-option' + (isSelected ? ' selected' : '') + '" data-code="' + escapeAttr(code) + '">' +
                '<span class="all-course-code">' + escapeHTML(code) + '</span>' +
                '<span class="all-course-title">' + escapeHTML(course.title || 'Untitled course') + '</span>' +
                '<span class="all-course-meta">' + escapeHTML(abbreviateFaculty(course.faculty || '')) + (reviewCount ? ' - ' + reviewCount + ' reviews' : ' - no reviews yet') + '</span>' +
            '</button>';
        }).join('');

        allCourseGrid.querySelectorAll('.all-course-option').forEach((button) => {
            button.addEventListener('click', () => {
                const course = allCourses.find((item) => getCourseCode(item) === button.dataset.code);
                if (course) selectCourse(course);
            });
        });
    }

    function hideDropdown() {
        courseDropdown.classList.remove('show');
    }

    function selectCourse(course) {
        selectedCourse = course;
        courseSearchInput.value = '';
        hideDropdown();
        resetFilters();

        badgeCode.textContent = getCourseCode(course);
        badgeTitle.textContent = course.title;
        selectedCourseBadge.style.display = 'inline-flex';
        reviewsToolbar.style.display = 'flex';
        reviewsPlaceholder.style.display = 'none';
        renderAllCoursePicker();
        renderReviews();
    }

    function clearSelection() {
        selectedCourse = null;
        selectedCourseBadge.style.display = 'none';
        reviewSummary.style.display = 'none';
        reviewsToolbar.style.display = 'none';
        reviewsList.innerHTML = '';
        reviewsEmpty.style.display = 'none';
        reviewsPlaceholder.style.display = 'block';
        reviewFormWrapper.classList.remove('open');
        resetFilters();
        renderAllCoursePicker();
    }

    function resetFilters() {
        filterRating.value = '';
        filterDifficulty.value = '';
        filterKeyword.value = '';
        sortSelect.value = 'recent';
        currentSort = 'recent';
    }

    function renderReviewedCourseChips() {
        const counts = getCombinedReviews().reduce((acc, review) => {
            const code = normalizeCourseCode(review.course_code);
            acc[code] = (acc[code] || 0) + 1;
            return acc;
        }, {});

        const topCourses = Object.entries(counts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 8)
            .map(([code, count]) => {
                const course = allCourses.find((c) => getCourseCode(c) === code);
                return { code, count, title: course ? course.title : code };
            });

        reviewedCourseChips.innerHTML = topCourses.map((course) => (
            '<button type="button" class="reviewed-course-chip" data-code="' + escapeAttr(course.code) + '">' +
                '<strong>' + escapeHTML(course.code) + '</strong>' +
                '<span>' + escapeHTML(String(course.count)) + ' demo reviews</span>' +
            '</button>'
        )).join('');

        reviewedCourseChips.querySelectorAll('.reviewed-course-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const course = allCourses.find((c) => getCourseCode(c) === chip.dataset.code);
                if (course) selectCourse(course);
            });
        });
    }

    function getCombinedReviews() {
        return [
            ...seedReviews.map((review) => ({ ...review, source: 'demo' })),
            ...getStoredReviews().map((review) => ({ ...review, source: 'local' }))
        ];
    }

    function getStoredReviews() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function getReviewsForCourse(code) {
        const normalized = normalizeCourseCode(code);
        return getCombinedReviews().filter((review) => normalizeCourseCode(review.course_code) === normalized);
    }

    function setupFilterHandlers() {
        sortSelect.addEventListener('change', () => {
            currentSort = sortSelect.value;
            renderReviews();
        });
        filterRating.addEventListener('change', renderReviews);
        filterDifficulty.addEventListener('change', renderReviews);
        filterKeyword.addEventListener('input', debounce(renderReviews, 150));
    }

    function applyReviewFilters(reviews) {
        const minRating = parseInt(filterRating.value, 10);
        const difficulty = parseInt(filterDifficulty.value, 10);
        const keyword = filterKeyword.value.trim().toLowerCase();

        return reviews.filter((review) => {
            if (minRating && review.rating < minRating) return false;
            if (difficulty && review.difficulty !== difficulty) return false;
            if (keyword) {
                const text = [
                    review.text || '',
                    review.author || '',
                    review.semester || ''
                ].join(' ').toLowerCase();
                if (!text.includes(keyword)) return false;
            }
            return true;
        });
    }

    function sortReviews(reviews) {
        const sorted = [...reviews];
        switch (currentSort) {
            case 'highest':
                sorted.sort((a, b) => b.rating - a.rating || newestFirst(a, b));
                break;
            case 'lowest':
                sorted.sort((a, b) => a.rating - b.rating || newestFirst(a, b));
                break;
            case 'workload':
                sorted.sort((a, b) => (b.workload_hours || 0) - (a.workload_hours || 0) || newestFirst(a, b));
                break;
            default:
                sorted.sort(newestFirst);
        }
        return sorted;
    }

    function newestFirst(a, b) {
        return new Date(b.created_at) - new Date(a.created_at);
    }

    function renderReviews() {
        if (!selectedCourse) return;

        const allCourseReviews = getReviewsForCourse(selectedCourse.code);
        renderSummary(allCourseReviews);

        const filtered = sortReviews(applyReviewFilters(allCourseReviews));
        reviewsList.innerHTML = filtered.map((review, index) => renderReviewCard(review, index)).join('');
        reviewsEmpty.style.display = filtered.length ? 'none' : 'block';
    }

    function renderSummary(reviews) {
        if (!reviews.length) {
            reviewSummary.style.display = 'none';
            return;
        }

        const count = reviews.length;
        const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / count;
        const diffValues = reviews.filter((review) => review.difficulty).map((review) => review.difficulty);
        const workloadValues = reviews.filter((review) => review.workload_hours).map((review) => review.workload_hours);
        const avgDiff = diffValues.length ? diffValues.reduce((sum, value) => sum + value, 0) / diffValues.length : 0;
        const avgWork = workloadValues.length ? workloadValues.reduce((sum, value) => sum + value, 0) / workloadValues.length : 0;

        document.getElementById('summaryAvgRating').textContent = avgRating.toFixed(1);
        document.getElementById('summaryStars').innerHTML = renderStarsHTML(avgRating);
        document.getElementById('summaryCount').textContent = count + ' demo/local review' + (count === 1 ? '' : 's');

        const distribution = [0, 0, 0, 0, 0];
        reviews.forEach((review) => {
            if (review.rating >= 1 && review.rating <= 5) distribution[review.rating - 1]++;
        });
        const maxDistribution = Math.max(...distribution, 1);

        document.getElementById('ratingDistribution').innerHTML = [5, 4, 3, 2, 1].map((star) => {
            const countAtStar = distribution[star - 1];
            const pct = (countAtStar / maxDistribution) * 100;
            return '<div class="rating-bar-row">' +
                '<span class="rating-bar-label">' + star + '</span>' +
                '<div class="rating-bar-track"><div class="rating-bar-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="rating-bar-count">' + countAtStar + '</span>' +
            '</div>';
        }).join('');

        const diffVal = Math.round(avgDiff);
        const diffBadge = document.getElementById('summaryDiffBadge');
        document.getElementById('summaryDifficulty').textContent = avgDiff ? avgDiff.toFixed(1) : '--';
        diffBadge.textContent = diffVal ? getDifficultyLabels()[diffVal] : '';
        diffBadge.className = 'stat-badge ' + (DIFF_CLASSES[diffVal] || '');
        document.getElementById('summaryWorkload').textContent = avgWork ? avgWork.toFixed(1) : '--';

        reviewSummary.style.display = 'grid';
    }

    function renderStarsHTML(rating) {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(rating)) {
                html += '<span class="star filled">&#9733;</span>';
            } else if (i - rating < 1 && i - rating > 0) {
                html += '<span class="star half">&#9733;</span>';
            } else {
                html += '<span class="star">&#9733;</span>';
            }
        }
        return html;
    }

    function renderReviewCard(review, index) {
        const starsHtml = Array.from({ length: 5 }, (_, i) => (
            '<span class="star' + (i < review.rating ? ' filled' : '') + '">&#9733;</span>'
        )).join('');
        const diffClass = DIFF_CLASSES[review.difficulty] || '';
        const diffLabel = getDifficultyLabels()[review.difficulty] || '';
        const diffBadge = review.difficulty
            ? '<span class="review-diff-badge ' + diffClass + '">' + escapeHTML(diffLabel) + '</span>'
            : '';
        const workload = review.workload_hours
            ? '<span class="review-workload">' + escapeHTML(String(review.workload_hours)) + ' hrs/week</span>'
            : '';
        const semester = review.semester
            ? '<span class="review-semester">' + escapeHTML(review.semester) + '</span>'
            : '';
        const date = new Date(review.created_at);
        const dateStr = Number.isNaN(date.getTime())
            ? ''
            : date.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
        const sourceLabel = review.source === 'local' ? 'Local review' : 'Demo review';

        return '<article class="review-card" style="animation-delay:' + (index * 0.04) + 's">' +
            '<div class="review-card-header">' +
                '<div class="review-card-left">' +
                    '<div class="review-stars">' + starsHtml + '</div>' +
                    diffBadge +
                    workload +
                '</div>' +
                semester +
            '</div>' +
            (review.text ? '<div class="review-card-text">' + escapeHTML(review.text) + '</div>' : '') +
            '<div class="review-card-footer">' +
                '<span class="review-author">' + escapeHTML(review.author || 'Anonymous') + '</span>' +
                '<span class="review-source-badge">' + sourceLabel + '</span>' +
                '<span class="review-date">' + escapeHTML(dateStr) + '</span>' +
            '</div>' +
        '</article>';
    }

    function setupStarPicker() {
        const stars = starPicker.querySelectorAll('.star-pick');

        starPicker.addEventListener('mouseover', (e) => {
            const target = e.target.closest('.star-pick');
            if (!target) return;
            const val = parseInt(target.dataset.value, 10);
            stars.forEach((star) => {
                star.classList.toggle('hover', parseInt(star.dataset.value, 10) <= val);
            });
        });

        starPicker.addEventListener('mouseout', () => {
            stars.forEach((star) => star.classList.remove('hover'));
        });

        starPicker.addEventListener('click', (e) => {
            const target = e.target.closest('.star-pick');
            if (!target) return;
            const val = parseInt(target.dataset.value, 10);
            document.getElementById('formRating').value = val;
            stars.forEach((star) => {
                star.classList.toggle('selected', parseInt(star.dataset.value, 10) <= val);
            });
        });
    }

    function setupDifficultyPicker() {
        difficultyPicker.addEventListener('click', (e) => {
            const btn = e.target.closest('.diff-btn');
            if (!btn) return;
            document.getElementById('formDifficulty').value = btn.dataset.value;
            difficultyPicker.querySelectorAll('.diff-btn').forEach((item) => {
                item.classList.toggle('selected', item.dataset.value === btn.dataset.value);
            });
        });
    }

    function setupFormHandlers() {
        writeReviewToggle.addEventListener('click', () => {
            const isOpen = reviewFormWrapper.classList.toggle('open');
            if (isOpen) reviewFormWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });

        formCancel.addEventListener('click', () => {
            reviewFormWrapper.classList.remove('open');
            resetForm();
        });

        reviewForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitReview();
        });
    }

    function submitReview() {
        const rating = parseInt(document.getElementById('formRating').value, 10);
        const workload = parseInt(document.getElementById('formWorkload').value, 10);

        if (!selectedCourse) {
            showToast('Please select a course first');
            return;
        }

        if (!rating || rating < 1 || rating > 5) {
            showToast('Please select an overall rating');
            return;
        }

        if (workload && (workload < 0 || workload > 60)) {
            showToast('Please enter a realistic weekly workload');
            return;
        }

        const review = {
            id: 'local-' + Date.now(),
            course_code: getCourseCode(selectedCourse),
            rating,
            difficulty: parseInt(document.getElementById('formDifficulty').value, 10) || null,
            workload_hours: workload || null,
            semester: document.getElementById('formSemester').value || null,
            text: document.getElementById('formText').value.trim(),
            author: document.getElementById('formAuthor').value.trim() || 'Anonymous',
            created_at: new Date().toISOString()
        };

        const stored = getStoredReviews();
        stored.push(review);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

        resetForm();
        reviewFormWrapper.classList.remove('open');
        renderReviewedCourseChips();
        renderAllCoursePicker();
        renderReviews();
        showToast('Review saved in this browser');
    }

    function resetForm() {
        reviewForm.reset();
        document.getElementById('formRating').value = '';
        document.getElementById('formDifficulty').value = '';
        starPicker.querySelectorAll('.star-pick').forEach((star) => star.classList.remove('selected'));
        difficultyPicker.querySelectorAll('.diff-btn').forEach((btn) => btn.classList.remove('selected'));
    }

    function getDifficultyLabels() {
        const lang = typeof currentLang !== 'undefined' && currentLang === 'zh' ? 'zh' : 'en';
        return DIFF_LABELS[lang];
    }

    function showToast(msg) {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function debounce(fn, wait) {
        let timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, wait);
        };
    }

    function escapeHTML(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function escapeAttr(value) {
        return String(value == null ? '' : value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalizeCourseCode(value) {
        const raw = String(value || '').trim().toUpperCase();
        const match = raw.match(/[A-Z]{3,5}\s*-?\s*\d{4}/);
        return match ? match[0].replace(/[\s-]/g, '') : raw;
    }

    function getCourseCode(course) {
        if (!course) return '';
        return normalizeCourseCode(course.code || course.course_code || course.courseCode || '');
    }

    function normalizeFaculty(faculty) {
        const map = {
            EAIT: 'EAIT',
            'Engineering, Architecture and Information Technology': 'EAIT',
            BEL: 'BEL',
            'Business, Economics and Law': 'BEL',
            Science: 'Science',
            HBS: 'Health, Medicine and Behavioural Sciences',
            'Health and Behavioural Sciences': 'Health, Medicine and Behavioural Sciences',
            'Health, Medicine and Behavioural Sciences': 'Health, Medicine and Behavioural Sciences',
            'Humanities and Social Sciences': 'Humanities, Arts and Social Sciences',
            'Humanities, Arts and Social Sciences': 'Humanities, Arts and Social Sciences'
        };
        return map[faculty] || faculty || '';
    }

    function abbreviateFaculty(faculty) {
        const map = {
            'Business, Economics and Law': 'BEL',
            'Engineering, Architecture and Information Technology': 'EAIT',
            'Health and Behavioural Sciences': 'HaBS',
            'Health, Medicine and Behavioural Sciences': 'HMS',
            'Humanities and Social Sciences': 'HASS',
            'Humanities, Arts and Social Sciences': 'HASS',
            Science: 'Science'
        };
        return map[faculty] || faculty || 'Course';
    }

    window.refreshReviewLanguage = function () {
        if (selectedCourse) renderReviews();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

