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

const subjectRow = (name = '', held = '', attended = '') => `<div class="subject-row"><input class="subject-name" aria-label="Subject name" value="${name}" placeholder="Subject name" required><input class="classes-held" aria-label="Classes held" type="number" min="0" value="${held}" placeholder="Held" required><input class="classes-attended" aria-label="Classes attended" type="number" min="0" value="${attended}" placeholder="Attended" required><button class="remove-row" type="button" aria-label="Remove subject">×</button></div>`;
const timetableRow = (day = 'Monday', subject = '') => `<div class="timetable-row"><select class="class-day" aria-label="Day of week">${days.map(d => `<option ${d === day ? 'selected' : ''}>${d}</option>`).join('')}</select><input class="class-subject" aria-label="Subject for this class" value="${subject}" placeholder="Subject name" required><button class="remove-row" type="button" aria-label="Remove timetable class">×</button></div>`;

subjectRows.innerHTML = subjectRow('Mathematics', '', '') + subjectRow('Data Structures', '', '');
timetableRows.innerHTML = timetableRow('Monday', 'Mathematics') + timetableRow('Tuesday', 'Data Structures') + timetableRow('Thursday', 'Mathematics') + timetableRow('Friday', 'Data Structures');

target.addEventListener('input', () => targetOutput.value = `${target.value}%`);
quickTarget.addEventListener('input', () => quickTargetOutput.value = `${quickTarget.value}%`);
menu.addEventListener('click', () => { const open = navigation.classList.toggle('open'); menu.setAttribute('aria-expanded', open); });
document.querySelector('#add-subject').addEventListener('click', () => subjectRows.insertAdjacentHTML('beforeend', subjectRow()));
document.querySelector('#add-timetable').addEventListener('click', () => timetableRows.insertAdjacentHTML('beforeend', timetableRow()));
document.addEventListener('click', event => { if (event.target.classList.contains('remove-row')) event.target.parentElement.remove(); });
function renderHolidays() {
  const dates = [...chosenHolidays].sort();
  holidayInput.value = dates.join(',');
  selectedHolidays.innerHTML = dates.length ? dates.map(date => `<button class="holiday-chip" type="button" data-date="${date}" title="Remove ${date}">${localDate(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} <span>×</span></button>`).join('') : '<small>No college or state holidays added.</small>';
}
document.querySelector('#add-holiday').addEventListener('click', () => {
  if (!holidayPicker.value) return;
  chosenHolidays.add(holidayPicker.value); holidayPicker.value = ''; renderHolidays();
});
selectedHolidays.addEventListener('click', event => {
  const chip = event.target.closest('.holiday-chip');
  if (!chip) return;
  chosenHolidays.delete(chip.dataset.date); holidayPicker.value = chip.dataset.date; renderHolidays();
});
['#semester-start', '#semester-end'].forEach(selector => document.querySelector(selector).addEventListener('change', () => {
  holidayPicker.min = document.querySelector('#semester-start').value;
  holidayPicker.max = document.querySelector('#semester-end').value;
}));
renderHolidays();
document.querySelectorAll('.mode-tab').forEach(button => button.addEventListener('click', () => {
  const isQuick = button.dataset.mode === 'quick';
  document.querySelector('#quick-panel').hidden = !isQuick;
  document.querySelector('#detailed-panel').hidden = isQuick;
  document.querySelectorAll('.mode-tab').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active); });
}));

function localDate(value) { return new Date(`${value}T00:00:00`); }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function nationalHolidays(start, end) {
  const holidays = new Set();
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) ['01-26', '08-15', '10-02'].forEach(day => holidays.add(`${year}-${day}`));
  return holidays;
}
function scheduledClasses(start, end, holidays, timetable) {
  const counts = Object.fromEntries([...new Set(timetable.map(item => item.subject))].map(subject => [subject, 0]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cursor = new Date(Math.max(start.getTime(), today.getTime() + 86400000));
  while (cursor <= end) { if (!holidays.has(dateKey(cursor))) { const name = days[(cursor.getDay() + 6) % 7]; timetable.filter(item => item.day === name).forEach(item => counts[item.subject]++); } cursor.setDate(cursor.getDate() + 1); }
  return counts;
}
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

form.addEventListener('submit', event => {
  event.preventDefault();
  const startValue = document.querySelector('#semester-start').value, endValue = document.querySelector('#semester-end').value, goal = Number(target.value) / 100;
  const subjects = [...document.querySelectorAll('.subject-row')].map(row => ({ name: row.querySelector('.subject-name').value.trim(), held: Number(row.querySelector('.classes-held').value), attended: Number(row.querySelector('.classes-attended').value) }));
  const timetable = [...document.querySelectorAll('.timetable-row')].map(row => ({ day: row.querySelector('.class-day').value, subject: row.querySelector('.class-subject').value.trim() }));
  const holidayValues = document.querySelector('#holidays').value.split(',').map(value => value.trim()).filter(Boolean);
  const invalidSubjects = !subjects.length || subjects.some(s => !s.name || !Number.isFinite(s.held) || !Number.isFinite(s.attended) || s.held < 0 || s.attended < 0 || s.attended > s.held);
  const invalidTimetable = !timetable.length || timetable.some(item => !item.subject);
  const validHolidays = holidayValues.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(localDate(value).getTime()));
  if (!startValue || !endValue || localDate(endValue) < localDate(startValue) || invalidSubjects || invalidTimetable || !validHolidays) { error.textContent = 'Please add valid semester dates, subject attendance, timetable entries and holiday dates.'; result.hidden = true; return; }
  const subjectNames = new Set(subjects.map(s => s.name.toLowerCase()));
  if (timetable.some(item => !subjectNames.has(item.subject.toLowerCase()))) { error.textContent = 'Each timetable subject must exactly match a subject in Current attendance.'; result.hidden = true; return; }
  error.textContent = '';
  const autoHolidays = nationalHolidays(localDate(startValue), localDate(endValue));
  const remaining = scheduledClasses(localDate(startValue), localDate(endValue), new Set([...holidayValues, ...autoHolidays]), timetable);
  const cards = subjects.map(subject => {
    const left = remaining[subject.name] || 0, current = subject.held ? (subject.attended / subject.held) * 100 : 0, bestFinal = subject.held + left ? ((subject.attended + left) / (subject.held + left)) * 100 : 0;
    const safeSkips = Math.max(0, Math.floor(subject.attended + left - goal * (subject.held + left))), recovery = goal === 1 ? Infinity : Math.max(0, Math.ceil((goal * subject.held - subject.attended) / (1 - goal)));
    const status = bestFinal + .0001 < goal ? 'risk' : current + .0001 < goal ? 'recover' : 'safe';
    const note = status === 'risk' ? `Even perfect attendance reaches ${bestFinal.toFixed(1)}%. Speak to your faculty early.` : status === 'recover' ? `Attend the next ${recovery} class${recovery === 1 ? '' : 'es'} to reach ${Math.round(goal * 100)}%.` : safeSkips ? `You can miss ${safeSkips} more class${safeSkips === 1 ? '' : 'es'} and remain on target.` : 'You are on target — attend your next class to keep it secure.';
    return `<article class="subject-result ${status}"><div><h4>${escapeHtml(subject.name)}</h4><span>${subject.attended}/${subject.held} attended so far</span></div><strong>${current.toFixed(1)}%</strong><div class="result-stats"><span><b>${left}</b> classes left</span><span><b>${bestFinal.toFixed(1)}%</b> best final</span></div><p>${note}</p></article>`;
  }).join('');
  result.innerHTML = `<div class="result-heading"><div><h3>Your semester plan</h3><p>Future classes through ${localDate(endValue).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.</p></div><span>${Math.round(goal * 100)}% target</span></div><div class="result-grid">${cards}</div>`;
  result.hidden = false; result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

quickForm.addEventListener('submit', event => {
  event.preventDefault();
  const held = Number(document.querySelector('#quick-held').value), attended = Number(document.querySelector('#quick-attended').value), goal = Number(quickTarget.value) / 100;
  const quickError = document.querySelector('#quick-error'), quickResult = document.querySelector('#quick-result');
  if (!held || held < 1 || attended < 0 || attended > held) { quickError.textContent = 'Please enter valid classes held and attended.'; quickResult.hidden = true; return; }
  quickError.textContent = '';
  const current = attended / held, targetPercent = Math.round(goal * 100);
  let heading, message;
  if (current >= goal) { const canMiss = Math.floor(attended / goal - held); heading = `You are at ${(current * 100).toFixed(1)}% — on track!`; message = canMiss ? `You can miss up to ${canMiss} more class${canMiss === 1 ? '' : 'es'} and stay at ${targetPercent}% or above.` : `Attend your next class to keep your ${targetPercent}% target secure.`; }
  else if (goal === 1) { heading = `You are at ${(current * 100).toFixed(1)}%.`; message = 'A 100% target can only be achieved by attending every class from the beginning.'; }
  else { const needed = Math.ceil((goal * held - attended) / (1 - goal)); heading = `You are at ${(current * 100).toFixed(1)}%.`; message = `Attend the next ${needed} class${needed === 1 ? '' : 'es'} without missing any to reach ${targetPercent}%.`; }
  quickResult.innerHTML = `<h4>${heading}</h4><p>${message}</p>`; quickResult.hidden = false;
});

