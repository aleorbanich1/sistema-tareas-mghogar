const assert = require('assert');

// ── Extracted logic from tasks.controller.js for testing ──

function findNextRecurrenceDate(baseDateStr, dayNumbers) {
  const base = new Date(baseDateStr + 'T12:00:00');
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(base);
    candidate.setDate(candidate.getDate() + offset);
    const dow = candidate.getDay();
    if (dayNumbers.includes(dow)) {
      const yyyy = candidate.getFullYear();
      const mm = String(candidate.getMonth() + 1).padStart(2, '0');
      const dd = String(candidate.getDate()).padStart(2, '0');
      return { nextDate: `${yyyy}-${mm}-${dd}`, dayUsed: dow };
    }
  }
  return null;
}

function computeNextRecurrence(task) {
  if (!task.recurrence_days) return null;

  const days = task.recurrence_days.split(',').map(Number).filter(n => !isNaN(n));
  if (days.length === 0) return null;

  const baseDate = task.due_date || '2026-06-21';
  const result = findNextRecurrenceDate(baseDate, days);
  if (!result) return null;

  const { nextDate, dayUsed } = result;
  const primaryDay = task.primary_recurrence_day;

  let newDays = [...days];
  if (primaryDay !== null && primaryDay !== undefined && dayUsed !== primaryDay) {
    newDays = newDays.filter(d => d !== dayUsed);
  }
  if (primaryDay !== null && primaryDay !== undefined && !newDays.includes(primaryDay)) {
    newDays.push(primaryDay);
  }

  return {
    nextDate,
    dayUsed,
    newRecurrenceDays: newDays.length > 0 ? newDays.join(',') : null,
  };
}

function runTests() {
  console.log('Running recurrence generation tests...\n');

  // ── Test 1: Single day recurrence (Tuesday primary) ──
  // 2026-06-23 is a Tuesday (day 2)
  {
    const task = {
      due_date: '2026-06-23',
      recurrence_days: '2',
      primary_recurrence_day: 2,
    };
    const result = computeNextRecurrence(task);
    assert.strictEqual(result.nextDate, '2026-06-30', 'Should be next Tuesday');
    assert.strictEqual(result.dayUsed, 2);
    assert.strictEqual(result.newRecurrenceDays, '2', 'Primary day stays');
    console.log('✓ Test 1: Single day recurrence repeats correctly (Tue -> next Tue)');
  }

  // ── Test 2: Primary (Tue) + extra (Thu) — completing on Tuesday ──
  // 2026-06-23 is Tuesday. recurrence_days = '2,4' (Tue, Thu). Primary = 2 (Tue).
  // Next day after Tue in [2,4] is Thu (2026-06-25).
  {
    const task = {
      due_date: '2026-06-23',
      recurrence_days: '2,4',
      primary_recurrence_day: 2,
    };
    const result = computeNextRecurrence(task);
    assert.strictEqual(result.nextDate, '2026-06-25', 'Next is Thursday');
    assert.strictEqual(result.dayUsed, 4, 'Used extra day Thu');
    // Thu is extra -> it gets removed from future recurrence
    assert.strictEqual(result.newRecurrenceDays, '2', 'Thu removed, only primary Tue remains');
    console.log('✓ Test 2: Extra day (Thu) consumed, reverts to primary (Tue) only');
  }

  // ── Test 3: Primary (Tue) + extra (Thu, Fri) — completing on Tuesday ──
  // 2026-06-23 is Tuesday. recurrence_days = '2,4,5'. Primary = 2.
  // Next after Tue in [2,4,5] is Thu (day 4).
  {
    const task = {
      due_date: '2026-06-23',
      recurrence_days: '2,4,5',
      primary_recurrence_day: 2,
    };
    const result = computeNextRecurrence(task);
    assert.strictEqual(result.nextDate, '2026-06-25', 'Next is Thursday');
    assert.strictEqual(result.dayUsed, 4);
    // Thu consumed, Fri stays for now
    assert.strictEqual(result.newRecurrenceDays, '2,5', 'Thu removed, Tue and Fri remain');
    console.log('✓ Test 3: First extra day consumed, second extra day stays for next cycle');
  }

  // ── Test 4: Continuing from Test 3 — now completing on Thursday (Fri left) ──
  // 2026-06-25 is Thursday. recurrence_days = '2,5'. Primary = 2.
  // Next after Thu in [2,5] is Fri (day 5, 2026-06-26).
  {
    const task = {
      due_date: '2026-06-25',
      recurrence_days: '2,5',
      primary_recurrence_day: 2,
    };
    const result = computeNextRecurrence(task);
    assert.strictEqual(result.nextDate, '2026-06-26', 'Next is Friday');
    assert.strictEqual(result.dayUsed, 5);
    // Fri consumed, only primary Tue remains
    assert.strictEqual(result.newRecurrenceDays, '2', 'Fri removed, only Tue remains');
    console.log('✓ Test 4: Second extra day consumed, now only primary day remains');
  }

  // ── Test 5: Continuing from Test 4 — only primary day left ──
  // 2026-06-26 is Friday. recurrence_days = '2'. Primary = 2.
  // Next after Fri in [2] is Tue (2026-06-30).
  {
    const task = {
      due_date: '2026-06-26',
      recurrence_days: '2',
      primary_recurrence_day: 2,
    };
    const result = computeNextRecurrence(task);
    assert.strictEqual(result.nextDate, '2026-06-30', 'Next is Tuesday');
    assert.strictEqual(result.dayUsed, 2);
    assert.strictEqual(result.newRecurrenceDays, '2', 'Primary day persists forever');
    console.log('✓ Test 5: Primary day repeats indefinitely');
  }

  // ── Test 6: No recurrence_days → no generation ──
  {
    const task = { due_date: '2026-06-23', recurrence_days: null, primary_recurrence_day: null };
    const result = computeNextRecurrence(task);
    assert.strictEqual(result, null, 'No recurrence days = no generation');
    console.log('✓ Test 6: No recurrence_days returns null');
  }

  // ── Test 7: Empty recurrence_days → no generation ──
  {
    const task = { due_date: '2026-06-23', recurrence_days: '', primary_recurrence_day: null };
    const result = computeNextRecurrence(task);
    assert.strictEqual(result, null, 'Empty recurrence days = no generation');
    console.log('✓ Test 7: Empty recurrence_days returns null');
  }

  // ── Test 8: Primary day completing on primary day ──
  // 2026-06-23 is Tuesday. recurrence_days = '2,4'. Primary = 2.
  // But if due_date is on Thu (2026-06-25, day 4) with primary 2...
  // Next after Thu in [2,4] is Tue (2026-06-30)
  {
    const task = {
      due_date: '2026-06-25', // Thursday
      recurrence_days: '2,4',
      primary_recurrence_day: 2,
    };
    const result = computeNextRecurrence(task);
    assert.strictEqual(result.nextDate, '2026-06-30', 'Next is Tuesday');
    assert.strictEqual(result.dayUsed, 2);
    // Used primary day, no day removed
    assert.strictEqual(result.newRecurrenceDays, '2,4', 'All days stay when primary day used');
    console.log('✓ Test 8: Completing on primary day does not remove any extra days');
  }

  console.log('\nAll 8 tests passed!');
}

runTests();
