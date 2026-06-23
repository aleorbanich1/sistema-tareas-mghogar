const assert = require('assert');

// Simulate the state
let formData = { due_date: '', recurrence_days: [] };
let isRecurrenceActive = false;
let recurrenceEdited = false;

// Simulate setFormData
function setFormData(updater) {
  if (typeof updater === 'function') {
    formData = updater(formData);
  } else {
    formData = updater;
  }
}

// Action 1: Select Date while Recurrence is OFF
function selectDate(dateStr) {
  setFormData(prev => {
    const next = { ...prev, due_date: dateStr };
    if (isRecurrenceActive && !recurrenceEdited && dateStr) {
      const d = new Date(dateStr + 'T12:00:00');
      next.recurrence_days = [String(d.getDay())];
    }
    return next;
  });
}

// Action 2: Toggle Recurrence
function toggleRecurrence() {
  const nextState = !isRecurrenceActive;
  isRecurrenceActive = nextState;
  if (nextState) {
    if (formData.due_date && formData.recurrence_days.length === 0) {
      const d = new Date(formData.due_date + 'T12:00:00');
      setFormData(prev => ({ ...prev, recurrence_days: [String(d.getDay())] }));
      recurrenceEdited = false;
    }
  } else {
    setFormData(prev => ({ ...prev, recurrence_days: [] }));
  }
}

// Action 3: Edit Recurrence Manually
function editRecurrenceDays(day) {
  recurrenceEdited = true;
  setFormData(prev => {
    const days = new Set(prev.recurrence_days);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    return { ...prev, recurrence_days: Array.from(days) };
  });
}

function runTests() {
  console.log("Running tests for recurrence logic...");

  // Test 1: Select date when recurrence is OFF
  selectDate('2026-06-25'); // Thursday -> day 4
  assert.deepStrictEqual(formData.recurrence_days, [], "Test 1 failed: Recurrence days should be empty when inactive");
  console.log("✓ Test 1 passed: Date selected without recurrence active.");

  // Test 2: Activate recurrence with date selected
  toggleRecurrence();
  assert.strictEqual(isRecurrenceActive, true, "Test 2 failed: Recurrence should be active");
  assert.deepStrictEqual(formData.recurrence_days, ['4'], "Test 2 failed: Should auto-select day 4 (Thursday)");
  console.log("✓ Test 2 passed: Activating recurrence auto-selects day based on due_date.");

  // Test 3: Change date while recurrence is ON and NOT manually edited
  selectDate('2026-06-26'); // Friday -> day 5
  assert.deepStrictEqual(formData.recurrence_days, ['5'], "Test 3 failed: Should auto-update to day 5 (Friday)");
  console.log("✓ Test 3 passed: Changing date updates recurrence day if not manually edited.");

  // Test 4: Manually edit recurrence
  editRecurrenceDays('1'); // Select Monday
  assert.deepStrictEqual(formData.recurrence_days.sort(), ['1', '5'].sort(), "Test 4 failed: Should have both days");
  assert.strictEqual(recurrenceEdited, true, "Test 4 failed: recurrenceEdited should be true");
  console.log("✓ Test 4 passed: Manually editing recurrence works.");

  // Test 5: Change date after manual edit
  selectDate('2026-06-27'); // Saturday
  assert.deepStrictEqual(formData.recurrence_days.sort(), ['1', '5'].sort(), "Test 5 failed: Should not auto-update recurrence days after manual edit");
  console.log("✓ Test 5 passed: Changing date does not override manually edited recurrence.");

  // Test 6: Disable recurrence
  toggleRecurrence();
  assert.strictEqual(isRecurrenceActive, false, "Test 6 failed: Recurrence should be inactive");
  assert.deepStrictEqual(formData.recurrence_days, [], "Test 6 failed: Recurrence days should be cleared");
  console.log("✓ Test 6 passed: Disabling recurrence clears the selected days.");

  console.log("All tests passed!");
}

runTests();
