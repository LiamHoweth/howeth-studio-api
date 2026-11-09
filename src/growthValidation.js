const steps = new Set(['NEW_CAREER','AVATAR','NAME','POSITION','ARCHETYPE','HEIGHT_WEIGHT','JERSEY_NUMBER','TEAM_SELECTION','START_CAREER']);
const elapsed = new Set(['under_1m','1_to_5m','5_to_15m','15_to_60m','over_60m','unknown']);
const latency = new Set(['under_1s','1_to_5s','5_to_30s','over_30s','unknown']);
export const growthEventNames = new Set(['growth_cohort_started','onboarding_started','onboarding_step_completed','onboarding_completed','career_game_started','career_game_completed','first_game_completed','reliability_result']);
const reference = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function validateGrowthProperties(name, p) {
  switch (name) {
    case 'growth_cohort_started': return typeof p.existingProgress === 'boolean' ? {existingProgress:p.existingProgress} : null;
    case 'onboarding_started': return reference(p.attemptId) ? {attemptId:p.attemptId} : null;
    case 'onboarding_step_completed': return reference(p.attemptId) && steps.has(p.step) ? {attemptId:p.attemptId,step:p.step} : null;
    case 'onboarding_completed': return reference(p.attemptId) && elapsed.has(p.elapsedBucket) ? {attemptId:p.attemptId,elapsedBucket:p.elapsedBucket} : null;
    case 'first_game_completed': return elapsed.has(p.elapsedBucket) ? {elapsedBucket:p.elapsedBucket} : null;
    case 'career_game_started':
    case 'career_game_completed': return reference(p.gameAttemptId) && ['QB','RB','WR'].includes(p.position) && ['field','decisions','simulation','mixed','unknown'].includes(p.mode)
      ? {gameAttemptId:p.gameAttemptId,position:p.position,mode:p.mode} : null;
    case 'reliability_result': return ['app_load','local_save','cloud_sync','unity_launch'].includes(p.operation) && ['success','failed','unavailable'].includes(p.result) && latency.has(p.latencyBucket)
      ? {operation:p.operation,result:p.result,latencyBucket:p.latencyBucket} : null;
    default: return null;
  }
}
export function validateGrowthFilters(query) {
  const environment = query.environment ?? 'production';
  const channel = query.channel ?? 'app_store';
  const version = query.version ?? '';
  if (!['production','development','test','unknown'].includes(environment) || !['all','app_store','testflight','development','unknown'].includes(channel) || typeof version !== 'string' || (version !== '' && !/^[a-z0-9._-]{1,32}$/i.test(version))) return null;
  return {environment,channel,version};
}
