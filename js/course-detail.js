// ===== Course Detail Page Logic =====
(function () {
    const APP_VERSION = '20260527-5';
    const TIMETABLE_KEY = 'course_select_helper_timetable';

    // DOM references
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const courseHero = document.getElementById('courseHero');
    const courseLayout = document.getElementById('courseLayout');
    const toast = document.getElementById('toast');

    const courseCode = readRequestedCourseCode();

    if (!courseCode) {
        showError();
        return;
    }

    // Update page title while loading
    document.title = courseCode + ' | UQ Course Select Helper';

    // Fetch course data
    fetchCourse(courseCode);

    async function fetchCourse(code) {
        const requestedCode = normalizeCourseCode(code);

        try {
            const resp = await fetch('data/courses.json?v=' + APP_VERSION + '&t=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) throw new Error('Failed to load courses data');
            const courses = await resp.json();

            // courses.json may be an array or an object with a courses array
            const list = Array.isArray(courses) ? courses : (courses.courses || []);

            const course = list.find(c => getCourseCode(c) === requestedCode);

            if (!course) {
                showError();
                return;
            }

            renderCourse(course);
        } catch (err) {
            console.error('Error loading course:', err);
            showError();
        }
    }

    function showError() {
        loadingState.style.display = 'none';
        errorState.style.display = 'flex';
    }

    function renderCourse(c) {
        loadingState.style.display = 'none';
        courseHero.style.display = 'block';
        courseLayout.style.display = 'grid';

        const code = getCourseCode(c);
        const title = c.title || c.course_title || c.name || '';
        const description = c.description || c.course_description || 'No description available.';
        const units = c.units || c.credit_units || 2;
        const level = detectLevel(code);
        const faculty = c.faculty || c.school_faculty || '--';
        const school = c.school || c.offering_school || '--';
        const duration = c.duration || getDictValue('cd_1_semester');
        const prerequisites = c.prerequisites || c.prerequisite || '';
        const assessment = c.assessment || c.assessments || '';
        const incompatible = c.incompatible || c.incompatible_courses || '';
        const offerings = c.offerings || c.semesters || c.offering || [];

        // Page title
        document.title = code + ' - ' + title + ' | UQ Course Select Helper';

        // Hero
        document.getElementById('heroCode').textContent = code;
        document.getElementById('heroTitle').textContent = title;
        document.getElementById('heroLevel').textContent = level;

        // Description
        document.getElementById('courseDescription').textContent = description;

        // Prerequisites
        renderPrerequisites(prerequisites);

        // Setup prerequisite checker
        setupPrereqChecker(prerequisites);

        // Assessment
        renderAssessment(assessment);

        // Incompatible
        renderIncompatible(incompatible);

        // Quick Facts
        document.getElementById('factUnits').textContent = units;
        document.getElementById('factLevel').textContent = level;
        document.getElementById('factFaculty').textContent = faculty;
        document.getElementById('factSchool').textContent = school;
        document.getElementById('factDuration').textContent = duration;

        // Offerings
        renderOfferings(offerings);

        // Official UQ course page
        const officialLink = document.getElementById('officialCourseLink');
        if (officialLink) {
            officialLink.href = c.official_url || getOfficialCourseUrl(code);
        }

        // Check if already in timetable
        updateTimetableButton(code);

        // Action button handlers
        document.getElementById('addToTimetableBtn').addEventListener('click', () => {
            addToTimetable(code);
        });

        document.getElementById('writeReviewBtn').addEventListener('click', () => {
            window.location.href = 'reviews.html?code=' + encodeURIComponent(code);
        });
    }

    function getOfficialCourseUrl(code) {
        return 'https://programs-courses.uq.edu.au/course.html?course_code=' + encodeURIComponent(normalizeCourseCode(code));
    }

    function getCourseDetailUrl(code) {
        return 'course-detail.html?code=' + encodeURIComponent(normalizeCourseCode(code)) + '&v=' + APP_VERSION;
    }

    function readRequestedCourseCode() {
        const params = new URLSearchParams(window.location.search);
        const candidates = [
            params.get('code'),
            params.get('course'),
            params.get('course_code'),
            params.get('courseCode')
        ];

        if (window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            candidates.push(hashParams.get('code'), hashParams.get('course'), hashParams.get('course_code'));
        }

        const pathMatch = window.location.pathname.match(/[A-Z]{3,5}\s*-?\s*\d{4}/i);
        if (pathMatch) candidates.push(pathMatch[0]);

        const raw = candidates.find(Boolean) || '';
        return normalizeCourseCode(raw);
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

    function extractCourseCodes(value) {
        return [...new Set(String(value || '')
            .toUpperCase()
            .match(/[A-Z]{3,5}\s*-?\s*\d{4}/g) || [])]
            .map(normalizeCourseCode)
            .filter(Boolean);
    }

    function detectLevel(code) {
        const match = code.match(/\d/);
        if (!match) return '--';
        const num = parseInt(match[0]);
        if (num >= 7) return getDictValue('cd_postgraduate');
        return getDictValue('cd_undergraduate');
    }

    function getDictValue(key) {
        const dict = i18n[currentLang] || i18n.en;
        return dict[key] || i18n.en[key] || key;
    }

    function renderPrerequisites(prereqs) {
        const textEl = document.getElementById('prerequisitesText');
        const chipsEl = document.getElementById('prerequisitesChips');

        if (!prereqs || prereqs === 'None' || prereqs === 'none') {
            textEl.textContent = getDictValue('cd_no_prereqs');
            chipsEl.innerHTML = '';
            return;
        }

        // If prereqs is a string, display the text and try to extract course codes
        if (typeof prereqs === 'string') {
            textEl.textContent = prereqs;
            const codes = extractCourseCodes(prereqs);
            if (codes && codes.length > 0) {
                chipsEl.innerHTML = [...new Set(codes)].map(code =>
                    '<a class="prereq-chip" href="' + getCourseDetailUrl(code) + '">' + code + '</a>'
                ).join('');
            }
        } else if (Array.isArray(prereqs)) {
            textEl.textContent = prereqs.join(', ');
            chipsEl.innerHTML = prereqs.map(normalizeCourseCode).filter(Boolean).map(code =>
                '<a class="prereq-chip" href="' + getCourseDetailUrl(code) + '">' + escapeHtml(code) + '</a>'
            ).join('');
        }
    }

    function renderAssessment(assessment) {
        const container = document.getElementById('assessmentContent');

        if (!assessment) {
            container.innerHTML = '<p class="assessment-text">' + getDictValue('cd_no_assessment') + '</p>';
            return;
        }

        // Assessment can be a string, an array of objects, or an array of strings
        if (typeof assessment === 'string') {
            container.innerHTML = '<p class="assessment-text">' + escapeHtml(assessment) + '</p>';
        } else if (Array.isArray(assessment)) {
            if (assessment.length === 0) {
                container.innerHTML = '<p class="assessment-text">' + getDictValue('cd_no_assessment') + '</p>';
                return;
            }

            // Check if items are objects with name/weight
            if (typeof assessment[0] === 'object' && assessment[0] !== null) {
                let html = '<ul class="assessment-list">';
                assessment.forEach(item => {
                    const name = item.name || item.task || item.description || 'Assessment';
                    const weight = item.weight || item.percentage || '';
                    html += '<li class="assessment-item">';
                    html += '<span class="assessment-name">' + escapeHtml(name) + '</span>';
                    if (weight) {
                        html += '<span class="assessment-weight">' + escapeHtml(String(weight)) + '</span>';
                    }
                    html += '</li>';
                });
                html += '</ul>';
                container.innerHTML = html;
            } else {
                // Array of strings
                let html = '<ul class="assessment-list">';
                assessment.forEach(item => {
                    html += '<li class="assessment-item"><span class="assessment-name">' + escapeHtml(String(item)) + '</span></li>';
                });
                html += '</ul>';
                container.innerHTML = html;
            }
        }
    }

    function renderIncompatible(incompatible) {
        const section = document.getElementById('incompatibleSection');
        const textEl = document.getElementById('incompatibleText');
        const chipsEl = document.getElementById('incompatibleChips');

        if (!incompatible || incompatible === 'None' || incompatible === 'none' ||
            (Array.isArray(incompatible) && incompatible.length === 0)) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';

        if (typeof incompatible === 'string') {
            textEl.textContent = incompatible;
            const codes = extractCourseCodes(incompatible);
            if (codes && codes.length > 0) {
                chipsEl.innerHTML = [...new Set(codes)].map(code =>
                    '<a class="prereq-chip" href="' + getCourseDetailUrl(code) + '">' + code + '</a>'
                ).join('');
            }
        } else if (Array.isArray(incompatible)) {
            textEl.textContent = incompatible.join(', ');
            chipsEl.innerHTML = incompatible.map(normalizeCourseCode).filter(Boolean).map(code =>
                '<a class="prereq-chip" href="' + getCourseDetailUrl(code) + '">' + escapeHtml(code) + '</a>'
            ).join('');
        }
    }

    function renderOfferings(offerings) {
        const container = document.getElementById('offeringsContent');

        if (!offerings || (Array.isArray(offerings) && offerings.length === 0)) {
            container.innerHTML = '<p class="no-data">' + getDictValue('cd_no_offerings') + '</p>';
            return;
        }

        // offerings can be an array of objects or strings
        if (typeof offerings === 'string') {
            container.innerHTML = '<p class="offering-semester">' + escapeHtml(offerings) + '</p>';
            return;
        }

        let html = '';
        const list = Array.isArray(offerings) ? offerings : [offerings];

        list.forEach(o => {
            if (typeof o === 'string') {
                html += '<div class="offering-item"><div class="offering-semester">' + escapeHtml(o) + '</div></div>';
            } else {
                const semester = o.semester || o.period || o.name || 'Offering';
                const campus = o.campus || o.location || '';
                const mode = o.mode || o.delivery_mode || '';

                html += '<div class="offering-item">';
                html += '<div class="offering-semester">' + escapeHtml(semester) + '</div>';
                html += '<div class="offering-details">';
                if (campus) {
                    html += '<span class="offering-tag"><i class="ci-Location"></i> ' + escapeHtml(campus) + '</span>';
                }
                if (mode) {
                    html += '<span class="offering-tag"><i class="ci-Monitor"></i> ' + escapeHtml(mode) + '</span>';
                }
                html += '</div></div>';
            }
        });

        container.innerHTML = html;
    }

    // ===== Timetable Functions =====
    function getTimetable() {
        try {
            const data = localStorage.getItem(TIMETABLE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    function saveTimetable(list) {
        localStorage.setItem(TIMETABLE_KEY, JSON.stringify(list));
    }

    function addToTimetable(code) {
        const list = getTimetable();
        if (list.includes(code)) {
            showToast(getDictValue('cd_already_added'));
            return;
        }
        list.push(code);
        saveTimetable(list);
        showToast(getDictValue('cd_added'));
        updateTimetableButton(code);
    }

    function updateTimetableButton(code) {
        const btn = document.getElementById('addToTimetableBtn');
        const list = getTimetable();
        if (list.includes(code)) {
            btn.classList.add('added');
            btn.querySelector('span').textContent = getDictValue('cd_already_added');
            btn.querySelector('i').className = 'ci-Check';
        }
    }

    function showToast(message) {
        const msgEl = document.getElementById('toastMessage');
        msgEl.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2800);
    }

    function setupPrereqChecker(prerequisites) {
        const input = document.getElementById('completedCoursesInput');
        const button = document.getElementById('checkPrereqsBtn');
        const result = document.getElementById('prereqCheckResult');

        if (!input || !button || !result) return;

        button.addEventListener('click', function () {
            const completed = extractCourseCodes(input.value);

            const completedSet = new Set(completed);
            const prereqText = String(prerequisites || '');

            const codes = extractCourseCodes(prereqText);

            if (codes.length === 0) {
                result.textContent = 'No course-code prerequisites detected.';
                result.className = 'prereq-result success';
                return;
            }

            const missing = codes.filter(code => !completedSet.has(code));

            if (missing.length === 0) {
                result.textContent = 'Looks eligible based on the detected prerequisite course codes.';
                result.className = 'prereq-result success';
            } else {
                result.textContent = 'Missing detected prerequisite(s): ' + [...new Set(missing)].join(', ');
                result.className = 'prereq-result warning';
            }
        });
    }

    // ===== Utility =====
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();

