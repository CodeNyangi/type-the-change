// Only explicit success from every expected dependency can open the merge gate.
const requiredJobs = process.argv.slice(2);

try {
  if (requiredJobs.length === 0) {
    throw new Error('No required CI jobs were specified.');
  }

  const needs = JSON.parse(process.env.NEEDS ?? '');
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
    throw new Error('CI dependency results must be an object.');
  }

  for (const name of requiredJobs) {
    if (!Object.hasOwn(needs, name)) {
      throw new Error(`Missing required CI job: ${name}`);
    }
  }

  for (const [name, job] of Object.entries(needs)) {
    if (!job || typeof job !== 'object' || Array.isArray(job) || job.result !== 'success') {
      throw new Error(`CI job did not succeed: ${name}`);
    }
  }

  console.log('All required CI jobs succeeded.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid CI dependency results.');
  process.exitCode = 1;
}
