require('dotenv').config();

const { resetDb, getAllCases, getCaseById } = require('../src/db');
const { processReport } = require('../src/pipeline');

async function runVerification() {
  console.log('====================================================');
  console.log('       RELAY BACKEND VERIFICATION SUITE             ');
  console.log('====================================================\n');

  resetDb();

  const results = [];

  // Incident 1a: Agege English
  console.log('Processing Incident 1a (Agege English)...');
  const agegeEnglishText = "There is a group of armed men gathering near the Agege market entrance, by the bus stop. People are scared and shops are closing early. This is happening right now.";
  const case1a = await processReport({ text: agegeEnglishText, reporter: 'Reporter A' });

  // Incident 1b: Agege Pidgin (Corroborating)
  console.log('Processing Incident 1b (Agege Pidgin)...');
  const agegePidginText = "Wetin dey happen for Agege market na serious o. Some men with weapon dey near di bus stop, everybody dey run comot.";
  const case1b = await processReport({ text: agegePidginText, reporter: 'Reporter B' });

  // Verify Agege Merged Case
  const agegeCaseMerged = getCaseById(case1a.id);
  const isMerged = case1a.id === case1b.id;
  const agegeType = agegeCaseMerged?.type === 'Safety';
  const agegeSev = agegeCaseMerged?.severity === 'High';
  const agegeUrg = agegeCaseMerged?.urgency === 'High';
  const agegeStatus = agegeCaseMerged?.status === 'Accepted';
  const agegeSla = agegeCaseMerged?.sla && agegeCaseMerged.sla.includes('30');
  const agegeCorroborated = agegeCaseMerged?.evidence?.length === 2;

  const agegePassed = isMerged && agegeType && agegeSev && agegeUrg && agegeStatus && agegeSla && agegeCorroborated;

  results.push({
    incident: 'Agege (English + Pidgin)',
    expected: 'ONE case, Safety/High/High, Corroborated, Accepted, 30m SLA',
    actual: `${isMerged ? '1 Case' : '2 Cases'}, ${agegeCaseMerged?.type}/${agegeCaseMerged?.severity}/${agegeCaseMerged?.urgency}, Evid:${agegeCaseMerged?.evidence?.length}, ${agegeCaseMerged?.status}, SLA:${agegeCaseMerged?.sla}`,
    pass: agegePassed
  });

  // Incident 2: Mile 12 Dispute
  console.log('\nProcessing Incident 2 (Mile 12)...');
  const mile12Text = "Two traders are fighting over a stall space at Mile 12 market, it's getting loud and a crowd is forming.";
  const case2 = await processReport({ text: mile12Text, reporter: 'Reporter C' });

  const mile12Type = case2?.type === 'Stability';
  const mile12Sev = case2?.severity === 'Medium';
  const mile12Status = case2?.status === 'Accepted';
  const mile12Passed = mile12Type && mile12Sev && mile12Status;

  results.push({
    incident: 'Mile 12 Dispute',
    expected: 'Stability/Medium -> Accepted',
    actual: `${case2?.type}/${case2?.severity} -> ${case2?.status}`,
    pass: mile12Passed
  });

  // Incident 3: Ijegun Borehole Service Failure
  console.log('\nProcessing Incident 3 (Ijegun Borehole)...');
  const ijegunText = "The borehole at Ijegun primary school has been broken for two weeks, children have no water.";
  const case3 = await processReport({ text: ijegunText, reporter: 'Reporter D' });

  const ijegunType = case3?.type === 'Transparency';
  const ijegunSev = case3?.severity === 'Medium';
  const ijegunStatus = case3?.status === 'Assigned';
  const ijegunPassed = ijegunType && ijegunSev && ijegunStatus;

  results.push({
    incident: 'Ijegun Borehole',
    expected: 'Transparency/Medium -> Assigned (stops at Assigned)',
    actual: `${case3?.type}/${case3?.severity} -> ${case3?.status}`,
    pass: ijegunPassed
  });

  // Total Cases Check
  const totalCases = getAllCases();
  console.log('\n====================================================');
  console.log('                VERIFICATION SUMMARY                ');
  console.log('====================================================');
  console.table(results.map(r => ({
    Incident: r.incident,
    Expected: r.expected,
    Actual: r.actual,
    Result: r.pass ? 'PASS' : 'FAIL'
  })));

  console.log(`Total active cases in database: ${totalCases.length} (Expected: 3)`);

  const allPassed = results.every(r => r.pass) && totalCases.length === 3;
  if (allPassed) {
    console.log('\n🎉 ALL VERIFICATION TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ VERIFICATION FAILED!');
    process.exit(1);
  }
}

if (require.main === module) {
  runVerification().catch(err => {
    console.error('Unhandled error during verification:', err);
    process.exit(1);
  });
}

module.exports = { runVerification };
