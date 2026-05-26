// ===== Course Select Helper - Course Catalog Logic =====

(function () {
    'use strict';

    var APP_VERSION = '20260527-5';

    // State
    let allCourses = [];
    let filteredCourses = [];
    let searchQuery = '';
    let recommendedMode = false;

    // DOM references
    const searchInput = document.getElementById('catalogSearchInput');
    const searchBtn = document.getElementById('catalogSearchBtn');
    const gridEl = document.getElementById('catalogGrid');
    const loadingEl = document.getElementById('catalogLoading');
    const emptyEl = document.getElementById('catalogEmpty');
    const resultsCountEl = document.getElementById('resultsCount');
    const filterFaculty = document.getElementById('filterFaculty');
    const filterLevel = document.getElementById('filterLevel');
    const filterSemester = document.getElementById('filterSemester');
    const filterUnits = document.getElementById('filterUnits');
    const sortSelect = document.getElementById('sortSelect');

    // ===== Initialization =====
    function init() {
        // Read ?q= from URL
        const params = new URLSearchParams(window.location.search);
        const q = params.get('q');
        recommendedMode = params.get('recommended') === '1';
        if (q) {
            searchInput.value = q;
            searchQuery = q;
        }

        // Attach events
        searchInput.addEventListener('input', debounce(onSearchInput, 300));
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                onSearchInput();
            }
        });
        searchBtn.addEventListener('click', onSearchInput);

        filterFaculty.addEventListener('change', applyFiltersAndRender);
        filterLevel.addEventListener('change', applyFiltersAndRender);
        filterSemester.addEventListener('change', applyFiltersAndRender);
        filterUnits.addEventListener('change', applyFiltersAndRender);
        sortSelect.addEventListener('change', applyFiltersAndRender);

        // Fetch data
        fetchCourses();
    }

    // ===== Data Fetching =====
    function fetchCourses() {
        showLoading(true);

        fetch('data/courses.json?v=' + APP_VERSION + '&t=' + Date.now(), { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error('Network response was not ok');
                return res.json();
            })
            .then(function (data) {
                allCourses = Array.isArray(data) ? data : (data.courses || []);
                showLoading(false);
                applyFiltersAndRender();
            })
            .catch(function () {
                // If no JSON file yet, use built-in sample data
                allCourses = getSampleCourses();
                showLoading(false);
                applyFiltersAndRender();
            });
    }

    // ===== Search =====
    function onSearchInput() {
        searchQuery = searchInput.value.trim();
        applyFiltersAndRender();
    }

    // ===== Filtering =====
    function applyFiltersAndRender() {
        var faculty = filterFaculty.value;
        var level = filterLevel.value;
        var semester = filterSemester.value;
        var units = filterUnits.value;

        filteredCourses = allCourses.filter(function (course) {
            // Search match
            if (searchQuery) {
                var q = searchQuery.toLowerCase();
                var haystack = (
                    getCourseCode(course) + ' ' +
                    (course.title || '') + ' ' +
                    (course.description || '')
                ).toLowerCase();
                if (haystack.indexOf(q) === -1) return false;
            }

            // Faculty filter
            if (faculty && normalizeFaculty(course.faculty) !== faculty) return false;

            // Level filter
            if (level) {
                var courseLevel = getCourseLevel(getCourseCode(course));
                if (courseLevel !== level) return false;
            }

            // Semester filter
            if (semester) {
                var semesterKeys = getSemesterKeys(course);
                if (semesterKeys.indexOf(semester.toLowerCase()) === -1) return false;
            }

            // Units filter
            if (units) {
                if (String(course.units) !== units) return false;
            }

            return true;
        });

        if (recommendedMode) {
            filteredCourses = filteredCourses.filter(function (course) {
                return course.title &&
                    !course.title.toLowerCase().includes('course not found') &&
                    getSemesterKeys(course).length > 0;
            });
        }

        // Sort
        sortCourses();

        // Render
        renderGrid();
        updateResultsCount();
    }

    // ===== Level Detection =====
    function getCourseLevel(code) {
        if (!code) return '';
        // Extract the first digit of the course number
        var match = code.match(/[A-Z]+(\d)/);
        if (match) {
            var num = parseInt(match[1], 10);
            return num >= 5 ? 'postgraduate' : 'undergraduate';
        }
        return '';
    }

    // ===== Sorting =====
    function sortCourses() {
        var sortVal = sortSelect.value;

        if (sortVal === 'code-asc') {
            filteredCourses.sort(function (a, b) {
                return getCourseCode(a).localeCompare(getCourseCode(b));
            });
        } else if (sortVal === 'title-asc') {
            filteredCourses.sort(function (a, b) {
                return (a.title || '').localeCompare(b.title || '');
            });
        } else {
            // Relevance - score by how well query matches
            if (searchQuery) {
                var q = searchQuery.toLowerCase();
                filteredCourses.sort(function (a, b) {
                    return getRelevanceScore(b, q) - getRelevanceScore(a, q);
                });
            }
        }
    }

    function getRelevanceScore(course, q) {
        var score = 0;
        var code = getCourseCode(course).toLowerCase();
        var title = (course.title || '').toLowerCase();

        // Exact code match
        if (code === q) score += 100;
        // Code starts with query
        else if (code.indexOf(q) === 0) score += 60;
        // Code contains query
        else if (code.indexOf(q) !== -1) score += 40;

        // Title starts with query
        if (title.indexOf(q) === 0) score += 30;
        // Title contains query
        else if (title.indexOf(q) !== -1) score += 20;

        return score;
    }

    // ===== Rendering =====
    function renderGrid() {
        if (filteredCourses.length === 0) {
            gridEl.innerHTML = '';
            gridEl.style.display = 'none';
            emptyEl.style.display = 'block';
            return;
        }

        emptyEl.style.display = 'none';
        gridEl.style.display = 'grid';

        var html = filteredCourses.map(function (course) {
            var semesters = getSemesterKeys(course);

            var semesterTags = semesters.map(function (s) {
                var label = s === 'summer' ? 'Summer' : 'Sem ' + s;
                return '<span class="tag-semester">' + escapeHtml(label) + '</span>';
            }).join('');

            var facultyShort = abbreviateFaculty(course.faculty || '');

            var code = getCourseCode(course);
            var desc = course.description || 'No description available.';
            var officialUrl = course.official_url || getOfficialCourseUrl(code);
            var detailUrl = getCourseDetailUrl(code);

            return (
                '<div class="course-card" data-code="' + escapeAttr(code) + '">' +
                '<div class="course-card-code">' + escapeHtml(code) + '</div>' +
                '<div class="course-card-title">' + escapeHtml(course.title || '') + '</div>' +
                '<div class="course-card-tags">' +
                (course.faculty ? '<span class="tag-faculty">' + escapeHtml(facultyShort) + '</span>' : '') +
                '<span class="tag-units">' + escapeHtml(String(course.units || 2)) + ' Units</span>' +
                semesterTags +
                '</div>' +
                '<div class="course-card-desc">' + escapeHtml(desc) + '</div>' +
                '<div class="course-card-actions">' +
                '<a class="course-card-link" href="' + escapeAttr(detailUrl) + '">' +
                'View Details &rarr;' +
                '</a>' +
                '<a class="course-card-link course-card-official" href="' + escapeAttr(officialUrl) + '" target="_blank" rel="noopener">' +
                'Official UQ &nearr;' +
                '</a>' +
                '</div>' +
                '</div>'
            );
        }).join('');

        gridEl.innerHTML = html;

        // Attach card click handlers
        gridEl.querySelectorAll('.course-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                // Don't double-navigate if clicking the link itself
                if (e.target.closest('.course-card-link')) return;
                var code = card.dataset.code;
                if (code) {
                    window.location.href = getCourseDetailUrl(code);
                }
            });
        });
    }

    // ===== Results Count =====
    // Exposed globally so i18n switchLang can call it
    window.updateResultsCount = function () {
        if (!resultsCountEl) return;
        var dict = (typeof i18n !== 'undefined' && typeof currentLang !== 'undefined') ? i18n[currentLang] : null;
        var template = dict ? (dict.results_showing || 'Showing {shown} of {total} courses') : 'Showing {shown} of {total} courses';
        resultsCountEl.textContent = template
            .replace('{shown}', filteredCourses.length)
            .replace('{total}', allCourses.length);
    };

    function updateResultsCount() {
        window.updateResultsCount();
    }

    // ===== Helpers =====
    function showLoading(show) {
        loadingEl.style.display = show ? 'flex' : 'none';
        if (show) {
            gridEl.style.display = 'none';
            emptyEl.style.display = 'none';
        }
    }

    function debounce(fn, ms) {
        var timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalizeCourseCode(value) {
        var raw = String(value || '').trim().toUpperCase();
        var match = raw.match(/[A-Z]{3,5}\s*-?\s*\d{4}/);
        return match ? match[0].replace(/[\s-]/g, '') : raw;
    }

    function getCourseCode(course) {
        if (!course) return '';
        return normalizeCourseCode(course.code || course.course_code || course.courseCode || '');
    }

    function abbreviateFaculty(faculty) {
        var map = {
            'Business, Economics and Law': 'BEL',
            'Engineering, Architecture and Information Technology': 'EAIT',
            'Health and Behavioural Sciences': 'HaBS',
            'Humanities and Social Sciences': 'HASS',
            'Medicine and Biomedical Sciences': 'MBS',
            'Science': 'Science'
        };
        return map[faculty] || faculty;
    }

    function normalizeFaculty(faculty) {
        var map = {
            'EAIT': 'EAIT',
            'Engineering, Architecture and Information Technology': 'EAIT',

            'BEL': 'BEL',
            'Business, Economics and Law': 'BEL',

            'Science': 'Science',

            'HBS': 'Health, Medicine and Behavioural Sciences',
            'Health and Behavioural Sciences': 'Health, Medicine and Behavioural Sciences',
            'Health, Medicine and Behavioural Sciences': 'Health, Medicine and Behavioural Sciences',

            'Humanities and Social Sciences': 'Humanities, Arts and Social Sciences',
            'Humanities, Arts and Social Sciences': 'Humanities, Arts and Social Sciences'
        };

        return map[faculty] || faculty || '';
    }

    function getSemesterKeys(course) {
        var result = [];

        function addSemester(value) {
            var text = String(value || '').toLowerCase();

            if (text.includes('semester 1') || text === '1' || text === 'sem 1') {
                if (!result.includes('1')) result.push('1');
            }

            if (text.includes('semester 2') || text === '2' || text === 'sem 2') {
                if (!result.includes('2')) result.push('2');
            }

            if (text.includes('summer')) {
                if (!result.includes('summer')) result.push('summer');
            }
        }

        // Old fallback format
        var oldSemesters = course.semesters || course.semester || [];
        if (typeof oldSemesters === 'string') oldSemesters = [oldSemesters];
        oldSemesters.forEach(addSemester);

        // Current JSON format
        var offerings = course.offerings || [];
        offerings.forEach(function (offering) {
            if (typeof offering === 'string') {
                addSemester(offering);
            } else {
                addSemester(offering.semester);
            }
        });

        return result;
    }

    function getOfficialCourseUrl(code) {
        return 'https://programs-courses.uq.edu.au/course.html?course_code=' + encodeURIComponent(normalizeCourseCode(code));
    }

    function getCourseDetailUrl(code) {
        return 'course-detail.html?code=' + encodeURIComponent(normalizeCourseCode(code)) + '&v=' + APP_VERSION;
    }

    // ===== Sample Data (fallback if JSON not found) =====
    function getSampleCourses() {
        return [
            { code: 'COMP3506', title: 'Algorithms & Data Structures', faculty: 'Engineering, Architecture and Information Technology', units: 2, semesters: ['2'], description: 'Design and analysis of data structures and algorithms. Topics include trees, graphs, sorting, searching, hashing, and algorithm complexity.' },
            { code: 'CSSE2010', title: 'Introduction to Computer Systems', faculty: 'Engineering, Architecture and Information Technology', units: 2, semesters: ['1', '2'], description: 'Fundamentals of computer systems, including digital logic, assembly language, and C programming for embedded systems.' },
            { code: 'COMP3400', title: 'Functional & Logic Programming', faculty: 'Engineering, Architecture and Information Technology', units: 2, semesters: ['1'], description: 'Introduction to functional and logic programming paradigms using Haskell and Prolog.' },
            { code: 'INFS1200', title: 'Introduction to Information Systems', faculty: 'Engineering, Architecture and Information Technology', units: 2, semesters: ['1', '2'], description: 'Foundational concepts of information systems, databases, and SQL. Covers relational models, ER diagrams, and normalisation.' },
            { code: 'FINM3403', title: 'Corporate Finance', faculty: 'Business, Economics and Law', units: 2, semesters: ['1'], description: 'Theory and practice of corporate financial management including valuation, capital budgeting, risk, and capital structure.' },
            { code: 'ACCT2101', title: 'Financial Accounting', faculty: 'Business, Economics and Law', units: 2, semesters: ['1', '2'], description: 'Principles of financial accounting, preparation and analysis of financial statements under Australian standards.' },
            { code: 'ECON1010', title: 'Introductory Macroeconomics', faculty: 'Business, Economics and Law', units: 2, semesters: ['2'], description: 'National income accounting, fiscal and monetary policy, inflation, unemployment, and international trade.' },
            { code: 'LAWS1100', title: 'Foundations of Law', faculty: 'Business, Economics and Law', units: 2, semesters: ['1'], description: 'Introduction to the Australian legal system, legal reasoning, statutory interpretation, and the role of law in society.' },
            { code: 'DATA7001', title: 'Introduction to Data Science', faculty: 'Science', units: 2, semesters: ['1'], description: 'Fundamentals of data science: data wrangling, exploratory analysis, statistical modelling, and machine learning basics using Python.' },
            { code: 'STAT2004', title: 'Statistical Modelling', faculty: 'Science', units: 2, semesters: ['2'], description: 'Linear regression, analysis of variance, generalised linear models, and model diagnostics with real-world datasets.' },
            { code: 'MATH1051', title: 'Calculus & Linear Algebra I', faculty: 'Science', units: 2, semesters: ['1', '2', 'summer'], description: 'Differential and integral calculus of one variable, vector and matrix algebra, systems of linear equations.' },
            { code: 'CHEM1100', title: 'Chemistry 1', faculty: 'Science', units: 2, semesters: ['1', '2'], description: 'Atomic structure, chemical bonding, thermodynamics, equilibria, and introductory organic chemistry.' },
            { code: 'BIOL1020', title: 'Genes, Cells & Evolution', faculty: 'Science', units: 2, semesters: ['1'], description: 'Cell biology, genetics, molecular biology, and evolutionary theory for life science students.' },
            { code: 'PSYC1030', title: 'Introductory Psychology', faculty: 'Health and Behavioural Sciences', units: 2, semesters: ['1', '2'], description: 'Scientific study of human behaviour and mental processes: perception, learning, memory, personality, and social behaviour.' },
            { code: 'PHRM1010', title: 'Pharmacology Fundamentals', faculty: 'Medicine and Biomedical Sciences', units: 2, semesters: ['1'], description: 'Basic pharmacological principles including drug absorption, distribution, metabolism, and mechanisms of drug action.' },
            { code: 'ENGL1200', title: 'Thinking in the Humanities', faculty: 'Humanities and Social Sciences', units: 2, semesters: ['1', '2'], description: 'Introduction to critical thinking, argumentation, and analytical writing in the humanities and social sciences.' },
            { code: 'POLS1101', title: 'Australian Politics', faculty: 'Humanities and Social Sciences', units: 2, semesters: ['2'], description: 'An overview of Australian political institutions, federalism, parties, elections, and public policy.' },
            { code: 'DECO1400', title: 'Introduction to Web Design', faculty: 'Engineering, Architecture and Information Technology', units: 2, semesters: ['1', '2'], description: 'Fundamentals of web design using HTML, CSS, and JavaScript. Covers responsive design, accessibility, and user experience.' },
            { code: 'COMP7500', title: 'Advanced Algorithms', faculty: 'Engineering, Architecture and Information Technology', units: 2, semesters: ['1'], description: 'Postgraduate-level study of advanced algorithmic techniques, complexity theory, and NP-completeness.' },
            { code: 'DATA7703', title: 'Machine Learning for Big Data', faculty: 'Engineering, Architecture and Information Technology', units: 2, semesters: ['2'], description: 'Scalable machine learning techniques for large datasets, including distributed computing, deep learning, and model deployment.' },
            { code: 'MGTS1601', title: 'Introduction to Management', faculty: 'Business, Economics and Law', units: 2, semesters: ['1', '2'], description: 'Foundational concepts in management theory and practice, organisational behaviour, leadership, and teamwork.' },
            { code: 'ENVM2510', title: 'Environmental Science', faculty: 'Science', units: 2, semesters: ['1'], description: 'Environmental processes, ecology, conservation biology, and the impacts of human activity on natural systems.' },
            { code: 'PHYS1001', title: 'Mechanics & Thermal Physics', faculty: 'Science', units: 2, semesters: ['1', '2'], description: 'Newtonian mechanics, oscillations, waves, thermodynamics, and kinetic theory of gases.' },
            { code: 'MEDI7100', title: 'Clinical Research Methods', faculty: 'Medicine and Biomedical Sciences', units: 2, semesters: ['1'], description: 'Postgraduate course covering research design, biostatistics, evidence-based medicine, and ethics in clinical trials.' },
        ];
    }

    // ===== Boot =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();


