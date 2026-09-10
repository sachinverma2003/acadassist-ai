/* ==========================================================================
   AcadAssist.ai — Main Interactive Controller
   Features:
   - Quick Attendance Calculator & Semester Attendance Planner
   - SGPA Calculator & Target CGPA Goal Planner
   - Internal Marks & Final Passing Predictor
   - Live Exam Countdown Ticker & Study Tracker
   - Browser LocalStorage Persistence
   ========================================================================== */

// --- 1. DOM Elements: Attendance ---
const form = document.querySelector('#attendance-form');
const target = document.querySelector('#target');
const targetOutput = document.querySelector('#target-output');
const error = document.querySelector('#form-error');
const result = document.querySelector('#result');
const subjectRows = document.querySelector('#subject-rows');
const timetableRows = document.querySelector('#timetable-rows');
const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.nav-links');
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const quickForm = document.querySelector('#quick-form');
const quickTarget = document.querySelector('#quick-target');
const quickTargetOutput = document.querySelector('#quick-target-output');
const holidayPicker = document.querySelector('#holiday-picker');
const selectedHolidays = document.querySelector('#selected-holidays');
const holidayInput = document.querySelector('#holidays');
const chosenHolidays = new Set();

// --- 2. Attendance Component Builders ---
const subjectRow = (name = '', held = '', attended = '') =>
  `<div class="subject-row">
    <input class="subject-name" aria-label="Subject name" value="${escapeHtml(name)}" placeholder="Subject name" required>
    <input class="classes-held" aria-label="Classes held" type="number" min="0" value="${held}" placeholder="Held" required>
    <input class="classes-attended" aria-label="Classes attended" type="number" min="0" value="${attended}" placeholder="Attended" required>
    <button class="remove-row" type="button" aria-label="Remove subject">×</button>
  </div>`;

const timetableRow = (day = 'Monday', subject = '') =>
  `<div class="timetable-row">
    <select class="class-day" aria-label="Day of week">
      ${days.map(d => `<option ${d === day ? 'selected' : ''}>${d}</option>`).join('')}
    </select>
    <input class="class-subject" aria-label="Subject for this class" value="${escapeHtml(subject)}" placeholder="Subject name" required>
    <button class="remove-row" type="button" aria-label="Remove timetable class">×</button>
  </div>`;

// --- 3. Attendance Event Handlers ---
target.addEventListener('input', () => {
  targetOutput.value = `${target.value}%`;
  saveDetailedAttendanceState();
});

quickTarget.addEventListener('input', () => {
  quickTargetOutput.value = `${quickTarget.value}%`;
  saveQuickAttendanceState();
});

document.querySelector('#quick-held').addEventListener('input', saveQuickAttendanceState);
document.querySelector('#quick-attended').addEventListener('input', saveQuickAttendanceState);

menu.addEventListener('click', () => {
  const open = navigation.classList.toggle('open');
  menu.setAttribute('aria-expanded', open);
});

// Close mobile navigation when a nav link is clicked
navigation.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navigation.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  });
});

document.querySelector('#add-subject').addEventListener('click', () => {
  subjectRows.insertAdjacentHTML('beforeend', subjectRow());
  saveDetailedAttendanceState();
});

document.querySelector('#add-timetable').addEventListener('click', () => {
  timetableRows.insertAdjacentHTML('beforeend', timetableRow());
  saveDetailedAttendanceState();
});

document.addEventListener('click', event => {
  if (event.target.classList.contains('remove-row')) {
    event.target.parentElement.remove();
    saveDetailedAttendanceState();
  }
});

function renderHolidays() {
  const dates = [...chosenHolidays].sort();
  holidayInput.value = dates.join(',');
  selectedHolidays.innerHTML = dates.length
    ? dates.map(date => `<button class="holiday-chip" type="button" data-date="${date}" title="Remove ${date}">${localDate(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} <span>×</span></button>`).join('')
    : '<small>No college or state holidays added.</small>';
  saveDetailedAttendanceState();
}

document.querySelector('#add-holiday').addEventListener('click', () => {
  if (!holidayPicker.value) return;
  chosenHolidays.add(holidayPicker.value);
  holidayPicker.value = '';
  renderHolidays();
});

selectedHolidays.addEventListener('click', event => {
  const chip = event.target.closest('.holiday-chip');
  if (!chip) return;
  chosenHolidays.delete(chip.dataset.date);
  holidayPicker.value = chip.dataset.date;
  renderHolidays();
});

['#semester-start', '#semester-end'].forEach(selector => {
  const el = document.querySelector(selector);
  el.addEventListener('change', () => {
    holidayPicker.min = document.querySelector('#semester-start').value;
    holidayPicker.max = document.querySelector('#semester-end').value;
    saveDetailedAttendanceState();
  });
});

// Mode switch tabs for Attendance
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.mode;
  document.querySelector('#quick-panel').hidden = mode !== 'quick';
  document.querySelector('#detailed-panel').hidden = mode !== 'detailed';
  const analyticsPanel = document.querySelector('#analytics-panel');
  if (analyticsPanel) analyticsPanel.hidden = mode !== 'analytics';
  if (mode === 'analytics') renderAttendanceRiskRadar();

  document.querySelectorAll('[data-mode]').forEach(tab => {
    const active = tab === button;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active);
  });
}));

function renderAttendanceRiskRadar() {
  const rows = [...document.querySelectorAll('.subject-row')];
  const listEl = document.querySelector('#spectrum-bars-list');
  const safeCountEl = document.querySelector('#radar-safe-count');
  const warnCountEl = document.querySelector('#radar-warn-count');
  const dangerCountEl = document.querySelector('#radar-danger-count');
  const overallPctEl = document.querySelector('#radar-overall-pct');
  const gaugeCircle = document.querySelector('#radar-gauge-circle');

  if (!listEl) return;

  const subjects = rows.map(r => ({
    name: r.querySelector('.subject-name').value.trim() || 'Untitled Subject',
    held: parseInt(r.querySelector('.classes-held').value, 10) || 0,
    attended: parseInt(r.querySelector('.classes-attended').value, 10) || 0
  }));

  if (!subjects.length) {
    listEl.innerHTML = '<small style="color:var(--muted)">No subjects entered in attendance planner yet.</small>';
    return;
  }

  let totalHeld = 0;
  let totalAttended = 0;
  let safeCount = 0;
  let warnCount = 0;
  let dangerCount = 0;

  const barsMarkup = subjects.map(s => {
    totalHeld += s.held;
    totalAttended += s.attended;

    const pct = s.held > 0 ? (s.attended / s.held) * 100 : 0;
    let status = 'safe';
    let tip = '';

    if (pct >= 75) {
      safeCount++;
      status = 'safe';
      const canMiss = Math.floor(s.attended / 0.75 - s.held);
      tip = canMiss > 0 ? `Can miss ${canMiss} class${canMiss === 1 ? '' : 'es'}` : 'On the threshold';
    } else if (pct >= 65) {
      warnCount++;
      status = 'warn';
      const needed = Math.ceil((0.75 * s.held - s.attended) / 0.25);
      tip = `Need next ${needed} class${needed === 1 ? '' : 'es'}`;
    } else {
      dangerCount++;
      status = 'danger';
      const needed = Math.ceil((0.75 * s.held - s.attended) / 0.25);
      tip = `Critical: Need next ${needed} classes`;
    }

    return `
      <div class="spectrum-row">
        <div class="spectrum-row-label">
          <b>${escapeHtml(s.name)} <small style="font-weight:normal; color:var(--muted)">(${s.attended}/${s.held})</small></b>
          <span style="color: ${status === 'safe' ? '#277c57' : status === 'warn' ? '#b8791d' : '#c64e4b'}">
            ${pct.toFixed(1)}% &bull; <small>${tip}</small>
          </span>
        </div>
        <div class="spectrum-bar-track">
          <div class="spectrum-target-line" style="left: 75%;"></div>
          <div class="spectrum-bar-fill ${status}" style="width: ${Math.min(100, Math.max(4, pct))}%;"></div>
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = barsMarkup;
  if (safeCountEl) safeCountEl.textContent = safeCount;
  if (warnCountEl) warnCountEl.textContent = warnCount;
  if (dangerCountEl) dangerCountEl.textContent = dangerCount;

  const overallPct = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 0;
  if (overallPctEl) overallPctEl.textContent = `${overallPct.toFixed(0)}%`;

  if (gaugeCircle) {
    const circ = 251.2;
    const offset = circ - (circ * (overallPct / 100));
    gaugeCircle.style.strokeDashoffset = offset;
    gaugeCircle.style.stroke = overallPct >= 75 ? '#43b786' : overallPct >= 65 ? '#e5922a' : '#c64e4b';
  }
}


// Helper Functions for Dates & Holidays
function localDate(value) { return new Date(`${value}T00:00:00`); }
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nationalHolidays(start, end) {
  const holidays = new Set();
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    ['01-26', '08-15', '10-02'].forEach(day => holidays.add(`${year}-${day}`));
  }
  return holidays;
}

function scheduledClasses(start, end, holidays, timetable) {
  const counts = Object.fromEntries([...new Set(timetable.map(item => item.subject))].map(subject => [subject, 0]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(Math.max(start.getTime(), today.getTime() + 86400000));
  while (cursor <= end) {
    if (!holidays.has(dateKey(cursor))) {
      const name = days[(cursor.getDay() + 6) % 7];
      timetable.filter(item => item.day === name).forEach(item => counts[item.subject]++);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return counts;
}

function escapeHtml(value) {
  if (value == null) return '';
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

// Attendance Form Submission (Detailed)
form.addEventListener('submit', event => {
  event.preventDefault();
  const startValue = document.querySelector('#semester-start').value;
  const endValue = document.querySelector('#semester-end').value;
  const goal = Number(target.value) / 100;
  const subjects = [...document.querySelectorAll('.subject-row')].map(row => ({
    name: row.querySelector('.subject-name').value.trim(),
    held: Number(row.querySelector('.classes-held').value),
    attended: Number(row.querySelector('.classes-attended').value)
  }));
  const timetable = [...document.querySelectorAll('.timetable-row')].map(row => ({
    day: row.querySelector('.class-day').value,
    subject: row.querySelector('.class-subject').value.trim()
  }));
  const holidayValues = document.querySelector('#holidays').value.split(',').map(v => v.trim()).filter(Boolean);

  const invalidSubjects = !subjects.length || subjects.some(s => !s.name || !Number.isFinite(s.held) || !Number.isFinite(s.attended) || s.held < 0 || s.attended < 0 || s.attended > s.held);
  const invalidTimetable = !timetable.length || timetable.some(item => !item.subject);
  const validHolidays = holidayValues.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(localDate(value).getTime()));

  if (!startValue || !endValue || localDate(endValue) < localDate(startValue) || invalidSubjects || invalidTimetable || !validHolidays) {
    error.textContent = 'Please add valid semester dates, subject attendance, timetable entries, and holiday dates.';
    result.hidden = true;
    return;
  }

  const subjectNames = new Set(subjects.map(s => s.name.toLowerCase()));
  if (timetable.some(item => !subjectNames.has(item.subject.toLowerCase()))) {
    error.textContent = 'Each timetable subject must match a subject in Current attendance.';
    result.hidden = true;
    return;
  }

  error.textContent = '';
  saveDetailedAttendanceState();

  const autoHolidays = nationalHolidays(localDate(startValue), localDate(endValue));
  const remaining = scheduledClasses(localDate(startValue), localDate(endValue), new Set([...holidayValues, ...autoHolidays]), timetable);

  const cards = subjects.map(subject => {
    const left = remaining[subject.name] || 0;
    const current = subject.held ? (subject.attended / subject.held) * 100 : 0;
    const bestFinal = subject.held + left ? ((subject.attended + left) / (subject.held + left)) * 100 : 0;
    const safeSkips = Math.max(0, Math.floor(subject.attended + left - goal * (subject.held + left)));
    const recovery = goal === 1 ? Infinity : Math.max(0, Math.ceil((goal * subject.held - subject.attended) / (1 - goal)));
    const status = bestFinal + 0.0001 < goal ? 'risk' : current + 0.0001 < goal ? 'recover' : 'safe';

    const note = status === 'risk'
      ? `Even with 100% attendance going forward, you will reach ${bestFinal.toFixed(1)}%. Consult your department advisor.`
      : status === 'recover'
      ? `Attend your next ${recovery} class${recovery === 1 ? '' : 'es'} consecutively to reach your ${Math.round(goal * 100)}% target.`
      : safeSkips
      ? `You can skip up to ${safeSkips} more class${safeSkips === 1 ? '' : 'es'} while maintaining your target.`
      : 'You are on target — attend your next scheduled class to keep your record secure.';

    return `<article class="subject-result ${status}">
      <div>
        <h4>${escapeHtml(subject.name)}</h4>
        <span>${subject.attended}/${subject.held} attended so far</span>
      </div>
      <strong>${current.toFixed(1)}%</strong>
      <div class="result-stats">
        <span><b>${left}</b> classes left</span>
        <span><b>${bestFinal.toFixed(1)}%</b> best final</span>
      </div>
      <p>${note}</p>
    </article>`;
  }).join('');

  result.innerHTML = `
    <div class="result-heading">
      <div>
        <h3>Your semester plan</h3>
        <p>Projected through ${localDate(endValue).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.</p>
      </div>
      <span>${Math.round(goal * 100)}% target</span>
    </div>
    <div class="result-grid">${cards}</div>
  `;
  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// Quick Attendance Form Submission
quickForm.addEventListener('submit', event => {
  event.preventDefault();
  const held = Number(document.querySelector('#quick-held').value);
  const attended = Number(document.querySelector('#quick-attended').value);
  const goal = Number(quickTarget.value) / 100;
  const quickError = document.querySelector('#quick-error');
  const quickResult = document.querySelector('#quick-result');

  if (!held || held < 1 || attended < 0 || attended > held) {
    quickError.textContent = 'Please enter valid classes held and attended.';
    quickResult.hidden = true;
    return;
  }

  quickError.textContent = '';
  saveQuickAttendanceState();

  const current = attended / held;
  const targetPercent = Math.round(goal * 100);
  let heading, message;

  if (current >= goal) {
    const canMiss = Math.floor(attended / goal - held);
    heading = `You are at ${(current * 100).toFixed(1)}% — on track!`;
    message = canMiss
      ? `You can safely miss up to ${canMiss} more class${canMiss === 1 ? '' : 'es'} and stay at or above ${targetPercent}%.`
      : `Attend your next class to keep your ${targetPercent}% target secure.`;
  } else if (goal === 1) {
    heading = `You are at ${(current * 100).toFixed(1)}%.`;
    message = 'A 100% target can only be achieved by attending every single class from the start.';
  } else {
    const needed = Math.ceil((goal * held - attended) / (1 - goal));
    heading = `You are at ${(current * 100).toFixed(1)}%.`;
    message = `Attend the next ${needed} class${needed === 1 ? '' : 'es'} without missing any to bring your attendance to ${targetPercent}%.`;
  }

  quickResult.innerHTML = `<h4>${heading}</h4><p>${message}</p>`;
  quickResult.hidden = false;
});

// LocalStorage Persistence for Attendance
function saveQuickAttendanceState() {
  const data = {
    held: document.querySelector('#quick-held').value,
    attended: document.querySelector('#quick-attended').value,
    target: quickTarget.value
  };
  localStorage.setItem('acadassist_quick_data', JSON.stringify(data));
}

function loadQuickAttendanceState() {
  const saved = localStorage.getItem('acadassist_quick_data');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.held) document.querySelector('#quick-held').value = data.held;
      if (data.attended) document.querySelector('#quick-attended').value = data.attended;
      if (data.target) {
        quickTarget.value = data.target;
        quickTargetOutput.value = `${data.target}%`;
      }
    } catch (e) {
      console.warn('Could not restore quick attendance state', e);
    }
  }
}

function saveDetailedAttendanceState() {
  const subjects = [...document.querySelectorAll('.subject-row')].map(row => ({
    name: row.querySelector('.subject-name').value,
    held: row.querySelector('.classes-held').value,
    attended: row.querySelector('.classes-attended').value
  }));
  const timetable = [...document.querySelectorAll('.timetable-row')].map(row => ({
    day: row.querySelector('.class-day').value,
    subject: row.querySelector('.class-subject').value
  }));
  const data = {
    start: document.querySelector('#semester-start').value,
    end: document.querySelector('#semester-end').value,
    holidays: [...chosenHolidays],
    target: target.value,
    subjects,
    timetable
  };
  localStorage.setItem('acadassist_detailed_data', JSON.stringify(data));
}

function loadDetailedAttendanceState() {
  const saved = localStorage.getItem('acadassist_detailed_data');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.start) document.querySelector('#semester-start').value = data.start;
      if (data.end) document.querySelector('#semester-end').value = data.end;
      if (data.target) {
        target.value = data.target;
        targetOutput.value = `${data.target}%`;
      }
      if (Array.isArray(data.holidays)) {
        data.holidays.forEach(h => chosenHolidays.add(h));
        renderHolidays();
      }
      if (Array.isArray(data.subjects) && data.subjects.length) {
        subjectRows.innerHTML = data.subjects.map(s => subjectRow(s.name, s.held, s.attended)).join('');
      } else {
        subjectRows.innerHTML = subjectRow('Mathematics', '', '') + subjectRow('Data Structures', '', '');
      }
      if (Array.isArray(data.timetable) && data.timetable.length) {
        timetableRows.innerHTML = data.timetable.map(t => timetableRow(t.day, t.subject)).join('');
      } else {
        timetableRows.innerHTML = timetableRow('Monday', 'Mathematics') + timetableRow('Tuesday', 'Data Structures') + timetableRow('Thursday', 'Mathematics') + timetableRow('Friday', 'Data Structures');
      }
      return;
    } catch (e) {
      console.warn('Could not restore detailed attendance state', e);
    }
  }

  // Default seed
  subjectRows.innerHTML = subjectRow('Mathematics', '', '') + subjectRow('Data Structures', '', '');
  timetableRows.innerHTML = timetableRow('Monday', 'Mathematics') + timetableRow('Tuesday', 'Data Structures') + timetableRow('Thursday', 'Mathematics') + timetableRow('Friday', 'Data Structures');
  renderHolidays();
}


/* ==========================================================================
   4. SGPA & CGPA Suite Logic
   ========================================================================== */

const GRADE_POINTS = {
  'O': 10,
  'A+': 9,
  'A': 8,
  'B+': 7,
  'B': 6,
  'C': 5,
  'P': 4,
  'F': 0
};

let aicteFormulaMode = true; // true: (SGPA - 0.75) * 10, false: SGPA * 10
const courseRowsContainer = document.querySelector('#course-rows');
const courseCountLabel = document.querySelector('#sgpa-courses-count');

function createCourseRow(name = '', credits = 4, grade = 'A+') {
  return `
    <div class="gpa-course-row">
      <input class="course-name" type="text" placeholder="Course title" value="${escapeHtml(name)}" required />
      <select class="course-credits" aria-label="Course credits">
        ${[1, 2, 3, 4, 5, 6].map(c => `<option value="${c}" ${c === Number(credits) ? 'selected' : ''}>${c} Credit${c > 1 ? 's' : ''}</option>`).join('')}
      </select>
      <select class="course-grade" aria-label="Earned grade">
        ${Object.keys(GRADE_POINTS).map(g => `<option value="${g}" ${g === grade ? 'selected' : ''}>Grade ${g} (${GRADE_POINTS[g]} pts)</option>`).join('')}
      </select>
      <button class="remove-row remove-course-btn" type="button" aria-label="Remove course">×</button>
    </div>
  `;
}

function updateCourseCount() {
  const count = courseRowsContainer.querySelectorAll('.gpa-course-row').length;
  courseCountLabel.textContent = `${count} course${count === 1 ? '' : 's'} added`;
}

document.querySelector('#add-course-btn').addEventListener('click', () => {
  courseRowsContainer.insertAdjacentHTML('beforeend', createCourseRow('', 3, 'A'));
  updateCourseCount();
  saveGpaCourses();
});

document.addEventListener('click', event => {
  if (event.target.classList.contains('remove-course-btn')) {
    event.target.closest('.gpa-course-row').remove();
    updateCourseCount();
    saveGpaCourses();
  }
});

document.querySelector('#reset-courses-btn').addEventListener('click', () => {
  if (confirm('Reset all course rows to default?')) {
    seedDefaultGpaCourses();
    document.querySelector('#sgpa-result').hidden = true;
    saveGpaCourses();
  }
});

function seedDefaultGpaCourses() {
  courseRowsContainer.innerHTML =
    createCourseRow('Data Structures & Algorithms', 4, 'O') +
    createCourseRow('Computer Organization', 4, 'A+') +
    createCourseRow('Discrete Mathematics', 4, 'A') +
    createCourseRow('Design and Analysis of Algorithms', 3, 'B+') +
    createCourseRow('Software Engineering Lab', 2, 'O');
  updateCourseCount();
}

function saveGpaCourses() {
  const courses = [...courseRowsContainer.querySelectorAll('.gpa-course-row')].map(row => ({
    name: row.querySelector('.course-name').value,
    credits: row.querySelector('.course-credits').value,
    grade: row.querySelector('.course-grade').value
  }));
  localStorage.setItem('acadassist_gpa_courses', JSON.stringify(courses));
}

function loadGpaCourses() {
  const saved = localStorage.getItem('acadassist_gpa_courses');
  if (saved) {
    try {
      const courses = JSON.parse(saved);
      if (Array.isArray(courses) && courses.length) {
        courseRowsContainer.innerHTML = courses.map(c => createCourseRow(c.name, c.credits, c.grade)).join('');
        updateCourseCount();
        return;
      }
    } catch (e) {
      console.warn('Could not restore GPA courses', e);
    }
  }
  seedDefaultGpaCourses();
}

// Formula Toggle (AICTE vs Direct)
const toggleFormulaBtn = document.querySelector('#toggle-formula-btn');
const formulaNameSpan = document.querySelector('#sgpa-formula-name');
const sgpaPctVal = document.querySelector('#sgpa-pct-val');

if (toggleFormulaBtn) {
  toggleFormulaBtn.addEventListener('click', () => {
    aicteFormulaMode = !aicteFormulaMode;
    if (aicteFormulaMode) {
      formulaNameSpan.textContent = 'Formula: AICTE (SGPA - 0.75) × 10';
      toggleFormulaBtn.textContent = 'Switch to SGPA × 10';
    } else {
      formulaNameSpan.textContent = 'Formula: Direct SGPA × 10';
      toggleFormulaBtn.textContent = 'Switch to AICTE formula';
    }
    // Recalculate percent if result card is visible
    const scoreVal = parseFloat(document.querySelector('#sgpa-score-val').textContent);
    if (!isNaN(scoreVal)) {
      const pct = aicteFormulaMode ? Math.max(0, (scoreVal - 0.75) * 10) : scoreVal * 10;
      sgpaPctVal.textContent = `${pct.toFixed(1)}%`;
    }
  });
}

// SGPA Form Calculation
document.querySelector('#sgpa-form').addEventListener('submit', event => {
  event.preventDefault();
  const rows = [...courseRowsContainer.querySelectorAll('.gpa-course-row')];
  if (!rows.length) return;

  let totalCredits = 0;
  let weightedPoints = 0;

  rows.forEach(row => {
    const credits = parseFloat(row.querySelector('.course-credits').value) || 0;
    const grade = row.querySelector('.course-grade').value;
    const pts = GRADE_POINTS[grade] != null ? GRADE_POINTS[grade] : 0;

    totalCredits += credits;
    weightedPoints += credits * pts;
  });

  if (totalCredits === 0) return;

  const sgpa = weightedPoints / totalCredits;
  const pct = aicteFormulaMode ? Math.max(0, (sgpa - 0.75) * 10) : sgpa * 10;

  const resultCard = document.querySelector('#sgpa-result');
  document.querySelector('#sgpa-score-val').innerHTML = `${sgpa.toFixed(2)} <small>/ 10.0</small>`;
  document.querySelector('#sgpa-credits-val').textContent = `${totalCredits} Credits`;
  sgpaPctVal.textContent = `${pct.toFixed(1)}%`;

  resultCard.hidden = false;
  saveGpaCourses();
});

// Mode Switch: SGPA vs CGPA Target Planner
document.querySelectorAll('[data-gpa-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    const isSgpa = btn.dataset.gpaMode === 'sgpa';
    document.querySelector('#sgpa-panel').hidden = !isSgpa;
    document.querySelector('#cgpa-panel').hidden = isSgpa;
    document.querySelectorAll('[data-gpa-mode]').forEach(t => {
      const active = t === btn;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active);
    });
  });
});

// Target CGPA Goal Planner
document.querySelector('#cgpa-form').addEventListener('submit', event => {
  event.preventDefault();
  const curCgpa = parseFloat(document.querySelector('#cgpa-current').value);
  const compCredits = parseFloat(document.querySelector('#cgpa-completed-credits').value);
  const targetCgpa = parseFloat(document.querySelector('#cgpa-target').value);
  const remCredits = parseFloat(document.querySelector('#cgpa-remaining-credits').value);
  const errEl = document.querySelector('#cgpa-error');
  const resEl = document.querySelector('#cgpa-result');

  if (isNaN(curCgpa) || isNaN(compCredits) || isNaN(targetCgpa) || isNaN(remCredits) ||
      curCgpa < 0 || curCgpa > 10 || targetCgpa < 0 || targetCgpa > 10 || compCredits <= 0 || remCredits <= 0) {
    errEl.textContent = 'Please enter valid GPA scores (0–10) and positive credit values.';
    resEl.hidden = true;
    return;
  }

  errEl.textContent = '';
  const totalCredits = compCredits + remCredits;
  const targetPoints = targetCgpa * totalCredits;
  const currentPoints = curCgpa * compCredits;
  const neededPoints = targetPoints - currentPoints;
  const requiredSgpa = neededPoints / remCredits;

  const maxPossiblePoints = currentPoints + (10.0 * remCredits);
  const maxPossibleCgpa = maxPossiblePoints / totalCredits;

  resEl.className = 'planner-advice-box';

  if (requiredSgpa <= curCgpa) {
    resEl.classList.add('feasible');
    resEl.innerHTML = `
      <h4>Goal Readily Achievable!</h4>
      <p>To finish with <strong>${targetCgpa.toFixed(2)} CGPA</strong>, you only need to maintain an average SGPA of <strong>${Math.max(0, requiredSgpa).toFixed(2)}</strong> across your remaining ${remCredits} credits.</p>
    `;
  } else if (requiredSgpa <= 8.5) {
    resEl.classList.add('feasible');
    resEl.innerHTML = `
      <h4>On Track &amp; Feasible</h4>
      <p>Achieving your target of <strong>${targetCgpa.toFixed(2)} CGPA</strong> requires an average SGPA of <strong>${requiredSgpa.toFixed(2)}</strong> in your remaining coursework. Consistent preparation in core 4-credit courses will comfortably get you there.</p>
    `;
  } else if (requiredSgpa <= 10.0) {
    resEl.classList.add('challenging');
    resEl.innerHTML = `
      <h4>High Effort Target (${requiredSgpa.toFixed(2)} SGPA Needed)</h4>
      <p>You need an average of <strong>${requiredSgpa.toFixed(2)} SGPA</strong> across your remaining ${remCredits} credits. This is challenging but attainable if you target 'O' and 'A+' letter grades in all major subjects.</p>
    `;
  } else {
    resEl.classList.add('impossible');
    resEl.innerHTML = `
      <h4>Target Mathematically Unattainable</h4>
      <p>Even if you score a perfect 10.0 SGPA across every remaining credit, your maximum reachable CGPA is <strong>${maxPossibleCgpa.toFixed(2)}</strong>. We recommend adjusting your goal to ${maxPossibleCgpa.toFixed(2)} or exploring credit recovery options.</p>
    `;
  }

  resEl.hidden = false;
});


/* ==========================================================================
   5. Internal Marks & Final Passing Predictor Logic
   ========================================================================== */

let currentTargetPct = 40;

document.querySelectorAll('.grade-choice').forEach(choice => {
  choice.addEventListener('click', () => {
    document.querySelectorAll('.grade-choice').forEach(c => c.classList.remove('active'));
    choice.classList.add('active');
    currentTargetPct = Number(choice.dataset.pct);
    calculateInternals();
  });
});

document.querySelector('#internals-form').addEventListener('submit', event => {
  event.preventDefault();
  calculateInternals();
});

function calculateInternals() {
  const m1Score = parseFloat(document.querySelector('#int-m1-score').value) || 0;
  const m1Max = parseFloat(document.querySelector('#int-m1-max').value) || 30;
  const m2Score = parseFloat(document.querySelector('#int-m2-score').value) || 0;
  const m2Max = parseFloat(document.querySelector('#int-m2-max').value) || 30;
  const assScore = parseFloat(document.querySelector('#int-ass-score').value) || 0;
  const assMax = parseFloat(document.querySelector('#int-ass-max').value) || 20;

  const finalExamMax = parseFloat(document.querySelector('#final-max').value) || 100;
  const internalWeight = parseFloat(document.querySelector('#int-weight').value) || 40;
  const finalWeight = 100 - internalWeight;

  const errorEl = document.querySelector('#internals-error');
  const resultCard = document.querySelector('#internals-result');

  if (m1Max <= 0 || m2Max <= 0 || assMax <= 0 || finalExamMax <= 0 || internalWeight <= 0 || internalWeight >= 100) {
    errorEl.textContent = 'Please enter valid maximum marks and weightages.';
    resultCard.hidden = true;
    return;
  }

  errorEl.textContent = '';

  // Calculate percentage of internals secured
  const totalInternalEarned = m1Score + m2Score + assScore;
  const totalInternalPossible = m1Max + m2Max + assMax;
  const internalRatio = Math.min(1, Math.max(0, totalInternalEarned / totalInternalPossible));
  const internalContribution = internalRatio * internalWeight;

  // Final needed
  const pointsNeededFromFinalWeight = currentTargetPct - internalContribution;
  const rawFinalMarksNeeded = (pointsNeededFromFinalWeight / finalWeight) * finalExamMax;
  const requiredFinalPercent = (rawFinalMarksNeeded / finalExamMax) * 100;

  document.querySelector('#internal-secured-stat').textContent = `${internalContribution.toFixed(1)} / ${internalWeight}`;

  const meterBar = document.querySelector('#internal-meter-bar');
  const finalNeededStat = document.querySelector('#final-needed-stat');
  const adviceText = document.querySelector('#internal-advice-text');
  const statusPill = document.querySelector('#internal-status-pill');

  meterBar.style.width = `${Math.min(100, Math.max(5, (internalContribution / currentTargetPct) * 100))}%`;

  if (pointsNeededFromFinalWeight <= 0) {
    finalNeededStat.innerHTML = `0 <small>/ ${finalExamMax} needed</small>`;
    statusPill.textContent = '★ Target Secured';
    statusPill.style.color = '#1a7a53';
    adviceText.innerHTML = `Your strong internal scores (<strong>${internalContribution.toFixed(1)}%</strong>) already cover the required ${currentTargetPct}% overall target! You only need to fulfill your university's minimum attendance or paper appearance rule.`;
  } else if (rawFinalMarksNeeded > finalExamMax) {
    finalNeededStat.innerHTML = `<span style="color:#c64e4b;">Not Reachable</span>`;
    statusPill.textContent = '⚠ Out of Range';
    statusPill.style.color = '#c64e4b';
    const bestPossible = internalContribution + finalWeight;
    adviceText.innerHTML = `Even with 100% in the final exam, your maximum possible score is <strong>${bestPossible.toFixed(1)}%</strong>. Try aiming for the nearest achievable grade tier.`;
  } else {
    finalNeededStat.innerHTML = `${Math.ceil(rawFinalMarksNeeded)} <small>/ ${finalExamMax} marks needed in Finals</small>`;
    statusPill.textContent = requiredFinalPercent > 70 ? '● High Effort' : '✓ Achievable';
    statusPill.style.color = requiredFinalPercent > 70 ? '#b8791d' : '#36866c';
    adviceText.innerHTML = `You need to score at least <strong>${Math.ceil(rawFinalMarksNeeded)} marks (${requiredFinalPercent.toFixed(1)}%)</strong> in the final exam to secure your ${currentTargetPct}% overall target.`;
  }

  resultCard.hidden = false;
}


/* ==========================================================================
   6. Exam Countdown & Study Tracker Logic
   ========================================================================== */

let examList = [];

function saveExams() {
  localStorage.setItem('acadassist_exams', JSON.stringify(examList));
}

function loadExams() {
  const saved = localStorage.getItem('acadassist_exams');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) {
        examList = parsed;
        renderExams();
        return;
      }
    } catch (e) {
      console.warn('Could not restore exams', e);
    }
  }

  // Seed default sample exams so the UI immediately feels alive
  const now = new Date();
  const exam1 = new Date(now.getTime() + (3 * 24 + 6) * 3600 * 1000); // 3 days 6 hours
  const exam2 = new Date(now.getTime() + (9 * 24 + 14) * 3600 * 1000); // 9 days 14 hours
  examList = [
    {
      id: 'exam_seed_1',
      name: 'Data Structures & Algorithms Final',
      date: exam1.toISOString(),
      prep: 65
    },
    {
      id: 'exam_seed_2',
      name: 'Operating Systems Mid-Semester',
      date: exam2.toISOString(),
      prep: 40
    }
  ];
  renderExams();
}

function renderExams() {
  const grid = document.querySelector('#exam-grid');
  if (!examList.length) {
    grid.innerHTML = `<div class="empty-state">No upcoming exams added. Use the form above to add your first exam countdown!</div>`;
    return;
  }

  // Sort chronologically
  examList.sort((a, b) => new Date(a.date) - new Date(b.date));

  grid.innerHTML = examList.map(exam => {
    const d = new Date(exam.date);
    const dateFormatted = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="exam-card" data-exam-id="${exam.id}">
        <button class="exam-card-delete" type="button" aria-label="Delete exam" title="Remove this exam">×</button>
        <div class="exam-card-top">
          <div>
            <h4 class="exam-card-subject">${escapeHtml(exam.name)}</h4>
            <div class="exam-card-date">${dateFormatted}</div>
          </div>
          <span class="countdown-badge normal" data-badge-for="${exam.id}">Upcoming</span>
        </div>
        <div class="countdown-units" data-timer-for="${exam.id}">
          <div class="countdown-unit-box"><b class="c-days">00</b><span>Days</span></div>
          <div class="countdown-unit-box"><b class="c-hours">00</b><span>Hours</span></div>
          <div class="countdown-unit-box"><b class="c-mins">00</b><span>Mins</span></div>
          <div class="countdown-unit-box"><b class="c-secs">00</b><span>Secs</span></div>
        </div>
        <div class="prep-bar-container">
          <div class="prep-bar-header">
            <span>Syllabus Prep</span>
            <b>${exam.prep}%</b>
          </div>
          <div class="prep-bar">
            <div class="prep-bar-fill" style="width:${Math.max(4, exam.prep)}%;"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now();

  examList.forEach(exam => {
    const targetTime = new Date(exam.date).getTime();
    const diff = targetTime - now;

    const timerBox = document.querySelector(`[data-timer-for="${exam.id}"]`);
    const badge = document.querySelector(`[data-badge-for="${exam.id}"]`);
    if (!timerBox || !badge) return;

    if (diff <= 0) {
      timerBox.querySelector('.c-days').textContent = '00';
      timerBox.querySelector('.c-hours').textContent = '00';
      timerBox.querySelector('.c-mins').textContent = '00';
      timerBox.querySelector('.c-secs').textContent = '00';
      badge.textContent = 'Completed / Past';
      badge.className = 'countdown-badge completed';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    timerBox.querySelector('.c-days').textContent = String(days).padStart(2, '0');
    timerBox.querySelector('.c-hours').textContent = String(hours).padStart(2, '0');
    timerBox.querySelector('.c-mins').textContent = String(mins).padStart(2, '0');
    timerBox.querySelector('.c-secs').textContent = String(secs).padStart(2, '0');

    if (diff < 48 * 3600 * 1000) {
      badge.textContent = `${days}d ${hours}h left`;
      badge.className = 'countdown-badge urgent';
    } else if (diff < 7 * 24 * 3600 * 1000) {
      badge.textContent = `${days}d ${hours}h left`;
      badge.className = 'countdown-badge soon';
    } else {
      badge.textContent = `${days} days left`;
      badge.className = 'countdown-badge normal';
    }
  });
}

// Add Exam Form Submit
document.querySelector('#add-exam-form').addEventListener('submit', event => {
  event.preventDefault();
  const nameInput = document.querySelector('#exam-name');
  const dateInput = document.querySelector('#exam-date');
  const prepInput = document.querySelector('#exam-prep');

  if (!nameInput.value.trim() || !dateInput.value) return;

  const newExam = {
    id: `exam_${Date.now()}`,
    name: nameInput.value.trim(),
    date: new Date(dateInput.value).toISOString(),
    prep: Math.min(100, Math.max(0, parseInt(prepInput.value, 10) || 0))
  };

  examList.push(newExam);
  nameInput.value = '';
  dateInput.value = '';
  prepInput.value = '50';

  saveExams();
  renderExams();
});

// Delete Exam
document.querySelector('#exam-grid').addEventListener('click', event => {
  const delBtn = event.target.closest('.exam-card-delete');
  if (!delBtn) return;
  const card = delBtn.closest('.exam-card');
  const examId = card.dataset.examId;
  examList = examList.filter(e => e.id !== examId);
  saveExams();
  renderExams();
});

// Start Real-Time Ticker
setInterval(updateCountdowns, 1000);


/* ==========================================================================
   7. Today's Hub & Live Attendance Logger
   ========================================================================== */
const todayDateEl = document.querySelector('#today-date');
const todayDaySelect = document.querySelector('#today-day-select');
const todayClassesList = document.querySelector('#today-classes-list');
const todayLogFeedback = document.querySelector('#today-log-feedback');

function initTodaysHub() {
  if (!todayDateEl || !todayDaySelect || !todayClassesList) return;

  const now = new Date();
  todayDateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayName = dayNames[now.getDay()];

  todayDaySelect.innerHTML = days.map(d => `<option value="${d}" ${d === currentDayName ? 'selected' : ''}>${d}</option>`).join('');

  todayDaySelect.addEventListener('change', () => {
    renderTodaysClasses(todayDaySelect.value);
  });

  renderTodaysClasses(todayDaySelect.value || currentDayName);
  updateHeroStats();
}

function getTodayKey() {
  const d = new Date();
  return `attend_log_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function getTodayLogs() {
  try {
    return JSON.parse(localStorage.getItem(getTodayKey()) || '{}');
  } catch (e) {
    return {};
  }
}

function saveTodayLogs(logs) {
  localStorage.setItem(getTodayKey(), JSON.stringify(logs));
}

function renderTodaysClasses(selectedDay) {
  const timetable = [...document.querySelectorAll('.timetable-row')].map(row => ({
    day: row.querySelector('.class-day').value,
    subject: row.querySelector('.class-subject').value.trim()
  }));

  const dayClasses = timetable.filter(item => item.day === selectedDay);
  const logs = getTodayLogs();

  if (!dayClasses.length) {
    todayClassesList.innerHTML = `<div class="no-classes-today">No classes scheduled for ${selectedDay}. Enjoy your day or add classes in the timetable!</div>`;
    return;
  }

  const dotColors = ['blue', 'purple', 'orange', 'green'];
  todayClassesList.innerHTML = dayClasses.map((cls, idx) => {
    const logStatus = logs[`${selectedDay}_${cls.subject}_${idx}`];
    const color = dotColors[idx % dotColors.length];

    let actionMarkup = `
      <div class="class-row-actions">
        <button type="button" class="class-action-btn present" data-cls-idx="${idx}" data-cls-sub="${escapeHtml(cls.subject)}" data-cls-day="${selectedDay}">✓ Present</button>
        <button type="button" class="class-action-btn absent" data-cls-idx="${idx}" data-cls-sub="${escapeHtml(cls.subject)}" data-cls-day="${selectedDay}">✗ Missed</button>
      </div>
    `;

    if (logStatus === 'present') {
      actionMarkup = `<span class="class-status-badge present">✓ Present</span>`;
    } else if (logStatus === 'absent') {
      actionMarkup = `<span class="class-status-badge absent">✗ Missed</span>`;
    }

    return `
      <div class="class-row">
        <span class="dot ${color}"></span>
        <div>
          <b>${escapeHtml(cls.subject)}</b>
          <small>Slot ${idx + 1}</small>
        </div>
        ${actionMarkup}
      </div>
    `;
  }).join('');
}

// Handle Attendance Click from Today's Hub
if (todayClassesList) {
  todayClassesList.addEventListener('click', event => {
    const btn = event.target.closest('.class-action-btn');
    if (!btn) return;

    const subject = btn.dataset.clsSub;
    const day = btn.dataset.clsDay;
    const idx = btn.dataset.clsIdx;
    const isPresent = btn.classList.contains('present');

    // Find corresponding subject in detailed planner
    const rows = [...document.querySelectorAll('.subject-row')];
    const targetRow = rows.find(r => r.querySelector('.subject-name').value.trim().toLowerCase() === subject.toLowerCase());

    if (targetRow) {
      const heldInput = targetRow.querySelector('.classes-held');
      const attendedInput = targetRow.querySelector('.classes-attended');

      const currentHeld = parseInt(heldInput.value, 10) || 0;
      const currentAttended = parseInt(attendedInput.value, 10) || 0;

      heldInput.value = currentHeld + 1;
      if (isPresent) {
        attendedInput.value = currentAttended + 1;
      }
      saveDetailedAttendanceState();
    }

    // Save in daily log
    const logs = getTodayLogs();
    logs[`${day}_${subject}_${idx}`] = isPresent ? 'present' : 'absent';
    saveTodayLogs(logs);

    if (todayLogFeedback) {
      todayLogFeedback.textContent = isPresent
        ? `✓ Marked Present for ${subject} (+1 attended)`
        : `✗ Marked Missed for ${subject} (+1 held)`;

      setTimeout(() => {
        todayLogFeedback.textContent = '';
      }, 3500);
    }

    renderTodaysClasses(day);
    updateHeroStats();
  });
}

function updateHeroStats() {
  const heldInputs = [...document.querySelectorAll('.classes-held')];
  const attendedInputs = [...document.querySelectorAll('.classes-attended')];

  let totalHeld = 0;
  let totalAttended = 0;

  heldInputs.forEach((h, i) => {
    const heldVal = parseInt(h.value, 10) || 0;
    const attVal = parseInt(attendedInputs[i]?.value, 10) || 0;
    totalHeld += heldVal;
    totalAttended += attVal;
  });

  const heroVal = document.querySelector('#hero-attendance-val');
  const heroBar = document.querySelector('#hero-attendance-bar');
  const heroSub = document.querySelector('#hero-attendance-sub');

  if (heroVal && heroBar && heroSub) {
    if (totalHeld > 0) {
      const overallPct = (totalAttended / totalHeld) * 100;
      heroVal.textContent = `${overallPct.toFixed(0)}%`;
      heroBar.style.width = `${Math.min(100, Math.max(5, overallPct))}%`;
      heroSub.textContent = overallPct >= 75 ? 'Safe on target' : 'Recovery needed';
      heroSub.style.color = overallPct >= 75 ? '#43ad83' : '#c64e4b';
    }
  }

  // Update nearest exam in hero
  const heroExamCountdown = document.querySelector('#hero-exam-countdown');
  const heroExamName = document.querySelector('#hero-exam-name');
  if (heroExamCountdown && heroExamName && examList.length) {
    const upcoming = [...examList].filter(e => new Date(e.date).getTime() > Date.now());
    if (upcoming.length) {
      upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
      const nearest = upcoming[0];
      const diffMs = new Date(nearest.date).getTime() - Date.now();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      heroExamCountdown.textContent = `${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
      heroExamName.textContent = `until ${nearest.name}`;
    }
  }
}


/* ==========================================================================
   8. Application Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  loadQuickAttendanceState();
  loadDetailedAttendanceState();
  loadGpaCourses();
  loadExams();
  calculateInternals();
  initTodaysHub();
});

// Also trigger immediately in case DOM is already loaded
loadQuickAttendanceState();
loadDetailedAttendanceState();
loadGpaCourses();
loadExams();
calculateInternals();
initTodaysHub();

